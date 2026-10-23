# 安装

插件以 **bundle** 形式装进某个 profile。目标运行时：`@deepseek-ai/dsh` 0.2.1-rc.2（DSH Desktop 0.12.1）。

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

3. 在 profile 的 `cordis.patch.yml` 里配置路由（`dsh-subagent-hub` 这一行由 bundle 的 patch 插入，这里只补配置）：

   ```yaml
   - id: subagent-hub
     config:
       maxConcurrent: 4
       routes:
         - { id: pro,   provider: deepseek-official, model: deepseek-v4-pro, tags: [reasoning] }
         - { id: flash, provider: deepseek-official, model: deepseek-flash,  tags: [fast, cheap] }
       agents:
         - id: reviewer
           description: Reviews a diff and reports findings
           instructions: Report findings only; do not edit files.
           routes: [pro]
   ```

4. 重启 DSH（替换已安装的包需要重启才能加载新的 JavaScript 模块）。

## 使用

- **新会话选择带 “+ Hub” 的预设**（例如 `standard+hub`）。只有这种预设里才有 `delegate` / `define_subagent`，官方 `subagent` 工具被替换掉了。
- 右侧栏「+」→「子代理路由」查看每次派发用的模型与理由。
- 插件页 → `dsh-subagent-hub` 那一行 → 配置卡片里编辑路由与具名 agent。

## 与人共存

- `dsh-subagent-default-model`：兼容，但它对所有子代理的连接失败故障转移会突破具名 agent 的路由约束；侧栏页会以「实际运行：…」标出。
- `dsh-subagent-library`：同样提供 `delegate`，建议只启用其一，或改本插件的 `toolName`。

## 回滚

从 `dsh.profile.bundles` 移除 `dsh-subagent-hub`、删掉第 3 步的配置，然后重启。
