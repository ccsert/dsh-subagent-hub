// M0 spike: verify S1 / S2 / S2b against the installed DSH runtime (0.2.1-rc.2).
// Runs inside an isolated web profile, writes a JSON report, never calls a model
// successfully (no credentials are present), and touches no user profile.
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

export const name = 'hub-spike'
export const inject = ['agents', 'agentPresets', 'subagents', 'tools', 'agentDefaultModel']

const SUBAGENT_TOOL_PACKAGE = '@deepseek-ai/dsh-tool-subagent'

/** Drop every row loading the official delegation tool package, recursing into groups. */
function withoutOfficialDelegation(rows, dropped) {
  const kept = []
  for (const row of rows) {
    if (row && row.name === SUBAGENT_TOOL_PACKAGE) {
      dropped.push(row.id)
      continue
    }
    if (row && Array.isArray(row.config)) kept.push({ ...row, config: withoutOfficialDelegation(row.config, dropped) })
    else kept.push(row)
  }
  return kept
}

const toolNames = (ctx, agent) => ctx.tools.schemas(agent).map(schema => schema.name).sort()

async function waitForPreset(ctx, id) {
  for (let i = 0; i < 300; i++) {
    if ((await ctx.agentPresets.list()).some(preset => preset.id === id)) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`preset ${id} never appeared`)
}

async function createRoot(ctx, cwd, preset) {
  const handle = await ctx.agents.create({
    sessionId: `session-${randomUUID()}`,
    agentOptions: ctx.agentDefaultModel.currentSelection(),
    meta: { cwd, agentPreset: preset },
    setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, preset) },
  })
  return handle.agent
}

function attempt(fn) {
  try {
    fn()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

export function apply(ctx, config) {
  const report = { runtime: {}, s1: {}, s2: {}, s2b: {} }
  const flush = () => writeFileSync(config.out, JSON.stringify(report, null, 2))
  const requests = new Map()

  // S1 probe: the frozen call config each Agent would send, before any network I/O.
  ctx.on('agent/request', async function (payload, next) {
    const resolved = await next()
    requests.set(payload.agent.id, { provider: resolved.provider, model: resolved.model, reasoningEffort: resolved.reasoningEffort })
    return resolved
  })

  const main = async () => {
    try {
      await waitForPreset(ctx, 'standard')
      report.runtime.presets = (await ctx.agentPresets.list()).map(preset => preset.id)
      report.runtime.providers = ctx.subagents.list()
      report.runtime.defaultModel = ctx.agentDefaultModel.currentSelection()

      // S2: can a per-agent restriction hide the official delegation tools?
      const standard = await createRoot(ctx, config.cwd, 'standard')
      report.s2.toolsBefore = toolNames(ctx, standard)
      report.s2.denySubagent = attempt(() => standard.ctx.tools.restrict({ deny: ['subagent'] }))
      report.s2.denySubagentFork = attempt(() => standard.ctx.tools.restrict({ deny: ['subagent_fork'] }))
      report.s2.toolsAfter = toolNames(ctx, standard)

      // S2b: derive a preset from `standard` without the official delegation rows, plus our own tool row.
      const document = await ctx.agentPresets.readDocument('standard')
      const dropped = []
      const plugins = withoutOfficialDelegation(load(document.content, { schema: entryListSchema }), dropped)
      plugins.push({ id: 'hub-probe-tool', name: 'hub-spike/tool' })
      report.s2b.droppedRows = dropped
      await ctx.agentPresets.register({ id: 'standard-hub', name: 'Standard + Hub', description: 'spike', plugins })
      report.s2b.presetsAfterRegister = (await ctx.agentPresets.list()).map(preset => preset.id)
      const derived = await createRoot(ctx, config.cwd, 'standard-hub')
      const derivedTools = toolNames(ctx, derived)
      report.s2b.tools = derivedTools
      report.s2b.onlyInStandard = report.s2.toolsBefore.filter(name => !derivedTools.includes(name))
      report.s2b.onlyInDerived = derivedTools.filter(name => !report.s2.toolsBefore.includes(name))

      // S1: preset + agentOptions together — which decides the child's model?
      const cases = {
        presetOnly: { agentPreset: 'standard-hub' },
        presetAndOptions: { agentPreset: 'standard-hub', agentOptions: { provider: report.runtime.defaultModel.provider, model: 'spike-requested-model' } },
        optionsOnly: { agentOptions: { provider: report.runtime.defaultModel.provider, model: 'spike-requested-model' } },
      }
      report.s1.parent = report.runtime.defaultModel
      for (const [label, extra] of Object.entries(cases)) {
        const controller = new AbortController()
        try {
          const activation = await ctx.subagents.startActivation({
            provider: 'spawn',
            label,
            request: { prompt: [{ type: 'text', text: 'spike' }], parent: standard, ...extra },
            signal: controller.signal,
            delivery: 'caller',
          })
          const result = await Promise.race([activation.result, new Promise(resolve => setTimeout(() => resolve('timeout'), 15000))])
          const child = ctx.agents.get(activation.childId)
          report.s1[label] = {
            request: requests.get(activation.childId),
            childPreset: child?.session.header.agentPreset,
            childTools: child === undefined ? undefined : toolNames(ctx, child),
            stop: typeof result === 'string' ? result : result.stopReason,
            diagnostic: typeof result === 'string' ? undefined : result.diagnostic,
          }
          await activation.dispose()
        } catch (error) {
          report.s1[label] = { error: String(error?.stack ?? error) }
        }
      }
    } catch (error) {
      report.fatal = String(error?.stack ?? error)
    }
    report.done = true
    flush()
  }
  // Run after apply returns; `ready` has already fired for rows inserted by a patch.
  report.applied = true
  flush()
  setTimeout(main, 0)
}
