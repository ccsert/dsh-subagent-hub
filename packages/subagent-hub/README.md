# dsh-subagent-hub

DSH 插件：给**官方**子代理派发补上“怎么选”的信息——具名子 agent、按能力标签的模型白名单、路由约束守卫。
目标运行时 `@deepseek-ai/dsh` 0.2.1-rc.2。

v0.4.0 起不再派生 `<base>+hub` 预设、不再提供 `delegate` / `define_subagent`、不再有右侧栏页与自建设置页。
0.4.1 恢复了配置能力，但只挂在官方 Plugins 页的一张卡片上。旧方案保留在 git tag **v0.3.0**。

## 它做什么

- **具名子 agent**：`agents` 里的每个定义注册为一个官方 Agent Preset，id 固定为 `hub-agent-<id>`，人设 = 基础预设人设 + 该定义的 `instructions`。官方 `subagent` 工具的 `agent_preset` 参数因此能直接选到它。
- **模型白名单**：`routes` 里的每条 `{provider, model}` 映射成官方 `subagent-model-selection` 的 `allowedModels`。模型永远由官方工具暴露给主 agent，插件不替它选。
- **选择目录**：新增一段 system prompt，列出“具名 agent → 用途 / 标签 / 限定路由”和“可用模型 → 标签”，并告诉主 agent 哪个任务配哪个。参数没被官方工具暴露时，段落会明确说“目录仅供参考”，而不会诱导一次失败的调用。
- **路由约束守卫**：当官方调用带 `agent_preset` 指向声明了 `routes` 的具名 agent，而实际子路由（显式 `provider`/`model`，或继承的父路由）不在其中时，`tools/pre-execute` 在派发前拒绝，并给出允许的路由列表。
- **可选的官方配置托管**：`manageOfficialSettings: true` 时，通过 `configEditor` 幂等写入官方工具行的 `allowedAgentPresets` 和 Host 的 `subagent-model-selection` 设置。默认 `false`，不替用户改别人的配置。
- **配置界面**：同一张表单放在两个官方入口——**设置 → 子代理中枢**（推荐）和官方 Plugins 页的 `subagent-hub` 行 **Configure**；保存即时生效，不需要重启，也不用再手改 YAML。

## 在界面上配置

打开 **设置 → 子代理中枢**，或 **Plugins → dsh-subagent-hub → 子代理中枢行 → Configure**（两处是同一张表单）：

| 区块 | 可编辑 |
|---|---|
| 官方设置托管 | `manageOfficialSettings` 开关 |
| 模型路由 | id / provider / model / reasoningEffort / tags / note，按顺序即 `allowedModels` 顺序 |
| 具名子 agent | id（实时预览 `hub-agent-<id>`）/ description / instructions / routes / needs / basePreset |

保存是一次原子写入；Host 会重新注册受影响的预设并同步官方 allowlist。新增/删除具名 agent 对**新会话**立即生效；已经开始的会话保留原有工具 schema。模型路由改动同样即时同步到 `subagent-model-selection`。

不想用界面时，下面这些字段仍然可以直接写在 profile 的 `cordis.patch.yml` 里，效果相同。

## 配置

```yaml
- id: subagent-hub
  config:
    manageOfficialSettings: false  # true: 由本插件写官方 allowlist（见下）
    routes:                        # 顺序即 allowedModels 顺序
      - { id: flash, provider: deepseek-official, model: deepseek-flash, tags: [fast, cheap], note: 'DeepSeek Flash' }
      - { id: pro,   provider: deepseek-official, model: deepseek-v4-pro, tags: [reasoning], note: 'DeepSeek V4 Pro' }
    agents:
      - id: reviewer
        description: Reviews a diff and reports findings
        instructions: |
          You review code changes. Report concrete findings only; never edit files.
        routes: [flash]            # 可选：限定这个具名 agent 只能用这些路由
        needs: [fast]              # 可选：目录里展示的能力标签
        basePreset: standard       # 可选：从哪个官方预设派生（默认 standard）
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `routes` | `[]` | 子模型白名单。每条变成官方 `allowedModels` 的一项，`tags` 用于 prompt 目录与选择说明 |
| `agents` | `[]` | 具名 agent。每个注册为 `hub-agent-<id>` 官方预设 |
| `manageOfficialSettings` | `false` | `true` 时写官方 `allowedAgentPresets` / `subagent-model-selection` |

## 开启 `manageOfficialSettings` 后会发生什么

- 每个包含 spawn `@deepseek-ai/dsh-tool-subagent` 行的官方预设（当前发行版：`preset-standard`、`preset-ptc`、`preset-cordis`）：
  - `config.allowedAgentPresets` 合并本插件的 `hub-agent-*`（保留其它插件的 id，替换本插件的旧值）；
  - `config.modelSelectionSettings: true`（模型选择参数才能出现）。
- `subagent-model-selection-settings`：`{ enabled: true, allowedModels: routes }`。
- 写入是幂等的：配置一致时不重写，不会每次启动都重载预设。
- fork 行不改：官方 fork provider 的 `agentPreset` capability 为 `false`，配置了会加载失败，`subagent_fork` 也拿不到 `agent_preset`。
- 代价：被管理的预设 config 会完整固定在 profile patch 层，官方后续升级的预设变更不再自动合并。关闭开关不会回滚已写入内容。

不想让插件托管时，仍可手写官方配置：把 `allowedAgentPresets` 加到官方工具行、在设置里启用子代理模型选择即可；本插件的目录段落会检测到参数已暴露并给出可用指引。

## 主 agent 看到什么

- 官方 `subagent` schema 多出 `agent_preset`（枚举值 `hub-agent-<id>`）、`provider`、`model`、`reasoning_effort`（取决于官方行配置）。
- system prompt 多一段目录：

  ```markdown
  ## Choosing a subagent
  Pass `agent_preset` to choose a named agent, and `provider` plus `model` together to choose the child model. ...

  Named agents:
  - `hub-agent-reviewer` — Reviews a diff and reports findings (tags: fast; routes: flash = deepseek-official/deepseek-flash [fast, cheap] (DeepSeek Flash)).

  Models:
  - `deepseek-official/deepseek-flash` — tags: fast, cheap; DeepSeek Flash
  - `deepseek-official/deepseek-v4-pro` — tags: reasoning; DeepSeek V4 Pro
  Capability tags: `cheap`, `fast`, `reasoning`.
  ```

- 越界调用被拒时的错误以 `subagent-hub:` 开头，包含允许的 `provider/model` 与路由 id。

## 不做什么

- 不注册任何派发工具；`delegate` / `define_subagent` 已删除。
- 不派生 `<base>+hub` 预设；新会话不需要选任何特殊预设。
- 不选模型、不做路由回退、不做预算、不写会话投影。
- 不提供独立侧栏页或自建设置页：子 agent 目录用官方 `dsh-client-ui-subagent`，本插件只在官方 Plugins 页提供一张配置卡片。
- 具名 agent 只来自插件配置：官方 `allowedAgentPresets` 是静态列表，会话内创建 / 工作区文件 / 外部来源无法可靠进入它（v1 的这四层已删除）。

## 测试

```sh
bash test.sh   # 44 项单元测试 + 16 项 e2e 断言（临时 DSH_HOME，无模型凭据，不碰你的 profile）
```

e2e 在临时 `DSH_HOME` 里启动真实 `dsh` web profile，用脚本化 `llm/stream` 拦截模型请求，验证：官方参数可见、官方设置被写入、越界路由被守卫拒绝、具名 agent 经 `agent_preset` 生效且 persona 含 instructions；以及 client bundle 上架、Plugins 页配置表单存在、通过 Host settings 服务 live 新增具名 agent 后预设/allowlist/schema/persona 全部更新。

## 已知限制

| 限制 | 说明 |
|---|---|
| 具名预设出现在预设选择器末尾（`Hub agent · <id>`） | 官方无隐藏标记；新会话仍用 `standard` 即可 |
| fork 工具不能用具名预设 | 官方 fork provider 不支持独立预设 |
| 被托管的预设 config 固定 | 见上；显式开关的代价 |
| 请求期改写路由的插件（如 `dsh-subagent-default-model` 的故障转移）可绕过守卫 | 守卫在派发前；建议对本场景关闭那类改写 |
| 运行时 rc 接口会变 | 升级时先跑 `bash test.sh` |
