// Capability-tag routing: turn (named agent, needs) into one concrete child route.
// Pure apart from the injected `probe`, so every rule is unit-testable.

/**
 * @typedef {{ id: string, provider: string, model: string, reasoningEffort?: string, tags: string[], note?: string }} Route
 * @typedef {{ id: string, description: string, instructions: string, routes?: string[], needs?: string[], basePreset: string, source: string }} AgentDefinition
 * @typedef {{ route: string, reason: string }} Rejection
 * @typedef {{ mode: 'inherit', reason: string, rejected: Rejection[] }
 *   | { mode: 'route', route: Route, reason: string, rejected: Rejection[] }} RouteDecision
 */

export class RoutingError extends Error {
  /** @param {string} message @param {Rejection[]} rejected */
  constructor(message, rejected = []) {
    super(message)
    this.name = 'RoutingError'
    this.rejected = rejected
  }
}

/**
 * Validate the route table: unique ids, unique provider/model pairs.
 * @param {Route[]} routes
 * @returns {Map<string, Route>}
 */
export function indexRoutes(routes) {
  const byId = new Map()
  const pairs = new Set()
  for (const route of routes) {
    if (byId.has(route.id)) throw new Error(`subagent-hub: duplicate route id "${route.id}"`)
    const pair = `${route.provider}\0${route.model}`
    if (pairs.has(pair)) throw new Error(`subagent-hub: route "${route.id}" repeats ${route.provider}/${route.model}`)
    pairs.add(pair)
    byId.set(route.id, { ...route, tags: [...new Set(route.tags ?? [])] })
  }
  return byId
}

/** Every tag the route table advertises, sorted. @param {Map<string, Route>} routes */
export function knownTags(routes) {
  return [...new Set([...routes.values()].flatMap(route => route.tags))].sort()
}

/**
 * Candidate routes in preference order. A named agent with `routes` is confined to them (D2);
 * otherwise the whole table is eligible. `needs` (call-time plus the agent's own) filters by tags.
 * @param {Map<string, Route>} routes
 * @param {AgentDefinition | undefined} agent
 * @param {string[]} needs
 */
export function candidates(routes, agent, needs) {
  const wanted = [...new Set([...(agent?.needs ?? []), ...needs])]
  const unknown = wanted.filter(tag => !knownTags(routes).includes(tag))
  if (unknown.length > 0) throw new RoutingError(`unknown capability tag${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}; known: ${knownTags(routes).join(', ') || '(none)'}`)
  let pool
  if (agent?.routes !== undefined && agent.routes.length > 0) {
    pool = agent.routes.map((id) => {
      const route = routes.get(id)
      if (route === undefined) throw new RoutingError(`agent "${agent.id}" names unknown route "${id}"`)
      return route
    })
  } else {
    pool = [...routes.values()]
  }
  return { wanted, pool: pool.filter(route => wanted.every(tag => route.tags.includes(tag))) }
}

/**
 * Choose the first usable candidate; `probe` throws when a route cannot serve right now.
 * With no constraint at all (no agent routes, no tags) the child inherits the parent route.
 * @param {Map<string, Route>} routes
 * @param {AgentDefinition | undefined} agent
 * @param {string[]} needs
 * @param {(route: Route) => Promise<void>} probe
 * @returns {Promise<RouteDecision>}
 */
export async function decide(routes, agent, needs, probe) {
  const constrained = needs.length > 0 || (agent?.needs?.length ?? 0) > 0 || (agent?.routes?.length ?? 0) > 0
  if (!constrained) return { mode: 'inherit', reason: 'no agent routes or capability tags requested; child inherits the parent route', rejected: [] }
  const { wanted, pool } = candidates(routes, agent, needs)
  const scope = agent?.routes?.length ? `agent "${agent.id}" routes` : 'route table'
  if (pool.length === 0) throw new RoutingError(`no route in the ${scope} has all of: ${wanted.join(', ')}`)
  const rejected = []
  for (const route of pool) {
    try {
      await probe(route)
    } catch (error) {
      rejected.push({ route: route.id, reason: String(error?.message ?? error) })
      continue
    }
    const why = wanted.length > 0 ? `first usable route in the ${scope} tagged ${wanted.join(' + ')}` : `first usable route in the ${scope}`
    return { mode: 'route', route, reason: rejected.length > 0 ? `${why} (after ${rejected.length} fallback${rejected.length > 1 ? 's' : ''})` : why, rejected }
  }
  throw new RoutingError(`every candidate route is unavailable (${pool.map(route => route.id).join(', ')})`, rejected)
}

/** Child agentOptions for a decision; `inherit` leaves the parent route untouched. @param {RouteDecision} decision */
export function agentOptionsFor(decision) {
  if (decision.mode === 'inherit') return undefined
  const { provider, model, reasoningEffort } = decision.route
  return { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
}
