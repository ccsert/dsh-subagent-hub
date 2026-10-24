# dsh-subagent-hub 设计（v2）

> 状态：0.10.2（统一检查独立子 agent 与 Team 的显式/继承创建路由），单元测试 102 项 + 真实运行时 e2e 31 项；另有浏览器交互验收。
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
| 界面 | 右侧栏页 + 自建设置页 | 官方设置导航与 Plugins 行配置，共用表单；子 agent 运行界面沿用官方，标题栏补充只读模型标识 |
| 派发工具 | 自有 `delegate` | 官方 `subagent` / `subagent_fork` |

## 2. 原则

**不注册任何派发工具，不派生任何 `<base>+hub` 预设。** 派发、子 agent 生命周期、模型实际调用全部由官方运行时执行；本插件只做三件事：注册具名 agent 预设、提供选择信息、守住模型路由约束。界面通过官方槽位提供配置和只读运行信息。

## 3. 已定决策

| # | 问题 | 决策 |
|---|---|---|
| D1 | 具名 agent 存在哪一层 | **只来自插件配置 `agents`**（profile patch）。官方 `allowedAgentPresets` 是启动时读取的静态列表，会话内创建、工作区扫描、外部来源都无法可靠进入这个列表；v1 的四层来源（profile / workspace / external / session）随之删除。每个定义注册为稳定 id `hub-agent-<id>` 的 Agent Preset |
| D2 | 子 agent 的模型由谁决定 | 官方 `subagent-model-selection`。插件路由表里的每条 `{provider, model}` 就是 `allowedModels` 的一项；插件不写 `agentOptions`、不选模型、不做回退 |
| D3 | 用什么工具派发 | **官方工具**。不注册 `delegate`，不替换、不隐藏官方 `subagent` / `subagent_fork` |
| D4 | 界面放哪 | **不建独立界面**。子 agent 目录用官方 `dsh-client-ui-subagent`，模型允许列表用官方设置页；配置只借官方 Plugins 页的 `plugins.row.config` 卡片（0.4.1 加入），不恢复 v1 的独立侧栏；0.4.2 起在官方设置导航增加入口，共用同一表单；0.10.0 在官方子会话标题栏补充只读模型标识 |
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

`tools/pre-execute` 在工具执行前分两层检查：

1. 非空全局 `routes` 对 `subagent`、`subagent_fork`、`spawn_teammate` 生效。
2. 从当前 Session 的实际工具 schema 判断 `provider` / `model` 是否有效；没有这些输入时按父路由继承检查，忽略额外塞入的模型字段。
3. 显式选择或继承模型不在全局表内、无法确认模型或配置非空但没有有效路由时，返回 `{ kind: 'deny', reason }`，不启动子会话。
4. 具名 `agent_preset` 的 `agents[].routes` 在全局范围上继续收紧；半指定的受支持参数交给原生工具报告配对错误。
5. 错误说明只推荐该工具实际支持的输入。Team 当前没有模型和预设选择参数；fresh/fork 都继承 Lead，独立 fork 同样没有模型输入。

原生新会话中，托管已启用的 `subagent` 暴露模型参数，可选择 MiniMax；当前 `subagent_fork` 与 `spawn_teammate` 不具备该能力。Team-only 会话也收到目录与这项限制。实际请求、零被拒绝成员记录与框架无关 Host 入口回归见 [Team 模型路由](team-model-routing.md)。

全局空表保留原生继承。检查只覆盖创建工具，不重写现有成员、不拦截其后续 `send_message` 唤醒，也不覆盖其他插件的请求期模型改写。并发上限仍由 `delegationTools` 决定，未把原生 Team 容量冒充成 Hub 的独立子任务并发上限。

### 4.5a 每会话并发上限（0.8.0）

派发虽然由官方工具执行，但官方运行时会对每个子 agent 发出 `subagent/start` 与 `subagent/end`。插件在 `start` 时用 `ctx.agents.get(id)` 取子会话 header 的 `parentSession`，按父会话维护“运行中”集合，在 `end` 时移除。`tools/pre-execute` 守卫在调用名属于 `delegationTools`（默认 `subagent`、`subagent_fork`）且父会话运行中的子 agent 数已达 `maxConcurrent` 时返回 deny，理由以 `subagent-hub:` 开头。`maxConcurrent: 0` 不限制。官方 `subagent.maxActiveSubagents` 仍是全局上限，两者同时生效。

### 4.5 `manageOfficialSettings`（默认关闭）

为 `true` 时，等具名预设注册完成后，用 `configEditor` 做幂等同步（已一致就不重写，避免每次启动触发预设重载）：

| 目标 | 写入 |
|---|---|
| 每个声明了 spawn `@deepseek-ai/dsh-tool-subagent` 行的 Agent Preset（当前发行版是 `preset-standard` / `preset-ptc` / `preset-cordis`） | 该行的 `config.allowedAgentPresets`（保留其它插件写入的 id，替换本插件 `hub-agent-*` 前缀的旧值）与 `config.modelSelectionSettings: true` |
| `subagent-model-selection-settings` 行 | `{ enabled: true, allowedModels }` |

已知副作用（有意接受）：这份写入是 profile patch 里对预设行的**完整 config override**，该预设的 plugin 列表从此固定在 profile 层，官方后续升级不会自动合并。这正是“替用户管官方配置”的代价，所以默认关闭。关闭开关不会回滚已经写入的内容，只是不再维护。

### 4.6 配置卡片与 live 重配置（0.4.1）

`routes` / `agents` / `manageOfficialSettings` 声明为 schemastery **volatile** 字段，官方 `settings` 服务因此为 profile 行 `subagent-hub` 生成配置表单。Client 半侧（`lib/client.js`）把同一张表单注册到两个官方槽位：`settings.section`（设置左侧导航的“子代理中枢”，推荐入口）和 `plugins.row.config`（Plugins 页 `subagent-hub` 行的 Configure，key `dsh-subagent-hub#subagent-hub`）：

- 路由表、具名 agent、托管开关一次 `mutate` 原子保存（带修订号），Host 逐路径合并进 profile patch；
- 保存不会重载插件：Loader 把 volatile 值原地提交并发出 `loader/volatile-update`；
- Host 侧的 reconcile worker 在 HMR 事务**之外**启动，串行应用变更：只有 `id` / `description` / `basePreset` / `instructions` 变化时才重建具名预设，任何变更后都重做官方 allowlist 同步；
- prompt 与 guard 直接读取按需重建的 catalog，因此目录和路由约束立即反映新配置；
- 注册具名预设与写官方 allowlist 都由同一个后台 worker 承担：启动时的 `init` 可能处在 HMR 事务里，此时写配置会被判定为嵌套事务而失败；worker 在事务之外串行执行，并保证“注册 → 同步”只做一次；
- 官方 allowlist 的每次写入都是一次 profile 重载（官方预设树会被重建），因此写入按“内容不同才写”收敛，并优先写模型允许列表（它立刻带来 `provider`/`model` 参数）；客户端轮询官方配置，把同步进度如实显示出来；
- 客户端只用官方机制取数据：模型目录来自 `ctx.remote.session.modelCatalog()`（按 provider 分组的可用模型），官方预设列表来自 `ctx.remote.agentPresets.list()`；因此路由与具名 agent 的字段是**选择**而不是手填，标签是胶囊，基础预设是下拉；界面沿用官方主题变量，使用原生表单控件与可选官方图标，不依赖外部 UI 资源；
- 已有会话保留其 composition（官方行为），新会话拿到新的 `agent_preset` 枚举与 `provider`/`model` 允许列表。

### 4.6a 客户端编辑状态（0.9.0）

`draftsOf` / `valuesOf` 保持配置形状不变。编辑器另外给每行分配稳定的 `_key`，路由保留 `_referenceId`；这两个字段不会写入配置。草稿比较包含所有未完成行，避免空字段被序列化过滤后误判为“没有修改”。改名只有在非空且不冲突时更新引用，删除与撤销按 agent 行身份恢复引用，不依赖可变化的数组位置。

保存必须等待 `form.mutate` 明确返回 `true` 才更新本地基准，失败保留草稿。成功后通过公开的 `agentPresets.list()` 核对角色注册，通过 `subagent-model-selection-settings` 的表单快照核对模型白名单。`preset-standard` 是预设条目 id，真实 Host 不把它服务为 Settings 表单；0.9.0 对它的轮询无法成功结束，已在 0.9.1 修正。快照未就绪不算成功。observer 有独立的 15 秒截止计时，网络请求不返回也能退出忙碌状态；用户可只读重新核对。新一轮保存、放弃、卸载以及超时都会拒绝旧请求的晚到结果。

字段标签、错误与帮助通过 `label` / `aria-labelledby` / `aria-describedby` 关联；保存错误可聚焦到相应字段。浏览器 fixture 内嵌实际 Client 模块与测试数据，验证用户交互但不触碰真实 profile，详见 [验收记录](ui-acceptance.md)。

### 4.6b 子会话最近请求模型（0.10.0）

Client 通过可选的 `sessions` 注入，注册官方 session 范围的 `conversation.session.header.utilities` 列表贡献。`binding(sessionId).session` 提供当前保留代的 Session face；读取其生命周期 `subagent` 判断子会话，读取 `session.projections.faceOf('modelSelection')` 订阅模型记录。整个路径不保留新 Session、不调用模型选择 RPC、不查询模型目录；缺少 binding 时不展示。

公开投影的 `lastUsed` 来自 `request/header.config`；`next` 表示 pending selection 或 lastUsed。只把 lastUsed 用作最近请求显示，next 不同则作为“尚未请求”的计划另列。null 的 lastUsed 表示尚无请求，缺少/不完整投影表示未确认。继承历史也属于 Session 历史，因此不声称这是 fork 后首个新请求，也不据请求记录判断成功或费用。

原生 details/summary 保留键盘和展开语义；状态播报在可折叠内容之外。会话 binding 替换时关闭详情，React 外部存储订阅释放旧代。浮层按视口定位，测量祖先 CSS zoom 的比例和原点，防止混用视口与局部坐标。

### 4.7 删除清单（v1 → v2）

| 删除 | 原因 |
|---|---|
| `lib/client.js`、locale、`icon.svg`、`package.json` 的 `dsh.client`/UI exports | 0.4.0 不再有界面；0.4.1 只把 `lib/client.js` + `dsh.client` + locale 作为 Plugins 页配置卡片恢复，不恢复侧栏页 |
| `lib/delegate.js`（`delegate` + `define_subagent`） | 不再有自有派发工具 |
| `lib/budget.js`、`maxTokensPerSession` | token 预算没有落点：不经过本插件派发。`maxConcurrent` 在 0.8.0 以“每会话并发上限”回归，见 4.5a |
| `lib/projection.js`、`subagentHub` / `subagentHubDefine` 投影 | 只服务路由面板与会话层定义 |
| `deriveHubPreset` | 不再派生 `<base>+hub` |
| `basePresets` | 只用于派生 `+hub` |
| workspace / external / session 定义层、`define_subagent` 晋升 | 无法进入静态 `allowedAgentPresets`（见 D1） |

## 5. 包结构

```
packages/subagent-hub
├─ lib/index.js             Host 服务：注册预设、prompt 段落、pre-execute 守卫、官方设置同步、live 重配置
├─ lib/client.js            官方 Plugins 页的行配置卡片（路由 / 具名 agent / 托管开关）
├─ lib/catalog.js           配置 → 路由表 + 具名 agent + 稳定 preset id + 配置问题
├─ lib/definitions.js       具名 agent 定义校验
├─ lib/presets.js           从基础预设派生具名 agent 预设（递归去委派行 + persona 追加）
├─ lib/router.js            路由索引、标签、allowedModels 映射
├─ lib/guard.js             路由约束判定（纯函数）
├─ lib/prompt.js            system prompt 目录段落（纯函数）
├─ lib/official-settings.js manageOfficialSettings 的计划与配置改写（纯函数）
├─ locale/                  Plugins 卡片标题/说明
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

`bash test.sh`：102 项单元测试 + 31 项 e2e 断言（真实 `dsh`，临时 `DSH_HOME`，无模型凭据，`llm/stream` 脚本化）。

e2e 断言覆盖：具名预设注册成功；`manageOfficialSettings` 写入预设行与模型设置；路由表与 Host 设置一致；spawn 行拿到 allowlist、fork 行不动；主 agent 的官方 `subagent` schema 出现 `agent_preset` / `provider` / `model` / `reasoning_effort`；prompt 段落含目录；越界 `provider/model` 被守卫拒绝；具名 agent 通过 `agent_preset` 生效且 persona 含 instructions；省略路由时继承父路由；普通子 agent 不被具名守卫限制；client bundle 上架；配置行有可写表单；通过 Host settings 服务 live 新增具名 agent 后，预设、`allowedAgentPresets`、新会话 schema、persona 全部更新。

## 8. 风险与限制

| 限制 | 说明 |
|---|---|
| 具名预设会出现在新会话预设选择器里（`Hub agent · <id>`，排最后） | 官方没有隐藏标记；用户照常用 `standard` 即可 |
| 配置卡片的修改对**已有会话**不改变工具 schema | 官方在会话组合/恢复时固定 preset 与模型选择策略；新会话生效 |
| 配置卡片依赖官方 `settings` 服务的 volatile 表单 | 若运行时移除该机制，仍可手改 profile patch（字段一致） |
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
