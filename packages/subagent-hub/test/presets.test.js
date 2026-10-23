import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveAgentPreset } from '../lib/presets.js'

// Shape of the shipped `standard` preset, trimmed to the rows that matter.
const standard = () => [
  { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'You are a coding agent.' } },
  { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
  {
    id: 'delegation',
    name: 'cordis:group',
    group: true,
    isolate: { workflowEngine: true },
    config: [
      { id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
      { id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', modelSelectionSettings: true } },
      { id: 'tool-subagent-fork', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'fork' } },
      { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow' },
    ],
  },
]

test('named agent preset drops delegation rows and appends instructions to the persona', () => {
  const base = standard()
  const { plugins, dropped } = deriveAgentPreset(base, 'Review code. Report findings only.')
  assert.deepEqual(dropped, ['tool-subagent', 'tool-subagent-fork'])
  assert.equal(plugins[0].config.prefix, 'You are a coding agent.\n\nReview code. Report findings only.')
  const group = plugins.find(row => row.id === 'delegation')
  assert.deepEqual(group.config.map(row => row.id), ['tool-subagent-control', 'tool-workflow'])
  assert.deepEqual(group.isolate, { workflowEngine: true })
  assert.equal(base[2].config.length, 4, 'input rows are not mutated')
})

test('a base without a persona row gains one prefixed with the instructions', () => {
  const { plugins } = deriveAgentPreset([{ id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' }], 'Be terse.')
  assert.deepEqual(plugins[0], { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'Be terse.' } })
})

test('empty instructions keep the base persona unchanged', () => {
  const { plugins } = deriveAgentPreset(standard(), '')
  assert.equal(plugins[0].config.prefix, 'You are a coding agent.')
})
