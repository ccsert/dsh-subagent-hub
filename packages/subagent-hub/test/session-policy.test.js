// The live configuration and a Session's captured allowlist are enforced at different times.
// These tests run the actual Host methods with only the framework imports stubbed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildCatalog } from '../lib/catalog.js'
import * as guards from '../lib/guard.js'
import * as policy from '../lib/policy.js'
import * as official from '../lib/official-settings.js'

const schema = new Proxy(function () {}, { get: () => schema, apply: () => schema })
class Service { static init = Symbol('init') }
const source = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace('export default class SubagentHub', 'class SubagentHub')
  .replace(/^export \{.*\}$/gm, '')
const sandbox = { Service, z: schema, buildCatalog, ...guards, ...policy, ...official, setTimeout, clearTimeout }
vm.runInNewContext(source + '\nglobalThis.Host = SubagentHub', sandbox)
const SubagentHub = sandbox.Host

const flash = { id: 'flash', provider: 'deepseek-official', model: 'deepseek-flash', tags: ['cheap'] }
const pro = { id: 'pro', provider: 'deepseek-official', model: 'deepseek-v4-pro', tags: ['reasoning'] }
const headers = { provider: 'deepseek-official', model: 'deepseek-flash' }
const toolset = {
  subagent: { parameters: { properties: { provider: {}, model: {}, agent_preset: {} } } },
  subagent_fork: { parameters: { properties: { prompt: {} } } },
  spawn_teammate: { parameters: { properties: { context: {} } } },
}
const parent = {
  id: 'parent',
  options: headers,
  session: { header: { id: 'parent' }, requestHeader: () => ({ config: headers }) },
}

/**
 * @param {object} options
 * @param {Array<{provider: string, model: string}>} [options.captured] what this Session recorded
 * @param {Array<object>} [options.routes]
 * @param {Array<object>} [options.agents]
 * @param {object} [options.official] the public model-selection setting value
 */
function service({ captured, routes = [flash, pro], agents = [], official, manageOfficialSettings = false } = {}) {
  const warnings = []
  const hub = Object.create(SubagentHub.prototype)
  const entries = official === undefined ? [] : [{ options: { id: 'subagent-model-selection-settings', config: official } }]
  Object.defineProperty(hub, 'ctx', {
    value: {
      get: (name) => {
        if (name === 'tools') return { get: tool => toolset[tool] }
        if (name === 'sessionProjections') {
          return { stateOf: (session, key) => key === 'subagentModelSelectionPolicy' && session?.header?.id === 'parent' ? captured : undefined }
        }
        if (name === 'configEditor') {
          return { entries: () => entries, configuration: () => entries.map(entry => ({ entry, inherited: {} })) }
        }
        return undefined
      },
      logger: { warn: message => warnings.push(message) },
    },
  })
  hub.config = { routes, agents, maxConcurrent: 4, delegationTools: ['subagent', 'subagent_fork'], manageOfficialSettings }
  hub.cache = {}
  hub.running = new Map()
  return { hub, warnings }
}

test('the Session allowlist is read from the native projection, not from the configuration', () => {
  const { hub } = service({ captured: [{ provider: 'q', model: 'only-here' }] })
  assert.deepEqual(hub.sessionPolicy(parent.session), [{ provider: 'q', model: 'only-here' }])
  assert.deepEqual(hub.sessionLayers(parent.session).notInSession.map(pair => `${pair.provider}/${pair.model}`),
    ['deepseek-official/deepseek-flash', 'deepseek-official/deepseek-v4-pro'])
  const { hub: unknown } = service({})
  assert.equal(unknown.sessionPolicy(parent.session), undefined, 'an unregistered projection is unknown, not empty')
  assert.equal(unknown.sessionPolicy(undefined), undefined)
})

test('a delegation the configuration allows is still refused when the Session snapshot lacks it', async () => {
  const { hub } = service({ captured: [{ provider: 'deepseek-official', model: 'deepseek-v4-pro' }] })
  let proceeded = false
  const result = await hub.preExecute({
    name: 'subagent', arguments: { provider: 'deepseek-official', model: 'deepseek-flash' }, agent: parent,
  }, async () => { proceeded = true; return { kind: 'allow' } })
  assert.equal(result.kind, 'deny')
  assert.equal(proceeded, false, 'the native layer would have refused this later, without listing routes')
  assert.match(result.reason, /layer 2\/2/)
  assert.match(result.reason, /deepseek-official\/deepseek-v4-pro/, 'the refusing layer lists its own routes')
  assert.match(result.reason, /new top-level Session/)
  assert.match(result.reason, /subagent-hub:/)
})

test('the runtime context only grows when the Session snapshot diverges', () => {
  const inSync = service({ captured: [...routesOf([flash, pro])] })
  assert.equal(inSync.hub.sessionContextText(parent), '')
  const diverged = service({ captured: routesOf([flash]) })
  const text = diverged.hub.sessionContextText(parent)
  assert.match(text, /captured its child model allowlist when it started: deepseek-official\/deepseek-flash/)
  assert.match(text, /only from a new top-level Session/)
  const unknown = service({})
  assert.equal(unknown.hub.sessionContextText(parent), '', 'no captured allowlist means nothing to warn about')
})

test('named agents outside the allowlist new Sessions capture are reported when presets load', () => {
  const agents = [{ id: 'reviewer', description: 'Reviews diffs', routes: ['pro'] }]
  const { hub, warnings } = service({ agents, official: { enabled: true, allowedModels: routesOf([flash]) } })
  const report = hub.validatePresetRoutes()
  assert.equal(report.problems.length, 1)
  assert.equal(hub.policyProblems.length, 1)
  assert.match(report.problems[0].text, /hub-agent-reviewer/)
  assert.match(report.problems[0].text, /deepseek-official\/deepseek-v4-pro/)
  assert.equal(warnings.length, 1, 'the problem is logged at load time, before any delegation')
  assert.match(warnings[0], /^dsh-subagent-hub: named agent "reviewer"/)
})

test('an allowlist that matches, is unknown, or is managed by the Hub reports nothing', () => {
  const agents = [{ id: 'reviewer', description: 'Reviews diffs', routes: ['pro'] }]
  const matching = service({ agents, official: { enabled: true, allowedModels: routesOf([flash, pro]) } })
  assert.equal(matching.hub.validatePresetRoutes().problems.length, 0)
  // Selection disabled: no Session captures an allowlist, so nothing can fall outside it.
  const disabled = service({ agents, official: { enabled: false, allowedModels: [] } })
  assert.equal(disabled.hub.validatePresetRoutes().problems.length, 0)
  const unreadable = service({ agents })
  assert.equal(unreadable.hub.validatePresetRoutes().allowlist, undefined)
  assert.equal(unreadable.hub.validatePresetRoutes().problems.length, 0)
  // Managed mode writes the live routes itself, so a declared route is always inside it.
  const managed = service({ agents, manageOfficialSettings: true, official: { enabled: true, allowedModels: [] } })
  assert.equal(managed.hub.validatePresetRoutes().problems.length, 0)
})

function routesOf(list) {
  return list.map(route => ({ provider: route.provider, model: route.model }))
}
