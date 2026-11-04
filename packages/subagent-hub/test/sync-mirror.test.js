// Regression seam: one refused mirror step must not suppress the others, and the report has to
// name the step that failed so the card can stop saying "unconfirmed" and the log can be read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import SubagentHub from '../lib/index.js'
import { MODEL_SETTINGS_ID, MODEL_SETTINGS_NAME, PRESET_PLUGIN, SUBAGENT_TOOL_PACKAGE } from '../lib/official-settings.js'

const route = { id: 'a', provider: 'p', model: 'm', tags: [] }

const spawnRow = () => ({
  id: 'tool-subagent',
  name: SUBAGENT_TOOL_PACKAGE,
  config: { provider: 'spawn', toolName: 'subagent' },
})

const presetEntry = (id = 'preset-standard') => ({
  options: { id, name: PRESET_PLUGIN, config: { id: 'standard', plugins: [spawnRow()] } },
})

const modelEntry = (id = MODEL_SETTINGS_ID) => ({
  options: { id, name: MODEL_SETTINGS_NAME, config: { enabled: false, allowedModels: [] } },
})

/** A config editor whose writes are decided per entry id. */
function fakeEditor(entries, decide) {
  const writes = []
  return {
    writes,
    entries: () => entries,
    configuration: () => entries.map(entry => ({ entry, inherited: { ...entry.options.config }, override: {} })),
    edit: async (entry, change) => {
      const outcome = decide(entry)
      if (outcome !== undefined) throw new Error(outcome)
      writes.push({ id: entry.options.id, config: change(entry.options.config, entry.options.config) })
    },
  }
}

const host = (editor, warnings = []) => ({
  ctx: { get: name => (name === 'configEditor' ? editor : undefined), logger: { warn: text => warnings.push(text), info: () => {} } },
  config: { manageOfficialSettings: true },
  catalog: { routes: new Map([[route.id, route]]) },
  registered: new Map([['hub-agent-reviewer', () => {}]]),
  modelSettingsEntry: SubagentHub.prototype.modelSettingsEntry,
  syncOfficialSettings: SubagentHub.prototype.syncOfficialSettings,
})

test('a refused model-settings write is reported and the preset rows are still mirrored', async () => {
  const editor = fakeEditor([presetEntry(), modelEntry()], entry => (entry.options.id === MODEL_SETTINGS_ID ? 'reload refused' : undefined))
  const warnings = []
  const report = await SubagentHub.prototype.syncOfficialSettings.call(host(editor, warnings))

  assert.equal(report.modelSettings, 'failed')
  assert.deepEqual(report.failures.map(item => item.step), ['model-settings'])
  assert.match(report.failures[0].message, /reload refused/)
  assert.deepEqual(report.presets, ['preset-standard'], 'the allowlist row must not depend on the model row')
  assert.deepEqual(editor.writes.map(write => write.id), ['preset-standard'])
  assert.ok(warnings.some(text => /official settings mirror .* failures=\[model-settings: reload refused\]/.test(text)),
    'the host log has to name the failing step')
})

test('a transient refusal is retried once before it is reported', async () => {
  let attempts = 0
  const editor = fakeEditor([modelEntry()], () => (++attempts === 1 ? 'transaction clash' : undefined))
  const report = await SubagentHub.prototype.syncOfficialSettings.call(host(editor))

  assert.equal(attempts, 2)
  assert.equal(report.modelSettings, 'written')
  assert.deepEqual(report.failures, [])
  assert.deepEqual(editor.writes[0].config.allowedModels, [{ provider: 'p', model: 'm' }])
})

test('a renamed row is still found by its declared plugin name', async () => {
  const editor = fakeEditor([modelEntry('renamed-model-settings')], () => undefined)
  const report = await SubagentHub.prototype.syncOfficialSettings.call(host(editor))

  assert.equal(report.modelSettings, 'written')
  assert.deepEqual(editor.writes.map(write => write.id), ['renamed-model-settings'])
})

test('a profile with no model row reports it instead of silently leaving the mirror half written', async () => {
  const editor = fakeEditor([presetEntry()], () => undefined)
  const report = await SubagentHub.prototype.syncOfficialSettings.call(host(editor))

  assert.equal(report.modelSettings, 'missing-entry')
  assert.deepEqual(report.failures.map(item => item.step), ['model-settings'])
  assert.deepEqual(report.presets, ['preset-standard'])
})

test('turning the mirror off writes nothing at all', async () => {
  const editor = fakeEditor([presetEntry(), modelEntry()], () => undefined)
  const report = await SubagentHub.prototype.syncOfficialSettings.call({
    ...host(editor),
    config: { manageOfficialSettings: false },
  })

  assert.deepEqual(report, { enabled: false })
  assert.deepEqual(editor.writes, [])
})
