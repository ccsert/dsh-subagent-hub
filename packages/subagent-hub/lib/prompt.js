// Model-facing catalog section: which named agent to use for what, and which model carries
// which capability tags, including the optional plugin-owned native Team routing entry.

import { sessionPolicyNotice } from './policy.js'
import { allowedModels, routeLabel, routeSummary } from './router.js'

/**
 * @typedef {import('./router.js').Route} Route
 * @typedef {import('./guard.js').GuardAgent & { description: string, needs?: string[] }} PromptAgent
 * @typedef {{ routes: Map<string, Route>, agents: PromptAgent[], tags: string[], problems: string[] }} PromptCatalog
 * @typedef {{ name: string, agentPreset: boolean, model: boolean }} DelegationInputs
 * @typedef {{ agentPreset: boolean, model: boolean, independent?: DelegationInputs[], team?: { model: boolean, agentPreset?: boolean, effort?: boolean, hubRouting?: boolean } }} PromptParameters
 */

/**
 * Compose the section text. Parameters that the official tool does not expose in this
 * composition are described as informational instead of inviting a failing call.
 * `layers` carries the comparison between the live configuration and this Session's captured
 * allowlist, so a route that only a new Session can use is never advertised as available here.
 * @param {{ catalog: PromptCatalog, params: PromptParameters, limit?: number, limitTools?: string[],
 *   layers?: import('./policy.js').ReturnType<typeof import('./policy.js').compareLayers> }} input
 * @returns {string} section markdown, or '' when there is nothing to say.
 */
export function promptSection({ catalog, params, limit = 0, limitTools = ['subagent', 'subagent_fork'], layers }) {
  const { agents, routes, tags, problems } = catalog
  if (agents.length === 0 && routes.size === 0) return ''
  const lines = ['## Choosing a subagent']
  if (params.team !== undefined && params.independent?.length === 0) {
    lines.push(params.team.hubRouting
      ? 'This session exposes native Agent Teams and the Hub explicit-route creation entry. Use `hub_spawn_teammate` for an independently selected member model.'
      : params.team.agentPreset
      ? 'This session exposes Agent Teams without an independent subagent creation tool. Choose a named role with `spawn_teammate.agent_preset`; the teammate name is its identity, not its role preset.'
      : 'This session exposes Agent Teams without an independent subagent creation tool. The named-agent catalog is informational here; use only the inputs present on the visible tool.')
  } else {
    lines.push(guidance(params))
  }
  if (params.team !== undefined) {
    if (params.team.hubRouting) {
      lines.push('For a durable Team member on a chosen Hub model, call `hub_spawn_teammate` with `name`, `description`, `prompt`, and `route` (the exact Hub route ID listed below). `context=fresh` starts without Lead history; `context=fork` copies completed history; both use the selected route. The Lead keeps its own model.')
      lines.push('Optionally pass `role` as an exact Hub role ID to apply its instruction snapshot and route limits. A member name never implies a role. This entry keeps the native inherited tool composition; roles with a custom basePreset are unsupported. Do not claim it applied a separate Agent Preset.')
      lines.push('Use the returned `target` with native send_message and shared task ownership. Initial-message acceptance is not task completion. The member model is pinned and restored from persisted selection; later configuration changes do not silently retarget existing members.')
      lines.push('The native roster may display the model from inherited creation options rather than later durable model selections. The Hub creation result reports the selected route; actual request records in the Hub overview are the evidence of the model used. Do not infer an actual request from the native roster model label alone.')
    }
    if (params.team.model) {
      lines.push('`spawn_teammate` exposes model selection in this composition; choose provider and model from the configured child routes.')
    } else {
      lines.push(params.team.agentPreset
        ? '`spawn_teammate` has no `provider` or `model` input in this runtime. Both `context=fresh` and `context=fork` inherit the Lead model; context selects history, not a different model. The Hub rejects a teammate whose inherited model is outside the configured child routes.'
        : '`spawn_teammate` has no `provider`, `model`, or `agent_preset` input in this runtime. Both `context=fresh` and `context=fork` inherit the Lead model; context selects history, not a different model. The Hub rejects a teammate whose inherited model is outside the configured child routes.')
      const alternatives = (params.independent ?? []).filter(tool => tool.model).map(tool => `\`${tool.name}\``)
      if (alternatives.length > 0) lines.push(`For an explicit child model requirement, use ${alternatives.join(' or ')} with the provider/model inputs its schema exposes.`)
      else if (!params.team.hubRouting) lines.push('No visible independent delegation tool exposes model selection. If the inherited model cannot satisfy the requested model requirement, explain this limitation before delegating; do not start a different model and apologize afterwards.')
    }
    if (params.team.agentPreset) lines.push('With `context=fresh`, pass `agent_preset` to choose a Hub role for the teammate, and `name` only for its durable Team identity. `context=fork` keeps the inherited composition and cannot select an independent preset. A role\'s route limits apply before the member starts.')
    else if (agents.length > 0 && params.team.model) lines.push('This Team tool has no `agent_preset` input. The named-role catalog is informational for Team creation; do not infer a role from a teammate name.')
  }
  if (agents.length > 0) {
    lines.push('', 'Named agents:')
    for (const agent of agents) {
      const details = []
      const needs = [...new Set([...(agent.needs ?? []), ...declaredTags(routes, agent.routes)])]
      if (needs.length > 0) details.push(`tags: ${needs.join(', ')}`)
      details.push(`routes: ${describeRoutes(routes, agent.routes)}`)
      const teamRole = params.team?.hubRouting ? `; Hub Team role ID: ${JSON.stringify(agent.id)}` : ''
      lines.push(`- \`${agent.presetId}\` — ${agent.description} (${details.join('; ')}${teamRole}).`)
    }
  }
  if (routes.size > 0) {
    lines.push('', 'Models:')
    for (const route of routes.values()) {
      const tagsPart = route.tags.length > 0 ? ` — tags: ${route.tags.join(', ')}` : ''
      const notePart = route.note === undefined ? '' : `; ${route.note}`
      const effortPart = route.reasoningEffort === undefined ? '' : `; default reasoning_effort: ${JSON.stringify(route.reasoningEffort)}`
      const teamRoute = params.team?.hubRouting ? `Hub route ID ${JSON.stringify(route.id)}: ` : ''
      lines.push(`- ${teamRoute}\`${routeLabel(route)}\`${tagsPart}${effortPart}${notePart}`)
    }
    if ([...routes.values()].some(route => route.reasoningEffort !== undefined)) {
      const scope = params.team?.effort
        ? 'The same route default applies to `spawn_teammate`, whose schema exposes `reasoning_effort`; pass it explicitly. Workflow has no such guidance.'
        : 'This route effort guidance does not apply to `spawn_teammate` or `workflow`.'
      lines.push(`When dispatching via \`subagent\` or \`subagent_fork\` whose schema exposes \`reasoning_effort\`, explicitly pass the route default in \`reasoning_effort\` unless the task clearly needs a different effort. Explicit values take precedence. ${scope}`)
    }
    if (tags.length > 0) lines.push(`Capability tags: ${tags.map(tag => `\`${tag}\``).join(', ')}.`)
    lines.push('The configured child route list applies to `subagent`, `subagent_fork`, and `spawn_teammate`, including inherited models. If the parent model is not listed, use a tool that actually exposes provider/model to select an allowed child route.'
      + (params.team?.hubRouting ? ' `hub_spawn_teammate` instead validates its explicit Hub route before creation and checks that assignment before every member step.' : ''))
    // The Session's own snapshot outranks the list above; say so before the model retries.
    const notice = layers === undefined ? '' : sessionPolicyNotice(layers)
    if (notice !== '') lines.push(notice)
    const restricted = agents.some(agent => (agent.routes?.length ?? 0) > 0)
    if (restricted) lines.push('When a named agent lists routes, the child `provider`/`model` must be one of that agent\'s routes; any other route is rejected before the child starts.')
  }
  if (limit > 0) {
    if (params.team !== undefined) {
      const covered = (params.independent ?? []).filter(tool => limitTools.includes(tool.name)).map(tool => `\`${tool.name}\``)
      if (covered.length > 0) lines.push('', `The Hub per-session concurrency cap is ${limit}, enforced on ${covered.join(', ')}. Team creation follows the native Team capacity setting.`)
      if (params.team.hubRouting) lines.push(`The same Hub running-child cap of ${limit} also applies to \`hub_spawn_teammate\`; the native Team member capacity remains a separate limit.`)
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
    const labels = allowedModels(routes).map(routeLabel)
    return labels.length === 0 ? 'any configured model' : `any configured model (${labels.join(', ')})`
  }
  return routeIds
    .map((id) => {
      const route = routes.get(id)
      return route === undefined ? `${id} (unknown)` : `${id} = ${routeSummary(route)}`
    })
    .join(', ')
}
