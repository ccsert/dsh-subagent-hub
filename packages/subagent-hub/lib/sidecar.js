// Host-side plumbing for the opt-in official-settings mirror: the Hub-owned baseline sidecar,
// the one-file profile backup, and a specifier resolver that answers the mirror's two questions
// about a plugin row (is its package root mounted here, is the full subpath exported?).
//
// The decisions live in `preset-migration.js`; this module only touches node:fs and module
// resolution, so it never needs to run inside the pure test seam.

import { createRequire } from 'node:module'
import { copyFile, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { splitPackageSpec } from './preset-migration.js'

export const BASELINE_SUFFIX = '.subagent-hub-baseline.json'

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * Hub-owned sidecar with what the mirror last wrote per official preset, kept next to the profile
 * patch. A missing or unreadable file means "no baseline": the mirror then never rebases an
 * override and only repairs the narrow managed rows.
 * @param {string} documentPath the profile patch path (`configEditor.documentPath`)
 * @returns {{ get: (presetId: string) => Promise<object | undefined>, set: (presetId: string, record: object) => Promise<void> }}
 */
export function createBaselineStore(documentPath) {
  const path = `${documentPath}${BASELINE_SUFFIX}`
  let document
  const loadDocument = async () => {
    if (document !== undefined) return document
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8'))
      document = isPlainObject(parsed) && parsed.version === 1 && isPlainObject(parsed.presets)
        ? parsed
        : { version: 1, presets: {} }
    } catch {
      document = { version: 1, presets: {} }
    }
    return document
  }
  return {
    async get(presetId) {
      const loaded = await loadDocument()
      return loaded.presets[presetId]
    },
    async set(presetId, record) {
      const loaded = await loadDocument()
      loaded.presets[presetId] = record
      const temporary = `${path}.tmp-${process.pid}`
      await writeFile(temporary, `${JSON.stringify(loaded, null, 2)}\n`)
      await rename(temporary, path)
    },
  }
}

/**
 * Copy the profile patch to one timestamped backup before the mirror's first write. A profile
 * patch that does not exist yet has nothing to lose, so that case is a no-op.
 * @param {string} documentPath the profile patch path
 * @returns {Promise<void>}
 */
export async function backupProfilePatch(documentPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  try {
    await copyFile(documentPath, `${documentPath}.backup-${stamp}-subagent-hub`)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
}

/**
 * Resolve plugin specifiers as a SECONDARY heuristic next to the authoritative broken-preset
 * diagnostic. Only the running installation's own anchor (`profileContext.installAnchor`) may
 * decide that a specifier resolves or does not: a profile-local dependency, a development
 * symlink, or `import.meta.resolve` from wherever this plugin happens to be installed is not the
 * code the Loader mounts, so those anchors can at most make the answer ambiguous.
 *
 * Returns a resolved path when the install anchor resolves the specifier, `false` when the
 * install anchor resolves the package root but not the full specifier, and `'unknown'` when the
 * deciding anchor is anything else (or nothing resolves) — the mirror then reports the row
 * instead of silently certifying it as loadable.
 * @param {object | undefined} profileContext active profile context (carries `installAnchor`).
 * @param {string} documentPath profile patch path, used only as a non-deciding fallback anchor.
 * @returns {(specifier: string) => (string | false | 'unknown')}
 */
export function createResolveSpec(profileContext, documentPath) {
  const authoritative = []
  if (typeof profileContext?.installAnchor === 'string' && profileContext.installAnchor !== '') {
    try {
      authoritative.push(createRequire(profileContext.installAnchor))
    } catch {
      // no install anchor: every resolution below stays ambiguous
    }
  }
  const fallbacks = []
  if (typeof documentPath === 'string' && documentPath !== '') {
    try {
      fallbacks.push(createRequire(join(dirname(documentPath), 'package.json')))
    } catch {
      // an unusable anchor only removes one hint
    }
  }
  try {
    fallbacks.push(createRequire(import.meta.url))
  } catch {
    // an unusable anchor only removes one hint
  }
  const resolveFrom = (requires, specifier) => {
    for (const req of requires) {
      try {
        return req.resolve(specifier)
      } catch {
        // try the next anchor
      }
    }
    return undefined
  }
  const resolveEsm = (specifier) => {
    try {
      const resolved = import.meta.resolve?.(specifier)
      return typeof resolved === 'string' && resolved !== '' ? resolved : undefined
    } catch {
      return undefined
    }
  }
  /** Resolve one specifier and say whether the installation's own copy decided it. */
  const resolveOne = (specifier) => {
    const authoritativePath = resolveFrom(authoritative, specifier)
    if (authoritativePath !== undefined) return { path: authoritativePath, authoritative: true }
    const fallbackPath = resolveFrom(fallbacks, specifier) ?? resolveEsm(specifier)
    if (fallbackPath !== undefined) return { path: fallbackPath, authoritative: false }
    return undefined
  }
  return specifier => {
    const { root, subpath } = splitPackageSpec(specifier)
    const rootHit = resolveOne(root)
    if (rootHit === undefined) return 'unknown'
    // Only the installed copy may certify a row as loadable (or prove a subpath missing).
    if (!rootHit.authoritative) return 'unknown'
    if (subpath === null) return rootHit.path
    const fullHit = resolveOne(specifier)
    if (fullHit === undefined) return false
    // A dev symlink or profile-local copy resolving the subpath is ambiguous, never proof.
    return fullHit.authoritative ? fullHit.path : 'unknown'
  }
}
