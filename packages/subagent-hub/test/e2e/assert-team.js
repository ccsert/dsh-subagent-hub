import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const results = []
const check = (name, fn) => {
  try { fn(); results.push(`ok   Team: ${name}`) }
  catch (error) { results.push(`FAIL Team: ${name}: ${error.message}`) }
}
check('no fatal error', () => assert.equal(report.fatal, undefined))
check('the real spawn_teammate schema exposes context without a model or preset selector', () => {
  assert.ok(report.teamSchema.includes('context'))
  for (const name of ['provider', 'model', 'agent_preset']) assert.ok(!report.teamSchema.includes(name))
})
check('fresh and fork both inherit the Lead model in actual native requests', () => {
  for (const result of Object.values(report.teamControl)) {
    assert.equal(result.isError, false)
    assert.equal(result.request, 'deepseek-official/deepseek-v4-pro')
    assert.equal(result.model?.model, 'deepseek-v4-pro')
  }
})
check('an updated child allowlist denies fresh and fork before teammate creation', () => {
  for (const context of ['fresh', 'fork']) {
    const result = report.teamBlocked[context]
    assert.equal(result.isError, true)
    assert.match(result.reason, /^subagent-hub:/)
    assert.match(result.reason, /deepseek-official\/deepseek-v4-pro/)
    assert.match(result.reason, /deepseek-official\/deepseek-flash/)
  }
  assert.equal(report.teamBlocked.memberCount, 0)
  assert.equal(report.teamBlocked.childrenCreated, 0)
})
check('Team-only or mixed new sessions receive accurate model-selection guidance', () => {
  assert.match(report.teamSection, /Both `context=fresh` and `context=fork` inherit/)
  assert.match(report.teamSection, /spawn_teammate.*no `provider`, `model`, or `agent_preset`/)
  assert.match(report.teamSection, /deepseek-official\/deepseek-flash/)
})
check('allowed fresh and fork children keep their native lifecycle and recorded model', () => {
  for (const result of Object.values(report.teamAllowed)) {
    assert.equal(result.isError, false)
    assert.equal(result.request, 'deepseek-official/deepseek-flash')
    assert.equal(result.model?.model, 'deepseek-flash')
    assert.ok(result.parentSession)
  }
})
check('model-selection alternatives match the tools actually exposed by the new session', () => {
  const selectors = report.independentSchemas.filter(tool => tool.parameters.includes('provider') && tool.parameters.includes('model'))
  if (selectors.length === 0) assert.match(report.teamSection, /No visible independent delegation tool exposes model selection/)
  else for (const tool of selectors) assert.ok(report.teamSection.includes(`\`${tool.name}\``))
})
check('model-less independent forks also stop before an out-of-list model request', () => {
  assert.equal(report.independentForkProbe?.isError, true)
  assert.match(report.independentForkProbe?.reason, /^subagent-hub:/)
  assert.match(report.independentForkProbe?.reason, /deepseek-official\/deepseek-v4-pro/)
})
console.log(results.join('\n'))
console.log('Native independent schemas: ' + JSON.stringify(report.independentSchemas))
console.log('Native independent fork probe: ' + JSON.stringify(report.independentForkProbe))
if (results.some(result => result.startsWith('FAIL'))) process.exitCode = 1
