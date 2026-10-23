import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDefinition } from '../lib/definitions.js'

test('normalize validates id, description, instructions and base preset', () => {
  assert.throws(() => normalizeDefinition({ id: 'Bad Id', description: 'x' }, 's'), /id must match/)
  assert.throws(() => normalizeDefinition({ id: 'ok' }, 's'), /needs a description/)
  assert.throws(() => normalizeDefinition({ id: 'ok', description: 'x', instructions: 1 }, 's'), /instructions must be a string/)
  assert.throws(() => normalizeDefinition({ id: 'ok', description: 'x', basePreset: '' }, 's'), /basePreset must be a preset id/)
  assert.throws(() => normalizeDefinition(null, 's'), /must be a mapping/)
})

test('normalize defaults, trims, and dedupes route and need lists', () => {
  assert.deepEqual(normalizeDefinition({ id: 'ok', description: ' d ' }, 's'), {
    id: 'ok', description: 'd', instructions: '', routes: undefined, needs: undefined, basePreset: 'standard', source: 's',
  })
  assert.deepEqual(normalizeDefinition({ id: 'ok', description: 'd', routes: ['a', 'a'], needs: ['fast', 'fast'] }, 's'), {
    id: 'ok', description: 'd', instructions: '', routes: ['a'], needs: ['fast'], basePreset: 'standard', source: 's',
  })
})

test('route and need lists reject non-string entries with the source in the message', () => {
  assert.throws(() => normalizeDefinition({ id: 'ok', description: 'd', routes: [1] }, 'agents[2]'), /agents\[2\].*routes must be a list/)
  assert.throws(() => normalizeDefinition({ id: 'ok', description: 'd', needs: 'fast' }, 'agents[0]'), /needs must be a list/)
})
