import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareLayers, describePairs, includesPair, presetRouteProblems, routePairs, samePairs, sessionPolicyNotice } from '../lib/policy.js'
import { buildCatalog } from '../lib/catalog.js'

const pair = (provider, model) => ({ provider, model })

test('loose route lists normalize to exact unique pairs and drop unusable rows', () => {
  const pairs = routePairs([
    pair('p', 'flash'),
    pair('p', 'flash'),
    { provider: 'p' },
    { model: 'pro' },
    { provider: '', model: 'pro' },
    null,
    { provider: 'q', model: 'pro' },
  ])
  assert.deepEqual(pairs, [pair('p', 'flash'), pair('q', 'pro')])
  assert.equal(includesPair(pairs, 'q', 'pro'), true)
  assert.equal(includesPair(pairs, 'p', 'pro'), false, 'a provider without a model is not a wildcard')
  assert.equal(describePairs(pairs), 'p/flash, q/pro')
  assert.equal(describePairs([]), 'none')
  assert.equal(samePairs(pairs, [pair('q', 'pro'), pair('p', 'flash')]), true, 'order does not matter')
  assert.equal(samePairs(pairs, [pair('p', 'flash')]), false)
})

test('the two layers are compared in both directions', () => {
  const inSync = compareLayers([pair('p', 'flash')], [pair('p', 'flash')])
  assert.equal(inSync.inSync, true)
  assert.deepEqual(inSync.notInSession, [])
  const diverged = compareLayers([pair('p', 'flash'), pair('q', 'pro')], [pair('p', 'flash'), pair('r', 'old')])
  assert.equal(diverged.inSync, false)
  assert.deepEqual(diverged.notInSession, [pair('q', 'pro')], 'configured but not captured: a new Session is required')
  assert.deepEqual(diverged.notInConfig, [pair('r', 'old')], 'captured but no longer configured: still enforced here')
})

test('a Session without a captured allowlist has nothing to compare', () => {
  const layers = compareLayers([pair('p', 'flash')], undefined)
  assert.deepEqual(layers.session, [])
  assert.equal(sessionPolicyNotice(layers), '', 'no snapshot means no warning, not a false mismatch')
})

test('the notice names both layers, lists their routes, and asks for a new Session', () => {
  const notice = sessionPolicyNotice(compareLayers(
    [pair('p', 'flash'), pair('q', 'pro')],
    [pair('p', 'flash'), pair('r', 'old')],
  ))
  assert.match(notice, /Session model allowlist \(layer 2\/2\)/)
  assert.match(notice, /captured its child model allowlist when it started: p\/flash, r\/old/)
  assert.match(notice, /also allows q\/pro/)
  assert.match(notice, /only from a new top-level Session/)
  assert.match(notice, /still allows r\/old/)
  assert.match(notice, /only a new top-level Session captures the current list/)
})

test('an agreeing Session adds no prompt text', () => {
  assert.equal(sessionPolicyNotice(compareLayers([pair('p', 'flash')], [pair('p', 'flash')])), '')
})

test('named agents whose declared routes cannot be captured are reported with both lists', () => {
  const catalog = buildCatalog({
    routes: [
      { id: 'flash', provider: 'p', model: 'flash' },
      { id: 'pro', provider: 'q', model: 'pro' },
    ],
    agents: [
      { id: 'reviewer', description: 'Reviews diffs', routes: ['pro'] },
      { id: 'generalist', description: 'Any configured model' },
    ],
  })
  const problems = presetRouteProblems(catalog, [pair('p', 'flash')])
  assert.equal(problems.length, 1, 'an agent without declared routes can still use any captured route')
  assert.equal(problems[0].presetId, 'hub-agent-reviewer')
  assert.deepEqual(problems[0].missing, ['pro'])
  assert.deepEqual(problems[0].outside, ['q/pro'])
  assert.match(problems[0].text, /named agent "reviewer" \(hub-agent-reviewer\) declares route q\/pro/)
  assert.match(problems[0].text, /capture \(p\/flash\)/)
  assert.match(problems[0].text, /start a new Session/)
  assert.deepEqual(presetRouteProblems(catalog, []), [], 'an unknown allowlist is not an empty one')
  assert.deepEqual(presetRouteProblems(catalog, [pair('p', 'flash'), pair('q', 'pro')]), [])
})
