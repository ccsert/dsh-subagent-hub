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
const address = { parentSessionId: 'lead', childSessionId: 'builder-id', mode: 'continuable' }
const rows = [{ id: 'builder-id', name: 'Builder', kind: 'team', address }]
const tasks = [
  { id: 'one', subject: 'Build', description: 'Implement the change', status: 'in_progress', ownerName: 'Builder', blockedBy: [], writeScopes: ['src/'], writeScopeWarnings: [] },
  { id: 'two', subject: 'Review', status: 'pending', ready: false, blockedBy: ['one'], writeScopes: ['src/'], writeScopeWarnings: ['write scopes overlap with one'] },
  { id: 'three', subject: 'Document', status: 'pending', ready: true, ownerName: 'all', blockedBy: ['four'], writeScopes: [], writeScopeWarnings: [] },
  { id: 'four', subject: 'Plan', status: 'completed', ownerName: 'Builder', blockedBy: [], writeScopes: [], writeScopeWarnings: [] },
  { id: 'deleted', subject: 'Removed', status: 'deleted', blockedBy: [] },
]
const t = (key, args = {}) => (ui.overviewLocales.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => args[name] ?? '')
const render = (props = {}) => renderToStaticMarkup(React.createElement(ui.OverviewTasks, { tasks, teamAvailable: true, rows, openChild() {}, t, ...props }))

test('readiness follows the native task view and does not invent a blocked state for missing readiness', () => {
  assert.equal(ui.taskBoardState({ status: 'pending', ready: true }), 'ready')
  assert.equal(ui.taskBoardState({ status: 'pending', ready: false }), 'blocked')
  assert.equal(ui.taskBoardState({ status: 'pending' }), 'pending')
  assert.equal(ui.taskBoardState({ status: 'completed', ready: false }), 'completed')
})

test('task filters combine owner and status while preserving the original board and native pending membership', () => {
  const before = JSON.stringify(tasks)
  assert.deepEqual(plain(ui.taskBoardFilter(tasks, { status: 'pending' })).map(task => task.id), ['two', 'three'])
  assert.deepEqual(plain(ui.taskBoardFilter(tasks, { status: 'ready' })).map(task => task.id), ['three'])
  assert.deepEqual(plain(ui.taskBoardFilter(tasks, { status: 'blocked', owner: 'unassigned' })).map(task => task.id), ['two'])
  assert.deepEqual(plain(ui.taskBoardFilter(tasks, { status: 'completed', owner: 'owner:Builder' })).map(task => task.id), ['four'])
  assert.deepEqual(plain(ui.taskBoardFilter(tasks, { status: 'ready', owner: 'owner:Builder' })), [])
  assert.equal(ui.taskBoardFilter(tasks).length, 4)
  assert.equal(JSON.stringify(tasks), before)
})

test('reserved filter words remain valid distinct owner names', () => {
  assert.equal(ui.taskBoardOwnerKey({ ownerName: 'all' }), 'owner:all')
  assert.equal(ui.taskBoardOwnerKey({ ownerName: 'unassigned' }), 'owner:unassigned')
  assert.deepEqual(plain(ui.taskBoardFilter(tasks, { owner: 'owner:all' })).map(task => task.id), ['three'])
  assert.equal(ui.taskBoardOwnerKey({}), 'unassigned')
})

test('owner navigation requires an exact unique Team roster member with an authoritative address', () => {
  assert.equal(ui.taskBoardOwner(tasks[0], rows).address, address)
  assert.equal(ui.taskBoardOwner(tasks[0], [{ ...rows[0], kind: 'independent' }]), undefined)
  assert.equal(ui.taskBoardOwner(tasks[0], [{ ...rows[0], name: 'builder' }]), undefined)
  assert.equal(ui.taskBoardOwner(tasks[0], [{ ...rows[0], address: undefined }]), undefined)
  assert.equal(ui.taskBoardOwner(tasks[0], [...rows, { ...rows[0], id: 'another' }]), undefined)
  assert.equal(ui.taskBoardOwner({ ownerName: 'lead' }, rows), undefined)
})

test('dependency resolution preserves missing records and deduplicates references without fabricating targets', () => {
  const resolved = ui.taskBoardDependencies({ blockedBy: ['one', 'gone', 'one'] }, tasks)
  assert.deepEqual(plain(resolved).map(item => item.id), ['one', 'gone'])
  assert.equal(resolved[0].task, tasks[0])
  assert.equal(resolved[1].task, undefined)
})

test('task board exposes accessible filters, member navigation, dependency controls and localized conflict reasons', () => {
  const html = render()
  assert.match(html, /任务状态<select/)
  assert.match(html, /任务负责人<select/)
  assert.match(html, /显示 4\/4 项任务/)
  assert.match(html, /title="打开 Builder 的会话"/)
  assert.match(html, /等待依赖完成/)
  assert.match(html, /aria-controls="[^"]+-one" title="定位 one：Build"/)
  assert.match(html, /与 one 的写入范围重叠/)
  assert.match(html, /写入范围 \(1\)/)
  assert.match(html, /任务变更由原生 Team 管理/)
  assert.doesNotMatch(html, /overview\.|步骤与详情|Removed|Shared write scope:/)
})

test('missing and ambiguous owners stay informative without offering fake navigation', () => {
  const html = render({ rows: [...rows, { ...rows[0], id: 'second-builder' }] })
  assert.doesNotMatch(html, /sah-task-owner-link/)
  assert.match(html, /当前 Team 名单中没有可打开的负责人会话/)
  assert.match(html, /未分配/)
})

test('missing prerequisite is visible, completed prerequisite remains navigable, and unconfirmed readiness is not mislabeled', () => {
  const html = render({ tasks: [tasks[3], { id: 'pending', subject: 'Unconfirmed', status: 'pending', blockedBy: ['four', 'missing'] }] })
  assert.match(html, /data-completed=""/)
  assert.match(html, /missing · 记录不可用/)
  assert.doesNotMatch(html, /aria-controls="[^"]+-missing"/)
  assert.match(html, /class="sah-task-status" data-state="pending">待处理/)
})

test('task content and warning fallbacks are escaped, including older warning text', () => {
  const html = render({ tasks: [{ ...tasks[0], subject: '<script>bad()</script>', description: '<img src=x>', writeScopeWarnings: ['Shared write scope: <scope>', '<strong>raw</strong>'] }] })
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /&lt;img src=x&gt;/)
  assert.match(html, /共享写入范围：&lt;scope&gt;/)
  assert.match(html, /&lt;strong&gt;raw&lt;\/strong&gt;/)
  assert.doesNotMatch(html, /<script>|<img /)
})

test('unavailable and empty Team views remain separate from filtered empty results', () => {
  assert.match(render({ teamAvailable: false }), /Team 投影不可用/)
  assert.match(render({ tasks: [] }), /尚无共享任务记录/)
  assert.match(render({ tasks: [tasks[4]] }), /尚无共享任务记录/)
})
