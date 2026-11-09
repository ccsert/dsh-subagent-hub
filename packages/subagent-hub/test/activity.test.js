import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACTIVITY_RECENT_LIMIT, activityFold, activityProjection, previewText, toolHint } from '../lib/activity.js'

const fold = events => events.reduce((state, event, seq) => activityFold(state, { seq, time: event.time ?? seq * 1000, ...event }), activityProjection.init())
const user = (text, time) => ({ type: 'user/message', time, data: { content: [{ type: 'text', text }], source: { kind: 'user' } } })
const call = (callId, name, args, time) => ({ type: 'tool/call', time, data: { callId, name, arguments: JSON.stringify(args) } })
const result = (callId, time, isError = false) => ({ type: 'tool/result', time, data: { message: { toolCallId: callId, isError, content: [] } } })

test('records the task, the live call, and the finished step trail', () => {
  const state = fold([
    { type: 'turn/start', time: 0, data: { turn: 1 } },
    user('Investigate   the\nreasoning effort issue', 1),
    call('c1', 'grep', { pattern: 'reasoningEffort' }, 2),
    result('c1', 5),
    call('c2', 'bash', { command: 'rm -rf /secret', description: 'Run unit tests' }, 6),
  ])
  const view = activityProjection.wire.view(state)
  assert.equal(view.task.text, 'Investigate the reasoning effort issue')
  assert.deepEqual(view.recent, [{ name: 'grep', hint: 'reasoningEffort', ok: true, time: 5, ms: 3 }])
  assert.equal(view.pending.at(-1).name, 'bash')
  assert.equal(view.pending.at(-1).hint, 'Run unit tests')
  assert.equal(JSON.stringify(view).includes('rm -rf'), false, 'commands never enter the digest')
  assert.equal(view.tools, 2)
  activityProjection.wire.viewSchema.parse(view)
})

test('a report sent to another agent and the plan are kept; errors are counted', () => {
  const view = fold([
    user('Do it', 0),
    { type: 'todo/write', time: 1, data: { todos: [{ content: 'Read', status: 'completed' }, { content: 'Fix', status: 'in_progress' }] } },
    call('c1', 'send_message', { target: 'lead', message: 'Found the root cause in router.js' }, 2),
    result('c1', 3),
    call('c2', 'read', { file_path: '/a/b/c/d/e.js' }, 4),
    result('c2', 5, true),
  ]).view
  assert.equal(view.report.text, 'Found the root cause in router.js')
  assert.equal(view.todos.length, 2)
  assert.equal(view.errors, 1)
  assert.equal(view.recent.at(-1).hint, '…/c/d/e.js')
  assert.equal(view.recent[0].hint, 'lead')
})

test('approval waits are visible until decided and cleared at turn end', () => {
  let state = fold([user('x', 0), { type: 'approval/asked', time: 1, data: { id: 'a', toolName: 'bash' } }])
  assert.equal(state.view.approval.tool, 'bash')
  state = activityFold(state, { type: 'approval/decided', time: 2, data: { id: 'a', outcome: 'approved' } })
  assert.equal(state.view.approval, undefined)
  state = activityFold(state, { type: 'approval/asked', time: 3, data: { id: 'b', toolName: 'edit' } })
  state = activityFold(state, { type: 'turn/end', time: 4, data: { turn: 1, reason: { kind: 'cancelled' } } })
  assert.equal(state.view.approval, undefined)
  assert.deepEqual(state.view.end, { kind: 'cancelled', time: 4 })
})

test('a fork seed is discarded at the descriptor while the open turn prompt survives', () => {
  const view = fold([
    { type: 'turn/start', time: 0, data: { turn: 1 } },
    user('parent old task', 1),
    call('p1', 'grep', { pattern: 'parent' }, 2),
    result('p1', 3),
    { type: 'turn/end', time: 4, data: { turn: 1, reason: { kind: 'completed' } } },
    { type: 'turn/start', time: 5, data: { turn: 2 } },
    user('child task', 6),
    { type: 'subagent/descriptor', time: 7, data: {} },
  ]).view
  assert.equal(view.task.text, 'child task')
  assert.equal(view.tools, 0)
  assert.deepEqual(view.recent, [])
})

test('later messages become the inbox; cancelled calls do not look stuck', () => {
  const view = fold([
    user('first', 0), call('c1', 'bash', { description: 'long' }, 1),
    { type: 'turn/end', time: 2, data: { turn: 1, reason: { kind: 'cancelled' } } },
    { type: 'turn/start', time: 3, data: { turn: 2 } }, user('follow-up', 4),
  ]).view
  assert.equal(view.task.text, 'first')
  assert.equal(view.inbox.text, 'follow-up')
  assert.deepEqual(view.pending, [])
  assert.equal(view.end, undefined)
})

test('bounded previews, trail and unparseable arguments', () => {
  assert.equal(previewText([{ type: 'text', text: 'a'.repeat(5000) }]).length, 600)
  assert.equal(toolHint('x', '{not json'), undefined)
  assert.equal(toolHint('x', 'x'.repeat(70 * 1024)), undefined)
  assert.equal(toolHint('web_fetch', JSON.stringify({ url: 'https://example.com/a?token=secret' })), 'example.com/a')
  const events = [user('t', 0)]
  for (let index = 0; index < 30; index++) events.push(call(`c${index}`, 'grep', { pattern: String(index) }, index * 2 + 1), result(`c${index}`, index * 2 + 2))
  const view = fold(events).view
  assert.equal(view.recent.length, ACTIVITY_RECENT_LIMIT)
  assert.equal(view.recent.at(-1).hint, '29')
  activityProjection.wire.viewSchema.parse(view)
})

test('uninteresting events keep the state identity', () => {
  const state = fold([user('t', 0)])
  assert.equal(activityFold(state, { type: 'request/header', time: 1, data: {} }), state)
  assert.equal(activityFold(state, { type: 'tool/result', time: 1, data: { message: { toolCallId: 'none' } } }), state)
})

test('records the effort the request ran with, including an adapter default', () => {
  const header = (reasoningEffort, defaulted) => ({ type: 'request/header', time: 1, data: { header: { config: { provider: 'p', model: 'm', ...(reasoningEffort ? { reasoningEffort } : {}) }, ...(defaulted ? { adapterDefaults: { reasoningEffort: true } } : {}) } } })
  let state = fold([user('t', 0), header('high', true)])
  assert.deepEqual(state.view.effort, { value: 'high', defaulted: true })
  const same = activityFold(state, header('high', true))
  assert.equal(same, state)
  state = activityFold(state, header('max', false))
  assert.deepEqual(state.view.effort, { value: 'max', defaulted: false })
  state = activityFold(state, header(undefined, false))
  assert.equal(state.view.effort, undefined)
  activityProjection.wire.viewSchema.parse(state.view)
})
