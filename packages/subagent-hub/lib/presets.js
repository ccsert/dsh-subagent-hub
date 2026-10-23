// Derive one Agent Preset plugin list from a shipped preset (spike S2b, still valid in v2).
// Rows are matched by package name only, never by position or id.

export const OFFICIAL_DELEGATION_PACKAGE = '@deepseek-ai/dsh-tool-subagent'
export const PERSONA_PACKAGE = '@deepseek-ai/dsh-persona'

const isGroup = row => row !== null && typeof row === 'object' && Array.isArray(row.config)

/**
 * Remove every official delegation-tool row, recursing into groups.
 * @returns {{ rows: any[], dropped: string[] }}
 */
function stripDelegation(rows) {
  const dropped = []
  const walk = (list) => {
    const kept = []
    for (const row of list) {
      if (row?.name === OFFICIAL_DELEGATION_PACKAGE) {
        dropped.push(row.id)
        continue
      }
      kept.push(isGroup(row) ? { ...row, config: walk(row.config) } : row)
    }
    return kept
  }
  const result = walk(rows)
  return { rows: result, dropped }
}

/**
 * A named agent's preset: the base composition without any delegation tool (named-agent
 * children do not delegate) and with the agent's instructions appended to the persona prefix.
 * @param {any[]} baseRows parsed plugin rows of the base preset.
 * @param {string} instructions
 */
export function deriveAgentPreset(baseRows, instructions) {
  const { rows, dropped } = stripDelegation(baseRows)
  let personaFound = false
  const withPersona = list => list.map((row) => {
    if (row?.name === PERSONA_PACKAGE && !personaFound) {
      personaFound = true
      const prefix = row.config?.prefix ?? ''
      return { ...row, config: { ...row.config, prefix: instructions ? `${prefix}\n\n${instructions}` : prefix } }
    }
    return isGroup(row) ? { ...row, config: withPersona(row.config) } : row
  })
  const plugins = withPersona(rows)
  if (!personaFound && instructions) plugins.unshift({ id: 'persona', name: PERSONA_PACKAGE, config: { prefix: instructions } })
  return { plugins, dropped }
}
