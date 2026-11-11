// Durable, plugin-owned Team assignments. Never change native Team/session formats.
import { z } from 'zod'

export const TEAM_ROUTING_PROJECTION = 'subagentHubTeamRouting'
export const TEAM_BINDING_RECORD = 'plugin:dsh-subagent-hub/team-binding'
export const TEAM_ASSIGNMENT_RECORD = 'plugin:dsh-subagent-hub/team-assignment'
export const HUB_TEAM_TOOL = 'hub_spawn_teammate'
export const TEAM_BACKENDS = { fresh: 'hub-team-spawn', fork: 'hub-team-fork' }
export const TEAM_BINDING_LIMIT = 128

const text = z.string().min(1)
export const teamSelectionSchema = z.object({ provider: text, model: text, reasoningEffort: text.optional() }).strict()
const roleSchema = z.object({ id: text, name: z.string().optional(), instructions: z.string().max(32768) }).strict()
export const teamBindingSchema = z.object({
  version: z.literal(1), token: text, rootId: text, name: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(64),
  routeId: text, selection: teamSelectionSchema, context: z.enum(['fresh', 'fork']),
  role: roleSchema.optional(), childId: text.optional(),
  phase: z.enum(['planned', 'prepared', 'bound', 'failed', 'cancelled']),
}).strict().superRefine((binding, ctx) => {
  if (['prepared', 'bound'].includes(binding.phase) && !binding.childId) ctx.addIssue({ code: 'custom', message: 'Prepared Team assignments require an exact child ID' })
  if (binding.phase === 'planned' && binding.childId) ctx.addIssue({ code: 'custom', message: 'A planned Team assignment cannot already name a child' })
})
const stateSchema = z.object({
  sessionId: z.string(), bindings: z.array(teamBindingSchema).max(TEAM_BINDING_LIMIT),
  assignment: teamBindingSchema.nullable(),
})

/** Whole binding snapshots are keyed by token; copied fork records cannot bind a new identity. */
export function teamRoutingFold(state, event) {
  if (event.ignorable !== true || ![TEAM_BINDING_RECORD, TEAM_ASSIGNMENT_RECORD].includes(event.type)) return state
  const parsed = teamBindingSchema.safeParse(event.data)
  if (!parsed.success) throw new Error('subagent-hub: invalid persisted Team model assignment')
  const binding = parsed.data
  if (event.type === TEAM_ASSIGNMENT_RECORD) {
    if (binding.childId !== state.sessionId) return state
    if (binding.phase !== 'bound') throw new Error('subagent-hub: incomplete child Team assignment')
    if (state.assignment && !sameTeamAssignment(state.assignment, binding)) throw new Error('subagent-hub: a Team child cannot change assignment identity')
    return { ...state, assignment: binding }
  }
  if (binding.rootId !== state.sessionId) return state
  const previous = state.bindings.find(row => row.token === binding.token)
  if (previous && (previous.name !== binding.name || previous.routeId !== binding.routeId
    || previous.context !== binding.context || JSON.stringify(previous.selection) !== JSON.stringify(binding.selection)
    || JSON.stringify(previous.role) !== JSON.stringify(binding.role)
    || previous.childId && previous.childId !== binding.childId)) throw new Error('subagent-hub: Team assignment identity changed in history')
  const bindings = state.bindings.filter(row => row.token !== binding.token)
  if (binding.phase !== 'cancelled') bindings.push(binding)
  if (bindings.length > TEAM_BINDING_LIMIT) throw new Error('subagent-hub: too many persisted Team assignments')
  return { ...state, bindings }
}

export const teamRoutingProjection = {
  key: TEAM_ROUTING_PROJECTION, stateVersion: 1, stateSchema,
  init: header => ({ sessionId: String(header.id), bindings: [], assignment: null }),
  apply: teamRoutingFold,
  // No wire view: role instruction snapshots and pre-creation tokens stay Host-side.
}

export function sameTeamSelection(left, right) {
  return left?.provider === right.provider && left?.model === right.model
    && left?.reasoningEffort === right.reasoningEffort
}

export function sameTeamAssignment(left, right) {
  return ['token', 'rootId', 'name', 'routeId', 'context', 'childId'].every(key => left[key] === right[key])
    && sameTeamSelection(left.selection, right.selection) && JSON.stringify(left.role) === JSON.stringify(right.role)
}

/** Live route limits may narrow an existing assignment, but never silently retarget it. */
export function teamAssignmentProblem(binding, catalog) {
  const route = catalog.routes.get(binding.routeId)
  if (!route || route.provider !== binding.selection.provider || route.model !== binding.selection.model) {
    return `Team member "${binding.name}" is bound to route "${binding.routeId}", which was removed or changed. Restore that route or create a new member; no fallback model was started.`
  }
  if (binding.role) {
    const role = catalog.agents.find(role => role.id === binding.role.id)
    if (!role) return `Team role "${binding.role.id}" is no longer configured; restore the role or create a new member.`
    if (role.routes?.length && !role.routes.includes(binding.routeId)) return `Team role "${role.id}" no longer permits route "${binding.routeId}".`
  }
  return undefined
}
