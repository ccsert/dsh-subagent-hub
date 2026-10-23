import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCatalog } from '../lib/catalog.js'
import { promptSection } from '../lib/prompt.js'

const catalog = buildCatalog({
  routes: [
    { id: 'flash', provider: 'deepseek-official', model: 'deepseek-flash', tags: ['fast', 'cheap'], note: 'DeepSeek Flash' },
    { id: 'pro', provider: 'deepseek-official', model: 'deepseek-v4-pro', tags: ['reasoning'] },
  ],
  agents: [
    { id: 'reviewer', description: 'Reviews a diff and reports findings', routes: ['pro'], needs: ['reasoning'] },
    { id: 'generalist', description: 'Handles any task' },
  ],
})
const both = { agentPreset: true, model: true }

test('the section says which named agent and which model serve which purpose', () => {
  const text = promptSection({ catalog, params: both })
  assert.match(text, /## Choosing a subagent/)
  assert.match(text, /`hub-agent-reviewer` — Reviews a diff and reports findings/)
  assert.match(text, /tags: reasoning/)
  assert.match(text, /routes: pro = deepseek-official\/deepseek-v4-pro \[reasoning\]/)
  assert.match(text, /`hub-agent-generalist` — Handles any task/)
  assert.match(text, /`deepseek-official\/deepseek-flash` — tags: fast, cheap; DeepSeek Flash/)
  assert.match(text, /`deepseek-official\/deepseek-v4-pro` — tags: reasoning/)
  assert.match(text, /Capability tags: `cheap`, `fast`, `reasoning`\./)
  assert.match(text, /Pass `agent_preset` to choose a named agent/)
  assert.match(text, /must be one of that agent's routes/)
})

test('guidance adapts to the parameters the official tool actually exposes', () => {
  assert.match(promptSection({ catalog, params: { agentPreset: true, model: false } }), /does not expose child `provider`\/`model`/)
  assert.match(promptSection({ catalog, params: { agentPreset: false, model: true } }), /No named-agent parameter is exposed/)
  assert.match(promptSection({ catalog, params: { agentPreset: false, model: false } }), /set `manageOfficialSettings: true`/)
})

test('an empty catalog produces no section', () => {
  assert.equal(promptSection({ catalog: buildCatalog({ routes: [], agents: [] }), params: both }), '')
  assert.equal(promptSection({ catalog: buildCatalog({ routes: [], agents: [] }), params: { agentPreset: false, model: false } }), '')
})

test('configuration problems are disclosed to the model instead of vanishing', () => {
  const broken = buildCatalog({
    routes: [{ id: 'flash', provider: 'p', model: 'flash' }],
    agents: [{ id: 'ghost', description: 'Broken', routes: ['nope'] }],
  })
  assert.match(promptSection({ catalog: broken, params: both }), /Ignored configuration problems: agent "ghost" names unknown route: nope/)
})
