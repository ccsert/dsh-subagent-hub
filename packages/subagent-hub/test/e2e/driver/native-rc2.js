// rc.2 exercises the official named tools with intercepted streams and fixture adapters.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import { load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { executeTool } from './execute.js'

const lead = 'hub-test-lead', worker = 'hub-test-worker'
class FixtureAdapter extends LlmAdapter {
  listModels(provider) { return Promise.resolve((provider === lead ? ['lead', 'alternate'] : ['worker']).map(id => ({ id, name: 'Fixture', provider }))) }
  async resolveModel(provider, model) {
    return { ...await super.resolveModel(provider, model), context: { contextWindow: 128000 }, reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'low' }, inputModalities: ['text'] }
  }
  async *stream() { throw new Error('Unexpected real model stream') }
}

export async function runNativeRc2(ctx, config, report, { waitFor, requestRecords, children }) {
  ctx.llm.registerAdapter([lead, worker], new FixtureAdapter())
  const check = (name, value, detail) => {
    report.nativeRc2 ??= { phase: config.routedPhase, checks: {} }
    report.nativeRc2.checks[name] = { passed: !!value, detail }
    writeFileSync(config.out, JSON.stringify(report, null, 2))
    assert.ok(value, `${name}: ${JSON.stringify(detail)}`)
  }
  const call = async (agent, name, args) => {
    const signal = new AbortController().signal
    const toolSet = await ctx.tools.resolve({ agent, modelSelection: agent.model.current(), signal })
    try { return await executeTool(ctx, { callId: `call-${randomUUID()}`, name, arguments: args, agent, signal, toolSet }) }
    finally { toolSet.dispose() }
  }
  const requestOf = id => requestRecords.filter(row => row.id === id)
  const tree = root => ctx.subagents.listDescendants(root.id, new AbortController().signal)
  const lookup = async (root, name) => (await tree(root)).find(row => row.path === name)
  const waitChild = async (root, name) => {
    const until = Date.now() + 15000
    while (Date.now() < until) {
      const row = await lookup(root, name)
      if (row && requestOf(row.id).length) return row
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  const observe = async row => {
    const agent = ctx.agents.get(row.id)
    if (agent) await agent.whenIdle()
    return requestOf(row.id)
  }
  if (config.routedPhase === 'recovery') {
    const saved = JSON.parse(readFileSync(config.statePath, 'utf8'))
    const handle = await ctx.agents.resume({ resumeSessionId: saved.root, agentOptions: { provider: lead, model: 'lead' }, setup: async scope => { await ctx.agentPresets.mount(scope, 'standard') } })
    try {
      if (saved.task) {
        const board = ctx.get('agentTeams').listTasks(handle.agent).find(row => row.id === saved.task.id)
        check('recovery-nested-owner-board', board?.ownerId === saved.task.ownerId && board?.ownerName === 'builder/checker', board)
      }
      for (const member of saved.members) {
        const sent = await call(handle.agent, 'send_message', { agent: member.name, message: 'HUB-RC2-RECOVERY Reply once.' })
        check(`recovery-message-${member.name}`, !sent.isError, sent.error?.message)
        const row = await waitChild(handle.agent, member.name)
        check(`recovery-identity-${member.name}`, row?.id === member.id, row)
        const requests = await observe(row)
        check(`recovery-route-${member.name}`, requests.some(r => r.provider === member.provider && r.model === member.model), requests)
      }
    } finally { await handle.dispose() }
    return
  }
  const settings = ctx.settings.describe().find(row => row.ns === 'subagent-hub')
  await ctx.settings.mutate('subagent-hub', [
    { op: 'set', path: ['routes'], value: [{ id: 'worker', provider: worker, model: 'worker', reasoningEffort: 'high' }, { id: 'lead', provider: lead, model: 'lead', reasoningEffort: 'high' }] },
    { op: 'set', path: ['agents'], value: [{ id: 'builder', description: 'Fixture builder', instructions: 'HUB-TEAM-ROLE-MARKER', routes: ['worker'] }, { id: 'checker', description: 'Fixture checker', instructions: 'HUB-CHECKER-MARKER', routes: ['worker'] }] },
    { op: 'set', path: ['maxConcurrent'], value: 4 },
  ], settings.revision)
  await ctx.subagentHub.whenSettled()
  const handle = await ctx.agents.create({ sessionId: `session-${randomUUID()}`, agentOptions: { provider: lead, model: 'lead', reasoningEffort: 'high' }, meta: { cwd: config.cwd, agentPreset: 'standard' }, setup: async scope => { await ctx.agentPresets.mount(scope, 'standard') } })
  const root = handle.agent, members = []
  let disposeFixturePreset
  try {
    root.followup(createUserMessage({ content: [{ type: 'text', text: 'HUB-RC2-HISTORY Reply once.' }], source: { kind: 'user' } }))
    await waitFor(() => requestOf(root.id).length ? true : undefined)
    await root.whenIdle()
    for (const [name, tool] of [['fresh', 'subagent'], ['fork', 'subagent_fork']]) {
      const args = { name, description: 'Native fixture delegation', prompt: `HUB-RC2-${name} Reply once.` }
      const provider = name === 'fresh' ? worker : lead, model = name === 'fresh' ? 'worker' : 'lead'
      if (tool === 'subagent') Object.assign(args, { agent_preset: 'hub-agent-builder', provider, model, reasoning_effort: 'high' })
      const result = await call(root, tool, args)
      check(`create-${name}`, !result.isError && result.value?.name === name, result.error?.message ?? result.value)
      const row = await waitChild(root, name)
      check(`tree-${name}`, !!row, row)
      const requests = await observe(row)
      check(`route-${name}`, requests.some(r => r.provider === provider && r.model === model && (name !== 'fresh' || r.reasoningEffort === 'high')), requests)
      if (name === 'fresh') check('role-instructions', children.get(row.id)?.prompt.includes('HUB-TEAM-ROLE-MARKER'), children.get(row.id)?.prompt)
      const count = requests.length
      const wake = await call(root, 'send_message', { agent: name, message: 'HUB-RC2-WAKE Reply again.' })
      check(`wake-${name}`, !wake.isError, wake.error?.message)
      await waitFor(() => requestOf(row.id).length > count ? true : undefined)
      check(`wake-route-${name}`, requestOf(row.id).slice(count).some(r => r.provider === provider && r.model === model), requestOf(row.id))
      members.push({ name, id: row.id, provider, model })
    }
    const defaultParent = await call(root, 'subagent', { name: 'default-builder', description: 'Default fixture builder', prompt: 'HUB-E2E-HOLD keep builder active', agent_preset: 'hub-agent-builder', provider: worker, model: 'worker', reasoning_effort: 'high' })
    check('default-builder-created', !defaultParent.isError, defaultParent.error?.message)
    const defaultRow = await waitChild(root, 'default-builder')
    const defaultAgent = ctx.agents.get(defaultRow?.id)
    check('default-builder-resident', !!defaultAgent, defaultRow)
    check('default-depth-is-one', ctx.subagents.resolveMaxDepth() === 1, ctx.subagents.resolveMaxDepth())
    const depthProbe = await call(defaultAgent, 'subagent', { name: 'too-deep', description: 'Default depth control', prompt: 'Do not run', provider: worker, model: 'worker', reasoning_effort: 'high' })
    check('default-depth-rejected', depthProbe.isError && /depth 2 exceeds maxDepth 1/.test(depthProbe.error?.message ?? '') && !(await lookup(root, 'default-builder/too-deep')), depthProbe.error?.message)
    const depthSetting = ctx.settings.describe().find(row => row.ns === 'subagent')
    check('native-depth-setting-available', !!depthSetting, ctx.settings.describe().filter(row => row.value?.maxDepth !== undefined).map(row => ({ ns: row.ns, value: row.value })))
    await ctx.settings.mutate(depthSetting.ns, [{ op: 'set', path: ['maxDepth'], value: 3 }], depthSetting.revision)
    check('configured-depth-three', ctx.subagents.resolveMaxDepth() === 3, ctx.subagents.resolveMaxDepth())
    const unauthorized = await call(defaultAgent, 'subagent', { name: 'unauthorized-role', description: 'Unapproved role selection', prompt: 'Do not run', agent_preset: 'hub-agent-checker' })
    check('default-base-does-not-grant-role-selection', unauthorized.isError && /agent_preset selection is disabled/.test(unauthorized.error?.message ?? ''), unauthorized.error?.message)
    // Explicitly grant a single role and model selection in an isolated native base preset.
    const standardRows = load((await ctx.agentPresets.readDocument('standard')).content, { schema: entryListSchema })
    let patched = 0
    const allowFixture = rows => rows.map(row => {
      if (Array.isArray(row.config)) return { ...row, config: allowFixture(row.config) }
      if (row.name === '@deepseek-ai/dsh-tool-subagent' && row.config?.provider === 'spawn') {
        patched++
        return { ...row, config: { ...row.config, modelSelection: true, allowedAgentPresets: ['hub-agent-checker'] } }
      }
      return row
    })
    const fixtureRows = allowFixture(standardRows)
    check('fixture-base-authorizes-one-role', patched === 1, patched)
    disposeFixturePreset = await ctx.agentPresets.register({ id: 'fixture-delegating', name: 'Fixture delegating base', description: 'Explicit native delegated role permission', plugins: fixtureRows })
    const hubSetting = ctx.settings.describe().find(row => row.ns === 'subagent-hub')
    const agents = hubSetting.value.agents.map(agent => agent.id === 'builder' ? { ...agent, basePreset: 'fixture-delegating' } : agent)
    await ctx.settings.mutate('subagent-hub', [{ op: 'set', path: ['agents'], value: agents }], hubSetting.revision)
    await ctx.subagentHub.whenSettled()
    const parentResult = await call(root, 'subagent', { name: 'builder', description: 'Nested fixture builder', prompt: 'HUB-E2E-HOLD keep builder active', agent_preset: 'hub-agent-builder', provider: worker, model: 'worker', reasoning_effort: 'high' })
    check('nested-builder-created', !parentResult.isError, parentResult.error?.message)
    const first = await waitChild(root, 'builder')
    const firstAgent = ctx.agents.get(first?.id)
    check('nested-builder-resident', !!firstAgent, first)
    const parentSchema = ctx.tools.schemas(firstAgent).find(tool => tool.name === 'subagent')
    check('role-preset-preserves-delegation', !!parentSchema, ctx.tools.schemas(firstAgent).map(tool => tool.name))
    const childArgs = { description: 'Nested fixture checker', prompt: 'HUB-E2E-HOLD keep checker active', agent_preset: 'hub-agent-checker' }
    const deniedRole = await call(firstAgent, 'subagent', { ...childArgs, name: 'wrong-route', provider: lead, model: 'lead', reasoning_effort: 'high' })
    check('nested-role-route-denied', deniedRole.isError && /named agent "checker"/.test(deniedRole.error?.message ?? '') && !(await lookup(root, 'builder/wrong-route')), deniedRole.error?.message)
    const deniedEffort = await call(firstAgent, 'subagent', { ...childArgs, name: 'wrong-effort', provider: worker, model: 'worker' })
    check('nested-explicit-effort-required', deniedEffort.isError && /reasoning_effort/.test(deniedEffort.error?.message ?? '') && !(await lookup(root, 'builder/wrong-effort')), deniedEffort.error?.message)
    const grandResult = await call(firstAgent, 'subagent', { ...childArgs, name: 'checker', provider: worker, model: 'worker', reasoning_effort: 'high' })
    check('nested-checker-created', !grandResult.isError && grandResult.value?.name === 'builder/checker', grandResult.error?.message ?? grandResult.value)
    const grand = await waitChild(root, 'builder/checker')
    check('nested-tree-identity', !!grand && grand.id !== first.id, grand)
    const grandAgent = ctx.agents.get(grand.id)
    check('nested-route-and-effort-recorded', requestOf(grand.id).some(r => r.provider === worker && r.model === 'worker' && r.reasoningEffort === 'high'), requestOf(grand.id))
    check('nested-role-applied', children.get(grand.id)?.prompt.includes('HUB-CHECKER-MARKER'), children.get(grand.id)?.prompt)
    check('nested-parent-session', grandAgent?.session.header.parentSession === first.id, grandAgent?.session.header.parentSession)
    const rootCatalog = ctx.sessionProjections.snapshot(root.session, ['subagentCatalog']).values.subagentCatalog
    const childCatalog = ctx.sessionProjections.snapshot(firstAgent.session, ['subagentCatalog']).values.subagentCatalog
    check('nested-direct-catalogs', rootCatalog?.some(row => row.id === first.id && row.name === 'builder') && !rootCatalog?.some(row => row.id === grand.id) && childCatalog?.some(row => row.id === grand.id && row.name === 'checker'), { rootCatalog, childCatalog })
    const teams = ctx.get('agentTeams')
    check('native-team-service-available', !!teams)
    await teams.setEnabled(root, true)
    const task = await teams.createTask(root, { subject: 'Nested owner fixture', description: 'Claimed by the real checker child' })
    const claimed = await teams.updateTask(grandAgent, { action: 'claim', taskId: task.id, expectedRevision: task.revision })
    const board = teams.listTasks(root).find(row => row.id === task.id)
    const boardProjection = ctx.sessionProjections.snapshot(root.session, ['agentTeam']).values.agentTeam
    check('nested-owner-on-root-board', claimed.ownerId === grand.id && board?.ownerId === grand.id && board.ownerName === 'builder/checker' && boardProjection?.tasks.some(row => row.id === task.id && row.ownerId === grand.id && row.ownerName === 'builder/checker'), { claimed, board, boardProjection })
    await ctx.sessions.flush(firstAgent.session)
    await ctx.sessions.flush(grandAgent.session)
    const forbidden = await call(root, 'subagent', { name: 'forbidden', description: 'Forbidden role route', prompt: 'Do not run', agent_preset: 'hub-agent-builder', provider: lead, model: 'lead' })
    check('role-route-denied', forbidden.isError, forbidden.error?.message)
    const noEffort = await call(root, 'subagent', { name: 'missing-effort', description: 'Missing effort', prompt: 'Do not run', provider: worker, model: 'worker' })
    check('explicit-route-effort-required', noEffort.isError, noEffort.error?.message)
    const sameRoute = await call(root, 'subagent', { name: 'same-route', description: 'Same route without effort', prompt: 'Do not run', provider: lead, model: 'lead' })
    check('explicit-same-route-requires-effort', sameRoute.isError && /reasoning_effort/.test(sameRoute.error?.message ?? ''), sameRoute.error?.message)
    const inherited = await call(root, 'subagent', { name: 'inherited', description: 'Inherit route and effort', prompt: 'HUB-RC2-INHERIT Reply once.' })
    check('inherited-route-and-effort-accepted', !inherited.isError, inherited.error?.message)
    const inheritedRow = await waitChild(root, 'inherited')
    check('inherited-effort-recorded', requestOf(inheritedRow?.id).some(r => r.provider === lead && r.model === 'lead' && r.reasoningEffort === 'high'), requestOf(inheritedRow?.id))
    const held = await call(root, 'subagent', { name: 'cancel-me', description: 'Interrupt held child', prompt: 'HUB-E2E-HOLD wait', provider: worker, model: 'worker', reasoning_effort: 'high' })
    check('cancel-child-started', !held.isError, held.error?.message)
    const heldRow = await waitChild(root, 'cancel-me')
    check('cancel-child-running', ctx.agents.get(heldRow?.id)?.status === 'running')
    // This shipped standard preset disables the interrupt tool; exercise its public service seam.
    let interruptError
    try { ctx.subagents.interrupt(heldRow.id, { kind: 'ancestor', agent: root }) } catch (error) { interruptError = error.message }
    report.releaseHold()
    check('cancel-request-accepted', !interruptError, interruptError)
    await ctx.agents.get(heldRow.id)?.whenIdle()
    check('cancel-child-settled', ctx.agents.get(heldRow.id)?.status !== 'running')
    let current = ctx.settings.describe().find(row => row.ns === 'subagent-hub')
    await ctx.settings.mutate('subagent-hub', [{ op: 'set', path: ['routes'], value: [...current.value.routes, { id: 'new', provider: lead, model: 'alternate' }] }], current.revision)
    await ctx.subagentHub.whenSettled()
    const newRoute = await call(root, 'subagent', { name: 'new-route', description: 'Session policy check', prompt: 'Do not run', provider: lead, model: 'alternate' })
    check('captured-session-layer-denied', newRoute.isError && /layer 2\/2/.test(newRoute.error?.message ?? ''), newRoute.error?.message)
    current = ctx.settings.describe().find(row => row.ns === 'subagent-hub')
    await ctx.settings.mutate('subagent-hub', [{ op: 'set', path: ['routes'], value: [{ id: 'worker', provider: worker, model: 'worker', reasoningEffort: 'high' }] }], current.revision)
    await ctx.subagentHub.whenSettled()
    const blockedFork = await call(root, 'subagent_fork', { name: 'blocked-fork', description: 'Disallowed inherited route', prompt: 'Do not run' })
    check('fork-inherited-route-denied', blockedFork.isError && /layer 1\/2/.test(blockedFork.error?.message ?? ''), blockedFork.error?.message)
    // Restore the ordinary role composition before shutdown; the temporary base is
    // deliberately process-local and must not leave an unavailable preset on recovery.
    current = ctx.settings.describe().find(row => row.ns === 'subagent-hub')
    const restoredAgents = current.value.agents.map(agent => agent.id === 'builder' ? { ...agent, basePreset: 'standard' } : agent)
    await ctx.settings.mutate('subagent-hub', [{ op: 'set', path: ['agents'], value: restoredAgents }], current.revision)
    await ctx.subagentHub.whenSettled()
    await ctx.sessions.flush(root.session)
    writeFileSync(config.statePath, JSON.stringify({ root: root.id, members, task: { id: task.id, ownerId: grand.id } }))
  } finally {
    report.releaseHold()
    await handle.dispose()
    if (disposeFixturePreset) await disposeFixturePreset()
  }
}
