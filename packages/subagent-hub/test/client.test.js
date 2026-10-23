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

const saved = () => ({
  manageOfficialSettings: true,
  routes: [
    { id: 'flash', provider: 'p', model: 'flash', tags: ['fast'], note: 'Flash' },
    { id: 'pro', provider: 'p', model: 'pro', reasoningEffort: 'high' },
  ],
  agents: [
    { id: 'reviewer', description: 'Reviews diffs', instructions: 'Report only.', routes: ['pro'], needs: ['fast'] },
  ],
})

test('drafts round-trip a saved value, keep note, and drop blank rows', () => {
  const { draftsOf, valuesOf } = loadClient()
  const drafts = draftsOf(saved())
  assert.equal(drafts.manageOfficialSettings, true)
  assert.deepEqual(plain(valuesOf(drafts)), saved())
  drafts.routes.push({ id: '', provider: '', model: '', reasoningEffort: '', tags: [], note: '' })
  drafts.agents.push({ id: '', description: '', instructions: '', routes: [], needs: [], basePreset: 'standard' })
  assert.deepEqual(plain(valuesOf(drafts)), saved(), 'completely blank rows are not saved')
})

test('save performs one atomic three-field write', () => {
  const { saveOps } = loadClient()
  assert.deepEqual(plain(saveOps({ manageOfficialSettings: false, routes: [], agents: [] })), [
    { op: 'set', path: ['routes'], value: [] },
    { op: 'set', path: ['agents'], value: [] },
    { op: 'set', path: ['manageOfficialSettings'], value: false },
  ])
})

test('validation catches duplicate route ids, duplicate routes, bad agent ids, and unknown route refs', () => {
  const { draftsOf, draftProblem } = loadClient()
  assert.equal(draftProblem(draftsOf(saved())), undefined)
  assert.match(draftProblem(draftsOf({ ...saved(), routes: [{ id: 'a', provider: 'p', model: 'm' }, { id: 'a', provider: 'q', model: 'n' }] })), /duplicate route id/)
  assert.match(draftProblem(draftsOf({ ...saved(), routes: [{ id: 'a', provider: 'p', model: 'm' }, { id: 'b', provider: 'p', model: 'm' }] })), /repeats p\/m/)
  assert.match(draftProblem(draftsOf({ ...saved(), agents: [{ id: 'Bad Id', description: 'x' }] })), /lowercase letters/)
  assert.match(draftProblem(draftsOf({ ...saved(), agents: [{ id: 'ghost', description: 'x', routes: ['nope'] }] })), /unknown routes: nope/)
  assert.match(draftProblem(draftsOf({ ...saved(), agents: [{ id: 'ghost', description: '' }] })), /need id and description/)
})

test('blank rows do not fail validation', () => {
  const { draftsOf, draftProblem } = loadClient()
  const drafts = draftsOf(saved())
  drafts.routes.push({ id: '', provider: '', model: '', reasoningEffort: '', tags: [], note: '' })
  drafts.agents.push({ id: '', description: '', instructions: '', routes: [], needs: [], basePreset: 'standard' })
  assert.equal(draftProblem(drafts), undefined)
})

test('summary shows counts and the managed state', () => {
  const { SettingsPage } = loadClient()
  const html = renderToStaticMarkup(React.createElement(SettingsPage, {
    view: 'summary', form: { state: { status: 'ready', writable: true, revision: 1, value: saved() } }, t,
  }))
  assert.match(html, /summary.*&quot;routes&quot;:2.*&quot;agents&quot;:1/)
  assert.match(html, /summary\.managedOn/)
})

test('page renders routes, agents, the official toggle, and a save control', () => {
  const { SettingsPage } = loadClient()
  const form = { state: { status: 'ready', writable: true, revision: 7, value: saved() }, mutate: async () => true }
  const html = renderToStaticMarkup(React.createElement(SettingsPage, { view: 'page', form, t }))
  for (const needle of [
    'value="flash"', 'value="p"', 'value="pro"', 'value="high"', 'value="Flash"',
    'value="reviewer"', 'Report only.', 'page.routesHint', 'page.agentsHint', 'page.officialOn',
    'page.save', 'hub-agent-reviewer',
  ]) assert.ok(html.includes(needle), `missing ${needle}`)
  assert.match(html, /type="checkbox"[^>]*checked=""/)
})

test('page without a Host form explains itself instead of offering a dead save', () => {
  const { SettingsPage } = loadClient()
  const html = renderToStaticMarkup(React.createElement(SettingsPage, { view: 'page', form: undefined, t }))
  assert.ok(html.includes('page.noForm'))
  assert.match(html, /disabled=""[^>]*>page.save/)
})

const formMock = (value = saved(), status = 'ready') => {
  const form = {
    getSnapshot: () => ({ status, value: status === 'ready' ? value : undefined, base: undefined, user: undefined, revision: 3, writable: true }),
    subscribe: () => () => {},
    mutate: async () => true,
  }
  return form
}

test('apply registers the dictionary, the row page, and a Settings section', () => {
  const { apply, inject, ROW_CONFIG_KEY, ENTRY_ID } = loadClient()
  assert.deepEqual(plain(inject), ['slots', 'locale', 'configForms'])
  assert.equal(ROW_CONFIG_KEY, 'dsh-subagent-hub#subagent-hub')
  assert.equal(ENTRY_ID, 'subagent-hub')
  const calls = { slots: [] }
  const ctx = {
    effect: fn => { calls.effects = (calls.effects ?? 0) + 1; return fn() },
    locale: { register: (ns, dicts) => { calls.locale = [ns, Object.keys(dicts)] }, bind: () => t },
    configForms: {
      whileServed: (namespaces, register) => { calls.served = namespaces; return register(new Set(namespaces)) },
      get: () => formMock(),
    },
    slots: {
      inject: (owner, fn) => { calls.owner = owner; return fn() },
      register: (options, body) => { calls.slots.push({ options, body }); return () => {} },
    },
  }
  apply(ctx)
  assert.deepEqual(plain(calls.locale), ['subagentHub', ['en', 'zh']])
  assert.deepEqual(plain(calls.served), ['subagent-hub'])
  assert.deepEqual(plain(calls.slots.map(slot => slot.options.name)).sort(), ['plugins.row.config', 'settings.section'])
  const row = calls.slots.find(slot => slot.options.name === 'plugins.row.config')
  assert.deepEqual(plain(row.options), { name: 'plugins.row.config', key: 'dsh-subagent-hub#subagent-hub', locale: 'subagentHub' })
  const section = calls.slots.find(slot => slot.options.name === 'settings.section')
  assert.equal(section.options.id, 'subagent-hub')
  assert.equal(section.options.order, 30)
  assert.equal(section.options.label(), 'nav')
  // Row page without a Host form explains itself; the Settings section page renders the form.
  assert.match(renderToStaticMarkup(calls.slots.find(slot => slot.options.name === 'plugins.row.config').body({ view: 'page', form: undefined })), /page\.noForm/)
  const sectionHtml = renderToStaticMarkup(section.body({ close() {} }))
  assert.match(sectionHtml, /page\.save/)
  assert.match(sectionHtml, /value="reviewer"/)
})
