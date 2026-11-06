// Pure decisions for the official-preset mirror: what the shipped base declares, what the Hub
// actually owns inside a preset, and whether an existing profile override may be rewritten.
//
// `@deepseek-ai/dsh-config-editor` persists the COMPLETE config returned by `change()`, so an
// override written by the mirror freezes the whole shipped preset at that moment. Writing one is
// only safe when the Hub can prove the override is its own (a recorded baseline) and the user has
// not edited it since. Everything else is repaired narrow: the delegation spawn row is the Hub's
// managed scope, every other row belongs to the user and to the shipped preset.

import { createHash } from 'node:crypto'
import { OWN_PRESET_PREFIX, SUBAGENT_TOOL_PACKAGE, mergePresetAllowlist, patchPresetRows } from './official-settings.js'

export const BASELINE_VERSION = 1

/** Deterministic projection: object keys sorted, `undefined` dropped, arrays kept in order. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonical)
  const result = {}
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) continue
    result[key] = canonical(value[key])
  }
  return result
}

/**
 * Stable fingerprint of a JSON-compatible configuration value. Key order does not matter.
 * @param {unknown} value
 * @returns {string} hex digest
 */
export function stableHash(value) {
  const text = JSON.stringify(canonical(value))
  return createHash('sha256').update(text ?? 'undefined').digest('hex')
}

/**
 * Remove the only fields the Hub owns (`hub-agent-*` entries of `allowedAgentPresets`) so a
 * shipped base can be hashed and compared with an effective config.
 * @param {any} config a preset config
 * @returns {any} detached config without Hub-owned allowlist entries
 */
export function shippedConfigFor(config) {
  return stripHubFields(config)
}

/**
 * Split a plugin specifier into its package root and optional subpath so a bare package name can
 * never be mistaken for a prunable subpath row.
 * @param {unknown} name a plugin `name`
 * @returns {{ root: string, subpath: string | null }} `subpath` is null for bare package names
 */
export function splitPackageSpec(name) {
  if (typeof name !== 'string' || name === '') return { root: String(name ?? ''), subpath: null }
  if (name.startsWith('@')) {
    const parts = name.split('/')
    if (parts.length < 2) return { root: name, subpath: null }
    return { root: parts.slice(0, 2).join('/'), subpath: parts.length > 2 ? parts.slice(2).join('/') : null }
  }
  const index = name.indexOf('/')
  if (index < 0) return { root: name, subpath: null }
  return { root: name.slice(0, index), subpath: name.slice(index + 1) }
}

/**
 * Parse the authoritative activation diagnostics published by `agentPresets.list()` into the
 * broken rows per preset identity. Only `<entryId> (<moduleName>): never started` lines are
 * returned: they mean the row's module failed to import and can never start. Softer lines in the
 * same diagnostic — `: waiting for <services>` (mounted but pending), or a mount-detail message
 * that does not end in `never started` — must never trigger a prune.
 * @param {unknown} roster `agentPresets.list()` (an array, or an object with `presets`)
 * @returns {Map<string, Array<{ id?: string, name: string }>>} broken rows keyed by preset identity
 */
export function parseBrokenPresetRows(roster) {
  const broken = new Map()
  const rows = Array.isArray(roster)
    ? roster
    : (Array.isArray(roster?.presets) ? roster.presets : [])
  for (const row of rows) {
    if (!isPlainObject(row)) continue
    // A diagnostic that cannot be addressed to a preset is unusable: the mirror looks rows up by
    // identity, so keeping it would only inflate the log/count and invite a future lookup bug.
    const identity = typeof row.id === 'string' && row.id !== '' ? row.id : undefined
    if (identity === undefined) continue
    const diagnostic = typeof row.broken === 'string' ? row.broken : ''
    if (diagnostic === '') continue
    const parsed = broken.get(identity) ?? []
    const seen = new Set(parsed.map(entry => `${entry.id ?? ''}\u0000${entry.name}`))
    for (const line of diagnostic.split('\n')) {
      const neverStarted = parseNeverStartedLine(line.trim())
      if (neverStarted === undefined) continue
      const key = `${neverStarted.id ?? ''}\u0000${neverStarted.name}`
      if (seen.has(key)) continue
      seen.add(key)
      parsed.push(neverStarted)
    }
    if (parsed.length > 0) broken.set(identity, parsed)
  }
  return broken
}

/** Parse one `<entryId> (<moduleName>): never started` diagnostic line, or undefined. */
function parseNeverStartedLine(line) {
  const suffix = ': never started'
  if (typeof line !== 'string' || !line.endsWith(suffix)) return undefined
  const head = line.slice(0, -suffix.length)
  if (!head.endsWith(')')) return undefined
  const open = head.lastIndexOf(' (')
  if (open <= 0) return undefined
  const id = head.slice(0, open)
  const name = head.slice(open + 2, -1)
  if (name === '') return undefined
  return { ...(id === 'undefined' || id === '' ? {} : { id }), name }
}

/**
 * Remove plugin rows that are provably unloadable.
 *
 * The primary signal is the authoritative `never started` diagnostic (`brokenRows`): a row it
 * names, absent from the shipped base, is removed without asking the resolver anything. The
 * secondary signal is package resolution: a subpath row whose package root resolves but whose
 * full specifier does not. A bare package name is never pruned unless the oracle names it, and a
 * row the shipped base still declares is never pruned. When neither signal can answer, nothing is
 * pruned and the row is reported as unverified instead, so a user row is never deleted on a guess.
 * @param {readonly any[]} plugins current plugin rows (group rows are walked)
 * @param {(specifier: string) => (string | false | 'unknown' | undefined)} [resolveSpec]
 * @param {{ basePlugins?: readonly any[], brokenRows?: ReadonlyArray<{ id?: string, name: string }> }} [options]
 *   shipped rows that are protected, and the `never started` rows named for this preset.
 * @returns {{ plugins: any[], pruned: Array<{ id?: string, name: string }>,
 *   unverified: Array<{ id?: string, name: string }>, changed: boolean }}
 */
export function pruneUnresolvableRows(plugins, resolveSpec, options = {}) {
  if (!Array.isArray(plugins)) return { plugins, pruned: [], unverified: [], changed: false }
  const baseKeys = new Set(flattenRows(options.basePlugins).map(rowKey))
  const brokenRows = Array.isArray(options.brokenRows) ? options.brokenRows : []
  const pruned = []
  const unverified = []
  const walk = rows => {
    const kept = []
    let changed = false
    for (const row of rows) {
      if (!isPlainObject(row)) {
        kept.push(row)
        continue
      }
      let next = row
      if (Array.isArray(row.config)) {
        const nested = walk(row.config)
        if (nested.changed) {
          next = { ...row, config: nested.plugins }
          changed = true
        }
      }
      const verdict = classifyRow(next, resolveSpec, baseKeys, brokenRows)
      if (verdict === 'prune') {
        pruned.push({ id: next.id, name: next.name })
        changed = true
        continue
      }
      if (verdict === 'unverified') unverified.push({ id: next.id, name: next.name })
      kept.push(next)
    }
    return { plugins: kept, changed }
  }
  const result = walk(plugins)
  return {
    plugins: result.changed ? result.plugins : plugins,
    pruned,
    unverified,
    changed: result.changed,
  }
}

/**
 * Rebuild the managed spawn rows from the shipped row config of the same row, keeping the row's
 * id, position, and other row fields, and merging the Hub allowlist into `allowedAgentPresets`.
 * `modelSelectionSettings` is switched on only when the shipped row itself declares it; it is
 * never invented.
 * @param {readonly any[]} plugins current plugin rows
 * @param {readonly any[]} shippedPlugins the shipped base rows
 * @param {{ presetIds: string[], exposeModels?: boolean }} options
 * @returns {{ plugins: any[], changed: boolean }}
 */
export function applyHubSpawnRows(plugins, shippedPlugins, { presetIds, exposeModels = false }) {
  if (!Array.isArray(plugins)) return { plugins, changed: false }
  const shipped = flattenRows(shippedPlugins).filter(isSpawnRow)
  const walk = rows => {
    let changed = false
    const next = rows.map(row => {
      if (!isPlainObject(row)) return row
      if (Array.isArray(row.config)) {
        const nested = walk(row.config)
        if (!nested.changed) return row
        changed = true
        return { ...row, config: nested.plugins }
      }
      if (!isSpawnRow(row)) return row
      const source = shipped.find(candidate => candidate.id !== undefined && candidate.id === row.id)
        ?? shipped.find(candidate => candidate.config.provider === row.config.provider
          && candidate.config.toolName === row.config.toolName)
      if (source === undefined) return row
      const config = allowlistConfig(cloneConfig(source.config), mergePresetAllowlist(row.config.allowedAgentPresets, presetIds))
      if (exposeModels && Object.hasOwn(config, 'modelSelectionSettings')) config.modelSelectionSettings = true
      if (stableHash(config) === stableHash(row.config)) return row
      changed = true
      return { ...row, config }
    })
    return { plugins: changed ? next : rows, changed }
  }
  return walk(plugins)
}

/**
 * Decide what one official preset needs on this sync.
 *
 * The preset is owned by the Hub only when a recorded baseline says so and the effective config
 * still equals the recorded write; a clean preset without any baseline may become owned. Every
 * other preset is foreign: the Hub repairs only its managed spawn rows and provably unloadable
 * rows, and marks the preset foreign so a later upgrade never rebases (and never clobbers) it.
 * @param {object} input
 * @param {string} [input.presetId] preset entry id (used by callers for reporting)
 * @param {any} [input.inherited] shipped preset config for this entry
 * @param {any} [input.current] effective config the Loader composes for this entry
 * @param {any} [input.override] explicit profile-layer config (`{}` when there is none)
 * @param {{ baseHash?: string, writtenHash?: string, foreign?: boolean }} [input.baseline]
 * @param {string[]} [input.presetIds] registered `hub-agent-*` ids
 * @param {boolean} [input.exposeModels] only switches on `modelSelectionSettings` when the shipped
 *   row declares it; it is never invented
 * @param {Array<{ id?: string, name: string }>} [input.brokenRows] authoritative rows this preset
 *   reported as `never started`; they are pruned without consulting the resolver unless the
 *   shipped base still declares them (then they are reported as unverified).
 * @param {(specifier: string) => (string | false | 'unknown' | undefined)} [input.resolveSpec]
 * @returns {{ action: 'none' | 'write' | 'skip-foreign' | 'prune', next: any,
 *   pruned: Array<{ id?: string, name: string }>, unverified: Array<{ id?: string, name: string }>,
 *   rebased: boolean, foreign: boolean, baseline: object | undefined }}
 */
export function planPresetSync({
  presetId,
  inherited,
  current,
  override,
  baseline,
  presetIds = [],
  exposeModels = false,
  brokenRows = [],
  resolveSpec,
} = {}) {
  void presetId
  const base = isPlainObject(inherited) ? cloneConfig(inherited) : {}
  const explicitOverride = isPlainObject(override) && Object.keys(override).length > 0
  const effective = isPlainObject(current)
    ? cloneConfig(current)
    : cloneConfig(explicitOverride ? override : base)
  const hasOverride = explicitOverride
    || stableHash(stripHubFields(effective)) !== stableHash(stripHubFields(base))
  const baseHash = stableHash(shippedConfigFor(base))
  const currentHash = stableHash(effective)
  const record = normalizeBaseline(baseline)
  const owned = record !== undefined && record.foreign !== true
  const rebaseable = owned && record.writtenHash === currentHash
  const baseChanged = owned && record.baseHash !== baseHash
  /** Broken rows the oracle names but the shipped base still declares: report, never remove. */
  const protectedBroken = (config) => (Array.isArray(brokenRows) && brokenRows.length > 0
    ? pruneUnresolvableRows(config?.plugins, resolveSpec, { basePlugins: base.plugins, brokenRows }).unverified
    : [])

  const ownedWrite = (next, { rebased = false, unverified = [] } = {}) => ({
    action: 'write',
    next,
    pruned: [],
    unverified,
    rebased,
    foreign: false,
    baseline: { version: BASELINE_VERSION, baseHash, writtenHash: stableHash(next), foreign: false },
  })

  // A baseline the Hub owns, still equal to the last write: re-derive it from the shipped base.
  // That is the upgrade rebase — new shipped defaults take effect and stale rows disappear.
  if (rebaseable) {
    const next = desiredPresetConfig(base, { presetIds, exposeModels })
    if (stableHash(next) === currentHash) {
      return {
        action: 'none',
        next: cloneConfig(effective),
        pruned: [],
        unverified: protectedBroken(effective),
        rebased: false,
        foreign: false,
        // A Hub-written override stays owned so the next upgrade can rebase it again.
        baseline: hasOverride
          ? { version: BASELINE_VERSION, baseHash, writtenHash: currentHash, foreign: false }
          : undefined,
      }
    }
    return ownedWrite(next, { rebased: baseChanged, unverified: protectedBroken(effective) })
  }

  // Nothing belongs to the user yet: the Hub may take ownership of the clean preset outright.
  if (record === undefined && !hasOverride) {
    const next = desiredPresetConfig(base, { presetIds, exposeModels })
    if (stableHash(next) === currentHash) {
      // Already clean with nothing to persist: no write and no baseline is needed, because the
      // shipped base alone still produces this config on the next upgrade.
      return {
        action: 'none',
        next: cloneConfig(effective),
        pruned: [],
        unverified: protectedBroken(effective),
        rebased: false,
        foreign: false,
        baseline: undefined,
      }
    }
    return ownedWrite(next, { unverified: protectedBroken(effective) })
  }

  // Foreign or unknown provenance: never rebase. Adopt + repair only when the Hub's own
  // fingerprint proves an earlier mirror wrote this preset; otherwise stay additive.
  const adopt = record === undefined && hasOverride && hasHubFingerprint(effective)
  const pruned = pruneUnresolvableRows(effective.plugins, resolveSpec, { basePlugins: base.plugins, brokenRows })
  const managed = adopt
    ? applyHubSpawnRows(pruned.plugins, base.plugins, { presetIds, exposeModels })
    : addAllowlistRows(pruned.plugins, { presetIds })
  const changed = pruned.changed || managed.changed
  if (!changed) return foreignClean(record, baseHash, effective, pruned.unverified)
  const next = { ...cloneConfig(effective), plugins: managed.plugins }
  return {
    action: pruned.pruned.length > 0 ? 'prune' : 'write',
    next,
    pruned: pruned.pruned,
    unverified: pruned.unverified,
    rebased: false,
    foreign: true,
    baseline: { version: BASELINE_VERSION, baseHash, writtenHash: stableHash(next), foreign: true },
  }
}

/** The clean desired config: shipped base plus the Hub-owned allowlists only. */
function desiredPresetConfig(base, { presetIds, exposeModels = false }) {
  const clone = cloneConfig(base)
  if (!isPlainObject(clone) || !Array.isArray(clone.plugins)) return clone
  const patched = patchPresetRows(clone.plugins, { presetIds, exposeModels })
  return patched.changed ? { ...clone, plugins: patched.plugins } : clone
}

/** Refresh only the Hub allowlist on managed spawn rows; every other field stays as it was. */
function addAllowlistRows(plugins, { presetIds }) {
  if (!Array.isArray(plugins)) return { plugins, changed: false }
  const walk = rows => {
    let changed = false
    const next = rows.map(row => {
      if (!isPlainObject(row)) return row
      if (Array.isArray(row.config)) {
        const nested = walk(row.config)
        if (!nested.changed) return row
        changed = true
        return { ...row, config: nested.plugins }
      }
      if (!isSpawnRow(row)) return row
      const config = allowlistConfig(cloneConfig(row.config), mergePresetAllowlist(row.config.allowedAgentPresets, presetIds))
      if (stableHash(config) === stableHash(row.config)) return row
      changed = true
      return { ...row, config }
    })
    return { plugins: changed ? next : rows, changed }
  }
  return walk(plugins)
}

/** Set or clear `allowedAgentPresets` (the official schema rejects a present-but-empty list). */
function allowlistConfig(config, allow) {
  if (allow.length === 0) delete config.allowedAgentPresets
  else config.allowedAgentPresets = allow
  return config
}

/** A no-write outcome; a foreign preset is recorded once so a later upgrade never rebases it. */
function foreignClean(record, baseHash, effective, unverified = []) {
  const alreadyForeign = record?.foreign === true
  return {
    action: alreadyForeign ? 'none' : 'skip-foreign',
    next: cloneConfig(effective),
    pruned: [],
    unverified,
    rebased: false,
    foreign: true,
    baseline: alreadyForeign
      ? undefined
      : { version: BASELINE_VERSION, baseHash, writtenHash: stableHash(effective), foreign: true },
  }
}

function classifyRow(row, resolveSpec, baseKeys, brokenRows) {
  if (typeof row.name !== 'string' || row.name === '') return 'keep'
  // The authoritative oracle wins: a never-started row cannot load regardless of what any
  // resolver says. The shipped base is still protected (a base row is a shipped-preset problem,
  // reported rather than silently removed).
  if (matchesBrokenRow(row, brokenRows)) return baseKeys.has(rowKey(row)) ? 'unverified' : 'prune'
  const { root, subpath } = splitPackageSpec(row.name)
  if (subpath === null) return 'keep'
  if (baseKeys.has(rowKey(row))) return 'keep'
  if (typeof resolveSpec !== 'function') return 'unverified'
  if (resolveVerdict(resolveSpec, root) !== 'resolved') return 'unverified'
  const fullVerdict = resolveVerdict(resolveSpec, row.name)
  // `unknown` means the deciding anchor could not answer (e.g. only a fallback anchor resolves
  // the subpath) — that is ambiguity, never proof, so the row is reported instead of deleted.
  if (fullVerdict === 'unknown') return 'unverified'
  return fullVerdict === 'resolved' ? 'keep' : 'prune'
}

/**
 * Whether a `never started` diagnostic names this row. The name must match; when the diagnostic
 * also carries an entry id it must match too, so a same-name sibling (spawn vs fork) is safe.
 */
function matchesBrokenRow(row, brokenRows) {
  if (!Array.isArray(brokenRows)) return false
  return brokenRows.some((broken) => {
    if (!isPlainObject(broken) || broken.name !== row.name) return false
    if (broken.id === undefined) return true
    if (row.id === undefined) return false
    return String(broken.id) === String(row.id)
  })
}

/**
 * Tri-state reading of one injected resolution call. `false` is the resolver's explicit
 * "provably missing"; a non-empty resolved path is "resolved"; anything else — `'unknown'`,
 * `undefined`, `null`, or a throw — is ambiguous and must never justify a prune.
 * @returns {'resolved' | 'missing' | 'unknown'}
 */
function resolveVerdict(resolveSpec, specifier) {
  try {
    const result = resolveSpec(specifier)
    if (result === false) return 'missing'
    if (typeof result === 'string' && result !== '' && result !== 'unknown') return 'resolved'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Whether a row is one the Hub may rewrite: an in-process spawn delegation row. */
function isSpawnRow(row) {
  return isPlainObject(row)
    && row.name === SUBAGENT_TOOL_PACKAGE
    && isPlainObject(row.config)
    && row.config.provider === 'spawn'
}

/** Remove `hub-agent-*` ids from spawn rows so ownership can be compared without the Hub layer. */
function stripHubFields(config) {
  const clone = cloneConfig(config)
  if (!isPlainObject(clone) || !Array.isArray(clone.plugins)) return clone
  return { ...clone, plugins: stripHubRows(clone.plugins) }
}

function stripHubRows(rows) {
  return rows.map(row => {
    if (!isPlainObject(row)) return row
    if (Array.isArray(row.config)) return { ...row, config: stripHubRows(row.config) }
    if (!isSpawnRow(row) || !Array.isArray(row.config.allowedAgentPresets)) return row
    const allow = row.config.allowedAgentPresets.filter(id => typeof id === 'string' && !id.startsWith(OWN_PRESET_PREFIX))
    const config = { ...row.config }
    if (allow.length === 0) delete config.allowedAgentPresets
    else config.allowedAgentPresets = allow
    return { ...row, config }
  })
}

/** Whether the preset already carries the Hub's own allowlist fingerprint. */
function hasHubFingerprint(config) {
  for (const row of flattenRows(config?.plugins)) {
    if (!isSpawnRow(row) || !Array.isArray(row.config.allowedAgentPresets)) continue
    if (row.config.allowedAgentPresets.some(id => typeof id === 'string' && id.startsWith(OWN_PRESET_PREFIX))) return true
  }
  return false
}

function normalizeBaseline(record) {
  if (!isPlainObject(record)) return undefined
  if (typeof record.baseHash !== 'string' || typeof record.writtenHash !== 'string') return undefined
  return {
    version: BASELINE_VERSION,
    baseHash: record.baseHash,
    writtenHash: record.writtenHash,
    foreign: record.foreign === true,
  }
}

function flattenRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.flatMap(row => (isPlainObject(row) && Array.isArray(row.config))
    ? [row, ...flattenRows(row.config)]
    : [row])
}

function rowKey(row) {
  return `${row?.id ?? ''}\u0000${row?.name ?? ''}`
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cloneConfig(value) {
  try {
    return structuredClone(value)
  } catch {
    return value
  }
}
