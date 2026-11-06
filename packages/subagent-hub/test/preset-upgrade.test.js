// Upgrade-scenario regression matrix for the official-preset mirror.
//
// The reported incident: a `manageOfficialSettings` write persisted the ENTIRE composed preset
// into the profile patch. After DSH upgraded, the frozen snapshot kept a row the installed
// package no longer exports (`@deepseek-ai/dsh-tool-subagent-control/list-agents`) and kept
// overriding the newer shipped spawn-row defaults, so every new session failed to compose the
// preset with `agent-preset/invalid: ... never started`.
//
// These tests pin the repair, upgrade-rebase, idempotency, and user-edit-safety contract through
// a fake profile that behaves like @deepseek-ai/dsh-config-editor: `configuration()` reports the
// shipped (inherited) layer apart from the persisted override, and `edit(entry, change)` persists
// the COMPLETE config returned by `change`, deleting the override when it deep-equals inherited.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { syncOfficialMirror } from '../lib/mirror.js'
import { planPresetSync, pruneUnresolvableRows, splitPackageSpec, stableHash } from '../lib/preset-migration.js'
import { MODEL_SETTINGS_ID, MODEL_SETTINGS_NAME, mergePresetAllowlist } from '../lib/official-settings.js'
import { deriveAgentPreset } from '../lib/presets.js'

const PRESET_PLUGIN = '@deepseek-ai/dsh-agent-preset'
const SUBAGENT_TOOL = '@deepseek-ai/dsh-tool-subagent'
const CONTROL_PACKAGE = '@deepseek-ai/dsh-tool-subagent-control'
const LEGACY_ROW = { id: 'tool-subagent-list-agents', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' }
const HUB_IDS = ['hub-agent-reviewer', 'hub-agent-planner']
const ROUTE = { id: 'cheap', provider: 'gateway', model: 'free-model' }

const clone = value => structuredClone(value)

/**
 * The installed package layout from the incident: the package roots resolve, but
 * `@deepseek-ai/dsh-tool-subagent-control` exports no `./list-agents` subpath.
 */
function installedResolver(specifier) {
  if (specifier === CONTROL_PACKAGE) return '/installed/dsh-tool-subagent-control/lib/index.js'
  if (specifier === SUBAGENT_TOOL) return '/installed/dsh-tool-subagent/lib/index.js'
  if (specifier === LEGACY_ROW.name) return false
  return 'unknown'
}

/**
 * A fake profile that mimics `@deepseek-ai/dsh-config-editor`.
 * @param {Array<{ id: string, name: string, inherited: any, override?: any }>} rows
 * @param {{ resolveSpec?: (specifier: string) => unknown, baselineStore?: object,
 *   decide?: (row: object, attempt: number) => string | undefined, events?: string[] }} [options]
 */
function fakeProfile(rows, { resolveSpec = installedResolver, baselineStore = fakeBaseline(), decide, events = [] } = {}) {
  const state = new Map(rows.map(row => [row.id, {
    entry: { options: { id: row.id, name: row.name, config: clone(row.override ?? row.inherited) } },
    inherited: clone(row.inherited),
    override: row.override === undefined ? undefined : clone(row.override),
    attempts: 0,
  }]))
  const writes = []
  const find = entry => [...state.values()].find(row => row.entry === entry)
  const refresh = (row) => {
    row.entry.options.config = clone(row.override ?? row.inherited)
  }
  return {
    writes,
    events,
    baselineStore,
    resolveSpec,
    entries: () => [...state.values()].map(row => row.entry),
    configuration: () => [...state.values()].map(row => ({
      entry: row.entry,
      inherited: clone(row.inherited),
      override: row.override === undefined ? {} : clone(row.override),
    })),
    edit: async (entry, change) => {
      const row = find(entry)
      if (row === undefined) throw new Error('Configuration entry is no longer available')
      row.attempts += 1
      const refusal = decide?.(row, row.attempts)
      if (refusal !== undefined) throw new Error(refusal)
      const current = clone(row.entry.options.config ?? {})
      const next = change(current, clone(row.inherited))
      writes.push({ id: row.entry.options.id, next: clone(next) })
      row.override = isDeepStrictEqual(next, row.inherited) ? undefined : clone(next)
      refresh(row)
      events.push(`edit:${row.entry.options.id}`)
    },
    overrideOf: id => clone(state.get(id).override),
    effectiveOf: id => clone(state.get(id).entry.options.config),
    inheritedOf: id => clone(state.get(id).inherited),
    attemptsOf: id => state.get(id).attempts,
    /** Simulate a user editing the persisted override outside the Hub. */
    userEdit: (id, change) => {
      const row = state.get(id)
      row.override = clone(change(clone(row.entry.options.config ?? {})))
      refresh(row)
    },
  }
}

/** A blind async baseline store: the mirror owns the record shape, the tests own the persistence. */
function fakeBaseline(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    async get(presetId) {
      return data.has(presetId) ? clone(data.get(presetId)) : undefined
    },
    async set(presetId, record) {
      data.set(presetId, clone(record))
    },
    snapshot() {
      return Object.fromEntries([...data].map(([id, record]) => [id, clone(record)]))
    },
  }
}

const presetRow = (inherited, override, id = 'preset-standard') => ({ id, name: PRESET_PLUGIN, inherited, override })
const modelRow = override => ({
  id: MODEL_SETTINGS_ID,
  name: MODEL_SETTINGS_NAME,
  inherited: { enabled: false, allowedModels: [] },
  override,
})

/** The shipped `standard` preset shape trimmed to the rows that matter (see standard.patch.yml). */
function shippedPreset({ spawn, extraRows = [] }) {
  return {
    id: 'standard',
    order: 1,
    plugins: [
      { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'You are a coding agent powered by the {{model}} model.' } },
      { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs', config: { applyPatch: false } },
      ...extraRows,
      {
        id: 'delegation',
        name: 'cordis:group',
        group: true,
        isolate: { workflowEngine: true },
        config: [
          { id: 'tool-subagent-control', name: CONTROL_PACKAGE },
          { id: 'tool-subagent', name: SUBAGENT_TOOL, config: { ...spawn } },
          { id: 'tool-subagent-fork', name: SUBAGENT_TOOL, config: { provider: 'fork', toolName: 'subagent_fork' } },
          { id: 'workflow-ptc', name: '@deepseek-ai/dsh-workflow-ptc', config: { provider: 'spawn' } },
          { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow' },
        ],
      },
      { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
    ],
  }
}

/** Current shipped base: spawn row declares modelSelection/modelDiscovery and no list-agents row. */
const shippedV2 = () => shippedPreset({
  spawn: { provider: 'spawn', toolName: 'subagent', modelSelection: true, modelDiscovery: true },
  extraRows: [{ id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo', config: { allowParallelInProgress: true } }],
})

/** Older shipped base: only `modelSelectionSettings` on the spawn row and a since-removed row. */
const shippedV1 = () => shippedPreset({
  spawn: { provider: 'spawn', toolName: 'subagent', modelSelectionSettings: true },
  extraRows: [{ id: 'tool-legacy-goal', name: '@deepseek-ai/dsh-tool-legacy-goal' }],
})

/** The real incident: a frozen older snapshot with the removed list-agents row and an allowlist. */
function legacyIncident() {
  const override = shippedV1()
  const delegation = delegationOf(override)
  delegation.config.splice(1, 0, clone(LEGACY_ROW))
  delegation.config.find(row => row.id === 'tool-subagent').config.allowedAgentPresets = ['hub-agent-reviewer']
  return override
}

/** The shipped base plus the only fields the Hub owns. */
function desired(config, { presetIds = HUB_IDS } = {}) {
  const next = clone(config)
  spawnOf(next).config.allowedAgentPresets = [...presetIds]
  return next
}

const delegationOf = config => config.plugins.find(row => row.id === 'delegation')
const spawnOf = config => delegationOf(config).config.find(row => row.id === 'tool-subagent')

/** Rebuild a managed spawn row the way the mirror does: shipped fields + current filtered allowlist. */
const managedSpawn = (shipped, allowed) => ({
  ...clone(shipped),
  ...(allowed === undefined ? {} : { allowedAgentPresets: [...allowed] }),
})

function runSync(profile, options = {}) {
  return syncOfficialMirror({
    editor: profile,
    routes: options.routes ?? new Map(),
    presetIds: options.presetIds ?? HUB_IDS,
    baselineStore: options.baselineStore ?? profile.baselineStore,
    resolveSpec: options.resolveSpec ?? profile.resolveSpec,
    wait: async () => {},
    warn: options.warn ?? (() => {}),
    ...(options.backup === undefined ? {} : { backup: options.backup }),
  })
}

/** Assert no row in a preset points at a package subpath that the installed tree cannot load. */
function assertComposable(config, resolveSpec) {
  const walk = (rows) => {
    for (const row of rows) {
      if (Array.isArray(row.config)) {
        walk(row.config)
        continue
      }
      if (typeof row.name !== 'string') continue
      const { root, subpath } = splitPackageSpec(row.name)
      if (subpath === null) continue
      assert.ok(resolveSpec(root), `package root "${root}" of row "${row.id}" must resolve`)
      assert.equal(resolveSpec(row.name), false,
        `a row that stays in the preset must be loadable, but "${row.name}" does not resolve`)
    }
  }
  walk(config.plugins)
}

// ---------------------------------------------------------------------------
// 1. The real incident: stale unloadable row + frozen spawn row must be repaired.
// ---------------------------------------------------------------------------

test('the incident preset loses the unloadable list-agents row and regains the shipped spawn fields', async () => {
  const profile = fakeProfile([presetRow(shippedV2(), legacyIncident())])
  const report = await runSync(profile)

  const written = profile.overrideOf('preset-standard')
  assert.notEqual(written, undefined, 'the preset override must be rewritten so a new session can compose')

  const delegation = delegationOf(written)
  assert.equal(delegation.config.some(row => row.name === LEGACY_ROW.name), false,
    'the row backed by a missing package export must be removed')
  assert.equal(delegation.config.some(row => row.id === LEGACY_ROW.id), false)
  assert.deepEqual(spawnOf(written).config, {
    provider: 'spawn',
    toolName: 'subagent',
    modelSelection: true,
    modelDiscovery: true,
    allowedAgentPresets: [...HUB_IDS],
  }, 'the managed spawn row must be the current shipped row plus the hub allowlist')

  assert.equal(delegation.config.filter(row => row.name === CONTROL_PACKAGE).length, 1,
    'list_agents is registered by the control package itself, not by a separate row')
  assertComposable(written, installedResolver)

  assert.equal(profile.writes.length, 1, 'one config-editor edit is enough')
  assert.deepEqual(profile.writes.map(write => write.id), ['preset-standard'])
  assert.deepEqual(report.failures, [])
  assert.deepEqual(report.pruned, ['preset-standard'])
  assert.deepEqual(report.presetActions.map(entry => entry.action), ['prune'])
  assert.equal(profile.baselineStore.snapshot()['preset-standard'].foreign, true,
    'a legacy preset is recorded as foreign')
})

test('the other shipped rows survive the incident repair untouched', async () => {
  const profile = fakeProfile([presetRow(shippedV2(), legacyIncident())])
  await runSync(profile)

  const written = profile.overrideOf('preset-standard')
  const persona = written.plugins.find(row => row.id === 'persona')
  const toolFs = written.plugins.find(row => row.id === 'tool-fs')
  assert.deepEqual(persona, { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'You are a coding agent powered by the {{model}} model.' } })
  assert.deepEqual(toolFs, { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs', config: { applyPatch: false } })
  assert.equal(delegationOf(written).isolate.workflowEngine, true)
})

// ---------------------------------------------------------------------------
// 2. Idempotency: one write then zero; no stale row can come back on restart or re-sync.
// ---------------------------------------------------------------------------

test('a second sync performs zero writes', async () => {
  const profile = fakeProfile([presetRow(shippedV2(), legacyIncident())])
  await runSync(profile)
  const afterFirst = profile.writes.length

  const report = await runSync(profile)

  assert.equal(profile.writes.length, afterFirst, 'an unchanged profile must not be reloaded again')
  assert.deepEqual(report.presets, [])
})

test('a restart with a persisted override and a reloaded baseline writes nothing', async () => {
  const first = fakeProfile([presetRow(shippedV2(), legacyIncident())])
  await runSync(first)

  const restarted = fakeProfile([presetRow(shippedV2(), first.overrideOf('preset-standard'))],
    { baselineStore: fakeBaseline(first.baselineStore.snapshot()) })
  await runSync(restarted)

  assert.deepEqual(restarted.writes, [], 'a fresh process must recognise the baseline it wrote before the restart')
})

test('a later hub config change refreshes only the allowlist and never resurrects the removed row', async () => {
  const profile = fakeProfile([presetRow(shippedV2(), legacyIncident())])
  await runSync(profile, { presetIds: ['hub-agent-reviewer'] })
  const afterRepair = profile.writes.length

  await runSync(profile, { presetIds: HUB_IDS })

  assert.equal(profile.writes.length, afterRepair + 1, 'the changed agent list is one allowlist write')
  const written = profile.overrideOf('preset-standard')
  assert.deepEqual(spawnOf(written).config.allowedAgentPresets, HUB_IDS)
  assert.equal(delegationOf(written).config.some(row => row.name === LEGACY_ROW.name), false,
    'a re-sync from a persisted override must never re-introduce the stale row')
})

// ---------------------------------------------------------------------------
// 3. Upgrade rebase: an override the Hub wrote is rebased onto the new shipped base.
// ---------------------------------------------------------------------------

test('a shipped base upgrade rebases an override the hub wrote onto the new defaults', async () => {
  const baselineStore = fakeBaseline()
  const before = fakeProfile([presetRow(shippedV1(), undefined)], { baselineStore })
  await runSync(before)
  assert.notEqual(before.overrideOf('preset-standard'), undefined)
  assert.equal(baselineStore.snapshot()['preset-standard'].foreign, false,
    'a clean preset written from the shipped base is owned by the hub')
  // A second sync under the same base is a pure no-op; ownership must survive it.
  const confirmation = await runSync(before)
  assert.equal(before.writes.length, 1, 'the confirmation sync must not write')
  assert.deepEqual(confirmation.presetActions.map(entry => entry.action), ['none'])

  const after = fakeProfile([presetRow(shippedV2(), before.overrideOf('preset-standard'))], { baselineStore })
  const report = await runSync(after)

  const rebased = after.overrideOf('preset-standard')
  assert.deepEqual(rebased, desired(shippedV2()),
    'an override still equal to the Hub write is re-derived from the new shipped base plus hub fields')
  assert.equal(rebased.plugins.some(row => row.name === '@deepseek-ai/dsh-tool-legacy-goal'), false,
    'no row that only the old shipped base declared may survive the rebase')
  assert.equal(rebased.plugins.some(row => row.id === 'tool-todo'), true)
  assert.deepEqual(report.rebased, ['preset-standard'])
  assert.deepEqual(report.presetActions.map(entry => entry.action), ['write'])
  assert.equal(after.writes.length, 1)
})

test('the rebase drops a modelSelectionSettings key the new shipped base no longer declares', async () => {
  const baselineStore = fakeBaseline()
  const before = fakeProfile([presetRow(shippedV1(), undefined)], { baselineStore })
  await runSync(before)
  await runSync(before)
  assert.equal(spawnOf(before.overrideOf('preset-standard')).config.modelSelectionSettings, true,
    'the older base declared modelSelectionSettings and the Hub preserved it')

  const after = fakeProfile([presetRow(shippedV2(), before.overrideOf('preset-standard'))], { baselineStore })
  await runSync(after)

  const spawn = spawnOf(after.overrideOf('preset-standard'))
  assert.equal(spawn.config.modelSelectionSettings, undefined,
    'the new base does not declare it, so it must not be invented or kept')
  assert.equal(spawn.config.modelDiscovery, true)
})

// ---------------------------------------------------------------------------
// 4. User edits win: never rebase or clobber a preset the user changed.
// ---------------------------------------------------------------------------

test('a user edit is preserved while the allowlist is refreshed additively', async () => {
  const baselineStore = fakeBaseline()
  const profile = fakeProfile([presetRow(shippedV1(), undefined)], { baselineStore })
  await runSync(profile)

  profile.userEdit('preset-standard', (config) => {
    config.plugins.find(row => row.id === 'tool-fs').config.applyPatch = true
    return config
  })

  const report = await runSync(profile, { presetIds: ['hub-agent-planner'] })

  const written = profile.overrideOf('preset-standard')
  assert.equal(written.plugins.find(row => row.id === 'tool-fs').config.applyPatch, true,
    'an unrelated user edit must never be clobbered by the mirror')
  assert.deepEqual(spawnOf(written).config.allowedAgentPresets, ['hub-agent-planner'],
    'the hub-owned allowlist is still refreshed')
  assert.equal(written.plugins.find(row => row.id === 'persona').config.prefix,
    'You are a coding agent powered by the {{model}} model.', 'other user-visible rows stay intact')
  assert.deepEqual(report.rebased, [])
  assert.deepEqual(report.presetActions.map(entry => entry.action), ['write'])
})

test('a user-edited preset is marked foreign, so a later shipped upgrade does not rebase it', async () => {
  const baselineStore = fakeBaseline()
  const profile = fakeProfile([presetRow(shippedV1(), undefined)], { baselineStore })
  await runSync(profile)

  profile.userEdit('preset-standard', (config) => {
    config.plugins.find(row => row.id === 'tool-fs').config.applyPatch = true
    return config
  })
  // Re-sync on the same base records that this preset is user-owned from now on.
  await runSync(profile)

  const upgraded = fakeProfile([presetRow(shippedV2(), profile.overrideOf('preset-standard'))], { baselineStore })
  const report = await runSync(upgraded)

  const kept = upgraded.overrideOf('preset-standard')
  assert.equal(kept.plugins.find(row => row.id === 'tool-fs').config.applyPatch, true,
    'the user edit survives the upgrade')
  assert.equal(kept.plugins.some(row => row.name === '@deepseek-ai/dsh-tool-legacy-goal'), true,
    'a foreign preset is not rebased onto the new shipped base')
  assert.equal(kept.plugins.some(row => row.id === 'tool-todo'), false,
    'a row only the new shipped base declares is not forced onto a user-owned preset')
  assert.deepEqual(report.rebased, [])
  assert.deepEqual(upgraded.writes, [], 'a foreign preset needs no rewrite on the upgrade')
})

// ---------------------------------------------------------------------------
// 5. No write when the effective preset already equals shipped + hub fields.
// ---------------------------------------------------------------------------

test('an already-synced preset produces zero edits and zero backups', async () => {
  const profile = fakeProfile([presetRow(shippedV2(), desired(shippedV2()))])
  let backups = 0
  const report = await runSync(profile, { backup: async () => { backups += 1 } })

  assert.deepEqual(profile.writes, [])
  assert.deepEqual(report.presets, [])
  assert.equal(backups, 0, 'a no-op sync must not touch the profile file')
})

// ---------------------------------------------------------------------------
// 6. Safety: pruning must be provable, retries are bounded, refusals leave no partial content.
// ---------------------------------------------------------------------------

test('a bare package row is never pruned, even when the package cannot be resolved here', async () => {
  const profile = fakeProfile([presetRow(shippedV2(), desired(shippedV2()))], {
    resolveSpec: () => false,
  })
  await runSync(profile)

  assert.equal(delegationOf(profile.effectiveOf('preset-standard')).config.some(row => row.name === CONTROL_PACKAGE), true)
})

test('an unresolvable package root disables pruning instead of emptying the preset', async () => {
  const profile = fakeProfile([presetRow(shippedV2(), legacyIncident())], {
    resolveSpec: () => 'unknown',
  })
  await runSync(profile)

  assert.equal(delegationOf(profile.overrideOf('preset-standard')).config.some(row => row.name === LEGACY_ROW.name), true,
    'when resolution is unknown, only the narrow mounted-root fallback may prune')
})

test('an unverifiable subpath row is reported, never removed, and never written', async () => {
  const override = shippedV2()
  delegationOf(override).config.splice(1, 0, clone(LEGACY_ROW))
  spawnOf(override).config.allowedAgentPresets = [...HUB_IDS]
  const profile = fakeProfile([presetRow(shippedV2(), override)], { resolveSpec: () => 'unknown' })
  const warnings = []

  const report = await runSync(profile, { warn: message => warnings.push(message) })

  assert.deepEqual(profile.writes, [], 'without resolution the mirror must not touch the file')
  assert.deepEqual(report.unverified, [{ presetId: 'preset-standard', rowId: LEGACY_ROW.id, name: LEGACY_ROW.name }],
    'the row the mirror cannot prove unloadable is reported for a human instead of guessed away')
  assert.ok(warnings.some(text => text.includes('preset-standard') && text.includes(LEGACY_ROW.name)),
    'the warning line names the preset and the row')
})

test('the timestamped backup runs once, immediately before the first mutating write', async () => {
  const events = []
  const profile = fakeProfile([
    presetRow(shippedV2(), legacyIncident(), 'preset-standard'),
    presetRow(shippedV2(), legacyIncident(), 'preset-ptc'),
  ], { events })
  let backups = 0

  await runSync(profile, { backup: async () => { backups += 1; events.push('backup') } })

  assert.equal(backups, 1)
  assert.deepEqual(events, ['backup', 'edit:preset-standard', 'edit:preset-ptc'])
})

test('no backup is created when nothing needs a write', async () => {
  const profile = fakeProfile([presetRow(shippedV2(), desired(shippedV2()))])
  let backups = 0

  await runSync(profile, { backup: async () => { backups += 1 } })

  assert.equal(backups, 0)
})

test('a transiently refused preset write is retried once and reported as successful', async () => {
  const profile = fakeProfile([presetRow(shippedV2(), legacyIncident())], {
    decide: (row, attempt) => (attempt === 1 ? 'transaction clash' : undefined),
  })
  const report = await runSync(profile)

  assert.equal(profile.attemptsOf('preset-standard'), 2)
  assert.notEqual(profile.overrideOf('preset-standard'), undefined)
  assert.deepEqual(report.presets, ['preset-standard'])
  assert.deepEqual(report.failures, [])
})

test('a permanently refused preset write leaves the override untouched and reports the failure', async () => {
  const original = legacyIncident()
  const profile = fakeProfile([presetRow(shippedV2(), original)], {
    decide: () => 'reload refused',
  })
  const report = await runSync(profile)

  assert.deepEqual(profile.overrideOf('preset-standard'), original,
    'a refused edit must not leave partial content behind')
  assert.deepEqual(profile.writes, [])
  assert.equal(report.failures.length, 1)
  assert.match(report.failures[0].step, /preset-standard/)
  assert.match(report.failures[0].message, /reload refused/)
})

test('one refused preset write does not suppress the other preset rows', async () => {
  const profile = fakeProfile([
    presetRow(shippedV2(), legacyIncident(), 'preset-standard'),
    presetRow(shippedV2(), legacyIncident(), 'preset-ptc'),
  ], {
    decide: row => (row.entry.options.id === 'preset-standard' ? 'reload refused' : undefined),
  })
  const report = await runSync(profile)

  assert.deepEqual(report.presets, ['preset-ptc'])
  assert.notEqual(profile.overrideOf('preset-ptc'), undefined)
  assert.equal(report.failures.length, 1)
  assert.match(report.failures[0].step, /preset-standard/)
})

// ---------------------------------------------------------------------------
// 7. Compatibility and feature guards.
// ---------------------------------------------------------------------------

test('allowedAgentPresets keeps foreign ids, drops stale hub ids, and adds the registered ones', async () => {
  const override = legacyIncident()
  spawnOf(override).config.allowedAgentPresets = ['other-plugin-agent', 'hub-agent-removed']
  const profile = fakeProfile([presetRow(shippedV2(), override)])
  await runSync(profile)

  assert.deepEqual(spawnOf(profile.overrideOf('preset-standard')).config.allowedAgentPresets,
    ['other-plugin-agent', ...HUB_IDS])
})

test('modelSelectionSettings is never invented on a shipped base that lacks it', async () => {
  const profile = fakeProfile([presetRow(shippedV2(), undefined)])
  await runSync(profile)

  const spawn = spawnOf(profile.overrideOf('preset-standard'))
  assert.equal(spawn.config.modelSelectionSettings, undefined)
  assert.deepEqual(spawn.config.allowedAgentPresets, HUB_IDS)
})

test('a modelSelectionSettings key declared by an older shipped base is preserved', async () => {
  const profile = fakeProfile([presetRow(shippedV1(), undefined)])
  await runSync(profile)

  assert.equal(spawnOf(profile.overrideOf('preset-standard')).config.modelSelectionSettings, true)
})

test('the model-settings row is written once and then stays idempotent', async () => {
  const routes = new Map([[ROUTE.id, ROUTE]])
  const profile = fakeProfile([modelRow(), presetRow(shippedV2(), undefined)])
  await runSync(profile, { routes })
  const afterFirst = profile.writes.length
  assert.deepEqual(profile.overrideOf(MODEL_SETTINGS_ID), {
    enabled: true,
    allowedModels: [{ provider: 'gateway', model: 'free-model' }],
  })

  const report = await runSync(profile, { routes })

  assert.equal(profile.writes.length, afterFirst)
  assert.equal(report.modelSettings, 'unchanged')
})

// ---------------------------------------------------------------------------
// 8. list_agents is unaffected: the control package root is the only row needed.
// ---------------------------------------------------------------------------

test('the mirror treats the bare tool-subagent-control package as valid and never prunes it', async () => {
  const profile = fakeProfile([presetRow(shippedV2(), legacyIncident())])
  await runSync(profile)

  const delegation = delegationOf(profile.overrideOf('preset-standard'))
  assert.equal(delegation.config.some(row => row.name === CONTROL_PACKAGE), true)
  assert.equal(delegation.config.some(row => row.name === LEGACY_ROW.name), false)
})

// ---------------------------------------------------------------------------
// 9. Pure helpers: hash, spec splitting, pruning, and the sync plan.
// ---------------------------------------------------------------------------

test('stableHash ignores key order but not content', () => {
  assert.equal(typeof stableHash({ a: 1 }), 'string')
  assert.equal(stableHash({ a: 1, b: { c: 2, d: [1, 2] } }), stableHash({ b: { d: [1, 2], c: 2 }, a: 1 }))
  assert.notEqual(stableHash({ a: 1 }), stableHash({ a: 2 }))
})

test('splitPackageSpec separates a package root from a subpath', () => {
  assert.deepEqual(splitPackageSpec('@deepseek-ai/dsh-plugin-manager/tools'),
    { root: '@deepseek-ai/dsh-plugin-manager', subpath: 'tools' })
  assert.deepEqual(splitPackageSpec(CONTROL_PACKAGE), { root: CONTROL_PACKAGE, subpath: null })
  assert.deepEqual(splitPackageSpec('cordis:group'), { root: 'cordis:group', subpath: null })
  assert.deepEqual(splitPackageSpec(LEGACY_ROW.name),
    { root: CONTROL_PACKAGE, subpath: 'list-agents' })
})

test('pruneUnresolvableRows removes only a provably missing subpath', () => {
  const result = pruneUnresolvableRows([
    { id: 'control', name: CONTROL_PACKAGE },
    clone(LEGACY_ROW),
  ], installedResolver)

  assert.deepEqual(result.pruned, [{ id: LEGACY_ROW.id, name: LEGACY_ROW.name }])
  assert.deepEqual(result.plugins.map(row => row.id), ['control'])
  assert.equal(result.changed, true)
})

test('pruneUnresolvableRows keeps rows whose package root cannot be resolved', () => {
  const plugins = [clone(LEGACY_ROW)]
  const result = pruneUnresolvableRows(plugins, () => 'unknown')
  assert.deepEqual(result.pruned, [])
  assert.equal(result.changed, false)
})

test('pruneUnresolvableRows never prunes a bare package name', () => {
  const plugins = [{ id: 'control', name: CONTROL_PACKAGE }, { id: 'subagent', name: SUBAGENT_TOOL }]
  const result = pruneUnresolvableRows(plugins, () => false)
  assert.deepEqual(result.pruned, [])
  assert.equal(result.plugins, plugins)
})

test('pruneUnresolvableRows never prunes a row the shipped base still declares', () => {
  const result = pruneUnresolvableRows([clone(LEGACY_ROW)], installedResolver, {
    basePlugins: [clone(LEGACY_ROW)],
  })
  assert.deepEqual(result.pruned, [])
})

test('pruneUnresolvableRows recurses into group rows', () => {
  const result = pruneUnresolvableRows([
    { id: 'delegation', name: 'cordis:group', group: true, config: [clone(LEGACY_ROW), { id: 'control', name: CONTROL_PACKAGE }] },
  ], installedResolver)

  assert.deepEqual(result.pruned.map(row => row.id), [LEGACY_ROW.id])
  assert.deepEqual(result.plugins[0].config.map(row => row.id), ['control'])
})

test('planPresetSync reports prune for the legacy incident and rebuilds the managed spawn row', () => {
  const result = planPresetSync({
    presetId: 'preset-standard',
    inherited: shippedV2(),
    current: legacyIncident(),
    override: legacyIncident(),
    baseline: undefined,
    presetIds: HUB_IDS,
    exposeModels: false,
    resolveSpec: installedResolver,
  })

  assert.equal(result.action, 'prune')
  assert.deepEqual(result.pruned.map(row => row.id), [LEGACY_ROW.id])
  assert.deepEqual(spawnOf(result.next).config, {
    provider: 'spawn',
    toolName: 'subagent',
    modelSelection: true,
    modelDiscovery: true,
    allowedAgentPresets: [...HUB_IDS],
  })
  assert.equal(result.foreign, true)
  assert.equal(result.rebased, false)
  assert.equal(result.baseline.foreign, true)
})

test('planPresetSync reports skip-foreign when a foreign preset needs no hub change', () => {
  const current = desired(shippedV2())
  const result = planPresetSync({
    presetId: 'preset-standard',
    inherited: shippedV2(),
    current,
    override: current,
    baseline: undefined,
    presetIds: HUB_IDS,
    exposeModels: false,
    resolveSpec: installedResolver,
  })

  assert.equal(result.action, 'skip-foreign')
  assert.deepEqual(result.next, current, 'a foreign preset is never rewritten by a no-op sync')
  assert.equal(result.foreign, true)
})

test('planPresetSync rebases a baseline-owned preset when the shipped base changed', () => {
  const current = desired(shippedV1())
  const baseline = {
    version: 1,
    baseHash: stableHash(shippedV1()),
    writtenHash: stableHash(current),
    foreign: false,
  }
  const result = planPresetSync({
    presetId: 'preset-standard',
    inherited: shippedV2(),
    current,
    override: current,
    baseline,
    presetIds: HUB_IDS,
    exposeModels: false,
    resolveSpec: installedResolver,
  })

  assert.equal(result.action, 'write')
  assert.equal(result.rebased, true)
  assert.deepEqual(result.next, desired(shippedV2()))
  assert.equal(result.baseline.foreign, false)
})

// ---------------------------------------------------------------------------
// 10. Named-preset / allowlist behavior is unchanged at the pure level.
// ---------------------------------------------------------------------------

test('a named agent preset still drops every official delegation row, including the v2 spawn row', () => {
  const base = shippedV2().plugins
  const { plugins, dropped } = deriveAgentPreset(base, 'Review code.')
  assert.deepEqual(dropped, ['tool-subagent', 'tool-subagent-fork'])
  const delegation = plugins.find(row => row.id === 'delegation')
  assert.deepEqual(delegation.config.map(row => row.id), ['tool-subagent-control', 'workflow-ptc', 'tool-workflow'])
  assert.equal(delegation.config.some(row => row.name === SUBAGENT_TOOL), false)
  assert.equal(base.find(row => row.id === 'delegation').config.length, 5, 'the shipped input is not mutated')
})

test('mergePresetAllowlist keeps foreign ids in order and replaces every hub id', () => {
  assert.deepEqual(mergePresetAllowlist(['z-foreign', 'hub-agent-old', 'a-foreign'], ['hub-agent-reviewer']),
    ['z-foreign', 'a-foreign', 'hub-agent-reviewer'])
  assert.deepEqual(mergePresetAllowlist(['hub-agent-old'], []), [])
})
