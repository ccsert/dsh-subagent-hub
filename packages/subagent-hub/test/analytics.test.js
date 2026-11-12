import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
let entry
vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(value) { entry = value } } },
})
const ui = entry.factory(id => id === 'react' ? React : {})
const plain = value => JSON.parse(JSON.stringify(value))
const ready = values => ({ state: 'ready', values })
const buckets = (input = 100, cache = 200, output = 50) => ({ uncachedInputTokens: input, cacheReadTokens: cache, cacheWriteTokens: 0, outputTokens: output })
const route = { provider: 'p', model: 'm' }
const t = (key, args = {}) => (ui.overviewLocales.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '')
function tree() {
  return { byId: { builder: { running: false }, checker: { running: true, parentId: 'builder' }, other: { running: false } }, projectionsBySession: {
    root: ready({ agentTeam: { enabled: true, tasks: [{ id: 'task-1', ownerId: 'checker', ownerName: 'builder/checker', subject: 'Verify', status: 'in_progress' }] },
      subagentCatalog: [{ id: 'builder', name: 'builder', label: 'Implement SDK migration', mode: 'continuable' }] }),
    builder: ready({ agentPreset: 'hub-agent-builder', subagentCatalog: [{ id: 'checker', name: 'checker', label: 'Verify recovery', mode: 'continuable' }],
      modelSelection: { lastUsed: route, next: null }, subagentHubActivity: { pending: [], recent: [], retries: 1, usage: [{ ...route, ...buckets(), requests: 2 }] } }),
    checker: ready({ agentPreset: 'hub-agent-reviewer', modelSelection: { lastUsed: { ...route, reasoningEffort: 'medium' }, next: null },
      subagentHubActivity: { pending: [], recent: [], retries: 0, usage: [{ ...route, ...buckets(10, 20, 5), requests: 1 }] } }),
    other: ready({ subagentCatalog: [{ id: 'unrelated', name: 'checker', mode: 'continuable' }] }),
  } }
}

test('rc2 named descendants preserve identity, description, path and direct-parent navigation', () => {
  const state = tree()
  const data = ui.overviewData('root', state, new Map(), 1000)
  assert.equal(data.rows.length, 2)
  assert.equal(data.rows[0].name, 'builder')
  assert.equal(data.rows[0].label, 'Implement SDK migration')
  const child = data.rows[1]
  assert.equal(child.name, 'checker')
  assert.equal(child.path, 'builder/checker')
  assert.equal(child.depth, 2)
  assert.equal(child.kind, 'team', 'root Team mode is shared by grandchildren')
  assert.equal(child.presetId, 'hub-agent-reviewer')
  assert.deepEqual(plain(child.address), { parentSessionId: 'builder', childSessionId: 'checker', mode: 'continuable' })
  assert.equal(ui.taskBoardOwner(data.tasks[0], data.rows).id, 'checker')
  assert.equal(data.rows.some(row => row.id === 'unrelated'), false)
  assert.equal(ui.overviewFilter(data.rows, { search: 'builder/checker' })[0].id, 'checker')
})

test('catalog membership is cycle-safe and each Session contributes usage only once', () => {
  const state = tree()
  state.projectionsBySession.checker.values.subagentCatalog = [{ id: 'root', name: 'lead', mode: 'continuable' }, { id: 'builder', name: 'loop', mode: 'continuable' }]
  state.projectionsBySession.root.values.subagentCatalog.push({ id: 'checker', name: 'duplicate', mode: 'continuable' })
  const data = ui.overviewData('root', state, new Map(), 1000)
  assert.deepEqual(plain(data.rows.map(row => row.id)), ['builder', 'checker'])
  assert.equal(ui.overviewUsage(data.rows).total, 385)
})

test('owner IDs win over stale names and cannot fall back to a different same-named member', () => {
  const data = ui.overviewData('root', tree(), new Map(), 1000)
  assert.equal(ui.taskBoardOwner({ ownerId: 'checker', ownerName: 'renamed' }, data.rows).id, 'checker')
  assert.equal(ui.taskBoardOwner({ ownerId: 'missing', ownerName: 'builder' }, data.rows), undefined)
  assert.notEqual(ui.taskBoardOwnerKey({ ownerId: 'one', ownerName: 'checker' }), ui.taskBoardOwnerKey({ ownerId: 'two', ownerName: 'checker' }))
  assert.equal(ui.taskBoardOwner({ ownerName: 'checker' }, [{ ...data.rows[1], kind: 'team' }, { ...data.rows[1], id: 'another', kind: 'team' }]), undefined)
})

test('root resolution requires proven ancestors rather than unrelated parent hints', () => {
  const state = tree()
  state.byId.builder.parentId = 'root'
  assert.equal(ui.overviewRoot('checker', 'builder', state), 'root')
  state.byId.builder.parentId = 'other'
  assert.equal(ui.overviewRoot('checker', 'builder', state), 'builder')
})

test('large trees are visibly bounded without counting global Sessions', () => {
  const state = { projectionsBySession: { root: ready({ subagentCatalog: Array.from({ length: ui.OVERVIEW_LIMIT + 5 }, (_, i) => ({ id: `s${i}`, name: `worker-${i}`, mode: 'continuable' })) }) } }
  const data = ui.overviewData('root', state, new Map(), 1000)
  assert.equal(data.rows.length, ui.OVERVIEW_LIMIT)
  assert.equal(data.treeLimited, true)
  const html = renderToStaticMarkup(React.createElement(ui.OverviewContent, { data, t }))
  assert.match(html, /最多展示 512 个成员和 32 层/)
})

test('one refresh discovers new grandchildren, never opens external executions, and limits parallel reads', async () => {
  const state = tree()
  const source = state.projectionsBySession
  const loaded = { byId: state.byId, projectionsBySession: {} }
  const calls = []
  let active = 0, max = 0
  const sessions = { list: { getSnapshot: () => loaded }, async refreshProjections(id) {
    calls.push(id); active++; max = Math.max(max, active)
    await Promise.resolve()
    if (source[id]) loaded.projectionsBySession[id] = source[id]
    active--
  } }
  source.root.values.subagentCatalog.push({ id: 'external', name: 'cli', mode: 'external' })
  assert.equal((await ui.refreshOverview(sessions, 'root')).length, 0)
  assert.deepEqual(calls.sort(), ['builder', 'checker', 'root'])
  assert.ok(max <= 4)
  assert.equal(calls.includes('unrelated'), false)
})

test('cancelling refresh after the root read does not schedule newly discovered children', async () => {
  const state = tree()
  const calls = []
  let cancelled = false
  const sessions = { list: { getSnapshot: () => state }, async refreshProjections(id) { calls.push(id); cancelled = true } }
  await ui.refreshOverview(sessions, 'root', [], () => cancelled)
  assert.deepEqual(calls, ['root'])
})

test('large-tree refresh reads every displayed local member using the same bounded breadth-first selection', async () => {
  const state = { projectionsBySession: {
    root: ready({ subagentCatalog: [{ id: 'a', name: 'a', mode: 'continuable' }, { id: 'b', name: 'b', mode: 'continuable' }] }),
    a: ready({ subagentCatalog: Array.from({ length: 511 }, (_, i) => ({ id: `g${i}`, name: `g${i}`, mode: 'continuable' })) }),
  } }
  const calls = []
  await ui.refreshOverview({ list: { getSnapshot: () => state }, async refreshProjections(id) { calls.push(id) } }, 'root')
  const shown = ui.overviewData('root', state, new Map(), 1000)
  assert.equal(shown.treeLimited, true)
  assert.deepEqual(plain(shown.rows.map(row => row.id)), calls.filter(id => id !== 'root'))
  assert.equal(calls.length, ui.OVERVIEW_LIMIT + 1)
  assert.equal(calls.includes('g510'), false)
})

test('refresh finishes parent depths before cached descendants can consume a changing selection budget', async () => {
  const children = prefix => Array.from({ length: 511 }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix}${i}`, mode: 'continuable' }))
  const state = { projectionsBySession: {
    root: ready({ subagentCatalog: [{ id: 'b', name: 'b', mode: 'continuable' }, { id: 'a', name: 'a', mode: 'continuable' }] }),
    a: ready({ subagentCatalog: children('a') }),
  } }
  const calls = []
  await ui.refreshOverview({ list: { getSnapshot: () => state }, async refreshProjections(id) {
    calls.push(id)
    if (id === 'b') state.projectionsBySession.b = ready({ subagentCatalog: children('b') })
  } }, 'root')
  const shown = ui.overviewData('root', state, new Map(), 1000)
  assert.equal(shown.rows.length, ui.OVERVIEW_LIMIT)
  assert.ok(shown.rows.every(row => calls.includes(row.id)))
  assert.equal(calls.includes('a0'), false, 'stale cached descendants do not consume the read budget')
  assert.equal(calls.length, ui.OVERVIEW_LIMIT + 1)
})

test('depth limits and external executions do not create unread displayed local Sessions', async () => {
  const state = { projectionsBySession: {} }
  for (let i = 0; i <= 33; i++) state.projectionsBySession[`s${i}`] = ready({ subagentCatalog: [{ id: `s${i + 1}`, name: `s${i + 1}`, mode: 'continuable' }] })
  const calls = []
  await ui.refreshOverview({ list: { getSnapshot: () => state }, async refreshProjections(id) { calls.push(id) } }, 's0')
  const shown = ui.overviewData('s0', state, new Map(), 1000)
  assert.equal(shown.depth, 32)
  assert.equal(shown.treeLimited, true)
  assert.equal(calls.length, 33)
  state.projectionsBySession.s0.values.subagentCatalog.unshift({ id: 'external', name: 'cli', mode: 'external' })
  calls.length = 0
  await ui.refreshOverview({ list: { getSnapshot: () => state }, async refreshProjections(id) { calls.push(id) } }, 's0')
  assert.equal(calls.includes('external'), false)
})

test('partial per-route records are disclosed and never filled with invented route usage', () => {
  const data = ui.overviewData('root', tree(), new Map(), 1000)
  data.rows[0].tokenUsage = buckets(1000, 2000, 500)
  const usage = ui.overviewUsage(data.rows)
  assert.equal(usage.total, 385)
  assert.equal(usage.incomplete, 1)
  const html = renderToStaticMarkup(React.createElement(ui.OverviewAnalysis, { data, t }))
  assert.match(html, /1 个成员的分路线记录少于会话总量/)
})

test('role analytics uses persisted presets and per-request routes, never member names as roles', () => {
  const data = ui.overviewData('root', tree(), new Map(), 1000)
  const result = ui.overviewAnalytics(data.rows, [{ id: 'worker', ...route }], [{ id: 'builder', name: '开发' }, { id: 'reviewer', name: '审查' }])
  assert.equal(result.usage.total, 385)
  assert.deepEqual(plain(result.roles.map(role => role.name)), ['开发', '审查'])
  assert.equal(result.roles[0].retries, 1)
  assert.equal(result.roles[0].usage.routes[0].routeId, 'worker')
  delete data.rows[0].presetId
  delete data.rows[0].presetKnown
  const unknown = ui.overviewAnalytics(data.rows)
  assert.ok(unknown.roles.some(role => role.key === 'unknown' && role.roleId === undefined))
  data.rows[0].presetId = 'standard'
  assert.ok(ui.overviewAnalytics(data.rows).roles.some(role => role.key === 'unassigned'))
  delete data.rows[0].presetId
  data.rows[0].presetKnown = true
  assert.ok(ui.overviewAnalytics(data.rows).roles.some(role => role.key === 'unassigned'), 'a recorded null preset is distinct from a missing projection')
})

test('configuration comparisons distinguish recorded differences from failures or missing effort', () => {
  const data = ui.overviewData('root', tree(), new Map(), 1000)
  const routes = [{ id: 'worker', ...route, reasoningEffort: 'high' }]
  const agents = [{ id: 'reviewer', routes: ['other'] }]
  const result = ui.overviewAnalytics(data.rows, routes, agents)
  assert.deepEqual(plain(result.comparisons.map(item => item.kind)), ['effort', 'roleRoute'])
  assert.equal(result.attention.length, 0)
  assert.equal(result.comparisons[0].actual, 'medium')
  const html = renderToStaticMarkup(React.createElement(ui.OverviewAnalysis, { data, routes, agents, t }))
  assert.match(html, /显式覆盖或后续配置更新均可能造成差异，不代表执行失败/)
  assert.match(html, /路线默认 high → 记录值 medium/)
  assert.doesNotMatch(html, /overview\./)
})

test('analysis is the default tab, preserves unknown values, and exposes chart counts without color', () => {
  const data = ui.overviewData('root', tree(), new Map(), 1000)
  const html = renderToStaticMarkup(React.createElement(ui.OverviewContent, { data, t }))
  assert.match(html, /aria-pressed="true">用量分析/)
  assert.match(html, /aria-label="[^\"]*未缓存输入 100 · 缓存读取 \/ 写入 200 · 输出 50/)
  assert.match(html, /scope="col">已结算请求/)
  const missing = { ...data, rows: [{ ...data.rows[0], activity: undefined, tokenUsage: undefined }] }
  const unknown = renderToStaticMarkup(React.createElement(ui.OverviewAnalysis, { data: missing, t }))
  assert.match(unknown, /尚未上报用量/)
  assert.match(unknown, /重试 —/)
})

test('role names and task paths remain escaped in analysis and owner controls', () => {
  const state = tree()
  const data = ui.overviewData('root', state, new Map(), 1000)
  const html = renderToStaticMarkup(React.createElement(ui.OverviewAnalysis, { data, agents: [{ id: 'builder', name: '<img src=x>' }], t }))
  assert.match(html, /&lt;img src=x&gt;/)
  assert.doesNotMatch(html, /<img /)
  const board = renderToStaticMarkup(React.createElement(ui.OverviewTasks, { tasks: data.tasks, rows: data.rows, teamAvailable: true, openChild() {}, t }))
  assert.match(board, /title="打开 builder\/checker 的会话"/)
})
