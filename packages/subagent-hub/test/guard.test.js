import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GUARD_PREFIX, concurrencyVerdict, creationRouteVerdict, effectiveRoute, guardVerdict } from '../lib/guard.js'
import { buildCatalog } from '../lib/catalog.js'

const catalog = buildCatalog({
  routes: [
    { id: 'flash', provider: 'p', model: 'flash', tags: ['fast'] },
    { id: 'pro', provider: 'p', model: 'pro', tags: ['reasoning'] },
  ],
  agents: [
    { id: 'reviewer', description: 'Reviews diffs', routes: ['flash'] },
    { id: 'generalist', description: 'Any model' },
  ],
})
// buildCatalog drops agents with unknown route references, so forge the misconfigured entry.
const catalogWithBroken = {
  routes: catalog.routes,
  byPreset: new Map(catalog.byPreset).set('hub-agent-broken', { id: 'broken', presetId: 'hub-agent-broken', routes: ['missing'] }),
}
const parent = (provider, model) => ({ options: { provider, model } })

const verdict = (args, parentAgent = parent('p', 'flash')) => guardVerdict({ arguments: args, parent: parentAgent, catalog })

test('calls without an agent_preset, or with a foreign preset, are not ours to judge', () => {
  assert.equal(verdict({ description: 'x' }), undefined)
  assert.equal(verdict({ agent_preset: 'standard' }), undefined)
})

test('unconstrained named agents allow any request', () => {
  assert.equal(verdict({ agent_preset: 'hub-agent-generalist', provider: 'p', model: 'pro' }), undefined)
})

test('explicit allowed and inherited allowed routes pass', () => {
  assert.equal(verdict({ agent_preset: 'hub-agent-reviewer', provider: 'p', model: 'flash' }), undefined)
  assert.equal(verdict({ agent_preset: 'hub-agent-reviewer' }), undefined, 'inherits p/flash from the parent')
})

test('explicit route outside the named agent routes is rejected with both lists', () => {
  const reason = verdict({ agent_preset: 'hub-agent-reviewer', provider: 'p', model: 'pro' })
  assert.ok(reason.startsWith(GUARD_PREFIX), reason)
  assert.match(reason, /named agent "reviewer" is limited to routes p\/flash/)
  assert.match(reason, /requested p\/pro is not allowed/)
  assert.match(reason, /route ids: flash/)
})

test('an inherited parent route outside the named agent routes is rejected too', () => {
  const reason = verdict({ agent_preset: 'hub-agent-reviewer' }, parent('p', 'pro'))
  assert.match(reason, /would inherit the parent route p\/pro/)
  assert.match(reason, /Pass `provider` and `model` together/)
})

test('a half-specified pair is left to the official tool pairing error', () => {
  assert.equal(verdict({ agent_preset: 'hub-agent-reviewer', provider: 'p' }), undefined)
  assert.equal(verdict({ agent_preset: 'hub-agent-reviewer', model: 'flash' }), undefined)
})

test('an unknown route reference denies instead of silently unconstraining', () => {
  const reason = guardVerdict({ arguments: { agent_preset: 'hub-agent-broken', provider: 'p', model: 'flash' }, parent: parent('p', 'flash'), catalog: catalogWithBroken })
  assert.match(reason, /references unknown route "missing"/)
})

test('the concurrency limit refuses a delegation past the cap', () => {
  const base = { toolName: 'subagent', delegationTools: ['subagent', 'subagent_fork'], limit: 2 }
  assert.equal(concurrencyVerdict({ ...base, running: 1 }), undefined)
  const reason = concurrencyVerdict({ ...base, running: 2 })
  assert.ok(reason.startsWith(GUARD_PREFIX), reason)
  assert.match(reason, /2 个子 agent 正在运行（上限 2）/)
  assert.match(reason, /等其中一个结束后再派发/)
})

test('the concurrency limit ignores other tools and an unlimited setting', () => {
  const base = { toolName: 'read', delegationTools: ['subagent'], limit: 1, running: 5 }
  assert.equal(concurrencyVerdict(base), undefined)
  assert.equal(concurrencyVerdict({ ...base, toolName: 'subagent', limit: 0 }), undefined)
  assert.equal(concurrencyVerdict({ ...base, toolName: 'subagent', limit: -1 }), undefined)
})

test('effective route prefers explicit arguments, then the parent request header, then creation options', () => {
  assert.deepEqual(effectiveRoute({ provider: 'q', model: 'm' }, parent('p', 'pro')), { provider: 'q', model: 'm', source: 'requested' })
  const headerParent = { options: { provider: 'created', model: 'created' }, session: { requestHeader: () => ({ config: { provider: 'p', model: 'pro' } }) } }
  assert.deepEqual(effectiveRoute({}, headerParent), { provider: 'p', model: 'pro', source: 'inherited parent' })
  assert.deepEqual(effectiveRoute({}, parent('p', 'pro')), { provider: 'p', model: 'pro', source: 'inherited parent' })
  assert.equal(effectiveRoute({ provider: 'p' }, parent('p', 'pro')), undefined)
  assert.equal(effectiveRoute({}, undefined), undefined)
})

// ── two layers ───────────────────────────────────────────────────────────────────────────────
// The live configuration is read on every call, but the official runtime captured an allowlist
// into each Session at start. A refusal must name the layer that refused and list its routes.

const selecting = { properties: { provider: {}, model: {} } }
const session = (allowed) => creationRouteVerdict({
  toolName: 'subagent', arguments: { provider: 'p', model: 'flash' }, parent: parent('p', 'flash'),
  catalog, parameters: selecting, sessionPolicy: allowed,
})

test('a Session snapshot that lacks a newly configured route is refused by the session layer', () => {
  const reason = session([{ provider: 'q', model: 'pro' }])
  assert.ok(reason.startsWith(GUARD_PREFIX), reason)
  assert.match(reason, /refused by the Session model allowlist \(layer 2\/2\), captured when this Session started/)
  assert.match(reason, /q\/pro/, 'the layer lists the routes it actually allows')
  assert.match(reason, /The call subagent would use p\/flash/)
  assert.match(reason, /Hub route configuration \(layer 1\/2\) allows this route/)
  assert.match(reason, /new top-level Session/)
  assert.doesNotMatch(reason, /outside the configured child routes/)
})

test('a snapshot missing several configured routes names what only a new Session can use', () => {
  const reason = session([{ provider: 'q', model: 'pro' }])
  assert.match(reason, /additionally allows p\/flash, p\/pro, which only a new Session can use/)
})

test('a route the Session still captures but the configuration dropped is refused by the config layer', () => {
  const reason = creationRouteVerdict({
    toolName: 'subagent', arguments: { provider: 'z', model: 'old' }, parent: parent('z', 'old'),
    catalog, parameters: selecting, sessionPolicy: [{ provider: 'z', model: 'old' }],
  })
  assert.match(reason, /refused by the Hub route configuration \(layer 1\/2\), which allows p\/flash, p\/pro/)
  assert.match(reason, /would use z\/old/)
  assert.ok(reason.includes('No child was started.'))
  assert.doesNotMatch(reason, /layer 2\/2/)
})

test('an agreeing snapshot changes nothing and a missing snapshot is not an empty one', () => {
  assert.equal(session([{ provider: 'p', model: 'flash' }]), undefined)
  assert.equal(session([{ provider: 'p', model: 'flash' }, { provider: 'q', model: 'pro' }]), undefined)
  assert.equal(session(undefined), undefined, 'no captured allowlist means the configuration alone decides')
  assert.equal(session([]), undefined, 'an unreadable projection must not refuse a valid route')
})

test('an inherited route captured by the Session still passes without provider/model inputs', () => {
  const reason = creationRouteVerdict({
    toolName: 'subagent_fork', arguments: {}, parent: parent('p', 'pro'), catalog,
    parameters: { properties: { prompt: {} } }, sessionPolicy: [{ provider: 'p', model: 'flash' }],
  })
  assert.match(reason, /Session model allowlist \(layer 2\/2\)/)
  assert.match(reason, /The call subagent_fork would use p\/pro/, 'the inherited route is reported as the call route')
  assert.match(reason, /allows p\/flash, p\/pro, but this Session keeps the older list/)
  assert.match(reason, /no provider\/model selector/, 'a model-less tool keeps its own guidance')
})
