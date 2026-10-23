// Assertions over the e2e driver report; exits non-zero on the first failure.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const results = []
const check = (name, fn) => {
  try {
    fn()
    results.push(`ok   ${name}`)
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`)
  }
}
const { checks } = report

check('no fatal error', () => assert.equal(report.fatal, undefined))
check('derives <base>+hub for every shipped base', () => assert.deepEqual(report.hub.registered, ['standard+hub', 'ptc+hub', 'cordis+hub']))
check('profile agent preset registered eagerly', () => assert.ok(report.presets.some(id => id.startsWith('hub-agent-reviewer-'))))
check('+hub root sees delegate and no official delegation tools', () => assert.deepEqual(report.rootTools, { delegate: true, subagent: false, subagent_fork: false, send_message: true }))
check('prompt section lists profile and workspace agents and tags', () => {
  for (const needle of ['`reviewer`', '`scout`', '`reasoning`', '`fast`']) assert.ok(report.rootSection.includes(needle), needle)
})
check('needs=reasoning falls back past the offline route to a different model than the parent', () => {
  assert.equal(checks.byTag.request, 'deepseek-official/deepseek-v4-pro')
  assert.notEqual(checks.byTag.value.model, report.parentModel.model)
  assert.equal(checks.byTag.value.fallbacks.length, 1)
  assert.match(checks.byTag.value.fallbacks[0], /^offline:/)
})
check('no constraint inherits the parent route', () => {
  assert.equal(checks.inherit.value.mode, 'inherit')
  assert.equal(checks.inherit.request, `${report.parentModel.provider}/${report.parentModel.model}`)
})
check('profile agent: own preset, instructions in prompt, confined route, cannot delegate', () => {
  assert.match(checks.profileAgent.preset, /^hub-agent-reviewer-/)
  assert.ok(checks.profileAgent.prompt.includes('HUB-REVIEWER-MARKER'))
  assert.equal(checks.profileAgent.request, 'deepseek-official/deepseek-flash')
  assert.equal(checks.profileAgent.hasDelegate, false)
  assert.equal(checks.profileAgent.hasSubagent, false)
})
check('workspace agent: loaded from .dsh/subagents with its own needs', () => {
  assert.match(checks.workspaceAgent.preset, /^hub-agent-scout-/)
  assert.ok(checks.workspaceAgent.prompt.includes('HUB-SCOUT-MARKER'))
  assert.equal(checks.workspaceAgent.request, 'deepseek-official/deepseek-flash')
})
check('unknown agent is rejected with the available list', () => assert.match(checks.unknownAgent.error, /available: reviewer, scout/))
check('a named agent cannot be routed outside its routes (D2)', () => assert.match(checks.confined.error, /agent "reviewer" routes has all of: vision/))

check('full turn: delegate result persists the routing record in tool/result.meta', () => {
  assert.equal(checks.turn.resultError, undefined)
  assert.equal(checks.turn.resultMeta.subagentHub.model, 'deepseek-v4-pro')
  assert.equal(checks.turn.resultMeta.subagentHub.label, 'turn check')
  assert.equal(checks.turn.lastText, 'parent done')
})
check('full turn: subagentHub projection folds the run from the log', () => {
  assert.equal(checks.turn.runs.length, 1)
  assert.equal(checks.turn.runs[0].callId, 'call-hub-e2e')
  assert.equal(checks.turn.runs[0].subagentId, checks.turn.resultMeta.subagentHub.subagentId)
})
check('full turn: child projections the panel reads agree with the routing record', () => {
  assert.equal(checks.turn.childFound, true)
  assert.equal(checks.turn.childLastUsed.model, 'deepseek-v4-pro')
  assert.equal(checks.turn.childTokenUsage.outputTokens, 10)
})

check('bundle: client module is scanned and served from lib/client.js', () => {
  assert.equal(report.client.inGraph, true)
  assert.match(report.client.clientPath ?? '', /lib\/client\.js$/)
})

const define = checks.define
check('define: approved workspace definition lands as a YAML file and in the log', () => {
  assert.match(define.scribe.text, /defined subagent "scribe" \(workspace:/)
  assert.match(define.workspaceFile, /id: scribe/)
  assert.match(define.workspaceFile, /HUB-SCRIBE-MARKER/)
})
check('define: a rejected promotion stays session-only', () => {
  assert.match(define.ghost.text, /this session only; saving to profile was not approved \(rejected\)/)
  assert.equal(define.ghost.meta.subagentHubDefine.persisted, 'session')
  assert.ok(!define.profileAgentsNow.includes('ghostwriter'))
})
check('define: an approved profile promotion writes the profile patch and reloads live', () => {
  assert.match(define.archivist.text, /defined subagent "archivist" \(profile:/)
  assert.equal(define.profilePatchHasArchivist, true)
  assert.ok(define.profileAgentsNow.includes('archivist'))
})
check('define: an invalid definition is rejected with the offending route', () => assert.match(define.bad.text, /unknown route "nope"/))
check('define: exactly three approval asks for three promotions', () => assert.equal(define.approvals.length, 3))
check('define: the session layer exposes all three agents, and one is delegated with its own preset', () => {
  assert.deepEqual(define.sessionDefinitions, ['archivist', 'ghostwriter', 'scribe'])
  assert.match(define.scribeRun.reason, /tagged fast/)
  assert.match(define.scribeChild.preset, /^hub-agent-scribe-/)
  assert.equal(define.scribeChild.marker, true)
  assert.equal(define.scribeChild.request, 'deepseek-official/deepseek-flash')
  assert.equal(define.lastText, 'HUB-E2E-DEFINE done')
})

console.log(results.join('\n'))
if (results.some(line => line.startsWith('FAIL'))) process.exit(1)
