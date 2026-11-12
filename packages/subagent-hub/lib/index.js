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
import { activityProjection } from './activity.js'
import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { AGENT_PRESET_PREFIX, buildCatalog } from './catalog.js'
import { deriveAgentPreset } from './presets.js'
import { CREATION_TOOLS, GUARD_PREFIX, concurrencyVerdict, creationRouteVerdict, guardVerdict, modelSelectionAvailable, routeEffortVerdict } from './guard.js'
import { promptSection } from './prompt.js'
import { MODEL_SETTINGS_ID, modelSettingsFor, officialSettingsPlan, teamRoleEntryIds } from './official-settings.js'
import { syncOfficialMirror } from './mirror.js'
import { parseBrokenPresetRows } from './preset-migration.js'
import { backupProfilePatch, createBaselineStore, createResolveSpec } from './sidecar.js'
import { SESSION_POLICY_KEY, compareLayers, presetRouteProblems, routePairs, sessionPolicyNotice } from './policy.js'
import { configurationPreset } from './configuration.js'
import { installTeamRouting } from './team-routing.js'

const PACKAGE = 'dsh-subagent-hub'
const PRESET_WAIT_MS = 30_000
const PRESET_ORDER = 10_000
/** A roster read must never hold the mirror hostage: the broken-preset signal is a bonus. */
const ROSTER_READ_MS = 2_000
const LIVE_FIELDS = new Set(['routes', 'agents', 'manageOfficialSettings'])

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
/** A volatile field arrives as a cell with `get()`; tolerate a plain value too. */
const read = field => (field !== null && typeof field === 'object' && typeof field.get === 'function' ? field.get() : field)
/** Reject rather than await a promise that does not settle in time. */
const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms}ms`)), ms)
  promise.then(
    value => { clearTimeout(timer); resolve(value) },
    error => { clearTimeout(timer); reject(error) },
  )
})

/** Everything that shapes a named agent's preset; presets are only re-registered when this moves. */
const agentSignature = agents => JSON.stringify(agents.map(agent => [agent.id, agent.name, agent.description, agent.basePreset, agent.instructions]))

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
      name: z.string(),
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
      .description('Show the header entry for the Hub overview in the official right sidebar. The native Agent Team UI remains available.'),
    manageOfficialSettings: z.boolean().default(false).volatile()
      .description('When true, write `allowedAgentPresets` onto the official delegation tool rows and '
        + 'mirror `routes` into the Host `subagent-model-selection` setting through configEditor. '
        + 'Only the Hub-managed fields of each official preset are owned: a baseline sidecar records '
        + 'them so a DSH upgrade rebases what the Hub wrote, user edits win, and the profile patch is '
        + 'backed up before the first write. Off by default so installing this plugin changes nobody else\'s settings.'),
  })

  constructor(ctx, config) {
    super(ctx, 'subagentHub')
    this.config = config
    /** @type {Map<string, () => Promise<void>>} registered named-agent presets by preset id */
    this.registered = new Map()
    /** @type {Map<string, Promise<any[]>>} parsed rows per base preset */
    this.baseRows = new Map()
    this.disposers = []
    this.cache = { routesRaw: undefined, agentsRaw: undefined, catalog: undefined }
    this.presetSignature = undefined
    /** @type {Array<{ presetId: string, text: string }>} named agents outside the session allowlist */
    this.policyProblems = []
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
    /** @type {string | undefined} profile patch the Hub-owned baseline sidecar belongs to */
    this.baselineDocumentPath = undefined
    /** @type {ReturnType<typeof createBaselineStore> | undefined} */
    this.baselineStore = undefined
    /** Set after the first roster-read warning, so a broken diagnostic is not logged every sync. */
    this.brokenRosterWarned = false
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
    // A separate optional mode, never the default Lead preset or a child-role allowlist entry.
    this.disposers.push(await this.ctx.agentPresets.register(configurationPreset()))
    this.disposers.push(installTeamRouting(this))
    for (const problem of this.catalog.problems) this.ctx.logger?.warn?.(`${PACKAGE}: ${problem}`)
    this.disposers.push(this.ctx.systemPrompt.section({
      name: PACKAGE,
      order: this.ctx.systemPrompt.getSectionOrder('TOOL_SUBAGENT') + 10,
      text: context => this.sectionText(context.scope),
    }))
    this.disposers.push(this.ctx.inject(['sessionProjections'], scope => this.registerProjections(scope.sessionProjections)))
    // The official runtime captures a Session's model allowlist at start and never refreshes it,
    // so a live configuration edit cannot reach an open Session. Say that in the runtime context
    // instead of letting the model discover it through an opaque native rejection.
    this.disposers.push(this.ctx.systemPrompt.context({
      name: `${PACKAGE}:session-allowlist`,
      order: this.ctx.systemPrompt.getContextOrder('SUBAGENT_DELEGATION'),
      text: context => this.sessionContextText(context.agent),
    }))
    this.disposers.push(this.ctx.on('tools/pre-execute', (exec, next) => this.preExecute(exec, next)))
    // The Plugins page form writes volatile fields; the Loader commits them in place and announces
    // the changed paths on this plugin's own fiber.
    this.disposers.push(this.ctx.on('loader/volatile-update', paths => this.onVolatileUpdate(paths)))
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

  /** Own only Hub projections. Native policy keys remain registered by their owning domain. */
  async registerProjections(registry) {
    const handles = new Map()
    const dispose = async () => {
      try {
        for (const handle of [...handles.values()].reverse()) {
          if (typeof handle?.dispose === 'function') await handle.dispose()
          else if (typeof handle === 'function') await handle()
        }
      } finally {
        if (this.projectionHandles === handles) this.projectionHandles = undefined
      }
    }
    try {
      for (const definition of [dispatchProjection, activityProjection]) {
        handles.set(definition.key, await registry.register(definition))
      }
      this.projectionHandles = handles
      return dispose
    } catch (error) {
      await dispose()
      throw error
    }
  }

  /** rc2's public tree identity API distinguishes it from rc1's Team lifecycle. */
  nativeNamedDelegation() {
    const runtime = this.ctx.get('subagents')
    return typeof runtime?.namesOf === 'function' && typeof runtime?.startActivation === 'function'
      && typeof runtime?.resolveMaxDepth === 'function'
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
        const { plugins } = deriveAgentPreset(await this.rowsOf(agent.basePreset), agent.instructions,
          { preserveDelegation: this.nativeNamedDelegation() })
        const dispose = await this.ctx.agentPresets.register({
          id: agent.presetId,
          name: agent.name || `Hub agent · ${agent.id}`,
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
    this.validatePresetRoutes()
    return report
  }

  /**
   * The allowlist a Session started now would capture. While `manageOfficialSettings` is on this
   * plugin writes it, so the live routes are authoritative; otherwise the value belongs to the
   * user and is read back. `undefined` when it cannot be known, which is not the same as empty.
   * @returns {{ source: 'managed' | 'official', models: Array<{ provider: string, model: string }> } | undefined}
   */
  officialAllowlist() {
    if (read(this.config.manageOfficialSettings) === true) {
      return { source: 'managed', models: modelSettingsFor(this.catalog.routes).allowedModels }
    }
    const editor = this.ctx.get('configEditor')
    if (editor === undefined) return undefined
    try {
      const entry = editor.entries().find(candidate => candidate.options.id === MODEL_SETTINGS_ID)
      if (entry === undefined) return undefined
      const inherited = new Map(editor.configuration().map(row => [row.entry, row])).get(entry)?.inherited ?? {}
      const value = { ...inherited, ...(entry.options.config ?? {}) }
      // Selection is off, so no Session captures an allowlist and nothing can fall outside it.
      if (value.enabled !== true) return undefined
      return { source: 'official', models: routePairs(value.allowedModels) }
    } catch {
      return undefined
    }
  }

  /**
   * Report named agents whose declared routes are outside the allowlist new Sessions capture.
   * Runs when the presets are registered, so a misconfigured pair is visible before anyone
   * delegates to it, instead of surfacing as a refusal at call time.
   */
  validatePresetRoutes() {
    const allowlist = this.officialAllowlist()
    const problems = allowlist === undefined ? [] : presetRouteProblems(this.catalog, allowlist.models)
    this.policyProblems = problems
    for (const problem of problems) this.ctx.logger?.warn?.(`${PACKAGE}: ${problem.text}`)
    return { allowlist, problems }
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
        nameInput: Object.hasOwn(properties, 'name'),
        effort: Object.hasOwn(properties, 'reasoning_effort'),
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
        agentPreset: Object.hasOwn(properties, 'agent_preset'),
        effort: Object.hasOwn(properties, 'reasoning_effort'),
        ...(this.teamRouting?.canCreate(scope) && tools.get('hub_spawn_teammate', scope) ? { hubRouting: true } : {}),
      },
    }
  }

  sectionText(scope) {
    const params = this.exposedParameters(scope)
    if (params === undefined) return ''
    return promptSection({ catalog: this.catalog, params, limit: read(this.config.maxConcurrent) ?? 0, limitTools: read(this.config.delegationTools) ?? [] })
  }

  /**
   * Runtime-context sentence for one Session: the allowlist it captured when it started versus
   * the live configuration. Empty when they agree or the Session has no captured allowlist,
   * so the prompt only grows when a stale snapshot would actually refuse a call.
   */
  sessionContextText(agent) {
    const layers = this.sessionLayers(agent?.session)
    if (layers.session.length === 0 || layers.inSync) return ''
    return sessionPolicyNotice(layers)
  }

  /**
   * The allowlist one Session captured when it started, as recorded by the official subagent
   * tool. `undefined` means "not model-selectable here" or "not readable yet", never "empty".
   * @param {any} session
   * @returns {Array<{ provider: string, model: string }> | undefined}
   */
  sessionPolicy(session) {
    const target = session ?? undefined
    if (target === undefined) return undefined
    try {
      const state = this.ctx.get('sessionProjections')?.stateOf?.(target, SESSION_POLICY_KEY)
      return Array.isArray(state) ? routePairs(state) : undefined
    } catch {
      return undefined
    }
  }

  /** Live configuration against one Session's captured allowlist. */
  sessionLayers(session) {
    return compareLayers([...this.catalog.routes.values()], this.sessionPolicy(session))
  }

  /**
   * Count direct local children executing now. Subagent start/end describe an activation's
   * residency, which may span many idle/running turns; they cannot count execution slots.
   * Read the owner registry at admission so HMR, message wakes and cold resume need no replay.
   */
  runningChildren(caller) {
    const parentId = caller?.session?.header?.id ?? caller?.id
    if (parentId === undefined) return 0
    const agents = this.ctx.get('agents')
    if (typeof agents?.list !== 'function') return 0
    return agents.list().filter(child => child !== caller && child.status === 'running'
      && (typeof agents.isOwnedBy === 'function'
        ? agents.isOwnedBy(child.id, caller)
        : String(child.session?.header?.parentSession) === String(parentId))).length
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
          sessionPolicy: this.sessionPolicy(exec.agent?.session),
        })
        if (reason !== undefined) return Promise.resolve({ kind: 'deny', reason })
        canSelectModel = modelSelectionAvailable(tool?.parameters)
        if (!canSelectModel) args = { ...args, provider: undefined, model: undefined }
      }
      if (exec.name !== 'spawn_teammate'
        || Object.hasOwn(this.ctx.get('tools')?.get(exec.name, exec.agent)?.parameters?.properties ?? {}, 'agent_preset')) {
        const reason = guardVerdict({ arguments: args, parent: exec.agent, catalog: this.catalog, canSelectModel })
        if (reason !== undefined) return Promise.resolve({ kind: 'deny', reason })
      }
    } catch (error) {
      if (CREATION_TOOLS.includes(exec.name)) {
        return Promise.resolve({ kind: 'deny', reason: `${GUARD_PREFIX} ${exec.name} could not verify its model against the Hub child routes. No child was started; check the route configuration and tool availability.` })
      }
      this.ctx.logger?.warn?.(`${PACKAGE}: route guard skipped one call: ${String(error?.message ?? error)}`)
    }
    // Effort advice is fail-open, separately from the mandatory route guards above.
    try {
      const reason = routeEffortVerdict({
        toolName: exec.name,
        arguments: exec.arguments,
        parent: exec.agent,
        catalog: this.catalog,
        parameters: this.ctx.get('tools')?.get(exec.name, exec.agent)?.parameters,
        explicitRouteEffortDefault: this.nativeNamedDelegation(),
      })
      if (reason !== undefined) return Promise.resolve({ kind: 'deny', reason })
    } catch {
      // A failure to inspect effort must never prevent a delegation.
    }
    return next()
  }

  /**
   * Mirror the plugin state into the official Host settings. Never runs unless
   * `manageOfficialSettings` is true. Idempotent: unchanged entries are not rewritten, so a
   * normal restart does not reload the presets.
   *
   * Writes stay upgrade-safe: a preset override is only replaced wholesale when a recorded
   * baseline proves the Hub wrote it (see `preset-migration.js`); otherwise only the managed
   * delegation spawn row and provably unloadable rows are touched. The profile patch is backed up
   * once per run before the first write, and the baseline lives in a sidecar next to it.
   * The writes live in `mirror.js`: each step stands alone, so one dead row cannot leave the
   * mirror half written while the page can only say "unconfirmed".
   * @returns {Promise<{ enabled: boolean, presets?: string[], rebased?: string[], pruned?: string[],
   *   foreign?: string[], unverified?: Array<{ presetId: string, rowId?: string, name: string }>,
   *   presetActions?: Array<object>, modelSettings?: string, presetIds?: string[], models?: any[],
   *   skipped?: string, durationMs?: number, failures?: Array<{ step: string, message: string }> }>}
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
    const documentPath = editor.documentPath
    const hasDocument = typeof documentPath === 'string' && documentPath !== ''
    if (hasDocument && this.baselineDocumentPath !== documentPath) {
      this.baselineDocumentPath = documentPath
      this.baselineStore = createBaselineStore(documentPath)
    }
    const brokenPresets = await this.readBrokenPresets()
    const brokenCount = brokenPresets === undefined
      ? 0
      : [...brokenPresets.values()].reduce((count, rows) => count + rows.length, 0)
    const mirror = await syncOfficialMirror({
      editor,
      routes: this.catalog.routes,
      presetIds: plan.presetIds,
      teamRoleIds: teamRoleEntryIds(editor.entries(), this.ctx.get('settings')?.describe?.() ?? []),
      baselineStore: hasDocument ? this.baselineStore : undefined,
      brokenPresets,
      resolveSpec: createResolveSpec(this.ctx.get('profileContext'), documentPath),
      backup: hasDocument ? () => backupProfilePatch(documentPath) : undefined,
      warn: message => this.ctx.logger?.warn?.(`${PACKAGE}: ${message}`),
    })
    const report = {
      enabled: true,
      presets: mirror.presets,
      rebased: mirror.rebased,
      pruned: mirror.pruned,
      foreign: mirror.foreign,
      unverified: mirror.unverified,
      broken: mirror.broken,
      presetActions: mirror.presetActions,
      modelSettings: mirror.modelSettings,
      teamPresets: mirror.teamPresets,
      presetIds: plan.presetIds,
      models: mirror.models,
      durationMs: mirror.durationMs,
      failures: mirror.failures,
    }
    const acted = report.presetActions.some(action => action.action !== 'none') || report.teamPresets.length > 0
    if (report.presets.length > 0 || report.modelSettings !== 'unchanged' || report.failures.length > 0 || acted) {
      const detail = report.failures.length === 0
        ? ''
        : ` failures=[${report.failures.map(item => `${item.step}: ${item.message}`).join('; ')}]`
      const parts = [
        `presets=[${report.presets.join(', ')}]`,
        `modelSettings=${report.modelSettings}`,
        `broken=${brokenCount}`,
      ]
      if (report.rebased.length > 0) parts.push(`rebased=[${report.rebased.join(', ')}]`)
      if (report.pruned.length > 0) parts.push(`pruned=[${report.pruned.join(', ')}]`)
      if (report.foreign.length > 0) parts.push(`foreign=[${report.foreign.join(', ')}]`)
      if (report.unverified.length > 0) parts.push(`unverified=${report.unverified.length}`)
      const line = `${PACKAGE}: official settings mirror in ${report.durationMs}ms: ${parts.join(' ')}${detail}`
      if (report.failures.length === 0) this.ctx.logger?.info?.(line)
      else this.ctx.logger?.warn?.(line)
    }
    return report
  }

  /**
   * Read the authoritative activation diagnostics for the repair. The roster is a bonus signal:
   * a slow or failed read must never block or fail the mirror, so it is bounded and swallowed.
   * @returns {Promise<Map<string, Array<{ id?: string, name: string }>> | undefined>}
   */
  async readBrokenPresets() {
    const presets = this.ctx.get('agentPresets')
    if (presets === undefined) return undefined
    try {
      const roster = await withTimeout(presets.list(), ROSTER_READ_MS, 'agent preset roster')
      return parseBrokenPresetRows(roster)
    } catch (error) {
      if (!this.brokenRosterWarned) {
        this.brokenRosterWarned = true
        this.ctx.logger?.warn?.(`${PACKAGE}: could not read the agent-preset activation diagnostics for the official settings repair: ${String(error?.message ?? error)}; falling back to the conservative package resolver`)
      }
      return undefined
    }
  }
}

export { AGENT_PRESET_PREFIX, GUARD_PREFIX }
