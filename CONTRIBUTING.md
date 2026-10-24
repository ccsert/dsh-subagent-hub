# Contributing

Thanks for helping improve Subagent Hub. Small, focused fixes and reproducible bug reports are welcome.

## Local setup

Use Node.js 24 and install the repository development dependencies:

```bash
npm ci
npm run test:unit
npm run docs:check
npm run pack:check
```

The package lives in [packages/subagent-hub](packages/subagent-hub). Its JavaScript is checked in directly. The client is a DSH module-loader entry; React is supplied by DSH at runtime. Installing the repository root as a profile bundle is not supported.

## Runtime integration

```bash
bash test.sh
```

The full suite requires a compatible installed DSH runtime. See [the e2e runner](packages/subagent-hub/test/e2e/run.sh) for discovery and override variables. It creates an isolated temporary `DSH_HOME`, registers the real bundle, exercises official subagent dispatch, and intercepts the model stream. No production profile or model account is used.

Unit tests are suitable for CI without a DSH install. This release has 102 unit tests and 31 runtime assertions; the CI workflow runs units, documentation, and package checks. Runtime assertions are a separate local gate, not a claim that CI contacted real model providers.

The full runtime gate includes independent delegation, the opt-in native Team bundle, and a native slot-consumer regression. The latter reads the installed Desktop renderer (or SDK fallback) and checks the real list registration contract without controlling the user window. See [Team routing](docs/team-model-routing.md) for schema, inheritance, and rejected-member checks.

## Scope and design

- Keep official dispatch and lifecycle ownership with DSH.
- Use official Agent Presets and public client slots/projections.
- Route tags are guidance. The global child route list guards native creation tools, and a named agent's routes can narrow it further.
- Read model information from request records; preserve unknown states.
- Keep saved configuration free of transient editor metadata.
- Preserve other profile fields when synchronizing managed settings.

Read [the design notes](docs/design.md) before changing these seams. Run the checks that cover the behavior you change; add regressions for meaningful failures rather than visual implementation details.

## Screenshots

The current screenshots use actual client components and demo data. Rebuild their isolated fixtures with:

```bash
node packages/subagent-hub/test/browser/render-fixture.mjs
node packages/subagent-hub/test/browser/render-model-fixture.mjs
```

Serve the generated files under `output/playwright/` on localhost and capture them with Playwright. Avoid real account details or private conversations. Keep captions and [asset provenance](docs/assets/README.md) accurate, and optimize README assets before committing them.

## Reporting a bug

Use [Issues](https://github.com/ccsert/dsh-subagent-hub/issues) and include:

- Hub, DSH Desktop, and DSH runtime versions.
- What you did, what happened, and what you expected.
- Whether the problem affects a new or existing conversation.
- A minimal configuration and error message with credentials removed.

For model-selection issues, distinguish a configured route, a planned next selection, and a recorded request. Never include API keys, account tokens, or an unreviewed profile dump.

## Pull requests and releases

Explain the concrete behavior change and relevant validation. Keep runtime changes separate from unrelated cleanup. [The release guide](docs/releasing.md) describes versioning, package inspection, checksums, and GitHub Release assets.

Contributions are licensed under the project's [MIT License](LICENSE).
