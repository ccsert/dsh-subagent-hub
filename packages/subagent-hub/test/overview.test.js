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
  assert.match(html, /模型未确认/)
  assert.match(html, /成员<span class="sah-overview-badge">3<\/span>/)
  assert.doesNotMatch(html, /overview\./)
  assert.match(html, /下次请求计划/)
})
test('the last request is named by the catalog while the planned route keeps its wire ids', () => {
  const data = ui.overviewData('root', fixture(), new Map())
  const groups = [{ id: 'minimax', name: 'MiniMax', models: [{ id: 'MiniMax-M3.1-Flash', name: 'M3.1-Flash · MiniMax Code' }] }]
  const t = (key, args = {}) => (ui.overviewLocales.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '')
  const html = renderToStaticMarkup(React.createElement(ui.OverviewContent, { data, currentId: 'root', openChild() {}, t, groups }))
  assert.match(html, /<p class="sah-overview-model">M3\.1-Flash · MiniMax Code<\/p>/)
  assert.doesNotMatch(html, /<p class="sah-overview-model">minimax/)
  // The planned route is evidence, not a request: it keeps the exact pair.
  assert.match(html, /next \/ planned/)
  // Search still matches the bare wire id, and now also the displayed name.
  assert.equal(ui.overviewFilter(data.rows, { search: 'MINIMAX' })[0].id, 'a')
  assert.equal(ui.overviewFilter(data.rows, { search: 'MiniMax Code' }).length, 0)
  assert.equal(ui.overviewFilter(data.rows, { search: 'MiniMax Code' }, groups)[0].id, 'a')
})
test('cards answer what the agent was asked, is doing, plans and last said', () => {
  const state = fixture()
  state.projectionsBySession.c.values.subagentHubActivity = {
    task: { text: 'Investigate the effort issue', time: 1 }, pending: [{ callId: 'x', name: 'grep', hint: 'reasoningEffort', since: 4000 }],
    recent: [{ name: 'read', hint: 'lib/router.js', ok: false, time: 3, ms: 1200 }], tools: 3, errors: 1, retries: 0,
    todos: [{ content: 'Read', status: 'completed' }, { content: 'Fix router', status: 'in_progress' }],
    output: { text: 'Working on it', time: 2 }, report: { text: 'Root cause found', time: 3 }, last: 4000 }
  state.projectionsBySession.a.values.subagentHubActivity = { pending: [], recent: [], tools: 0, errors: 0, retries: 0, approval: { tool: 'bash', since: 1 } }
  const data = ui.overviewData('root', state, new Map(), 5000)
  assert.equal(data.attention, 1)
  assert.equal(ui.overviewFilter(data.rows)[0].id, 'a', 'attention sorts first')
  assert.equal(ui.overviewFilter(data.rows, { status: 'attention' }).length, 1)
  assert.equal(ui.overviewFilter(data.rows, { search: 'effort issue' })[0].id, 'c')
  const t = (key, args = {}) => (ui.overviewLocales.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '')
  const html = renderToStaticMarkup(React.createElement(ui.OverviewContent, { data, currentId: 'root', openChild() {}, t, now: 5000 }))
  assert.match(html, /Investigate the effort issue/)
  assert.match(html, /<code>grep<\/code><span>reasoningEffort<\/span><span class="sah-overview-elapsed">1\.0s<\/span>/)
  assert.match(html, /1\/2 · 当前：Fix router/)
  assert.match(html, /<dt>汇报<\/dt>.*Root cause found/)
  assert.match(html, /等待审批：bash/)
  assert.match(html, /3 次工具调用 · <span class="sah-overview-error">1 次失败<\/span>/)
  assert.match(html, /data-ok="false"/)
  assert.doesNotMatch(html, /overview\./)
})
test('compact spans and counts', () => {
  assert.equal(ui.overviewSpan(820), '820ms')
  assert.equal(ui.overviewSpan(4200), '4.2s')
  assert.equal(ui.overviewSpan(185000), '3m 05s')
  assert.equal(ui.overviewSpan(3720000), '1h 02m')
  assert.equal(ui.overviewCount(2412406), '2.41M')
  assert.equal(ui.overviewCount(12400), '12K')
  assert.deepEqual(plain(ui.overviewPlan([{ status: 'completed' }, { status: 'pending', content: 'B' }])), { done: 1, total: 2, current: 'B' })
})
test('an adapter-defaulted effort is shown from the Hub digest, an explicit one from the native view', () => {
  const state = fixture()
  state.projectionsBySession.a.values.subagentHubActivity = { pending: [], recent: [], tools: 0, errors: 0, retries: 0, effort: { value: 'high', defaulted: true } }
  const t = (key, args = {}) => (ui.overviewLocales.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '')
  let html = renderToStaticMarkup(React.createElement(ui.OverviewContent, { data: ui.overviewData('root', state, new Map()), currentId: 'root', openChild() {}, t }))
  assert.match(html, /MiniMax-M3\.1-Flash · 推理 high（模型默认）/)
  state.projectionsBySession.a.values.modelSelection.lastUsed = { ...route, reasoningEffort: 'max' }
  html = renderToStaticMarkup(React.createElement(ui.OverviewContent, { data: ui.overviewData('root', state, new Map()), currentId: 'root', openChild() {}, t }))
  assert.match(html, /MiniMax-M3\.1-Flash · 推理 max</)
})
test('the task board tab only appears when the Team board has tasks', () => {
  const t = (key, args = {}) => (ui.overviewLocales.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '')
  const render = state => renderToStaticMarkup(React.createElement(ui.OverviewContent, { data: ui.overviewData('root', state, new Map()), currentId: 'root', openChild() {}, t }))
  const state = fixture()
  assert.doesNotMatch(render(state), /共享任务板/)
  state.projectionsBySession.root.values.agentTeam.tasks.push({ id: 't1', subject: 'S', description: 'D', status: 'pending', ready: true })
  assert.match(render(state), /共享任务板/)
})
test('only approvals and recent failures need attention; old failures count as finished', () => {
  const hour = ui.ATTENTION_WINDOW_MS
  const state = fixture()
  const activity = extra => ({ pending: [], recent: [], tools: 0, errors: 0, retries: 0, ...extra })
  state.byId.c.running = false
  state.projectionsBySession.c.values.subagentTiming = { settledMs: 100, lastTurnCompleted: false }
  state.projectionsBySession.c.values.subagentHubActivity = activity({ last: 1000 })
  const now = 1000 + hour + 1
  let data = ui.overviewData('root', state, new Map(), now)
  let row = data.rows.find(item => item.id === 'c')
  assert.equal(row.status, 'interrupted')
  assert.equal(row.attention, false)
  assert.equal(data.attention, 0)
  assert.equal(ui.overviewFilter(data.rows, { status: 'settled' }).some(item => item.id === 'c'), true)
  data = ui.overviewData('root', state, new Map(), 1000 + hour - 1)
  assert.equal(data.rows.find(item => item.id === 'c').attention, true)
  assert.equal(ui.overviewFilter(data.rows, { status: 'settled' }).some(item => item.id === 'c'), false)
  // An approval wait needs attention however old it is; unknown age never does for a failure.
  state.projectionsBySession.c.values.subagentHubActivity = activity({ last: 1000, approval: { tool: 'bash', since: 1000 } })
  assert.equal(ui.overviewData('root', state, new Map(), now * 10).rows.find(item => item.id === 'c').attention, true)
  delete state.projectionsBySession.c.values.subagentHubActivity
  assert.equal(ui.overviewData('root', state, new Map(), now).rows.find(item => item.id === 'c').attention, false)
})
test('a running agent that is quiet or stuck in one call needs attention', () => {
  const quiet = ui.overviewStall({ pending: [] }, 1000, 1000 + ui.STALL_MS)
  assert.equal(quiet.kind, 'quiet')
  assert.equal(ui.overviewStall({ pending: [] }, 1000, 1000 + ui.STALL_MS - 1), undefined)
  // An open call is normal work until it is very long.
  assert.equal(ui.overviewStall({ pending: [{ name: 'bash', since: 0 }] }, 0, ui.STALL_MS * 2), undefined)
  assert.equal(ui.overviewStall({ pending: [{ name: 'bash', since: 0 }] }, 0, ui.LONG_CALL_MS).tool, 'bash')
  const state = fixture()
  state.projectionsBySession.c.values.subagentHubActivity = { pending: [], recent: [], tools: 1, errors: 0, retries: 0, last: 1000 }
  const data = ui.overviewData('root', state, new Map(), 1000 + ui.STALL_MS)
  const row = data.rows.find(item => item.id === 'c')
  assert.equal(row.status, 'running')
  assert.equal(row.attention, true)
  const t = (key, args = {}) => (ui.overviewLocales.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '')
  const html = renderToStaticMarkup(React.createElement(ui.OverviewContent, { data, currentId: 'root', openChild() {}, t, now: 1000 + ui.STALL_MS }))
  assert.match(html, /已 5m 00s 没有新动作/)
})
test('new results are what arrived after the last look, plus agents seen to stop meanwhile', () => {
  const rows = [
    { id: 'a', activity: { report: { text: 'r', time: 50 } } },
    { id: 'b', activity: { end: { kind: 'completed', time: 200 } } },
    { id: 'c', activity: {} },
  ]
  assert.deepEqual([...ui.overviewFresh(rows, 100)], ['b'])
  assert.deepEqual([...ui.overviewFresh(rows, 100, new Set(['c']))].sort(), ['b', 'c'])
  assert.equal(ui.overviewFresh(rows, undefined).size, 0)
  // Fresh rows sort right after rows that need attention.
  const data = ui.overviewData('root', fixture(), new Map())
  assert.equal(ui.overviewFilter(data.rows, {}, [], new Set(['b']))[0].id, 'c')
  assert.equal(ui.overviewFilter(data.rows, {}, [], new Set(['b']))[1].id, 'b')
})
test('usage splits by the route each request used and falls back to session totals', () => {
  const state = fixture()
  const usage = (provider, model, input, output, requests) => ({ provider, model, requests, uncachedInputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0 })
  state.projectionsBySession.c.values.subagentHubActivity = { pending: [], recent: [], tools: 0, errors: 0, retries: 0,
    usage: [usage('minimax', 'MiniMax-M3.1-Flash', 100, 20, 2), usage('deepseek', 'flash', 300, 0, 1)] }
  const data = ui.overviewData('root', state, new Map())
  const result = ui.overviewUsage(data.rows, [{ id: 'minimax', provider: 'minimax', model: 'MiniMax-M3.1-Flash', tags: ['free'] }])
  const minimax = result.routes.find(item => item.model === 'MiniMax-M3.1-Flash')
  // a: split-less fallback (180 total) + c: 120 on the same route.
  assert.equal(minimax.total, 300)
  assert.equal(minimax.agents, 2)
  assert.equal(minimax.approximate, true)
  assert.deepEqual(plain(minimax.tags), ['free'])
  const deepseek = result.routes.find(item => item.provider === 'deepseek')
  assert.equal(deepseek.routeId, undefined)
  assert.equal(deepseek.requests, 1)
  assert.equal(result.total, 600)
  assert.equal(result.missing, 1)
  assert.equal(ui.overviewCacheRate({ uncachedInputTokens: 50, cacheReadTokens: 150, cacheWriteTokens: 0 }), 0.75)
  const t = (key, args = {}) => (ui.overviewLocales.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '')
  const html = renderToStaticMarkup(React.createElement(ui.OverviewUsage, { usage: result, t }))
  assert.match(html, /非 Hub 路线/)
  assert.match(html, /部分按会话总量估算/)
  assert.match(html, /1 个子智能体还没有用量记录/)
  assert.doesNotMatch(html, /overview\./)
})
