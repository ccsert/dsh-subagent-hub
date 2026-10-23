// Route table: validation, capability tags, and the official `allowedModels` projection.
// v2 never chooses a model; the table is only an allowlist plus model-facing metadata.

/**
 * @typedef {{ id: string, provider: string, model: string, reasoningEffort?: string, tags: string[], note?: string }} Route
 */

/**
 * Index the configured routes, reporting (not throwing) unusable rows so one typo cannot
 * disable every route.
 * @param {Array<Record<string, unknown>>} rawRoutes
 * @returns {{ routes: Map<string, Route>, problems: string[] }}
 */
export function indexRoutes(rawRoutes) {
  const routes = new Map()
  const problems = []
  const pairs = new Set()
  for (const [index, raw] of (rawRoutes ?? []).entries()) {
    if (raw === null || typeof raw !== 'object') {
      problems.push(`routes[${index}]: route must be a mapping`)
      continue
    }
    const { id, provider, model, reasoningEffort, tags, note } = raw
    if (typeof id !== 'string' || id === '') {
      problems.push(`routes[${index}]: route needs an id`)
      continue
    }
    if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') {
      problems.push(`route "${id}": provider and model must be non-empty strings`)
      continue
    }
    if (routes.has(id)) {
      problems.push(`duplicate route id "${id}"`)
      continue
    }
    const pair = `${provider}\0${model}`
    if (pairs.has(pair)) {
      problems.push(`route "${id}" repeats ${provider}/${model}`)
      continue
    }
    pairs.add(pair)
    routes.set(id, {
      id,
      provider,
      model,
      tags: [...new Set(Array.isArray(tags) ? tags.filter(tag => typeof tag === 'string') : [])],
      ...(typeof reasoningEffort === 'string' && reasoningEffort !== '' ? { reasoningEffort } : {}),
      ...(typeof note === 'string' && note !== '' ? { note } : {}),
    })
  }
  return { routes, problems }
}

/** Every tag the route table advertises, sorted. @param {Map<string, Route>} routes */
export function knownTags(routes) {
  return [...new Set([...routes.values()].flatMap(route => route.tags))].sort()
}

/** The official `subagent-model-selection` allowlist: exact provider/model pairs, table order. */
export function allowedModels(routes) {
  return [...routes.values()].map(route => ({ provider: route.provider, model: route.model }))
}

/** Model-facing `provider/model` label. */
export function routeLabel(route) {
  return `${route.provider}/${route.model}`
}

/** Human/model-facing route summary used by the prompt and the guard rejection. */
export function routeSummary(route) {
  const tags = route.tags.length > 0 ? ` [${route.tags.join(', ')}]` : ''
  const note = route.note === undefined ? '' : ` (${route.note})`
  return `${routeLabel(route)}${tags}${note}`
}
