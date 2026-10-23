// `subagentHub` session projection, folded from durable `tool/result.meta` (the log stays the
// only source of truth): every `delegate` routing record, and every named agent defined in
// this Session through `define_subagent` (the session layer of D1).
import { z } from 'zod'

export const PROJECTION_KEY = 'subagentHub'
export const META_KEY = 'subagentHub'
export const DEFINE_META_KEY = 'subagentHubDefine'
const STATE_VERSION = 2

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

const definitionSchema = z.object({
  id: z.string(),
  description: z.string(),
  instructions: z.string(),
  routes: z.array(z.string()).optional(),
  needs: z.array(z.string()).optional(),
  basePreset: z.string(),
  persisted: z.enum(['session', 'workspace', 'profile']),
  seq: z.number(),
})

const stateSchema = z.object({ runs: z.array(runSchema), definitions: z.record(z.string(), definitionSchema) })

export const init = () => ({ runs: [], definitions: {} })

const recordOf = (event, key) => {
  if (event.type !== 'tool/result' || event.data.error !== undefined) return undefined
  const record = event.data.meta?.[key]
  return record !== null && typeof record === 'object' ? record : undefined
}

/** Pure fold; events it ignores return the same state reference. */
export function apply(state, event) {
  const run = recordOf(event, META_KEY)
  if (run !== undefined) {
    const parsed = runSchema.omit({ callId: true, seq: true, time: true }).safeParse(run)
    if (!parsed.success) return state
    return {
      ...state,
      runs: [...state.runs, { ...parsed.data, callId: String(event.data.message.toolCallId), seq: event.seq, time: event.time }],
    }
  }
  const defined = recordOf(event, DEFINE_META_KEY)
  if (defined !== undefined) {
    const parsed = definitionSchema.omit({ seq: true }).safeParse(defined)
    if (!parsed.success) return state
    return { ...state, definitions: { ...state.definitions, [parsed.data.id]: { ...parsed.data, seq: event.seq } } }
  }
  return state
}

export const definition = {
  key: PROJECTION_KEY,
  stateSchema,
  init,
  apply,
  wire: { viewSchema: stateSchema, view: state => state },
  stateVersion: STATE_VERSION,
}
