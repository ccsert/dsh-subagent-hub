// A trivial tool row proving a third-party package can sit inside a derived preset.
export const name = 'hub-spike-tool'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register({
    name: 'hub_probe',
    description: 'Spike probe tool.',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      render: () => [{ type: 'text', text: 'ok' }],
    },
    execute: async () => ({ ok: true }),
  })
}
