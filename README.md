# dsh-subagent-hub

DeepSeek Harness 插件：给**官方**子代理派发补上“怎么选”的信息。

- **具名子 agent**：配置里的每个定义注册为官方 Agent Preset（`hub-agent-<id>`），官方 `subagent` 的 `agent_preset` 参数直接可选
- **能力标签 / 模型目录**：路由表映射成官方 `subagent-model-selection` 的 `allowedModels`，并新增一段 system prompt 告诉主 agent 什么任务配什么
- **路由约束**：具名 agent 限定 `routes` 时，越界的 `provider/model` 在派发前被 `tools/pre-execute` 守卫拒绝
- **可选配置托管**：`manageOfficialSettings`（默认 `false`）打开后由插件幂等写入官方 allowlist
- **图形配置**：**设置 → 子代理中枢**（或 Plugins 页对应行的 Configure）可视化编辑路由与具名 agent，保存即时生效（不再需要手改 YAML）

v0.4.0 起不再提供自有 `delegate` / `define_subagent`、不再派生 `+hub` 预设、没有独立侧栏页与自建设置页；0.4.1 只在官方 Plugins 页恢复一张配置卡片。旧方案保留在 git tag `v0.3.0`。设计与原因见 [`docs/design.md`](docs/design.md)，安装见 [`docs/install.md`](docs/install.md)，变更见 [`CHANGELOG.md`](CHANGELOG.md)。

## 状态

| 阶段 | 状态 |
|---|---|
| v1（M0–M4）：派生预设、`delegate`、侧栏页、设置页、预算 | ✅ 已归档到 tag `v0.3.0` |
| v2（0.4.0）：改用官方 Agent Preset / 模型选择 / 守卫 | ✅ |
| v2.1（0.4.1）：官方 Plugins 页配置卡片 + live 重配置 | ✅ |
| v2.2（0.5.0）：配置界面重做（模型目录选择器、标签胶囊、目录预览、官方 UI 组件） | ✅ |
| v2.3（0.6.0）：配置页按官方设置页样式重做（下拉选择 provider/model/推理强度、行式卡片、保存栏） | ✅ 单元 48 项 + e2e 16 项 |

测试：`bash test.sh`（单元测试 + 在临时 `DSH_HOME` 里对真实运行时跑 e2e）。
