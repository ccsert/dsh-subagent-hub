import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
assert.equal(report.done, true, 'driver completed')
assert.equal(report.fatal, undefined, report.fatal)
const { phase, checks } = report.routedTeam ?? {}
assert.ok(checks && Object.keys(checks).length >= (phase === 'recovery' ? 7 : 20), 'full routing scenario ran')
assert.ok(checks['public-plugin-extension-ready']?.passed)
for (const [name, result] of Object.entries(checks)) {
  assert.equal(result.passed, true, `${name}: ${JSON.stringify(result.detail)}`)
  console.log(`ok   Hub Team ${phase}: ${name}`)
}
console.log(`Hub Team ${phase}: ${Object.keys(checks).length} runtime assertions passed; streams intercepted, no external model requests.`)
