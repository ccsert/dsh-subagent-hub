// Pure configuration transforms for the opt-in `manageOfficialSettings` switch.
// The Host service only locates entries and persists; every decision is testable here.

import { allowedModels } from './router.js'

export const OWN_PRESET_PREFIX = 'hub-agent-'
export const PRESET_PLUGIN = '@deepseek-ai/dsh-agent-preset'
export const SUBAGENT_TOOL_PACKAGE = '@deepseek-ai/dsh-tool-subagent'
export const TEAM_TOOL_PACKAGE = '@deepseek-ai/dsh-experimental-tool-agent-team'
export const MODEL_SETTINGS_ID = 'subagent-model-selection-settings'
/** Declared package of that row; a deployment may rename the id, the name stays put. */
export const MODEL_SETTINGS_NAME = '@deepseek-ai/dsh-tool-subagent/model-selection-settings'

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

/** Only a public configuration schema can authorize writing a Team role allowlist. */
export function teamRoleEntryIds(entries, descriptors) {
  const supported = new Set((descriptors ?? []).filter(descriptor => {
    const schema = descriptor?.schema
    const root = schema?.refs?.[schema.uid] ?? schema
    return root?.type === 'object' && Object.hasOwn(root.dict ?? {}, 'allowedAgentPresets')
  }).map(descriptor => descriptor.ns))
  return entries.filter(entry => entry.options.name === TEAM_TOOL_PACKAGE && supported.has(entry.options.id))
    .map(entry => entry.options.id)
}

/** Preserve foreign roles and fields; an empty Team list disables explicit preset selection. */
export function teamRoleConfig(config, presetIds) {
  const allowedAgentPresets = mergePresetAllowlist(config?.allowedAgentPresets, presetIds)
  return sameStrings(config?.allowedAgentPresets, allowedAgentPresets) ? config : { ...config, allowedAgentPresets }
}

/**
 * Rewrite `allowedAgentPresets` on every official spawn tool row in one preset plugin list.
 * `modelSelectionSettings` (the older 0.2.1 official key) is switched on only when that row
 * already declares it; the field is never invented on a base that does not ship it.
 * The row's other config is preserved. Only in-process spawn rows can select an independent
 * preset; fork rows are left untouched because the runtime rejects preset selection for them.
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
      // `modelSelectionSettings` is the older (0.2.1-rc.2) official key. It is only switched on
      // when the row already declares it; on newer bases the key no longer exists and must not
      // be invented (the current keys are `modelSelection`/`modelDiscovery`, shipped verbatim).
      if (exposeModels && Object.hasOwn(config, 'modelSelectionSettings') && config.modelSelectionSettings !== true) {
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
