// `delegate` tool row, mounted inside the `<base>+hub` presets in place of the official tools.
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'subagent-hub-delegate'
export const inject = ['subagentHub', 'subagents', 'tools', 'systemPrompt']

export const Config = z.object({
  provider: z.string().default('spawn').description('Subagent provider children start under.'),
  toolName: z.string().default('delegate'),
})

const SECTION_ORDER = 2810 // right after the shipped TOOL_SUBAGENT section

export function apply(ctx, config) {
  const hub = ctx.subagentHub
  const tags = hub.tags()

  ctx.tools.register(defineTool({
    name: config.toolName,
    description: 'Delegate a self-contained task to a subagent that works in its own fresh context and returns its result. '
      + 'Choose a named agent and/or capability tags; the harness resolves the model and records why. '
      + 'Returns the child id immediately; the runtime notifies you when it finishes. Use `send_message` to steer or continue it.',
    parameters: {
      description: { type: 'string', required: true, description: 'A short (3-5 word) description of the task, for display.' },
      prompt: { type: 'string', required: true, description: 'The complete, self-contained task. The child does not see this conversation.' },
      agent: { type: 'string', description: 'Named agent id from the delegation catalog in your instructions. Omit for a general child.' },
      ...(tags.length === 0 ? {} : {
        needs: { type: 'array', items: { type: 'string', enum: tags }, description: 'Capabilities the child model must have.' },
      }),
      cwd: { type: 'string', description: 'Initial child working directory; omitted inherits yours.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          subagentId: { type: 'string', required: true },
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
      presentationMeta: (_args, value) => ({ subagentHub: value }),
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
        ...(plan.agent === undefined ? {} : { agent: plan.agent.id }),
        provider: plan.effective.provider,
        model: plan.effective.model,
        mode: plan.decision.mode,
        reason: plan.decision.reason,
        fallbacks: plan.decision.rejected.map(item => `${item.route}: ${item.reason}`),
      }
    },
  }))

  ctx.systemPrompt.section({
    name: 'subagent-hub',
    order: SECTION_ORDER,
    text: context => hub.promptSection(context.scope, config.toolName),
  })
}
