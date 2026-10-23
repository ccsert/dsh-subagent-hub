// `subagentHub` Host service (v2): inform the official delegation tools instead of replacing them.
//
// 1. Named agents become ordinary Agent Presets (stable `hub-agent-<id>` ids) so the official
//    `subagent` tool can select them through `agent_preset`.
// 2. The route table mirrors the official `subagent-model-selection` allowlist.
// 3. A system-prompt section says which named agent / model fits which job.
// 4. A `tools/pre-execute` guard enforces a named agent's route confinement, which the official
//    allowlist alone cannot express.
// 5. Opt-in `manageOfficialSettings` writes those official allowlists through `configEditor`.
import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { AGENT_PRESET_PREFIX, buildCatalog } from './catalog.js'
import { deriveAgentPreset } from './presets.js'
import { GUARD_PREFIX, guardVerdict } from './guard.js'
import { promptSection } from './prompt.js'
import { MODEL_SETTINGS_ID, PRESET_PLUGIN, modelSettingsFor, officialSettingsPlan, patchPresetRows, sameAllowedModels } from './official-settings.js'

const PACKAGE = 'dsh-subagent-hub'
const PRESET_WAIT_MS = 30_000
const PRESET_ORDER = 10_000

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

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
    })).default([]).description('Child model allowlist in preference order, tagged by capability. '
      + 'Each route becomes one official `subagent-model-selection` allowed model.'),
    agents: z.array(z.object({
      id: z.string().required(),
      description: z.string().required(),
      instructions: z.string().default(''),
      routes: z.array(z.string()),
      needs: z.array(z.string()),
      basePreset: z.string().default('standard'),
    })).default([]).description('Named agents. Each one is registered as an Agent Preset and exposed '
      + 'through the official tool\'s static `allowedAgentPresets` list.'),
    manageOfficialSettings: z.boolean().default(false)
      .description('When true, write `allowedAgentPresets` onto the official delegation tool rows and '
        + 'mirror `routes` into the Host `subagent-model-selection` setting through configEditor. '
        + 'This owns those official configuration fields for every preset that contains a spawn '
        + 'delegation row. Off by default so installing this plugin changes nobody else\'s settings.'),
  })

  constructor(ctx, config) {
    super(ctx, 'subagentHub')
    this.config = config
    this.catalogState = buildCatalog(config)
    /** @type {Map<string, () => Promise<void>>} registered named-agent presets by preset id */
    this.registered = new Map()
    /** @type {Map<string, Promise<any[]>>} parsed rows per base preset */
    this.baseRows = new Map()
    this.disposers = []
    /** Settles once every named agent preset is registered or reported missing. */
    this.ready = Promise.resolve({ registered: [], skipped: [] })
    /** Settles once the opt-in official settings write (or its skip) is complete. */
    this.officialSettingsReady = Promise.resolve({ enabled: false })
  }

  async *[Service.init]() {
    for (const problem of this.catalogState.problems) {
      this.ctx.logger?.warn?.(`${PACKAGE}: ${problem}`)
    }
    this.disposers.push(this.ctx.systemPrompt.section({
      name: PACKAGE,
      order: this.ctx.systemPrompt.getSectionOrder('TOOL_SUBAGENT') + 10,
      text: context => this.sectionText(context.scope),
    }))
    this.disposers.push(this.ctx.on('tools/pre-execute', (exec, next) => this.preExecute(exec, next)))

    this.ready = this.registerAgentPresets()
    this.officialSettingsReady = this.ready
      .then(() => this.syncOfficialSettings())
      .catch((error) => {
        this.ctx.logger?.warn?.(`${PACKAGE}: official settings sync failed: ${String(error?.message ?? error)}`)
        return { enabled: this.config.manageOfficialSettings === true, error: String(error?.message ?? error) }
      })

    yield async () => {
      const disposers = this.disposers.splice(0).reverse()
      for (const dispose of disposers) {
        try {
          await dispose()
        } catch {
          // a disposed context may already be gone during teardown
        }
      }
      for (const dispose of [...this.registered.values()].reverse()) {
        try {
          await dispose()
        } catch {
          // the registry may already be torn down
        }
      }
      this.registered.clear()
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
    for (const agent of this.catalogState.agents) {
      try {
        const { plugins } = deriveAgentPreset(await this.rowsOf(agent.basePreset), agent.instructions)
        const dispose = await this.ctx.agentPresets.register({
          id: agent.presetId,
          name: `Hub agent · ${agent.id}`,
          description: agent.description,
          order: PRESET_ORDER,
          plugins,
        })
        this.registered.set(agent.presetId, dispose)
        report.registered.push(agent.presetId)
      } catch (error) {
        report.skipped.push({ id: agent.presetId, reason: String(error?.message ?? error) })
        this.ctx.logger?.warn?.(`${PACKAGE}: skipped preset ${agent.presetId}: ${String(error?.message ?? error)}`)
      }
    }
    return report
  }

  /** Parameters the official delegation tool currently exposes in one agent's composition. */
  exposedParameters(scope) {
    const tools = this.ctx.get('tools')
    if (tools === undefined) return undefined
    for (const name of ['subagent', 'subagent_fork']) {
      const tool = tools.get(name, scope)
      if (tool === undefined) continue
      const properties = tool.parameters?.properties ?? {}
      return {
        agentPreset: Object.hasOwn(properties, 'agent_preset'),
        model: Object.hasOwn(properties, 'provider') && Object.hasOwn(properties, 'model'),
      }
    }
    return undefined
  }

  sectionText(scope) {
    const params = this.exposedParameters(scope)
    if (params === undefined) return ''
    return promptSection({ catalog: this.catalogState, params })
  }

  /** Reject a delegation that would put a route-confined named agent on another model. */
  preExecute(exec, next) {
    try {
      const reason = guardVerdict({ arguments: exec.arguments, parent: exec.agent, catalog: this.catalogState })
      if (reason !== undefined) return Promise.resolve({ kind: 'deny', reason })
    } catch (error) {
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
    const plan = officialSettingsPlan(this.config, { presetIds: [...this.registered.keys()], routes: this.catalogState.routes })
    if (!plan.enabled) return { enabled: false }
    const editor = this.ctx.get('configEditor')
    if (editor === undefined) {
      this.ctx.logger?.warn?.(`${PACKAGE}: manageOfficialSettings is on but the configEditor service is unavailable`)
      return { enabled: true, skipped: 'configEditor unavailable' }
    }
    const presetIds = plan.presetIds
    const models = plan.models
    const report = { enabled: true, presets: [], modelSettings: 'unchanged', presetIds, models }

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

    if (models.length > 0) {
      const entry = editor.entries().find(candidate => candidate.options.id === MODEL_SETTINGS_ID)
      if (entry !== undefined) {
        const snapshot = new Map(editor.configuration().map(row => [row.entry, row]))
        const base = { ...(snapshot.get(entry)?.inherited ?? {}), ...(entry.options.config ?? {}) }
        const desired = modelSettingsFor(this.catalogState.routes)
        if (base.enabled !== desired.enabled || !sameAllowedModels(base.allowedModels, desired.allowedModels)) {
          await editor.edit(entry, () => ({ ...base, ...desired }))
          report.modelSettings = 'written'
        }
      } else {
        report.modelSettings = 'no subagent-model-selection-settings entry'
      }
    }

    if (report.presets.length > 0 || report.modelSettings !== 'unchanged') {
      this.ctx.logger?.info?.(`${PACKAGE}: managed official settings: presets=[${report.presets.join(', ')}] modelSettings=${report.modelSettings}`)
    }
    return report
  }
}

export { AGENT_PRESET_PREFIX, GUARD_PREFIX }
