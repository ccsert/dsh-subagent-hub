# dsh-subagent-hub

DeepSeek Harness 插件：子 agent 的定义、模型路由与可视化。

- **会话子 agent 面板**：右侧栏展示后代子 agent 树、状态、所用模型、token 用量，可发消息 / 打断
- **能力标签路由**：主 agent 按 `fast` / `reasoning` / `vision` 等标签选择，插件解析为具体 provider/model 并记录理由
- **具名子 agent**：profile / workspace / session 三层定义，近的覆盖远的
- **会话内创建**：`define_subagent` 默认会话级；晋升为持久定义需审批

执行全部复用官方 `subagents` 服务，不另造运行时。

设计与决策见 [`docs/design.md`](docs/design.md)。

## 状态

| 里程碑 | 状态 |
|---|---|
| M0 前提验证 | ✅ [`spikes/m0-runtime`](spikes/m0-runtime/README.md) |
| M1 派生预设 + 具名 agent + 标签路由 + `delegate` | ✅ [`packages/subagent-hub`](packages/subagent-hub/README.md) |
| M2 右侧栏“子代理路由”页 + 路由投影 | ✅ |
| M3 `define_subagent` + 审批晋升 + 设置页 | ✅ |
| M4 预算 + 中央下发的定义来源 | 下一步 |

测试：`bash test.sh`（单元测试 + 在临时 `DSH_HOME` 里对真实运行时跑 e2e）。
