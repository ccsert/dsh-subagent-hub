// The official-settings mirror as its own module: given a profile config editor, the live route
// table, and the registered preset ids, write every row the official delegation tools read.
//
// It stays free of runtime services on purpose. Each step stands alone — a refused write is
// retried once, recorded, and the remaining rows are still attempted — so one dead row cannot
// leave the mirror half written while the page can only report "unconfirmed".

import { MODEL_SETTINGS_ID, MODEL_SETTINGS_NAME, modelSettingsFor, patchPresetRows, sameAllowedModels, PRESET_PLUGIN } from './official-settings.js'

const defaultWait = ms => new Promise((resolve) => { setTimeout(resolve, ms) })

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

/** Whether the official model-selection row already carries exactly these routes. */
function modelRowInSync(editor, entry, desired) {
  const snapshot = new Map(editor.configuration().map(row => [row.entry, row]))
  const base = { ...(snapshot.get(entry)?.inherited ?? {}), ...(entry.options.config ?? {}) }
  return base.enabled === desired.enabled && sameAllowedModels(base.allowedModels, desired.allowedModels)
}

/** Whether one official preset still needs its spawn rows rewritten. */
function presetRowInSync(editor, entry, { presetIds, exposeModels }) {
  const snapshot = new Map(editor.configuration().map(row => [row.entry, row]))
  const base = { ...(snapshot.get(entry)?.inherited ?? {}), ...(entry.options.config ?? {}) }
  if (!Array.isArray(base.plugins)) return true
  return !patchPresetRows(base.plugins, { presetIds, exposeModels }).changed
}

/**
 * Rewrite the official allowlists to match this plugin's live state.
 * @param {object} options mirror inputs.
 * @param {object} options.editor the profile config editor (`entries`/`configuration`/`edit`).
 * @param {Map<string, object>} options.routes the live route table.
 * @param {string[]} options.presetIds the registered named-agent preset ids.
 * @param {(message: string) => void} [options.warn] per-failure logger.
 * @param {(ms: number) => Promise<void>} [options.wait] retry delay, injectable for tests.
 * @returns {Promise<{ modelSettings: string, presets: string[], failures: Array<{ step: string, message: string }>, durationMs: number, models: Array<{ provider: string, model: string }> }>}
 */
export async function syncOfficialMirror({ editor, routes, presetIds, warn, wait = defaultWait }) {
  const models = modelSettingsFor(routes).allowedModels
  const exposeModels = models.length > 0
  const report = { modelSettings: 'unchanged', presets: [], failures: [], durationMs: 0, models }
  const startedAt = Date.now()

  const fail = (step, error) => {
    report.failures.push({ step, message: String(error?.message ?? error) })
    warn?.(`official settings step "${step}" failed: ${String(error?.message ?? error)}`)
  }
  /**
   * Persist one row. A reload that races the edit refuses the write and restores the file, so one
   * clean retry separates a transient transaction clash from a permanent refusal.
   * @returns whether the row was accepted.
   */
  const write = async (step, entry, change) => {
    try {
      await editor.edit(entry, change)
      return true
    } catch (first) {
      try {
        await wait(250)
        await editor.edit(entry, change)
        return true
      } catch (second) {
        fail(step, second ?? first)
        return false
      }
    }
  }

  // The model allowlist lands first: it is the setting that makes `provider`/`model` show up, and
  // it costs one profile reload on its own.
  if (exposeModels) {
    const entry = resolveModelSettingsEntry(editor.entries())
    if (entry === undefined) {
      report.modelSettings = 'missing-entry'
      fail('model-settings', new Error(`no "${MODEL_SETTINGS_ID}" row and no "${MODEL_SETTINGS_NAME}" plugin in this profile`))
    } else if (modelRowInSync(editor, entry, modelSettingsFor(routes))) {
      report.modelSettings = 'unchanged'
    } else {
      const desired = modelSettingsFor(routes)
      const accepted = await write('model-settings', entry,
        (current, inherited) => ({ ...inherited, ...current, ...desired }))
      report.modelSettings = accepted ? 'written' : 'failed'
    }
  }

  // Then every official preset that carries a spawn delegation row. Each write is one profile
  // reload, so only the rows that actually differ are touched.
  const presetEntryIds = editor.entries()
    .filter(entry => entry.options.name === PRESET_PLUGIN)
    .map(entry => entry.options.id)
  for (const id of presetEntryIds) {
    const entry = editor.entries().find(candidate => candidate.options.id === id)
    if (entry === undefined) continue
    if (presetRowInSync(editor, entry, { presetIds, exposeModels })) continue
    const accepted = await write(`preset ${id}`, entry, (current, inherited) => {
      const merged = { ...inherited, ...current }
      if (!Array.isArray(merged.plugins)) return merged
      const patched = patchPresetRows(merged.plugins, { presetIds, exposeModels })
      return patched.changed ? { ...merged, plugins: patched.plugins } : merged
    })
    if (accepted) report.presets.push(id)
  }

  report.durationMs = Date.now() - startedAt
  return report
}
