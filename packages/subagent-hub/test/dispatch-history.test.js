import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dispatchFold, dispatchProjection, DISPATCH_HISTORY_LIMIT } from '../lib/dispatch-history.js'
const call = id => ({ type: 'tool/call', seq: id * 2, time: 1000, data: { callId: String(id), name: 'spawn_teammate', arguments: '{"prompt":"private"}' } })
const result = (id, reason = 'subagent-hub: route denied') => ({ type: 'tool/result', seq: id * 2 + 1, time: 2000, data: { message: { toolCallId: String(id), isError: true }, error: { code: 'denied', reason } } })
test('replays committed Hub rejection reasons and excludes other errors', () => {
  let state = dispatchProjection.init()
  state = dispatchFold(state, call(1))
  assert.equal(dispatchProjection.wire.view(state).total, 0)
  state = dispatchFold(state, result(1))
  assert.deepEqual(state.view.records[0], { seq: 3, time: 2000, callId: '1', tool: 'spawn_teammate', reason: 'subagent-hub: route denied' })
  assert.equal(JSON.stringify(state).includes('private'), false)
  assert.equal(state.pending.length, 0)
  assert.equal(dispatchFold(state, result(2, 'other error')), state)
  assert.equal(dispatchFold(state, { type: 'user/message', data: { text: 'subagent-hub: fake' } }), state)
  assert.equal(dispatchFold(state, result(1)).view.total, 1)
  assert.equal(dispatchFold(state, { ...result(9), surfaceOp: { replace: { from: 1, to: 2 } } }).view.total, 1)
  assert.deepEqual(dispatchProjection.stateSchema.parse(state), state)
})
test('native guard text is accepted only for failed delegation calls', () => {
  const state = dispatchFold(dispatchProjection.init(), call(7))
  const event = { ...result(7), data: { message: { toolCallId: '7', isError: true,
    content: [{ type: 'text', text: 'Error: subagent-hub: native denial' }] } } }
  assert.equal(dispatchFold(state, event).view.records[0].reason, 'subagent-hub: native denial')
  assert.equal(dispatchFold(state, { ...event, data: { message: { ...event.data.message, isError: false } } }).view.total, 0)
  const other = dispatchFold(dispatchProjection.init(), { ...call(7), data: { ...call(7).data, name: 'bash' } })
  assert.equal(dispatchFold(other, event).view.total, 0)
  assert.equal(dispatchFold(dispatchProjection.init(), event).view.total, 0)
})
test('persists a bounded recent view with explicit full rejection count', () => {
  let state = dispatchProjection.init()
  for (let i = 0; i < 100; i++) { state = dispatchFold(state, call(i)); state = dispatchFold(state, result(i)) }
  assert.equal(state.view.total, 100)
  assert.equal(state.view.records.length, DISPATCH_HISTORY_LIMIT)
  assert.equal(state.view.records[0].callId, '36')
  assert.deepEqual(dispatchProjection.wire.viewSchema.parse(state.view), state.view)
})
test('unrelated pending calls do not publish wire changes and memory is bounded', () => {
  let state = dispatchProjection.init()
  const view = state.view
  for (let i = 0; i < 200; i++) state = dispatchFold(state, call(i))
  assert.equal(state.pending.length, 128)
  assert.equal(state.view, view)
  state = dispatchFold(state, result(1))
  assert.equal(state.view.records[0].tool, 'unknown')
  assert.equal(state.view.total, 1)
})
