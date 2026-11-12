import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../../package.json', import.meta.url))
let entry
vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(value) { entry = value } } }, URLSearchParams,
})
const ui = entry.factory(id => id === 'react' ? require('react') : undefined)
const plain = value => JSON.parse(JSON.stringify(value))

test('settings views retain original indexes and never reorder the draft', () => {
  const routes = [
    { _key: 'b', id: 'b', provider: 'q', model: 'second', note: '长名称', tags: ['vision'] },
    { _key: 'a', id: 'a', provider: 'p', model: 'first', note: '快速路线', tags: ['fast'] },
    { _key: 'c', id: 'c', provider: 'q', model: 'third', tags: [] },
  ]
  const groups = [{ id: 'p', name: 'Alpha', models: [{ id: 'first', name: 'A model' }] },
    { id: 'q', name: 'Zeta', models: [{ id: 'second', name: 'B model' }] }]
  const before = JSON.stringify(routes)
  const list = options => plain(ui.settingsRouteRows(routes, groups, options)).map(row => [row.route._key, row.index])
  assert.deepEqual(list({ view: 'name' }), [['a', 1], ['b', 0], ['c', 2]])
  assert.deepEqual(list({ view: 'provider' }), [['a', 1], ['b', 0], ['c', 2]])
  assert.deepEqual(list({ search: '  VISION ' }), [['b', 0]])
  assert.deepEqual(list({ search: '快速' }), [['a', 1]])
  assert.deepEqual(list({ search: 'alpha', provider: 'p' }), [['a', 1]])
  assert.deepEqual(list({ search: 'not found' }), [])
  assert.equal(JSON.stringify(routes), before)
})

test('reorder keeps row identities, fields and references and rejects stale destinations', () => {
  const a = { _key: 'a', id: 'a', routes: ['model-a'] }
  const b = { _key: 'b', id: 'b', routes: ['model-b'] }
  const c = { _key: 'c', id: 'c', routes: [] }
  const original = [a, b, c]
  const moved = ui.moveSettingsRow(original, 'c', 0)
  assert.deepEqual(plain(moved.map(row => row.id)), ['c', 'a', 'b'])
  assert.equal(moved[0], c)
  assert.equal(moved[1], a)
  assert.deepEqual(a.routes, ['model-a'])
  assert.deepEqual(original, [a, b, c])
  assert.equal(ui.moveSettingsRow(original, 'missing', 0), original)
  assert.equal(ui.moveSettingsRow(original, 'a', -1), original)
  assert.equal(ui.moveSettingsRow(original, 'a', 3), original)
  assert.equal(ui.moveSettingsRow(original, 'a', 0), original)
})
