# dsh-subagent-hub

DSH 插件：具名子 agent、按能力标签选子 agent 的模型、`delegate` 工具。目标运行时 `@deepseek-ai/dsh` 0.2.1-rc.2。

## 它做什么

- 为 `standard` / `ptc` / `cordis` 各派生一个 **`<id>+hub` 预设**：组合与原预设相同，只是官方 `subagent` / `subagent_fork` 换成 `delegate`。新会话选 `+hub` 预设即启用；官方预设不变。
- **`delegate`**：主 agent 传 `agent`（具名 agent）和/或 `needs`（能力标签），插件解析成具体 provider/model，跳过不可用的路由，并把选择与理由写进工具结果（`meta.subagentHub`）。
- **具名 agent**：每个定义注册为一个预设（基于 `basePreset`，去掉委派工具，指令追加到人设）。具名 agent 的子会话不能再委派。

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
| `delegate` 在对话流里显示为通用工具卡片 | M2 |
