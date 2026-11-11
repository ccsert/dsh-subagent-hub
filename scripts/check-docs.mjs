import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'packages/subagent-hub/package.json'), 'utf8'))
const documents = ['README.md', 'README.en.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'packages/subagent-hub/README.md']
function collect(directory) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) collect(path)
    else if (extname(path) === '.md') documents.push(path)
  }
}
collect('docs')
const problems = []
let links = 0
for (const path of documents) {
  const text = readFileSync(resolve(root, path), 'utf8').replace(/```[\s\S]*?```/g, '')
  const targets = [...text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)].map(match => match[1])
  targets.push(...[...text.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]))
  for (let target of targets) {
    target = target.replace(/^<|>$/g, '')
    if (/^(?:https?:|mailto:|data:|#)/i.test(target)) continue
    target = decodeURIComponent(target.split('#')[0].split('?')[0])
    if (!target) continue
    const absolute = resolve(root, dirname(path), target)
    links++
    if (!existsSync(absolute)) problems.push(`${path}: missing ${target}`)
  }
}
for (const path of ['README.md', 'README.en.md', 'packages/subagent-hub/README.md']) {
  if (!readFileSync(resolve(root, path), 'utf8').includes(pkg.version)) problems.push(`${path}: missing package version ${pkg.version}`)
}
for (const path of ['hero.webp', 'settings.webp', 'role-editor.webp', 'models.webp', 'general.webp', 'model-badge.webp', 'model-badge-narrow.webp', 'overview-sidebar.webp', 'usage-filters.webp', 'usage-filtered.webp', 'task-board-sidebar.webp']) {
  const absolute = resolve(root, 'docs/assets', path)
  if (!existsSync(absolute) || statSync(absolute).size === 0) problems.push(`missing image: ${path}`)
  else if (statSync(absolute).size > 300_000) problems.push(`README asset exceeds 300 KB: ${path}`)
}
const screenshots = JSON.parse(readFileSync(resolve(root, 'packages/subagent-hub/screenshots.json'), 'utf8'))
assert.ok(Array.isArray(screenshots) && screenshots.length > 0, 'storefront screenshots must be a nonempty list')
for (const url of screenshots) {
  const prefix = `https://raw.githubusercontent.com/ccsert/dsh-subagent-hub/v${pkg.version}/`
  if (!url.startsWith(prefix)) problems.push(`storefront screenshot must pin v${pkg.version}: ${url}`)
  else if (!existsSync(resolve(root, url.slice(prefix.length)))) problems.push(`missing storefront screenshot: ${url}`)
}
assert.equal(readFileSync(resolve(root, 'LICENSE'), 'utf8'), readFileSync(resolve(root, 'packages/subagent-hub/LICENSE'), 'utf8'), 'packaged MIT license must match the root')
if (problems.length) throw new Error(problems.join('\n'))
console.log(`Documentation OK: ${documents.length} Markdown files, ${links} local links, version ${pkg.version}, README images and licenses.`)
