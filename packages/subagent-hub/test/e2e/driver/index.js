// E2E driver: exercises the installed hub inside a real (isolated) web profile and writes a report.
// Children never reach a model: no credentials exist, so each fails at its first request,
// after `agent/request` has exposed the exact provider/model it would have used.
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'hub-e2e-driver'
export const inject = ['agents', 'agentPresets', 'tools', 'systemPrompt', 'subagentHub', 'agentDefaultModel', 'sessionProjections']

const PARENT_PRESET = 'standard+hub'

const text = value => ({ kind: 'text', value })
const toolCall = (id, name, args) => ({ kind: 'tool-call', id, name, args: JSON.stringify(args) })

/** A minimal provider stream for scripted blocks. */
async function* scripted(blocks) {
  let index = 0
  for (const block of blocks) {
    if (block.kind === 'text') {
      yield { type: 'block-start', index, blockType: 'text' }
      yield { type: 'text-delta', index, text: block.value }
      yield { type: 'block-end', index, block: { type: 'text', text: block.value } }
    } else {
      yield { type: 'block-start', index, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index, id: block.id, name: block.name, argumentsDelta: block.args }
      yield { type: 'block-end', index, block: { type: 'tool-call', id: block.id, name: block.name, arguments: block.args } }
    }
    index++
  }
  yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 } }
  yield { type: 'finish', reason: { kind: blocks.some(block => block.kind === 'tool-call') ? 'tool-calls' : 'stop' } }
}

export function apply(ctx, config) {
  const report = { checks: {} }
  const requests = new Map()
  const children = new Map()
  const childSessions = new Map()
  const flush = () => writeFileSync(config.out, JSON.stringify(report, null, 2))

  // Scripted model for the full-turn check: the root asks for one `delegate` call, every other
  // request answers with text. Intercepting `llm/stream` before `next()` means no adapter runs.
  const textOf = message => (message.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('')
  // Scripted turns keyed by a marker in the user message; the step index is the number of tool
  // results already answered in this turn.
  const scripts = {
    'HUB-E2E-TURN': [
      [toolCall('call-hub-e2e', 'delegate', { description: 'turn check', prompt: 'HUB-E2E-CHILD do it', needs: ['reasoning'] })],
    ],
    'HUB-E2E-DEFINE': [
      [
        toolCall('def-scribe', 'define_subagent', { id: 'scribe', description: 'Writes release notes', instructions: 'HUB-SCRIBE-MARKER Write crisp notes.', needs: ['fast'], persist: 'workspace' }),
        toolCall('def-ghost', 'define_subagent', { id: 'ghostwriter', description: 'Ghost writes', instructions: 'HUB-GHOST-MARKER', persist: 'profile' }),
        toolCall('def-archivist', 'define_subagent', { id: 'archivist', description: 'Files things away', instructions: 'HUB-ARCHIVIST-MARKER', routes: ['flash'], persist: 'profile' }),
        toolCall('def-bad', 'define_subagent', { id: 'broken', description: 'Bad routes', instructions: 'x', routes: ['nope'] }),
      ],
      [toolCall('call-scribe', 'delegate', { description: 'scribe run', prompt: 'HUB-E2E-CHILD notes', agent: 'scribe' })],
    ],
  }
  ctx.on('llm/stream', function (options) {
    const messages = options.messages ?? []
    // The runtime appends its own `user`-role context on every step, so the scripted prompt is
    // located by its marker text, never by "the last user message".
    let promptIndex = -1
    let marker
    messages.forEach((message, index) => {
      if (message.role !== 'user') return
      const text = textOf(message)
      const found = Object.keys(scripts).find(key => text.includes(key))
      if (found !== undefined) {
        marker = found
        promptIndex = index
      }
    })
    if (marker === undefined) return scripted([text('child done')])
    const steps = scripts[marker]
    const answered = messages.slice(promptIndex + 1).filter(message => message.role === 'tool').length
    let step = 0
    for (let consumed = 0; step < steps.length && consumed + steps[step].length <= answered; step++) consumed += steps[step].length
    return scripted(step < steps.length ? steps[step] : [text(`${marker} done`)])
  })

  // Approval answerer ahead of the shipped ones: approve scribe and archivist, reject the rest.
  const approvals = []
  ctx.on('approval/request', async function (request, next) {
    if (request.toolName !== 'define_subagent') return next()
    const approve = /"(scribe|archivist)"/.test(request.reason ?? '')
    approvals.push({ toolName: request.toolName, display: request.displayReason?.en, approve })
    report.approvalsLive = approvals
    flush()
    return approve ? 'allowed-once' : 'rejected'
  }, true) // prepend: the web profile's browser answerer would otherwise wait for a click

  ctx.on('agent/request', async function (payload, next) {
    const resolved = await next()
    requests.set(payload.agent.id, `${resolved.provider}/${resolved.model}`)
    return resolved
  })
  ctx.on('agent/created', async ({ agent }) => {
    if (agent.session.header.parentSession === undefined) return
    childSessions.set(agent.id, agent.session)
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

  const runTurn = async (prompt) => {
    const root = (await ctx.agents.create({
      sessionId: `session-${randomUUID()}`,
      agentOptions: report.parentModel,
      meta: { cwd: config.cwd, agentPreset: PARENT_PRESET },
      setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, PARENT_PRESET) },
    })).agent
    root.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }))
    const subagents = ctx.get('subagents')
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      await root.whenIdle()
      const idleSeq = root.session.seq
      if (!await subagents.waitForChildren(root) && root.status === 'idle' && root.session.seq === idleSeq) break
    }
    return root
  }

  const main = async () => {
    try {
      report.hub = await ctx.subagentHub.ready
      report.presets = (await ctx.agentPresets.list()).map(preset => preset.id)
      report.parentModel = ctx.agentDefaultModel.currentSelection()
      // The browser half is served exactly like an installed bundle's client module.
      const modules = ctx.get('clientModules')
      const clientPath = modules?.clientPath('dsh-subagent-hub')
      const graph = modules === undefined ? undefined : JSON.stringify(modules.graph())
      report.client = { clientPath, inGraph: graph?.includes('dsh-subagent-hub') ?? false }

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

      // Full turn through the agent loop: durable tool/result.meta, projection, child truth.
      report.stage = 'turn'; flush()
      const turnRoot = await runTurn('HUB-E2E-TURN delegate once')
      const events = turnRoot.session.snapshotEvents()
      const result = events.find(event => event.type === 'tool/result' && event.data.message.toolCallId === 'call-hub-e2e')
      const runs = ctx.sessionProjections.snapshot(turnRoot.session, ['subagentHub']).values.subagentHub?.runs ?? []
      const childId = runs[0]?.subagentId
      const childSession = childId === undefined ? undefined : childSessions.get(childId)
      const childValues = childSession === undefined ? {} : ctx.sessionProjections.snapshot(childSession, ['modelSelection', 'tokenUsage']).values
      report.checks.turn = {
        resultMeta: result?.data.meta,
        resultError: result?.data.error,
        runs,
        childLastUsed: childValues.modelSelection?.lastUsed,
        childTokenUsage: childValues.tokenUsage,
        childFound: childSession !== undefined,
        lastText: events.filter(event => event.type === 'assistant/message').map(event => textOf(event.data.message)).at(-1),
      }

      // M3: define (session / approved workspace / rejected profile / approved profile / invalid), then delegate.
      report.stage = 'define'; flush()
      const defineRoot = await runTurn('HUB-E2E-DEFINE make agents')
      report.stage = 'define-done'; flush()
      const defineEvents = defineRoot.session.snapshotEvents()
      const resultFor = id => {
        const event = defineEvents.find(item => item.type === 'tool/result' && item.data.message.toolCallId === id)
        return event === undefined ? undefined : { meta: event.data.meta, error: event.data.error, text: textOf(event.data.message) }
      }
      const state = ctx.sessionProjections.stateOf(defineRoot.session, 'subagentHub')
      const scribeRun = state?.runs.find(run => run.agent === 'scribe')
      const scribeChild = scribeRun === undefined ? undefined : children.get(scribeRun.subagentId)
      const { readFileSync, existsSync } = await import('node:fs')
      const workspaceFile = `${config.cwd}/.dsh/subagents/scribe.yaml`
      report.checks.define = {
        scribe: resultFor('def-scribe'),
        ghost: resultFor('def-ghost'),
        archivist: resultFor('def-archivist'),
        bad: resultFor('def-bad'),
        approvals,
        sessionDefinitions: Object.keys(state?.definitions ?? {}).sort(),
        workspaceFile: existsSync(workspaceFile) ? readFileSync(workspaceFile, 'utf8') : undefined,
        profilePatchHasArchivist: readFileSync(config.profilePatch, 'utf8').includes('archivist'),
        profileAgentsNow: ctx.subagentHub.profileAgents.map(agent => agent.id),
        scribeRun,
        scribeChild: scribeChild === undefined ? undefined : { preset: scribeChild.preset, marker: scribeChild.prompt.includes('HUB-SCRIBE-MARKER'), request: requests.get(scribeRun.subagentId) },
        lastText: defineEvents.filter(event => event.type === 'assistant/message').map(event => textOf(event.data.message)).at(-1),
      }
    } catch (error) {
      report.fatal = String(error?.stack ?? error)
    }
    report.done = true
    flush()
  }
  setTimeout(main, 0)
}
