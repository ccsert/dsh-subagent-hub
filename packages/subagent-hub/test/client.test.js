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
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return undefined
    throw new Error(`unexpected require ${id}`)
  })
}

// Values built inside the vm context carry its own prototypes; compare as plain JSON.
const plain = value => JSON.parse(JSON.stringify(value))
const t = (key, params) => params === undefined ? key : `${key}${JSON.stringify(params)}`

const saved = () => ({
  manageOfficialSettings: true,
  maxConcurrent: 4,
  routes: [
    { id: 'flash', provider: 'p', model: 'flash', tags: ['fast'], note: 'Flash' },
    { id: 'pro', provider: 'p', model: 'pro', reasoningEffort: 'high' },
  ],
  agents: [
    { id: 'reviewer', description: 'Reviews diffs', instructions: 'Report only.', routes: ['pro'], needs: ['fast'] },
  ],
})

const catalogGroups = () => [
  { id: 'p', name: 'Provider P', models: [{ id: 'flash', name: 'Flash' }, { id: 'pro', name: 'Pro' }] },
  { id: 'q', name: 'Provider Q', models: [{ id: 'big', name: 'Big' }] },
]

test('drafts round-trip a saved value, keep note, and drop blank rows', () => {
  const { draftsOf, valuesOf } = loadClient()
  const drafts = draftsOf(saved())
  assert.equal(drafts.manageOfficialSettings, true)
  assert.deepEqual(plain(valuesOf(drafts)), saved())
  drafts.routes.push({ id: '', provider: '', model: '', reasoningEffort: '', tags: [], note: '' })
  drafts.agents.push({ id: '', description: '', instructions: '', routes: [], needs: [], basePreset: 'standard' })
  assert.deepEqual(plain(valuesOf(drafts)), saved(), 'completely blank rows are not saved')
})

test('save performs one atomic write of every field', () => {
  const { saveOps } = loadClient()
  assert.deepEqual(plain(saveOps({ manageOfficialSettings: false, maxConcurrent: 4, routes: [], agents: [] })), [
    { op: 'set', path: ['routes'], value: [] },
    { op: 'set', path: ['agents'], value: [] },
    { op: 'set', path: ['manageOfficialSettings'], value: false },
    { op: 'set', path: ['maxConcurrent'], value: 4 },
  ])
})

test('the concurrency limit must be a non-negative whole number', () => {
  const { draftsOf, draftProblem } = loadClient()
  assert.equal(draftProblem(draftsOf(saved())), undefined)
  assert.match(draftProblem(draftsOf({ ...saved(), maxConcurrent: -1 })), /non-negative whole number/)
  assert.match(draftProblem(draftsOf({ ...saved(), maxConcurrent: 1.5 })), /non-negative whole number/)
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

test('route ids are suggested from the model id and stay unique', () => {
  const { slugForModel, uniqueRouteId } = loadClient()
  assert.equal(slugForModel('deepseek-flash'), 'deepseek-flash')
  assert.equal(slugForModel('minimax-cn/MiniMax-M3.1-Flash'), 'mini-max-m3-1-flash')
  assert.equal(slugForModel(''), 'route')
  assert.equal(uniqueRouteId('flash', new Set()), 'flash')
  assert.equal(uniqueRouteId('flash', new Set(['flash'])), 'flash-2')
  assert.equal(uniqueRouteId('flash', new Set(['flash', 'flash-2'])), 'flash-3')
})

test('provider, model and effort choices come from the Host catalog', () => {
  const { providerChoices, modelChoices, effortChoices } = loadClient()
  const groups = [{ id: 'p', name: 'Provider P', models: [{ id: 'flash', name: 'Flash', reasoning: { efforts: [{ id: 'high', name: 'High' }] } }] }]
  assert.deepEqual(plain(providerChoices(groups, '')), [{ value: 'p', label: 'Provider P (p)' }])
  assert.deepEqual(plain(modelChoices(groups, 'p', '')), [{ value: 'flash', label: 'Flash' }])
  assert.deepEqual(plain(effortChoices(groups, 'p', 'flash', '')), [{ value: 'high', label: 'High' }])
  // A stored value the catalog no longer lists stays selectable and is labelled as such.
  assert.match(providerChoices(groups, 'gone')[0].label, /gone \(不在当前目录\)/)
  assert.match(modelChoices(groups, 'p', 'old')[0].label, /old \(不在当前目录\)/)
  assert.match(effortChoices(groups, 'p', 'flash', 'max')[0].label, /max \(不在当前目录\)/)
})

test('tags are unique, lowercased, and removable', () => {
  const { addTag, removeTag, knownTags } = loadClient()
  assert.deepEqual(plain(addTag(['fast'], 'Cheap')), ['fast', 'cheap'])
  assert.deepEqual(plain(addTag(['fast'], 'fast')), ['fast'])
  assert.deepEqual(plain(addTag(['fast'], '  ')), ['fast'])
  assert.deepEqual(plain(removeTag(['fast', 'cheap'], 'fast')), ['cheap'])
  assert.deepEqual(plain(knownTags([{ tags: ['b', 'a'] }, { tags: ['a'] }])), ['a', 'b'])
})

test('the preview mirrors the catalog the main agent receives', () => {
  const { catalogPreview, draftsOf } = loadClient()
  const text = catalogPreview(draftsOf(saved()))
  assert.match(text, /Models:/)
  assert.match(text, /`p\/flash` — tags: fast; Flash/)
  assert.match(text, /Capability tags: `fast`\./)
  assert.match(text, /Named agents:/)
  assert.match(text, /`hub-agent-reviewer` — Reviews diffs \(tags: fast; routes: pro = p\/pro\)\./)
  assert.equal(catalogPreview(draftsOf({ routes: [], agents: [] })), '')
})

test('summary shows counts and the managed state', () => {
  const { ConfigPage } = loadClient()
  const html = renderToStaticMarkup(React.createElement(ConfigPage, {
    view: 'summary', form: { state: { status: 'ready', writable: true, revision: 1, value: saved() } }, t,
  }))
  assert.match(html, /summary.*&quot;routes&quot;:2.*&quot;agents&quot;:1.*&quot;limit&quot;:4/)
  assert.match(html, /summary\.managedOn/)
})

test('the page renders general settings, route rows as dropdowns, agent summaries, and a save bar', () => {
  const { ConfigPage } = loadClient()
  const form = { state: { status: 'ready', writable: true, revision: 7, value: saved() }, mutate: async () => true }
  const ctx = {
    remote: {
      session: { modelCatalog: async () => ({ ok: true, value: { groups: catalogGroups(), failures: [] } }) },
      agentPresets: { list: async () => ({ ok: true, value: { presets: [{ id: 'standard', name: 'Standard' }] } }) },
    },
  }
  const html = renderToStaticMarkup(React.createElement(ConfigPage, { view: 'page', form, t, ctx }))
  for (const needle of [
    'sah-intro', 'general.title', 'concurrency.limit', 'official.switch', 'routes.title', 'sah-route-card',
    'value="flash"', 'value="pro"', 'value="high"', 'value="Flash"',
    'agents.title', 'hub-agent-reviewer', 'Reviews diffs', 'preview.title', 'save', 'discard',
  ]) assert.ok(html.includes(needle), `missing ${needle}`)
  // Route identity is chosen from dropdowns; the concurrency cap is a stepper; the switch is a switch.
  assert.match(html, /<select[^>]*class="sah-select"/)
  assert.match(html, /class="sah-stepper"/)
  assert.match(html, /role="switch" aria-checked="true"/)
  assert.ok(html.includes('routes.loading'), 'catalog loading notice missing')
  // Existing named agents start collapsed: the summary shows, the editor does not.
  assert.ok(!html.includes('Report only.'), 'collapsed agent should not render its editor')
})

test('an expanded agent card edits name, purpose, instructions, allowed routes, and base preset', () => {
  const { AgentCard, draftsOf } = loadClient()
  const draft = draftsOf(saved())
  const html = renderToStaticMarkup(React.createElement(AgentCard, {
    agent: draft.agents[0], index: 0, routes: draft.routes, presets: [{ id: 'standard', name: 'Standard' }],
    known: ['fast'], defaultOpen: true, t, onChange() {}, onRemove() {},
  }))
  for (const needle of ['value="reviewer"', 'Report only.', 'agents.routesLabel', 'agents.basePreset', 'p/pro']) {
    assert.ok(html.includes(needle), `missing ${needle}`)
  }
  assert.match(html, /aria-pressed="true"[^>]*>pro/)
  assert.match(html, /aria-pressed="false"[^>]*>flash/)
})

test('the official allowlist is read out of the preset rows', () => {
  const { officialAllowlists, allowlistSynced } = loadClient()
  const plugins = [
    { id: 'persona', name: '@deepseek-ai/dsh-persona' },
    {
      id: 'delegation',
      name: 'cordis:group',
      config: [
        { id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', allowedAgentPresets: ['hub-agent-reviewer'] } },
        { id: 'tool-subagent-fork', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'fork' } },
      ],
    },
  ]
  assert.deepEqual(plain(officialAllowlists(plugins)), [['hub-agent-reviewer']])
  assert.equal(allowlistSynced([['hub-agent-reviewer']], ['hub-agent-reviewer']), true)
  assert.equal(allowlistSynced([['hub-agent-reviewer']], ['hub-agent-reviewer', 'hub-agent-scribe']), false)
  assert.equal(allowlistSynced([], []), true)
})

test('the page without a Host form explains itself', () => {
  const { ConfigPage } = loadClient()
  const html = renderToStaticMarkup(React.createElement(ConfigPage, { view: 'page', form: undefined, t, ctx: { remote: undefined } }))
  assert.ok(html.includes('unavailable') || html.includes('sah-empty'))
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
  assert.deepEqual(plain(inject), ['slots', 'locale', 'configForms', 'remote', 'remote.session'])
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
  assert.match(renderToStaticMarkup(section.body({ close() {} })), /sah-intro/)
})
