import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fingerprint, mergeLayers, normalizeDefinition, readWorkspaceDefinitions } from '../lib/definitions.js'

test('normalize validates id and description', () => {
  assert.throws(() => normalizeDefinition({ id: 'Bad Id', description: 'x' }, 's'), /id must match/)
  assert.throws(() => normalizeDefinition({ id: 'ok' }, 's'), /needs a description/)
  assert.deepEqual(normalizeDefinition({ id: 'ok', description: ' d ' }, 's'), {
    id: 'ok', description: 'd', instructions: '', routes: undefined, needs: undefined, basePreset: 'standard', source: 's',
  })
})

test('workspace files load; a broken file is reported without hiding the rest', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'hub-defs-'))
  mkdirSync(join(cwd, '.dsh/subagents'), { recursive: true })
  writeFileSync(join(cwd, '.dsh/subagents/a.yaml'), 'id: reviewer\ndescription: Reviews diffs\nneeds: [reasoning]\n')
  writeFileSync(join(cwd, '.dsh/subagents/b.yml'), '- id: scout\n  description: Finds files\n- id: writer\n  description: Writes docs\n')
  writeFileSync(join(cwd, '.dsh/subagents/c.yaml'), 'id: 42\n')
  const { agents, errors } = readWorkspaceDefinitions(cwd, '.dsh/subagents')
  assert.deepEqual(agents.map(agent => agent.id), ['reviewer', 'scout', 'writer'])
  assert.equal(errors.length, 1)
  assert.deepEqual(readWorkspaceDefinitions(join(cwd, 'missing'), '.dsh/subagents'), { agents: [], errors: [] })
})

test('nearer layers override by id', () => {
  const merged = mergeLayers([{ id: 'a', description: 'profile' }, { id: 'b', description: 'profile' }], [{ id: 'a', description: 'workspace' }])
  assert.deepEqual(merged.map(agent => [agent.id, agent.description]), [['a', 'workspace'], ['b', 'profile']])
})

test('fingerprint changes with instructions but not description', () => {
  const base = { basePreset: 'standard', instructions: 'x', description: 'one' }
  assert.equal(fingerprint(base), fingerprint({ ...base, description: 'two' }))
  assert.notEqual(fingerprint(base), fingerprint({ ...base, instructions: 'y' }))
})
