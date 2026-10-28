import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
let entry
vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(value) { entry = value } } },
})
const ui = entry.factory(id => id === 'react' ? React : {})
const plain = value => JSON.parse(JSON.stringify(value))
const route = { provider: 'minimax', model: 'MiniMax-M3.1-Flash' }
const ready = values => ({ state: 'ready', values })
function fixture() {
  return { phase: 'ready', byId: { a: { running: false }, b: { running: false }, c: { running: true } }, projectionsBySession: {
    root: ready({ subagentCatalog: [{ id: 'a', mode: 'one-shot', label: 'Review', createdAt: 100 }, { id: 'b', mode: 'continuable', label: 'Old label' }, { id: 'c', mode: 'one-shot', label: 'Running' }],
      agentTeam: { members: [{ id: 'root', role: 'lead', phase: 'active', name: 'lead' }, { id: 'b', role: 'teammate', phase: 'active', name: 'Builder' }], tasks: [] } }),
    a: ready({ modelSelection: { lastUsed: route, next: { provider: 'next', model: 'planned' } }, subagentTiming: { settledMs: 2500, lastTurnCompleted: true }, tokenUsage: { uncachedInputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 10 } }),
    b: ready({ subagentTiming: { settledMs: 2000, lastTurnCompleted: true } }),
    c: ready({ subagentTiming: { settledMs: 100, active: { since: 1000, through: 2000 } } }),
  } }
}
test('unifies authoritative catalog and roster without duplicates or the lead', () => {
  const data = ui.overviewData('root', fixture(), new Map(), 5000)
  assert.equal(data.rows.length, 3)
  assert.equal(data.rows.find(row => row.id === 'b').name, 'Builder')
  assert.equal(data.rows.find(row => row.id === 'b').kind, 'team')
  assert.equal(data.rows.find(row => row.id === 'b').status, 'inactive')
  assert.equal(data.rows.find(row => row.id === 'a').status, 'completed')
  assert.equal(data.running, 1)
  assert.equal(data.tokenKnown, 1)
  assert.equal(data.tokens, 180)
})
test('actual model and planned model remain separately attributed', () => {
  const { rows } = ui.overviewData('root', fixture(), new Map())
  assert.equal(rows[0].model.last.model, route.model)
  assert.equal(rows[0].model.next.model, 'planned')
  assert.equal(rows[1].model.kind, 'unknown')
})
test('runtime status wins over summary, unknown does not imply completion', () => {
  const state = fixture()
  delete state.byId.a
  const data = ui.overviewData('root', state, new Map([['c', { running: false }]]), 5000)
  assert.equal(data.rows[0].status, 'unknown')
  assert.equal(data.rows[2].status, 'inactive')
  assert.equal(data.rows[2].duration, 1100)
})
test('failed and provisioning teammates override stale running summaries', () => {
  const state = fixture()
  state.projectionsBySession.root.values.agentTeam.members.push({ id: 'c', name: 'Creating', role: 'teammate', phase: 'provisioning' })
  state.projectionsBySession.root.values.agentTeam.members[1].phase = 'failed'
  state.projectionsBySession.root.values.agentTeam.members[1].error = 'Provider unavailable'
  const data = ui.overviewData('root', state, new Map())
  assert.equal(data.rows[1].status, 'failed')
  assert.equal(data.rows[2].status, 'provisioning')
  assert.equal(data.issues[0].message, 'Provider unavailable')
})
test('active time excludes idle gaps and stops at durable cut when inactive', () => {
  const timing = { settledMs: 500, active: { since: 1000, through: 2400 } }
  assert.equal(ui.overviewDuration(timing, true, 6000), 5500)
  assert.equal(ui.overviewDuration(timing, false, 6000), 1900)
  assert.equal(ui.overviewDuration(timing, true, 2000), 1900)
  assert.equal(ui.overviewDuration(undefined, false, 0), undefined)
  assert.equal(ui.overviewDuration({ settledMs: -2 }, false, 0), undefined)
  assert.equal(ui.overviewTime(3601000), '1:00:01')
})
test('incomplete usage remains unknown, explicit zero remains zero', () => {
  assert.equal(ui.overviewTokens({ outputTokens: 1 }), undefined)
  assert.equal(ui.overviewTokens({ uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }), 0)
})
test('global unrelated sessions are never treated as children', () => {
  const state = fixture()
  state.byId.unrelated = { running: true, parentId: 'elsewhere' }
  assert.equal(ui.overviewData('root', state, new Map()).rows.length, 3)
})
test('unknown and external modes cannot synthesize navigable addresses', () => {
  const state = fixture()
  state.projectionsBySession.root.values.subagentCatalog.push({ id: 'external', mode: 'external' }, { id: 'unknown', mode: 'unknown' })
  const rows = ui.overviewData('root', state, new Map()).rows
  assert.equal(rows.find(row => row.id === 'external').address, undefined)
  assert.equal(rows.find(row => row.id === 'unknown').address, undefined)
  assert.deepEqual(plain(rows[0].address), { parentSessionId: 'root', childSessionId: 'a', mode: 'one-shot' })
})
test('projection errors retain data with diagnostics; missing is distinct from empty', () => {
  const state = fixture()
  state.projectionsBySession.root.state = 'error'
  state.projectionsBySession.root.error = { message: 'Offline' }
  const data = ui.overviewData('root', state, new Map())
  assert.equal(data.rows.length, 3)
  assert.equal(data.issues[0].message, 'Offline')
  assert.equal(data.readState, 'error')
  assert.equal(ui.overviewData('missing', state, new Map()).catalogAvailable, false)
  assert.equal(ui.overviewData('empty', { projectionsBySession: { empty: ready({ subagentCatalog: [] }) } }, new Map()).catalogAvailable, true)
})
test('filter searches recorded routes and preserves input ordering', () => {
  const rows = ui.overviewData('root', fixture(), new Map()).rows
  const original = rows.map(row => row.id).join()
  assert.equal(ui.overviewFilter(rows)[0].id, 'c')
  assert.equal(ui.overviewFilter(rows, { search: 'MINIMAX' })[0].id, 'a')
  assert.equal(ui.overviewFilter(rows, { search: 'planned' }).length, 0)
  assert.equal(ui.overviewFilter(rows, { kind: 'team', status: 'completed' }).length, 0)
  assert.equal(ui.overviewFilter(rows, { sort: 'tokenSort' })[0].id, 'a')
  assert.equal(rows.map(row => row.id).join(), original)
})
test('refresh is bounded, deduplicated, cancellable, and retains individual errors', async () => {
  let active = 0, max = 0
  const called = []
  const sessions = { async refreshProjections(id) {
    called.push(id); max = Math.max(max, ++active)
    await Promise.resolve(); active--
    if (id === 'bad') throw new Error('Read failed')
  } }
  const errors = await ui.refreshOverview(sessions, 'root', ['root', 'a', 'bad', 'b', 'c', 'd'])
  assert.equal(max, 4)
  assert.equal(called.length, 6)
  assert.equal(errors[0].id, 'bad')
  assert.equal((await ui.refreshOverview(sessions, 'root', ['a'], () => true)).length, 0)
  assert.equal(called.length, 6)
})
test('renders escaped names, meaningful labels, model plans and evidence details', () => {
  const data = ui.overviewData('root', fixture(), new Map())
  data.rows[0].name = '<script>bad</script>'
  const t = (key, args = {}) => (ui.overviewLocales.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '')
  const html = renderToStaticMarkup(React.createElement(ui.OverviewContent, { data, currentId: 'root', openChild() {}, t }))
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /最近一次请求/)
  assert.match(html, /1\/3/)
  assert.doesNotMatch(html, /overview\./)
  assert.match(html, /下次请求计划/)
})
test('the last request is named by the catalog while the planned route keeps its wire ids', () => {
  const data = ui.overviewData('root', fixture(), new Map())
  const groups = [{ id: 'minimax', name: 'MiniMax', models: [{ id: 'MiniMax-M3.1-Flash', name: 'M3.1-Flash · MiniMax Code' }] }]
  const t = (key, args = {}) => (ui.overviewLocales.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '')
  const html = renderToStaticMarkup(React.createElement(ui.OverviewContent, { data, currentId: 'root', openChild() {}, t, groups }))
  assert.match(html, /Last request: M3\.1-Flash · MiniMax Code/)
  assert.doesNotMatch(html, /Last request: minimax \/ MiniMax-M3\.1-Flash/)
  // The planned route is evidence, not a request: it keeps the exact pair.
  assert.match(html, /next \/ planned/)
  // Search still matches the bare wire id, and now also the displayed name.
  assert.equal(ui.overviewFilter(data.rows, { search: 'MINIMAX' })[0].id, 'a')
  assert.equal(ui.overviewFilter(data.rows, { search: 'MiniMax Code' }).length, 0)
  assert.equal(ui.overviewFilter(data.rows, { search: 'MiniMax Code' }, groups)[0].id, 'a')
})
