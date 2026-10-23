// Named agent definitions from layered sources; the nearest layer wins by id (D1).
// Sources: profile (plugin config) < workspace (<cwd>/<workspaceDir>/*.y?ml) < session (M3).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { load } from 'js-yaml'

const ID = /^[a-z][a-z0-9-]{0,47}$/

/**
 * Normalize one raw definition; throws with the source in the message.
 * @returns {import('./router.js').AgentDefinition}
 */
export function normalizeDefinition(raw, source) {
  if (raw === null || typeof raw !== 'object') throw new Error(`${source}: definition must be a mapping`)
  const { id, description, instructions = '', routes, needs, basePreset = 'standard' } = raw
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`${source}: id must match ${ID}`)
  if (typeof description !== 'string' || description.trim() === '') throw new Error(`${source}: "${id}" needs a description`)
  if (typeof instructions !== 'string') throw new Error(`${source}: "${id}" instructions must be a string`)
  const list = (value, field) => {
    if (value === undefined) return undefined
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`${source}: "${id}" ${field} must be a list of strings`)
    return value
  }
  return { id, description: description.trim(), instructions, routes: list(routes, 'routes'), needs: list(needs, 'needs'), basePreset, source }
}

/**
 * Read workspace definitions. A directory that does not exist is empty; a broken file is
 * reported, not fatal, so one typo cannot disable every agent.
 * @returns {{ agents: import('./router.js').AgentDefinition[], errors: string[] }}
 */
export function readWorkspaceDefinitions(cwd, dir) {
  const root = join(cwd, dir)
  let names
  try {
    names = readdirSync(root).filter(name => /\.ya?ml$/.test(name)).sort()
  } catch {
    return { agents: [], errors: [] }
  }
  const agents = []
  const errors = []
  for (const name of names) {
    const path = join(root, name)
    try {
      const parsed = load(readFileSync(path, 'utf8'))
      for (const raw of Array.isArray(parsed) ? parsed : [parsed]) agents.push(normalizeDefinition(raw, `workspace:${path}`))
    } catch (error) {
      errors.push(String(error?.message ?? error))
    }
  }
  return { agents, errors }
}

/** Merge layers, later layers overriding earlier ones by id; order follows first appearance. */
export function mergeLayers(...layers) {
  const merged = new Map()
  for (const layer of layers) for (const agent of layer) merged.set(agent.id, agent)
  return [...merged.values()]
}

/** Stable short fingerprint of everything that shapes an agent's preset. */
export function fingerprint(agent) {
  return createHash('sha256').update(JSON.stringify([agent.basePreset, agent.instructions])).digest('hex').slice(0, 10)
}
