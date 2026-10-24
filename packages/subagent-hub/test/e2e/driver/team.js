import { randomUUID } from 'node:crypto'

// Native Team regression. All llm/stream traffic is intercepted by index.js.
// The SDK's known Flash/Pro routes stand in for the allowed MiniMax / forbidden
// Codex pair; the Host-hook unit regression uses the exact reported model IDs.
export async function runTeamChecks(ctx, config, report, { requests, children, waitFor }) {
  const teams = ctx.get('agentTeams')
  if (!teams) throw new Error('Native Team runtime is missing from the fixture')
  const create = async model => (await ctx.agents.create({
    sessionId: `session-${randomUUID()}`,
    agentOptions: { provider: 'deepseek-official', model },
    meta: { cwd: config.cwd, agentPreset: 'standard' },
    setup: async scope => { await ctx.agentPresets.mount(scope, 'standard') },
  })).agent
  const members = root => teams.listMembers(root).filter(member => member.role === 'teammate')
  const call = async (root, context, name) => {
    const result = await ctx.tools.execute({
      callId: `call-${randomUUID()}`,
      name: 'spawn_teammate',
      arguments: { name, description: 'Team route regression', prompt: 'HUB-TEAM-CHECK Reply once.', context },
      agent: root,
      signal: new AbortController().signal,
    })
    if (result.isError) return { isError: true, reason: result.error?.message ?? '' }
    const target = result.value?.member?.target
    const member = members(root).find(member => member.name === target)
    if (!member) throw new Error(`Team member ${target} was not registered`)
    const request = await waitFor(() => requests.get(member.id))
    const session = children.get(member.id)?.session
    const model = session && await waitFor(() => {
      const value = ctx.sessionProjections.snapshot(session, ['modelSelection']).values.modelSelection
      return value?.lastUsed ?? undefined
    })
    return { isError: false, context, target, request, model, parentSession: session?.header?.parentSession }
  }

  // Control: both native context modes inherit Pro when it is allowed. This is
  // observed from actual child requests, not inferred from creation options.
  const control = await create('deepseek-v4-pro')
  report.teamSchema = Object.keys(ctx.tools.get('spawn_teammate', control).parameters.properties)
  report.independentSchemas = ['subagent', 'subagent_fork'].map(name => ({
    name,
    parameters: Object.keys(ctx.tools.get(name, control)?.parameters?.properties ?? {}),
  }))
  report.teamControl = {
    fresh: await call(control, 'fresh', 'control-fresh'),
    fork: await call(control, 'fork', 'control-fork'),
  }

  const descriptor = ctx.settings.describe().find(entry => entry.ns === 'subagent-hub')
  const flash = descriptor.value.routes.find(route => route.id === 'flash')
  report.teamPolicySaved = await ctx.settings.mutate('subagent-hub', [{ op: 'set', path: ['routes'], value: [flash] }], descriptor.revision)
  await ctx.subagentHub.whenSettled()

  // A new Session has the current native schema, yet still cannot select a model
  // on spawn_teammate. Guard failures must leave no durable teammate row or child.
  const blocked = await create('deepseek-v4-pro')
  const before = children.size
  report.teamBlocked = {
    fresh: await call(blocked, 'fresh', 'forbidden-fresh'),
    fork: await call(blocked, 'fork', 'forbidden-fork'),
    memberCount: members(blocked).length,
    childrenCreated: children.size - before,
  }
  report.teamSection = (await ctx.systemPrompt.assemble({ scope: blocked })).sections.find(section => section.name === 'dsh-subagent-hub')?.text

  const forkProbe = await ctx.tools.execute({
    callId: `call-${randomUUID()}`, name: 'subagent_fork',
    arguments: { cwd: config.cwd, description: 'Independent fork route probe', prompt: 'HUB-TEAM-FORK-PROBE Reply once.' },
    agent: blocked, signal: new AbortController().signal,
  })
  report.independentForkProbe = forkProbe.isError
    ? { isError: true, reason: forkProbe.error?.message ?? '' }
    : { isError: false, request: await waitFor(() => requests.get(forkProbe.value.subagentId)) }

  const allowed = await create('deepseek-flash')
  report.teamAllowed = {
    fresh: await call(allowed, 'fresh', 'allowed-fresh'),
    fork: await call(allowed, 'fork', 'allowed-fork'),
  }
}
