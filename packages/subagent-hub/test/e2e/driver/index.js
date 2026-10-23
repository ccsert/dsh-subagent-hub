// E2E driver: exercises the installed hub inside a real (isolated) web profile and writes a
// report. Children never reach a real model: `llm/stream` is intercepted, so each child resolves
// its route through the official preflight and then answers with scripted text.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

export const name = 'hub-e2e-driver'
export const inject = [
  'agents', 'agentPresets', 'tools', 'agentDefaultModel', 'subagentModelSelection',
  'systemPrompt', 'configEditor', 'subagentHub',
]

const TOOL_PACKAGE = '@deepseek-ai/dsh-tool-subagent'

const textOf = message => (message.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('')

/** A minimal provider stream: one text block, usage, finish. */
async function* scripted(text) {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text }
  yield { type: 'block-end', index: 0, block: { type: 'text', text } }
  yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

/** Collect every row of a preset document, recursing into `cordis:group` children. */
function flattenRows(rows) {
  const all = []
  const walk = (list) => {
    for (const row of list) {
      all.push(row)
      if (Array.isArray(row?.config)) walk(row.config)
    }
  }
  walk(rows)
  return all
}

export function apply(ctx, config) {
  const report = { checks: {} }
  const requests = new Map()
  const children = new Map()
  const flush = () => writeFileSync(config.out, JSON.stringify(report, null, 2))

  ctx.on('llm/stream', () => scripted('child done'))

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
      prompt: assembly.sections.map(section => section.text).join('\n'),
    })
    report.children = [...children.values()].map(child => child.preset)
    flush()
  })

  const waitFor = async (probe, ms = 15000) => {
    for (const deadline = Date.now() + ms; Date.now() < deadline; await new Promise(resolve => setTimeout(resolve, 100))) {
      const value = probe()
      if (value !== undefined) return value
    }
    return undefined
  }

  const main = async () => {
    try {
      report.hub = await ctx.subagentHub.ready
      report.official = await ctx.subagentHub.officialSettingsReady
      report.presets = (await ctx.agentPresets.list()).map(preset => preset.id)
      report.parentModel = ctx.agentDefaultModel.currentSelection()
      report.modelSelection = ctx.subagentModelSelection.current()

      // The official preset rows the plugin rewrote: spawn row gets the allowlist, fork row keeps
      // its own configuration (the runtime rejects preset selection on fork children).
      const standard = load((await ctx.agentPresets.readDocument('standard')).content, { schema: entryListSchema })
      report.standardRows = flattenRows(standard)
        .filter(row => row?.name === TOOL_PACKAGE)
        .map(row => ({ id: row.id, provider: row.config?.provider, allow: row.config?.allowedAgentPresets, models: row.config?.modelSelectionSettings }))
      report.presetDescription = (await ctx.agentPresets.list()).find(preset => preset.id === 'hub-agent-reviewer')?.description

      // Main agent: the official `subagent` schema plus the catalog section.
      const handle = await ctx.agents.create({
        sessionId: `session-${randomUUID()}`,
        agentOptions: report.parentModel,
        meta: { cwd: config.cwd, agentPreset: 'standard' },
        setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'standard') },
      })
      const root = handle.agent
      const schema = ctx.tools.schemas(root).find(item => item.name === 'subagent')
      const properties = schema?.parameters?.properties ?? {}
      report.subagentSchema = {
        parameters: Object.keys(properties),
        presetEnum: properties.agent_preset?.enum,
        providerDescription: properties.provider?.description,
      }
      const assembly = await ctx.systemPrompt.assemble({ scope: root })
      report.rootSection = assembly.sections.find(section => section.name === 'dsh-subagent-hub')?.text

      const call = async (args) => {
        const result = await ctx.tools.execute({
          callId: `call-${randomUUID()}`,
          name: 'subagent',
          arguments: { description: 'e2e', prompt: 'HUB-E2E-CHILD work', ...args },
          agent: root,
          signal: new AbortController().signal,
        })
        if (result.isError) return { isError: true, message: result.error?.message ?? textOf({ content: result.content }) }
        const id = result.value.subagentId
        await waitFor(() => children.get(id))
        const request = await waitFor(() => requests.get(id))
        return { isError: false, id, preset: children.get(id)?.preset, prompt: children.get(id)?.prompt, request }
      }

      // Route guard: `pro` is a legal official model but outside reviewer's declared routes.
      report.checks.outOfRoute = await call({ agent_preset: 'hub-agent-reviewer', provider: 'deepseek-official', model: 'deepseek-v4-pro' })
      // Named agent with an explicit allowed route: the preset and its persona must win.
      report.checks.namedAllowed = await call({ agent_preset: 'hub-agent-reviewer', provider: 'deepseek-official', model: 'deepseek-flash' })
      // Named agent that omits the route inherits the parent route (flash), which is allowed.
      report.checks.namedInherited = await call({ agent_preset: 'hub-agent-reviewer' })
      // A generic child is not route-confined: the guard must not restrict it.
      report.checks.generic = await call({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })

      report.profilePatch = readFileSync(config.profilePatch, 'utf8')
    } catch (error) {
      report.fatal = String(error?.stack ?? error)
    }
    report.done = true
    flush()
  }
  setTimeout(main, 0)
}
