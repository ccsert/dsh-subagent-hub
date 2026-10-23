// `subagentHub` Host service: route table, layered named agents, derived presets, planning,
// and session-level definitions with approval-gated promotion.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { dump, load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { parentAgentOptionsForDelegation } from '@deepseek-ai/dsh-subagent'
import { agentOptionsFor, candidates, decide, indexRoutes, knownTags, RoutingError } from './router.js'
import { deriveAgentPreset, deriveHubPreset } from './presets.js'
import { fingerprint, mergeLayers, normalizeDefinition, readWorkspaceDefinitions } from './definitions.js'
import { assertBudget, sumUsage } from './budget.js'
import { definition as projection, PROJECTION_KEY } from './projection.js'

export { RoutingError }

const PACKAGE = 'dsh-subagent-hub'
const HUB_SUFFIX = '+hub'
const PRESET_WAIT_MS = 30_000
export const PERSIST_SCOPES = ['session', 'workspace', 'profile']

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
/** A volatile field arrives as a cell with `get()`; tolerate a plain value too. */
const read = field => (field !== null && typeof field === 'object' && typeof field.get === 'function' ? field.get() : field)
/** Plain JSON copy of a definition for config writes and files. */
const portable = ({ id, description, instructions, routes, needs, basePreset }) => ({
  id, description,
  ...(instructions ? { instructions } : {}),
  ...(routes?.length ? { routes } : {}),
  ...(needs?.length ? { needs } : {}),
  ...(basePreset && basePreset !== 'standard' ? { basePreset } : {}),
})

export default class SubagentHub extends Service {
  static inject = ['agentPresets', 'subagents']

  static Config = z.object({
    basePresets: z.array(z.string()).default(['standard', 'ptc', 'cordis'])
      .description('Shipped presets to derive a `<id>+hub` variant from.'),
    // Volatile: edited from the Settings page and by approved `define_subagent` promotions
    // without reloading the plugin under a running tool call.
    routes: z.array(z.object({
      id: z.string().required(),
      provider: z.string().required(),
      model: z.string().required(),
      reasoningEffort: z.string(),
      tags: z.array(z.string()).default([]),
      note: z.string(),
    })).default([]).volatile().description('Child routes in preference order, tagged by capability.'),
    agents: z.array(z.object({
      id: z.string().required(),
      description: z.string().required(),
      instructions: z.string().default(''),
      routes: z.array(z.string()),
      needs: z.array(z.string()),
      basePreset: z.string().default('standard'),
    })).default([]).volatile().description('Profile-level named agents.'),
    workspaceDir: z.string().default('.dsh/subagents')
      .description('Workspace-relative directory of named agent YAML files.'),
    maxConcurrent: z.natural().default(4)
      .description('How many subagents of one Session may run at once; `delegate` refuses beyond it.'),
    maxTokensPerSession: z.natural()
      .description('Optional cap on the tokens this Session\'s subagents may consume; `delegate` refuses beyond it.'),
  })

  constructor(ctx, config) {
    super(ctx, 'subagentHub')
    this.config = config
    this.entry = ctx.fiber?.entry
    /** @type {Map<string, Promise<any[]>>} parsed rows per base preset */
    this.baseRows = new Map()
    /** @type {Map<string, Promise<string>>} named agent preset id per fingerprinted definition */
    this.agentPresets = new Map()
    this.disposers = []
    /** @type {Map<string, { id: string, priority: number, definitions: Function }>} external definition sources */
    this.sources = new Map()
    /** @type {Map<string, { parentId: string, tokens: number }>} last token total of each disposed child */
    this.ledger = new Map()
    this.cache = { routesRaw: undefined, routes: undefined, agentsRaw: undefined, agents: undefined }
    /** Settles once every `<base>+hub` preset is registered or reported missing. */
    this.ready = undefined
  }

  async *[Service.init]() {
    // Global so every Session (parent and child) folds its own delegate and define results.
    this.ctx.inject(['sessionProjections'], (scope) => {
      scope.sessionProjections.register(projection)
    })
    // A finished child is disposed before its parent asks again, so remember its final token
    // total while its Session is still readable. Latest total per child wins, so a resumed child
    // is never counted twice. The ledger is per process: a restart forgets it.
    this.ctx.on('agent/disposed', ({ agent }) => {
      const parentId = agent.session.header.parentSession
      if (parentId === undefined) return
      try {
        const projections = this.ctx.get('sessionProjections')
        if (projections === undefined) return
        const tokens = sumUsage(projections.stateOf(agent.session, 'tokenUsage'))
        if (tokens !== undefined) this.ledger.set(String(agent.id), { parentId: String(parentId), tokens })
      } catch {
        // projections unavailable at teardown: this child simply stays unaccounted
      }
    })
    this.ready = this.deriveHubPresets()
    yield async () => {
      await this.ready.catch(() => {})
      const disposers = this.disposers.splice(0).reverse()
      for (const dispose of disposers) await dispose()
    }
  }

  /** Current route table, re-indexed only when the volatile value changes. */
  get routes() {
    const raw = read(this.config.routes) ?? []
    if (raw !== this.cache.routesRaw) {
      this.cache.routes = indexRoutes(raw)
      this.cache.routesRaw = raw
    }
    return this.cache.routes
  }

  /** Current profile-level agents, re-normalized only when the volatile value changes. */
  get profileAgents() {
    const raw = read(this.config.agents) ?? []
    if (raw !== this.cache.agentsRaw) {
      this.cache.agents = raw.map((item, index) => normalizeDefinition(item, `profile:agents[${index}]`))
      this.cache.agentsRaw = raw
    }
    return this.cache.agents
  }

  async waitForPreset(id) {
    const deadline = Date.now() + PRESET_WAIT_MS
    while (Date.now() < deadline) {
      const found = (await this.ctx.agentPresets.list()).find(preset => preset.id === id)
      if (found !== undefined) return found
      await sleep(100)
    }
    return undefined
  }

  rowsOf(base) {
    let rows = this.baseRows.get(base)
    if (rows === undefined) {
      rows = (async () => {
        if (await this.waitForPreset(base) === undefined) throw new Error(`base preset "${base}" is not registered`)
        const document = await this.ctx.agentPresets.readDocument(base)
        return load(document.content, { schema: entryListSchema })
      })()
      rows.catch(() => this.baseRows.delete(base))
      this.baseRows.set(base, rows)
    }
    return rows
  }

  async deriveHubPresets() {
    const report = { registered: [], skipped: [] }
    for (const base of this.config.basePresets) {
      try {
        const listed = await this.waitForPreset(base)
        if (listed === undefined) throw new Error('not registered')
        const { plugins } = deriveHubPreset(await this.rowsOf(base), [{ id: 'hub-delegate', name: `${PACKAGE}/delegate` }])
        this.disposers.push(await this.ctx.agentPresets.register({
          id: `${base}${HUB_SUFFIX}`,
          name: `${listed.name ?? base} + Hub`,
          description: `${listed.description ?? base} Delegation goes through \`delegate\` with named agents and capability routing.`,
          ...(listed.order === undefined ? {} : { order: listed.order + 0.5 }),
          plugins,
        }))
        report.registered.push(`${base}${HUB_SUFFIX}`)
      } catch (error) {
        report.skipped.push({ base, reason: String(error?.message ?? error) })
        this.ctx.logger?.warn?.(`subagent-hub: skipped deriving ${base}${HUB_SUFFIX}: ${String(error?.message ?? error)}`)
      }
    }
    // Profile-level agents get stable presets eagerly so their children stay resumable after restart.
    for (const agent of this.profileAgents) {
      await this.ensureAgentPreset(agent).catch(error => report.skipped.push({ base: agent.id, reason: String(error?.message ?? error) }))
    }
    return report
  }

  /** Register (once per definition fingerprint) the preset a named agent's children run under. */
  ensureAgentPreset(agent) {
    const id = `hub-agent-${agent.id}-${fingerprint(agent)}`
    let pending = this.agentPresets.get(id)
    if (pending === undefined) {
      pending = (async () => {
        const { plugins } = deriveAgentPreset(await this.rowsOf(agent.basePreset), agent.instructions)
        this.disposers.push(await this.ctx.agentPresets.register({
          id,
          name: `Hub agent · ${agent.id}`,
          description: agent.description,
          order: 10_000,
          plugins,
        }))
        return id
      })()
      pending.catch(() => this.agentPresets.delete(id))
      this.agentPresets.set(id, pending)
    }
    return pending
  }

  tags() {
    return knownTags(this.routes)
  }

  /** Effective delegation limits; volatile so the settings page and patches can retune them. */
  limits() {
    return {
      maxConcurrent: read(this.config.maxConcurrent),
      maxTokensPerSession: read(this.config.maxTokensPerSession),
    }
  }

  /**
   * Observed budget usage for one Session: children still running, and the tokens those children
   * consumed (live ones read from their Session, disposed ones from the ledger).
   */
  async usage(parent) {
    const usage = {}
    const projections = this.ctx.get('sessionProjections')
    const agents = this.ctx.get('agents')
    let live = new Set()
    let tokens = 0
    let known = false
    try {
      if (agents !== undefined) {
        const children = agents.list().filter(agent => agent.session.header.parentSession === parent.id)
        usage.running = children.filter(agent => agent.status === 'running').length
        live = new Set(children.map(agent => String(agent.id)))
        if (projections !== undefined) {
          for (const agent of children) {
            const value = sumUsage(projections.stateOf(agent.session, 'tokenUsage'))
            if (value !== undefined) {
              tokens += value
              known = true
            }
          }
        }
      }
    } catch {
      // no Agent registry in this composition
    }
    for (const [childId, entry] of this.ledger) {
      if (entry.parentId !== String(parent.id) || live.has(childId)) continue
      tokens += entry.tokens
      known = true
    }
    if (known) usage.tokens = tokens
    return usage
  }

  /** Reject one delegation that would exceed the Session's budget. */
  async checkBudget(parent, limits = this.limits()) {
    assertBudget(limits, await this.usage(parent))
  }

  /**
   * Contribute named agents from an external store (a central service, a shared drive).
   * Definitions are plain objects in the same shape as the `agents` config; a source with a lower
   * priority is overridden by a higher one, and both lose to the workspace and session layers.
   * @param {{ id: string, priority?: number, definitions: (agent: any) => any[] }} source
   * @returns {() => void} disposer
   */
  registerSource(source) {
    if (!source?.id) throw new Error('subagent-hub: a definition source needs an id')
    if (typeof source.definitions !== 'function') throw new Error(`subagent-hub: source "${source.id}" must expose definitions(agent)`)
    if (this.sources.has(source.id)) throw new Error(`subagent-hub: duplicate definition source "${source.id}"`)
    this.sources.set(source.id, { id: source.id, priority: source.priority ?? 15, definitions: source.definitions })
    return () => { this.sources.delete(source.id) }
  }

  /** Named agents one external source contributes, normalized and tagged with the source id. */
  externalAgents(agent) {
    const ordered = [...this.sources.values()].sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
    const agents = []
    for (const source of ordered) {
      let raw = []
      try {
        raw = source.definitions(agent) ?? []
      } catch (error) {
        this.ctx.logger?.warn?.(`subagent-hub: definition source "${source.id}" failed: ${String(error?.message ?? error)}`)
        continue
      }
      for (const item of raw) {
        try {
          agents.push(normalizeDefinition(item, `source:${source.id}`))
        } catch (error) {
          this.ctx.logger?.warn?.(`subagent-hub: source "${source.id}" has an invalid definition: ${String(error?.message ?? error)}`)
        }
      }
    }
    return agents
  }

  cwdOf(agent) {
    return this.ctx.get('workingDirectory')?.get(agent.session) ?? agent.session.header.cwd
  }

  /** Definitions recorded in one Session's own log through `define_subagent`. */
  sessionAgents(agent) {
    const state = this.ctx.get('sessionProjections')?.stateOf(agent.session, PROJECTION_KEY)
    return Object.values(state?.definitions ?? {}).map(item => ({ ...item, source: `session:${agent.id}` }))
  }

  /** Named agents visible to one calling Agent: profile < workspace < session. */
  definitionsFor(agent) {
    const cwd = agent === undefined ? undefined : this.cwdOf(agent)
    const workspace = cwd === undefined ? { agents: [], errors: [] } : readWorkspaceDefinitions(cwd, this.config.workspaceDir)
    const external = agent === undefined ? [] : this.externalAgents(agent)
    const session = agent === undefined ? [] : this.sessionAgents(agent)
    return { agents: mergeLayers(this.profileAgents, workspace.agents, external, session), errors: workspace.errors }
  }

  /**
   * Resolve one delegation into a preset and child route.
   * @param {{ agent?: string, needs?: string[], parent: any, signal: AbortSignal }} request
   */
  async plan({ agent: agentId, needs = [], parent, signal }) {
    const { agents } = this.definitionsFor(parent)
    let agent
    if (agentId !== undefined) {
      agent = agents.find(candidate => candidate.id === agentId)
      if (agent === undefined) throw new RoutingError(`unknown agent "${agentId}"; available: ${agents.map(item => item.id).join(', ') || '(none)'}`)
    }
    const llm = this.ctx.get('llm')
    const decision = await decide(this.routes, agent, needs, async (route) => {
      if (llm === undefined) throw new Error('the `llm` service is unavailable')
      await llm.resolveCallConfig({
        provider: route.provider,
        model: route.model,
        ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
      }, signal)
    })
    const parentRoute = parentAgentOptionsForDelegation(parent)
    return {
      agent,
      agentPreset: agent === undefined ? undefined : await this.ensureAgentPreset(agent),
      agentOptions: agentOptionsFor(decision),
      decision,
      effective: decision.mode === 'route'
        ? { provider: decision.route.provider, model: decision.route.model }
        : { provider: parentRoute.provider, model: parentRoute.model },
    }
  }

  /**
   * Validate and prepare a definition authored by the model, then promote it when asked and approved.
   * The session layer always records it (through the tool result meta), so a rejected promotion
   * still leaves the agent usable for this Session.
   * @returns {Promise<{ definition: object, persisted: string, promotion?: { scope: string, outcome: string, target?: string } }>}
   */
  async define({ raw, persist = 'session', caller, callId, signal }) {
    if (!PERSIST_SCOPES.includes(persist)) throw new RoutingError(`persist must be one of: ${PERSIST_SCOPES.join(', ')}`)
    const definition = normalizeDefinition(raw, `session:${caller.id}`)
    // Route refs and tags must resolve against today's table; this throws a model-readable error.
    if ((definition.routes?.length ?? 0) > 0 || (definition.needs?.length ?? 0) > 0) {
      const { pool, wanted } = candidates(this.routes, definition, [])
      if (pool.length === 0) throw new RoutingError(`no route satisfies agent "${definition.id}" (routes ${definition.routes?.join(', ') || 'any'}, needs ${wanted.join(', ') || 'none'})`)
    }
    await this.ensureAgentPreset(definition)
    if (persist === 'session') return { definition, persisted: 'session' }

    const approval = this.ctx.get('approval')
    const target = persist === 'workspace'
      ? join(this.cwdOf(caller), this.config.workspaceDir, `${definition.id}.yaml`)
      : 'profile configuration (subagent-hub agents)'
    const reason = `Save named subagent "${definition.id}" to ${persist} (${target}). Its instructions become a standing system prompt for every child started as "${definition.id}":\n\n${definition.instructions || '(no instructions)'}`
    const outcome = approval === undefined
      ? 'unavailable'
      : await approval.request({
        agent: caller,
        toolName: 'define_subagent',
        ...(callId === undefined ? {} : { callId }),
        reason,
        displayReason: {
          en: `Save subagent "${definition.id}" to ${persist}`,
          zh: `将子代理「${definition.id}」保存到${persist === 'workspace' ? '工作区' : 'profile 配置'}`,
        },
        signal,
      })
    if (outcome !== 'allowed-once') return { definition, persisted: 'session', promotion: { scope: persist, outcome } }

    if (persist === 'workspace') {
      mkdirSync(join(this.cwdOf(caller), this.config.workspaceDir), { recursive: true })
      writeFileSync(target, dump(portable(definition), { lineWidth: -1 }))
    } else {
      const editor = this.ctx.get('configEditor')
      if (editor === undefined || this.entry === undefined) {
        return { definition, persisted: 'session', promotion: { scope: persist, outcome: 'unavailable', target: 'configEditor or plugin entry missing' } }
      }
      try {
        await editor.edit(this.entry, (current) => {
          const agents = Array.isArray(current.agents) ? current.agents.filter(item => item?.id !== definition.id) : []
          return { ...current, agents: [...agents, portable(definition)] }
        })
      } catch (error) {
        // e.g. the row's config is pinned by a home patch or command-line overlay.
        return { definition, persisted: 'session', promotion: { scope: persist, outcome: 'failed', target: String(error?.message ?? error) } }
      }
    }
    return { definition, persisted: persist, promotion: { scope: persist, outcome, target } }
  }

  /** Model-facing catalog for the calling Agent. */
  promptSection(scope, toolName, defineToolName) {
    const { agents, errors } = this.definitionsFor(scope)
    const lines = [`## Delegation with \`${toolName}\``]
    lines.push(`Pass \`agent\` to use a named agent, and/or \`needs\` to request capabilities; the harness picks the concrete model. Never name a model yourself. Omit both to run the child on your own model.`)
    if (agents.length > 0) {
      lines.push('', 'Named agents:')
      for (const agent of agents) lines.push(`- \`${agent.id}\`: ${agent.description}${agent.source.startsWith('session:') ? ' (defined in this session)' : ''}`)
    }
    const tags = this.tags()
    if (tags.length > 0) {
      lines.push('', 'Capability tags for `needs`:')
      for (const tag of tags) {
        const routes = [...this.routes.values()].filter(route => route.tags.includes(tag)).map(route => route.note ?? route.id)
        lines.push(`- \`${tag}\` (${routes.join(', ')})`)
      }
    }
    if (defineToolName !== undefined) {
      lines.push('', `Use \`${defineToolName}\` to create a reusable named agent for this session when the same role will be delegated more than once. Ask to persist it (\`workspace\` or \`profile\`) only when the user wants it kept; that requires the user's approval.`)
    }
    if (errors.length > 0) lines.push('', `Some workspace agent files failed to load and are unavailable: ${errors.join('; ')}`)
    return lines.join('\n')
  }
}
