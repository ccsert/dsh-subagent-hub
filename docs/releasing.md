# Release guide

The package is distributed through npm and GitHub Releases with an npm-format archive and SHA-256 checksum. The package does not require a build step. Publish the exact checked archive to both channels; ordinary npm publication requires its account authentication challenge.

## Before cutting a version

1. Update the version in [the package manifest](../packages/subagent-hub/package.json), README badges, archive examples, and [CHANGELOG](../CHANGELOG.md).
2. Keep the root and packaged MIT licenses identical. Review installation instructions and package-facing absolute documentation links.
3. Update screenshots from actual components when their appearance changes. Record image generation and demo-data provenance in [assets](assets/README.md), and keep the [storefront screenshot declaration](../packages/subagent-hub/screenshots.json) aligned. This monorepo declaration uses GitHub-hosted absolute image URLs because relative paths cannot leave the plugin directory.
4. Run the release gates:

   ```bash
   npm ci
   npm run test:unit
   npm run docs:check
   npm run pack:check
   bash test.sh
   git diff --check
   ```

CI runs the first three checks after dependency installation. The full runtime suite needs an installed compatible DSH and uses a temporary profile with scripted model streams. State clearly which gates ran.

## Build and inspect the archive

From the repository root:

```bash
mkdir -p output/releases
npm pack ./packages/subagent-hub --ignore-scripts --pack-destination output/releases
```

Inspect the resulting file list and checksum before uploading. The archive should contain runtime code, locale files, the bundle patch, package metadata, a package README, and MIT license. It should not contain tests, generated fixture HTML, profile data, documentation screenshots, or node_modules.

For version 0.10.2:

```bash
tar -tzf output/releases/dsh-subagent-hub-0.10.2.tgz
shasum -a 256 output/releases/dsh-subagent-hub-0.10.2.tgz
```

Write a standard checksum file containing the hash and archive basename so downloaders can verify it in the same directory:

```bash
shasum -a 256 -c dsh-subagent-hub-0.10.2.tgz.sha256
```

## Publish on GitHub

Commit the reviewed changes, push the branch, and wait for CI. Tag that exact commit. Create a Release using a prepared Markdown notes file and attach the checked archive, checksum, and optional Hero PNG. Verify the tag, release assets, and download checksums after upload.

Example for this release:

```bash
gh release create v0.10.2 \
  output/releases/dsh-subagent-hub-0.10.2.tgz \
  output/releases/dsh-subagent-hub-0.10.2.tgz.sha256 \
  docs/assets/hero.png \
  --verify-tag \
  --title "Subagent Hub v0.10.2" \
  --notes-file output/releases/release-notes.md
```

A Release inherits repository visibility. Creating a Release in a private repository does not make its source or downloads public. Changing repository visibility requires an explicit owner decision.

## Optional npm publication

Before npm publication, verify the owner account, an unused version, authentication, and the archive. Existing name/version pairs are immutable. Publish the already checked archive; do not rebuild a different artifact between review and publication.

```bash
npm whoami
npm publish output/releases/dsh-subagent-hub-0.10.2.tgz --access public
```

After a successful registry publication, verify `npm view dsh-subagent-hub version dist.integrity` and update the documented installation channel. Never commit npm tokens or put them in release notes.
