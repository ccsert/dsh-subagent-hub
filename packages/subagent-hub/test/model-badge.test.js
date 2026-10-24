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
function render(session, projection) {
  return renderToStaticMarkup(React.createElement(client().ModelBadge, { session: face(session), projection: face(projection), t }))
}

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
