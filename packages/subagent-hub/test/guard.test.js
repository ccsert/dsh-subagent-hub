import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GUARD_PREFIX, effectiveRoute, guardVerdict } from '../lib/guard.js'
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

test('effective route prefers explicit arguments, then the parent request header, then creation options', () => {
  assert.deepEqual(effectiveRoute({ provider: 'q', model: 'm' }, parent('p', 'pro')), { provider: 'q', model: 'm', source: 'requested' })
  const headerParent = { options: { provider: 'created', model: 'created' }, session: { requestHeader: () => ({ config: { provider: 'p', model: 'pro' } }) } }
  assert.deepEqual(effectiveRoute({}, headerParent), { provider: 'p', model: 'pro', source: 'inherited parent' })
  assert.deepEqual(effectiveRoute({}, parent('p', 'pro')), { provider: 'p', model: 'pro', source: 'inherited parent' })
  assert.equal(effectiveRoute({ provider: 'p' }, parent('p', 'pro')), undefined)
  assert.equal(effectiveRoute({}, undefined), undefined)
})
