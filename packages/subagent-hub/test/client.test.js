// Loads the hand-written browser module the way the shell does, then exercises it with real React.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const requireFromRepo = createRequire(new URL('../../../package.json', import.meta.url))
const React = requireFromRepo('react')
const { renderToStaticMarkup } = requireFromRepo('react-dom/server')

function loadClient() {
  let registered
  const window = { __ModuleLoader__: { load: entry => { registered = entry } } }
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), { window, URLSearchParams })
  assert.equal(registered.id, 'dsh-subagent-hub', 'factory id equals the package name')
  return registered.factory(id => {
    if (id === 'react') return React
    throw new Error(`unexpected require ${id}`)
  })
}

// Values built inside the vm context carry its own prototypes; compare as plain JSON.
const plain = value => JSON.parse(JSON.stringify(value))
const t = (key, params) => params === undefined ? key : `${key}${JSON.stringify(params)}`
const run = (over = {}) => ({ callId: 'c', seq: 1, time: 1, subagentId: 'child-1', label: 'review diff', agent: 'reviewer', provider: 'p', model: 'pro', mode: 'route', reason: 'tagged reasoning', fallbacks: [], ...over })
const usage = (output) => ({ uncachedInputTokens: 1000, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0 })

test('summarize joins runs with child truth and flags a diverged model', () => {
  const { summarize } = loadClient()
  const view = summarize(
    [run(), run({ callId: 'd', subagentId: 'child-2', model: 'flash', agent: undefined }), run({ callId: 'e', subagentId: 'child-3' })],
    {
      'child-1': { modelSelection: { lastUsed: { provider: 'p', model: 'pro' } }, tokenUsage: usage(500) },
      'child-2': { modelSelection: { lastUsed: { provider: 'q', model: 'backup' } }, tokenUsage: usage(0) },
    },
  )
  assert.deepEqual(plain(view.rows.map(row => [row.subagentId, row.diverged, row.tokens])), [['child-3', false, null], ['child-2', true, 1000], ['child-1', false, 1500]])
  assert.equal(view.tokens, 2500)
  assert.deepEqual(plain(view.byModel.map(entry => [entry.model, entry.runs, entry.tokens])), [['p/pro', 2, 1500], ['q/backup', 1, 1000]])
})

test('tab renders the empty state without runs', () => {
  const { RoutingTab } = loadClient()
  const html = renderToStaticMarkup(React.createElement(RoutingTab, {
    sessionId: 's', t, useProjection: () => undefined, useSessions: () => ({}), open() {}, refresh() {},
  }))
  assert.match(html, /class="sah-empty">empty</)
})

test('tab renders rows, the divergence warning, and the summary', () => {
  const { RoutingTab } = loadClient()
  const projections = { 'child-1': { values: { modelSelection: { lastUsed: { provider: 'q', model: 'backup' } }, tokenUsage: usage(234) } } }
  const html = renderToStaticMarkup(React.createElement(RoutingTab, {
    sessionId: 's', t,
    useProjection: key => key === 'subagentHub' ? { runs: [run({ fallbacks: ['offline: down'] })] } : undefined,
    useSessions: select => select({ projectionsBySession: projections }),
    open() {}, refresh() {},
  }))
  for (const needle of ['review diff', 'reviewer', 'p/pro', 'row.actual{&quot;model&quot;:&quot;q/backup&quot;}', 'row.fallbacks{&quot;count&quot;:1}', 'summary.runs{&quot;count&quot;:1}', '1.2K']) {
    assert.ok(html.includes(needle), `missing ${needle}`)
  }
})

test('apply registers the localized tab type, its body, and opens the official child chat', () => {
  const { apply, inject } = loadClient()
  assert.deepEqual(plain(inject), ['slots', 'locale', 'sessions', 'sidebarRight', 'sidebarRightTabs'])
  const calls = { effects: 0 }
  const ctx = {
    effect(fn) { calls.effects++; return fn() },
    locale: { register: (ns, dicts) => { calls.locale = [ns, Object.keys(dicts)] }, bind: () => t },
    sidebarRightTabs: { register: def => { calls.tab = def; return () => {} } },
    sidebarRight: { openResource: (address, options) => { calls.opened = [address, options] } },
    sessions: { refreshProjections: id => { calls.refreshed = id } },
    slots: { inject: (_owner, fn) => fn(), register: (options, body) => { calls.slot = options; calls.body = body } },
  }
  apply(ctx)
  assert.deepEqual(plain(calls.locale), ['subagentHub', ['en', 'zh']])
  assert.equal(calls.tab.id, 'dsh-subagent-hub/routing')
  assert.equal(calls.tab.guide[0].title(), 'tab.title')
  assert.deepEqual(plain(calls.slot), { name: 'sidebar.right.pane.tab', key: 'dsh-subagent-hub/routing', locale: 'subagentHub' })

  // Drive the registered body's click handler through a rendered row.
  const element = calls.body({ sessionId: 'parent-1', useProjection: () => ({ runs: [run()] }), useSessions: () => undefined })
  element.props.open('parent-1', 'child-1')
  assert.deepEqual(plain(calls.opened), ['dsh-resource://subagentchat/session/child-1?parent=parent-1&mode=continuable', { kind: 'subagentchat', preferNewPane: true }])
  element.props.refresh('parent-1')
  assert.equal(calls.refreshed, 'parent-1')
})
