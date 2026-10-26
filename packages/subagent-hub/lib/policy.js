// A delegation is measured against two route lists that can disagree. The plugin reads its own
// configuration on every call; the official runtime captured a copy of the allowlist into each
// Session when that Session started and never rewrites it. These helpers compare the two and
// phrase which list refused a call, so a rejection names its layer and lists that layer's routes.

import { routeLabel } from './router.js'

/** Layer labels shared by every rejection that names its source. */
export const LAYERS = {
  /** Live plugin configuration, read on each call. */
  config: 'Hub route configuration (layer 1/2)',
  /** The allowlist the official runtime recorded into this Session when it started. */
  session: 'Session model allowlist (layer 2/2)',
  /** One named agent's own narrowing of the configured routes. */
  agent: 'named-agent route limit',
}

/** Session projection key the official subagent tool records its captured allowlist under. */
export const SESSION_POLICY_KEY = 'subagentModelSelectionPolicy'

const SEP = '\u0000'

/** Stable key of one exact route pair. */
export function pairKey(provider, model) {
  return `${provider}${SEP}${model}`
}

/**
 * Exact, unique `{provider, model}` pairs from a loose route list. Entries without both a
 * non-empty provider and model are dropped instead of being treated as a wildcard.
 * @param {unknown} list
 * @returns {Array<{ provider: string, model: string }>}
 */
export function routePairs(list) {
  const pairs = []
  const seen = new Set()
  for (const item of Array.isArray(list) ? list : []) {
    const provider = item?.provider
    const model = item?.model
    if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') continue
    const key = pairKey(provider, model)
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push({ provider, model })
  }
  return pairs
}

/** Whether one exact route is present in a pair list. */
export function includesPair(pairs, provider, model) {
  return pairs.some(pair => pair.provider === provider && pair.model === model)
}

/** Model-facing list of exact routes; an empty list reads as `none`, never as "anything". */
export function describePairs(pairs) {
  return pairs.length === 0 ? 'none' : pairs.map(routeLabel).join(', ')
}

/** Whether two pair lists describe the same set, in any order. */
export function samePairs(left, right) {
  if (left.length !== right.length) return false
  const keys = new Set(left.map(pair => pairKey(pair.provider, pair.model)))
  return right.every(pair => keys.has(pairKey(pair.provider, pair.model)))
}

/** Pairs present in `left` but absent from `right`. */
export function missingFrom(left, right) {
  return left.filter(pair => !includesPair(right, pair.provider, pair.model))
}

/**
 * Compare the live configuration with one Session's captured allowlist.
 * @param {unknown} configRoutes configured route list (plugin configuration)
 * @param {unknown} sessionRoutes the Session's captured allowlist, or undefined when unknown
 * @returns {{ config: Array<{provider: string, model: string}>, session: Array<{provider: string, model: string}>,
 *   inSync: boolean, notInSession: Array<{provider: string, model: string}>, notInConfig: Array<{provider: string, model: string}> }}
 */
export function compareLayers(configRoutes, sessionRoutes) {
  const config = routePairs(configRoutes)
  const session = routePairs(sessionRoutes)
  return {
    config,
    session,
    inSync: samePairs(config, session),
    // Allowed by the live configuration but missing from this Session's snapshot: reachable only
    // in a new Session.
    notInSession: missingFrom(config, session),
    // Still enforced by this Session but no longer configured: it keeps working here only.
    notInConfig: missingFrom(session, config),
  }
}

/**
 * Prompt-context sentence telling the model that this Session uses an older allowlist. Empty
 * when the Session has no captured allowlist (nothing to compare) or the two layers agree.
 * @param {ReturnType<typeof compareLayers>} layers
 */
export function sessionPolicyNotice(layers) {
  if (layers.session.length === 0 || layers.inSync) return ''
  const parts = [`This Session captured its child model allowlist when it started: ${describePairs(layers.session)}.`]
  if (layers.notInSession.length > 0) {
    parts.push(`The live Hub route configuration also allows ${describePairs(layers.notInSession)}; those routes are reachable only from a new top-level Session.`)
  }
  if (layers.notInConfig.length > 0) {
    parts.push(`It still allows ${describePairs(layers.notInConfig)}, which the current configuration no longer lists.`)
  }
  parts.push('Do not retry a refused route in this Session: only a new top-level Session captures the current list, because a child started under this one inherits the list above.')
  return `Child model routes changed after this Session started (${LAYERS.session}). ${parts.join(' ')}`
}

/**
 * Named agents whose declared routes are missing from the allowlist a Session would capture.
 * Reported when presets are registered, not when someone calls them.
 * @param {{ agents: Array<any>, routes: Map<string, any> }} catalog
 * @param {unknown} allowedModels the allowlist new Sessions would capture, or undefined when unknown
 * @returns {Array<{ presetId: string, agentId: string, outside: string[], missing: string[], allowed: string[], text: string }>}
 */
export function presetRouteProblems(catalog, allowedModels) {
  const allowed = routePairs(allowedModels)
  if (allowed.length === 0) return []
  const problems = []
  for (const agent of catalog?.agents ?? []) {
    const declared = agent.routes ?? []
    if (declared.length === 0) continue // an unconstrained agent can use any allowlisted route
    const routes = declared.map(id => catalog.routes.get(id)).filter(route => route !== undefined)
    const outside = routes.filter(route => !includesPair(allowed, route.provider, route.model))
    if (outside.length === 0) continue
    const missing = outside.map(route => route.id)
    const labels = outside.map(routeLabel)
    problems.push({
      presetId: agent.presetId,
      agentId: agent.id,
      outside: labels,
      missing,
      allowed: allowed.map(routeLabel),
      text: `named agent "${agent.id}" (${agent.presetId}) declares route${missing.length > 1 ? 's' : ''} `
        + `${labels.join(', ')} outside the allowlist a new Session would capture (${describePairs(allowed)}); `
        + 'sessions refuse it before the child starts. Enable manageOfficialSettings, or add it to the official '
        + 'subagent model allowlist, then start a new Session.',
    })
  }
  return problems
}
