// Regression seam for the page's actual bounded sync observer and public API reader.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function client() {
  let entry
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: value => { entry = value } } },
  })
  return entry.factory(() => ({ createElement() {} }))
}
const values = { routes: [{ provider: 'p', model: 'm' }], agents: [{ id: 'reviewer' }] }
const ready = () => ({
  presets: { status: 'ready', value: { presets: [{ id: 'standard' }, { id: 'hub-agent-reviewer' }] } },
  models: { status: 'ready', value: { enabled: true, allowedModels: [{ provider: 'p', model: 'm' }] } },
})
const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve() }
function clock() {
  const jobs = new Map()
  let time = 0
  let sequence = 0
  return {
    setTimer(fn, ms) { const id = ++sequence; jobs.set(id, { fn, due: time + ms }); return id },
    clearTimer(id) { jobs.delete(id) },
    async advance(ms) {
      const until = time + ms
      await flush()
      for (;;) {
        const next = [...jobs].filter(([, job]) => job.due <= until).sort((a, b) => a[1].due - b[1].due)[0]
        if (!next) break
        time = next[1].due
        jobs.delete(next[0])
        next[1].fn()
        await flush()
      }
      time = until
      await flush()
    },
    count: () => jobs.size,
  }
}
const observe = (overrides = {}) => {
  const api = client()
  const timers = clock()
  const states = []
  const stop = api.observeOfficialSync({ values, readState: async () => ready(), onState: state => states.push(state),
    timeoutMs: 100, intervalMs: 10, ...timers, ...overrides })
  return { api, timers, states, stop }
}

test('public sync reader uses the served model namespace and actual role roster', async () => {
  const { readOfficialSyncState, officialSyncReady } = client()
  const reads = []
  const state = await readOfficialSyncState({
    configForms: { get(ns) {
      reads.push(ns)
      assert.equal(ns, 'subagent-model-selection-settings', 'preset-standard is not a settings namespace')
      return { getSnapshot: () => ready().models }
    } },
    remote: { agentPresets: { list: async () => ({ ok: true, value: ready().presets.value }) } },
  })
  assert.equal(officialSyncReady(values, state.presets, state.models), true)
  assert.deepEqual(reads, ['subagent-model-selection-settings'])
})

test('ready public state ends checking immediately and clears every timer', async () => {
  const run = observe()
  await flush()
  assert.deepEqual(run.states, ['checking', 'complete'])
  assert.equal(run.timers.count(), 0)
  await run.timers.advance(1000)
  assert.deepEqual(run.states, ['checking', 'complete'])
})

test('waits for both the new roster and model allowlist, then finishes', async () => {
  let reads = 0
  const run = observe({ readState: async () => {
    const state = ready()
    if (++reads === 1) state.presets.value.presets = [{ id: 'standard' }]
    else if (reads === 2) state.models.value.allowedModels = []
    return state
  } })
  await flush()
  assert.deepEqual(run.states, ['checking'])
  await run.timers.advance(10)
  assert.deepEqual(run.states, ['checking'])
  await run.timers.advance(10)
  assert.deepEqual(run.states, ['checking', 'complete'])
})

test('rejected reads stop showing busy at the independent deadline', async () => {
  let reads = 0
  const run = observe({ readState: async () => { reads++; throw new Error('temporarily unavailable') } })
  await run.timers.advance(100)
  assert.deepEqual(run.states, ['checking', 'pending'])
  assert.ok(reads > 1, 'transient errors are retried')
  assert.equal(run.timers.count(), 0)
})

test('a request that never settles still reaches the deadline', async () => {
  const run = observe({ readState: () => new Promise(() => {}) })
  await run.timers.advance(100)
  assert.deepEqual(run.states, ['checking', 'pending'])
  assert.equal(run.timers.count(), 0)
})

test('disposing an old save ignores its late result and clears its deadline', async () => {
  let resolve
  const run = observe({ readState: () => new Promise(done => { resolve = done }) })
  await flush()
  run.stop()
  resolve(ready())
  await run.timers.advance(1000)
  assert.deepEqual(run.states, ['checking'])
  assert.equal(run.timers.count(), 0)
})

test('a late successful read cannot overwrite a timeout, and a new check can succeed', async () => {
  let resolve
  const run = observe({ readState: () => new Promise(done => { resolve = done }) })
  await run.timers.advance(100)
  resolve(ready())
  await flush()
  assert.deepEqual(run.states, ['checking', 'pending'])
  const retry = observe()
  await flush()
  assert.deepEqual(retry.states, ['checking', 'complete'])
})
