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

Unpack the exact archive into a fresh temporary directory and point `HUB_PACKAGE_DIR` at its `package` directory to verify the installed bundle rather than the source checkout:

```bash
HUB_PACKAGE_DIR=/absolute/path/to/unpacked/package bash packages/subagent-hub/test/e2e/run.sh
HUB_PACKAGE_DIR=/absolute/path/to/unpacked/package HUB_ROUTED_TEAM_E2E=true bash packages/subagent-hub/test/e2e/run.sh
```

For version 0.13.0:

```bash
tar -tzf output/releases/dsh-subagent-hub-0.13.0.tgz
shasum -a 256 output/releases/dsh-subagent-hub-0.13.0.tgz
```

Write a standard checksum file containing the hash and archive basename so downloaders can verify it in the same directory:

```bash
shasum -a 256 -c dsh-subagent-hub-0.13.0.tgz.sha256
```

## Publish on GitHub

Commit the reviewed changes, push the branch, and wait for CI. Tag that exact commit. Create a Release using a prepared Markdown notes file and attach the checked archive, checksum, and optional Hero PNG. Verify the tag, release assets, and download checksums after upload.

Example for this release:

```bash
gh release create v0.13.0 \
  output/releases/dsh-subagent-hub-0.13.0.tgz \
  output/releases/dsh-subagent-hub-0.13.0.tgz.sha256 \
  docs/assets/hero.png \
  --verify-tag \
  --title "Subagent Hub v0.13.0" \
  --notes-file output/releases/release-notes.md
```

A Release inherits repository visibility. Creating a Release in a private repository does not make its source or downloads public. Changing repository visibility requires an explicit owner decision.

## Optional npm publication

Before npm publication, verify the owner account, an unused version, authentication, and the archive. Always specify the public npm registry explicitly; this machine’s default registry may be a private mirror. Existing name/version pairs are immutable. Publish the already checked archive; do not rebuild a different artifact between review and publication.

The account uses `auth-and-writes` two-factor authentication, so npm requires **staged publishing** and a proof-of-presence check; a token that bypasses 2FA only authorizes the upload. Staging needs npm 12, which the bundled CLI may not provide:

Use a Node.js version supported by that npm CLI (npm 12.2.1 requires Node `^22.22.2`, `^24.15.0` or `>=26`). A temporary tool runner can supply it without upgrading the user's normal DSH runtime.

```bash
npm whoami --registry=https://registry.npmjs.org
npx --registry=https://registry.npmjs.org --yes npm@12.2.1 --registry=https://registry.npmjs.org stage publish output/releases/dsh-subagent-hub-0.13.0.tgz
npx --registry=https://registry.npmjs.org --yes npm@12.2.1 --registry=https://registry.npmjs.org stage list          # copy the stage id
npx --registry=https://registry.npmjs.org --yes npm@12.2.1 --registry=https://registry.npmjs.org stage approve <stage-id>
```

`stage approve` prints `https://www.npmjs.com/auth/cli/<id>`; a maintainer must authenticate there, and the command then completes the release. An immediate approval usually returns `409` because the automated review is still running: wait a few minutes, then approve again with a fresh authentication. Never approve a `stage view` whose `shasum` differs from the checked archive.

After a successful registry publication, verify `npm view dsh-subagent-hub version dist-tags dist.integrity --registry=https://registry.npmjs.org`, download the published tarball and confirm its SHA-256 matches the GitHub Release asset, then update the documented installation channel. Never commit npm tokens or put them in release notes.
