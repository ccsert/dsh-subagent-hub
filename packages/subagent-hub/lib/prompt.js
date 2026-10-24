// Model-facing catalog section: which named agent to use for what, and which model carries
// which capability tags. v2 only informs the official delegation tool; it never dispatches.

import { allowedModels, routeLabel, routeSummary } from './router.js'

/**
 * @typedef {import('./router.js').Route} Route
 * @typedef {import('./guard.js').GuardAgent & { description: string, needs?: string[] }} PromptAgent
 * @typedef {{ routes: Map<string, Route>, agents: PromptAgent[], tags: string[], problems: string[] }} PromptCatalog
 * @typedef {{ name: string, agentPreset: boolean, model: boolean }} DelegationInputs
 * @typedef {{ agentPreset: boolean, model: boolean, independent?: DelegationInputs[], team?: { model: boolean } }} PromptParameters
 */

/**
 * Compose the section text. Parameters that the official tool does not expose in this
 * composition are described as informational instead of inviting a failing call.
 * @param {{ catalog: PromptCatalog, params: PromptParameters, limit?: number }} input
 * @returns {string} section markdown, or '' when there is nothing to say.
 */
export function promptSection({ catalog, params, limit = 0, limitTools = ['subagent', 'subagent_fork'] }) {
  const { agents, routes, tags, problems } = catalog
  if (agents.length === 0 && routes.size === 0) return ''
  const lines = ['## Choosing a subagent']
  if (params.team !== undefined && params.independent?.length === 0) {
    lines.push('This session exposes Agent Teams without an independent subagent creation tool. The named-agent catalog is informational here; use only the inputs present on the visible tool.')
  } else {
    lines.push(guidance(params))
  }
  if (params.team !== undefined) {
    if (params.team.model) {
      lines.push('`spawn_teammate` exposes model selection in this composition; choose provider and model from the configured child routes.')
    } else {
      lines.push('`spawn_teammate` has no `provider`, `model`, or `agent_preset` input in this runtime. Both `context=fresh` and `context=fork` inherit the Lead model; context selects history, not a different model. The Hub rejects a teammate whose inherited model is outside the configured child routes.')
      const alternatives = (params.independent ?? []).filter(tool => tool.model).map(tool => `\`${tool.name}\``)
      if (alternatives.length > 0) lines.push(`For an explicit child model requirement, use ${alternatives.join(' or ')} with the provider/model inputs its schema exposes.`)
      else lines.push('No visible independent delegation tool exposes model selection. If the inherited model cannot satisfy the requested model requirement, explain this limitation before delegating; do not start a different model and apologize afterwards.')
    }
  }
  if (agents.length > 0) {
    lines.push('', 'Named agents:')
    for (const agent of agents) {
      const details = []
      const needs = [...new Set([...(agent.needs ?? []), ...declaredTags(routes, agent.routes)])]
      if (needs.length > 0) details.push(`tags: ${needs.join(', ')}`)
      details.push(`routes: ${describeRoutes(routes, agent.routes)}`)
      lines.push(`- \`${agent.presetId}\` — ${agent.description} (${details.join('; ')}).`)
    }
  }
  if (routes.size > 0) {
    lines.push('', 'Models:')
    for (const route of routes.values()) {
      const tagsPart = route.tags.length > 0 ? ` — tags: ${route.tags.join(', ')}` : ''
      const notePart = route.note === undefined ? '' : `; ${route.note}`
      lines.push(`- \`${routeLabel(route)}\`${tagsPart}${notePart}`)
    }
    if (tags.length > 0) lines.push(`Capability tags: ${tags.map(tag => `\`${tag}\``).join(', ')}.`)
    lines.push('The configured child route list applies to `subagent`, `subagent_fork`, and `spawn_teammate`, including inherited models. If the parent model is not listed, use a tool that actually exposes provider/model to select an allowed child route.')
    const restricted = agents.some(agent => (agent.routes?.length ?? 0) > 0)
    if (restricted) lines.push('When a named agent lists routes, the child `provider`/`model` must be one of that agent\'s routes; any other route is rejected before the child starts.')
  }
  if (limit > 0) {
    if (params.team !== undefined) {
      const covered = (params.independent ?? []).filter(tool => limitTools.includes(tool.name)).map(tool => `\`${tool.name}\``)
      if (covered.length > 0) lines.push('', `The Hub per-session concurrency cap is ${limit}, enforced on ${covered.join(', ')}. Team creation follows the native Team capacity setting.`)
    } else {
      lines.push('', `At most ${limit} child agents may run at the same time in one Session; a delegation beyond that is refused, so wait for one to finish instead of queueing more.`)
    }
  }
  if (problems.length > 0) lines.push('', `Ignored configuration problems: ${problems.join('; ')}`)
  return lines.join('\n')
}

/** One-line instruction keyed to the parameters the official tool currently exposes. */
function guidance({ agentPreset, model }) {
  if (agentPreset && model) {
    return 'Pass `agent_preset` to choose a named agent, and `provider` plus `model` together to choose the child model. Pick the model by capability tags; never invent a model id or a provider id that is not listed here.'
  }
  if (agentPreset) {
    return 'Pass `agent_preset` to choose a named agent. This composition does not expose child `provider`/`model`; children inherit the parent route.'
  }
  if (model) {
    return 'Pass `provider` plus `model` together to choose the child model. No named-agent parameter is exposed in this composition.'
  }
  return 'These official delegation tools expose neither `agent_preset` nor `provider`/`model`. The catalog below is informational; set `manageOfficialSettings: true` on dsh-subagent-hub (or configure the official allowlists yourself) to make it actionable.'
}

/** Tags advertised by the routes an agent is confined to. */
function declaredTags(routes, routeIds) {
  if (routeIds === undefined || routeIds.length === 0) return []
  return [...new Set(routeIds.flatMap(id => routes.get(id)?.tags ?? []))]
}

/** Route ids with their concrete provider/model; an empty declaration means "any configured model". */
function describeRoutes(routes, routeIds) {
  if (routeIds === undefined || routeIds.length === 0) {
    const labels = allowedModels(routes).map(route => `${route.provider}/${route.model}`)
    return labels.length === 0 ? 'any configured model' : `any configured model (${labels.join(', ')})`
  }
  return routeIds
    .map((id) => {
      const route = routes.get(id)
      return route === undefined ? `${id} (unknown)` : `${id} = ${routeSummary(route)}`
    })
    .join(', ')
}
