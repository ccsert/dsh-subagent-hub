# Changelog

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
