# 安装与升级

插件已发布到 [npm](https://www.npmjs.com/package/dsh-subagent-hub)，也通过 [GitHub Releases](https://github.com/ccsert/dsh-subagent-hub/releases/latest) 提供固定归档。Team 与继承路由守卫需要 0.10.2 或更高版本。

已验证：**DSH Desktop 0.12.1 / `@deepseek-ai/dsh` 0.2.1-rc.2**。插件使用官方 Agent Presets、模型选择和会话投影接口。先在 DSH 中配置并验证要使用的模型供应商。

CLI 管理的独立 profile 可以使用 `dsh plugin --profile web add dsh-subagent-hub@0.11.2`。Desktop 用户应使用应用自身的插件安装/管理入口；若按下文手动修改 Desktop profile，先退出应用，完成后再启动。

## 1. 找到目标 profile

插件安装到 profile，不安装到某个普通聊天工作区。以 macOS Desktop 的 `web` profile 为例：

```bash
export DSH_PROFILE_DIR="$HOME/Library/Application Support/dsh-desktop/harness/profiles/web"
```

其他启动方式请使用自己的 profile 目录；其中应存在用于管理依赖的包清单和 profile patch。以下命令不会由 README 自动执行。

## 2. 安装插件包

推荐从 [v0.11.2 Release](https://github.com/ccsert/dsh-subagent-hub/releases/tag/v0.11.2) 的 Assets 下载 `dsh-subagent-hub-0.11.2.tgz`。同页提供 SHA-256 校验文件。

```bash
pnpm --dir "${DSH_PROFILE_DIR:?}" add /absolute/path/to/dsh-subagent-hub-0.11.2.tgz
```

从仓库检出安装时，包目录位于仓库的 `packages/subagent-hub`，不是仓库根目录：

```bash
git clone https://github.com/ccsert/dsh-subagent-hub.git
pnpm --dir "${DSH_PROFILE_DIR:?}" add file:/absolute/path/to/dsh-subagent-hub/packages/subagent-hub
```

开发者希望直接跟随本地检出时，可以在自己熟悉的包管理器中使用本地链接。归档安装更适合固定版本。

## 3. 注册 bundle

在目标 profile 的包清单中，向 `dsh.profile.bundles` **追加** `"dsh-subagent-hub"`。保留原有条目和其他配置。

也可以在确认 profile 路径后运行下面的追加脚本。它只追加缺少的 bundle 名称，保留其他 JSON 字段：

```bash
node --input-type=module - "${DSH_PROFILE_DIR:?}/package.json" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs'
const file = process.argv[2]
const manifest = JSON.parse(readFileSync(file, 'utf8'))
manifest.dsh ??= {}
manifest.dsh.profile ??= {}
manifest.dsh.profile.bundles ??= []
const bundles = manifest.dsh.profile.bundles
if (!Array.isArray(bundles)) throw new Error('dsh.profile.bundles must be an array')
if (!bundles.includes('dsh-subagent-hub')) bundles.push('dsh-subagent-hub')
writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n')
JS
```

**重启 DSH**，加载新增的 bundle 和客户端模块。

## 4. 在界面配置

打开 **设置 → 子代理中枢**，或 **Plugins → dsh-subagent-hub → 子代理中枢 → Configure**。

1. 从已有供应商的模型目录中添加路由，设置标签和备注。
2. 添加审查、测试、调研或自定义角色，为角色指定允许的路由。
3. 如希望由 Hub 维护官方模型和角色 allowlist，开启 **托管官方委派配置**。默认关闭。
4. 保存后核对反馈；开始一个**新会话**使用新增角色和工具参数。

新会话保持常用预设，例如 `standard`。主 agent 通过官方 `subagent` 工具派发，具名角色 id 为 `hub-agent-<id>`。

已有会话保留启动时的工具 schema。配置保存是实时的，插件 JavaScript 更新则需要重启。

## 手动配置

界面与 profile patch 写的是同一份配置。可参考[完整示例](../examples/subagent-hub.yml)，在目标 profile patch 中为 `subagent-hub` 增加 `config`。bundle 已插入对应 plugin 行，不必再插入重复实例。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `maxConcurrent` | `4` | 每个父会话的子 agent 并发上限；`0` 不限，官方全局容量仍生效 |
| `manageOfficialSettings` | `false` | 是否维护官方 allowlist |
| `routes` | `[]` | 已在 DSH 中配置的精确 provider/model 路由及说明 |
| `agents` | `[]` | 角色 id、description、instructions、可选 routes/needs/basePreset |

列表顺序保留在目录中；标签帮助主 agent 做选择。硬性路由限制来自角色的 `routes`，不实现自动模型回退。

托管会在 profile patch 中固定受管理预设的完整 config；升级 DSH 后应检查官方预设默认值的变化。

关闭托管会停止后续同步，**不会撤销之前写入的官方设置**。如果保持托管关闭，请自行维护官方工具的 `allowedAgentPresets` 和模型选择 allowlist；主 agent 只会被引导使用当前工具实际暴露的参数。

## 升级与回退

- 升级：下载新版本归档，在同一 profile 中执行 `pnpm add /absolute/path/to/new-version.tgz`，保留 bundle 名和配置，重启 DSH。
- 同架构回退：安装之前保存的 Release 归档，再重启。回退前保留自己的 profile 配置副本。
- v0.3.0 使用派生预设和自有派发工具，与 v0.4.0 起的架构不同。它保留在历史 tag 中，不作为当前版本的直接回退步骤。

## 卸载

先关闭托管，记录自己希望保留的模型配置。若启用过托管，在官方允许预设中移除需要卸载的 `hub-agent-*` 引用，保留其他条目；模型 allowlist 按自己的需要恢复。

再从 profile 的 bundle 列表移除 `dsh-subagent-hub`，移除自己的 `subagent-hub` patch 配置，卸载依赖并重启：

```bash
pnpm --dir "${DSH_PROFILE_DIR:?}" remove dsh-subagent-hub
```

## Team 与继承模型

非空全局路由表会在三个创建工具上检查继承模型；角色路由在此范围上收紧。`spawn_teammate` 的 fresh/fork 都继承 Lead，当前没有模型选择参数。不要用不存在的参数或切换 context 来选 MiniMax。见 [Team 模型路由](team-model-routing.md)。

## 排查

- **看不到设置入口**：核对依赖与 bundle 都位于正在运行的 profile，并已重启加载代码。
- **旧会话看不到新参数**：新建会话；已有 schema 不会在对话中途重建。
- **保存后仍在核对**：15 秒内未确认会结束等待，可点击只读的“重新核对”；它不会重复保存。
- **子会话显示“未确认”**：当前尚未获得可读取的模型请求投影；不会用主模型或角色配置填充。
- **派发被路由守卫拒绝**：核对角色允许的路由及父模型继承情况。需要硬限制时，保持角色的 `routes` 为明确的非空列表。

提交问题请附版本、复现步骤和脱敏错误信息，见[贡献指南](../CONTRIBUTING.md)。
