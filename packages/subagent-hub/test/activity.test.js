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

const route = (provider = 'p', model = 'm', reason = 'initial') => ({
  type: 'request/header', data: { header: { config: { provider, model } }, reason },
})
const sample = (inputTokens = 10, outputTokens = 2, extra = {}) => ({ inputTokens, outputTokens, ...extra })
const settlement = (turn, step, usage, extra = {}) => ({
  type: 'assistant/message', data: { turn, step, message: { content: [] }, ...(usage === undefined ? {} : { usage }), ...extra },
})
const usageChunk = usage => ({ type: 'chunk', chunk: { type: 'usage', usage } })
const usageRow = (provider, model, requests, uncachedInputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0) =>
  ({ provider, model, requests, uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens })

function checkedUsage(events) {
  const state = fold(events)
  activityProjection.stateSchema.parse(state)
  activityProjection.wire.viewSchema.parse(state.view)
  assert.equal(activityProjection.stateVersion, 3)
  assert.equal('usageRoute' in state.view, false)
  assert.equal('usageLast' in state.view, false)
  return state.view.usage
}

test('accumulates provider token buckets and actual requests on one route across turns', () => {
  const usage = checkedUsage([
    route(), settlement(1, 1, sample(10, 2, { cacheReadTokens: 5, cacheWriteTokens: 3 })),
    settlement(1, 2, sample(20, 4)),
    { type: 'turn/end', data: { reason: { kind: 'completed' } } },
    { type: 'turn/start', data: { turn: 2 } }, user('next', 5),
    route('p', 'm', 'resume'), route('p', 'm', 'series'), settlement(2, 1, sample(30, 6)),
  ])
  assert.deepEqual(usage, [usageRow('p', 'm', 3, 60, 12, 5, 3)])
})

test('keeps routes in first usage order and accumulates when switching back', () => {
  const usage = checkedUsage([
    route('a', 'm'), settlement(1, 1, sample()),
    route('a', 'n', 'change'), settlement(1, 2, sample(20, 4)),
    route('b', 'm', 'change'), settlement(1, 3, sample(30, 6)),
    route('a', 'm', 'change'), settlement(1, 4, sample()),
  ])
  assert.deepEqual(usage, [usageRow('a', 'm', 2, 20, 4), usageRow('a', 'n', 1, 20, 4), usageRow('b', 'm', 1, 30, 6)])
})

test('replaces the latest settlement usage despite interruption or surface rewrites', () => {
  const usage = checkedUsage([
    route(), settlement(1, 1, sample(10, 2, { cacheReadTokens: 8 })),
    { type: 'assistant/attempt', data: { turn: 1, step: 1, stream: [usageChunk(sample(12, 3))] } },
    settlement(1, 1, sample(11, 2), { interrupted: true }),
    { ...settlement(1, 1, sample(11, 2)), surface: { op: 'replace', start: 0, end: 1 } },
    { type: 'surface/replace', data: { start: 0, end: 1 } },
  ])
  assert.deepEqual(usage, [usageRow('p', 'm', 1, 11, 2)])
})

test('uses the final raw stream usage for attempts and messages, with message usage preferred', () => {
  const usage = checkedUsage([
    route(),
    { type: 'assistant/attempt', data: { turn: 1, step: 1, stream: [usageChunk(sample(1, 1)), { type: 'text-chunks', texts: ['x'] }, usageChunk(sample(3, 2))] } },
    settlement(1, 2, undefined, { stream: [usageChunk(sample(5, 4))] }),
    settlement(1, 3, sample(7, 6), { stream: [usageChunk(sample(100, 100))] }),
  ])
  assert.deepEqual(usage, [usageRow('p', 'm', 3, 15, 12)])
})

test('retry-started closes only the matching slot and charges billed retries separately', () => {
  const usage = checkedUsage([
    route(), { type: 'assistant/attempt', data: { turn: 1, step: 1, stream: [usageChunk(sample())] } },
    { type: 'llm/retry-started', data: { turn: 1, step: 2 } },
    settlement(1, 1, sample(12, 3)),
    { type: 'llm/retry-started', data: { turn: 1, step: 1 } },
    route('p', 'n', 'change'), settlement(1, 1, sample(20, 4)),
    settlement(1, 1, sample(21, 5)),
  ])
  assert.deepEqual(usage, [usageRow('p', 'm', 1, 12, 3), usageRow('p', 'n', 1, 21, 5)])
})

test('updates stay attributed to the request route even after another header', () => {
  const usage = checkedUsage([
    route(), settlement(1, 1, sample()), route('p', 'n', 'change'),
    settlement(1, 1, sample(12, 4)), settlement(1, 2, sample(20, 6)),
  ])
  assert.deepEqual(usage, [usageRow('p', 'm', 1, 12, 4), usageRow('p', 'n', 1, 20, 6)])
})

test('fork descriptor clears route, usage, and replacement state inherited from parent', () => {
  const parent = fold([route(), settlement(1, 1, sample())])
  const child = activityFold(parent, { type: 'subagent/descriptor', time: 10, data: {} })
  assert.equal(child.view.usage, undefined)
  assert.equal(child.usageRoute, undefined)
  assert.equal(child.usageLast, undefined)
  assert.deepEqual(checkedUsage([
    route(), settlement(1, 1, sample()), { type: 'subagent/descriptor', data: {} },
    settlement(1, 2, sample(100, 100)), route('child', 'm'), settlement(1, 1, sample(3, 1)),
  ]), [usageRow('child', 'm', 1, 3, 1)])
})

test('missing or invalid usage does not count or replace a valid sample', () => {
  const invalid = [null, {}, sample(-1), sample(Infinity), sample(NaN), sample(1, -1),
    sample(1, Infinity), sample(1, 2, { cacheReadTokens: -1 }), sample(1, 2, { cacheWriteTokens: NaN }),
    sample('10'), sample(1, 2, { cacheReadTokens: '2' })]
  assert.deepEqual(checkedUsage([
    settlement(1, 0, sample()), route(), settlement(1, 1, undefined),
    ...invalid.map(value => settlement(1, 1, value)),
  ]), undefined)
  const usage = checkedUsage([
    route(), settlement(1, 1, sample()),
    ...invalid.map(value => settlement(1, 1, value)),
    settlement(1, 1, undefined),
  ])
  assert.deepEqual(usage, [usageRow('p', 'm', 1, 10, 2)])
  const state = fold([route()])
  const ignored = { type: 'assistant/attempt', data: { turn: 1, step: 1, stream: [] } }
  assert.equal(activityFold(state, ignored), state)
  assert.equal(activityFold(state, { type: 'irrelevant', data: {} }), state)
})

test('retains the first 16 routes and discards overflow without contaminating replacements', () => {
  const events = []
  for (let index = 0; index < 18; index++) events.push(route('p', `m${index}`), settlement(1, index, sample()))
  events.push(route('p', 'm0'), settlement(1, 17, sample(100, 100)), settlement(1, 18, sample(3, 1)))
  const usage = checkedUsage(events)
  assert.equal(usage.length, 16)
  assert.deepEqual(usage.map(row => row.model), Array.from({ length: 16 }, (_, index) => `m${index}`))
  assert.deepEqual(usage[0], usageRow('p', 'm0', 2, 13, 3))
  assert.deepEqual(usage[15], usageRow('p', 'm15', 1, 10, 2))
  assert.throws(() => activityProjection.wire.viewSchema.parse({ ...fold([]).view, usage: [...usage, usage[0]] }))
})
