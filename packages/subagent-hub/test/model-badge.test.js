import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
function client() {
  let entry
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: value => { entry = value } } },
  })
  return entry.factory(id => id === 'react' ? React : {})
}
const plain = value => JSON.parse(JSON.stringify(value))
const child = { subagent: { address: { parentSessionId: 'root', childSessionId: 'child', mode: 'one-shot' } } }
const route = { provider: 'magpie', model: 'minimax-cn/MiniMax-M3.1-Flash', reasoningEffort: 'max' }
const face = value => ({ getSnapshot: () => value, subscribe: () => () => {} })
const t = (key, args = {}) => key + Object.entries(args).map(([name, value]) => ` ${name}=${value}`).join('')
function render(session, projection, names) {
  return renderToStaticMarkup(React.createElement(client().ModelBadge, { session: face(session), projection: face(projection), names, t }))
}
const groups = [{ id: 'magpie-anthropic', name: 'Magpie · Anthropic', models: [
  { id: 'qoder-cn/qfmodel', name: 'Qwen3.8-Flash · Qoder CN' },
  { id: 'qoder-cn/dfmodel', name: 'DeepSeek-Flash · Qoder CN' },
] }]
const catalog = face({ status: 'ready', groups })
const qwen = { provider: 'magpie-anthropic', model: 'qoder-cn/qfmodel' }

test('main sessions do not render a model badge, even if they have request records', () => {
  assert.deepEqual(plain(client().modelBadgeData({ subagent: null }, { lastUsed: route, next: route })), { kind: 'hidden' })
  assert.equal(render({ subagent: null }, { lastUsed: route, next: route }), '')
})

test('the lastUsed request record is the displayed route, independently of the next selection', () => {
  const next = { provider: 'other', model: 'future-model' }
  assert.deepEqual(plain(client().modelBadgeData(child, { lastUsed: route, next })), { kind: 'recorded', last: route, next })
  const html = render(child, { lastUsed: route, next })
  const summary = html.match(/<summary[\s\S]*?<\/summary>/)[0]
  assert.match(summary, /magpie · MiniMax-M3.1-Flash/)
  assert.doesNotMatch(summary, /future-model/)
  assert.match(html, /minimax-cn\/MiniMax-M3.1-Flash/)
  assert.match(html, /modelBadge.next/)
  assert.match(html, /future-model/)
  assert.match(html, /modelBadge.effort/)
})

test('a planned route without a request is clearly waiting, not a recorded model', () => {
  assert.deepEqual(plain(client().modelBadgeData(child, { lastUsed: null, next: route })), { kind: 'waiting', next: route })
  const summary = render(child, { lastUsed: null, next: route }).match(/<summary[\s\S]*?<\/summary>/)[0]
  assert.match(summary, /modelBadge.waitingShort/)
  assert.doesNotMatch(summary, /magpie/)
})

test('an empty ready projection means no request, while an absent projection is unconfirmed', () => {
  const { modelBadgeData } = client()
  assert.equal(modelBadgeData(child, { lastUsed: null, next: null }).kind, 'waiting')
  for (const value of [undefined, null, {}, { next: route }, { lastUsed: { provider: 'x' }, next: null }]) {
    assert.equal(modelBadgeData(child, value).kind, 'unknown')
  }
})

test('equal next and recorded routes are not duplicated; an effort-only pending change is retained', () => {
  const { modelBadgeData } = client()
  assert.deepEqual(plain(modelBadgeData(child, { lastUsed: route, next: { ...route } })), { kind: 'recorded', last: route })
  const next = { ...route, reasoningEffort: 'high' }
  assert.deepEqual(plain(modelBadgeData(child, { lastUsed: route, next })), { kind: 'recorded', last: route, next })
})

test('malformed routes never become a verified model', () => {
  const { modelBadgeData } = client()
  for (const lastUsed of [{ provider: '', model: 'm' }, { provider: 'p', model: ' ' }, { provider: 123, model: 'm' }]) {
    assert.equal(modelBadgeData(child, { lastUsed, next: route }).kind, 'unknown')
  }
})

test('full route ids remain readable in the details, including separators and long strings', () => {
  const lastUsed = { provider: 'provider-with-a-long-name', model: 'namespace/' + 'model-'.repeat(40) }
  const html = render(child, { lastUsed, next: null })
  assert.match(html, /<details/)
  assert.match(html, /<summary[^>]*aria-label=/)
  assert.match(html, /aria-controls=/)
  assert.match(html, /role="group"/)
  assert.ok(html.includes(lastUsed.model))
  assert.match(html, /role="status"/)
})

test('slot shares use retained public session faces without any model selection or network calls', () => {
  const { modelBadgeShares } = client()
  const projection = face({ lastUsed: route, next: route })
  const session = { ...face(child), projections: { faceOf(key) { assert.equal(key, 'modelSelection'); return projection } } }
  const result = modelBadgeShares({ binding(id) { assert.equal(id, 'child'); return { session } } }, 'child')
  assert.equal(result.session, session)
  assert.equal(result.projection, projection)
  assert.deepEqual(plain(modelBadgeShares({ binding: () => undefined }, 'missing')), {})
})

test('the optional session contribution uses the official utilities list slot', () => {
  const { registerModelBadge, MODEL_BADGE_SLOT } = client()
  let definition
  let component
  const scope = {
    sessions: { binding: () => undefined },
    slots: {
      inject(name, register) { assert.equal(name, 'conversation.session.header.utilities'); return register() },
      register(options, body) {
        if (typeof options.id !== 'string' || !options.id) throw new Error('list slot requires options.id')
        definition = options
        component = body
      },
    },
  }
  registerModelBadge({ inject(services, register) { assert.deepEqual(plain(services), ['sessions']); register(scope) } }, t)
  assert.equal(definition.name, MODEL_BADGE_SLOT)
  assert.equal(definition.id, 'subagent-hub-model')
  assert.equal(definition.key, undefined)
  assert.equal(typeof definition.inject, 'function')
  assert.equal(renderToStaticMarkup(component(definition.inject('missing'))), '')
})

test('a catalog name labels the summary while the panel keeps the wire ids', () => {
  const html = render(child, { lastUsed: qwen, next: null }, catalog)
  const summary = html.match(/<summary[\s\S]*?<\/summary>/)[0]
  // The recorded route reads like the configuration page, not like its wire id.
  assert.match(summary, /Qwen3\.8-Flash · Qoder CN/)
  assert.doesNotMatch(summary, /qfmodel/)
  assert.match(html, /aria-label="modelBadge\.summaryModel model=Qwen3\.8-Flash · Qoder CN"/)
  // Evidence stays checkable: the exact provider and model id remain in the details.
  assert.match(html, /qoder-cn\/qfmodel/)
  assert.match(html, /magpie-anthropic/)
})

test('a route the catalog does not advertise keeps the provider and the id tail', () => {
  const unlisted = { provider: 'deepseek-official', model: 'deepseek-flash' }
  const html = render(child, { lastUsed: unlisted, next: null }, catalog)
  const summary = html.match(/<summary[\s\S]*?<\/summary>/)[0]
  assert.match(summary, /deepseek-official · deepseek-flash/)
  assert.match(html, /aria-label="modelBadge\.summary provider=deepseek-official model=deepseek-flash"/)
  // Without a catalog the chip is exactly the pre-existing fallback.
  const bare = render(child, { lastUsed: qwen, next: null })
  assert.match(bare.match(/<summary[\s\S]*?<\/summary>/)[0], /magpie-anthropic · qfmodel/)
})

test('names resolve per provider and model pair, never from a blank or malformed entry', () => {
  const { routeLabel, routeModelName, modelIdTail } = client()
  assert.equal(routeModelName(groups, qwen), 'Qwen3.8-Flash · Qoder CN')
  assert.equal(routeModelName(groups, { provider: 'magpie-anthropic', model: 'qoder-cn/dfmodel' }), 'DeepSeek-Flash · Qoder CN')
  // The same model id under another provider is a different route.
  assert.equal(routeModelName(groups, { provider: 'other', model: 'qoder-cn/qfmodel' }), undefined)
  assert.equal(routeModelName(groups, { provider: 'magpie-anthropic', model: 'unlisted' }), undefined)
  assert.equal(routeModelName(groups, null), undefined)
  assert.equal(routeModelName(undefined, qwen), undefined)
  assert.equal(routeModelName([{ id: 'p', models: [{ id: 'm', name: '   ' }] }], { provider: 'p', model: 'm' }), undefined)
  assert.deepEqual(plain(routeLabel(groups, qwen)), { value: 'Qwen3.8-Flash · Qoder CN', named: true })
  assert.deepEqual(plain(routeLabel(groups, { provider: 'p', model: 'ns/m' })), { value: 'p · m', named: false })
  assert.equal(modelIdTail('ns/deep/model'), 'model')
  assert.equal(modelIdTail('deepseek-flash'), 'deepseek-flash')
  assert.equal(modelIdTail(''), '')
})

test('a catalog face without a loader is tolerated instead of breaking the badge', () => {
  const { loadModelNames } = client()
  // The badge shares whatever face it is given; only createModelNames() has a loader.
  const plain = { getSnapshot: () => ({ status: 'ready', groups }), subscribe: () => () => {} }
  assert.doesNotThrow(() => loadModelNames(plain, undefined))
  assert.doesNotThrow(() => loadModelNames(undefined, undefined))
  let asked
  loadModelNames({ load: remote => { asked = remote } }, 'remote-face')
  assert.equal(asked, 'remote-face')
})

test('the catalog is read once per runtime and a failed read keeps the raw ids', async () => {
  const { createModelNames } = client()
  let calls = 0
  const remote = { session: { modelCatalog: async () => { calls += 1; return { ok: true, value: { groups } } } } }
  const names = createModelNames()
  const seen = []
  names.subscribe(() => seen.push(names.getSnapshot().status))
  assert.equal(names.getSnapshot().status, 'idle')
  await Promise.all([names.load(remote), names.load(remote)])
  assert.equal(calls, 1)
  assert.equal(names.getSnapshot().status, 'ready')
  assert.equal(names.getSnapshot().groups.length, 1)
  assert.deepEqual(seen, ['loading', 'ready'])
  await names.load(remote)
  assert.equal(calls, 1)

  // A refused, throwing, empty, or absent catalog never invents a name.
  const refused = createModelNames()
  await refused.load({ session: { modelCatalog: async () => ({ ok: false }) } })
  assert.deepEqual(plain(refused.getSnapshot()), { status: 'unavailable', groups: [] })
  const throwing = createModelNames()
  await throwing.load({ session: { modelCatalog: async () => { throw new Error('offline') } } })
  assert.equal(throwing.getSnapshot().status, 'unavailable')
  const empty = createModelNames()
  await empty.load({ session: { modelCatalog: async () => ({ ok: true, value: { groups: [] } }) } })
  assert.deepEqual(plain(empty.getSnapshot()), { status: 'unavailable', groups: [] })
  const absent = createModelNames()
  absent.load(undefined)
  assert.deepEqual(plain(absent.getSnapshot()), { status: 'unavailable', groups: [] })
})
