// Hardening matrix for the AUTHORITATIVE broken-preset oracle.
//
// After the first fix landed, a real install still failed to self-heal: `lib/sidecar.js`'s default
// resolver searches fallback anchors (a stale dev `node_modules/@deepseek-ai` symlink to an old
// CLI), so it can return a valid path for `@deepseek-ai/dsh-tool-subagent-control/list-agents` even
// though the installed package has no such export. Resolver-only repair is therefore not enough.
//
// The runtime's own `agentPresets.list()` is the oracle: a failed mount reports
// `<entryId> (<moduleName>): never started`, while a mounted-but-pending row reports
// `<id> (<name>): waiting for <services>` and must never be pruned. These tests pin the parser and
// the mirror behavior for both signals, including the resolver trap.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { syncOfficialMirror } from '../lib/mirror.js'
import { parseBrokenPresetRows } from '../lib/preset-migration.js'

const PRESET_PLUGIN = '@deepseek-ai/dsh-agent-preset'
const SUBAGENT_TOOL = '@deepseek-ai/dsh-tool-subagent'
const CONTROL_PACKAGE = '@deepseek-ai/dsh-tool-subagent-control'
const DEAD_ROW = { id: 'tool-subagent-list-agents', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' }
const HUB_IDS = ['hub-agent-reviewer', 'hub-agent-planner']

const clone = value => structuredClone(value)

/**
 * A fake profile that mimics @deepseek-ai/dsh-config-editor: `configuration()` reports the shipped
 * layer apart from the override, and `edit(entry, change)` persists the COMPLETE config returned by
 * `change` (deleting the override when it deep-equals inherited).
 */
function fakeProfile(rows, { resolveSpec = () => 'unknown', baselineStore = fakeBaseline() } = {}) {
  const state = new Map(rows.map(row => [row.id, {
    entry: { options: { id: row.id, name: row.name, config: clone(row.override ?? row.inherited) } },
    inherited: clone(row.inherited),
    override: row.override === undefined ? undefined : clone(row.override),
  }]))
  const writes = []
  const find = entry => [...state.values()].find(row => row.entry === entry)
  const refresh = (row) => {
    row.entry.options.config = clone(row.override ?? row.inherited)
  }
  return {
    writes,
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
      const current = clone(row.entry.options.config ?? {})
      const next = change(current, clone(row.inherited))
      writes.push({ id: row.entry.options.id, next: clone(next) })
      row.override = isDeepStrictEqual(next, row.inherited) ? undefined : clone(next)
      refresh(row)
    },
    overrideOf: id => clone(state.get(id).override),
    effectiveOf: id => clone(state.get(id).entry.options.config),
  }
}

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

/** The shipped `standard` preset shape trimmed to the rows that matter. */
function shippedBase({ includeDead = false } = {}) {
  const config = {
    id: 'standard',
    order: 1,
    plugins: [
      { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'You are a coding agent.' } },
      { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs', config: { applyPatch: false } },
      {
        id: 'delegation',
        name: 'cordis:group',
        group: true,
        isolate: { workflowEngine: true },
        config: [
          { id: 'tool-subagent-control', name: CONTROL_PACKAGE },
          ...(includeDead ? [clone(DEAD_ROW)] : []),
          {
            id: 'tool-subagent',
            name: SUBAGENT_TOOL,
            config: { provider: 'spawn', toolName: 'subagent', modelSelection: true, modelDiscovery: true },
          },
          { id: 'tool-subagent-fork', name: SUBAGENT_TOOL, config: { provider: 'fork', toolName: 'subagent_fork' } },
        ],
      },
      { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
    ],
  }
  return config
}

/** A preset override the Hub already manages, optionally still carrying the dead row. */
function managedOverride({ includeDead = true } = {}) {
  const config = shippedBase()
  if (includeDead) delegationOf(config).config.splice(1, 0, clone(DEAD_ROW))
  spawnOf(config).config.allowedAgentPresets = [...HUB_IDS]
  return config
}

const presetRow = (inherited, override, id = 'preset-standard') => ({ id, name: PRESET_PLUGIN, inherited, override })
const delegationOf = config => config.plugins.find(row => row.id === 'delegation')
const spawnOf = config => delegationOf(config).config.find(row => row.id === 'tool-subagent')
const hasDeadRow = config => delegationOf(config).config.some(row => row.name === DEAD_ROW.name)

/** The oracle map the mirror receives after `agentPresets.list()` is parsed. */
const oracle = rows => new Map([['standard', clone(rows)]])

function runSync(profile, options = {}) {
  return syncOfficialMirror({
    editor: profile,
    routes: options.routes ?? new Map(),
    presetIds: options.presetIds ?? HUB_IDS,
    baselineStore: options.baselineStore ?? profile.baselineStore,
    resolveSpec: 'resolveSpec' in options ? options.resolveSpec : profile.resolveSpec,
    brokenPresets: options.brokenPresets,
    wait: async () => {},
    warn: options.warn ?? (() => {}),
  })
}

// ---------------------------------------------------------------------------
// 1. The resolver trap: the oracle must win over a resolver that says "loadable".
// ---------------------------------------------------------------------------

test('the broken oracle prunes a dead row that the resolver certifies as loadable', async () => {
  const profile = fakeProfile([presetRow(shippedBase(), managedOverride())], {
    // The stale dev symlink makes BOTH the package root and the full subpath resolve.
    resolveSpec: () => '/stale/dev-symlink/node_modules/index.js',
  })
  const brokenPresets = parseBrokenPresetRows([
    { id: 'standard', broken: `${DEAD_ROW.id} (${DEAD_ROW.name}): never started` },
  ])

  const report = await runSync(profile, { brokenPresets })

  assert.equal(hasDeadRow(profile.overrideOf('preset-standard')), false,
    'the runtime diagnostic is authoritative even when the resolver finds a stale path')
  assert.equal(profile.writes.length, 1)
  assert.deepEqual(report.pruned, ['preset-standard'])
  assert.deepEqual(report.unverified, [], 'a row the oracle proves broken is not left unverified')
  assert.deepEqual(report.presetActions.map(entry => entry.action), ['prune'])
  assert.deepEqual(report.broken, [{ preset: 'preset-standard', identity: 'standard', rows: [{ id: DEAD_ROW.id, name: DEAD_ROW.name }] }],
    'the parsed oracle findings are reported for the log line')
})

test('a preset without config.id is matched by stripping the preset- prefix', async () => {
  const inherited = shippedBase()
  delete inherited.id
  const override = managedOverride()
  delete override.id
  const profile = fakeProfile([presetRow(inherited, override)], {
    resolveSpec: () => '/stale/dev-symlink/node_modules/index.js',
  })
  const brokenPresets = parseBrokenPresetRows([
    { id: 'standard', broken: `${DEAD_ROW.id} (${DEAD_ROW.name}): never started` },
  ])

  await runSync(profile, { brokenPresets })

  assert.equal(hasDeadRow(profile.overrideOf('preset-standard')), false,
    'the oracle key is matched through the preset identity when config.id is absent')
})

// ---------------------------------------------------------------------------
// 2. A row the shipped base still declares must never be pruned by the oracle.
// ---------------------------------------------------------------------------

test('the broken oracle never prunes a row the shipped base still declares', async () => {
  const inherited = shippedBase({ includeDead: true })
  const profile = fakeProfile([presetRow(inherited, managedOverride({ includeDead: true }))], {
    resolveSpec: () => '/stale/dev-symlink/node_modules/index.js',
  })
  const brokenPresets = oracle([{ id: DEAD_ROW.id, name: DEAD_ROW.name }])

  const report = await runSync(profile, { brokenPresets })

  assert.equal(hasDeadRow(profile.overrideOf('preset-standard')), true,
    'removing a row the shipped base still wants would break the shipped preset')
  assert.deepEqual(profile.writes, [], 'otherwise-unchanged preset must not be rewritten')
  assert.deepEqual(report.unverified, [{ presetId: 'preset-standard', rowId: DEAD_ROW.id, name: DEAD_ROW.name }],
    'a base-declared broken row is reported for a human instead of being removed')
})

test('a broken line with a different row id never prunes a same-name row', async () => {
  const profile = fakeProfile([presetRow(shippedBase(), managedOverride())], {
    resolveSpec: () => 'unknown',
  })
  const brokenPresets = oracle([{ id: 'tool-subagent-fork', name: DEAD_ROW.name }])

  const report = await runSync(profile, { brokenPresets })

  assert.equal(hasDeadRow(profile.overrideOf('preset-standard')), true,
    'the oracle row must match both name and row id before anything is removed')
  assert.deepEqual(profile.writes, [])
  assert.deepEqual(report.unverified, [{ presetId: 'preset-standard', rowId: DEAD_ROW.id, name: DEAD_ROW.name }])
})

test('the oracle may prune a broken bare package row the shipped base no longer declares', async () => {
  const bareRow = { id: 'tool-old-web', name: '@deepseek-ai/dsh-tool-web' }
  const override = shippedBase()
  delegationOf(override).config.splice(1, 0, clone(bareRow))
  spawnOf(override).config.allowedAgentPresets = [...HUB_IDS]
  const profile = fakeProfile([presetRow(shippedBase(), override)], { resolveSpec: () => 'unknown' })
  const brokenPresets = oracle([{ id: bareRow.id, name: bareRow.name }])

  await runSync(profile, { brokenPresets })

  assert.equal(delegationOf(profile.overrideOf('preset-standard')).config.some(row => row.name === bareRow.name), false,
    'runtime proof beats the heuristic that only subpath rows can be dead')
})

// ---------------------------------------------------------------------------
// 3. `parseBrokenPresetRows`: mixed roster, identity keys, tolerant shapes.
// ---------------------------------------------------------------------------

test('parseBrokenPresetRows keeps only never-started rows and keys them by preset identity', () => {
  const roster = [
    {
      id: 'standard',
      name: 'Standard',
      order: 1,
      broken: [
        `${DEAD_ROW.id} (${DEAD_ROW.name}): never started`,
        'tool-old (@deepseek-ai/dsh-tool-old): never started',
        `${DEAD_ROW.id} (${DEAD_ROW.name}): never started`,
      ].join('\n'),
    },
    {
      id: 'ptc',
      broken: 'tool-pending (@deepseek-ai/dsh-tool-web): waiting for settings, llm',
    },
    { id: 'cordis', name: 'Cordis' },
    {
      id: 'minimal',
      broken: [
        'undefined (@scope/pkg-z): never started',
        'row-ok (@deepseek-ai/dsh-tool-fs): Cannot find module "x"',
        '- nested cause line',
      ].join('\n'),
    },
  ]

  const parsed = parseBrokenPresetRows(roster)

  assert.deepEqual(parsed.get('standard'), [
    { id: DEAD_ROW.id, name: DEAD_ROW.name },
    { id: 'tool-old', name: '@deepseek-ai/dsh-tool-old' },
  ], 'never-started lines are parsed once each, in order')
  assert.deepEqual(parsed.get('ptc') ?? [], [], 'waiting-for lines are not broken rows')
  assert.deepEqual(parsed.get('cordis') ?? [], [])
  assert.deepEqual(parsed.get('minimal'), [{ name: '@scope/pkg-z' }],
    'a literal "undefined" row id is omitted, and non-never-started lines are ignored')
  assert.equal(parsed.has('preset-standard'), false, 'keys are preset identities, not Loader entry ids')
})

test('parseBrokenPresetRows tolerates unexpected roster shapes without throwing', () => {
  assert.doesNotThrow(() => parseBrokenPresetRows(undefined))
  assert.doesNotThrow(() => parseBrokenPresetRows(null))
  assert.doesNotThrow(() => parseBrokenPresetRows({}))
  assert.doesNotThrow(() => parseBrokenPresetRows([null, { broken: 42 }, { id: 'x', broken: undefined }]))

  const withoutIdentity = parseBrokenPresetRows([
    { id: undefined, broken: 'row-x (@scope/pkg-x): never started' },
    { broken: 'row-y (@scope/pkg-y): never started' },
  ])
  assert.ok(withoutIdentity instanceof Map)
  assert.equal(withoutIdentity.size, 0,
    'a diagnostic without a preset identity cannot be addressed to a preset, so it is dropped')
  assert.equal(withoutIdentity.has(undefined), false, 'no undefined map key is produced')

  const objectForm = parseBrokenPresetRows({
    presets: [{ id: 'standard', broken: 'row-z (@scope/pkg-z): never started' }],
  })
  assert.deepEqual(objectForm.get('standard'), [{ id: 'row-z', name: '@scope/pkg-z' }],
    'the remote-export `{ presets }` shape is accepted too')
})

// ---------------------------------------------------------------------------
// 4. `waiting for` diagnostics never prune.
// ---------------------------------------------------------------------------

test('a waiting-for diagnostic never triggers an oracle prune', async () => {
  const profile = fakeProfile([presetRow(shippedBase(), managedOverride())], {
    resolveSpec: () => 'unknown',
  })
  const brokenPresets = parseBrokenPresetRows([
    { id: 'standard', broken: 'tool-pending (@deepseek-ai/dsh-tool-web): waiting for settings, llm' },
  ])

  const report = await runSync(profile, { brokenPresets })

  assert.equal(hasDeadRow(profile.overrideOf('preset-standard')), true,
    'a pending row activates by itself and must never be removed')
  assert.deepEqual(profile.writes, [])
  assert.deepEqual(report.unverified, [{ presetId: 'preset-standard', rowId: DEAD_ROW.id, name: DEAD_ROW.name }],
    'without a proof the row is only reported')
})

// ---------------------------------------------------------------------------
// 5. Resolver tri-state boundaries: `unknown` is not proof, `false` is.
// ---------------------------------------------------------------------------

test('an ambiguous full-specifier resolution is reported, never pruned', async () => {
  const profile = fakeProfile([presetRow(shippedBase(), managedOverride())], {
    resolveSpec: specifier => (specifier === CONTROL_PACKAGE ? '/installed/control/index.js' : 'unknown'),
  })
  const warnings = []

  const report = await runSync(profile, { warn: message => warnings.push(message) })

  assert.equal(hasDeadRow(profile.overrideOf('preset-standard')), true,
    'the package root resolving says nothing about the subpath; ambiguity is not proof')
  assert.deepEqual(profile.writes, [], 'an ambiguous row must not cause a rewrite')
  assert.deepEqual(report.pruned, [])
  assert.deepEqual(report.unverified, [{ presetId: 'preset-standard', rowId: DEAD_ROW.id, name: DEAD_ROW.name }])
  assert.ok(warnings.some(text => text.includes('preset-standard') && text.includes(DEAD_ROW.name)),
    'the ambiguity is surfaced to the log, not silently ignored')
})

test('a resolver-only provably missing subpath is pruned without the oracle', async () => {
  const profile = fakeProfile([presetRow(shippedBase(), managedOverride())], {
    resolveSpec: specifier => (specifier === CONTROL_PACKAGE ? '/installed/control/index.js' : false),
  })

  const report = await runSync(profile)

  assert.equal(hasDeadRow(profile.overrideOf('preset-standard')), false,
    'root resolves and the full specifier is provably missing, so the row is dead')
  assert.equal(profile.writes.length, 1)
  assert.deepEqual(report.pruned, ['preset-standard'])
  assert.deepEqual(report.unverified, [])
})

// ---------------------------------------------------------------------------
// 6. No oracle + ambiguous resolver: report-only, zero writes.
// ---------------------------------------------------------------------------

test('no oracle and an ambiguous resolver leave the row in place and report it unverified', async () => {
  const profile = fakeProfile([presetRow(shippedBase(), managedOverride())], {
    resolveSpec: () => 'unknown',
  })

  const report = await runSync(profile)

  assert.equal(hasDeadRow(profile.overrideOf('preset-standard')), true)
  assert.deepEqual(profile.writes, [], 'an unprovable row must not cause a rewrite')
  assert.deepEqual(report.unverified, [{ presetId: 'preset-standard', rowId: DEAD_ROW.id, name: DEAD_ROW.name }])
})

// ---------------------------------------------------------------------------
// 6. The oracle needs no resolver at all.
// ---------------------------------------------------------------------------

test('the broken oracle prunes without any resolver at all', async () => {
  const profile = fakeProfile([presetRow(shippedBase(), managedOverride())])
  const brokenPresets = oracle([{ id: DEAD_ROW.id, name: DEAD_ROW.name }])

  const report = await runSync(profile, { brokenPresets, resolveSpec: undefined })

  assert.equal(hasDeadRow(profile.overrideOf('preset-standard')), false,
    'runtime truth alone is enough to repair the preset')
  assert.equal(profile.writes.length, 1)
  assert.deepEqual(report.pruned, ['preset-standard'])
  assert.deepEqual(report.unverified, [])
})

// ---------------------------------------------------------------------------
// 7. Idempotency: one oracle prune, then zero writes forever.
// ---------------------------------------------------------------------------

test('one oracle prune is idempotent across a second sync', async () => {
  const profile = fakeProfile([presetRow(shippedBase(), managedOverride())])
  const brokenPresets = oracle([{ id: DEAD_ROW.id, name: DEAD_ROW.name }])

  await runSync(profile, { brokenPresets, resolveSpec: undefined })
  const afterFirst = profile.writes.length

  const report = await runSync(profile, { brokenPresets, resolveSpec: undefined })

  assert.equal(profile.writes.length, afterFirst, 'a repaired preset must not be reloaded again')
  assert.deepEqual(report.presets, [])
  assert.equal(hasDeadRow(profile.overrideOf('preset-standard')), false,
    'the pruned row must never come back')
})
