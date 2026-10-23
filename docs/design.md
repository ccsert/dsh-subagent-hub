# dsh-subagent-hub 设计（v2）

> 状态：0.4.0 方向性重构完成（单元测试 36 项 + 真实运行时 e2e 12 项）。
> 目标运行时：`@deepseek-ai/dsh` 0.2.1-rc.2（DSH Desktop 0.12.1）。
> 旧方案（M0–M4）完整保留在 git tag **v0.3.0**，作为回滚点。

## 1. 方向

v1 做了四件事：派生 `<base>+hub` 预设、自有 `delegate` / `define_subagent` 工具、右侧栏路由页、设置页。
结论是这些都不是核心：`+hub` 引入了“模式”概念（新会话要先选对预设），自有工具和 Agent Teams / 其它子代理插件抢派发，界面也打不过官方 `dsh-client-ui-subagent`。

v2 不再替代官方派发，只给官方子代理补“怎么选”的信息：

| 能力 | v1 | v2 |
|---|---|---|
| 具名子 agent | 自建 `<base>+hub` 预设 + 自有工具 | 注册成**官方 Agent Preset**，走官方 `agent_preset` 参数 |
| 模型路由 | 插件自己选模型并写 `agentOptions` | 映射成官方 `subagent-model-selection` 的 `allowedModels` |
| 能力标签 | 自有 `needs` 参数 | 新增 system prompt 段落，告诉主 agent 什么任务配什么 |
| 路由约束 | 自有 `delegate` 在执行时限制 | 官方 `agent_preset` + `tools/pre-execute` 守卫 |
| 界面 | 右侧栏页 + 设置页 | 无界面 |
| 派发工具 | 自有 `delegate` | 官方 `subagent` / `subagent_fork` |

## 2. 原则

**不注册任何派发工具，不派生任何 `<base>+hub` 预设。** 派发、子 agent 生命周期、模型实际调用全部由官方运行时执行；本插件只做三件事：注册具名 agent 预设、提供选择信息、守住模型路由约束。

## 3. 已定决策

| # | 问题 | 决策 |
|---|---|---|
| D1 | 具名 agent 存在哪一层 | **只来自插件配置 `agents`**（profile patch）。官方 `allowedAgentPresets` 是启动时读取的静态列表，会话内创建、工作区扫描、外部来源都无法可靠进入这个列表；v1 的四层来源（profile / workspace / external / session）随之删除。每个定义注册为稳定 id `hub-agent-<id>` 的 Agent Preset |
| D2 | 子 agent 的模型由谁决定 | 官方 `subagent-model-selection`。插件路由表里的每条 `{provider, model}` 就是 `allowedModels` 的一项；插件不写 `agentOptions`、不选模型、不做回退 |
| D3 | 用什么工具派发 | **官方工具**。不注册 `delegate`，不替换、不隐藏官方 `subagent` / `subagent_fork` |
| D4 | 界面放哪 | **不做界面**。官方 `dsh-client-ui-subagent` 已有子 agent 目录；官方设置页已有 `subagent-model-selection` 的模型允许列表 |
| D5 | 是否替用户改官方配置 | 默认**不**。`manageOfficialSettings` 默认 `false`；只有显式打开时才通过 `configEditor` 写入 `allowedAgentPresets` 与模型允许列表 |
| D6 | 路由约束怎么表达 | 官方 `allowedAgentPresets` 只能约束“可选哪些预设”，不能约束“这个预设只能用哪些模型”。用 `tools/pre-execute` 守卫在读官方工具参数、派发发生之前拒绝越界组合 |

## 4. 关键设计

### 4.1 具名 agent → 官方 Agent Preset

启动时对每个 `agents` 定义：

1. `agentPresets.readDocument(basePreset)`（默认 `standard`）取出该预设的 plugin 行；
2. `deriveAgentPreset()`：递归删掉所有官方委派工具行（具名 agent 的子会话不再委派），把 `instructions` 追加到 `@deepseek-ai/dsh-persona` 的 `prefix`；
3. `agentPresets.register({ id: 'hub-agent-<id>', name: 'Hub agent · <id>', description, order: 10000, plugins })`。

id 稳定、不含指纹：它会被写进 profile patch 的 `allowedAgentPresets`，定义变化时必须保持同一个 id。`description` 会出现在官方工具 `agent_preset` 参数的枚举说明里（官方实现读取预设声明）。

### 4.2 路由表 → 官方 `allowedModels`

```js
allowedModels = routes.map(({ provider, model }) => ({ provider, model }))
```

写入 Host 的 `subagent-model-selection-settings`：`{ enabled: true, allowedModels }`。官方工具在开启该策略的新会话上暴露 `provider` / `model` / `reasoning_effort`，并拒绝不在列表中的精确路由。插件不再有“回退到下一个路由”的逻辑：模型永远由主 agent 或继承决定，越界由官方预检和本插件守卫拒绝。

### 4.3 system prompt 目录段落

一个 Host 级 system prompt 段落（order = `TOOL_SUBAGENT + 10`），在**官方委派工具可见**的 agent 上输出：

- 每个具名 agent：preset id、用途、能力标签、限定路由；
- 每个可用模型：`provider/model`、能力标签、备注；
- 一段选择指令。根据官方工具当前**实际暴露的参数**调整措辞：`agent_preset` / `provider` / `model` 只有被配置出来时才引导使用；否则明确说明“目录仅供参考、参数未启用”，并提示打开 `manageOfficialSettings`。

段落注入不改变 tool schema，所以不会破坏官方请求前缀以外的缓存结构。

### 4.4 路由约束守卫

官方 `allowedAgentPresets` 只回答“能选哪些预设”。本插件额外注册 `tools/pre-execute`（waterfall，返回 `{ kind: 'deny', reason }`）：

1. 调用没有 `agent_preset`，或值不是本次注册的具名 agent → 放行；
2. 具名 agent 没有 `routes` → 放行；
3. 取“实际子路由”：显式 `provider` + `model`，否则父 agent 的当前请求路由（与官方 `parentAgentOptionsForDelegation` 同源）；
4. 不在该 agent 的 `routes` 里 → 拒绝，理由里列出允许的 `provider/model`、路由 id 和“显式传参”的要求；
5. 半指定（只给 provider 或只给 model）交给官方工具自己的配对错误。

`subagent_fork` 不可能出现 `agent_preset`：官方 fork provider 的 `agentPreset` capability 为 `false` 且继承父上下文，配置了也加载失败。因此 `manageOfficialSettings` 只改写 spawn 行。

### 4.5 `manageOfficialSettings`（默认关闭）

为 `true` 时，等具名预设注册完成后，用 `configEditor` 做幂等同步（已一致就不重写，避免每次启动触发预设重载）：

| 目标 | 写入 |
|---|---|
| 每个声明了 spawn `@deepseek-ai/dsh-tool-subagent` 行的 Agent Preset（当前发行版是 `preset-standard` / `preset-ptc` / `preset-cordis`） | 该行的 `config.allowedAgentPresets`（保留其它插件写入的 id，替换本插件 `hub-agent-*` 前缀的旧值）与 `config.modelSelectionSettings: true` |
| `subagent-model-selection-settings` 行 | `{ enabled: true, allowedModels }` |

已知副作用（有意接受）：这份写入是 profile patch 里对预设行的**完整 config override**，该预设的 plugin 列表从此固定在 profile 层，官方后续升级不会自动合并。这正是“替用户管官方配置”的代价，所以默认关闭。关闭开关不会回滚已经写入的内容，只是不再维护。

### 4.6 删除清单（v1 → v2）

| 删除 | 原因 |
|---|---|
| `lib/client.js`、locale、`icon.svg`、`package.json` 的 `dsh.client`/UI exports | 不再有界面 |
| `lib/delegate.js`（`delegate` + `define_subagent`） | 不再有自有派发工具 |
| `lib/budget.js`、`maxConcurrent` / `maxTokensPerSession` | 预算机制没有落点：不经过本插件派发 |
| `lib/projection.js`、`subagentHub` / `subagentHubDefine` 投影 | 只服务路由面板与会话层定义 |
| `deriveHubPreset` | 不再派生 `<base>+hub` |
| `basePresets` | 只用于派生 `+hub` |
| workspace / external / session 定义层、`define_subagent` 晋升 | 无法进入静态 `allowedAgentPresets`（见 D1） |

## 5. 包结构

```
packages/subagent-hub
├─ lib/index.js             Host 服务：注册预设、prompt 段落、pre-execute 守卫、官方设置同步
├─ lib/catalog.js           配置 → 路由表 + 具名 agent + 稳定 preset id + 配置问题
├─ lib/definitions.js       具名 agent 定义校验
├─ lib/presets.js           从基础预设派生具名 agent 预设（递归去委派行 + persona 追加）
├─ lib/router.js            路由索引、标签、allowedModels 映射
├─ lib/guard.js             路由约束判定（纯函数）
├─ lib/prompt.js            system prompt 目录段落（纯函数）
├─ lib/official-settings.js manageOfficialSettings 的计划与配置改写（纯函数）
└─ test/                    单元测试 + e2e（临时 DSH_HOME + 真实 dsh 0.2.1-rc.2）
```

## 6. 前提验证

v1 的 M0 spike（[`spikes/m0-runtime/README.md`](../spikes/m0-runtime/README.md)）仍保留：S1（预设与 `agentOptions` 正交）、S2（`tools.restrict` 藏不掉官方工具）、S2b（可派生预设）、S3（前端可读子会话模型）。v2 另外在真实运行时里验证了（覆盖进 e2e）：

| # | 问题 | 结论 |
|---|---|---|
| V1 | `configEditor` 能否改官方预设行（含嵌套 group 行） | 能；保留 YAML 注释与 `!!js` 条件 |
| V2 | 写入 `allowedAgentPresets` 后新会话是否出现 `agent_preset` | 能；枚举与描述来自注册的预设 |
| V3 | `tools/pre-execute` 能否拒绝一次官方派发 | 能，返回 `{kind:'deny', reason}` 即成为模型可见的工具错误 |
| V4 | 具名预设能否通过 `agent_preset` 生效且带上 instructions | 能；子会话 header 记录 `hub-agent-<id>`，persona 含追加指令 |

## 7. 测试与验收

`bash test.sh`：36 项单元测试 + 12 项 e2e 断言（真实 `dsh`，临时 `DSH_HOME`，无模型凭据，`llm/stream` 脚本化）。

e2e 断言覆盖：具名预设注册成功；`manageOfficialSettings` 写入预设行与模型设置；路由表与 Host 设置一致；spawn 行拿到 allowlist、fork 行不动；主 agent 的官方 `subagent` schema 出现 `agent_preset` / `provider` / `model` / `reasoning_effort`；prompt 段落含目录；越界 `provider/model` 被守卫拒绝；具名 agent 通过 `agent_preset` 生效且 persona 含 instructions；省略路由时继承父路由；普通子 agent 不被具名守卫限制。

## 8. 风险与限制

| 限制 | 说明 |
|---|---|
| 具名预设会出现在新会话预设选择器里（`Hub agent · <id>`，排最后） | 官方没有隐藏标记；用户照常用 `standard` 即可 |
| 具名 agent 只来自插件配置 | 这是静态 `allowedAgentPresets` 的硬约束（D1），不是偷懒 |
| fork 工具不能选具名预设 | 官方 fork provider `agentPreset: false`；具名 agent 只能走 `subagent` |
| `manageOfficialSettings` 会把被管理的预设 config 固定在 profile 层 | 见 4.5，显式开关 |
| 子 agent 的模型仍可能被 `dsh-subagent-default-model` 之类的插件在请求期改写 | 守卫管住派发时的路由组合；请求期改写不在本插件职责内，建议此类插件对本插件场景关闭故障转移 |
| 运行时仍是 rc，接口会变 | `bash test.sh` 的 e2e 是升级回归；spike 记录同版本结论 |

## 9. 回滚

- 代码：`git checkout v0.3.0`（或 revert 0.4.0 的提交）。
- profile：把 `cordis.patch.yml` 里 `subagent-hub` 的 `config` 换回 v0.3.0 字段（`maxConcurrent` / `routes` / `agents`），并把 `agent-preset-registry.default` 改回 `standard+hub`。
- 若开启过 `manageOfficialSettings`：删除 profile patch 里 `preset-standard`（以及 `preset-ptc` / `preset-cordis`）的完整 config override，以及 `subagent-model-selection-settings` 行，恢复官方默认。

## 10. 共存

| 插件 | 关系 |
|---|---|
| `dsh-subagent-default-model` | 它在请求期改写子 agent 路由，可绕过本插件的守卫（守卫在派发前）。两者都能用时建议关掉它的故障转移 |
| `dsh-subagent-library` / `@aiwayds/dsh-subagent-registry` | v2 不再提供 `delegate`，工具名不再冲突；它们仍是独立的派发插件 |
| `dsh-better-sidebar` | 互补：它展示子 agent 树与活动，不做选择信息 |
| 官方 `dsh-client-ui-subagent` | 使用它做界面；v2 不重复实现 |
