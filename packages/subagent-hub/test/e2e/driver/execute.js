// Exercise the native executor selected by this installed runtime. Older SDKs expose
// one-call execute; the executor-service SDK accepts raw model call batches instead.
export async function executeTool(ctx, call) {
  if (typeof ctx.tools.setExecutor !== 'function') return ctx.tools.execute(call)
  const batch = await ctx.tools.execute({
    calls: [{ type: 'tool-call', id: call.callId, name: call.name, arguments: JSON.stringify(call.arguments) }],
    agent: call.agent,
    signal: call.signal,
    ...(call.toolSet === undefined ? {} : { toolSet: call.toolSet }),
  })
  const result = batch.results.find(item => item.callId === call.callId)?.result
  if (result === undefined) throw new Error(`Native executor omitted result for ${call.callId}`)
  return result
}
