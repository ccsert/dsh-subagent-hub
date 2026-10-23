import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agentOptionsFor, decide, indexRoutes, knownTags, RoutingError } from '../lib/router.js'

const routes = indexRoutes([
  { id: 'flash', provider: 'p', model: 'flash', tags: ['fast', 'cheap'] },
  { id: 'pro', provider: 'p', model: 'pro', reasoningEffort: 'high', tags: ['reasoning'] },
  { id: 'pro-backup', provider: 'q', model: 'pro', tags: ['reasoning', 'vision'] },
])
const ok = async () => {}

test('index rejects duplicate ids and provider/model pairs', () => {
  assert.throws(() => indexRoutes([{ id: 'a', provider: 'p', model: 'm', tags: [] }, { id: 'a', provider: 'p', model: 'n', tags: [] }]), /duplicate route id/)
  assert.throws(() => indexRoutes([{ id: 'a', provider: 'p', model: 'm', tags: [] }, { id: 'b', provider: 'p', model: 'm', tags: [] }]), /repeats/)
})

test('known tags are deduplicated and sorted', () => {
  assert.deepEqual(knownTags(routes), ['cheap', 'fast', 'reasoning', 'vision'])
})

test('no agent and no needs inherits the parent route', async () => {
  const decision = await decide(routes, undefined, [], ok)
  assert.equal(decision.mode, 'inherit')
  assert.equal(agentOptionsFor(decision), undefined)
})

test('needs pick the first route carrying every tag', async () => {
  const decision = await decide(routes, undefined, ['reasoning'], ok)
  assert.equal(decision.route.id, 'pro')
  assert.deepEqual(agentOptionsFor(decision), { provider: 'p', model: 'pro', reasoningEffort: 'high' })
  assert.equal((await decide(routes, undefined, ['reasoning', 'vision'], ok)).route.id, 'pro-backup')
})

test('unavailable routes fall back and are recorded', async () => {
  const decision = await decide(routes, undefined, ['reasoning'], async (route) => {
    if (route.id === 'pro') throw new Error('no credential')
  })
  assert.equal(decision.route.id, 'pro-backup')
  assert.deepEqual(decision.rejected, [{ route: 'pro', reason: 'no credential' }])
  assert.match(decision.reason, /after 1 fallback/)
})

test('a named agent is confined to its own routes (D2)', async () => {
  const agent = { id: 'reviewer', routes: ['flash'] }
  assert.equal((await decide(routes, agent, [], ok)).route.id, 'flash')
  await assert.rejects(decide(routes, agent, ['reasoning'], ok), RoutingError)
})

test('agent needs combine with call needs', async () => {
  const agent = { id: 'seer', needs: ['vision'] }
  assert.equal((await decide(routes, agent, ['reasoning'], ok)).route.id, 'pro-backup')
})

test('unknown tags, unknown route refs, and exhausted pools are routing errors', async () => {
  await assert.rejects(decide(routes, undefined, ['telepathy'], ok), /unknown capability tag/)
  await assert.rejects(decide(routes, { id: 'x', routes: ['nope'] }, [], ok), /unknown route "nope"/)
  const error = await decide(routes, undefined, ['fast'], async () => { throw new Error('down') }).catch(caught => caught)
  assert.ok(error instanceof RoutingError)
  assert.deepEqual(error.rejected, [{ route: 'flash', reason: 'down' }])
})
