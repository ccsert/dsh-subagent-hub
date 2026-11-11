// Agent-scoped tools: mounted only by the bundled native configuration preset.
import { defineTool } from '@deepseek-ai/dsh-tools'
import { CONFIGURATION_NAMESPACE, CONFIGURATION_PRESET_ID, configurationChange, configurationValue } from './configuration.js'

export const name = 'hub-configuration-assistant'
export const inject = ['tools', 'settings', 'subagentHub', 'llm', 'agentPresets']
const note = '模型与角色变更从新的顶层会话起生效；不会切换 Lead 模型。关闭托管只停止同步，已写入的官方配置会保留。'

function descriptor(ctx) {
  const view = ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === CONFIGURATION_NAMESPACE)
  if (!view) throw new Error('Subagent Hub configuration is unavailable in this profile')
  return view
}
function requireMode(exec) {
  if (exec.agent?.session?.header?.agentPreset !== CONFIGURATION_PRESET_ID) throw new Error('Hub configuration tools are only available in the Hub 配置助手 mode')
}
async function modelCatalog(ctx) {
  const results = await Promise.allSettled(ctx.llm.listProviders().map(async provider => ({
    id: provider.id, name: provider.name,
    models: (await ctx.llm.listModels(provider.id)).map(model => ({ id: model.id, ...(model.name === undefined ? {} : { name: model.name }), ...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }) })),
  })))
  return { groups: results.filter(row => row.status === 'fulfilled').map(row => row.value), unavailable: results.filter(row => row.status === 'rejected').length }
}
const basePresets = async ctx => (await ctx.agentPresets.list()).filter(row => !row.broken && row.id !== CONFIGURATION_PRESET_ID && !row.id.startsWith('hub-agent-')).map(({ id, name }) => ({ id, ...(name === undefined ? {} : { name }) }))
const output = { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] }

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'hub_configuration_read',
    description: 'Read the current Hub settings, exact available model IDs, base presets, optimistic revision and Team limitations. Read before designing or editing roles. Does not read credentials or write configuration.',
    parameters: {}, output,
    async execute(_args, exec) {
      requireMode(exec)
      const [models, presets] = await Promise.all([modelCatalog(ctx), basePresets(ctx)])
      const view = descriptor(ctx)
      const teamRouting = ctx.subagentHub.teamRouting?.capabilities(exec.agent) ?? { supported: false }
      return { revision: view.revision, writable: ctx.settings.writable, configuration: configurationValue(view.value), models, basePresets: presets,
        teamRouting,
        limitations: ['Lead 使用当前会话模型，不限定供应商。',
          teamRouting.supported
            ? '支持的 Team 工作会话可使用 hub_spawn_teammate 显式选择 Hub 路由；原生 spawn_teammate 仍沿用其自身接口。Team 角色仅应用指令和路由范围，不切换基础预设或工具组合。'
            : '当前 profile 未提供 Hub 跨模型 Team 所需的公开接口；原生 Team 工具仍按自身接口继承模型。', note] }
    },
    presentCall: () => ({ card: 'generic', kind: 'read', title: '读取 Hub 配置' }),
  }))
  ctx.tools.register(defineTool({
    name: 'hub_configuration_update',
    description: 'Validate or save ONLY Hub routes, roles, concurrency, overview and official-config management. changes is a partial object; supplied arrays replace their whole list, so preserve unrelated entries. Unknown fields, invalid references and stale revisions are rejected. dry_run defaults to true; set false only for a user-requested saved change.',
    parameters: {
      expected_revision: { type: 'integer', required: true, description: 'Current revision from hub_configuration_read.' },
      changes: { type: 'json', required: true, description: 'Partial Hub configuration: routes, agents, maxConcurrent, showAgentOverview, manageOfficialSettings. No other keys.' },
      dry_run: { type: 'boolean', description: 'true (default): preview without writing; false: save requested changes.' },
    }, output,
    async execute(args, exec) {
      requireMode(exec)
      const view = descriptor(ctx)
      if (!Number.isInteger(args.expected_revision) || args.expected_revision !== view.revision) throw new Error('SETTINGS_CONFLICT: reread Hub configuration before applying changes')
      const change = configurationChange(view.value, args.changes)
      const [models, presets] = await Promise.all([modelCatalog(ctx), basePresets(ctx)])
      const oldPairs = new Set((view.value.routes ?? []).map(row => JSON.stringify([row.provider, row.model])))
      for (const route of change.value.routes ?? []) {
        if (!oldPairs.has(JSON.stringify([route.provider, route.model])) && !models.groups.some(group => group.id === route.provider && group.models.some(model => model.id === route.model))) throw new Error(`Model is not available: ${route.provider}/${route.model}. Read the model catalog and choose an exact available ID.`)
      }
      for (const role of change.value.agents ?? []) {
        if (!presets.some(preset => preset.id === (role.basePreset ?? 'standard'))) throw new Error(`Base preset is unavailable: ${role.basePreset ?? 'standard'}`)
      }
      if (args.dry_run !== false) return { saved: false, dryRun: true, revision: view.revision, changedFields: change.fields, configuration: change.value, note }
      if (!ctx.settings.writable) throw new Error('Hub configuration is read-only in this profile')
      await ctx.settings.mutate(CONFIGURATION_NAMESPACE, change.ops, args.expected_revision)
      return { saved: true, revision: descriptor(ctx).revision, changedFields: change.fields, configuration: configurationValue(descriptor(ctx).value), note }
    },
    presentCall: args => ({ card: 'generic', kind: args.dry_run === false ? 'edit' : 'read', title: args.dry_run === false ? '保存 Hub 配置' : '预览 Hub 配置变更' }),
  }))
}
