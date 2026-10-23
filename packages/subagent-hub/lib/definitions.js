// Named agent definitions from the plugin configuration (`agents`).
// v2 registers each definition as an ordinary Agent Preset, so the source is deliberately
// static configuration: the official tool's `allowedAgentPresets` is a fixed list written to
// the profile patch and cannot grow with a session, a workspace, or an external store.

const ID = /^[a-z][a-z0-9-]{0,47}$/

/**
 * Normalize one raw definition; throws with the source in the message.
 * @returns {{ id: string, description: string, instructions: string, routes?: string[], needs?: string[], basePreset: string, source: string }}
 */
export function normalizeDefinition(raw, source) {
  if (raw === null || typeof raw !== 'object') throw new Error(`${source}: definition must be a mapping`)
  const { id, description, instructions = '', routes, needs, basePreset = 'standard' } = raw
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`${source}: id must match ${ID}`)
  if (typeof description !== 'string' || description.trim() === '') throw new Error(`${source}: "${id}" needs a description`)
  if (typeof instructions !== 'string') throw new Error(`${source}: "${id}" instructions must be a string`)
  if (typeof basePreset !== 'string' || basePreset === '') throw new Error(`${source}: "${id}" basePreset must be a preset id`)
  const list = (value, field) => {
    if (value === undefined) return undefined
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`${source}: "${id}" ${field} must be a list of strings`)
    return [...new Set(value)]
  }
  return { id, description: description.trim(), instructions, routes: list(routes, 'routes'), needs: list(needs, 'needs'), basePreset, source }
}
