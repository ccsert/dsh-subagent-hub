import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
assert.equal(report.done, true, 'driver completed')
assert.equal(report.fatal, undefined, report.fatal)
const { phase, checks } = report.nativeRc2 ?? {}
const required = phase === 'recovery'
  ? ['recovery-nested-owner-board', 'recovery-message-fresh', 'recovery-identity-fresh', 'recovery-route-fresh', 'recovery-message-fork', 'recovery-identity-fork', 'recovery-route-fork']
  : ['create-fresh', 'route-fresh', 'role-instructions', 'wake-route-fresh', 'create-fork', 'route-fork', 'wake-route-fork', 'role-route-denied', 'explicit-route-effort-required', 'explicit-same-route-requires-effort', 'inherited-effort-recorded', 'cancel-child-settled', 'captured-session-layer-denied', 'fork-inherited-route-denied', 'default-depth-is-one', 'default-depth-rejected', 'configured-depth-three', 'default-base-does-not-grant-role-selection', 'fixture-base-authorizes-one-role', 'nested-builder-created', 'role-preset-preserves-delegation', 'nested-role-route-denied', 'nested-explicit-effort-required', 'nested-checker-created', 'nested-tree-identity', 'nested-route-and-effort-recorded', 'nested-role-applied', 'nested-parent-session', 'nested-direct-catalogs', 'nested-owner-on-root-board']
assert.ok(checks, 'native rc2 scenario ran')
for (const name of required) assert.ok(checks[name], `missing native rc2 check: ${name}`)
for (const [name, result] of Object.entries(checks)) {
  assert.equal(result.passed, true, `${name}: ${JSON.stringify(result.detail)}`)
  console.log(`ok   native rc2 ${phase}: ${name}`)
}
console.log(`native rc2 ${phase}: ${Object.keys(checks).length} checks passed; streams intercepted.`)
