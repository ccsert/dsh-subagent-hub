import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildCatalog } from '../lib/catalog.js'
import { promptSection } from '../lib/prompt.js'
import * as guards from '../lib/guard.js'
import * as policy from '../lib/policy.js'
import * as official from '../lib/official-settings.js'

// Run the actual Host methods while stubbing only the framework imports. This keeps
// the regression runnable in CI without an installed DSH; the runtime suite also
// exercises the native Team tools and model requests.
const schema = new Proxy(function () {}, { get: () => schema, apply: () => schema })
class Service { static init = Symbol('init') }
const source = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace('export default class SubagentHub', 'class SubagentHub')
  .replace(/^export \{.*\}$/gm, '')
const sandbox = { Service, z: schema, buildCatalog, promptSection, ...guards, ...policy, ...official, setTimeout, clearTimeout }
vm.runInNewContext(source + '\nglobalThis.Host = SubagentHub', sandbox)
const SubagentHub = sandbox.Host

const minimax = { id: 'minimax', provider: 'minimax', model: 'MiniMax-M3.1-Flash', tags: ['免费'] }
const parent = {
  id: 'parent',
  options: { provider: 'codex', model: 'gpt-6.1-sol' },
  session: {
    header: { id: 'parent' },
    requestHeader: () => ({ config: { provider: 'codex', model: 'gpt-6.1-sol' } }),
  },
}
const allowedParent = { id: 'allowed', options: { provider: minimax.provider, model: minimax.model } }
const args = { name: 'model-server', context: 'fork', description: 'Implement the model server', prompt: 'Use MiniMax' }

function service({ routes = [minimax], agents = [], tools = {
  spawn_teammate: { parameters: { properties: { context: {} } } },
  subagent: { parameters: { properties: { provider: {}, model: {}, agent_preset: {} } } },
  subagent_fork: { parameters: { properties: { prompt: {} } } },
}, failure = false } = {}) {
  const hub = Object.create(SubagentHub.prototype)
  Object.defineProperty(hub, 'ctx', { value: {
    get: name => {
      if (failure) throw new Error('unavailable tool service')
      return name === 'tools' && tools ? { get: tool => tools[tool] } : undefined
    },
    logger: { warn() {} },
  } })
  hub.config = { routes, agents, maxConcurrent: 4, delegationTools: ['subagent', 'subagent_fork'] }
  hub.cache = {}
  hub.running = new Map()
  return hub
}

async function execute(hub, { name = 'spawn_teammate', arguments: values = args, agent = parent } = {}) {
  let startedRoute
  let proceeded = false
  const result = await hub.preExecute({ name, arguments: values, agent }, async () => {
    proceeded = true
    startedRoute = guards.effectiveRoute({}, agent)
    return { kind: 'allow' }
  })
  return { result, startedRoute, proceeded }
}

test('spawn_teammate fork cannot inherit Codex when only the MiniMax child route is allowed', async () => {
  const { result, startedRoute, proceeded } = await execute(service())
  assert.equal(result.kind, 'deny', `spawn_teammate(fork) proceeded with ${startedRoute?.provider}/${startedRoute?.model} despite a MiniMax-only child allowlist`)
  assert.equal(proceeded, false, 'the tool must be stopped before any teammate starts')
  assert.match(result.reason, /codex\/gpt-6\.1-sol/)
  assert.match(result.reason, /minimax\/MiniMax-M3\.1-Flash/)
  assert.match(result.reason, /Both fresh and fork inherit/)
})

test('fresh and the default context cannot bypass the same inherited model check', async () => {
  for (const context of ['fresh', undefined]) {
    const { result, proceeded } = await execute(service(), { arguments: { ...args, context } })
    assert.equal(result.kind, 'deny')
    assert.equal(proceeded, false)
  }
})

test('both Team context modes allow an inherited MiniMax route already in the child allowlist', async () => {
  for (const context of ['fresh', 'fork']) {
    const { result, proceeded } = await execute(service(), { arguments: { ...args, context }, agent: allowedParent })
    assert.equal(result.kind, 'allow')
    assert.equal(proceeded, true)
  }
})

test('unsupported extra provider/model arguments cannot disguise a Codex inheritance', async () => {
  const { result, proceeded } = await execute(service(), { arguments: { ...args, provider: minimax.provider, model: minimax.model } })
  assert.equal(result.kind, 'deny')
  assert.equal(proceeded, false)
  assert.match(result.reason, /codex\/gpt-6\.1-sol/)
})

test('the current parent request takes precedence over allowed creation options', async () => {
  const { result } = await execute(service(), { agent: { ...parent, options: allowedParent.options } })
  assert.equal(result.kind, 'deny')
  assert.match(result.reason, /codex\/gpt-6\.1-sol/)
})

test('an unconfirmed inherited model and an invalid nonempty route list both stop Team creation', async () => {
  const unknown = await execute(service(), { agent: { id: 'unknown' } })
  assert.equal(unknown.result.kind, 'deny')
  assert.match(unknown.result.reason, /unconfirmed model/)
  const invalid = await execute(service({ routes: [{ id: 'broken', provider: '', model: '' }] }))
  assert.equal(invalid.result.kind, 'deny')
  assert.match(invalid.result.reason, /no valid routes/)
})

test('empty child routes retain ordinary Team inheritance', async () => {
  assert.equal((await execute(service({ routes: [] }))).result.kind, 'allow')
})

test('Team lookup failures do not turn a model guard error into permission to start a child', async () => {
  const { result, proceeded } = await execute(service({ failure: true }))
  assert.equal(result.kind, 'deny')
  assert.equal(proceeded, false)
  assert.match(result.reason, /could not verify/)
})

test('a genuinely model-capable Team schema checks the explicit route instead of ignoring it', async () => {
  const hub = service({ tools: { spawn_teammate: { parameters: { properties: { provider: {}, model: {} } } } } })
  const allowed = await execute(hub, { arguments: { ...args, provider: minimax.provider, model: minimax.model } })
  assert.equal(allowed.result.kind, 'allow')
  const denied = await execute(hub, { agent: allowedParent, arguments: { ...args, provider: 'codex', model: 'gpt-6.1-sol' } })
  assert.equal(denied.result.kind, 'deny')
})

test('independent creation tools cannot inherit an out-of-list model either', async () => {
  for (const name of ['subagent', 'subagent_fork']) {
    const { result, proceeded } = await execute(service(), { name, arguments: { description: 'Use MiniMax', prompt: 'Implement the server' } })
    assert.equal(result.kind, 'deny', `${name} bypassed the configured child routes by inheriting Codex`)
    assert.equal(proceeded, false)
  }
})

test('the Team policy leaves unrelated tools and explicit named subagent selection unchanged', async () => {
  const hub = service({ agents: [{ id: 'reviewer', description: 'Review', routes: ['minimax'] }] })
  assert.equal((await execute(hub, { name: 'read', arguments: { path: 'x' } })).result.kind, 'allow')
  assert.equal((await execute(hub, { name: 'subagent', arguments: { agent_preset: 'hub-agent-reviewer', provider: minimax.provider, model: minimax.model } })).result.kind, 'allow')
})

test('unsupported model fields do not bypass a named agent constraint on a legacy tool', async () => {
  const flash = { id: 'flash', provider: 'p', model: 'flash' }
  const hub = service({ routes: [minimax, flash], agents: [{ id: 'reviewer', description: 'Review', routes: ['minimax'] }],
    tools: { subagent: { parameters: { properties: { agent_preset: {} } } } } })
  const { result, proceeded } = await execute(hub, { name: 'subagent', agent: { options: flash },
    arguments: { agent_preset: 'hub-agent-reviewer', provider: minimax.provider, model: minimax.model } })
  assert.equal(result.kind, 'deny')
  assert.equal(proceeded, false)
  assert.match(result.reason, /no provider\/model selector/)
  assert.doesNotMatch(result.reason, /Pass `provider` and `model` together/)
})

test('half-specified supported model inputs retain the native pairing error path', () => {
  const catalog = buildCatalog({ routes: [minimax], agents: [] })
  for (const args of [{ provider: minimax.provider }, { model: minimax.model }]) {
    assert.equal(guards.creationRouteVerdict({ toolName: 'subagent', arguments: args, parent, catalog,
      parameters: { properties: { provider: {}, model: {} } } }), undefined)
  }
})

test('a Team-only session receives the catalog and its actual selection limitation', () => {
  const hub = service({ tools: { spawn_teammate: { parameters: { properties: { context: {} } } } } })
  const text = hub.sectionText(parent)
  assert.match(text, /Agent Teams without an independent subagent/)
  assert.match(text, /Both `context=fresh` and `context=fork` inherit/)
  assert.match(text, /No visible independent delegation tool exposes model selection/)
  assert.match(text, /minimax\/MiniMax-M3\.1-Flash/)
  assert.doesNotMatch(text, /set `manageOfficialSettings: true`/)
  assert.doesNotMatch(text, /At most 4|concurrency cap is 4/)
})

test('mixed sessions name only the independent tools that really expose model selection', () => {
  const hub = service({ tools: {
    spawn_teammate: { parameters: { properties: { context: {} } } },
    subagent: { parameters: { properties: { provider: {}, model: {}, agent_preset: {} } } },
    subagent_fork: { parameters: { properties: { prompt: {} } } },
  } })
  const text = hub.sectionText(parent)
  assert.match(text, /use `subagent` with the provider\/model inputs its schema exposes/)
  assert.doesNotMatch(text, /use `subagent_fork` with/)
})
