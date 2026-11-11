import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEAM_TOOL_PACKAGE, teamRoleEntryIds, teamRoleConfig } from '../lib/official-settings.js'
import { syncOfficialMirror } from '../lib/mirror.js'

const entry = { options: { id: 'renamed-team', name: TEAM_TOOL_PACKAGE, config: { freshProvider: 'spawn', forkProvider: 'fork', allowedAgentPresets: ['foreign', 'hub-agent-old'] } } }
const schema = { uid: 1, refs: { 1: { type: 'object', dict: { allowedAgentPresets: 2 } }, 2: { type: 'array' } } }

test('only a declared Team settings field enables role mirroring, independently of version or row id', () => {
  assert.deepEqual(teamRoleEntryIds([entry], []), [])
  assert.deepEqual(teamRoleEntryIds([entry], [{ ns: 'renamed-team', value: { allowedAgentPresets: [] } }]), [])
  assert.deepEqual(teamRoleEntryIds([entry], [{ ns: 'renamed-team', schema }]), ['renamed-team'])
  assert.deepEqual(teamRoleEntryIds([entry], [{ ns: 'other', schema }]), [])
  assert.deepEqual(teamRoleEntryIds([{ options: { ...entry.options, name: 'foreign-plugin' } }], [{ ns: 'renamed-team', schema }]), [])
})

test('Team role updates preserve foreign roles and backend fields, remove obsolete Hub roles and settle idempotently', () => {
  const initial = entry.options.config
  const next = teamRoleConfig(initial, ['hub-agent-builder'])
  assert.deepEqual(next.allowedAgentPresets, ['foreign', 'hub-agent-builder'])
  assert.equal(next.freshProvider, 'spawn')
  assert.equal(next.forkProvider, 'fork')
  assert.equal(teamRoleConfig(next, ['hub-agent-builder']), next)
  assert.deepEqual(teamRoleConfig(next, []).allowedAgentPresets, ['foreign'])
  assert.deepEqual(teamRoleConfig({ allowedAgentPresets: ['hub-agent-old'] }, []), { allowedAgentPresets: [] })
  assert.deepEqual(initial.allowedAgentPresets, ['foreign', 'hub-agent-old'])
})

test('mirror never edits legacy Team configuration and backs up a supported Team write only once', async () => {
  const current = { options: { ...entry.options, config: { ...entry.options.config } } }
  let backups = 0
  let writes = 0
  const editor = {
    entries: () => [current],
    configuration: () => [{ entry: current, inherited: current.options.config }],
    async edit(target, change) { writes++; target.options.config = change(target.options.config, target.options.config) },
  }
  const options = { editor, routes: new Map(), presetIds: ['hub-agent-builder'], backup: () => backups++, wait: async () => {} }
  await syncOfficialMirror(options)
  assert.equal(writes, 0)
  assert.equal(backups, 0)
  const report = await syncOfficialMirror({ ...options, teamRoleIds: ['renamed-team'] })
  assert.deepEqual(report.teamPresets, ['renamed-team'])
  assert.equal(writes, 1)
  assert.equal(backups, 1)
  assert.deepEqual(current.options.config.allowedAgentPresets, ['foreign', 'hub-agent-builder'])
  const second = await syncOfficialMirror({ ...options, teamRoleIds: ['renamed-team'] })
  assert.deepEqual(second.teamPresets, [])
  assert.equal(writes, 1)
  assert.equal(backups, 1)
})
