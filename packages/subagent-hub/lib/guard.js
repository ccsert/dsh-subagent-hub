// Pure route-constraint verdict for the official delegation tool.
// The official tool exposes `agent_preset` from its static `allowedAgentPresets`; this guard
// closes the remaining gap: a named agent that declares `routes` may not run on another model.

import { routeLabel } from './router.js'

export const GUARD_PREFIX = 'subagent-hub:'

/**
 * @typedef {import('./router.js').Route} Route
 * @typedef {{ id: string, presetId: string, routes?: string[] }} GuardAgent
 * @typedef {{ routes: Map<string, Route>, byPreset: Map<string, GuardAgent> }} GuardCatalog
 * @typedef {{ provider?: unknown, model?: unknown, agent_preset?: unknown }} GuardArguments
 */

/**
 * Effective child route for one call: explicit provider/model, or the route the child would
 * inherit from its parent. A half-specified pair is left to the official tool's own pairing error.
 * @param {GuardArguments} args
 * @param {any} parent
 * @returns {{ provider: string, model: string, source: 'requested' | 'inherited parent' } | undefined}
 */
export function effectiveRoute(args, parent) {
  const provider = typeof args.provider === 'string' && args.provider !== '' ? args.provider : undefined
  const model = typeof args.model === 'string' && args.model !== '' ? args.model : undefined
  if (provider !== undefined && model !== undefined) return { provider, model, source: 'requested' }
  if (provider !== undefined || model !== undefined) return undefined
  const inherited = parentOptions(parent)
  if (inherited === undefined) return undefined
  if (typeof inherited.provider !== 'string' || typeof inherited.model !== 'string') return undefined
  return { provider: inherited.provider, model: inherited.model, source: 'inherited parent' }
}

/** Parent options without requiring the subagent package at module load (forward-compatible). */
function parentOptions(parent) {
  if (parent === undefined) return undefined
  const session = parent.session
  try {
    const fromSession = session?.requestHeader?.()?.config
    if (fromSession !== undefined && typeof fromSession === 'object') return fromSession
  } catch {
    // fall through to creation options
  }
  return parent.options
}

/**
 * Whether one delegation must be refused because the session already runs too many children.
 * `limit` is the plugin's per-session cap; 0 (or less) means unlimited.
 * @param {{ toolName: string, delegationTools: string[], limit: number, running: number }} input
 * @returns {string | undefined} a model-readable rejection reason, or undefined to allow.
 */
export function concurrencyVerdict({ toolName, delegationTools, limit, running }) {
  if (!Number.isFinite(limit) || limit <= 0) return undefined
  if (!delegationTools.includes(toolName)) return undefined
  if (running < limit) return undefined
  return `${GUARD_PREFIX} 这个会话已有 ${running} 个子 agent 正在运行（上限 ${limit}）。等其中一个结束后再派发，或者自己把剩下的工作做完。`
}

/**
 * Whether one official delegation call must be rejected.
 * @param {{ arguments?: GuardArguments, parent?: any, catalog: GuardCatalog }} input
 * @returns {string | undefined} a model-readable rejection reason, or undefined to allow.
 */
export function guardVerdict({ arguments: args, parent, catalog }) {
  const presetId = args?.agent_preset
  if (typeof presetId !== 'string') return undefined
  const agent = catalog.byPreset.get(presetId)
  if (agent === undefined) return undefined
  const declared = agent.routes ?? []
  if (declared.length === 0) return undefined

  const allowed = []
  const missing = []
  for (const id of declared) {
    const route = catalog.routes.get(id)
    if (route === undefined) missing.push(id)
    else allowed.push(route)
  }
  if (missing.length > 0) {
    return `${GUARD_PREFIX} named agent "${agent.id}" references unknown route${missing.length > 1 ? 's' : ''} ${missing.map(id => `"${id}"`).join(', ')}; fix the dsh-subagent-hub configuration before delegating to it.`
  }
  const requested = effectiveRoute(args ?? {}, parent)
  if (requested === undefined) return undefined
  if (allowed.some(route => route.provider === requested.provider && route.model === requested.model)) return undefined

  const labels = allowed.map(routeLabel).join(', ')
  const explicit = allowed.map(route => route.id).join(', ')
  if (requested.source === 'inherited parent') {
    return `${GUARD_PREFIX} named agent "${agent.id}" is limited to routes ${labels}, but the child would inherit the parent route ${requested.provider}/${requested.model}. Pass \`provider\` and \`model\` together, choosing one of: ${labels} (route ids: ${explicit}).`
  }
  return `${GUARD_PREFIX} named agent "${agent.id}" is limited to routes ${labels}; requested ${requested.provider}/${requested.model} is not allowed. Choose \`provider\` and \`model\` from: ${labels} (route ids: ${explicit}).`
}
