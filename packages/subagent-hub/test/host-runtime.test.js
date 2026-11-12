import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildCatalog } from '../lib/catalog.js'
import { deriveAgentPreset } from '../lib/presets.js'
import * as guards from '../lib/guard.js'
import * as official from '../lib/official-settings.js'

// Exercise Host wiring with only framework dependencies replaced, without an installed SDK.
const schema = new Proxy(function () {}, { get: () => schema, apply: () => schema })
class Service { static init = Symbol('init') }
const dispatchProjection = { key: 'hubDispatchHistory' }
const activityProjection = { key: 'hubActivity' }
const source = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace('export default class SubagentHub', 'class SubagentHub')
  .replace(/^export \{.*\}$/gm, '')
const sandbox = { Service, z: schema, buildCatalog, deriveAgentPreset, ...guards, ...official,
  dispatchProjection, activityProjection, setTimeout, clearTimeout }
vm.runInNewContext(source + '\nglobalThis.Host = SubagentHub', sandbox)
const nativeRuntime = { namesOf() {}, startActivation() {}, resolveMaxDepth() {} }
const route = { id: 'review', provider: 'p', model: 'm', reasoningEffort: 'high' }
const role = { id: 'reviewer', description: 'Review', instructions: 'Review only.', routes: ['review'] }
const properties = { name: {}, provider: {}, model: {}, reasoning_effort: {}, agent_preset: {} }
function host(runtime, parameters = { properties }) {
  const hub = Object.create(sandbox.Host.prototype)
  hub.config = { routes: [route], agents: [role], maxConcurrent: 0, delegationTools: ['subagent', 'subagent_fork'] }
  hub.cache = {}
  hub.registered = new Map()
  hub.ctx = { get: name => name === 'subagents' ? runtime : name === 'tools' ? { get: () => ({ parameters }) } : undefined }
  return hub
}

test('native named-tree capability requires public identity, activation and depth APIs', () => {
  assert.equal(host(nativeRuntime).nativeNamedDelegation(), true)
  for (const runtime of [undefined, {}, { startActivation() {}, resolveMaxDepth() {} }, { namesOf() {} }]) {
    assert.equal(host(runtime).nativeNamedDelegation(), false)
  }
})
test('Host registers native role compositions without changing inherited tool authority', async () => {
  for (const native of [false, true]) {
    const hub = host(native ? nativeRuntime : undefined)
    const base = [
      { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'Base' } },
      { id: 'delegate', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', maxDepth: 2, allowedAgentPresets: ['foreign'] } },
      { id: 'restrict', name: 'restrict-tools', config: { allow: ['read'] } },
    ]
    const snapshot = structuredClone(base)
    hub.rowsOf = async () => base
    let registered
    hub.ctx.agentPresets = { register: async preset => { registered = preset; return async () => {} } }
    const report = await hub.registerAgentPresets()
    assert.deepEqual(Array.from(report.registered), ['hub-agent-reviewer'])
    assert.equal(registered.plugins.some(row => row.id === 'delegate'), native)
    if (native) assert.deepEqual(registered.plugins[1].config, base[1].config)
    assert.deepEqual(base, snapshot)
    assert.deepEqual(registered.plugins.at(-1), base.at(-1))
  }
})
test('Host applies rc2 effort semantics while retaining rc1 same-route inheritance', async () => {
  const parent = { options: { ...route, reasoningEffort: 'high' } }
  const args = Object.freeze({ provider: 'p', model: 'm', agent_preset: 'hub-agent-reviewer' })
  let starts = 0
  const next = async () => { starts++; return { kind: 'allow' } }
  assert.equal((await host(undefined).preExecute({ name: 'subagent', arguments: args, agent: parent }, next)).kind, 'allow')
  const result = await host(nativeRuntime).preExecute({ name: 'subagent', arguments: args, agent: parent }, next)
  assert.equal(result.kind, 'deny')
  assert.match(result.reason, /adding only `reasoning_effort: "high"`/)
  assert.equal(starts, 1)
  assert.equal(args.reasoning_effort, undefined)
  const inherited = await host(nativeRuntime).preExecute({ name: 'subagent', arguments: {}, agent: { options: { ...route, reasoningEffort: 'low' } } }, next)
  assert.match(inherited.reason, /provider: "p".*model: "m".*reasoning_effort: "high"` together/)
})
test('Hub projection registration awaits readiness, retains handles and disposes them in reverse', async () => {
  const hub = host()
  const registered = []
  const disposed = []
  let release
  const pending = new Promise(resolve => { release = resolve })
  const registry = { async register(definition) {
    registered.push(definition.key)
    if (definition === dispatchProjection) await pending
    return { stateOf() {}, async dispose() { disposed.push(definition.key) } }
  } }
  const registration = hub.registerProjections(registry)
  assert.deepEqual(registered, [dispatchProjection.key])
  assert.equal(hub.projectionHandles, undefined, 'readers are not published before both registrations settle')
  release()
  const dispose = await registration
  assert.equal(hub.projectionHandles.size, 2)
  await dispose()
  assert.deepEqual(disposed, [activityProjection.key, dispatchProjection.key])
  assert.equal(hub.projectionHandles, undefined)
})
test('failed projection registration releases already acquired handles without claiming native policy keys', async () => {
  const hub = host()
  const keys = []
  let disposed = 0
  await assert.rejects(hub.registerProjections({ async register(definition) {
    keys.push(definition.key)
    if (definition === activityProjection) throw new Error('registration failed')
    return { async dispose() { disposed++ } }
  } }), /registration failed/)
  assert.deepEqual(keys, [dispatchProjection.key, activityProjection.key])
  assert.equal(disposed, 1)
  assert.equal(hub.projectionHandles, undefined)
})
test('managed allowlist read uses the imported model-settings transform', () => {
  const hub = host()
  hub.config.manageOfficialSettings = true
  assert.deepEqual(JSON.parse(JSON.stringify(hub.officialAllowlist())), { source: 'managed', models: [{ provider: 'p', model: 'm' }] })
})
test('rc2 Team service cannot activate the legacy Hub lifecycle wrapper', async () => {
  const source = readFileSync(new URL('../lib/team-routing.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '')
    .replace('export function installTeamRouting', 'function installTeamRouting')
  const sandbox = { sessionRecords: { appendPluginRecord() {} } }
  vm.runInNewContext(source + '\nglobalThis.install = installTeamRouting', sandbox)
  let writes = 0
  const ctx = {
    agentTeams: { isEnabled() {}, setEnabled() {}, createTask() {}, getTask() {}, listTasks() {} },
    tools: { resolve() {}, register() { writes++ } }, sessions: { flush() {} },
    subagents: { ...nativeRuntime, getProvider() {}, registerProvider() { writes++ } },
    sessionProjections: { register() { writes++ } },
  }
  await sandbox.install({ ctx: { inject: (_dependencies, callback) => callback(ctx) } })
  assert.equal(writes, 0, 'rc2 creates members only through native subagent tools')
})
