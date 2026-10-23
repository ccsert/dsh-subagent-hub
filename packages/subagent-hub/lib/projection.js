// `subagentHub` session projection: the routing record of every `delegate` call in one session,
// folded from durable `tool/result.meta` (the log stays the only source of truth).
import { z } from 'zod'

export const PROJECTION_KEY = 'subagentHub'
export const META_KEY = 'subagentHub'
const STATE_VERSION = 1

const runSchema = z.object({
  callId: z.string(),
  seq: z.number(),
  time: z.number(),
  subagentId: z.string(),
  label: z.string().optional(),
  agent: z.string().optional(),
  provider: z.string(),
  model: z.string(),
  mode: z.enum(['route', 'inherit']),
  reason: z.string(),
  fallbacks: z.array(z.string()),
})

const stateSchema = z.object({ runs: z.array(runSchema) })

export const init = () => ({ runs: [] })

/** Pure fold: append one run per successful `delegate` result; ignore everything else by reference. */
export function apply(state, event) {
  if (event.type !== 'tool/result') return state
  const record = event.data.meta?.[META_KEY]
  if (record === undefined || record === null || typeof record !== 'object' || event.data.error !== undefined) return state
  const parsed = runSchema.omit({ callId: true, seq: true, time: true }).safeParse(record)
  if (!parsed.success) return state
  return {
    runs: [...state.runs, {
      ...parsed.data,
      callId: String(event.data.message.toolCallId),
      seq: event.seq,
      time: event.time,
    }],
  }
}

export const definition = {
  key: PROJECTION_KEY,
  stateSchema,
  init,
  apply,
  wire: { viewSchema: stateSchema, view: state => state },
  stateVersion: STATE_VERSION,
}
