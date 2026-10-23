// `delegate` tool row, mounted inside the `<base>+hub` presets in place of the official tools.
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFINE_META_KEY, META_KEY } from './projection.js'

export const name = 'subagent-hub-delegate'
export const inject = ['subagentHub', 'subagents', 'tools', 'systemPrompt']

export const Config = z.object({
  provider: z.string().default('spawn').description('Subagent provider children start under.'),
  toolName: z.string().default('delegate'),
  defineToolName: z.string().default('define_subagent'),
})

const SECTION_ORDER = 2810 // right after the shipped TOOL_SUBAGENT section

export function apply(ctx, config) {
  const hub = ctx.subagentHub

  ctx.tools.register(defineTool({
    name: config.toolName,
    description: 'Delegate a self-contained task to a subagent that works in its own fresh context and returns its result. '
      + 'Choose a named agent and/or capability tags; the harness resolves the model and records why. '
      + 'Returns the child id immediately; the runtime notifies you when it finishes. Use `send_message` to steer or continue it.',
    parameters: {
      description: { type: 'string', required: true, description: 'A short (3-5 word) description of the task, for display.' },
      prompt: { type: 'string', required: true, description: 'The complete, self-contained task. The child does not see this conversation.' },
      agent: { type: 'string', description: 'Named agent id from the delegation catalog in your instructions. Omit for a general child.' },
      // No enum: the route table is volatile, so tags are listed in the delegation instructions
      // and validated at call time with the known set in the error.
      needs: { type: 'array', items: { type: 'string' }, description: 'Capability tags the child model must have, from the delegation instructions.' },
      cwd: { type: 'string', description: 'Initial child working directory; omitted inherits yours.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          subagentId: { type: 'string', required: true },
          label: { type: 'string', required: true },
          agent: { type: 'string' },
          provider: { type: 'string', required: true },
          model: { type: 'string', required: true },
          mode: { type: 'string', required: true, enum: ['route', 'inherit'] },
          reason: { type: 'string', required: true },
          fallbacks: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `started subagent ${value.subagentId}${value.agent ? ` (${value.agent})` : ''} on ${value.provider}/${value.model}: ${value.reason}`,
      }],
      // Durable routing record for the panel (M2): what ran and why.
      presentationMeta: (_args, value) => ({ [META_KEY]: value }),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parent = exec.agent
      if (parent === undefined) throw new Error('delegate requires a calling agent')
      const plan = await hub.plan({ agent: args.agent, needs: args.needs ?? [], parent, signal: exec.signal })
      exec.signal.throwIfAborted()
      const maxDepth = ctx.subagents.resolveMaxDepth()
      const activation = await ctx.subagents.startActivation({
        provider: config.provider,
        label: args.description,
        request: {
          ...(args.cwd === undefined ? {} : { cwd: args.cwd }),
          prompt: [{ type: 'text', text: args.prompt }],
          parent,
          ...(plan.agentPreset === undefined ? {} : { agentPreset: plan.agentPreset }),
          ...(plan.agentOptions === undefined ? {} : { agentOptions: plan.agentOptions }),
          ...(maxDepth === undefined ? {} : { maxDepth }),
        },
        signal: exec.signal,
        delivery: 'parent',
      })
      return {
        subagentId: activation.childId,
        label: args.description,
        ...(plan.agent === undefined ? {} : { agent: plan.agent.id }),
        provider: plan.effective.provider,
        model: plan.effective.model,
        mode: plan.decision.mode,
        reason: plan.decision.reason,
        fallbacks: plan.decision.rejected.map(item => `${item.route}: ${item.reason}`),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: config.defineToolName,
    description: 'Define a reusable named subagent for this session: a role (instructions) and optional model constraints. '
      + `Afterwards pass its id as \`agent\` to \`${config.toolName}\`. Redefining an id replaces it. `
      + 'Set `persist` to `workspace` or `profile` only when the user asked to keep it; that requires the user\'s approval, and a rejected request keeps it for this session only.',
    parameters: {
      id: { type: 'string', required: true, description: 'Lowercase id: letters, digits, dashes; starts with a letter.' },
      description: { type: 'string', required: true, description: 'One line telling future delegators when to use this agent.' },
      instructions: { type: 'string', required: true, description: 'The role prompt appended to the child persona.' },
      routes: { type: 'array', items: { type: 'string' }, description: 'Optional route ids the agent is confined to.' },
      needs: { type: 'array', items: { type: 'string' }, description: 'Optional capability tags the agent always requires.' },
      basePreset: { type: 'string', description: 'Preset the agent\'s children are built from; default standard.' },
      persist: { type: 'string', enum: ['session', 'workspace', 'profile'], description: 'Where to keep it; default session.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          persisted: { type: 'string', required: true, enum: ['session', 'workspace', 'profile'] },
          requested: { type: 'string', required: true },
          approval: { type: 'string' },
          target: { type: 'string' },
          definition: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.persisted === value.requested
          ? `defined subagent "${value.id}" (${value.persisted}${value.target ? `: ${value.target}` : ''})`
          : `defined subagent "${value.id}" for this session only; saving to ${value.requested} was not approved (${value.approval})`,
      }],
      // Session layer record: the projection folds it so the definition lives in the log.
      presentationMeta: (_args, value) => ({ [DEFINE_META_KEY]: { ...value.definition, persisted: value.persisted } }),
    },
    async execute(args, exec) {
      const caller = exec.agent
      if (caller === undefined) throw new Error(`${config.defineToolName} requires a calling agent`)
      const { persist = 'session', ...raw } = args
      const outcome = await hub.define({ raw, persist, caller, callId: exec.callId, signal: exec.signal })
      const { id, description, instructions, routes, needs, basePreset } = outcome.definition
      return {
        id,
        persisted: outcome.persisted,
        requested: persist,
        ...(outcome.promotion === undefined ? {} : { approval: outcome.promotion.outcome }),
        ...(outcome.promotion?.target === undefined ? {} : { target: outcome.promotion.target }),
        definition: { id, description, instructions, basePreset, ...(routes ? { routes } : {}), ...(needs ? { needs } : {}) },
      }
    },
  }))

  ctx.systemPrompt.section({
    name: 'subagent-hub',
    order: SECTION_ORDER,
    text: context => hub.promptSection(context.scope, config.toolName, config.defineToolName),
  })
}
