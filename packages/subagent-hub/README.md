# dsh-subagent-hub

DSH 插件：具名子 agent、按能力标签选子 agent 的模型、`delegate` 工具。目标运行时 `@deepseek-ai/dsh` 0.2.1-rc.2。

## 它做什么

- 为 `standard` / `ptc` / `cordis` 各派生一个 **`<id>+hub` 预设**：组合与原预设相同，只是官方 `subagent` / `subagent_fork` 换成 `delegate`。新会话选 `+hub` 预设即启用；官方预设不变。
- **`delegate`**：主 agent 传 `agent`（具名 agent）和/或 `needs`（能力标签），插件解析成具体 provider/model，跳过不可用的路由，并把选择与理由写进工具结果（`meta.subagentHub`）。
- **具名 agent**：每个定义注册为一个预设（基于 `basePreset`，去掉委派工具，指令追加到人设）。具名 agent 的子会话不能再委派。
- **`define_subagent`**：主 agent 在会话里创建具名 agent。定义永远记进会话日志（会话层），所以即使晋升被拒也能在当前会话使用。
- **审批后晋升**：`persist: workspace` 写 `<cwd>/.dsh/subagents/<id>.yaml`；`persist: profile` 通过 `configEditor` 写入 profile 的 `cordis.patch.yml` 并即时生效。两者都需要 `approval.request` 的 `allowed-once`，被拒则退回会话层。
- **预算上限**：`maxConcurrent`（默认 4）和可选的 `maxTokensPerSession`。超限时 `delegate` 直接拒绝，并把原因交给主 agent，让它自己做而不是继续派发。
- **外部定义来源**：`ctx.subagentHub.registerSource({ id, priority, definitions })`，给中央服务按租户下发具名 agent 留的接口。优先级介于工作区层与会话层之间。
- **设置页**：插件页里 `dsh-subagent-hub` 那一行的配置卡片，可增删改路由与具名 agent，一次 `mutate` 原子保存（带修订号）。配置字段声明为 volatile，保存不需要重载插件。
- **“子代理路由”侧栏页**：右侧栏“+”引导页里的入口。列出本会话每次 `delegate`：标签、具名 agent、路由选中的模型、**子会话实际使用的模型**（不一致时警告）、选择理由、跳过的路由数、token 用量，以及按模型汇总。点击一行在右栏打开官方的子会话对话。

## 数据从哪来

| 显示内容 | 来源 |
|---|---|
| 路由记录（模型、理由、回退） | 本插件的会话投影 `subagentHub`，从父会话日志里 `delegate` 的 `tool/result.meta` 折叠而来 |
| 子会话实际模型 | 官方投影 `modelSelection.lastUsed`（子会话） |
| token 用量 | 官方投影 `tokenUsage`（子会话） |

面板打开时调用 `sessions.refreshProjections(父会话)` 加载子会话投影，与官方子代理目录用的是同一条路径。

## 配置

```yaml
- id: subagent-hub
  name: dsh-subagent-hub
  config:
    routes:                       # 偏好顺序；同标签时靠前者优先
      - { id: pro,   provider: deepseek-official, model: deepseek-v4-pro, tags: [reasoning], note: DeepSeek V4 Pro }
      - { id: flash, provider: deepseek-official, model: deepseek-flash,  tags: [fast, cheap] }
    agents:                       # profile 级具名 agent
      - id: reviewer
        description: Reviews a diff and reports findings
        instructions: Report findings only; do not edit files.
        routes: [pro]             # 可选：限定只能用这些路由（D2）
        needs: [reasoning]        # 可选：总是要求的标签
        basePreset: standard      # 默认 standard
    workspaceDir: .dsh/subagents  # 工作区级定义目录
```

工作区级定义放在 `<cwd>/.dsh/subagents/*.yaml`，一个文件可以是单个定义或列表，同 id 覆盖 profile 级定义。

## 路由规则

1. 没有具名 agent 约束、也没有 `needs` → 子 agent 继承父 agent 的模型。
2. 具名 agent 声明了 `routes` → 只在这些路由里选；否则整张路由表都可选。
3. 按 `needs`（调用时的 + agent 自带的）过滤标签，再按顺序预检，取第一条可用的。
4. 全部不可用或没有匹配 → `delegate` 报错并说明原因，不会悄悄降级到别的模型。

## 具名 agent 的三层来源

| 层 | 位置 | 生效范围 |
|---|---|---|
| session | 会话日志（`define_subagent` 的结果） | 本会话及其子会话 |
| source | `registerSource()` 注册的外部来源（如中央服务） | 由该来源决定 |
| workspace | `<cwd>/.dsh/subagents/*.yaml` | 该工作区的所有会话 |
| profile | 插件配置 `agents` | 所有会话 |

同 id 时近的覆盖远的：session > source > workspace > profile。外部来源之间按 `priority`（小的先，被大的覆盖）与 id 排序。

## 预算

```yaml
config:
  maxConcurrent: 4          # 同一会话同时运行的子 agent 上限
  maxTokensPerSession: 200000   # 可选：该会话子 agent 的累计 token 上限
```

用量来源：还在运行的子 agent 直接读它们的 `tokenUsage` 投影；已结束的子 agent 在 `agent/disposed` 时记下最终总量（每个子会话取最新值，续聊不会重复计）。账本是进程内的，重启后清零。拿不到用量时不拦截（缺数据不能把派发卡死）。

## 测试

```sh
bash test.sh   # 仓库根目录：单元测试 + 真实运行时 e2e（临时 DSH_HOME，无模型凭据，不碰你的 profile）
```

## 已知限制（M1）

| 限制 | 计划 |
|---|---|
| 预检只确认路由已注册，**不检查凭据和额度**；凭据缺失会在子 agent 首次请求时才失败 | M4：接 `agent/request-error` 做运行期降级 |
| 具名 agent 的预设会出现在新会话的预设选择器里（名称 `Hub agent · <id>`，排在最后） | 视官方是否提供隐藏标记再处理 |
| 工作区级 agent 的预设是按需注册的；重启后，在它下一次被 `delegate` 用到之前，它的旧子会话无法续接 | M3：启动时扫描工作区 / 会话日志预注册 |
| 未指定具名 agent 的子会话沿用父组合（`+hub`），可以继续委派，深度受全局上限约束 | 按需加配置 |
| `delegate` 在对话流里显示为通用工具卡片 | 侧栏页已提供完整信息；卡片美化待定 |
| 侧栏页与设置页的渲染、注册与交互由单元测试（真实 React 18.3.1）覆盖，bundle 加载由 e2e 覆盖，但**未在已连接页面中截图验证** | 安装到真实 profile 时验证 |
| token 预算账本是进程内的，DSH 重启后从头累计 | 需要跨重启精确控制时，接中央服务记账 |
| `persist: profile` 要求该行的配置来自 profile 自己的 patch；被 home patch 或 `--patch` 覆盖时 Host 会拒绝写入，此时定义退回会话层并在结果里说明 | 由设置页或 profile patch 管理该项配置 |

## 与其他子代理插件共存

| 插件 | 关系 |
|---|---|
| `dsh-subagent-default-model` | **兼容**。它对已带 `agentOptions` 的派发原样放行，不会覆盖路由选择。但它的连接失败故障转移对所有子代理生效，会把子代理切到它自己的模型池——此时具名 agent 的路由约束（D2）被突破。侧栏页会把这种情况标成“实际运行：…”警告。 |
| `dsh-subagent-library` | **功能重叠**，同样提供名为 `delegate` 的工具。两者同时启用时，`+hub` 预设里的 `delegate` 注册在预设作用域，会遮蔽全局同名工具；建议只启用其一，或把本插件的 `toolName` 改名。 |
| `@aiwayds/dsh-subagent-registry` | 功能部分重叠（`use_agent`），工具名不冲突。 |
| `dsh-better-sidebar` | 互补。它的子代理视图展示树和实时活动，不展示模型与路由理由。 |
