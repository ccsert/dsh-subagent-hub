# 安装

插件以 **bundle** 形式装进某个 profile。目标运行时：`@deepseek-ai/dsh` 0.2.1-rc.2（DSH Desktop 0.12.1）。
v0.4.0 不提供任何界面，也不注册派发工具；它只注册具名 Agent Preset、补一段 prompt、加一个路由守卫。

## 一次性步骤

1. 把包放进 profile 的依赖里（仓库检出用 `file:` 或 `link:`，发布后可用版本号）：

   ```bash
   cd "$DSH_PROFILE_DIR"           # 例如 ~/Library/Application Support/dsh-desktop/harness/profiles/web
   pnpm add file:/absolute/path/to/dsh-subagent-hub/packages/subagent-hub
   ```

2. 在 profile 的 `package.json` 里把 bundle 加进 `dsh.profile.bundles`：

   ```json
   { "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "...", "dsh-subagent-hub"] } } }
   ```

3. 在 profile 的 `cordis.patch.yml` 里配置路由与具名 agent（`subagent-hub` 这一行由 bundle 的 patch 插入，这里只补配置）：

   ```yaml
   - id: subagent-hub
     config:
       manageOfficialSettings: true   # 让本插件写官方 allowlist；默认 false
       routes:
         - { id: pro,   provider: <provider>, model: <model>, tags: [reasoning] }
         - { id: flash, provider: <provider>, model: <model>, tags: [fast, cheap] }
       agents:
         - id: reviewer
           description: Reviews a diff and reports findings
           instructions: Report findings only; do not edit files.
           routes: [pro]
   ```

4. 重启 DSH（替换已安装的包需要重启才能加载新的 JavaScript 模块）。

## 使用

- **新会话保持默认预设**（如 `standard`），不需要选任何特殊预设。
- 官方 `subagent` 工具会多出 `agent_preset` / `provider` / `model` / `reasoning_effort` 参数；system prompt 里多一段“具名 agent / 模型 → 标签”的选择目录。
- `agent_preset` 选具名 agent（`hub-agent-<id>`）；`routes` 限定的具名 agent 若被指定越界模型，派发前会被拒绝并在工具错误里给出允许列表。
- 不想让插件托管官方配置（`manageOfficialSettings: false`，默认）时：自己把 `allowedAgentPresets` 加到官方工具行，并在官方设置里启用子代理模型选择；插件会检测到参数已暴露并正常给出指引。

## 回滚

- 代码：`git checkout v0.3.0`；profile 依赖指回对应版本的包。
- profile：把 `cordis.patch.yml` 的 `subagent-hub` 配置换回 v0.3.0 字段（`maxConcurrent` / `routes` / `agents`），并把 `agent-preset-registry.default` 改回 `standard+hub`。
- 开启过 `manageOfficialSettings` 的话，删除 profile patch 里 `preset-standard`（及 `preset-ptc` / `preset-cordis`）的完整 config override 与 `subagent-model-selection-settings` 行。
