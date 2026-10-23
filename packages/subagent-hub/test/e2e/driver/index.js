// E2E driver: exercises the installed hub inside a real (isolated) web profile and writes a report.
// Children never reach a model: no credentials exist, so each fails at its first request,
// after `agent/request` has exposed the exact provider/model it would have used.
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

export const name = 'hub-e2e-driver'
export const inject = ['agents', 'agentPresets', 'tools', 'systemPrompt', 'subagentHub', 'agentDefaultModel']

const PARENT_PRESET = 'standard+hub'

export function apply(ctx, config) {
  const report = { checks: {} }
  const requests = new Map()
  const children = new Map()
  const flush = () => writeFileSync(config.out, JSON.stringify(report, null, 2))

  ctx.on('agent/request', async function (payload, next) {
    const resolved = await next()
    requests.set(payload.agent.id, `${resolved.provider}/${resolved.model}`)
    return resolved
  })
  ctx.on('agent/created', async ({ agent }) => {
    if (agent.session.header.parentSession === undefined) return
    const assembly = await ctx.systemPrompt.assemble({ scope: agent })
    children.set(agent.id, {
      preset: agent.session.header.agentPreset,
      tools: ctx.tools.schemas(agent).map(schema => schema.name),
      prompt: assembly.sections.map(section => section.text).join('\n'),
    })
  })

  const waitFor = async (probe, ms = 15000) => {
    for (const deadline = Date.now() + ms; Date.now() < deadline; await new Promise(resolve => setTimeout(resolve, 100))) {
      const value = probe()
      if (value !== undefined) return value
    }
    return undefined
  }

  const delegate = async (root, args) => {
    const tool = ctx.tools.get('delegate', root)
    try {
      const value = await tool.execute(args, { agent: root, signal: new AbortController().signal })
      const id = value.subagentId
      const child = await waitFor(() => children.get(id))
      const request = await waitFor(() => requests.get(id))
      return { value, request, preset: child?.preset, hasDelegate: child?.tools.includes('delegate'), hasSubagent: child?.tools.includes('subagent'), prompt: child?.prompt }
    } catch (error) {
      return { error: String(error?.message ?? error) }
    }
  }

  const main = async () => {
    try {
      report.hub = await ctx.subagentHub.ready
      report.presets = (await ctx.agentPresets.list()).map(preset => preset.id)
      report.parentModel = ctx.agentDefaultModel.currentSelection()

      const handle = await ctx.agents.create({
        sessionId: `session-${randomUUID()}`,
        agentOptions: report.parentModel,
        meta: { cwd: config.cwd, agentPreset: PARENT_PRESET },
        setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, PARENT_PRESET) },
      })
      const root = handle.agent
      const tools = ctx.tools.schemas(root).map(schema => schema.name)
      report.rootTools = { delegate: tools.includes('delegate'), subagent: tools.includes('subagent'), subagent_fork: tools.includes('subagent_fork'), send_message: tools.includes('send_message') }
      const assembly = await ctx.systemPrompt.assemble({ scope: root })
      report.rootSection = assembly.sections.find(section => section.name === 'subagent-hub')?.text

      report.checks.byTag = await delegate(root, { description: 'tag', prompt: 'x', needs: ['reasoning'] })
      report.checks.inherit = await delegate(root, { description: 'inherit', prompt: 'x' })
      report.checks.profileAgent = await delegate(root, { description: 'review', prompt: 'x', agent: 'reviewer' })
      report.checks.workspaceAgent = await delegate(root, { description: 'scout', prompt: 'x', agent: 'scout' })
      report.checks.unknownAgent = await delegate(root, { description: 'nope', prompt: 'x', agent: 'ghost' })
      report.checks.confined = await delegate(root, { description: 'confined', prompt: 'x', agent: 'reviewer', needs: ['vision'] })
    } catch (error) {
      report.fatal = String(error?.stack ?? error)
    }
    report.done = true
    flush()
  }
  setTimeout(main, 0)
}
