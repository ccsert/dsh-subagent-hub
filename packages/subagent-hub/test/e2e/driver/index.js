// E2E driver: exercises the installed hub inside a real (isolated) web profile and writes a
// report. Children never reach a real model: `llm/stream` is intercepted, so each child resolves
// its route through the official preflight and then answers with scripted text.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { runTeamChecks } from './team.js'

export const name = 'hub-e2e-driver'
export const inject = [
  'agents', 'agentPresets', 'tools', 'agentDefaultModel', 'subagentModelSelection',
  'systemPrompt', 'configEditor', 'subagentHub', 'settings', 'sessionProjections',
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

  // A child whose prompt carries HOLD stays open, so the report can observe the
  // per-session concurrency limit while one child is still running.
  let release
  const held = new Promise((resolve) => { release = resolve })
  ctx.on('llm/stream', (options) => {
    const text = (options?.messages ?? []).map(message => textOf(message)).join('\n')
    if (text.includes('HUB-E2E-HOLD')) {
      return (async function* () {
        await held
        yield* scripted('held child done')
      })()
    }
    return scripted('child done')
  })
  report.releaseHold = () => release()


  ctx.on('agent/request', async function (payload, next) {
    const resolved = await next()
    requests.set(payload.agent.id, `${resolved.provider}/${resolved.model}`)
    return resolved
  })
  ctx.on('agent/created', async ({ agent }) => {
    if (agent.session.header.parentSession === undefined) return
    const assembly = await ctx.systemPrompt.assemble({ scope: agent })
    children.set(agent.id, {
      session: agent.session,
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
      if (config.team) {
        await runTeamChecks(ctx, config, report, { requests, children, waitFor })
        report.done = true
        flush()
        return
      }

      // The official preset rows the plugin rewrote: spawn row gets the allowlist, fork row keeps
      // its own configuration (the runtime rejects preset selection on fork children).
      const standard = load((await ctx.agentPresets.readDocument('standard')).content, { schema: entryListSchema })
      report.standardRows = flattenRows(standard)
        .filter(row => row?.name === TOOL_PACKAGE)
        .map(row => ({ id: row.id, provider: row.config?.provider, allow: row.config?.allowedAgentPresets, models: row.config?.modelSelectionSettings }))
      report.presetDescription = (await ctx.agentPresets.list()).find(preset => preset.id === 'hub-agent-reviewer')?.description

      // The browser half is served like an installed bundle's client module, and the row config
      // form exists because `routes` / `agents` / `manageOfficialSettings` are volatile.
      const modules = ctx.get('clientModules')
      report.client = {
        clientPath: modules?.clientPath('dsh-subagent-hub'),
        inGraph: (JSON.stringify(modules?.graph()) ?? '').includes('dsh-subagent-hub'),
      }
      const descriptors = ctx.settings.describe()
      const hubDescriptor = descriptors.find(entry => entry.ns === 'subagent-hub')
      // Read the actual browser module's completion predicate against the real describe mirror.
      // A fixture that invents ready preset namespaces cannot catch a permanently pending page.
      let browserEntry
      vm.runInNewContext(readFileSync(new URL('../../../lib/client.js', import.meta.url), 'utf8'), {
        window: { __ModuleLoader__: { load: entry => { browserEntry = entry } } },
      })
      const browser = browserEntry.factory(id => id === 'react' ? { createElement() {} } : {})
      const observeSync = async () => {
        const latest = ctx.settings.describe()
        const snapshot = ns => {
          const view = latest.find(entry => entry.ns === ns)
          return view === undefined ? { status: 'unavailable' } : { status: 'ready', value: view.value }
        }
        const current = latest.find(entry => entry.ns === 'subagent-hub')
        const state = await new Promise(resolve => browser.observeOfficialSync({
          values: browser.valuesOf(browser.draftsOf(current?.value)),
          readState: () => browser.readOfficialSyncState({
            configForms: { get: ns => ({ getSnapshot: () => snapshot(ns) }) },
            remote: { agentPresets: { list: async () => ({ ok: true, value: { presets: await ctx.agentPresets.list() } }) } },
          }),
          onState: state => { if (state !== 'checking') resolve(state) },
          timeoutMs: 1000, intervalMs: 25, setTimer: setTimeout, clearTimer: clearTimeout,
        }))
        return {
          modelNamespace: snapshot('subagent-model-selection-settings').status,
          presetNamespace: snapshot('preset-standard').status,
          canFinish: state === 'complete',
        }
      }
      report.syncObservation = await observeSync()
      report.settings = hubDescriptor === undefined ? undefined : {
        writable: ctx.settings.writable,
        revision: hubDescriptor.revision,
        routes: hubDescriptor.value?.routes?.length,
        agents: hubDescriptor.value?.agents?.map(agent => agent.id),
        manageOfficialSettings: hubDescriptor.value?.manageOfficialSettings,
      }
      const standardAllow = async () => {
        const rows = load((await ctx.agentPresets.readDocument('standard')).content, { schema: entryListSchema })
        return flattenRows(rows)
          .filter(row => row?.name === TOOL_PACKAGE && row.config?.provider === 'spawn')
          .flatMap(row => row.config?.allowedAgentPresets ?? [])
      }

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

      const callerFor = agent => async (args) => {
        const result = await ctx.tools.execute({
          callId: `call-${randomUUID()}`,
          name: 'subagent',
          arguments: { description: 'e2e', prompt: 'HUB-E2E-CHILD work', ...args },
          agent,
          signal: new AbortController().signal,
        })
        if (result.isError) {
          // Direct tools.execute does not append loop events. Persist the actual result
          // using the same envelope as the native agent loop, then query the registry.
          const callId = `history-${randomUUID()}`
          const callEvent = agent.session.append('tool/call', { turn: 0, step: 0, callId, name: 'subagent', arguments: '{}' })
          agent.session.append('tool/result', { turn: 0, step: 0,
            message: createToolResultMessage({ callId, content: result.content, isError: true }),
            ...(result.error?.info ? { error: result.error.info } : {}),
          }, { surfaceOp: 'append', sourceEventSeqs: [callEvent.seq] })
          return { isError: true, message: result.error?.message ?? textOf({ content: result.content }) }
        }
        const id = result.value.subagentId
        await waitFor(() => children.get(id))
        const request = await waitFor(() => requests.get(id))
        const session = children.get(id)?.session
        const model = session === undefined ? undefined : await waitFor(() => {
          const value = ctx.sessionProjections.snapshot(session, ['modelSelection']).values.modelSelection
          return value?.lastUsed ? value : undefined
        }, 2000)
        return { isError: false, id, preset: children.get(id)?.preset, prompt: children.get(id)?.prompt, request,
          modelBadge: session === undefined ? undefined : browser.modelBadgeData(childState(session), model) }
      }
      const childState = session => ({ subagent: session.header.parentSession === undefined ? null : { address: {} } })
      const dormantHandle = await ctx.agents.create({
        sessionId: `session-${randomUUID()}`,
        agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
        meta: { cwd: config.cwd, agentPreset: 'standard', parentSession: root.id },
        setup: async agentCtx => { await ctx.agentPresets.mount(agentCtx, 'standard') },
      })
      report.modelBadge = {
        dormant: browser.modelBadgeData(childState(dormantHandle.agent.session),
          ctx.sessionProjections.snapshot(dormantHandle.agent.session, ['modelSelection']).values.modelSelection),
        main: browser.modelBadgeData(childState(root.session),
          ctx.sessionProjections.snapshot(root.session, ['modelSelection']).values.modelSelection),
      }
      const call = callerFor(root)

      // Route guard: `pro` is a legal official model but outside reviewer's declared routes.
      report.checks.outOfRoute = await call({ agent_preset: 'hub-agent-reviewer', provider: 'deepseek-official', model: 'deepseek-v4-pro' })
      report.dispatchHistory = ctx.sessionProjections.snapshot(root.session, ['subagentHubDispatch']).values.subagentHubDispatch
      // Named agent with an explicit allowed route: the preset and its persona must win.
      report.checks.namedAllowed = await call({ agent_preset: 'hub-agent-reviewer', provider: 'deepseek-official', model: 'deepseek-flash' })
      // Named agent that omits the route inherits the parent route (flash), which is allowed.
      report.checks.namedInherited = await call({ agent_preset: 'hub-agent-reviewer' })
      // A generic child is not route-confined: the guard must not restrict it.
      report.checks.generic = await call({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })

      // Concurrency: hold one child open, then a second delegation must be refused.
      report.stage = 'concurrency'; flush()
      const heldChild = await call({ provider: 'deepseek-official', model: 'deepseek-flash', prompt: 'HUB-E2E-HOLD wait' })
      const blocked = await call({ provider: 'deepseek-official', model: 'deepseek-flash' })
      report.checks.concurrency = { held: heldChild, blocked }
      report.releaseHold()

      // Live edit through the same Host settings service the page form uses: add a named agent,
      // wait for the plugin's reconciliation, then verify presets, allowlists, schema, and persona.
      report.stage = 'live'; flush()
      if (hubDescriptor !== undefined) {
        const liveAgents = [
          ...(hubDescriptor.value?.agents ?? []),
          { id: 'scribe', description: 'Writes release notes', instructions: 'HUB-SCRIBE-MARKER Write crisp notes.', needs: ['fast'] },
        ]
        await ctx.settings.mutate('subagent-hub', [{ op: 'set', path: ['agents'], value: liveAgents }], hubDescriptor.revision)
        await ctx.subagentHub.whenSettled()
        const liveHandle = await ctx.agents.create({
          sessionId: `session-${randomUUID()}`,
          agentOptions: report.parentModel,
          meta: { cwd: config.cwd, agentPreset: 'standard' },
          setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'standard') },
        })
        const liveRoot = liveHandle.agent
        const liveSchema = ctx.tools.schemas(liveRoot).find(item => item.name === 'subagent')
        const liveSection = (await ctx.systemPrompt.assemble({ scope: liveRoot }))
          .sections.find(section => section.name === 'dsh-subagent-hub')?.text
        report.checks.live = {
          presets: (await ctx.agentPresets.list()).map(preset => preset.id).filter(id => id.startsWith('hub-agent-')),
          allow: await standardAllow(),
          official: await ctx.subagentHub.officialSettingsReady,
          schemaEnum: liveSchema?.parameters?.properties?.agent_preset?.enum,
          sectionHasScribe: (liveSection ?? '').includes('`hub-agent-scribe`'),
          scribe: await callerFor(liveRoot)({ agent_preset: 'hub-agent-scribe' }),
          sync: await observeSync(),
        }
      }

      report.profilePatch = readFileSync(config.profilePatch, 'utf8')
    } catch (error) {
      report.fatal = String(error?.stack ?? error)
    }
    report.done = true
    flush()
  }
  setTimeout(main, 0)
}
