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

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

/** The keys of one dictionary block of the page, parsed out of the source. */
const dictionaryKeys = (from, to) => new Set(
  [...source.slice(source.indexOf(from), source.indexOf(to)).matchAll(/'([^']+)':/g)].map(match => match[1]),
)
const zhKeys = dictionaryKeys('const zh = {', 'const en = {')
const enKeys = dictionaryKeys('const en = {', '// ── pure helpers')

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
  const { providerChoices, modelChoices, effortChoices, effortsOf } = loadClient()
  const groups = [{ id: 'p', name: 'Provider P', models: [{ id: 'flash', name: 'Flash', reasoning: { efforts: [{ id: 'high', name: 'High' }] } }] }]
  assert.deepEqual(plain(providerChoices(groups, '')), [{ value: 'p', label: 'Provider P (p)' }])
  assert.deepEqual(plain(modelChoices(groups, 'p', '')), [{ value: 'flash', label: 'Flash' }])
  assert.deepEqual(plain(effortChoices(groups, 'p', 'flash', '')), [{ value: 'high', label: 'High' }])
  assert.deepEqual(plain(effortsOf(groups, 'p', 'flash')), [{ id: 'high', name: 'High' }])
  assert.deepEqual(plain(effortsOf(groups, 'p', 'other')), [])
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

test('provider and model are one select, grouped per provider', () => {
  const { ConfigPage, modelOptionValue } = loadClient()
  const form = { state: { status: 'ready', writable: true, revision: 7, value: saved() }, mutate: async () => true }
  const html = renderToStaticMarkup(React.createElement(ConfigPage, { view: 'page', form, t, ctx: { remote: undefined } }))
  // The merged value carries the provider and the model.
  assert.ok(html.includes(`value="${modelOptionValue('p', 'flash')}"`), 'merged model value missing')
  assert.ok(html.includes(`value="${modelOptionValue('p', 'pro')}"`), 'merged model value missing')
  // One group per provider, and the stored pair stays selectable even when the catalog is empty.
  assert.match(html, /<optgroup label="[^"]+">/)
  assert.ok(!html.includes('route.provider'), 'the provider select is gone')
})

test('the reasoning effort appears only for a model that advertises efforts', () => {
  const { RouteCard, draftsOf } = loadClient()
  const groups = [{
    id: 'p',
    name: 'Provider P',
    models: [
      { id: 'flash', name: 'Flash' },
      { id: 'pro', name: 'Pro', reasoning: { efforts: [{ id: 'high', name: 'High' }] } },
    ],
  }]
  const draft = draftsOf(saved())
  const withoutEffort = renderToStaticMarkup(React.createElement(RouteCard, {
    route: draft.routes[0], index: 0, total: 2, groups, catalogReady: true, known: [],
    disabled: false, t, onChange() {}, onRemove() {}, onMove() {},
  }))
  assert.ok(!withoutEffort.includes('route.effort'), 'a model without efforts must not offer an effort select')
  const withEffort = renderToStaticMarkup(React.createElement(RouteCard, {
    route: draft.routes[1], index: 1, total: 2, groups, catalogReady: true, known: [],
    disabled: false, t, onChange() {}, onRemove() {}, onMove() {},
  }))
  assert.ok(withEffort.includes('route.effort'), 'a model with efforts offers the effort select')
  assert.ok(withEffort.includes('value="high"'), 'the stored effort stays selected')
})

test('a stored pair the catalog dropped stays selectable and is marked', () => {
  const { modelGroups } = loadClient()
  const groups = [{ id: 'p', name: 'Provider P', models: [{ id: 'flash', name: 'Flash' }] }]
  const known = modelGroups(groups, 'p', 'flash', '不在当前目录')
  assert.deepEqual(plain(known[0].options.map(option => option.value)), ['p|flash'])
  const missingModel = modelGroups(groups, 'p', 'gone', '不在当前目录')
  assert.match(missingModel[0].options[0].label, /gone \(不在当前目录\)/)
  const missingProvider = modelGroups(groups, 'nope', 'gone', '不在当前目录')
  assert.match(missingProvider[0].label, /nope \(不在当前目录\)/)
  assert.deepEqual(plain(missingProvider[0].options.map(option => option.value)), ['nope|gone'])
})

test('the merged model value encodes the provider and the model', () => {
  const { modelOptionValue, parseModelValue } = loadClient()
  assert.equal(modelOptionValue('p', 'flash'), 'p|flash')
  assert.equal(modelOptionValue('', ''), '')
  assert.deepEqual(plain(parseModelValue('p|flash')), { provider: 'p', model: 'flash' })
  assert.deepEqual(plain(parseModelValue('minimax-cn/MiniMax-M3.1-Flash')), { provider: 'minimax-cn/MiniMax-M3.1-Flash', model: '' })
})

test('field problems point at the offending field', () => {
  const { draftsOf, fieldProblems } = loadClient()
  const drafts = draftsOf(saved())
  assert.deepEqual(plain(fieldProblems(drafts)), {}, 'a healthy draft has no field problems')

  const duplicateRoute = draftsOf({ ...saved(), routes: [{ id: 'a', provider: 'p', model: 'm' }, { id: 'a', provider: 'q', model: 'n' }] })
  assert.equal(fieldProblems(duplicateRoute)['route:0:id'], 'problem.route.id.duplicate')
  assert.equal(fieldProblems(duplicateRoute)['route:1:id'], 'problem.route.id.duplicate')

  const emptyName = draftsOf({ ...saved(), routes: [{ id: '', provider: 'p', model: 'm' }] })
  assert.equal(fieldProblems(emptyName)['route:0:id'], 'problem.route.id.empty')

  const badAgent = draftsOf({ ...saved(), agents: [{ id: 'Bad Id', description: 'x' }] })
  assert.equal(fieldProblems(badAgent)['agent:0:id'], 'problem.agent.id.invalid')

  const noDescription = draftsOf({ ...saved(), agents: [{ id: 'ok', description: '' }] })
  assert.equal(fieldProblems(noDescription)['agent:0:description'], 'problem.agent.description.empty')

  const unknownRoute = draftsOf({ ...saved(), agents: [{ id: 'ok', description: 'x', routes: ['nope'] }] })
  assert.equal(fieldProblems(unknownRoute)['agent:0:routes'], 'problem.agent.routes.unknown')

  const duplicateAgent = draftsOf({ ...saved(), agents: [{ id: 'a', description: 'x' }, { id: 'a', description: 'y' }] })
  assert.deepEqual(plain(Object.keys(fieldProblems(duplicateAgent)).filter(key => key.endsWith(':id'))), ['agent:0:id', 'agent:1:id'])
})

test('the page marks the offending field inline', () => {
  const { RouteCard, AgentCard, draftsOf, fieldProblems } = loadClient()
  const drafts = draftsOf({
    ...saved(),
    routes: [{ id: '', provider: 'p', model: 'flash', tags: [], note: '' }],
    agents: [{ id: 'Bad Id', description: '' }],
  })
  const problems = fieldProblems(drafts)
  assert.equal(problems['route:0:id'], 'problem.route.id.empty')
  const route = renderToStaticMarkup(React.createElement(RouteCard, {
    route: drafts.routes[0], index: 0, total: 1, groups: [], catalogReady: true, known: [], problems,
    disabled: false, t, onChange() {}, onRemove() {}, onMove() {},
  }))
  assert.ok(route.includes('sah-field-bad'), 'the route name field is marked')
  assert.ok(route.includes('sah-field-error'), 'the route name field explains itself')
  const agent = renderToStaticMarkup(React.createElement(AgentCard, {
    agent: drafts.agents[0], index: 0, routes: drafts.routes, presets: [], known: [], problems,
    defaultOpen: true, t, onChange() {}, onRemove() {},
  }))
  assert.match(agent, /sah-field-bad[^]*sah-field-error/)
  assert.ok(agent.includes('problem.agent.id.invalid'), 'the invalid name is named')
})

test('renaming a route carries the agents that use it', () => {
  const { draftsOf, renameRouteRefs } = loadClient()
  const drafts = draftsOf(saved())
  const renamed = renameRouteRefs(drafts, 'pro', 'pro-v2')
  assert.deepEqual(plain(renamed.agents[0].routes), ['pro-v2'])
  assert.deepEqual(plain(drafts.agents[0].routes), ['pro'], 'the source draft is untouched')
  assert.deepEqual(plain(renameRouteRefs(drafts, 'pro', 'pro').agents[0].routes), ['pro'])
})

test('deleting a route drops it from the agents', () => {
  const { draftsOf, dropRouteRefs } = loadClient()
  const drafts = draftsOf(saved())
  const dropped = dropRouteRefs(drafts, 'pro')
  assert.deepEqual(plain(dropped.agents[0].routes), [])
  assert.deepEqual(plain(drafts.agents[0].routes), ['pro'], 'the source draft is untouched')
  assert.deepEqual(plain(dropped.routes.map(route => route.id)), ['flash', 'pro'], 'the routes are untouched')
})

test('the agent templates are ready-made starting points', () => {
  const { AGENT_TEMPLATES } = loadClient()
  assert.deepEqual(plain(AGENT_TEMPLATES.map(template => template.id)), ['reviewer', 'tester', 'researcher', ''])
  for (const template of AGENT_TEMPLATES) {
    for (const key of [template.label, template.description, template.instructions]) {
      assert.ok(zhKeys.has(key), `${key} missing in zh`)
      assert.ok(enKeys.has(key), `${key} missing in en`)
    }
  }
})

test('the page offers the agent templates and the concurrency quick picks', () => {
  const { ConfigPage, AGENT_TEMPLATES } = loadClient()
  const form = { state: { status: 'ready', writable: true, revision: 7, value: saved() }, mutate: async () => true }
  const html = renderToStaticMarkup(React.createElement(ConfigPage, { view: 'page', form, t, ctx: { remote: undefined } }))
  for (const template of AGENT_TEMPLATES) assert.ok(html.includes(template.label), `missing ${template.label}`)
  // The quick picks sit next to the stepper: 1, 2, 4, 8 and unlimited.
  assert.ok(html.includes('concurrency.unlimited'))
  assert.match(html, /aria-pressed="true"[^>]*>4</)
  assert.ok(html.includes('concurrency.quick'))
})

test('the save bar offers the shortcut, and the preview can be copied', () => {
  const { ConfigPage } = loadClient()
  const form = { state: { status: 'ready', writable: true, revision: 7, value: saved() }, mutate: async () => true }
  const html = renderToStaticMarkup(React.createElement(ConfigPage, { view: 'page', form, t, ctx: { remote: undefined } }))
  assert.ok(html.includes('footer.shortcut'), 'the save shortcut is advertised')
  assert.ok(html.includes('preview.copy'), 'the preview can be copied')
  // The page root takes the keyboard, so the shortcut never leaks into the shell.
  assert.match(html, /<div class="sah"[^>]*tabindex="-1"/)
})

test('every translated string exists in both dictionaries', () => {
  const used = new Set([...source.matchAll(/\bt\('([^']+)'/g)].map(match => match[1]))
  assert.ok(used.size > 30, `only ${used.size} translated strings found`)
  for (const key of used) {
    assert.ok(zhKeys.has(key), `${key} missing in zh`)
    assert.ok(enKeys.has(key), `${key} missing in en`)
  }
  // The field problems point at dictionary keys, not at raw text.
  const { fieldProblems, draftsOf } = loadClient()
  const problems = fieldProblems(draftsOf(saved()))
  for (const key of Object.values(problems)) assert.ok(zhKeys.has(key), `${key} missing in zh`)
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

test('editor row identities are stable and are never saved', () => {
  const { editorDraftsOf, valuesOf, sameDraft } = loadClient()
  const a = editorDraftsOf(saved())
  const b = editorDraftsOf(saved())
  assert.notEqual(a.routes[0]._key, b.routes[0]._key)
  assert.equal(sameDraft(a, b), true)
  assert.deepEqual(plain(valuesOf(a)), saved())
  a.routes.push({ id: '', provider: '', model: '', tags: [], note: '', reasoningEffort: '' })
  assert.equal(sameDraft(a, b), false, 'an added blank row still counts as a visible edit')
  a.routes.pop()
  a.agents[0].description = ''
  assert.equal(sameDraft(a, b), false, 'an incomplete agent must not disappear from dirty tracking')
})

test('route references survive clearing and replacing a name', () => {
  const { editorDraftsOf, changeRoute } = loadClient()
  const initial = editorDraftsOf(saved())
  const cleared = changeRoute(initial, 1, { ...initial.routes[1], id: '' })
  assert.deepEqual(plain(cleared.agents[0].routes), ['pro'])
  const renamed = changeRoute(cleared, 1, { ...cleared.routes[1], id: 'new-pro' })
  assert.deepEqual(plain(renamed.agents[0].routes), ['new-pro'])
  assert.equal(renamed.routes[1]._key, initial.routes[1]._key)
  const duplicated = changeRoute(initial, 1, { ...initial.routes[1], id: 'flash' })
  assert.deepEqual(plain(duplicated.agents[0].routes), ['pro'], 'a duplicate does not steal another route’s references')
  const repaired = changeRoute(duplicated, 1, { ...duplicated.routes[1], id: 'fixed' })
  assert.deepEqual(plain(repaired.agents[0].routes), ['fixed'])
})

test('undo restores references by original agent identity, not row position', () => {
  const { editorDraftsOf, restoreDeletion, dropRouteRefs } = loadClient()
  const initial = editorDraftsOf({ ...saved(), agents: [
    ...saved().agents,
    { id: 'tester', description: 'Tests code', instructions: '', routes: ['flash'] },
  ] })
  const item = initial.routes[1]
  const entry = { kind: 'route', index: 1, item, refs: [{ key: initial.agents[0]._key, index: 0 }] }
  const deleted = dropRouteRefs({ ...initial, routes: [initial.routes[0]] }, 'pro')
  const reordered = { ...deleted, agents: [...deleted.agents].reverse() }
  const restored = restoreDeletion(reordered, entry)
  assert.deepEqual(plain(restored.agents.find(agent => agent.id === 'reviewer').routes), ['pro'])
  assert.deepEqual(plain(restored.agents.find(agent => agent.id === 'tester').routes), ['flash'])
  assert.deepEqual(plain(restored.routes.map(route => route.id)), ['flash', 'pro'])
})

test('merged model choices round-trip separator characters and unicode', () => {
  const { modelOptionValue, parseModelValue } = loadClient()
  const pair = { provider: 'custom|中国', model: 'models/a|b%20' }
  assert.deepEqual(plain(parseModelValue(modelOptionValue(pair.provider, pair.model))), pair)
})

test('visible field labels and errors are bound to their controls', () => {
  const { RouteCard, draftsOf } = loadClient()
  const route = draftsOf(saved()).routes[0]
  const html = renderToStaticMarkup(React.createElement(RouteCard, {
    route, index: 0, total: 1, groups: catalogGroups(), known: [], t,
    problems: { 'route:0:id': 'problem.route.id.empty' }, onChange() {}, onMove() {}, onRemove() {},
  }))
  assert.match(html, /<label[^>]*for="[^"]+"/)
  assert.match(html, /aria-invalid="true"/)
  assert.match(html, /aria-describedby="[^"]+-error"/)
})

test('sync success checks the model allowlist and actual registered role ids', () => {
  const { officialSyncReady } = loadClient()
  const value = saved()
  const preset = ids => ({ status: 'ready', value: { presets: ids.map(id => ({ id })) } })
  const models = { status: 'ready', value: { enabled: true, allowedModels: value.routes.map(({ provider, model }) => ({ provider, model })) } }
  assert.equal(officialSyncReady(value, preset(['hub-agent-reviewer', 'foreign-agent']), models), true)
  assert.equal(officialSyncReady(value, preset(['hub-agent-reviewer']), { status: 'loading' }), false)
  assert.equal(officialSyncReady(value, preset(['hub-agent-reviewer', 'hub-agent-old']), models), false)
  assert.equal(officialSyncReady(value, preset(['hub-agent-reviewer']), { status: 'ready', value: { enabled: true, allowedModels: [] } }), false)
  assert.equal(officialSyncReady({ ...value, agents: [] }, preset([]), models), true)
  const broken = preset(['hub-agent-reviewer'])
  broken.value.presets[0].broken = 'missing base preset'
  assert.equal(officialSyncReady(value, broken, models), false)
})

test('apply registers the dictionary, the row page, and a Settings section', () => {
  const { apply, inject, ROW_CONFIG_KEY, ENTRY_ID } = loadClient()
  assert.deepEqual(plain(inject), ['slots', 'locale', 'configForms', 'remote', 'remote.session', 'remote.agentPresets'])
  assert.equal(ROW_CONFIG_KEY, 'dsh-subagent-hub#subagent-hub')
  assert.equal(ENTRY_ID, 'subagent-hub')
  const calls = { slots: [] }
  const ctx = {
    effect: fn => { calls.effects = (calls.effects ?? 0) + 1; return fn() },
    inject: (services, register) => { calls.services = services; return register(ctx) },
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
  assert.deepEqual(plain(calls.services), ['sessions'])
  assert.deepEqual(plain(calls.slots.map(slot => slot.options.name)).sort(), ['conversation.session.header.utilities', 'plugins.row.config', 'settings.section'])
  const row = calls.slots.find(slot => slot.options.name === 'plugins.row.config')
  assert.deepEqual(plain(row.options), { name: 'plugins.row.config', key: 'dsh-subagent-hub#subagent-hub', locale: 'subagentHub' })
  const section = calls.slots.find(slot => slot.options.name === 'settings.section')
  assert.equal(section.options.id, 'subagent-hub')
  assert.equal(section.options.order, 30)
  assert.equal(section.options.label(), 'nav')
  assert.match(renderToStaticMarkup(section.body({ close() {} })), /sah-intro/)
})
