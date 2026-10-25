// `subagentHub` Host service (v2): inform the official delegation tools instead of replacing them.
//
// 1. Named agents become ordinary Agent Presets (stable `hub-agent-<id>` ids) so the official
//    `subagent` tool can select them through `agent_preset`.
// 2. The route table mirrors the official `subagent-model-selection` allowlist.
// 3. A system-prompt section says which named agent / model fits which job.
// 4. A `tools/pre-execute` guard enforces a named agent's route confinement, which the official
//    allowlist alone cannot express.
// 5. `manageOfficialSettings` writes those official allowlists through `configEditor`.
//
// `routes`, `agents`, and `manageOfficialSettings` are volatile: the Plugins page form edits them
// live. After such an edit the service re-registers affected presets and re-syncs the official
// allowlists (see `loader/volatile-update` below).
import { dispatchProjection } from './dispatch-history.js'
import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { AGENT_PRESET_PREFIX, buildCatalog } from './catalog.js'
import { deriveAgentPreset } from './presets.js'
import { CREATION_TOOLS, GUARD_PREFIX, concurrencyVerdict, creationRouteVerdict, guardVerdict, modelSelectionAvailable } from './guard.js'
import { promptSection } from './prompt.js'
import { MODEL_SETTINGS_ID, PRESET_PLUGIN, modelSettingsFor, officialSettingsPlan, patchPresetRows, sameAllowedModels } from './official-settings.js'

const PACKAGE = 'dsh-subagent-hub'
const PRESET_WAIT_MS = 30_000
const PRESET_ORDER = 10_000
const LIVE_FIELDS = new Set(['routes', 'agents', 'manageOfficialSettings'])

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
/** A volatile field arrives as a cell with `get()`; tolerate a plain value too. */
const read = field => (field !== null && typeof field === 'object' && typeof field.get === 'function' ? field.get() : field)

/** Everything that shapes a named agent's preset; presets are only re-registered when this moves. */
const agentSignature = agents => JSON.stringify(agents.map(agent => [agent.id, agent.description, agent.basePreset, agent.instructions]))

export default class SubagentHub extends Service {
  static inject = ['agentPresets', 'systemPrompt']

  static Config = z.object({
    routes: z.array(z.object({
      id: z.string().required(),
      provider: z.string().required(),
      model: z.string().required(),
      reasoningEffort: z.string(),
      tags: z.array(z.string()).default([]),
      note: z.string(),
    })).default([]).volatile().description('Child model allowlist in preference order, tagged by capability. '
      + 'Each route becomes one official `subagent-model-selection` allowed model.'),
    agents: z.array(z.object({
      id: z.string().required(),
      description: z.string().required(),
      instructions: z.string().default(''),
      routes: z.array(z.string()),
      needs: z.array(z.string()),
      basePreset: z.string().default('standard'),
    })).default([]).volatile().description('Named agents. Each one is registered as an Agent Preset and exposed '
      + 'through the official tool\'s static `allowedAgentPresets` list.'),
    maxConcurrent: z.natural().default(4).volatile()
      .description('How many child agents one Session may run at the same time; 0 means no limit. '
        + 'Enforced before a delegation starts, so the main agent is told to wait instead of piling up children.'),
    delegationTools: z.array(z.string()).default(['subagent', 'subagent_fork']).volatile()
      .description('Tool names that start a child agent. The official delegation tools are named `subagent` and `subagent_fork`.'),
    showAgentOverview: z.boolean().default(false).volatile()
      .description('Show the optional Hub agent overview in the session header. The official Agent Team UI remains available.'),
    manageOfficialSettings: z.boolean().default(false).volatile()
      .description('When true, write `allowedAgentPresets` onto the official delegation tool rows and '
        + 'mirror `routes` into the Host `subagent-model-selection` setting through configEditor. '
        + 'This owns those official configuration fields for every preset that contains a spawn '
        + 'delegation row. Off by default so installing this plugin changes nobody else\'s settings.'),
  })

  constructor(ctx, config) {
    super(ctx, 'subagentHub')
    this.config = config
    /** @type {Map<string, () => Promise<void>>} registered named-agent presets by preset id */
    this.registered = new Map()
    /** @type {Map<string, Promise<any[]>>} parsed rows per base preset */
    this.baseRows = new Map()
    this.disposers = []
    /** @type {Map<string, Set<string>>} running child ids per parent session */
    this.running = new Map()
    /** @type {Map<string, string>} parent session of every running child */
    this.parentOf = new Map()
    this.cache = { routesRaw: undefined, agentsRaw: undefined, catalog: undefined }
    this.presetSignature = undefined
    this.disposed = false
    this.reconcileChain = Promise.resolve({ registered: [], skipped: [] })
    // A worker started outside any HMR transaction drains live-edit reconciliations. Scheduling
    // one from inside the transaction (a `setTimeout` created there keeps the async context)
    // would make configEditor.edit() fail with "HMR transactions cannot be nested".
    this.reconcileGeneration = 0
    this.reconciledGeneration = 0
    this.reconcilePending = false
    this.reconcileWaiters = []
    this.reconcileWorker = undefined
    /** Settles once every named agent preset is registered or reported missing. */
    this.ready = new Promise((resolve) => { this.resolveReady = resolve })
    /** Settles once the official settings write (or its deliberate skip) is complete. */
    this.officialSettingsReady = new Promise((resolve) => { this.resolveOfficial = resolve })
  }

  /**
   * Current catalog, rebuilt when a volatile `routes`/`agents` value changes. The prompt and the
   * guard read this on demand, so a live edit is visible without waiting for a re-registration.
   */
  get catalog() {
    const routesRaw = read(this.config.routes) ?? []
    const agentsRaw = read(this.config.agents) ?? []
    if (routesRaw !== this.cache.routesRaw || agentsRaw !== this.cache.agentsRaw) {
      this.cache = { routesRaw, agentsRaw, catalog: buildCatalog({ routes: routesRaw, agents: agentsRaw }) }
    }
    return this.cache.catalog
  }

  async *[Service.init]() {
    for (const problem of this.catalog.problems) this.ctx.logger?.warn?.(`${PACKAGE}: ${problem}`)
    this.disposers.push(this.ctx.systemPrompt.section({
      name: PACKAGE,
      order: this.ctx.systemPrompt.getSectionOrder('TOOL_SUBAGENT') + 10,
      text: context => this.sectionText(context.scope),
    }))
    this.disposers.push(this.ctx.inject(['sessionProjections'], scope => {
      scope.sessionProjections.register(dispatchProjection)
    }))
    this.disposers.push(this.ctx.on('tools/pre-execute', (exec, next) => this.preExecute(exec, next)))
    // The Plugins page form writes volatile fields; the Loader commits them in place and announces
    // the changed paths on this plugin's own fiber.
    this.disposers.push(this.ctx.on('loader/volatile-update', paths => this.onVolatileUpdate(paths)))
    // The official runtime announces every child's start and end; count them per parent.
    this.disposers.push(this.ctx.on('subagent/start', info => this.onSubagentStart(info)))
    this.disposers.push(this.ctx.on('subagent/end', info => this.onSubagentEnd(info)))
    // Registration and the official allowlist sync both belong to the worker: this init may run
    // inside an HMR transaction, and a config write there would be refused as nested. The
    // worker's first pass registers the named presets and syncs the official allowlists.
    this.reconcileWorker = this.runReconcileWorker()
    this.signalReconcile()

    yield async () => {
      this.disposed = true
      for (const wake of this.reconcileWaiters.splice(0)) wake()
      const disposers = this.disposers.splice(0).reverse()
      for (const dispose of disposers) {
        try {
          await dispose()
        } catch {
          // a disposed context may already be gone during teardown
        }
      }
      await this.ready.catch(() => {})
      await this.reconcileWorker?.catch(() => {})
      await this.disposeAgentPresets()
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
      rows.catch(() => this.baseRows.delete(base))
      this.baseRows.set(base, rows)
    }
    return rows
  }

  /** Register one stable official preset per configured named agent. */
  async registerAgentPresets() {
    const report = { registered: [], skipped: [] }
    for (const agent of this.catalog.agents) {
      if (this.disposed) break
      try {
        const { plugins } = deriveAgentPreset(await this.rowsOf(agent.basePreset), agent.instructions)
        const dispose = await this.ctx.agentPresets.register({
          id: agent.presetId,
          name: `Hub agent · ${agent.id}`,
          description: agent.description,
          order: PRESET_ORDER,
          plugins,
        })
        if (this.disposed) {
          await dispose().catch(() => {})
          break
        }
        this.registered.set(agent.presetId, dispose)
        report.registered.push(agent.presetId)
      } catch (error) {
        report.skipped.push({ id: agent.presetId, reason: String(error?.message ?? error) })
        this.ctx.logger?.warn?.(`${PACKAGE}: skipped preset ${agent.presetId}: ${String(error?.message ?? error)}`)
      }
    }
    return report
  }

  async disposeAgentPresets() {
    const registered = [...this.registered.entries()].reverse()
    this.registered.clear()
    for (const [, dispose] of registered) {
      try {
        await dispose()
      } catch {
        // the registry may already be torn down
      }
    }
  }

  /** A live configuration edit arrived from the Plugins page form. */
  onVolatileUpdate(paths) {
    const changed = new Set((paths ?? []).map(path => path?.[0]))
    if (![...LIVE_FIELDS].some(field => changed.has(field))) return
    this.signalReconcile()
  }

  /** Ask the reconcile worker to apply the current configuration. */
  signalReconcile() {
    if (this.disposed) return
    this.reconcileGeneration += 1
    this.reconcilePending = true
    for (const wake of this.reconcileWaiters.splice(0)) wake()
  }

  /** Long-lived worker whose async context is free of any HMR transaction. */
  async runReconcileWorker() {
    while (!this.disposed) {
      if (!this.reconcilePending) {
        await new Promise((resolve) => { this.reconcileWaiters.push(resolve) })
        continue
      }
      const target = this.reconcileGeneration
      this.reconcilePending = false
      this.reconcileChain = this.reconcileChain
        .then(() => this.reconcileNow())
        .catch((error) => {
          this.ctx.logger?.warn?.(`${PACKAGE}: live configuration update failed: ${String(error?.message ?? error)}`)
          return { registered: [], skipped: [] }
        })
      await this.reconcileChain
      this.reconciledGeneration = target
    }
  }

  /**
   * Apply a live configuration edit: re-register presets only when an agent's preset-affecting
   * fields moved, then re-sync the official allowlists (routes may have changed on their own).
   */
  async reconcileNow() {
    if (this.disposed) return { registered: [], skipped: [] }
    for (const problem of this.catalog.problems) this.ctx.logger?.warn?.(`${PACKAGE}: ${problem}`)
    const signature = agentSignature(this.catalog.agents)
    let report
    if (signature !== this.presetSignature) {
      await this.disposeAgentPresets()
      report = await this.registerAgentPresets()
      this.presetSignature = signature
    } else {
      report = { registered: [...this.registered.keys()], skipped: [] }
    }
    this.ready = Promise.resolve(report)
    this.resolveReady(report)
    const sync = this.syncOfficialSettings()
      .catch((error) => {
        this.ctx.logger?.warn?.(`${PACKAGE}: official settings sync failed: ${String(error?.message ?? error)}`)
        return { enabled: read(this.config.manageOfficialSettings) === true, error: String(error?.message ?? error) }
      })
    this.officialSettingsReady = sync
    const outcome = await sync
    this.resolveOfficial(outcome)
    return report
  }

  /** Await every live-configuration edit announced so far (used by tests and tooling). */
  async whenSettled() {
    const target = this.reconcileGeneration
    while (this.reconciledGeneration < target) await sleep(10)
    await this.reconcileChain
    await this.officialSettingsReady
  }

  /** Parameters the official delegation tool currently exposes in one agent's composition. */
  exposedParameters(scope) {
    const tools = this.ctx.get('tools')
    if (tools === undefined) return undefined
    const independent = []
    for (const name of ['subagent', 'subagent_fork']) {
      const tool = tools.get(name, scope)
      if (tool === undefined) continue
      const properties = tool.parameters?.properties ?? {}
      independent.push({
        name,
        agentPreset: Object.hasOwn(properties, 'agent_preset'),
        model: Object.hasOwn(properties, 'provider') && Object.hasOwn(properties, 'model'),
      })
    }
    const teamTool = tools.get('spawn_teammate', scope)
    if (independent.length === 0 && teamTool === undefined) return undefined
    const properties = teamTool?.parameters?.properties ?? {}
    return {
      agentPreset: independent[0]?.agentPreset ?? false,
      model: independent[0]?.model ?? false,
      independent,
      team: teamTool === undefined ? undefined : {
        model: Object.hasOwn(properties, 'provider') && Object.hasOwn(properties, 'model'),
      },
    }
  }

  sectionText(scope) {
    const params = this.exposedParameters(scope)
    if (params === undefined) return ''
    return promptSection({ catalog: this.catalog, params, limit: read(this.config.maxConcurrent) ?? 0, limitTools: read(this.config.delegationTools) ?? [] })
  }

  /** Child agents of one Session that are still running, from the start/end ledger. */
  runningChildren(caller) {
    const parentId = caller?.session?.header?.id ?? caller?.id
    if (parentId === undefined) return 0
    return this.running.get(String(parentId))?.size ?? 0
  }

  /** Record a published child under its delegating parent. */
  onSubagentStart(info) {
    const child = this.ctx.get('agents')?.get?.(info.id)
    const parentId = child?.session?.header?.parentSession
    if (parentId === undefined) return
    const key = String(parentId)
    let set = this.running.get(key)
    if (set === undefined) this.running.set(key, set = new Set())
    set.add(String(info.id))
    this.parentOf.set(String(info.id), key)
  }

  /** Drop a settled child from its parent's running set. */
  onSubagentEnd(info) {
    const id = String(info.id)
    const key = this.parentOf.get(id)
    if (key === undefined) return
    this.parentOf.delete(id)
    const set = this.running.get(key)
    set?.delete(id)
    if (set?.size === 0) this.running.delete(key)
  }

  /**
   * Refuse a delegation that would break the session's concurrency limit or put a route-confined
   * named agent on another model.
   */
  preExecute(exec, next) {
    try {
      const busy = concurrencyVerdict({
        toolName: exec.name,
        delegationTools: read(this.config.delegationTools) ?? [],
        limit: read(this.config.maxConcurrent) ?? 0,
        running: this.runningChildren(exec.agent),
      })
      if (busy !== undefined) return Promise.resolve({ kind: 'deny', reason: busy })
      let args = exec.arguments
      let canSelectModel = true
      if (CREATION_TOOLS.includes(exec.name)) {
        const tool = this.ctx.get('tools')?.get(exec.name, exec.agent)
        const reason = creationRouteVerdict({
          toolName: exec.name,
          arguments: args,
          parent: exec.agent,
          catalog: this.catalog,
          parameters: tool?.parameters,
          configured: (read(this.config.routes) ?? []).length > 0,
        })
        if (reason !== undefined) return Promise.resolve({ kind: 'deny', reason })
        canSelectModel = modelSelectionAvailable(tool?.parameters)
        if (!canSelectModel) args = { ...args, provider: undefined, model: undefined }
      }
      if (exec.name !== 'spawn_teammate') {
        const reason = guardVerdict({ arguments: args, parent: exec.agent, catalog: this.catalog, canSelectModel })
        if (reason !== undefined) return Promise.resolve({ kind: 'deny', reason })
      }
    } catch (error) {
      if (CREATION_TOOLS.includes(exec.name)) {
        return Promise.resolve({ kind: 'deny', reason: `${GUARD_PREFIX} ${exec.name} could not verify its model against the Hub child routes. No child was started; check the route configuration and tool availability.` })
      }
      this.ctx.logger?.warn?.(`${PACKAGE}: route guard skipped one call: ${String(error?.message ?? error)}`)
    }
    return next()
  }

  /**
   * Mirror the plugin state into the official Host settings. Never runs unless
   * `manageOfficialSettings` is true. Idempotent: unchanged entries are not rewritten, so a
   * normal restart does not reload the presets.
   * @returns {Promise<{ enabled: boolean, presets?: string[], modelSettings?: string, presetIds?: string[], models?: any[], skipped?: string }>}
   */
  async syncOfficialSettings() {
    const plan = officialSettingsPlan({ manageOfficialSettings: read(this.config.manageOfficialSettings) === true },
      { presetIds: [...this.registered.keys()], routes: this.catalog.routes })
    if (!plan.enabled) return { enabled: false }
    const editor = this.ctx.get('configEditor')
    if (editor === undefined) {
      this.ctx.logger?.warn?.(`${PACKAGE}: manageOfficialSettings is on but the configEditor service is unavailable`)
      return { enabled: true, skipped: 'configEditor unavailable' }
    }
    const presetIds = plan.presetIds
    const models = plan.models
    const report = { enabled: true, presets: [], modelSettings: 'unchanged', presetIds, models, durationMs: 0 }
    const startedAt = Date.now()

    // The model allowlist lands first: it is the setting that makes `provider`/`model` show up,
    // and it costs one profile reload on its own.
    if (models.length > 0) {
      const entry = editor.entries().find(candidate => candidate.options.id === MODEL_SETTINGS_ID)
      if (entry !== undefined) {
        const snapshot = new Map(editor.configuration().map(row => [row.entry, row]))
        const base = { ...(snapshot.get(entry)?.inherited ?? {}), ...(entry.options.config ?? {}) }
        const desired = modelSettingsFor(this.catalog.routes)
        if (base.enabled !== desired.enabled || !sameAllowedModels(base.allowedModels, desired.allowedModels)) {
          await editor.edit(entry, () => ({ ...base, ...desired }))
          report.modelSettings = 'written'
        }
      } else {
        report.modelSettings = 'no subagent-model-selection-settings entry'
      }
    }

    // Then each official preset that carries a spawn delegation row. Every write is one profile
    // reload, so only the rows that actually differ are touched.
    const presetEntryIds = editor.entries()
      .filter(entry => entry.options.name === PRESET_PLUGIN)
      .map(entry => entry.options.id)
    for (const id of presetEntryIds) {
      const entry = editor.entries().find(candidate => candidate.options.id === id)
      if (entry === undefined) continue
      const snapshot = new Map(editor.configuration().map(row => [row.entry, row]))
      const base = { ...(snapshot.get(entry)?.inherited ?? {}), ...(entry.options.config ?? {}) }
      if (!Array.isArray(base.plugins)) continue
      const { plugins, changed } = patchPresetRows(base.plugins, { presetIds, exposeModels: models.length > 0 })
      if (!changed) continue
      await editor.edit(entry, () => ({ ...base, plugins }))
      report.presets.push(id)
    }

    report.durationMs = Date.now() - startedAt
    if (report.presets.length > 0 || report.modelSettings !== 'unchanged') {
      this.ctx.logger?.info?.(`${PACKAGE}: managed official settings in ${report.durationMs}ms: presets=[${report.presets.join(', ')}] modelSettings=${report.modelSettings}`)
    }
    return report
  }
}

export { AGENT_PRESET_PREFIX, GUARD_PREFIX }
