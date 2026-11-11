// Optional cross-model Team support using public plugin records, local backends and Agent.model.
// Native Team owns identities, messages, tasks, acceptance, cold activation and cleanup.
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import * as sessionRecords from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  HUB_TEAM_TOOL, TEAM_BACKENDS, TEAM_BINDING_LIMIT, TEAM_BINDING_RECORD, TEAM_ASSIGNMENT_RECORD,
  teamRoutingProjection, teamBindingSchema, sameTeamSelection, sameTeamAssignment, teamAssignmentProblem,
} from './team-routing-state.js'

const fail = message => { throw new Error(`subagent-hub: ${message}`) }
const read = value => typeof value?.get === 'function' ? value.get() : value
const output = { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] }

/** Wait only for read-only metadata; cancelled calls cannot proceed to any write. */
function cancellableRead(operation, signal) {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('Team creation cancelled'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

class TeamRouting {
  constructor(hub, ctx, projection) {
    this.hub = hub
    this.ctx = ctx
    this.projection = projection
    this.calls = new AsyncLocalStorage()
    this.queues = new Map()
    this.operations = new Set()
    this.controller = new AbortController()
    this.supported = true
    this.ready = false
  }

  state(agent) { return this.projection.stateOf(agent.session) }
  membership(agent) {
    try { return this.ctx.agentTeams.membership(agent) } catch { return undefined }
  }
  canCreate(agent) {
    return this.ready && !this.controller.signal.aborted && typeof agent?.model?.select === 'function'
      && !!this.ctx.tools.get('spawn_teammate', agent) && this.membership(agent)?.role === 'lead'
      && this.hub.catalog.routes.size > 0
  }
  capabilities(agent) {
    return { supported: this.ready && (!agent || typeof agent.model?.select === 'function'), tool: HUB_TEAM_TOOL, contexts: Object.keys(TEAM_BACKENDS),
      roleComposition: 'instructions-and-route-limits', lifecycle: 'native' }
  }

  async flush(agent) {
    if (await this.ctx.sessions.flush(agent.session) !== true) fail('Durable session storage is required for Hub Team assignments.')
  }
  async recordRoot(root, binding) {
    sessionRecords.appendPluginRecord(root.session, TEAM_BINDING_RECORD, teamBindingSchema.parse(binding))
    await this.flush(root)
  }

  /** Serialize plugin creation for one exact Lead; different Teams remain independent. */
  enqueue(agent, task) {
    const previous = this.queues.get(agent.id) ?? Promise.resolve()
    const operation = previous.catch(() => {}).then(task)
    this.queues.set(agent.id, operation)
    this.operations.add(operation)
    const release = () => {
      this.operations.delete(operation)
      if (this.queues.get(agent.id) === operation) this.queues.delete(agent.id)
    }
    operation.then(release, release)
    return operation
  }

  async plan(args, agent, signal) {
    if (!this.canCreate(agent)) fail('Cross-model Team creation requires a Team Lead, public model selection and configured Hub routes in this runtime.')
    if (this.ctx.agents.get(agent.id) !== agent) fail('The Team Lead is no longer active.')
    if (typeof args.name !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(args.name) || args.name.length > 64 || args.name === 'lead') fail('Use a unique lower-kebab-case teammate name, at most 64 characters, other than lead.')
    if (typeof args.description !== 'string' || !args.description.trim() || args.description.trim().length > 200) fail('A teammate description of 1–200 characters is required.')
    if (typeof args.prompt !== 'string' || !args.prompt.trim()) fail('A complete initial task is required.')
    if (this.ctx.agentTeams.listMembers(agent).some(member => member.name === args.name)) fail(`Team member name "${args.name}" has already been used, including failed members.`)
    const context = args.context ?? 'fresh'
    if (!Object.hasOwn(TEAM_BACKENDS, context)) fail('Team context must be fresh or fork.')
    const base = this.ctx.subagents.getProvider(context === 'fork' ? 'fork' : 'spawn')
    if (typeof base?.prepareContinuable !== 'function' || base.inheritsParentContext !== (context === 'fork')) fail(`The native ${context} local backend is unavailable.`)
    const route = this.hub.catalog.routes.get(args.route)
    if (!route) fail(`Unknown Hub route "${args.route}"; choose a route ID from the Hub catalog.`)
    const policy = this.hub.sessionPolicy(agent.session)
    if (policy?.length && !policy.some(pair => pair.provider === route.provider && pair.model === route.model)) fail('The selected route is outside this Lead session\'s captured child-model allowlist. Start a new top-level conversation after updating the official model settings.')
    let role
    if (args.role !== undefined) {
      const configured = this.hub.catalog.agents.find(role => role.id === args.role)
      if (!configured) fail(`Unknown Hub role "${args.role}"; a teammate name is not a role assignment.`)
      if (configured.basePreset !== 'standard') fail('Team roles currently apply instructions and route limits only; custom basePreset compositions require an ordinary subagent.')
      if (configured.routes?.length && !configured.routes.includes(route.id)) fail(`Role "${configured.id}" does not allow route "${route.id}".`)
      if (configured.instructions.length > 32768) fail('Team role instructions must be at most 32768 characters.')
      role = { id: configured.id, ...(configured.name ? { name: configured.name } : {}), instructions: configured.instructions }
    }
    const effort = args.reasoning_effort ?? route.reasoningEffort
    if (effort !== undefined && (typeof effort !== 'string' || !effort)) fail('reasoning_effort must be a non-empty advertised effort ID.')
    const selection = { provider: route.provider, model: route.model, ...(effort === undefined ? {} : { reasoningEffort: effort }) }
    if (!this.ctx.llm.listProviders().some(provider => provider.id === selection.provider)) fail(`Model provider "${selection.provider}" is unavailable.`)
    const models = await cancellableRead(this.ctx.llm.listModels(selection.provider), signal)
    if (!models.some(model => model.id === selection.model)) fail(`Model "${selection.provider}/${selection.model}" is unavailable.`)
    const parentSelection = agent.model.current()
    const changesForkModel = context === 'fork' && (parentSelection?.provider !== selection.provider || parentSelection?.model !== selection.model)
    if (effort !== undefined || changesForkModel) {
      if (typeof this.ctx.llm.resolveModelInfo !== 'function') fail('This runtime cannot verify reasoning efforts and fork model capacity for Team members.')
      const model = await cancellableRead(this.ctx.llm.resolveModelInfo(selection.provider, selection.model), signal)
      if (effort !== undefined && !model.reasoning?.efforts?.some(item => item.id === effort)) fail(`Reasoning effort "${effort}" is not advertised by the selected model.`)
      if (changesForkModel && (!Number.isFinite(model.context?.contextWindow) || model.context.contextWindow <= 0)) fail('Fork model switches require the selected adapter model to advertise contextWindow. Configure its context capacity or use context=fresh; no member was reserved.')
    }
    signal.throwIfAborted()
    const binding = { version: 1, token: randomUUID(), rootId: String(agent.id), name: args.name, routeId: route.id,
      selection, context, ...(role ? { role } : {}), phase: 'planned' }
    this.assertPolicy(binding)
    return binding
  }

  assertPolicy(binding) {
    const problem = teamAssignmentProblem(binding, this.hub.catalog)
    if (problem) fail(problem)
  }

  /** The public backend seam provides the reserved child ID before Agent setup starts. */
  async prepare(context, request) {
    const binding = this.calls.getStore()
    if (!binding || binding.context !== context || binding.rootId !== String(request.parent.id)) fail('Hub Team backends require an explicit, validated Hub creation call.')
    request.signal.throwIfAborted()
    const root = request.parent
    const persisted = this.state(root).bindings.find(row => row.token === binding.token)
    const member = this.ctx.agentTeams.listMembers(root).find(row => String(row.id) === String(request.sessionId))
    if (persisted?.phase !== 'planned' || !member || member.name !== binding.name || member.provider !== TEAM_BACKENDS[context]) fail('The reserved native Team member does not match its Hub assignment.')
    this.assertPolicy(binding)
    const prepared = { ...binding, childId: String(request.sessionId), phase: 'prepared' }
    await this.recordRoot(root, prepared)
    request.signal.throwIfAborted()
    const provider = this.ctx.subagents.getProvider(context === 'fork' ? 'fork' : 'spawn')
    if (typeof provider?.prepareContinuable !== 'function' || provider.inheritsParentContext !== (context === 'fork')) fail('The native context backend is no longer available.')
    return provider.prepareContinuable(request)
  }

  /** Locate only an exact reserved child; no policy is inferred from a member's display name. */
  assignment(agent) {
    const own = this.state(agent).assignment
    const membership = this.membership(agent)
    if (own && (!membership || membership.role !== 'teammate')) fail('A persisted Hub Team assignment has no matching native Team membership.')
    if (membership?.role !== 'teammate') return undefined
    const binding = this.state(membership.root).bindings.find(row => row.childId === String(agent.id))
    if (!own && !binding) return undefined
    if (!binding || !['prepared', 'bound'].includes(binding.phase) || binding.rootId !== String(membership.root.id)
      || binding.name !== membership.name || own && !sameTeamAssignment(own, binding)) fail('The child and Lead disagree on the persisted Hub Team assignment.')
    const member = this.ctx.agentTeams.listMembers(membership.root).find(member => String(member.id) === String(agent.id))
    if (!member || member.provider !== TEAM_BACKENDS[binding.context] || !['provisioning', 'running', 'inactive'].includes(member.status)) fail('Hub Team assignment does not identify an active native member.')
    return { binding: own ?? binding, root: membership.root }
  }

  /** Awaited before native initial input is released, for both first creation and cold activation. */
  async initialize(agent, signal) {
    const assignment = this.assignment(agent)
    if (!assignment) return
    const { binding, root } = assignment
    signal?.throwIfAborted()
    if (typeof agent.model?.select !== 'function') fail('This runtime cannot restore the selected Team member model.')
    this.assertPolicy(binding)
    const bound = { ...binding, phase: 'bound' }
    if (!this.state(agent).assignment) sessionRecords.appendPluginRecord(agent.session, TEAM_ASSIGNMENT_RECORD, bound)
    agent.model.select(binding.selection)
    await this.flush(agent)
    signal?.throwIfAborted()
    const current = this.state(root).bindings.find(row => row.token === binding.token)
    if (current?.phase !== 'bound') await this.recordRoot(root, bound)
  }

  async spawn(args, exec) {
    const agent = exec.agent
    if (!agent) fail('Team creation requires a calling Lead.')
    const signal = AbortSignal.any([exec.signal, this.controller.signal])
    return this.enqueue(agent, async () => {
      signal.throwIfAborted()
      const binding = await this.plan(args, agent, signal)
      const limit = read(this.hub.config.maxConcurrent) ?? 0
      if (limit > 0 && this.hub.runningChildren(agent) >= limit) fail(`This Lead already has ${limit} running children; wait for a slot before creating a teammate.`)
      if (this.state(agent).bindings.length >= TEAM_BINDING_LIMIT) fail('This Team has reached the Hub assignment limit; start a new Team.')
      try {
        await this.recordRoot(agent, binding)
        signal.throwIfAborted()
        const result = await this.calls.run(binding, () => this.ctx.agentTeams.spawnTeammate(agent, {
          name: binding.name, description: args.description.trim(), prompt: [{ type: 'text', text: args.prompt }],
          context: binding.context, provider: TEAM_BACKENDS[binding.context], signal,
        }))
        const final = this.state(agent).bindings.find(row => row.token === binding.token)
        if (final?.phase !== 'bound' || final.childId !== String(result.member.id)) fail('Native Team creation did not confirm the selected member model.')
        // Return the native name as target, as all native Team message/task tools expect.
        return { target: result.member.name, childId: String(result.member.id), route: binding.routeId, selection: binding.selection,
          ...(binding.role ? { role: binding.role.id } : {}), context: binding.context,
          composition: 'native-inherited', status: 'initial-message-accepted' }
      } catch (error) {
        try {
          const current = this.state(agent).bindings.find(row => row.token === binding.token) ?? binding
          const reserved = this.ctx.agentTeams.listMembers(agent).some(member => member.name === binding.name)
          await this.recordRoot(agent, { ...current, phase: reserved ? 'failed' : 'cancelled' })
        } catch (recordError) {
          this.ctx.logger?.warn?.(`subagent-hub: could not checkpoint failed Team assignment: ${String(recordError?.message ?? recordError)}`)
        }
        throw error
      }
    })
  }

  beforeStep(payload, next) {
    const assignment = this.assignment(payload.agent)
    if (assignment) {
      this.assertPolicy(assignment.binding)
      if (!sameTeamSelection(payload.modelSelection, assignment.binding.selection)) fail(`Team member "${assignment.binding.name}" has a model selection different from its pinned assignment; no request was started. Restore its selected model or create a new member.`)
    }
    return next()
  }

  roleContext(agent) {
    const assignment = this.assignment(agent)
    if (!assignment) return ''
    const binding = assignment.binding
    const role = binding.role
    return [`Hub Team member "${binding.name}" uses route "${binding.routeId}" (${binding.selection.provider}/${binding.selection.model}).`,
      'The Lead uses its own model. Team messaging, task ownership and lifecycle are native. Model selection is pinned for this member.',
      ...(role ? [`Your explicitly assigned Hub role is "${role.name || role.id}". This applies instructions and model limits; your tool composition remains inherited from the native Team.`, role.instructions] : [])].join('\n')
  }
}

/** All dependencies are optional for Hub itself; older/non-Team profiles retain existing behavior. */
export function installTeamRouting(hub) {
  return hub.ctx.inject(['agentTeams', 'agents', 'subagents', 'sessions', 'sessionProjections', 'tools', 'llm'], async ctx => {
    if (typeof sessionRecords.appendPluginRecord !== 'function' || typeof ctx.tools.resolve !== 'function'
      || typeof ctx.sessions.flush !== 'function' || typeof ctx.agentTeams.spawnTeammate !== 'function'
      || typeof ctx.agentTeams.membership !== 'function' || typeof ctx.agentTeams.listMembers !== 'function'
      || typeof ctx.subagents.getProvider !== 'function' || typeof ctx.subagents.registerProvider !== 'function') return
    const projection = await ctx.sessionProjections.register(teamRoutingProjection)
    const runtime = new TeamRouting(hub, ctx, projection)
    hub.teamRouting = runtime
    const disposers = []
    const remember = dispose => { disposers.push(dispose); return dispose }
    try {
      for (const context of Object.keys(TEAM_BACKENDS)) remember(ctx.subagents.registerProvider({
        name: TEAM_BACKENDS[context], capabilities: { agentOptions: true, agentPreset: false, outputSchema: false, depthLimit: true },
        inheritsParentContext: context === 'fork', prepareContinuable: request => runtime.prepare(context, request),
      }))
      remember(ctx.on('agent/created', ({ agent, signal }) => runtime.initialize(agent, signal)))
      remember(ctx.on('agent/pre-step', (payload, next) => runtime.beforeStep(payload, next)))
      remember(ctx.systemPrompt.context({ name: 'dsh-subagent-hub:team-role',
        order: ctx.systemPrompt.getContextOrder('SUBAGENT_DELEGATION') + 10, text: context => context.agent ? runtime.roleContext(context.agent) : '' }))
      for (const agent of ctx.agents.list()) {
        try { await runtime.initialize(agent) }
        catch (error) {
          // Keep the step guard installed: one now-disallowed member must not disable policy
          // enforcement for every other member during HMR. Its next step will fail closed.
          ctx.logger?.warn?.(`subagent-hub: Team member initialization blocked: ${String(error?.message ?? error)}`)
        }
      }
      runtime.ready = true
      remember(ctx.tools.register(defineTool({
        name: HUB_TEAM_TOOL,
        description: 'Create a native durable Team member with an explicit Hub model route, independently of the Lead model. Only the Team Lead may call it. Native Team owns messaging, tasks and lifecycle. An optional Hub role supplies instructions and allowed routes, not a separate tool/base-preset composition. Returns the native teammate target for send_message and task ownership. Acceptance does not mean work completed.',
        parameters: {
          name: { type: 'string', required: true, description: 'Unique lower-kebab-case teammate identity; not a role ID.' },
          description: { type: 'string', required: true, description: 'Responsibility, at most 200 characters.' },
          prompt: { type: 'string', required: true, description: 'Complete initial task.' },
          route: { type: 'string', required: true, description: 'Exact Hub route ID from the configured model catalog.' },
          role: { type: 'string', description: 'Optional exact Hub role ID; explicitly applies role instructions and route limits. Custom basePreset is unsupported.' },
          context: { type: 'string', enum: ['fresh', 'fork'], description: 'fresh has no Lead history; fork inherits completed history. Default fresh. Both use the selected route.' },
          reasoning_effort: { type: 'string', description: 'Optional advertised effort ID; omitted uses the configured route default or adapter default.' },
        }, output, execute: (args, exec) => runtime.spawn(args, exec),
        presentCall: args => ({ card: 'generic', kind: 'other', title: `创建 Team 成员 · ${args.name}` }),
      }), { when: ({ agent }) => runtime.canCreate(agent) }))
    } catch (error) {
      runtime.ready = false
      runtime.controller.abort()
      for (const dispose of disposers.reverse()) await dispose()
      await projection.dispose()
      if (hub.teamRouting === runtime) hub.teamRouting = undefined
      throw error
    }
    return async () => {
      runtime.ready = false
      runtime.controller.abort()
      await Promise.allSettled([...runtime.operations])
      for (const dispose of disposers.reverse()) await dispose()
      await projection.dispose()
      runtime.calls.disable()
      if (hub.teamRouting === runtime) hub.teamRouting = undefined
    }
  })
}
