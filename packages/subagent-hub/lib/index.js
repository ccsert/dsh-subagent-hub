// `subagentHub` Host service: route table, layered named agents, derived presets, and planning.
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { parentAgentOptionsForDelegation } from '@deepseek-ai/dsh-subagent'
import { agentOptionsFor, decide, indexRoutes, knownTags, RoutingError } from './router.js'
import { deriveAgentPreset, deriveHubPreset } from './presets.js'
import { fingerprint, mergeLayers, normalizeDefinition, readWorkspaceDefinitions } from './definitions.js'

export { RoutingError }

const PACKAGE = 'dsh-subagent-hub'
const HUB_SUFFIX = '+hub'
const PRESET_WAIT_MS = 30_000

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export default class SubagentHub extends Service {
  static inject = ['agentPresets', 'subagents']

  static Config = z.object({
    basePresets: z.array(z.string()).default(['standard', 'ptc', 'cordis'])
      .description('Shipped presets to derive a `<id>+hub` variant from.'),
    routes: z.array(z.object({
      id: z.string().required(),
      provider: z.string().required(),
      model: z.string().required(),
      reasoningEffort: z.string(),
      tags: z.array(z.string()).default([]),
      note: z.string(),
    })).default([]).description('Child routes in preference order, tagged by capability.'),
    agents: z.array(z.object({
      id: z.string().required(),
      description: z.string().required(),
      instructions: z.string().default(''),
      routes: z.array(z.string()),
      needs: z.array(z.string()),
      basePreset: z.string().default('standard'),
    })).default([]).description('Profile-level named agents.'),
    workspaceDir: z.string().default('.dsh/subagents')
      .description('Workspace-relative directory of named agent YAML files.'),
  })

  constructor(ctx, config) {
    super(ctx, 'subagentHub')
    this.config = config
    this.routes = indexRoutes(config.routes)
    this.profileAgents = config.agents.map((raw, index) => normalizeDefinition(raw, `profile:agents[${index}]`))
    /** @type {Map<string, Promise<any[]>>} parsed rows per base preset */
    this.baseRows = new Map()
    /** @type {Map<string, Promise<string>>} named agent preset id per fingerprinted definition */
    this.agentPresets = new Map()
    this.disposers = []
    /** Settles once every `<base>+hub` preset is registered or reported missing. */
    this.ready = undefined
  }

  async *[Service.init]() {
    this.ready = this.deriveHubPresets()
    yield async () => {
      await this.ready.catch(() => {})
      const disposers = this.disposers.splice(0).reverse()
      for (const dispose of disposers) await dispose()
    }
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

  cwdOf(agent) {
    return this.ctx.get('workingDirectory')?.get(agent.session) ?? agent.session.header.cwd
  }

  /** Named agents visible to one calling Agent: profile < workspace. */
  definitionsFor(agent) {
    const cwd = agent === undefined ? undefined : this.cwdOf(agent)
    const workspace = cwd === undefined ? { agents: [], errors: [] } : readWorkspaceDefinitions(cwd, this.config.workspaceDir)
    return { agents: mergeLayers(this.profileAgents, workspace.agents), errors: workspace.errors }
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

  /** Model-facing catalog for the calling Agent. */
  promptSection(scope, toolName) {
    const { agents, errors } = this.definitionsFor(scope)
    const lines = [`## Delegation with \`${toolName}\``]
    lines.push(`Pass \`agent\` to use a named agent, and/or \`needs\` to request capabilities; the harness picks the concrete model. Never name a model yourself. Omit both to run the child on your own model.`)
    if (agents.length > 0) {
      lines.push('', 'Named agents:')
      for (const agent of agents) lines.push(`- \`${agent.id}\`: ${agent.description}`)
    }
    const tags = this.tags()
    if (tags.length > 0) {
      lines.push('', 'Capability tags:')
      for (const tag of tags) {
        const routes = [...this.routes.values()].filter(route => route.tags.includes(tag)).map(route => route.note ?? route.id)
        lines.push(`- \`${tag}\` (${routes.join(', ')})`)
      }
    }
    if (errors.length > 0) lines.push('', `Some workspace agent files failed to load and are unavailable: ${errors.join('; ')}`)
    return lines.join('\n')
  }
}
