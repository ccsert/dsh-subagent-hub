import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MODEL_SETTINGS_ID,
  OWN_PRESET_PREFIX,
  mergePresetAllowlist,
  modelSettingsFor,
  officialSettingsPlan,
  patchPresetRows,
  sameAllowedModels,
} from '../lib/official-settings.js'
import { indexRoutes } from '../lib/router.js'

const { routes } = indexRoutes([
  { id: 'flash', provider: 'deepseek-official', model: 'deepseek-flash' },
  { id: 'pro', provider: 'deepseek-official', model: 'deepseek-v4-pro' },
])

test('the switch is off by default and writes nothing', () => {
  assert.deepEqual(officialSettingsPlan({}, { presetIds: ['hub-agent-reviewer'], routes }), { enabled: false })
  assert.deepEqual(officialSettingsPlan({ manageOfficialSettings: false }, { presetIds: ['hub-agent-reviewer'], routes }), { enabled: false })
})

test('turning the switch on plans the exact allowlists', () => {
  const plan = officialSettingsPlan({ manageOfficialSettings: true }, { presetIds: ['hub-agent-reviewer'], routes })
  assert.deepEqual(plan, {
    enabled: true,
    presetIds: ['hub-agent-reviewer'],
    models: [
      { provider: 'deepseek-official', model: 'deepseek-flash' },
      { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    ],
  })
  assert.deepEqual(modelSettingsFor(routes), { enabled: true, allowedModels: plan.models })
})

test('the preset allowlist keeps foreign ids and replaces our own prefix', () => {
  assert.deepEqual(mergePresetAllowlist(undefined, ['hub-agent-reviewer']), ['hub-agent-reviewer'])
  assert.deepEqual(mergePresetAllowlist(['other-plugin-agent', 'hub-agent-removed'], ['hub-agent-reviewer']), ['other-plugin-agent', 'hub-agent-reviewer'])
  assert.deepEqual(mergePresetAllowlist(['hub-agent-removed'], []), [])
  assert.equal(OWN_PRESET_PREFIX, 'hub-agent-')
})

const plugins = () => [
  { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'x' } },
  {
    id: 'delegation',
    name: 'cordis:group',
    group: true,
    config: [
      { id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', toolName: 'subagent' } },
      { id: 'tool-subagent-fork', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'fork', toolName: 'subagent_fork' } },
    ],
  },
]

test('spawn rows get the allowlist and model selection; fork rows are untouched', () => {
  const { plugins: next, changed } = patchPresetRows(plugins(), { presetIds: ['hub-agent-reviewer'], exposeModels: true })
  assert.equal(changed, true)
  const delegation = next.find(row => row.id === 'delegation')
  assert.deepEqual(delegation.config[0].config, {
    provider: 'spawn', toolName: 'subagent', allowedAgentPresets: ['hub-agent-reviewer'], modelSelectionSettings: true,
  })
  assert.deepEqual(delegation.config[1].config, { provider: 'fork', toolName: 'subagent_fork' })
})

test('a second pass is a no-op and keeps the same array reference', () => {
  const first = patchPresetRows(plugins(), { presetIds: ['hub-agent-reviewer'], exposeModels: true }).plugins
  const second = patchPresetRows(first, { presetIds: ['hub-agent-reviewer'], exposeModels: true })
  assert.equal(second.changed, false)
  assert.equal(second.plugins, first)
})

test('removing every named agent clears only our own allowlist entries', () => {
  const withForeign = plugins()
  withForeign[1].config[0].config.allowedAgentPresets = ['other', 'hub-agent-gone']
  const { plugins: next, changed } = patchPresetRows(withForeign, { presetIds: [], exposeModels: false })
  assert.equal(changed, true)
  assert.deepEqual(next[1].config[0].config.allowedAgentPresets, ['other'])
  assert.equal(next[1].config[0].config.modelSelectionSettings, undefined)
})

test('no named agents and no prior allowlist means no edit', () => {
  const { changed } = patchPresetRows(plugins(), { presetIds: [], exposeModels: false })
  assert.equal(changed, false)
})

test('untouched inputs are not mutated', () => {
  const base = plugins()
  patchPresetRows(base, { presetIds: ['hub-agent-reviewer'], exposeModels: true })
  assert.equal(base[1].config[0].config.allowedAgentPresets, undefined)
  assert.equal(base[1].config[0].config.modelSelectionSettings, undefined)
})

test('sameAllowedModels compares the exact provider/model sequence', () => {
  assert.equal(sameAllowedModels([{ provider: 'p', model: 'm' }], [{ provider: 'p', model: 'm' }]), true)
  assert.equal(sameAllowedModels([{ provider: 'p', model: 'm' }], [{ provider: 'p', model: 'n' }]), false)
  assert.equal(sameAllowedModels(undefined, []), false)
  assert.equal(sameAllowedModels([{ provider: 'p', model: 'm' }], []), false)
  assert.equal(MODEL_SETTINGS_ID, 'subagent-model-selection-settings')
})
