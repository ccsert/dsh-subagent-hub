// Pure configuration transforms for the opt-in `manageOfficialSettings` switch.
// The Host service only locates entries and persists; every decision is testable here.

import { allowedModels } from './router.js'

export const OWN_PRESET_PREFIX = 'hub-agent-'
export const PRESET_PLUGIN = '@deepseek-ai/dsh-agent-preset'
export const SUBAGENT_TOOL_PACKAGE = '@deepseek-ai/dsh-tool-subagent'
export const MODEL_SETTINGS_ID = 'subagent-model-selection-settings'

/** Host setting values that mirror the plugin route table into official child model selection. */
export function modelSettingsFor(routes) {
  return { enabled: true, allowedModels: allowedModels(routes) }
}

/**
 * Decide what the opt-in switch should write. The switch defaults to off, and off means the
 * plugin must not touch another plugin's configuration at all.
 * @param {{ manageOfficialSettings?: boolean }} config
 * @param {{ presetIds: string[], routes: Map<string, any> }} state
 * @returns {{ enabled: false } | { enabled: true, presetIds: string[], models: Array<{provider: string, model: string}> }}
 */
export function officialSettingsPlan(config, { presetIds, routes }) {
  if (config?.manageOfficialSettings !== true) return { enabled: false }
  return { enabled: true, presetIds: [...presetIds], models: allowedModels(routes) }
}

/**
 * Merge our preset ids into an existing `allowedAgentPresets` value.
 * Foreign ids are preserved in order; every previous `hub-agent-` id is replaced by the
 * current registration set so a removed or renamed agent cannot leave a dangling reference.
 * An empty result is returned as `[]` so callers can delete the field (the official schema
 * rejects a present-but-empty list).
 * @param {unknown} existing
 * @param {string[]} ids
 * @returns {string[]}
 */
export function mergePresetAllowlist(existing, ids) {
  const current = Array.isArray(existing) ? existing.filter(id => typeof id === 'string' && id !== '') : []
  const foreign = current.filter(id => !id.startsWith(OWN_PRESET_PREFIX))
  const merged = [...foreign]
  for (const id of ids) if (!merged.includes(id)) merged.push(id)
  return merged
}

/**
 * Rewrite `allowedAgentPresets` (and optionally `modelSelectionSettings`) on every official
 * subagent tool row in one preset plugin list.
 * The row's config is preserved. Only in-process spawn rows can select an independent preset;
 * fork rows are left untouched because the runtime rejects preset selection for them.
 * @param {readonly any[]} plugins
 * @param {{ presetIds: string[], exposeModels: boolean }} options
 * @returns {{ plugins: any[], changed: boolean }}
 */
export function patchPresetRows(plugins, { presetIds, exposeModels = false }) {
  const clone = cloneRows(plugins)
  if (!Array.isArray(clone)) return { plugins, changed: false }
  let changed = false
  const walk = (rows) => {
    for (const row of rows) {
      if (row === null || typeof row !== 'object') continue
      if (Array.isArray(row.config)) walk(row.config)
      if (row.name !== SUBAGENT_TOOL_PACKAGE) continue
      const config = row.config
      if (config === null || typeof config !== 'object' || Array.isArray(config)) continue
      if (config.provider !== 'spawn') continue
      if (exposeModels && config.modelSelectionSettings !== true) {
        config.modelSelectionSettings = true
        changed = true
      }
      const allow = mergePresetAllowlist(config.allowedAgentPresets, presetIds)
      if (allow.length === 0) {
        if (Object.hasOwn(config, 'allowedAgentPresets')) {
          delete config.allowedAgentPresets
          changed = true
        }
      } else if (!sameStrings(config.allowedAgentPresets, allow)) {
        config.allowedAgentPresets = allow
        changed = true
      }
    }
  }
  walk(clone)
  return { plugins: changed ? clone : plugins, changed }
}

/** Whether two route lists describe the same exact provider/model sequence. */
export function sameAllowedModels(left, right) {
  if (!Array.isArray(left) || left.length !== right.length) return false
  return left.every((route, index) => route?.provider === right[index].provider && route?.model === right[index].model)
}

/** Deep clone only plain data rows (`!!js` conditions arrive as plain marker objects). */
function cloneRows(rows) {
  try {
    return structuredClone(rows)
  } catch {
    return undefined
  }
}

function sameStrings(left, right) {
  if (!Array.isArray(left) || left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}
