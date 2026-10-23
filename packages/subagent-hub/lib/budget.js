// Delegation budgets: pure verdicts over observed usage, so every rule is unit-testable and the
// service only supplies the numbers.
import { RoutingError } from './router.js'

/** @typedef {{ maxConcurrent?: number, maxTokensPerSession?: number }} BudgetLimits */
/** @typedef {{ running?: number, tokens?: number }} BudgetUsage */

/**
 * Decide whether one more delegation fits.
 * Unknown usage (`undefined`) never blocks: a missing projection must not wedge delegation.
 * @param {BudgetLimits} limits
 * @param {BudgetUsage} usage
 * @returns {string | undefined} the rejection reason, or undefined when allowed.
 */
export function budgetVerdict(limits, usage) {
  const { maxConcurrent, maxTokensPerSession } = limits
  if (maxConcurrent !== undefined && usage.running !== undefined && usage.running >= maxConcurrent) {
    return `delegation budget: ${usage.running} of ${maxConcurrent} concurrent subagents are still running in this Session. Wait for one to finish, or continue the work yourself.`
  }
  if (maxTokensPerSession !== undefined && usage.tokens !== undefined && usage.tokens >= maxTokensPerSession) {
    return `delegation budget: this Session's subagents have used ${usage.tokens} of ${maxTokensPerSession} tokens. Do the remaining work yourself rather than delegating.`
  }
  return undefined
}

/**
 * Throw the model-readable rejection instead of returning it.
 * @param {BudgetLimits} limits
 * @param {BudgetUsage} usage
 */
export function assertBudget(limits, usage) {
  const reason = budgetVerdict(limits, usage)
  if (reason !== undefined) throw new RoutingError(reason)
}

/**
 * Sum every token class. Accepts both shapes this runtime publishes: the projection's host state
 * (`{ totals, last }`) and its client view (the flat bucket object).
 */
export function sumUsage(usage) {
  if (usage === undefined || usage === null) return undefined
  const buckets = usage.totals !== undefined && usage.totals !== null ? usage.totals : usage
  const parts = [buckets.uncachedInputTokens, buckets.outputTokens, buckets.cacheReadTokens, buckets.cacheWriteTokens]
  if (!parts.every(part => typeof part === 'number')) return undefined
  return parts.reduce((sum, part) => sum + part, 0)
}
