# dsh-subagent-hub 设计

> 状态：M4 完成（单元 34 项 + 真实运行时 e2e 24 项）。M0–M4 全部达成，剩余是产品化（真实 profile 安装、界面人工验收、发布）。M0 完成（结论见 [`spikes/m0-runtime/README.md`](../spikes/m0-runtime/README.md)），D3/D4 已据此修订。
> 目标运行时：`@deepseek-ai/dsh` 0.2.1-rc.2（DSH Desktop 0.12.1）。

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
| D1 | 具名 agent 存在哪一层 | 四层：profile → workspace → 外部 source → session，近的覆盖远的。外部 source 是中央服务下发的挂点 |
| D2 | 主 agent 能改模型到什么程度 | 只能在具名 agent 声明的 `routes` 范围内选；无声明时落到全局路由表。不允许任意覆盖 |
| D3 | 用什么工具派发 | 自有工具 `delegate`。~~用 `tools.restrict` 隐藏官方工具~~（S2：默认组合下 `subagent` 注册在 agent 自身作用域，藏不掉）。**改为派生预设**：启动时读取每个内置预设（standard / ptc / cordis），去掉 `@deepseek-ai/dsh-tool-subagent` 行、加上本插件的工具行，注册为 `<id>+hub`（S2b 已验证）。用户在新会话选 `standard+hub` 即启用；官方预设保持原样 |
| D4 | 界面放哪 | 官方 `dsh-client-ui-subagent` 已提供页头子 agent 目录（树/状态/用量/耗时/续聊/停止），**不重做**。v1 只补它缺的：右侧栏标签页“路由”视图，展示每个子 agent 的模型（`modelSelection` 投影）、选择理由、费用汇总，行内跳转复用官方 `subagentchat` 资源。另加设置页 |
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

全部在客户端完成，不需要 Host Remote 服务（S3）：

- 树结构与状态：官方 `subagents.listDescendants` / 现有 session store
- 模型：持久投影 `projectionsBySession[childId].values.modelSelection.lastUsed`
- 选择理由：`delegate` 工具结果的 `meta`
- 用量：官方目录已有的 token 统计；本插件只做会话汇总与费用换算

操作（续聊、停止、打开对话）全部交给官方 `subagentchat` 资源与 Remote，不重复实现。

### 4.6 子 agent 的模型由谁决定

预设与模型正交（S1）：预设只决定人设和工具，模型 = 父路由 ⊕ `agentOptions`。因此具名 agent 的模型约束（D2）完全由 `delegate` 在计算 `agentOptions` 时执行，不依赖预设。

## 5. 包结构

```
packages/subagent-hub
├─ src/host/registry.ts   定义存储（三层合并）→ 每个具名 agent 注册为 agentPresets
├─ src/host/presets.ts    从内置预设派生 <id>+hub（去掉官方委派行、加入本插件工具行）
├─ src/host/router.ts     标签路由 + 回退 + 预算；systemPrompt 段落列出可用具名 agent
├─ src/host/tools.ts      delegate / define_subagent
└─ src/client/            右侧栏“路由”标签页 + 设置页
spikes/
└─ m0-runtime/            S1 / S2 / S2b 运行时验证（S3 为代码阅读）
```

## 6. 前提验证（M0，已完成）

| # | 问题 | 结论 |
|---|---|---|
| S1 | 预设与 `agentOptions` 谁决定模型 | 正交；模型只由 `agentOptions` 决定 |
| S2 | `tools.restrict` 能否隐藏官方 `subagent` | 默认组合下不能 → D3 改为派生预设 |
| S2b | 能否派生去掉官方委派工具的预设 | 能，差异恰好为 `-subagent -subagent_fork +自有工具` |
| S3 | 前端能否拿到子会话模型 | 能，`modelSelection` 投影现成 |

细节与证据见 [`spikes/m0-runtime/README.md`](../spikes/m0-runtime/README.md)。

## 7. 里程碑

| M | 内容 | 验收 |
|---|---|---|
| M0 ✅ | S1–S3 spike | 三项均有可复现结论 |
| M1 ✅ | 派生预设 + registry + router + `delegate` | 选 `standard+hub` 的会话里只有 `delegate`；主 agent 按标签派发，理由写入 meta |
| M2 ✅ | 右侧栏“路由”标签页 | 每个子 agent 的模型 + 理由 + 费用汇总；点击跳官方子会话 |
| M3 ✅ | `define_subagent` + 审批晋升 + 设置页 | 会话内创建、审批后持久化 |
| M4 ✅ | 预算 + 外部 `DefinitionSource` 接口 | 超限拒绝并把原因交给模型；来源注册/释放与优先级已实现 |

## 8. 风险

| 风险 | 应对 |
|---|---|
| 运行时仍是 rc，接口在变（本地 checkout 已与运行时不一致） | 每次升级先跑 `spikes/m0-runtime/run.sh` 作回归 |
| 派生预设依赖官方预设的 YAML 结构 | 只按包名过滤行，不依赖行位置；过滤结果为空或未命中时拒绝注册并告警 |
| 用户需手动选 `+hub` 预设 | 设置页提供“设为默认预设”开关（`agent-preset-registry` 的 `default`） |

## 9. 共存（M2 期间发现）

用户的真实 profile 已装有 `dsh-subagent-default-model`（启用）、`dsh-subagent-library` 与 `@aiwayds/dsh-subagent-registry`（已安装未启用）、`dsh-better-sidebar`（启用）。结论见 [`packages/subagent-hub/README.md`](../packages/subagent-hub/README.md#与其他子代理插件共存)。要点：路由选择不会被 default-model 覆盖，但其故障转移会突破 D2，面板以“实际运行”警告呈现；与 subagent-library 的 `delegate` 同名。
