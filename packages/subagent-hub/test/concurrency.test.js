import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildCatalog } from '../lib/catalog.js'
import { promptSection } from '../lib/prompt.js'
import * as guards from '../lib/guard.js'
import * as policy from '../lib/policy.js'
import * as official from '../lib/official-settings.js'

// Exercise the actual Host guard, including the registry read at dispatch time.
const schema = new Proxy(function () {}, { get: () => schema, apply: () => schema })
class Service { static init = Symbol('init') }
const source = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace('export default class SubagentHub', 'class SubagentHub')
  .replace(/^export \{.*\}$/gm, '')
const sandbox = { Service, z: schema, buildCatalog, promptSection, ...guards, ...policy, ...official, setTimeout, clearTimeout }
vm.runInNewContext(source + '\nglobalThis.Host = SubagentHub', sandbox)

const parent = { id: 'parent', session: { header: { id: 'parent' } } }
const child = (id, status = 'running', owner = parent, parentId = parent.id) => ({
  id, status, owner, session: { header: { id, parentSession: parentId } },
})
function hubWith(children, { legacy = false } = {}) {
  const registry = { list: () => children }
  if (!legacy) registry.isOwnedBy = (id, owner) => children.some(agent => agent.id === id && agent.owner === owner)
  const hub = Object.create(sandbox.Host.prototype)
  Object.defineProperty(hub, 'ctx', { value: {
    get: name => name === 'agents' ? registry : name === 'tools' ? { get: () => ({ parameters: { properties: {} } }) } : undefined,
  } })
  hub.config = { maxConcurrent: 1, delegationTools: ['subagent'], routes: [], agents: [] }
  hub.cache = {}
  // Reproduce the previous residency ledger: this child's activation has no end yet.
  hub.running = new Map([[parent.id, new Set(children.map(agent => agent.id))]])
  return hub
}

test('an idle resident child releases the per-parent execution slot without an activation end', async () => {
  const resident = child('resident', 'idle')
  const hub = hubWith([resident])
  assert.equal(hub.runningChildren(parent), 0)
  let admitted = false
  await hub.preExecute({ name: 'subagent', arguments: {}, agent: parent }, () => { admitted = true })
  assert.equal(admitted, true)
  resident.status = 'running'
  const blocked = await hub.preExecute({ name: 'subagent', arguments: {}, agent: parent }, () => assert.fail('running child must occupy its slot'))
  assert.equal(blocked.kind, 'deny')
  resident.status = 'idle'
  assert.equal(hub.runningChildren(parent), 0)
})

test('running children discovered after plugin reload or cold resume count without a new lifecycle start', () => {
  const active = child('restored')
  const hub = hubWith([active])
  hub.running.clear()
  assert.equal(hub.runningChildren(parent), 1)
  active.status = 'idle'
  assert.equal(hub.runningChildren(parent), 0)
  active.status = 'running'
  assert.equal(hub.runningChildren(parent), 1)
})

test('runtime ownership excludes unrelated agents even if durable lineage names the caller', () => {
  const other = { id: 'other' }
  const hub = hubWith([child('ours'), child('foreign', 'running', other), child('idle', 'idle')])
  assert.equal(hub.runningChildren(parent), 1)
  assert.equal(hub.runningChildren(other), 1)
})

test('older agent registries use exact direct-child lineage when ownership queries are absent', () => {
  const hub = hubWith([child('ours'), child('nested', 'running', parent, 'different-parent')], { legacy: true })
  assert.equal(hub.runningChildren(parent), 1)
})
