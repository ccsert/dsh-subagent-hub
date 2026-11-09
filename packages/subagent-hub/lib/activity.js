import { z } from 'zod'

// Per-session activity digest for the agent overview: what the child was asked, what it is doing
// now, its own plan, its last report, and a short step trail. Folded from committed history so a
// reload shows the same words. Previews are bounded; tool arguments contribute only short,
// descriptive fields (never commands, file contents, or messages other than a child's report).

export const ACTIVITY_PROJECTION = 'subagentHubActivity'
export const ACTIVITY_RECENT_LIMIT = 12
const TASK_LIMIT = 600
const TEXT_LIMIT = 600
const HINT_LIMIT = 96
const TODO_LIMIT = 24
const PENDING_LIMIT = 16
const ARGUMENT_PARSE_LIMIT = 64 * 1024
const USAGE_ROUTE_LIMIT = 16
const ROUTE_NAME_LIMIT = 512
const tokenSchema = z.number().finite().nonnegative()
const bucketsSchema = z.object({
  uncachedInputTokens: tokenSchema,
  outputTokens: tokenSchema,
  cacheReadTokens: tokenSchema,
  cacheWriteTokens: tokenSchema,
})
const routeSchema = z.object({ provider: z.string().min(1).max(ROUTE_NAME_LIMIT), model: z.string().min(1).max(ROUTE_NAME_LIMIT) })
const usageSchema = routeSchema.extend({ requests: z.number().int().nonnegative(), ...bucketsSchema.shape })
/** Tools whose message argument is the child's own report to another agent. */
const REPORT_TOOLS = new Set(['send_message'])

const textSchema = z.object({ text: z.string().max(TEXT_LIMIT + 1), time: z.number() })
const stepSchema = z.object({ name: z.string(), hint: z.string().max(HINT_LIMIT + 1).optional(), ok: z.boolean(), time: z.number(), ms: z.number().nonnegative() })
const pendingSchema = z.object({ callId: z.string(), name: z.string(), hint: z.string().max(HINT_LIMIT + 1).optional(), since: z.number() })
const viewSchema = z.object({
  task: textSchema.optional(),
  inbox: textSchema.optional(),
  pending: z.array(pendingSchema).max(PENDING_LIMIT),
  recent: z.array(stepSchema).max(ACTIVITY_RECENT_LIMIT),
  tools: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  todos: z.array(z.object({ content: z.string().max(161), status: z.string() })).max(TODO_LIMIT).optional(),
  output: textSchema.optional(),
  report: textSchema.optional(),
  approval: z.object({ tool: z.string(), since: z.number() }).optional(),
  /** Effort the last request actually ran with; `defaulted` when the adapter chose it. */
  effort: z.object({ value: z.string(), defaulted: z.boolean() }).optional(),
  usage: z.array(usageSchema).max(USAGE_ROUTE_LIMIT).optional(),
  last: z.number().optional(),
  end: z.object({ kind: z.string(), time: z.number() }).optional(),
})
const stateSchema = z.object({
  view: viewSchema,
  /** First prompt of the turn that is still open, kept across a fork seed's descriptor reset. */
  openPrompt: textSchema.optional(),
  usageRoute: routeSchema.optional(),
  usageLast: z.object({
    turn: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    step: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    routeIndex: z.number().int().nonnegative().max(USAGE_ROUTE_LIMIT - 1).nullable(),
    buckets: bucketsSchema,
  }).optional(),
})

const EMPTY_VIEW = { pending: [], recent: [], tools: 0, errors: 0, retries: 0 }

/** Space-join text blocks, collapse whitespace, and cap with an ellipsis. */
export function previewText(content, limit = TEXT_LIMIT) {
  if (typeof content === 'string') content = [{ type: 'text', text: content }]
  let text = ''
  for (const block of Array.isArray(content) ? content : []) {
    if (block?.type !== 'text' || typeof block.text !== 'string') continue
    text += `${text === '' ? '' : ' '}${block.text.slice(0, limit * 2)}`
    if (text.length >= limit * 2) break
  }
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > limit ? `${normalized.slice(0, limit - 1).trimEnd()}…` : normalized
}

function clip(value, limit = HINT_LIMIT) {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\s+/g, ' ').trim()
  if (text === '') return undefined
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text
}

function shortPath(value) {
  if (typeof value !== 'string' || value === '') return undefined
  const parts = value.split('/').filter(Boolean)
  return clip(parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : value)
}

function shortUrl(value) {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return clip(`${url.host}${url.pathname === '/' ? '' : url.pathname}`)
  } catch {
    return undefined
  }
}

function parseArguments(raw) {
  if (raw !== null && typeof raw === 'object') return raw
  if (typeof raw !== 'string' || raw.length > ARGUMENT_PARSE_LIMIT) return undefined
  try {
    const value = JSON.parse(raw)
    return value !== null && typeof value === 'object' ? value : undefined
  } catch {
    return undefined
  }
}

/** One short, descriptive label for a tool call; never a command line or a file body. */
export function toolHint(name, raw) {
  const args = parseArguments(raw)
  if (args === undefined) return undefined
  return clip(args.description) ?? clip(args.subject) ?? clip(args.title)
    ?? shortPath(args.file_path) ?? shortPath(args.path)
    ?? clip(args.pattern) ?? shortUrl(args.url)
    ?? clip(args.query) ?? (Array.isArray(args.queries) ? clip(args.queries[0]) : undefined)
    ?? clip(args.skill) ?? (name === 'send_message' ? clip(args.target) : clip(args.name) ?? clip(args.target)) ?? clip(args.cd)
}

function reportOf(name, raw) {
  if (!REPORT_TOOLS.has(name)) return undefined
  const args = parseArguments(raw)
  const text = previewText(args?.message ?? '', TEXT_LIMIT)
  return text === '' ? undefined : text
}

function todosOf(todos) {
  if (!Array.isArray(todos)) return undefined
  return todos.slice(0, TODO_LIMIT)
    .filter(todo => typeof todo?.content === 'string')
    .map(todo => ({ content: clip(todo.content, 160), status: typeof todo.status === 'string' ? todo.status : 'pending' }))
}

const touch = (view, time) => (Number.isFinite(time) ? { ...view, last: time } : view)

/** Match token-meter's usage-projection.js:60-116: message usage wins, otherwise the
 * last raw stream usage settles message/attempt alike. Only the latest (turn, step)
 * is replaceable; surface rewrites and interrupted messages still consumed tokens.
 * retry-started closes that slot, so a billed retry adds rather than replaces.
 */
function foldUsage(state, event) {
  const { turn, step, stream } = event.data ?? {}
  if (!Number.isSafeInteger(turn) || turn < 0 || !Number.isSafeInteger(step) || step < 0) return state
  let sample = event.type === 'assistant/message' ? event.data?.usage : undefined
  if (sample === undefined && Array.isArray(stream)) {
    for (let index = stream.length - 1; index >= 0; index--) {
      if (stream[index]?.type === 'chunk' && stream[index].chunk?.type === 'usage') {
        sample = stream[index].chunk.usage
        break
      }
    }
  }
  if (sample === undefined || sample === null) return state
  const buckets = { uncachedInputTokens: sample.inputTokens, outputTokens: sample.outputTokens,
    cacheReadTokens: sample.cacheReadTokens ?? 0, cacheWriteTokens: sample.cacheWriteTokens ?? 0 }
  if (!Object.values(buckets).every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) return state
  const previous = state.usageLast?.turn === turn && state.usageLast.step === step ? state.usageLast : undefined
  if (previous && Object.keys(buckets).every(key => previous.buckets[key] === buckets[key])) return state
  if (!previous && !state.usageRoute) return state
  const usage = [...(state.view.usage ?? [])]
  let routeIndex = previous?.routeIndex ?? null
  if (!previous) {
    routeIndex = usage.findIndex(row => row.provider === state.usageRoute.provider && row.model === state.usageRoute.model)
    if (routeIndex === -1) {
      // Keep the first 16 routes in order; discard later routes, retaining the replacement
      // slot with a null index so an update cannot leak their usage onto a tracked route.
      routeIndex = usage.length < USAGE_ROUTE_LIMIT ? usage.length : null
      if (routeIndex !== null) usage.push({ ...state.usageRoute, requests: 0,
        uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
    }
  }
  if (routeIndex !== null) {
    const row = usage[routeIndex]
    const next = { ...row, requests: row.requests + (previous ? 0 : 1) }
    for (const key of Object.keys(buckets)) next[key] = row[key] - (previous?.buckets[key] ?? 0) + buckets[key]
    if (!Object.values(next).filter(value => typeof value === 'number').every(Number.isFinite)) return state
    usage[routeIndex] = next
  }
  // RequestHeaderReason is initial/resume/change/series (typert.host.js:3496).
  // agent-loop buildRequest (index.js:1029-1044) omits unchanged headers for ordinary
  // calls. Count settlements with valid usage once per attempt, not header records;
  // attempts without provider usage cannot contribute to this usage accounting.
  return { ...state, view: routeIndex === null ? state.view : { ...state.view, usage },
    usageLast: { turn, step, routeIndex, buckets } }
}

export function activityFold(state, event) {
  const view = state.view
  const time = event.time
  switch (event.type) {
    case 'subagent/descriptor':
      // A fork seed replays the parent's history before the child's own descriptor: start over,
      // keeping only the prompt of the turn that is open right now (the child's own task).
      return { view: { ...EMPTY_VIEW, ...(state.openPrompt ? { task: state.openPrompt } : {}), ...(Number.isFinite(time) ? { last: time } : {}) }, openPrompt: state.openPrompt }
    case 'turn/start': {
      const { end: _end, ...rest } = view
      return { ...state, view: touch(rest, time), openPrompt: undefined }
    }
    case 'user/message': {
      const text = previewText(event.data?.content, TASK_LIMIT)
      if (text === '') return state
      const entry = { text, time }
      const openPrompt = state.openPrompt ?? entry
      if (view.task === undefined) return { ...state, view: touch({ ...view, task: entry }, time), openPrompt }
      return { ...state, view: touch({ ...view, inbox: entry }, time), openPrompt }
    }
    case 'assistant/attempt':
      return foldUsage(state, event)
    case 'assistant/message': {
      const next = foldUsage(state, event)
      const text = previewText(event.data?.message?.content)
      const updated = text === '' ? touch(next.view, time) : touch({ ...next.view, output: { text, time } }, time)
      return updated === next.view ? next : { ...next, view: updated }
    }
    case 'llm/retry-started': {
      if (state.usageLast?.turn !== event.data?.turn || state.usageLast?.step !== event.data?.step) return state
      const { usageLast: _usageLast, ...rest } = state
      return rest
    }
    case 'tool/call': {
      const { callId, name, arguments: raw } = event.data ?? {}
      if (typeof callId !== 'string' || typeof name !== 'string') return state
      const hint = toolHint(name, raw)
      const pending = [...view.pending.filter(call => call.callId !== callId), { callId, name, ...(hint ? { hint } : {}), since: time }].slice(-PENDING_LIMIT)
      const report = reportOf(name, raw)
      return { ...state, view: touch({ ...view, pending, tools: view.tools + 1, ...(report ? { report: { text: report, time } } : {}) }, time) }
    }
    case 'tool/result': {
      const callId = event.data?.message?.toolCallId
      const call = view.pending.find(item => item.callId === callId)
      if (call === undefined) return state
      const ok = event.data.message.isError !== true && event.data.error === undefined
      const step = { name: call.name, ...(call.hint ? { hint: call.hint } : {}), ok, time, ms: Math.max(0, time - call.since) }
      return { ...state, view: touch({ ...view, pending: view.pending.filter(item => item.callId !== callId),
        recent: [...view.recent, step].slice(-ACTIVITY_RECENT_LIMIT), errors: view.errors + (ok ? 0 : 1) }, time) }
    }
    case 'todo/write': {
      const todos = todosOf(event.data?.todos)
      return todos === undefined ? state : { ...state, view: touch({ ...view, todos }, time) }
    }
    case 'approval/asked':
      return { ...state, view: touch({ ...view, approval: { tool: String(event.data?.toolName ?? 'tool'), since: time } }, time) }
    case 'approval/decided': {
      const { approval: _approval, ...rest } = view
      return { ...state, view: touch(rest, time) }
    }
    case 'request/header': {
      // The native modelSelection view omits an adapter-defaulted effort; the header keeps it.
      const header = event.data?.header
      const value = header?.config?.reasoningEffort
      const effort = typeof value === 'string' && value !== '' ? { value, defaulted: header?.adapterDefaults?.reasoningEffort === true } : undefined
      const parsedRoute = routeSchema.safeParse({ provider: header?.config?.provider, model: header?.config?.model })
      const usageRoute = parsedRoute.success ? parsedRoute.data : undefined
      const sameRoute = usageRoute?.provider === state.usageRoute?.provider && usageRoute?.model === state.usageRoute?.model
      const sameEffort = effort?.value === view.effort?.value && effort?.defaulted === view.effort?.defaulted
      if (sameRoute && sameEffort) return state
      const { effort: _effort, ...rest } = view
      return { ...state, usageRoute, view: sameEffort ? view : effort === undefined ? rest : { ...rest, effort } }
    }
    case 'llm/retry':
      return { ...state, view: touch({ ...view, retries: view.retries + 1 }, time) }
    case 'turn/end': {
      // Calls left open by a cancelled turn never get a result; drop them so nothing looks stuck.
      const { approval: _approval, ...rest } = view
      return { ...state, view: touch({ ...rest, pending: [], end: { kind: String(event.data?.reason?.kind ?? 'unknown'), time } }, time), openPrompt: undefined }
    }
    default:
      return state
  }
}

export const activityProjection = {
  key: ACTIVITY_PROJECTION, stateVersion: 3, stateSchema,
  init: () => ({ view: EMPTY_VIEW }),
  apply: activityFold,
  wire: { viewSchema, view: state => state.view, summary: false },
}
