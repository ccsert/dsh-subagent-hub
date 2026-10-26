// Pure route-constraint verdict for the official delegation tool.
// The official tool exposes `agent_preset` from its static `allowedAgentPresets`; this guard
// closes the remaining gap: a named agent that declares `routes` may not run on another model.

import { LAYERS, compareLayers, describePairs, includesPair, routePairs } from './policy.js'
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

export const CREATION_TOOLS = ['subagent', 'subagent_fork', 'spawn_teammate']

export function modelSelectionAvailable(parameters) {
  const properties = parameters?.properties ?? {}
  return Object.hasOwn(properties, 'provider') && Object.hasOwn(properties, 'model')
}

/**
 * Check the actual route of every supported creation tool against the configured
 * child allowlist. Tool capabilities decide whether model arguments are effective;
 * extra arguments on a model-less fork/Team tool cannot disguise inheritance.
 *
 * Two lists are consulted, and a rejection names the one that refused. The Session's captured
 * allowlist (`sessionPolicy`) is checked first: the official runtime enforces it after this
 * guard and never refreshes it, so a route outside it cannot start a child even when the live
 * configuration now allows it.
 */
export function creationRouteVerdict({ toolName, arguments: args, parent, catalog, parameters,
  configured = catalog.routes.size > 0, sessionPolicy }) {
  if (!CREATION_TOOLS.includes(toolName) || !configured) return undefined
  const allowed = [...catalog.routes.values()]
  const configLabels = describePairs(routePairs(allowed))
  if (allowed.length === 0) return `${GUARD_PREFIX} ${toolName} cannot verify its child model: the ${LAYERS.config} has no valid routes. Fix the Hub route configuration before delegating.`
  const canSelectModel = modelSelectionAvailable(parameters)
  if (canSelectModel) {
    const provider = typeof args?.provider === 'string' && args.provider !== ''
    const model = typeof args?.model === 'string' && args.model !== ''
    if (provider !== model) return undefined // the native tool reports its pairing error
  }
  const route = effectiveRoute(canSelectModel ? args ?? {} : {}, parent)
  const mode = toolName === 'spawn_teammate' ? ` (${args?.context === 'fork' ? 'fork' : 'fresh'})` : ''
  const call = `${toolName}${mode}`
  const actual = route === undefined ? 'an unconfirmed model' : `${route.provider}/${route.model}`
  const alternative = canSelectModel
    ? 'Choose provider and model from the allowed routes.'
    : toolName === 'spawn_teammate'
      ? 'This spawn_teammate schema has no provider/model selector. Both fresh and fork inherit the Lead model; changing context does not choose a different model. Use a delegation tool only if its actual schema exposes model selection, or select an allowed Lead model before using Teams.'
      : `This ${toolName} schema has no provider/model selector and inherits the parent model. Use a delegation tool only if its actual schema exposes model selection, or select an allowed parent model first.`

  // Layer 2: the allowlist this Session captured when it started.
  const layers = compareLayers(allowed, sessionPolicy)
  if (route !== undefined && layers.session.length > 0 && !includesPair(layers.session, route.provider, route.model)) {
    const fresh = 'only a new top-level Session captures the current list again: a new child started under this Session inherits the list above'
    const hint = canSelectModel && includesPair(layers.config, route.provider, route.model)
      ? `The ${LAYERS.config} allows this route, but this Session keeps the older list; ${fresh}.`
      : canSelectModel
        ? `The ${LAYERS.config} allows ${configLabels}; choose one of those, or change the configuration, whereupon ${fresh}.`
        : `${alternative} The ${LAYERS.config} allows ${configLabels}, but this Session keeps the older list; ${fresh}.`
    const drift = layers.notInSession.length > 0
      ? ` The live configuration additionally allows ${describePairs(layers.notInSession)}, which only a new Session can use.`
      : ''
    return `${GUARD_PREFIX} refused by the ${LAYERS.session}, captured when this Session started: ${describePairs(layers.session)}. The call ${call} would use ${actual}.${drift} No child was started. ${hint}`
  }

  if (route !== undefined && allowed.some(allowed => allowed.provider === route.provider && allowed.model === route.model)) return undefined
  return `${GUARD_PREFIX} refused by the ${LAYERS.config}, which allows ${configLabels}. The call ${call} would use ${actual}. No child was started. ${alternative}`
}

/**
 * Whether one official delegation call must be rejected.
 * @param {{ arguments?: GuardArguments, parent?: any, catalog: GuardCatalog }} input
 * @returns {string | undefined} a model-readable rejection reason, or undefined to allow.
 */
export function guardVerdict({ arguments: args, parent, catalog, canSelectModel = true }) {
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
  const layer = `This is the ${LAYERS.agent}, which can only narrow the ${LAYERS.config}.`
  if (requested.source === 'inherited parent') {
    const guidance = canSelectModel
      ? `Pass \`provider\` and \`model\` together, choosing one of: ${labels} (route ids: ${explicit}).`
      : 'This tool has no provider/model selector. Use a tool whose actual schema supports model selection, or an allowed parent model; do not pass unsupported model arguments.'
    return `${GUARD_PREFIX} named agent "${agent.id}" is limited to routes ${labels}, but the child would inherit the parent route ${requested.provider}/${requested.model}. ${guidance} ${layer}`
  }
  return `${GUARD_PREFIX} named agent "${agent.id}" is limited to routes ${labels}; requested ${requested.provider}/${requested.model} is not allowed. Choose \`provider\` and \`model\` from: ${labels} (route ids: ${explicit}). ${layer}`
}
