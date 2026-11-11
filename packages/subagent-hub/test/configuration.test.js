import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as configuration from '../lib/configuration.js'

const current = () => ({ routes: [{ id: 'fast', provider: 'p', model: 'm' }], agents: [{ id: 'reviewer', description: 'Review', routes: ['fast'] }], maxConcurrent: 4, showAgentOverview: true, manageOfficialSettings: false })
const mode = { agent: { session: { header: { agentPreset: configuration.CONFIGURATION_PRESET_ID } } } }
function fixture() {
  let value = current(), revision = 3, writes = 0
  const tools = new Map()
  const ctx = {
    subagentHub: {},
    settings: {
      writable: true,
      describe: () => [{ ns: 'subagent-hub', revision, value }],
      async mutate(ns, ops, expected) {
        assert.equal(ns, 'subagent-hub'); assert.equal(expected, revision)
        for (const op of ops) value = { ...value, [op.path[0]]: op.value }
        writes++; revision++
      },
    },
    tools: { register: tool => tools.set(tool.name, tool) },
    llm: { listProviders: () => [{ id: 'p', name: 'P' }], listModels: async () => [{ id: 'm', name: 'Model' }] },
    agentPresets: { list: async () => [{ id: 'standard' }, { id: 'hub-configurator' }, { id: 'hub-agent-reviewer' }] },
  }
  const source = readFileSync(new URL('../lib/configuration-assistant.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replaceAll('export ', '')
  const sandbox = { ...configuration, defineTool: value => value, setTimeout, clearTimeout }
  vm.runInNewContext(source + '\nglobalThis.applyTools = apply', sandbox)
  sandbox.applyTools(ctx)
  return { ctx, tools, get value() { return value }, get writes() { return writes } }
}

test('configuration changes preserve unrelated fields and validate cross-list references atomically', () => {
  const result = configuration.configurationChange(current(), { maxConcurrent: 2 })
  assert.deepEqual(result.value.agents, current().agents)
  assert.deepEqual(result.ops, [{ op: 'set', path: ['maxConcurrent'], value: 2 }])
  assert.throws(() => configuration.configurationChange(current(), { routes: [] }), /unknown route/)
  assert.throws(() => configuration.configurationChange(current(), { arbitraryPlugin: true }))
  assert.throws(() => configuration.configurationChange(current(), { agents: [{ id: 'Bad Name', description: 'Review' }] }))
})

test('the bundled mode is model neutral and exposes only its dedicated configuration tools', () => {
  const preset = configuration.configurationPreset()
  assert.equal(preset.id, 'hub-configurator')
  assert.equal(preset.plugins.some(row => /bash|tool-fs|subagent$/.test(row.name)), false)
  assert.match(preset.plugins[0].config.prefix, /never bind it to GPT/)
  assert.match(preset.plugins[0].config.prefix, /consultation or design request alone/)
})

test('configuration read returns the shared revision, catalog and valid role bases without credentials', async () => {
  const f = fixture()
  const result = await f.tools.get('hub_configuration_read').execute({}, mode)
  assert.equal(result.revision, 3)
  assert.equal(result.models.groups[0].models[0].id, 'm')
  assert.deepEqual(JSON.parse(JSON.stringify(result.basePresets)), [{ id: 'standard' }])
  assert.equal(f.writes, 0)
  await assert.rejects(f.tools.get('hub_configuration_read').execute({}, { agent: { session: { header: { agentPreset: 'standard' } } } }), /only available/)
})

test('role designs default to a preview, explicit saves update the same settings namespace', async () => {
  const f = fixture(), tool = f.tools.get('hub_configuration_update')
  const args = { expected_revision: 3, changes: { agents: [...current().agents, { id: 'builder', name: '功能开发', description: 'Implement changes', routes: ['fast'] }] } }
  assert.equal((await tool.execute(args, mode)).saved, false)
  assert.equal(f.writes, 0)
  const saved = await tool.execute({ ...args, dry_run: false }, mode)
  assert.equal(saved.saved, true); assert.equal(saved.revision, 4)
  assert.equal(f.value.agents[1].name, '功能开发')
  assert.deepEqual(f.value.routes, current().routes)
  await assert.rejects(tool.execute({ ...args, dry_run: false }, mode), /SETTINGS_CONFLICT/)
  assert.equal(f.writes, 1)
})

test('write boundaries reject unavailable models, invalid role bases and read-only profiles', async () => {
  const f = fixture(), tool = f.tools.get('hub_configuration_update')
  await assert.rejects(tool.execute({ expected_revision: 3, changes: { routes: [{ id: 'fast', provider: 'p', model: 'invented' }] }, dry_run: false }, mode), /not available/)
  await assert.rejects(tool.execute({ expected_revision: 3, changes: { agents: [{ id: 'role', description: 'Role', basePreset: 'hub-configurator' }] }, dry_run: false }, mode), /Base preset/)
  f.ctx.settings.writable = false
  await assert.rejects(tool.execute({ expected_revision: 3, changes: { maxConcurrent: 2 }, dry_run: false }, mode), /read-only/)
  assert.equal(f.writes, 0)
})
