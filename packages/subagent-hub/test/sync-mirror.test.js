// Regression seam: one refused mirror step must not suppress the others, and the report has to
// name the step that failed so the card can stop saying "unconfirmed" and the log can be read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveModelSettingsEntry, syncOfficialMirror } from '../lib/mirror.js'
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

/** A config editor whose writes are decided per row id; `decide` returns an error message or undefined. */
function fakeEditor(entries, decide = () => undefined) {
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

const mirror = (editor, extra = {}) => syncOfficialMirror({
  editor,
  routes: new Map([[route.id, route]]),
  presetIds: ['hub-agent-reviewer'],
  wait: async () => {},
  ...extra,
})

test('the model row is resolved by id, then by its declared plugin name', () => {
  assert.equal(resolveModelSettingsEntry([modelEntry()]).options.id, MODEL_SETTINGS_ID)
  assert.equal(resolveModelSettingsEntry([presetEntry(), modelEntry('renamed')]).options.id, 'renamed')
  assert.equal(resolveModelSettingsEntry([presetEntry()]), undefined)
})

test('a refused model-settings write is reported and the preset rows are still mirrored', async () => {
  const editor = fakeEditor([presetEntry(), modelEntry()],
    entry => (entry.options.id === MODEL_SETTINGS_ID ? 'reload refused' : undefined))
  const warnings = []
  const report = await mirror(editor, { warn: message => warnings.push(message) })

  assert.equal(report.modelSettings, 'failed')
  assert.deepEqual(report.failures.map(item => item.step), ['model-settings'])
  assert.match(report.failures[0].message, /reload refused/)
  assert.deepEqual(report.presets, ['preset-standard'], 'the allowlist row must not depend on the model row')
  assert.deepEqual(editor.writes.map(write => write.id), ['preset-standard'])
  assert.ok(warnings.some(text => /step "model-settings" failed: reload refused/.test(text)),
    'each failure is reported when it happens')
})

test('a transient refusal is retried once before it is reported', async () => {
  let attempts = 0
  const editor = fakeEditor([modelEntry()], () => (++attempts === 1 ? 'transaction clash' : undefined))
  const report = await mirror(editor)

  assert.equal(attempts, 2)
  assert.equal(report.modelSettings, 'written')
  assert.deepEqual(report.failures, [])
  assert.deepEqual(editor.writes[0].config.allowedModels, [{ provider: 'p', model: 'm' }])
})

test('a renamed row is still written by its declared plugin name', async () => {
  const editor = fakeEditor([modelEntry('renamed-model-settings')])
  const report = await mirror(editor)

  assert.equal(report.modelSettings, 'written')
  assert.deepEqual(editor.writes.map(write => write.id), ['renamed-model-settings'])
})

test('a profile with no model row reports it instead of silently leaving the mirror half written', async () => {
  const editor = fakeEditor([presetEntry()])
  const report = await mirror(editor)

  assert.equal(report.modelSettings, 'missing-entry')
  assert.deepEqual(report.failures.map(item => item.step), ['model-settings'])
  assert.deepEqual(report.presets, ['preset-standard'])
})

test('rows that already match are not rewritten', async () => {
  const inSync = { options: { id: MODEL_SETTINGS_ID, name: MODEL_SETTINGS_NAME, config: { enabled: true, allowedModels: [{ provider: 'p', model: 'm' }] } } }
  const preset = presetEntry()
  preset.options.config.plugins[0].config.allowedAgentPresets = ['hub-agent-reviewer']
  preset.options.config.plugins[0].config.modelSelectionSettings = true
  const editor = fakeEditor([inSync, preset])
  const report = await mirror(editor)

  assert.equal(report.modelSettings, 'unchanged')
  assert.deepEqual(report.presets, [])
  assert.deepEqual(editor.writes, [], 'a second sync must not reload the profile again')
})
