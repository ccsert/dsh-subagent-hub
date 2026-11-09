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
  last: z.number().optional(),
  end: z.object({ kind: z.string(), time: z.number() }).optional(),
})
const stateSchema = z.object({
  view: viewSchema,
  /** First prompt of the turn that is still open, kept across a fork seed's descriptor reset. */
  openPrompt: textSchema.optional(),
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
      return { view: touch(rest, time), openPrompt: undefined }
    }
    case 'user/message': {
      const text = previewText(event.data?.content, TASK_LIMIT)
      if (text === '') return state
      const entry = { text, time }
      const openPrompt = state.openPrompt ?? entry
      if (view.task === undefined) return { view: touch({ ...view, task: entry }, time), openPrompt }
      return { view: touch({ ...view, inbox: entry }, time), openPrompt }
    }
    case 'assistant/message': {
      const text = previewText(event.data?.message?.content)
      return text === '' ? { ...state, view: touch(view, time) } : { ...state, view: touch({ ...view, output: { text, time } }, time) }
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
      if (effort?.value === view.effort?.value && effort?.defaulted === view.effort?.defaulted) return state
      const { effort: _effort, ...rest } = view
      return { ...state, view: effort === undefined ? rest : { ...rest, effort } }
    }
    case 'llm/retry':
      return { ...state, view: touch({ ...view, retries: view.retries + 1 }, time) }
    case 'turn/end': {
      // Calls left open by a cancelled turn never get a result; drop them so nothing looks stuck.
      const { approval: _approval, ...rest } = view
      return { view: touch({ ...rest, pending: [], end: { kind: String(event.data?.reason?.kind ?? 'unknown'), time } }, time), openPrompt: undefined }
    }
    default:
      return state
  }
}

export const activityProjection = {
  key: ACTIVITY_PROJECTION, stateVersion: 2, stateSchema,
  init: () => ({ view: EMPTY_VIEW }),
  apply: activityFold,
  wire: { viewSchema, view: state => state.view, summary: false },
}
