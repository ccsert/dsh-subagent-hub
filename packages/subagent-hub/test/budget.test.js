import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertBudget, budgetVerdict, sumUsage } from '../lib/budget.js'
import { RoutingError } from '../lib/router.js'

test('no limits allow everything', () => {
  assert.equal(budgetVerdict({}, { running: 99, tokens: 1e9 }), undefined)
})

test('concurrency rejects at the limit and allows below it', () => {
  assert.equal(budgetVerdict({ maxConcurrent: 2 }, { running: 1 }), undefined)
  assert.match(budgetVerdict({ maxConcurrent: 2 }, { running: 2 }), /2 of 2 concurrent subagents/)
  assert.match(budgetVerdict({ maxConcurrent: 0 }, { running: 0 }), /0 of 0 concurrent/)
})

test('token cap rejects at and above the cap', () => {
  assert.equal(budgetVerdict({ maxTokensPerSession: 100 }, { tokens: 99 }), undefined)
  assert.match(budgetVerdict({ maxTokensPerSession: 100 }, { tokens: 100 }), /100 of 100 tokens/)
})

test('unknown usage never blocks', () => {
  assert.equal(budgetVerdict({ maxConcurrent: 1, maxTokensPerSession: 1 }, {}), undefined)
  assert.equal(budgetVerdict({ maxConcurrent: 1 }, { tokens: 5 }), undefined)
  assert.equal(budgetVerdict({ maxTokensPerSession: 1 }, { running: 5 }), undefined)
})

test('assertBudget throws the routing error with the reason', () => {
  assert.throws(() => assertBudget({ maxConcurrent: 1 }, { running: 1 }), error => error instanceof RoutingError && /budget/.test(error.message))
  assert.doesNotThrow(() => assertBudget({ maxConcurrent: 2 }, { running: 1 }))
})

test('sumUsage adds every token class in either published shape', () => {
  assert.equal(sumUsage({ uncachedInputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 3 }), 20)
  assert.equal(sumUsage({ totals: { uncachedInputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 3 }, last: null }), 20)
  assert.equal(sumUsage(undefined), undefined)
  assert.equal(sumUsage({ uncachedInputTokens: 10 }), undefined)
})
