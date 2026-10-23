# M0 spike：前提验证

> v0.4.0 已反转到官方机制：S2 / S2b 的派生预设方案不再使用（`+hub` 预设已删除），本文件作为 v1 的决策依据与运行时证据保留。
> v2 依赖的 `configEditor` / `allowedAgentPresets` / `agent_preset` / `tools/pre-execute` 结论已由 `bash test.sh` 的 e2e 覆盖。

**目标运行时**：DSH Desktop 0.12.1 / `@deepseek-ai/dsh` 0.2.1-rc.2（npm 全局 `dsh` CLI 同版本）。

> 本地 `deepseek-harness` checkout（0.1.6-alpha.x）比运行时老很多，接口已不同（例如 `persona`/`toolFilter` 已移入 Agent Preset）。
> **以装好的运行时为唯一依据**；代码阅读取自解包的 `app.asar`。

## 怎么跑

```sh
bash spikes/m0-runtime/run.sh   # 生成 spikes/m0-runtime/report.json
```

一次性 `DSH_HOME` + web profile + `--patch` 插入 spike 行；清除模型凭据环境变量，所以没有任何真实模型调用；不触碰用户 profile。

## 结论

| # | 问题 | 结论 | 证据 |
|---|---|---|---|
| S1 | `agentPreset` 与 `agentOptions` 同时传，谁决定模型？ | **正交**。预设只有 `id/name/description/order/plugins`，不含模型；模型 = 父 agent 路由 ⊕ `agentOptions`。只传预设时继承父模型 | `report.s1`：presetOnly → 父模型；presetAndOptions / optionsOnly → 请求的模型 |
| S2 | `tools.restrict` 能否按会话隐藏官方 `subagent`？ | **不能**（默认组合下）。standard 预设开启 `modelSelectionSettings`，`subagent` 注册在 agent 自身作用域，restrict 只管继承层，直接报 unknown global tool。`subagent_fork` 可以 | `report.s2.denySubagent` / `denySubagentFork` |
| S2b | 能否从 `standard` 派生一个去掉官方委派工具、加上自有工具的预设？ | **能**。`readDocument` + `entryListSchema` 解析 → 过滤 `@deepseek-ai/dsh-tool-subagent` 行 → `register`。派生预设与 standard 的差异恰好是 `-subagent -subagent_fork +hub_probe` | `report.s2b.onlyInStandard` / `onlyInDerived` |
| S3 | 不恢复 agent 能否拿到子会话模型？ | **能，且前端现成**。`dsh-api-session-controller` 注册持久投影 `modelSelection`（`lastUsed` 取自 `request/header`），客户端 `projectionsBySession[id].values.modelSelection` 可读；agent-team 面板已这样用 | 代码阅读（`model-selection-projection.js`） |

## 额外发现

- 官方 `dsh-client-ui-subagent` 已有会话页头的子 agent 目录：树、状态、token 用量、耗时、续聊、停止、右侧栏打开（资源 `dsh-resource://subagentchat/...`）。**缺的只有模型与路由理由**，且行内无扩展挂点。
- 官方 `subagent` 的 `agent_preset` 选项来自静态配置 `allowedAgentPresets`，不随注册表动态变化，因此会话内新建的具名 agent 无法走官方工具。
- 插入到 profile 的插件行加载时 `ready` 已触发，需直接在 `apply` 后启动。
