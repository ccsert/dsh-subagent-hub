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
check('named agents registered as stable official presets', () => {
  assert.deepEqual(report.hub.registered, ['hub-agent-reviewer'])
  assert.ok(report.presets.includes('hub-agent-reviewer'))
  assert.equal(report.presetDescription, 'Reviews a diff and reports findings')
})
check('manageOfficialSettings writes the official allowlists', () => {
  assert.equal(report.official.enabled, true)
  assert.equal(report.official.modelSettings, 'written')
  assert.ok(report.official.presets.includes('preset-standard'), report.official.presets.join(','))
  assert.deepEqual(report.official.presetIds, ['hub-agent-reviewer'])
  assert.deepEqual(report.official.models, [
    { provider: 'deepseek-official', model: 'deepseek-flash' },
    { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  ])
})
check('route table mirrors the Host subagent-model-selection setting', () => {
  assert.deepEqual(report.modelSelection, {
    enabled: true,
    allowedModels: [
      { provider: 'deepseek-official', model: 'deepseek-flash' },
      { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    ],
  })
})
check('the official spawn row exposes the allowlist; the fork row is untouched', () => {
  const spawn = report.standardRows.find(row => row.provider === 'spawn')
  const fork = report.standardRows.find(row => row.provider === 'fork')
  assert.deepEqual(spawn.allow, ['hub-agent-reviewer'])
  assert.equal(spawn.models, true)
  assert.equal(fork.allow, undefined)
  assert.equal(fork.models, undefined)
})
check('the main agent sees provider/model/agent_preset on the official subagent tool', () => {
  for (const name of ['agent_preset', 'provider', 'model', 'reasoning_effort']) {
    assert.ok(report.subagentSchema.parameters.includes(name), `${name} missing from ${report.subagentSchema.parameters.join(',')}`)
  }
  assert.deepEqual(report.subagentSchema.presetEnum, ['hub-agent-reviewer'])
})
check('the prompt section lists named agents, capability tags, routes, and model tags', () => {
  const text = report.rootSection ?? ''
  for (const needle of [
    '## Choosing a subagent',
    '`hub-agent-reviewer`',
    'Reviews a diff and reports findings',
    'tags: fast',
    'routes: flash = deepseek-official/deepseek-flash',
    '`deepseek-official/deepseek-flash` — tags: fast, cheap',
    '`deepseek-official/deepseek-v4-pro` — tags: reasoning',
    'Pass `agent_preset` to choose a named agent',
    'must be one of that agent\'s routes',
  ]) assert.ok(text.includes(needle), `missing ${needle}`)
})
check('an out-of-route provider/model is rejected by the guard with a reason', () => {
  assert.equal(checks.outOfRoute.isError, true)
  assert.match(checks.outOfRoute.message, /^subagent-hub:/)
  assert.match(checks.outOfRoute.message, /named agent "reviewer" is limited to routes deepseek-official\/deepseek-flash/)
  assert.match(checks.outOfRoute.message, /requested deepseek-official\/deepseek-v4-pro is not allowed/)
  assert.match(checks.outOfRoute.message, /route ids: flash/)
})
check('a named agent selected through agent_preset runs its preset with the persona instructions', () => {
  assert.equal(checks.namedAllowed.isError, false)
  assert.equal(checks.namedAllowed.preset, 'hub-agent-reviewer')
  assert.ok(checks.namedAllowed.prompt.includes('HUB-REVIEWER-MARKER'), 'persona instructions missing')
  assert.equal(checks.namedAllowed.request, 'deepseek-official/deepseek-flash')
})
check('a named agent without provider/model inherits the allowed parent route', () => {
  assert.equal(checks.namedInherited.isError, false)
  assert.equal(checks.namedInherited.preset, 'hub-agent-reviewer')
  assert.equal(checks.namedInherited.request, `${report.parentModel.provider}/${report.parentModel.model}`)
})
check('a generic child is not route-confined by the named-agent guard', () => {
  assert.equal(checks.generic.isError, false)
  assert.equal(checks.generic.request, 'deepseek-official/deepseek-v4-pro')
})
check('the profile patch keeps the writes as ordinary profile overrides', () => {
  for (const needle of ['- id: preset-standard', 'allowedAgentPresets', 'subagent-model-selection-settings', 'hub-agent-reviewer']) {
    assert.ok(report.profilePatch.includes(needle), `profile patch missing ${needle}`)
  }
})

// ── Plugins-page configuration form and live editing ─────────────────────────────────────────
check('bundle: the client module is scanned and served from lib/client.js', () => {
  assert.equal(report.client.inGraph, true)
  assert.match(report.client.clientPath ?? '', /lib\/client\.js$/)
})
check('concurrency: a second delegation is refused while one child is still running', () => {
  const concurrency = report.checks.concurrency
  assert.ok(concurrency !== undefined, 'concurrency stage did not run')
  assert.equal(concurrency.held.isError, false, 'the held child should start')
  assert.equal(concurrency.blocked.isError, true)
  assert.match(concurrency.blocked.message, /^subagent-hub:/)
  assert.match(concurrency.blocked.message, /子 agent 正在运行（上限 1）/)
})

check('settings: saved official configuration can leave the syncing state', () => {
  assert.equal(report.syncObservation?.presetNamespace, 'unavailable')
  assert.equal(report.syncObservation?.modelNamespace, 'ready')
  assert.equal(report.syncObservation?.canFinish, true, JSON.stringify(report.syncObservation))
})
check('settings: live-save feedback completes through the public role roster', () => {
  assert.equal(report.checks.live?.sync?.canFinish, true, JSON.stringify(report.checks.live?.sync))
})
check('settings: the row exposes a writable form for routes, agents, and the official switch', () => {
  assert.ok(report.settings !== undefined, 'no subagent-hub settings descriptor')
  assert.equal(report.settings.writable, true)
  assert.equal(report.settings.routes, 2)
  assert.deepEqual(report.settings.agents, ['reviewer'])
  assert.equal(report.settings.manageOfficialSettings, true)
})
check('settings: a live edit re-registers presets and re-syncs the official allowlists', () => {
  const live = report.checks.live
  assert.ok(live !== undefined, 'live edit stage did not run')
  assert.deepEqual(live.presets.sort(), ['hub-agent-reviewer', 'hub-agent-scribe'])
  assert.deepEqual(live.allow, ['hub-agent-reviewer', 'hub-agent-scribe'])
  assert.equal(live.official.enabled, true)
  assert.ok(live.official.presets.includes('preset-standard'), live.official.presets.join(','))
  assert.deepEqual(live.schemaEnum, ['hub-agent-reviewer', 'hub-agent-scribe'])
  assert.equal(live.sectionHasScribe, true)
})
check('settings: an agent added live is usable through agent_preset with its instructions', () => {
  assert.equal(report.checks.live.scribe.isError, false)
  assert.equal(report.checks.live.scribe.preset, 'hub-agent-scribe')
  assert.ok(report.checks.live.scribe.prompt.includes('HUB-SCRIBE-MARKER'))
})

console.log(results.join('\n'))
if (results.some(line => line.startsWith('FAIL'))) process.exit(1)
