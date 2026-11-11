// Real installed DSH, fake adapter metadata and intercepted streams: no vendor requests.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import { executeTool } from './execute.js'

const PROVIDERS = ['hub-test-lead', 'hub-test-minimax', 'hub-test-deepseek']
const routes = [
  { id: 'minimax', provider: PROVIDERS[1], model: 'MiniMax-M3.1-Flash', reasoningEffort: 'high', tags: ['cheap'] },
  { id: 'deepseek', provider: PROVIDERS[2], model: 'deepseek-worker' },
  { id: 'no-context', provider: PROVIDERS[1], model: 'no-context' },
]
const roles = [
  { id: 'builder', name: '功能开发', description: 'Implement changes', instructions: 'HUB-TEAM-ROLE-MARKER Report exact verification evidence.', routes: ['minimax'] },
  { id: 'reviewer', description: 'Review code', instructions: 'HUB-TEAM-REVIEWER-MARKER Only report findings.', routes: ['deepseek'] },
]
class FixtureAdapter extends LlmAdapter {
  listModels(provider) { return Promise.resolve((provider === PROVIDERS[0] ? [{ id: 'gpt-lead', name: 'Fixture GPT Lead' }, { id: 'alternative-lead', name: 'Fixture alternative Lead' }] : routes.filter(route => route.provider === provider).map(route => ({ id: route.model, name: `${provider} fixture` }))).map(model => ({ ...model, provider }))) }
  async resolveModel(provider, model) {
    return { ...await super.resolveModel(provider, model), ...(model === 'no-context' ? {} : { context: { contextWindow: 128000 } }), reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'low' }, inputModalities: ['text'] }
  }
  async *stream() { throw new Error('Fixture adapter stream must be intercepted; no network is allowed') }
}

export async function runRoutedTeamChecks(ctx, config, report, { waitFor, requestRecords, streamRecords, children }) {
  const teams = ctx.get('agentTeams')
  ctx.llm.registerAdapter(PROVIDERS, new FixtureAdapter())
  const check = (name, condition, detail) => {
    report.routedTeam ??= { phase: config.routedPhase ?? 'initial', checks: {} }
    report.routedTeam.checks[name] = { passed: !!condition, ...(detail === undefined ? {} : { detail }) }
    writeFileSync(config.out, JSON.stringify(report, null, 2))
    assert.ok(condition, `${name}: ${JSON.stringify(detail)}`)
  }
  const snapshot = () => ctx.settings.describe().find(row => row.ns === 'subagent-hub')
  const configure = async changes => {
    await ctx.settings.mutate('subagent-hub', Object.entries(changes).map(([key, value]) => ({ op: 'set', path: [key], value })), snapshot().revision)
    await ctx.subagentHub.whenSettled()
  }
  const ready = await waitFor(() => ctx.subagentHub.teamRouting?.ready ? true : undefined, 5000)
  check('public-plugin-extension-ready', ready, ctx.subagentHub.teamRouting?.capabilities())
  const call = async (agent, name, args, signal = new AbortController().signal) => {
    const toolSet = await ctx.tools.resolve({ agent, modelSelection: agent.model.current(), signal })
    try { return await executeTool(ctx, { callId: `call-${randomUUID()}`, name, arguments: args, agent, signal, toolSet }) }
    finally { toolSet.dispose() }
  }
  const create = async (model, provider = PROVIDERS[0]) => ctx.agents.create({ sessionId: `session-${randomUUID()}`, agentOptions: { provider, model },
    meta: { cwd: config.cwd, agentPreset: 'standard' }, setup: async scope => { await ctx.agentPresets.mount(scope, 'standard') } })
  const waitIdle = async agent => {
    await agent.whenIdle()
    await ctx.subagents.waitForChildren(agent)
    await agent.whenIdle()
  }
  const requestOf = id => requestRecords.filter(row => row.id === id)
  const observe = async childId => {
    const live = ctx.agents.get(childId)
    const child = live ?? children.get(childId)?.agent
    assert.ok(child, `Child ${childId} was observed in native creation`)
    if (live) await waitIdle(live)
    const view = ctx.sessionProjections.snapshot(child.session, ['modelSelection']).values.modelSelection
    const assignment = ctx.subagentHub.teamRouting.state(child).assignment
    return { childId, selection: child.model.current(), recorded: view?.lastUsed, requests: requestOf(childId), assignment,
      parentSession: child.session.header.parentSession, prompt: requestOf(childId).at(-1)?.context ?? '' }
  }

  if (config.routedPhase === 'recovery') {
    const saved = JSON.parse(readFileSync(config.statePath, 'utf8'))
    const handles = []
    try {
      for (const root of saved.roots) {
        const handle = await ctx.agents.resume({ resumeSessionId: root.id, agentOptions: { provider: root.provider, model: root.model }, setup: async scope => { await ctx.agentPresets.mount(scope, 'standard') } })
        handles.push(handle)
        for (const member of root.members) {
          const sent = await call(handle.agent, 'send_message', { target: member.target, message: `HUB-ROUTED-RECOVERY-${member.target} Reply once after process restart.` })
          check(`recover-message-${member.target}`, !sent.isError, sent.error?.message)
          const requested = await waitFor(() => requestOf(member.childId).length ? true : undefined)
          const observed = await observe(member.childId)
          check(`recover-model-${member.target}`, requested && observed.requests.every(row => row.provider === member.provider && row.model === member.model), observed)
          check(`recover-role-${member.target}`, !member.roleMarker || observed.prompt.includes(member.roleMarker), observed.prompt)
          check(`recover-identity-${member.target}`, observed.parentSession === root.id && observed.assignment?.childId === member.childId)
        }
        await waitIdle(handle.agent)
      }
      report.routedTeam.streamRoutes = streamRecords.map(({ provider, model }) => ({ provider, model }))
    } finally { for (const handle of handles.reverse()) await handle.dispose() }
    return
  }

  await configure({ routes, agents: roles, maxConcurrent: 4, manageOfficialSettings: true })
  const rootHandle = await create('gpt-lead'), root = rootHandle.agent
  const manifest = { roots: [{ id: root.id, provider: PROVIDERS[0], model: 'gpt-lead', members: [] }] }
  try {
    root.followup(createUserMessage({ content: [{ type: 'text', text: 'HUB-ROUTED-LEAD-HISTORY Complete one balanced turn before the fork.' }], source: { kind: 'user' } }))
    await waitFor(() => requestOf(root.id).length || root.session.seq > 4 && root.status === 'idle' ? true : undefined, 5000)
    await waitIdle(root)
    await ctx.sessions.flush(root.session)
    const before = requestOf(root.id)
    check('lead-initial-model', before.length > 0 && before.every(row => row.provider === PROVIDERS[0] && row.model === 'gpt-lead'), { requests: before, status: root.status, seq: root.session.seq, model: root.model.current(), projection: ctx.sessionProjections.snapshot(root.session, ['modelSelection', 'inbox', 'turnBoundary']).values, streams: streamRecords })
    const toolSet = await ctx.tools.resolve({ agent: root, modelSelection: root.model.current(), signal: new AbortController().signal })
    try { check('lead-sees-routed-team-tool', ctx.tools.schemas(root, toolSet).some(tool => tool.name === 'hub_spawn_teammate')) }
    finally { toolSet.dispose() }
    const section = (await ctx.systemPrompt.assemble({ scope: root })).sections.find(section => section.name === 'dsh-subagent-hub')?.text
    check('lead-catalog-has-explicit-route-and-role', section?.includes('hub_spawn_teammate') && section.includes('Hub route ID "minimax"') && section.includes('Hub Team role ID: "builder"'), section)

    for (const context of ['fresh', 'fork']) {
      const args = { name: `minimax-${context}`, description: 'Cross-provider Team implementation', prompt: `HUB-ROUTED-${context} Implement nothing; report once.`, route: 'minimax', role: 'builder', context }
      const result = await call(root, 'hub_spawn_teammate', args)
      check(`spawn-${context}`, !result.isError, result.error?.message ?? result.value)
      await waitFor(() => requestOf(result.value.childId).length ? true : undefined)
      const observed = await observe(result.value.childId)
      report.routedTeam[context] = observed
      check(`first-request-selected-${context}`, observed.requests.length > 0 && observed.requests[0].provider === PROVIDERS[1] && observed.requests[0].model === routes[0].model, observed.requests)
      check(`recorded-model-selected-${context}`, observed.recorded?.provider === PROVIDERS[1] && observed.recorded?.model === routes[0].model, observed.recorded)
      check(`effort-selected-${context}`, observed.recorded?.reasoningEffort === 'high', observed.recorded)
      check(`role-applied-${context}`, observed.prompt.includes('HUB-TEAM-ROLE-MARKER'), observed.prompt)
      check(`binding-exact-id-${context}`, observed.assignment?.childId === result.value.childId && observed.assignment?.rootId === root.id)
      const childId = result.value.childId
      check(`member-cannot-create-${context}`, observed.requests.every(request => request.routedToolVisible === false))
      const count = requestOf(childId).length
      const wake = await call(root, 'send_message', { target: result.value.target, message: `HUB-ROUTED-WAKE-${context} Reply again.` })
      check(`wake-accepted-${context}`, !wake.isError, wake.error?.message)
      await waitFor(() => requestOf(childId).length > count ? true : undefined)
      await observe(childId)
      check(`wake-keeps-model-${context}`, requestOf(childId).length > count && requestOf(childId).slice(count).every(row => row.provider === PROVIDERS[1] && row.model === routes[0].model), requestOf(childId))
      manifest.roots[0].members.push({ target: result.value.target, childId, provider: PROVIDERS[1], model: routes[0].model, roleMarker: 'HUB-TEAM-ROLE-MARKER' })
    }
    const beforeMembers = teams.listMembers(root).length
    const forbidden = await call(root, 'hub_spawn_teammate', { name: 'wrong-role', description: 'Should reject', prompt: 'Do not run', route: 'deepseek', role: 'builder' })
    check('role-route-rejected-before-roster', forbidden.isError && teams.listMembers(root).length === beforeMembers, forbidden.error?.message)
    const missing = await call(root, 'hub_spawn_teammate', { name: 'unknown-route', description: 'Should reject', prompt: 'Do not run', route: 'missing' })
    check('unknown-route-rejected-before-roster', missing.isError && teams.listMembers(root).length === beforeMembers, missing.error?.message)
    const badEffort = await call(root, 'hub_spawn_teammate', { name: 'bad-effort', description: 'Should reject', prompt: 'Do not run', route: 'minimax', reasoning_effort: 'invented' })
    check('unknown-effort-rejected-before-roster', badEffort.isError && teams.listMembers(root).length === beforeMembers, badEffort.error?.message)
    const duplicate = await call(root, 'hub_spawn_teammate', { name: 'minimax-fresh', description: 'Should reject', prompt: 'Do not run', route: 'minimax' })
    check('duplicate-name-rejected-before-roster', duplicate.isError && teams.listMembers(root).length === beforeMembers, duplicate.error?.message)
    const noContext = await call(root, 'hub_spawn_teammate', { name: 'missing-context', description: 'Should reject before reservation', prompt: 'Do not run', route: 'no-context', context: 'fork' })
    check('fork-without-context-rejected-before-roster', noContext.isError && teams.listMembers(root).length === beforeMembers, noContext.error?.message)
    check('fork-context-error-is-actionable', /contextWindow/.test(noContext.error?.message))
    let bypass
    try {
      await ctx.subagents.startActivation({ provider: 'hub-team-spawn', delivery: 'caller', label: 'Unbound backend bypass',
        request: { parent: root, prompt: [{ type: 'text', text: 'Do not run an unbound Team backend' }] }, signal: new AbortController().signal })
    } catch (error) { bypass = error.message }
    check('backend-bypass-rejected-without-binding', /explicit, validated Hub creation/.test(bypass ?? '') && teams.listMembers(root).length === beforeMembers, bypass)
    const reviewer = await call(root, 'hub_spawn_teammate', { name: 'deepseek-review', description: 'A different provider in the same Team', prompt: 'HUB-ROUTED-REVIEW Reply once.', route: 'deepseek', role: 'reviewer' })
    check('second-member-provider-created', !reviewer.isError, reviewer.error?.message)
    await waitFor(() => requestOf(reviewer.value.childId).length ? true : undefined)
    const reviewed = await observe(reviewer.value.childId)
    check('second-member-provider-recorded', reviewed.recorded?.provider === PROVIDERS[2] && reviewed.recorded?.model === 'deepseek-worker', reviewed.recorded)
    check('second-role-instructions-recorded', reviewed.prompt.includes('HUB-TEAM-REVIEWER-MARKER'), reviewed.prompt)
    manifest.roots[0].members.push({ target: reviewer.value.target, childId: reviewer.value.childId, provider: PROVIDERS[2], model: 'deepseek-worker', roleMarker: 'HUB-TEAM-REVIEWER-MARKER' })

    const first = manifest.roots[0].members[0]
    await waitIdle(root)
    const requestCount = requestOf(first.childId).length
    await configure({ agents: roles.map(role => role.id === 'builder' ? { ...role, routes: ['deepseek'] } : role) })
    await call(root, 'send_message', { target: first.target, message: 'HUB-ROUTED-FORBIDDEN-WAKE Do not run outside the changed role policy.' })
    await waitIdle(root)
    check('narrower-role-blocks-wake-before-request', requestOf(first.childId).length === requestCount)
    await configure({ agents: roles })
    const restoredWake = await call(root, 'send_message', { target: first.target, message: 'HUB-ROUTED-RESTORED-WAKE Reply after restoring the role.' })
    check('restored-role-can-wake-again', !restoredWake.isError, restoredWake.error?.message)
    await waitFor(() => requestOf(first.childId).length > requestCount ? true : undefined)
    await observe(first.childId)
    check('restored-member-keeps-original-binding', requestOf(first.childId).slice(requestCount).every(row => row.provider === first.provider && row.model === first.model))
    check('lead-model-unchanged', root.model.current().provider === PROVIDERS[0] && root.model.current().model === 'gpt-lead', root.model.current())
    report.routedTeam.streamRoutes = streamRecords.map(({ provider, model }) => ({ provider, model }))
    check('actual-stream-used-second-provider', streamRecords.some(row => row.provider === PROVIDERS[1] && row.model === routes[0].model))
    check('role-in-actual-model-stream', streamRecords.filter(row => row.provider === PROVIDERS[1] && row.model === routes[0].model).every(row => row.roleMarker === true))
    writeFileSync(config.statePath, JSON.stringify(manifest, null, 2))
    await ctx.sessions.flush(root.session)
  } finally { await rootHandle.dispose() }

  const alternative = await create('deepseek-worker', PROVIDERS[2])
  try {
    const agent = alternative.agent
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'HUB-ROUTED-ALTERNATIVE-LEAD Reply once.' }], source: { kind: 'user' } }))
    await waitFor(() => requestOf(agent.id).length ? true : undefined)
    await waitIdle(agent)
    const child = await call(agent, 'hub_spawn_teammate', { name: 'alternative-worker', description: 'MiniMax member under another Lead', prompt: 'HUB-ROUTED-ALTERNATIVE-WORKER Reply once.', route: 'minimax', role: 'builder' })
    check('non-gpt-lead-creates-selected-member', !child.isError, child.error?.message)
    await waitFor(() => requestOf(child.value.childId).length ? true : undefined)
    const observed = await observe(child.value.childId)
    check('non-gpt-lead-member-route', observed.recorded?.provider === PROVIDERS[1] && observed.recorded?.model === routes[0].model, observed.recorded)
    check('non-gpt-lead-remains-independent', agent.model.current().provider === PROVIDERS[2] && agent.model.current().model === 'deepseek-worker')
    manifest.roots.push({ id: agent.id, provider: PROVIDERS[2], model: 'deepseek-worker', members: [{ target: child.value.target, childId: child.value.childId, provider: PROVIDERS[1], model: routes[0].model, roleMarker: 'HUB-TEAM-ROLE-MARKER' }] })
    writeFileSync(config.statePath, JSON.stringify(manifest, null, 2))
    await ctx.sessions.flush(agent.session)
  } finally { await alternative.dispose() }
}
