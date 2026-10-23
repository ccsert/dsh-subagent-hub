# Changelog

## 0.4.0 — 反转到官方机制

方向性重构：**不再替代官方派发，只给官方 subagent 补“怎么选”的信息。** 旧方案完整保留在 tag `v0.3.0`。

**为什么不再保留自己的 `delegate`**：它必然与官方工具、Agent Teams 以及其它子代理插件争抢同一个派发入口；为了让它可用，v1 还得派生 `<base>+hub` 预设（把“选对模式”的负担交给用户），再自己维护一套预算、投影、超时与结果传递。这些能力官方已经有，而且官方界面与设置页也在持续演进。v2 把同一份价值拆成四块，全部挂到官方机制上：具名 agent → 官方 Agent Preset；模型路由表 → 官方 `subagent-model-selection.allowedModels`；能力标签 → system prompt 目录；路由约束 → `tools/pre-execute` 守卫。派发工具、子 agent 生命周期、模型调用仍由官方运行时负责。

- 具名 agent 注册为官方 Agent Preset（稳定 id `hub-agent-<id>`，persona 追加 `instructions`），官方 `agent_preset` 参数直接可选；不再派生任何 `<base>+hub` 预设。
- 路由表映射为官方 `allowedModels`；插件不再选模型、不做回退。
- 新增 system prompt 目录段落：具名 agent → 用途 / 标签 / 限定路由；可用模型 → 标签；按官方工具实际暴露的参数调整指引。
- 新增 `tools/pre-execute` 路由约束守卫：`agent_preset` 指向声明了 `routes` 的具名 agent，而显式或继承的子路由不在其中时，派发前拒绝并列出允许的路由。
- 新增 `manageOfficialSettings`（默认 `false`）：开时通过 `configEditor` 幂等写入官方工具行的 `allowedAgentPresets` 与 `subagent-model-selection` 设置；默认不动其它插件的配置。
- 删除：右侧栏“子代理路由”页、设置页、`lib/client.js` 与 Client 半侧（`dsh.client`、locale、icon）、`delegate` / `define_subagent` 工具、`lib/budget.js`、`lib/projection.js`、`deriveHubPreset`、`basePresets`、`maxConcurrent`、`maxTokensPerSession`、workspace / external / session 定义层。
- 测试：36 项单元测试 + 12 项真实运行时 e2e（临时 `DSH_HOME`，脚本化 `llm/stream`）。

## 0.3.0 — M4: budgets and external definition sources

- 新增 `maxConcurrent`（默认 4）与可选的 `maxTokensPerSession`；超限时 `delegate` 拒绝并说明原因。
- 用量来源：运行中的子 agent 直接读投影；结束的子 agent 在 `agent/disposed` 时记入账本（每子会话取最新值，续聊不重复计）。账本为进程内。
- `ctx.subagentHub.registerSource({ id, priority, definitions })`：外部具名 agent 来源，优先级位于工作区层与会话层之间。
- `sumUsage` 同时兼容投影的 Host 状态（`{ totals, last }`）与 Client 视图（扁平 buckets）。

## 0.2.0 — M3: in-session definitions and a settings page

- `define_subagent` 工具：会话内创建具名 agent，定义写入会话日志（会话层）。
- 审批后晋升：`persist: workspace` 写 `.dsh/subagents/<id>.yaml`；`persist: profile` 写 profile patch 并即时生效；被拒则保留会话层。
- 设置页（`plugins.row.config`）：增删改路由与具名 agent，一次带修订号的原子保存。
- `routes` / `agents` 改为 volatile，保存不需要重载插件。

## 0.1.0 — M2: routing panel

- `subagentHub` 会话投影：从 `delegate` 的 `tool/result.meta` 折叠每次路由记录。
- 右侧栏「子代理路由」页：模型、实际模型（不一致时警告）、理由、回退、token 汇总，点击跳官方子会话。
- Bundle 清单、locale、图标；客户端以 `window.__ModuleLoader__` 手写格式加载，无构建步骤。
