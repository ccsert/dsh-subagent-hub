import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = resolve(root, 'packages/subagent-hub')
const pkg = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'))
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: directory, encoding: 'utf8' })
if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'npm pack failed')
const [report] = JSON.parse(result.stdout)
assert.equal(report.name, pkg.name)
assert.equal(report.version, pkg.version)
const paths = new Set(report.files.map(file => file.path))
for (const path of ['package.json', 'README.md', 'LICENSE', 'cordis.patch.yml', 'icon.svg', 'lib/index.js', 'lib/client.js', 'locale/en.json', 'locale/zh.json']) {
  assert.ok(paths.has(path), `archive is missing ${path}`)
}
for (const path of paths) {
  assert.ok(path.startsWith('lib/') || path.startsWith('locale/') || ['package.json', 'README.md', 'LICENSE', 'cordis.patch.yml', 'icon.svg'].includes(path), `unexpected archive file: ${path}`)
  assert.ok(!/(^|\/)(?:node_modules|test|output|\.env|\.git)(\/|$)/.test(path), `development or private file: ${path}`)
}
assert.equal(readFileSync(resolve(root, 'LICENSE'), 'utf8'), readFileSync(resolve(directory, 'LICENSE'), 'utf8'))
assert.equal(pkg.license, 'MIT')
assert.equal(pkg.icon, './icon.svg', 'manifest icon points at the packaged SVG')
assert.ok(report.unpackedSize < 2 * 1024 * 1024, 'unexpectedly large runtime package')
console.log(`Package OK: ${report.filename}; ${report.files.length} files; ${report.size} bytes compressed; ${report.unpackedSize} bytes unpacked.`)
