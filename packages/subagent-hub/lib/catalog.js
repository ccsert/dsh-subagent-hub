// Resolve the plugin configuration into the runtime catalog: indexed routes, named agents with
// stable official preset ids, and the problems that made a row unusable. Pure and testable;
// the Host service only registers what this returns.

import { normalizeDefinition } from './definitions.js'
import { indexRoutes, knownTags } from './router.js'

/** Prefix of every Agent Preset this plugin registers. Also the marker used to own allowlist entries. */
export const AGENT_PRESET_PREFIX = 'hub-agent-'

/** Stable official preset id of one named agent. No fingerprint: the id is written into the profile. */
export function presetIdOf(agentId) {
  return `${AGENT_PRESET_PREFIX}${agentId}`
}

/**
 * @param {{ routes: Array<Record<string, unknown>>, agents: Array<Record<string, unknown>> }} config
 * @returns {{
 *   routes: Map<string, any>,
 *   agents: any[],
 *   byPreset: Map<string, any>,
 *   tags: string[],
 *   problems: string[],
 * }}
 */
export function buildCatalog(config) {
  const { routes, problems: routeProblems } = indexRoutes(config.routes ?? [])
  const problems = [...routeProblems.map(problem => `routes: ${problem}`)]
  const agents = []
  const byPreset = new Map()
  for (const [index, raw] of (config.agents ?? []).entries()) {
    let agent
    try {
      agent = normalizeDefinition(raw, `agents[${index}]`)
    } catch (error) {
      problems.push(String(error?.message ?? error))
      continue
    }
    const missing = (agent.routes ?? []).filter(id => !routes.has(id))
    if (missing.length > 0) {
      problems.push(`agent "${agent.id}" names unknown route${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`)
      continue
    }
    const presetId = presetIdOf(agent.id)
    if (byPreset.has(presetId)) {
      problems.push(`duplicate agent id "${agent.id}"`)
      continue
    }
    const entry = { ...agent, presetId }
    agents.push(entry)
    byPreset.set(presetId, entry)
  }
  return { routes, agents, byPreset, tags: knownTags(routes), problems }
}
