<p align="center">
  <img src="docs/assets/hero.webp" alt="Subagent Hub — Named roles. Clear routes. Visible models." width="100%">
</p>

<p align="center">
  <a href="https://github.com/ccsert/dsh-subagent-hub/releases/tag/v0.10.1"><img src="https://img.shields.io/badge/version-0.10.1-66c8ab" alt="Version 0.10.1"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <a href="docs/install.md"><img src="https://img.shields.io/badge/DSH_Desktop-0.12.1-7087ad" alt="Tested with DSH Desktop 0.12.1"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/verified-87_unit_%2B_23_runtime-66c8ab" alt="87 unit tests and 23 runtime assertions verified"></a>
</p>

<p align="center"><a href="README.md">简体中文</a> · <b>English</b></p>

# Subagent Hub

**Roles, model selection context, and route boundaries for official DeepSeek Harness subagents.** Give the main agent useful reviewer, tester, or research roles; manage allowed models in Settings; inspect the most recent model request from a child conversation.

Uses official `subagent` / `subagent_fork` dispatch, Agent Presets, and conversation UI. Keep your existing main-agent preset.

[Install](docs/install.md) · [Download a release](https://github.com/ccsert/dsh-subagent-hub/releases/latest) · [Configuration example](examples/subagent-hub.yml) · [Changelog](CHANGELOG.md) · [Contribute](CONTRIBUTING.md)

## Features

| Feature | Behavior |
|---|---|
| **Named roles** | Register official `hub-agent-<id>` presets and dispatch with `agent_preset` |
| **Model selection catalog** | Provide configured routes, capabilities, purposes, and role instructions to the main agent |
| **Route guard** | Reject explicit or inherited routes outside a named role's allowed `routes` before dispatch |
| **Per-session concurrency** | Limit child agents in each parent session, alongside DSH's global capacity |
| **Native settings form** | Edit models, roles, tags, and management options in **Settings → Subagent Hub** |
| **Request model visibility** | Read the latest provider/model from the child header; expand for full IDs and recorded reasoning effort |

## Screenshots

**Models and named agents**

![Actual configuration component with demo models and named agents](docs/assets/settings.webp)

**The latest child request**

![Child header with full provider, model ID and reasoning effort](docs/assets/model-badge.webp)

These are the actual plugin components rendered with demo data. They contain no user profile, private conversation, or credentials. See [screenshot provenance](docs/screenshots.md) for full-size and narrow views. The Hero was generated with [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen).

## Quick start

Tested with **DSH Desktop 0.12.1 / `@deepseek-ai/dsh` 0.2.1-rc.2**. Configure a working model provider in DSH first.

1. Download `dsh-subagent-hub-0.10.1.tgz` from [Releases](https://github.com/ccsert/dsh-subagent-hub/releases/latest).
2. Install it from the target profile directory:

   ```bash
   pnpm add /absolute/path/to/dsh-subagent-hub-0.10.1.tgz
   ```

3. **Append** `"dsh-subagent-hub"` to `dsh.profile.bundles` in that profile's package manifest. Preserve existing bundles and restart DSH to load the plugin code.
4. Open **Settings → Subagent Hub**, select models already available in your DSH, and add a role. Enable **Manage the official delegation settings** if you want Hub to synchronize the official allowlists. Save, then start a new conversation.

Git checkout installation, profile locations, upgrades, and removal are covered in the [installation guide](docs/install.md). GitHub release archives are the current distribution channel; npm registry publishing is not enabled yet.

## Minimal configuration

The settings form and profile patch edit the same configuration. The provider/model below must already be available in your DSH:

```yaml
- id: subagent-hub
  config:
    maxConcurrent: 4
    manageOfficialSettings: true
    routes:
      - id: flash
        provider: deepseek-official
        model: deepseek-flash
        tags: [fast, cheap]
    agents:
      - id: reviewer
        description: Reviews changes and reports concrete findings
        instructions: Read the diff, report actionable findings, and do not edit files.
        routes: [flash]
```

Try: **“Use reviewer to review the current changes. Report concrete findings without editing files.”**

The main agent selects a role based on the task and catalog. When the official tool exposes the parameter, `agent_preset: hub-agent-reviewer` selects this role. The route guard checks the delegation before dispatch.

## Behavior to keep in mind

- **Tags guide decisions.** Tags such as `fast`, `reasoning`, or `free` are maintained by you. Use a role's `routes` for a hard route boundary. Tags do not verify pricing or implement automatic fallback.
- **The guard runs before dispatch.** Model rewrites performed by other plugins during a later child request are outside this guard. Check those plugins when combining route policies.
- **Fork follows official capabilities.** The target fork provider does not support an independent `agent_preset`; named roles use `subagent`.
- **Managed settings are opt-in.** `manageOfficialSettings` defaults to `false`. Enabling it synchronizes official allowlists. Disabling it stops syncing and retains settings already written.
- **Existing conversations keep their tool schema.** Saved configuration is live; use a new conversation for newly added roles or tool parameters. Plugin code upgrades require a DSH restart.
- **The model badge shows request history.** `lastUsed` identifies the latest request; a different `next` selection is shown separately. A ready empty history says “No request yet”; unavailable data says “Unconfirmed.” A request record does not establish success or billing, and forked history may include inherited requests.

## Development

```bash
npm ci
npm run test:unit       # no model account required
npm run docs:check      # local documentation links, assets, and metadata
bash test.sh           # real DSH integration in a temporary DSH_HOME
npm run pack:check     # inspect the distributable archive
```

This release is verified by **87 unit tests and 23 real-runtime assertions**. Integration uses scripted model streams and makes no external model calls. CI runs unit, documentation, and package checks. See the [settings acceptance record](docs/ui-acceptance.md) and [model badge acceptance record](docs/model-badge-acceptance.md) for scope and limitations.

Issues and PRs are welcome. Read [CONTRIBUTING](CONTRIBUTING.md), the [design notes](docs/design.md), and the [release guide](docs/releasing.md). The previous v0.3.0 architecture remains available at its tag.

[MIT License](LICENSE) · Maintained by [ccsert](https://github.com/ccsert)
