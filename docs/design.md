# dsh-subagent-hub 设计

> 状态：决策已定，等待 S1 spike 验证前提（见 §6）。

## 1. 目标

| # | 能力 |
|---|---|
| G1 | 每个会话有一个子 agent 面板：树状展示所有后代子 agent、状态、所用 provider/model、token 用量 |
| G2 | 主 agent 自动为子 agent 选择 provider 与 model |
| G3 | 用户可自定义具名子 agent |
| G4 | 主 agent 可在会话中创建新的子 agent 定义 |

## 2. 原则

**不重写子 agent 运行时。** 执行一律走官方 `subagents.startActivation`；本插件只做定义、路由、策略与界面。

## 3. 已定决策

| # | 问题 | 决策 |
|---|---|---|
| D1 | 具名 agent 存在哪一层 | 三层：profile（全局）→ workspace → session，近的覆盖远的。定义来源抽象为 `DefinitionSource`，为日后中央服务按租户下发预留 |
| D2 | 主 agent 能改模型到什么程度 | 只能在具名 agent 声明的 `routes` 范围内选；无声明时落到全局路由表。不允许任意覆盖 |
| D3 | 用什么工具派发 | 注册自有工具 `delegate`，用 `tools.restrict` 隐藏官方 `subagent` / `subagent_fork`，避免模型面对两套近义工具 |
| D4 | 界面放哪 | v1 只做右侧栏标签页（`sidebar.right.pane.tab`）+ 设置页（`settings.section`）。不替换官方工具卡片渲染 |
| D5 | 是否纳入 agentTeams | v1 不纳入；v2 在面板中只读展示队友 |

## 4. 关键设计

### 4.1 能力标签路由

路由表条目：`{ provider, model, tags: ['fast'|'cheap'|'reasoning'|'vision'|'long-context'|…], costTier }`。

主 agent 调 `delegate` 时传 `agent`（具名）和/或 `needs: string[]`（标签），插件解析为具体模型：

1. 候选 = 具名 agent 的 `routes` ∩ 满足 `needs` 的路由（无具名 agent 则用全局路由表）
2. 按声明顺序过滤：凭据可用 → 未超预算
3. 取第一个；全部失败则拒绝并说明原因

模型永远不需要写出模型名，也就不会编造。

### 4.2 选择理由可观测

每次派发在工具结果 `meta` 中记录 `{ chosen, reason, fallbacks: [{route, rejectedBecause}] }`，面板直接展示。

### 4.3 会话内创建（`define_subagent`）

- 默认 scope = `session`，无需审批，会话结束即失效
- `promote` 为 workspace / profile 级时必须经 `approval.request`（等同于让模型写入长期系统提示词，是注入入口）

### 4.4 预算

每会话：最大并发子 agent 数、可选 token 上限。超限时 `delegate` 拒绝并把原因返回给主 agent。

### 4.5 面板数据

`subagents.listDescendants()` 不含模型信息。Host 端 Remote 服务 `subagentHub.watch(sessionId)` 合并：

- 树结构与状态：`listDescendants`
- 模型：子会话日志中的 `request/context`（`provider`/`model`）
- 用量：`assistant/message.usage` 累加

面板操作复用官方 Remote：`subagents.prompt`（发消息）、`subagents.interruptByParent`（打断）。

## 5. 包结构

```
packages/subagent-hub
├─ src/host/registry.ts   定义存储（三层合并）→ agentPresets.register
├─ src/host/router.ts     标签路由 + 回退 + 预算；systemPrompt 段落列出可用具名 agent
├─ src/host/tools.ts      delegate / define_subagent；tools.restrict 隐藏官方工具
├─ src/host/remote.ts     subagentHub.watch
└─ src/client/            右侧栏标签页 + 设置页
spikes/
└─ preset-vs-options/     S1
```

## 6. 前提验证（spike）

| # | 问题 | 判定 |
|---|---|---|
| S1 | `startActivation` 同时传 `agentPreset` 与 `agentOptions` 时，模型以谁为准？预设能否自带模型？ | 决定 D2 由谁执行：若 `agentOptions` 优先，插件自行强制范围；若预设锁死模型，需改为按路由动态生成预设 |
| S2 | `tools.restrict` 能否按会话隐藏官方 `subagent` 而不影响其他插件（如 workflow） | 决定 D3 可行性 |
| S3 | 子会话 `request/context` 能否在不恢复 agent 的情况下读取（只读查询） | 决定 4.5 的取数路径 |

## 7. 里程碑

| M | 内容 | 验收 |
|---|---|---|
| M0 | S1–S3 spike | 三项均有可复现结论 |
| M1 | registry + router + `delegate` | 主 agent 按标签派发，理由写入 meta |
| M2 | 右侧栏面板 | 树 + 模型 + 用量 + 发消息/打断 |
| M3 | `define_subagent` + 审批晋升 + 设置页 | 会话内创建、审批后持久化 |
| M4 | 预算 + 中央下发的 `DefinitionSource` 接口 | 超限拒绝；接口有桩实现 |
