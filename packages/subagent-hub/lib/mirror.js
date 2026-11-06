// The official-settings mirror as its own module: given a profile config editor, the live route
// table, and the registered preset ids, write every row the official delegation tools read.
//
// Writes stay minimal and upgrade-safe. The model allowlist row is still rewritten whenever it
// differs, but an official preset is only replaced wholesale when the Hub can prove it owns the
// override (a recorded baseline that still equals the file) or when a narrow repair is needed:
// remove rows that can never load, and keep the managed delegation spawn row on the shipped
// defaults. Each step stands alone — a refused write is retried once, recorded, and the remaining
// rows are still attempted — so one dead row cannot leave the mirror half written.

import { MODEL_SETTINGS_ID, MODEL_SETTINGS_NAME, PRESET_PLUGIN, modelSettingsFor, sameAllowedModels } from './official-settings.js'
import { planPresetSync } from './preset-migration.js'

const defaultWait = ms => new Promise((resolve) => { setTimeout(resolve, ms) })
/** Thrown inside `editor.edit`'s change callback when a racing reload already made the row clean. */
const ALREADY_IN_SYNC = new Error('subagent-hub: preset is already in sync')

/**
 * Resolve the row that owns the official child-model allowlist: the addressable profile row id,
 * else the declared plugin name when a deployment renames the id.
 * @param {Array<{ options: { id?: string, name?: string } }>} entries active profile rows.
 * @returns the matching row, or undefined when this profile serves neither.
 */
export function resolveModelSettingsEntry(entries) {
  return entries.find(entry => entry.options.id === MODEL_SETTINGS_ID)
    ?? entries.find(entry => entry.options.name === MODEL_SETTINGS_NAME)
}

/** Current `configuration()` rows keyed by their Loader entry. */
function configurationOf(editor) {
  try {
    return new Map(editor.configuration().map(row => [row.entry, row]))
  } catch {
    return new Map()
  }
}

/** Split one entry's shipped layer, profile override, and the effective value the Loader uses. */
function layersOf(configuration, entry) {
  const row = configuration.get(entry)
  const inherited = isPlainObject(row?.inherited) ? row.inherited : (isPlainObject(entry?.options?.config) ? entry.options.config : {})
  const override = isPlainObject(row?.override) ? row.override : {}
  const hasOverride = Object.keys(override).length > 0
  return { inherited, override, hasOverride, current: hasOverride ? override : inherited }
}

/** Whether the official model-selection row already carries exactly these routes. */
function modelRowInSync(configuration, entry, desired) {
  const layers = layersOf(configuration, entry)
  const base = { ...layers.inherited, ...(entry.options.config ?? {}) }
  return base.enabled === desired.enabled && sameAllowedModels(base.allowedModels, desired.allowedModels)
}

/**
 * Rewrite the official allowlists to match this plugin's live state.
 * @param {object} options mirror inputs.
 * @param {object} options.editor the profile config editor (`entries`/`configuration`/`edit`).
 * @param {Map<string, object>} options.routes the live route table.
 * @param {string[]} options.presetIds the registered named-agent preset ids.
 * @param {{ get: (presetId: string) => Promise<object | undefined>, set: (presetId: string, record: object) => Promise<void> }} [options.baselineStore]
 *   Hub-owned record of what the mirror last wrote per preset; without it a preset is never
 *   rebased and only narrow repairs are applied.
 * @param {Map<string, Array<{ id?: string, name: string }>>} [options.brokenPresets]
 *   authoritative `never started` rows per preset identity, parsed from `agentPresets.list()` by
 *   `parseBrokenPresetRows`; these rows are pruned without asking the resolver.
 * @param {(specifier: string) => (string | false | 'unknown' | undefined)} [options.resolveSpec]
 *   plugin specifier resolution used to prove a subpath row can never load.
 * @param {() => Promise<void> | void} [options.backup] called at most once per run, immediately
 *   before the first write that can change the profile patch.
 * @param {(message: string) => void} [options.warn] per-failure logger.
 * @param {(ms: number) => Promise<void>} [options.wait] retry delay, injectable for tests.
 * @returns {Promise<{ modelSettings: string, presets: string[], rebased: string[], pruned: string[],
 *   foreign: string[], broken: Array<{ preset: string, identity: string, rows: Array<{ id?: string, name: string }> }>,
 *   presetActions: Array<{ preset: string, action: string, rebased: boolean,
 *   foreign: boolean, pruned: Array<{ id?: string, name: string }> }>,
 *   failures: Array<{ step: string, message: string }>, durationMs: number,
 *   models: Array<{ provider: string, model: string }> }>}
 */
export async function syncOfficialMirror({
  editor,
  routes,
  presetIds,
  baselineStore,
  brokenPresets,
  resolveSpec,
  backup,
  warn,
  wait = defaultWait,
}) {
  const models = modelSettingsFor(routes).allowedModels
  const exposeModels = models.length > 0
  const report = {
    modelSettings: 'unchanged',
    presets: [],
    rebased: [],
    pruned: [],
    foreign: [],
    unverified: [],
    broken: [],
    presetActions: [],
    failures: [],
    durationMs: 0,
    models,
  }
  const startedAt = Date.now()

  const fail = (step, error) => {
    report.failures.push({ step, message: String(error?.message ?? error) })
    warn?.(`official settings step "${step}" failed: ${String(error?.message ?? error)}`)
  }

  const readBaseline = async (presetId) => {
    if (baselineStore === undefined) return undefined
    try {
      return await baselineStore.get(presetId)
    } catch (error) {
      warn?.(`official settings baseline for "${presetId}" is unreadable: ${String(error?.message ?? error)}`)
      return undefined
    }
  }

  const writeBaseline = async (presetId, record) => {
    if (baselineStore === undefined || record === undefined) return
    try {
      await baselineStore.set(presetId, record)
    } catch (error) {
      warn?.(`official settings baseline for "${presetId}" was not saved: ${String(error?.message ?? error)}`)
    }
  }

  /**
   * Persist one row. A reload that races the edit refuses the write and restores the file, so one
   * clean retry separates a transient transaction clash from a permanent refusal. The entry is
   * looked up again for each attempt: every edit reloads the profile and replaces Loader entries.
   * A change callback that finds the row already clean aborts instead of materialising a snapshot.
   * @returns `true` when written, `'skipped'` when a recompute found nothing to do, `false` when refused.
   */
  const write = async (step, findEntry, change) => {
    const attempt = async () => {
      const entry = findEntry()
      if (entry === undefined) throw new Error('Configuration entry is no longer available')
      await editor.edit(entry, change)
    }
    try {
      await attempt()
      return true
    } catch (first) {
      if (first === ALREADY_IN_SYNC) return 'skipped'
      try {
        await wait(250)
        await attempt()
        return true
      } catch (second) {
        if (second === ALREADY_IN_SYNC) return 'skipped'
        fail(step, second ?? first)
        return false
      }
    }
  }

  const noteAction = (presetId, plan) => {
    report.presetActions.push({
      preset: presetId,
      action: plan.action,
      rebased: plan.rebased === true,
      foreign: plan.foreign === true,
      pruned: Array.isArray(plan.pruned) ? plan.pruned : [],
    })
    if (plan.rebased === true) report.rebased.push(presetId)
    if (Array.isArray(plan.pruned) && plan.pruned.length > 0) report.pruned.push(presetId)
    if (plan.foreign === true && plan.action !== 'none') report.foreign.push(presetId)
  }

  // Plan the model row first: it is the setting that makes `provider`/`model` appear.
  const configuration = configurationOf(editor)
  const desiredModels = modelSettingsFor(routes)
  let modelEntry
  let modelNeedsWrite = false
  if (exposeModels) {
    modelEntry = resolveModelSettingsEntry(editor.entries())
    if (modelEntry === undefined) {
      report.modelSettings = 'missing-entry'
      fail('model-settings', new Error(`no "${MODEL_SETTINGS_ID}" row and no "${MODEL_SETTINGS_NAME}" plugin in this profile`))
    } else if (modelRowInSync(configuration, modelEntry, desiredModels)) {
      report.modelSettings = 'unchanged'
    } else {
      modelNeedsWrite = true
    }
  }

  // Then plan every official preset once from the same detached snapshot.
  const presetPlans = []
  for (const entry of editor.entries().filter(candidate => candidate.options.name === PRESET_PLUGIN)) {
    const layers = layersOf(configuration, entry)
    const baseline = await readBaseline(entry.options.id)
    const identity = presetIdentity(entry)
    const brokenRows = identity !== undefined && brokenPresets instanceof Map
      ? (brokenPresets.get(identity) ?? [])
      : []
    if (brokenRows.length > 0) report.broken.push({ preset: entry.options.id, identity, rows: brokenRows })
    const plan = planPresetSync({
      presetId: entry.options.id,
      inherited: layers.inherited,
      current: layers.current,
      override: layers.hasOverride ? layers.override : {},
      baseline,
      presetIds,
      exposeModels,
      brokenRows,
      resolveSpec,
    })
    presetPlans.push({ presetId: entry.options.id, hasOverride: layers.hasOverride, baseline, brokenRows, plan })
    // A row the resolver cannot judge is reported, never guessed away: a user row must not be
    // deleted on a failed resolution.
    for (const row of plan.unverified ?? []) {
      report.unverified.push({ presetId: entry.options.id, rowId: row.id, name: row.name })
      warn?.(`official settings preset "${entry.options.id}" row "${row.name}" could not be verified/removed automatically; remove the row or restore the shipped preset`)
    }
  }

  // One backup per run, before the first write that could change the profile patch.
  let backupReady = typeof backup !== 'function'
  const ensureBackup = async () => {
    if (backupReady) return true
    backupReady = true
    try {
      await backup()
      return true
    } catch (error) {
      fail('backup', error)
      return false
    }
  }
  const mutatingPresets = presetPlans.filter(item => item.plan.action === 'write' || item.plan.action === 'prune')
  if (modelNeedsWrite || mutatingPresets.length > 0) {
    if (!(await ensureBackup())) {
      report.durationMs = Date.now() - startedAt
      return report
    }
  }

  if (modelNeedsWrite) {
    const accepted = await write('model-settings', () => resolveModelSettingsEntry(editor.entries()),
      (current, inherited) => ({ ...inherited, ...current, ...desiredModels }))
    report.modelSettings = accepted === true ? 'written' : 'failed'
  }

  for (const { presetId, hasOverride, baseline, brokenRows, plan } of presetPlans) {
    if (plan.action === 'none') {
      noteAction(presetId, plan)
      continue
    }
    if (plan.action === 'skip-foreign') {
      noteAction(presetId, plan)
      await writeBaseline(presetId, plan.baseline)
      continue
    }
    let applied = plan
    const accepted = await write(`preset ${presetId}`,
      () => editor.entries().find(candidate => candidate.options.id === presetId && candidate.options.name === PRESET_PLUGIN),
      (current, inherited) => {
        // Recompute from the config-editor's authoritative layers so a racing reload is retried
        // rather than overwritten with a stale snapshot.
        const nextPlan = planPresetSync({
          presetId,
          inherited,
          current,
          override: hasOverride ? current : {},
          baseline,
          presetIds,
          exposeModels,
          brokenRows,
          resolveSpec,
        })
        applied = nextPlan
        if (nextPlan.action === 'none' || nextPlan.action === 'skip-foreign') throw ALREADY_IN_SYNC
        return nextPlan.next
      })
    if (accepted === false) continue
    noteAction(presetId, applied)
    await writeBaseline(presetId, applied.baseline)
    if (accepted === true) report.presets.push(presetId)
  }

  report.durationMs = Date.now() - startedAt
  return report
}

/**
 * The identity `agentPresets.list()` uses for a preset entry: the declared config id, with the
 * Loader's `preset-` prefix as a fallback when a preset does not declare one.
 */
function presetIdentity(entry) {
  const configured = entry?.options?.config?.id
  if (typeof configured === 'string' && configured !== '') return configured
  const entryId = entry?.options?.id
  if (typeof entryId !== 'string' || entryId === '') return undefined
  return entryId.startsWith('preset-') ? entryId.slice('preset-'.length) : entryId
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
