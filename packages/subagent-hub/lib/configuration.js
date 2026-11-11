// Shared contract for the optional, model-neutral native configuration mode.
import { z } from 'zod'
import { buildCatalog } from './catalog.js'

export const CONFIGURATION_PRESET_ID = 'hub-configurator'
export const CONFIGURATION_NAMESPACE = 'subagent-hub'
export const CONFIGURATION_FIELDS = ['routes', 'agents', 'maxConcurrent', 'showAgentOverview', 'manageOfficialSettings']

const text = z.string().trim().min(1)
const route = z.object({
  id: text, provider: text, model: text, reasoningEffort: text.optional(),
  tags: z.array(text).optional(), note: z.string().optional(),
}).strict()
const agent = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/), name: text.optional(), description: text,
  instructions: z.string().optional(), routes: z.array(text).optional(),
  needs: z.array(text).optional(), basePreset: text.optional(),
}).strict()
export const configurationPatchSchema = z.object({
  routes: z.array(route).optional(), agents: z.array(agent).optional(),
  maxConcurrent: z.number().int().nonnegative().optional(),
  showAgentOverview: z.boolean().optional(), manageOfficialSettings: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Specify at least one Hub setting')

export function configurationValue(value) {
  return Object.fromEntries(CONFIGURATION_FIELDS.filter(key => Object.hasOwn(value, key)).map(key => [key, structuredClone(value[key])]))
}

/** Validate the entire resulting catalog, including unchanged role references. */
export function configurationChange(current, input) {
  const patch = configurationPatchSchema.parse(input)
  const value = { ...configurationValue(current), ...patch }
  const catalog = buildCatalog(value)
  if (catalog.problems.length) throw new Error(catalog.problems.join('; '))
  return { patch, value, fields: Object.keys(patch), ops: Object.entries(patch).map(([key, value]) => ({ op: 'set', path: [key], value })) }
}

export const CONFIGURATION_INSTRUCTIONS = `You are the Subagent Hub configuration assistant, a native DSH mode. Respond in the user's language.
Help users select child models, design named roles and their instructions, and adjust Hub settings. The Lead is the current main conversation and may use any configured model; never bind it to GPT or another vendor.
1. Start by calling hub_configuration_read. Use its exact model/provider IDs, existing roles, base presets, revision and runtime limitations; never invent model IDs or claim catalog tags prove pricing.
2. For role design, clarify only missing requirements that affect the result. Propose a concise purpose, working instructions, allowed routes and base preset. A consultation or design request alone does not request a saved change: show the proposal or call hub_configuration_update with dry_run=true.
3. When the user explicitly requests a change or asks to save a proposed design, use hub_configuration_update with dry_run=false and the latest expected_revision. Arrays replace that one list, so preserve unrelated entries. Update role references in the same change when renaming or removing a route. Do not edit files or other plugins.
4. If a revision conflict occurs, reread and reconcile the user's intent with the new settings; never silently retry a stale whole list. Report only successful writes as saved. The settings page and this mode edit the same Hub configuration.
5. Explain relevant effects: new models and roles require a new top-level conversation; disabling official configuration management stops syncing but leaves prior writes intact. Use the read tool's teamRouting capability and limitations to describe Team support. Where supported, hub_spawn_teammate selects a configured route and optionally applies role instructions and route limits; it preserves native tool composition, cannot apply a custom basePreset, and never retargets existing members when configuration changes. Never invent model inputs for native spawn_teammate or claim support when teamRouting.supported is false.
Finish with the concrete changes and any needed next action. Do not switch the Lead model or start delegated work while configuring.`

export function configurationPreset() {
  return {
    id: CONFIGURATION_PRESET_ID, name: 'Hub 配置助手',
    description: '通过对话配置子智能体模型、设计角色与调整 Hub 设置；使用用户选择的模型。', order: 9990,
    plugins: [
      { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: CONFIGURATION_INSTRUCTIONS } },
      { id: 'native-tools', name: '@deepseek-ai/dsh-tool-executor-native' },
      { id: 'hub-configuration', name: 'dsh-subagent-hub/configuration-assistant' },
    ],
  }
}
