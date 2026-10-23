import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, definition, init } from '../lib/projection.js'

const record = { subagentId: 'c1', label: 'review', agent: 'reviewer', provider: 'p', model: 'm', mode: 'route', reason: 'why', fallbacks: [] }
const result = (meta, extra = {}) => ({
  type: 'tool/result', seq: 7, time: 100,
  data: { turn: 1, step: 1, message: { toolCallId: 'call-1' }, meta, ...extra },
})

test('a delegate result becomes one run with its log position', () => {
  const state = apply(init(), result({ subagentHub: record }))
  assert.deepEqual(state.runs, [{ ...record, callId: 'call-1', seq: 7, time: 100 }])
  assert.ok(definition.stateSchema.safeParse(state).success)
})

test('unrelated events and foreign or malformed meta keep the same reference', () => {
  const state = init()
  assert.equal(apply(state, { type: 'assistant/message', seq: 1, time: 1, data: {} }), state)
  assert.equal(apply(state, result(undefined)), state)
  assert.equal(apply(state, result({ other: true })), state)
  assert.equal(apply(state, result({ subagentHub: { subagentId: 'x' } })), state)
  assert.equal(apply(state, result({ subagentHub: record }, { error: { name: 'E', code: 'X' } })), state)
})

test('runs accumulate in log order', () => {
  let state = init()
  state = apply(state, result({ subagentHub: record }))
  state = apply(state, { ...result({ subagentHub: { ...record, subagentId: 'c2', mode: 'inherit' } }), seq: 9 })
  assert.deepEqual(state.runs.map(run => [run.subagentId, run.seq]), [['c1', 7], ['c2', 9]])
})
