import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCatalog } from '../lib/catalog.js'
import { teamRoutingProjection, teamRoutingFold, teamBindingSchema, TEAM_BINDING_RECORD, TEAM_ASSIGNMENT_RECORD, sameTeamSelection, teamAssignmentProblem } from '../lib/team-routing-state.js'

const binding = (extra = {}) => ({ version: 1, token: 'opaque-token', rootId: 'lead-session', name: 'builder', routeId: 'mini', selection: { provider: 'minimax', model: 'M3', reasoningEffort: 'high' }, context: 'fresh', phase: 'planned', ...extra })
const record = (data, type = TEAM_BINDING_RECORD) => ({ type, ignorable: true, data })
const initial = id => teamRoutingProjection.init({ id })
const catalog = () => buildCatalog({ routes: [{ id: 'mini', provider: 'minimax', model: 'M3' }, { id: 'other', provider: 'other', model: 'M' }], agents: [{ id: 'builder', description: 'Implement', routes: ['mini'] }] })

test('Team assignment schema requires the exact child identity after reservation', () => {
  assert.equal(teamBindingSchema.safeParse(binding()).success, true)
  for (const phase of ['prepared', 'bound']) assert.equal(teamBindingSchema.safeParse(binding({ phase })).success, false)
  assert.equal(teamBindingSchema.safeParse(binding({ childId: 'child' })).success, false)
  assert.equal(teamBindingSchema.safeParse(binding({ childId: 'child', phase: 'bound' })).success, true)
})

test('Lead binding snapshots preserve token identity through preparation and final binding', () => {
  let state = teamRoutingFold(initial('lead-session'), record(binding()))
  state = teamRoutingFold(state, record(binding({ childId: 'child', phase: 'prepared' })))
  state = teamRoutingFold(state, record(binding({ childId: 'child', phase: 'bound' })))
  assert.equal(state.bindings.length, 1)
  assert.equal(state.bindings[0].childId, 'child')
  assert.equal(state.assignment, null)
  assert.throws(() => teamRoutingFold(state, record(binding({ childId: 'another', phase: 'bound' }))), /identity changed/)
})

test('forked copies cannot inherit another session’s Team membership or model binding', () => {
  const source = binding({ childId: 'old-child', phase: 'bound' })
  const fork = initial('new-child')
  assert.equal(teamRoutingFold(fork, record(source)), fork)
  assert.equal(teamRoutingFold(fork, record(source, TEAM_ASSIGNMENT_RECORD)), fork)
  const own = binding({ token: 'own-token', childId: 'new-child', phase: 'bound' })
  const owned = teamRoutingFold(fork, record(own, TEAM_ASSIGNMENT_RECORD))
  assert.equal(owned.assignment.token, 'own-token')
})

test('same-token child records cannot change their model, role or parent', () => {
  const own = binding({ childId: 'child', phase: 'bound', role: { id: 'builder', instructions: 'Original' } })
  const state = teamRoutingFold(initial('child'), record(own, TEAM_ASSIGNMENT_RECORD))
  for (const altered of [
    { ...own, rootId: 'other-team' },
    { ...own, selection: { ...own.selection, model: 'Different' } },
    { ...own, role: { ...own.role, instructions: 'Changed' } },
  ]) assert.throws(() => teamRoutingFold(state, record(altered, TEAM_ASSIGNMENT_RECORD)), /cannot change/)
})

test('cancelled pre-creation attempts release only their own reservation', () => {
  let state = teamRoutingFold(initial('lead-session'), record(binding()))
  state = teamRoutingFold(state, record(binding({ token: 'second', name: 'second' })))
  state = teamRoutingFold(state, record(binding({ phase: 'cancelled' })))
  assert.deepEqual(state.bindings.map(row => row.token), ['second'])
})

test('malformed owned records fail closed and unrelated history is unchanged', () => {
  const state = initial('lead-session')
  assert.equal(teamRoutingFold(state, { type: 'tool/call', data: {} }), state)
  assert.equal(teamRoutingFold(state, { ...record(binding()), ignorable: false }), state)
  assert.throws(() => teamRoutingFold(state, record({ ...binding(), selection: { provider: 'p' } })), /invalid persisted/)
})

test('live policy refuses removed or retargeted routes and narrower role restrictions', () => {
  const assigned = binding({ role: { id: 'builder', instructions: '' } })
  const current = catalog()
  assert.equal(teamAssignmentProblem(assigned, current), undefined)
  current.routes.get('mini').model = 'Retargeted'
  assert.match(teamAssignmentProblem(assigned, current), /removed or changed/)
  const narrowed = catalog()
  narrowed.agents[0].routes = ['other']
  assert.match(teamAssignmentProblem(assigned, narrowed), /no longer permits/)
  narrowed.agents.length = 0
  assert.match(teamAssignmentProblem(assigned, narrowed), /no longer configured/)
})

test('member model equality includes reasoning effort and never accepts missing selections', () => {
  const selected = binding().selection
  assert.equal(sameTeamSelection({ ...selected }, selected), true)
  assert.equal(sameTeamSelection(undefined, selected), false)
  assert.equal(sameTeamSelection({ ...selected, reasoningEffort: 'low' }, selected), false)
  assert.equal(sameTeamSelection({ ...selected, provider: 'gpt-lead' }, selected), false)
})
