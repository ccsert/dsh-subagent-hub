import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allowedModels, indexRoutes, knownTags, routeLabel, routeSummary } from '../lib/router.js'

test('indexing normalizes tags and preserves preference order', () => {
  const { routes, problems } = indexRoutes([
    { id: 'flash', provider: 'p', model: 'flash', tags: ['fast', 'fast', 'cheap'] },
    { id: 'pro', provider: 'p', model: 'pro', reasoningEffort: 'high', tags: ['reasoning'], note: 'Pro' },
  ])
  assert.deepEqual(problems, [])
  assert.deepEqual([...routes.keys()], ['flash', 'pro'])
  assert.deepEqual(routes.get('flash').tags, ['fast', 'cheap'])
  assert.equal(routes.get('pro').reasoningEffort, 'high')
  assert.equal(routes.get('pro').note, 'Pro')
})

test('unusable rows are reported without dropping the rest', () => {
  const { routes, problems } = indexRoutes([
    null,
    { provider: 'p', model: 'm' },
    { id: 'good', provider: 'p', model: 'good' },
    { id: 'good', provider: 'q', model: 'other' },
    { id: 'twin', provider: 'p', model: 'good' },
    { id: 'blank', provider: '', model: 'm' },
  ])
  assert.deepEqual([...routes.keys()], ['good'])
  assert.equal(problems.length, 5)
  assert.match(problems.join('\n'), /route needs an id/)
  assert.match(problems.join('\n'), /duplicate route id "good"/)
  assert.match(problems.join('\n'), /repeats p\/good/)
  assert.match(problems.join('\n'), /provider and model must be non-empty/)
})

test('known tags are deduplicated and sorted', () => {
  const { routes } = indexRoutes([
    { id: 'a', provider: 'p', model: 'a', tags: ['vision', 'fast'] },
    { id: 'b', provider: 'p', model: 'b', tags: ['fast', 'reasoning'] },
  ])
  assert.deepEqual(knownTags(routes), ['fast', 'reasoning', 'vision'])
})

test('allowedModels is exactly the official exact-route allowlist in table order', () => {
  const { routes } = indexRoutes([
    { id: 'flash', provider: 'deepseek-official', model: 'deepseek-flash' },
    { id: 'mini', provider: 'magpie', model: 'minimax-cn/MiniMax-M3.1-Flash' },
  ])
  assert.deepEqual(allowedModels(routes), [
    { provider: 'deepseek-official', model: 'deepseek-flash' },
    { provider: 'magpie', model: 'minimax-cn/MiniMax-M3.1-Flash' },
  ])
})

test('route labels and summaries carry provider/model, tags and note', () => {
  const { routes } = indexRoutes([{ id: 'pro', provider: 'p', model: 'pro', tags: ['reasoning'], note: 'Pro' }])
  const route = routes.get('pro')
  assert.equal(routeLabel(route), 'p/pro')
  assert.equal(routeSummary(route), 'p/pro [reasoning] (Pro)')
})
