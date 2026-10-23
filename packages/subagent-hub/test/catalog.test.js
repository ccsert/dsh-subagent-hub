import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AGENT_PRESET_PREFIX, buildCatalog, presetIdOf } from '../lib/catalog.js'

const config = (over = {}) => ({
  routes: [
    { id: 'flash', provider: 'p', model: 'flash', tags: ['fast'] },
    { id: 'pro', provider: 'p', model: 'pro', tags: ['reasoning'] },
  ],
  agents: [
    { id: 'reviewer', description: 'Reviews diffs', instructions: 'Report only.', routes: ['pro'] },
    { id: 'scout', description: 'Finds files' },
  ],
  ...over,
})

test('each named agent becomes a stable official preset id', () => {
  const catalog = buildCatalog(config())
  assert.deepEqual(catalog.agents.map(agent => agent.presetId), ['hub-agent-reviewer', 'hub-agent-scout'])
  assert.equal(catalog.byPreset.get('hub-agent-reviewer').description, 'Reviews diffs')
  assert.deepEqual(catalog.problems, [])
  assert.equal(presetIdOf('x'), `${AGENT_PRESET_PREFIX}x`)
})

test('tag catalog covers every configured route', () => {
  assert.deepEqual(buildCatalog(config()).tags, ['fast', 'reasoning'])
})

test('bad definitions and unknown route references are skipped with a problem', () => {
  const catalog = buildCatalog(config({
    routes: [{ id: 'flash', provider: 'p', model: 'flash' }],
    agents: [
      { id: 'ghost', description: 'Names a route that does not exist', routes: ['pro'] },
      { id: 'broken' },
      { id: 'dup', description: 'one' },
      { id: 'dup', description: 'two' },
    ],
  }))
  assert.deepEqual(catalog.agents.map(agent => agent.id), ['dup'])
  assert.equal(catalog.problems.length, 3)
  assert.match(catalog.problems.join('\n'), /agent "ghost" names unknown route: pro/)
  assert.match(catalog.problems.join('\n'), /needs a description/)
  assert.match(catalog.problems.join('\n'), /duplicate agent id "dup"/)
})

test('route problems surface in the same list', () => {
  const catalog = buildCatalog(config({ routes: [{ id: 'a', provider: 'p', model: 'm' }, { id: 'a', provider: 'q', model: 'n' }] }))
  assert.match(catalog.problems.join('\n'), /routes: duplicate route id "a"/)
})
