import { z } from 'zod'
import { GUARD_PREFIX } from './guard.js'

export const DISPATCH_PROJECTION = 'subagentHubDispatch'
export const DISPATCH_HISTORY_LIMIT = 64
const viewSchema = z.object({
  total: z.number().int().nonnegative(),
  records: z.array(z.object({ seq: z.number().int(), time: z.number(), callId: z.string(), tool: z.string(), reason: z.string() })).max(DISPATCH_HISTORY_LIMIT),
})
const stateSchema = z.object({
  pending: z.array(z.object({ callId: z.string(), tool: z.string() })).max(128),
  view: viewSchema,
})

// Fold committed history, not a client-side cache or a pre-execution side effect.
// Persist no prompts, tool arguments, credentials, or successful tool output.
export function dispatchFold(state, event) {
  if (event.type === 'tool/call') {
    return { ...state, pending: [...state.pending.filter(call => call.callId !== event.data.callId),
      { callId: event.data.callId, tool: event.data.name }].slice(-128) }
  }
  if (event.type !== 'tool/result') return state
  const message = event.data.message
  const callId = message.toolCallId
  const call = state.pending.find(item => item.callId === callId)
  const pending = state.pending.filter(item => item.callId !== callId)
  // Native pre-execution denials omit error.info unless the guard supplied it.
  // Their durable representation is a single `Error: <reason>` text block.
  const text = message.content?.length === 1 && message.content[0].type === 'text' ? message.content[0].text : undefined
  const nativeReason = ['subagent', 'subagent_fork', 'spawn_teammate'].includes(call?.tool)
    && text?.startsWith(`Error: ${GUARD_PREFIX}`) ? text.slice(7) : undefined
  const reason = event.data.error?.reason ?? nativeReason
  if (message.isError !== true || (event.surfaceOp !== undefined && event.surfaceOp !== 'append') || typeof reason !== 'string' || !reason.startsWith(GUARD_PREFIX)) {
    return pending.length === state.pending.length ? state : { ...state, pending }
  }
  // Surface rewrites retain the call ID. A correction is not another dispatch.
  if (state.view.records.some(record => record.callId === callId)) return { ...state, pending }
  const record = { seq: event.seq, time: event.time, callId, tool: call?.tool ?? 'unknown', reason }
  return { pending, view: { total: state.view.total + 1, records: [...state.view.records, record].slice(-DISPATCH_HISTORY_LIMIT) } }
}
export const dispatchProjection = {
  key: DISPATCH_PROJECTION, stateVersion: 1, stateSchema,
  init: () => ({ pending: [], view: { total: 0, records: [] } }),
  apply: dispatchFold,
  wire: { viewSchema, view: state => state.view },
}
