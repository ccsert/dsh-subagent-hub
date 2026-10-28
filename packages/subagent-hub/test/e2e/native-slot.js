// Integration with the actual installed Desktop/SDK list-slot consumer, not a fake
// slots.register implementation. No renderer connection, profile writes, or model calls.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function desktopRenderer(archive) {
  const rawFs = process.versions.electron ? require('original-fs') : require('node:fs')
  const fd = rawFs.openSync(archive, 'r')
  try {
    const prefix = Buffer.alloc(16)
    rawFs.readSync(fd, prefix, 0, 16, 0)
    const size = prefix.readUInt32LE(4)
    const bytes = Buffer.alloc(prefix.readUInt32LE(12))
    rawFs.readSync(fd, bytes, 0, bytes.length, 16)
    const header = JSON.parse(bytes.toString())
    const root = header.files.node_modules.files['@deepseek-ai'].files['dsh-web-frontend'].files.dist.files.assets.files
    const name = Object.keys(root).find(name => /^index-.*\.js$/.test(name))
    assert.ok(name, 'Desktop renderer entry is present')
    const entry = root[name]
    const relative = `node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/${name}`
    if (entry.unpacked) return rawFs.readFileSync(path.join(archive + '.unpacked', relative), 'utf8')
    const data = Buffer.alloc(entry.size)
    rawFs.readSync(fd, data, 0, data.length, 8 + size + Number(entry.offset))
    return data.toString()
  } finally { rawFs.closeSync(fd) }
}
function installedRenderer() {
  const archive = process.env.DSH_DESKTOP_ASAR ?? '/Applications/DSH Desktop.app/Contents/Resources/app.asar'
  if (existsSync(archive)) return { source: desktopRenderer(archive), kind: 'installed DSH Desktop' }
  const assets = new URL('../../node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/', import.meta.url)
  const name = readdirSync(assets).find(name => /^index-.*\.js$/.test(name))
  assert.ok(name, 'Installed SDK renderer entry is present')
  return { source: readFileSync(new URL(name, assets), 'utf8'), kind: 'installed DSH SDK' }
}
function actualListRegister(source) {
  const needle = source.indexOf('requires options.id')
  assert.ok(needle >= 0, 'Renderer list-slot validator is present')
  const matches = [...source.slice(0, needle).matchAll(/\bregister\s*\([^)]*\)\s*\{/g)]
  const start = matches.at(-1)?.index
  assert.ok(start !== undefined, 'Native registration method is present')
  // Let the JS parser find the method boundary: braces inside native error
  // templates must not be mistaken for the end of the function.
  for (let end = source.indexOf('}', needle); end >= 0 && end < start + 20000; end = source.indexOf('}', end + 1)) {
    let script
    try { script = new vm.Script('({' + source.slice(start, end + 1) + '}).register') }
    catch (error) { if (error.name === 'SyntaxError') continue; throw error }
    return script.runInNewContext()
  }
  throw new Error('Native register method boundary not found')
}

const renderer = installedRenderer()
const register = actualListRegister(renderer.source)
const slot = 'conversation.session.header.utilities'
const record = { spec: { kind: 'list', scope: 'session' }, entries: [] }
const registry = { records: new Map([[slot, record]]), markDirty() {}, releaseEntry() {} }
// The old wrong option really fails in this Desktop consumer.
assert.throws(() => register.call(registry, { name: slot, key: 'old-badge' }, () => null), /requires options\.id/)
let entry
vm.runInNewContext(readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(value) { entry = value } } },
})
const client = entry.factory(id => id === 'react' ? React : {})
const route = { provider: 'minimax', model: 'MiniMax-M3.1-Flash' }
const face = value => ({ getSnapshot: () => value, subscribe: () => () => {} })
const session = { ...face({ subagent: { address: { parentSessionId: 'lead', childSessionId: 'member', mode: 'continuable' } } }),
  projections: { faceOf: () => face({ lastUsed: route, next: route }) } }
const t = (key, args = {}) => key + Object.values(args).join(' ')
const scope = {
  sessions: { binding: id => id === 'member' ? { session } : undefined },
  slots: { inject(name, callback) { assert.equal(name, slot); return callback() },
    register: (options, component) => register.call(registry, options, component) },
}
assert.doesNotThrow(() => client.registerModelBadge({ inject(_names, callback) { return callback(scope) } }, t),
  'The Hub badge must be accepted by the real Desktop list-slot consumer')
assert.equal(record.entries.length, 1, 'the native registry holds the model badge')
const contribution = record.entries[0]
assert.equal(contribution.options.id, 'subagent-hub-model')
const props = contribution.inject('member')
const html = renderToStaticMarkup(contribution.component(props))
assert.match(html, /sah-runtime-model/)
assert.match(html, /minimax · MiniMax-M3\.1-Flash/)
assert.match(html, /modelBadge.recorded/)
const dispose = register.call(registry, { name: slot, id: 'unrelated' }, () => null)
dispose()
assert.equal(record.entries.length, 1, 'the model badge survives unrelated cleanup')
// The same real consumer with a Host catalog: the summary is named, the panel keeps the ids.
const namedRecord = { spec: { kind: 'list', scope: 'session' }, entries: [] }
const namedRegistry = { records: new Map([[slot, namedRecord]]), markDirty() {}, releaseEntry() {} }
const namedScope = {
  sessions: scope.sessions,
  slots: { inject(name, callback) { assert.equal(name, slot); return callback() },
    register: (options, component) => register.call(namedRegistry, options, component) },
}
const catalogGroups = [{ id: 'minimax', name: 'MiniMax', models: [{ id: 'MiniMax-M3.1-Flash', name: 'M3.1-Flash · MiniMax Code' }] }]
const names = { getSnapshot: () => ({ status: 'ready', groups: catalogGroups }), subscribe: () => () => {}, load: () => {} }
client.registerModelBadge({ inject(_names, callback) { return callback(namedScope) }, remote: {} }, t, names)
const namedContribution = namedRecord.entries[0]
const namedHTML = renderToStaticMarkup(namedContribution.component(namedContribution.inject('member')))
assert.match(namedHTML.match(/<summary[\s\S]*?<\/summary>/)[0], /M3\.1-Flash · MiniMax Code/)
assert.doesNotMatch(namedHTML.match(/<summary[\s\S]*?<\/summary>/)[0], /MiniMax-M3\.1-Flash/)
assert.match(namedHTML, /<dd>minimax<\/dd>/, 'the panel keeps the exact provider')
assert.match(namedHTML, /<dd>MiniMax-M3\.1-Flash<\/dd>/, 'the panel keeps the exact model id')
const overviewSlot = 'conversation.session.header.actions'
const overviewRecord = { spec: { kind: 'list', scope: 'session' }, entries: [] }
registry.records.set(overviewSlot, overviewRecord)
const overviewScope = {
  sessions: {}, uiWorkspace: { openSession() {} },
  slots: { inject(name, callback) { assert.equal(name, overviewSlot); return callback() },
    register: (options, component) => register.call(registry, options, component) },
}
client.registerOverview({ configForms: { get: () => face({ status: 'ready', value: { showAgentOverview: true } }) },
  inject(_names, callback) { return callback(overviewScope) } }, t)
assert.equal(overviewRecord.entries.length, 1)
const overviewContribution = overviewRecord.entries[0]
assert.equal(overviewContribution.options.id, 'subagent-hub-overview')
const overviewHTML = renderToStaticMarkup(overviewContribution.component({
  ...overviewContribution.inject('lead'), sessionId: 'lead',
  useSession: selector => selector({}), useSessions: selector => selector({ byId: {}, projectionsBySession: {} }),
  useSessionStatus: selector => selector(new Map()),
}))
assert.match(overviewHTML, /sah-overview-trigger/)
assert.match(overviewHTML, /aria-haspopup="dialog"/)
console.log(`Native slot regression passed against ${renderer.kind}: model badge and agent overview.`)
