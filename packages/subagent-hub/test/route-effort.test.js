import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routeEffortVerdict, creationRouteVerdict, guardVerdict, GUARD_PREFIX } from '../lib/guard.js'
import { indexRoutes, routeLabel } from '../lib/router.js'
import { buildCatalog } from '../lib/catalog.js'
import { promptSection } from '../lib/prompt.js'
import { dispatchFold, dispatchProjection } from '../lib/dispatch-history.js'

const route = { id: 'sol', provider: 'magpie-responses', model: 'codex/gpt-6.1-sol', reasoningEffort: 'high' }
const parameters = { properties: { provider: {}, model: {}, reasoning_effort: {} } }
const parent = { options: { provider: 'p', model: 'other', reasoningEffort: 'high' } }
const base = { toolName: 'subagent', arguments: { provider: route.provider, model: route.model }, parent,
  catalog: indexRoutes([route]), parameters }
const verdict = changes => routeEffortVerdict({ ...base, ...changes })

for (const toolName of ['subagent', 'subagent_fork', 'spawn_teammate']) {
  test(`${toolName} refuses omitted effort on a different route with actionable retry`, () => {
    const reason = verdict({ toolName })
    assert.ok(reason.startsWith(GUARD_PREFIX))
    assert.match(reason, /No child was started/)
    assert.ok(reason.includes('provider="magpie-responses" model="codex/gpt-6.1-sol"'))
    assert.match(reason, /default reasoning effort "high"/)
    assert.match(reason, /original call unchanged, adding only `reasoning_effort: "high"`/)
    assert.match(reason, /does not block explicit values/)
  })
}
test('legacy Team schemas and unrelated tools ignore route effort', () => {
  assert.equal(verdict({ toolName: 'spawn_teammate', parameters: { properties: { context: {} } } }), undefined)
  for (const toolName of ['workflow', 'read']) assert.equal(verdict({ toolName }), undefined)
})
test('the current schema must expose reasoning_effort', () => {
  assert.ok(verdict({}))
  for (const parameters of [undefined, {}, { properties: { provider: {}, model: {} } }]) assert.equal(verdict({ parameters }), undefined)
})
test('empty effort is corrected and all explicit values are left to the runtime', () => {
  for (const reasoning_effort of [undefined, null, '']) assert.ok(verdict({ arguments: { ...base.arguments, reasoning_effort } }))
  for (const reasoning_effort of ['high', 'low', 'unsupported', ' ', 0, false]) assert.equal(verdict({ arguments: { ...base.arguments, reasoning_effort } }), undefined)
})
test('only an exact configured route with a default is eligible', () => {
  assert.equal(verdict({ catalog: indexRoutes([{ ...route, reasoningEffort: undefined }]) }), undefined)
  assert.equal(verdict({ catalog: indexRoutes([]) }), undefined)
  assert.equal(verdict({ arguments: { provider: 'magpie-responses/codex', model: 'gpt-6.1-sol' } }), undefined)
  assert.equal(verdict({ arguments: { provider: route.provider } }), undefined)
  assert.equal(verdict({ arguments: {}, parent: undefined }), undefined)
})
test('inherited and explicitly selected parent routes compare latest parent effort', () => {
  for (const args of [{}, base.arguments]) {
    const options = { ...route, reasoningEffort: 'low' }
    const sameParent = { options, session: { requestHeader: () => ({ config: { ...route, reasoningEffort: 'high' } }) } }
    assert.equal(verdict({ arguments: args, parent: sameParent }), undefined)
    assert.ok(verdict({ arguments: args, parent: { options: { ...route, reasoningEffort: 'high' }, session: { requestHeader: () => ({ config: options }) } } }))
    assert.equal(verdict({ arguments: args, parent: { options: { ...route, reasoningEffort: 'high' } } }), undefined)
    assert.ok(verdict({ arguments: args, parent: { options } }))
    assert.ok(verdict({ arguments: args, parent: { options: { ...route, reasoningEffort: undefined } } }))
  }
})
test('rc2 explicit same-route selection clears parent effort and requires an explicit default', () => {
  for (const toolName of ['subagent', 'subagent_fork']) {
    const sameParent = { options: { ...route, reasoningEffort: 'high' } }
    const reason = verdict({ toolName, parent: sameParent, explicitRouteEffortDefault: true })
    assert.match(reason, /adding only `reasoning_effort: "high"`/)
    assert.equal(verdict({ toolName, parent: sameParent, arguments: {}, explicitRouteEffortDefault: true }), undefined)
    assert.equal(verdict({ toolName, parent: sameParent, explicitRouteEffortDefault: true,
      arguments: { ...base.arguments, reasoning_effort: 'low' } }), undefined)
  }
})
test('rc2 inherited-route correction supplies provider, model and effort together', () => {
  const reason = verdict({ arguments: {}, parent: { options: { ...route, reasoningEffort: 'low' } }, explicitRouteEffortDefault: true })
  assert.match(reason, /provider: "magpie-responses"/)
  assert.match(reason, /model: "codex\/gpt-6.1-sol"/)
  assert.match(reason, /reasoning_effort: "high"` together/)
  assert.doesNotMatch(reason, /adding only/)
})
test('rc2 effort advice does not invent unsupported selectors or replace native pairing validation', () => {
  const parent = { options: { ...route, reasoningEffort: 'low' } }
  assert.equal(verdict({ arguments: {}, parent, explicitRouteEffortDefault: true,
    parameters: { properties: { reasoning_effort: {} } } }), undefined)
  for (const args of [{ provider: route.provider }, { model: route.model }]) {
    assert.equal(verdict({ arguments: args, parent, explicitRouteEffortDefault: true }), undefined)
  }
})
test('model-less fork uses the inherited route despite unsupported model arguments', () => {
  assert.ok(verdict({ toolName: 'subagent_fork', parameters: { properties: { reasoning_effort: {} } },
    arguments: { provider: 'ignored', model: 'ignored' }, parent: { options: { ...route, reasoningEffort: 'low' } } }))
})
test('effort inspection exceptions always allow the call', () => {
  assert.equal(routeEffortVerdict(undefined), undefined)
  assert.equal(verdict({ catalog: { get routes() { throw new Error('unavailable') } } }), undefined)
  assert.equal(verdict({ arguments: { get reasoning_effort() { throw new Error('unavailable') } } }), undefined)
  assert.equal(verdict({ parent: { get options() { throw new Error('unavailable') } } }), undefined)
  assert.equal(verdict({ parent: { options: { ...route, reasoningEffort: 'low' }, session: { requestHeader() { throw new Error('header failure') } } } }), undefined)
})
test('prompt advertises the effort and scopes its instruction to schema-capable independent tools', () => {
  const text = promptSection({ catalog: buildCatalog({ routes: [route], agents: [] }), params: { model: true } })
  assert.ok(text.includes(routeLabel(route)))
  assert.match(text, /default reasoning_effort: "high"/)
  assert.match(text, /explicitly pass the route default.*unless the task clearly needs a different effort/)
  assert.match(text, /does not apply to `spawn_teammate` or `workflow`/)
})
test('a capable Team gets role and effort guidance without claiming it on legacy schemas', () => {
  const catalog = buildCatalog({ routes: [route], agents: [{ id: 'builder', description: 'Build', routes: ['sol'] }] })
  const text = promptSection({ catalog, params: { independent: [], team: { model: true, agentPreset: true, effort: true } } })
  assert.match(text, /spawn_teammate.agent_preset/)
  assert.match(text, /context=fresh.*agent_preset/)
  assert.match(text, /context=fork.*cannot select an independent preset/)
  assert.match(text, /same route default applies to `spawn_teammate`/)
  assert.doesNotMatch(text, /catalog is informational here|does not apply to `spawn_teammate`/)
})
test('effort denials enter dispatch history through native errors and structured reasons', () => {
  for (const tool of ['subagent', 'subagent_fork']) {
    const reason = verdict({ toolName: tool })
    for (const structured of [false, true]) {
      let state = dispatchProjection.init()
      state = dispatchFold(state, { type: 'tool/call', data: { callId: 'effort', name: tool } })
      state = dispatchFold(state, { type: 'tool/result', seq: 2, time: 100, data: {
        ...(structured ? { error: { reason } } : {}),
        message: { toolCallId: 'effort', isError: true, content: [{ type: 'text', text: `Error: ${reason}` }] },
      } })
      assert.equal(state.view.total, 1)
      assert.equal(state.view.records[0].reason, reason)
      assert.equal(state.view.records[0].tool, tool)
    }
  }
})
for (const correct of [route, { ...route, provider: 'a/b/c', model: 'd/e/f' }]) {
  test(`incorrect slash splitting is corrected for ${correct.provider}`, () => {
    const wrong = correct === route ? { provider: 'magpie-responses/codex', model: 'gpt-6.1-sol' } : { provider: 'a/b', model: 'c/d/e/f' }
    assert.notEqual(routeLabel(correct), routeLabel(wrong))
    for (const sessionPolicy of [undefined, [correct]]) {
      const reason = creationRouteVerdict({ toolName: 'subagent', arguments: wrong, parameters,
        catalog: indexRoutes([correct]), sessionPolicy })
      assert.match(reason, /provider\/model split is incorrect/)
      assert.ok(reason.includes(`exact separate values: ${routeLabel(correct)}`))
      assert.doesNotMatch(reason, /new.*Session/)
    }
  })
}
test('named-agent constraints explain an incorrect split with exact separate values', () => {
  const catalog = buildCatalog({ routes: [route], agents: [{ id: 'reviewer', description: 'Review', routes: ['sol'] }] })
  const reason = guardVerdict({ catalog, arguments: { agent_preset: 'hub-agent-reviewer', provider: 'magpie-responses/codex', model: 'gpt-6.1-sol' } })
  assert.match(reason, /provider\/model split is incorrect/)
  assert.ok(reason.includes(`exact separate values: ${routeLabel(route)}`))
  assert.doesNotMatch(reason, /new.*Session/)
})
test('a genuinely stale differently split snapshot still requires a new Session for the configured route', () => {
  const reason = creationRouteVerdict({ toolName: 'subagent', arguments: base.arguments,
    parameters, catalog: base.catalog, sessionPolicy: [{ provider: 'magpie-responses/codex', model: 'gpt-6.1-sol' }] })
  assert.match(reason, /allows this route, but this Session keeps the older list/)
  assert.match(reason, /new top-level Session/)
  assert.doesNotMatch(reason, /split is incorrect/)
})
test('unlisted routes do not suggest a new Session when snapshots agree', () => {
  const reason = creationRouteVerdict({ toolName: 'subagent', arguments: { provider: 'foreign', model: 'unknown' },
    parameters, catalog: base.catalog, sessionPolicy: [route] })
  assert.doesNotMatch(reason, /new.*Session|older list/)
})
