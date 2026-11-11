import { randomUUID } from 'node:crypto'
import { executeTool } from './execute.js'

export async function runConfigurationChecks(ctx, config, report) {
  const id = 'hub-configurator'
  const handle = await ctx.agents.create({
    sessionId: `session-${randomUUID()}`, agentOptions: ctx.agentDefaultModel.currentSelection(),
    meta: { cwd: config.cwd, agentPreset: id },
    setup: async scope => { await ctx.agentPresets.mount(scope, id) },
  })
  const agent = handle.agent
  const call = (name, args = {}) => executeTool(ctx, { callId: `call-${randomUUID()}`, name, arguments: args, agent, signal: new AbortController().signal })
  const read = await call('hub_configuration_read')
  if (read.isError) throw new Error(`Configuration read: ${read.error?.message}`)
  const before = read.value
  const role = { id: 'configured-builder', name: '功能开发', description: 'Implement the requested changes', instructions: 'HUB-CONFIGURATION-MARKER Read before editing.', routes: [before.configuration.routes[0].id] }
  const args = { expected_revision: before.revision, changes: { agents: [...before.configuration.agents, role] } }
  const preview = await call('hub_configuration_update', args)
  const unchanged = await call('hub_configuration_read')
  const saved = await call('hub_configuration_update', { ...args, dry_run: false })
  if (saved.isError) throw new Error(`Configuration save: ${saved.error?.message}`)
  await ctx.subagentHub.whenSettled()
  const after = await call('hub_configuration_read')
  const stale = await call('hub_configuration_update', { ...args, dry_run: false })
  const rolePreset = (await ctx.agentPresets.list()).find(row => row.id === 'hub-agent-configured-builder')
  const restore = await call('hub_configuration_update', { expected_revision: after.value.revision, changes: { agents: before.configuration.agents }, dry_run: false })
  if (restore.isError) throw new Error(`Configuration restore: ${restore.error?.message}`)
  await ctx.subagentHub.whenSettled()
  report.configuration = {
    registered: report.presets.includes(id), schema: ctx.tools.schemas(agent).map(tool => tool.name), model: agent.options,
    read: { revision: before.revision, routeCount: before.configuration.routes.length, catalogGroups: before.models.groups.length },
    preview: preview.value, previewUnchanged: JSON.stringify(unchanged.value.configuration) === JSON.stringify(before.configuration),
    saved: saved.value, registeredRole: rolePreset && { id: rolePreset.id, name: rolePreset.name, broken: rolePreset.broken },
    stale: { isError: stale.isError, reason: stale.error?.message },
    restored: !(await ctx.agentPresets.list()).some(row => row.id === 'hub-agent-configured-builder'),
  }
}
