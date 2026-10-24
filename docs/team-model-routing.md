# Team 与子 agent 的模型路由

适用版本：Hub **0.10.2**，已验证 DSH Desktop 0.12.1 / `@deepseek-ai/dsh` 0.2.1-rc.2。

## 为什么 Team 成员没有使用 MiniMax

目标运行时的 `spawn_teammate` 输入只有 `name`、`description`、`prompt`、`context`。它不接受 LLM 的 `provider`、`model` 或 `agent_preset`。

| 工具或模式 | 历史 | 模型选择 |
|---|---|---|
| `spawn_teammate(context=fresh)` | 不复制 Lead 历史 | 继承 Lead 模型 |
| `spawn_teammate(context=fork)` | 复制已完成的 Lead 历史 | 继承 Lead 模型 |
| `subagent_fork` | 继承父上下文 | 本次验证的 schema 不提供模型参数 |
| `subagent` | 独立子任务 | 官方模型选择启用后，可用实际暴露的 `provider` / `model` |

`context` 选择历史，不选择模型。Team 配置中的 `freshProvider` / `forkProvider` 指的是 `spawn` / `fork` 子代理执行后端，也不是 LLM 供应商 id。

因此，“下次给 spawn_teammate 显式传 provider/model”不是当前运行时可执行的修复。

## 0.10.2 的保护

非空的 Hub 全局 `routes` 现在同时检查 `subagent`、`subagent_fork` 和 `spawn_teammate` 的实际创建路由：

- 工具确有模型参数时，检查显式选择；未指定时检查父模型继承。
- 工具没有模型参数时，只按继承路由检查，额外塞入的模型参数不能绕过检查。
- 路由越界、无法确认模型或非空配置没有有效路由时，在创建子会话或登记 Team 成员前拒绝。
- 具名预设的 `agents[].routes` 在全局范围上继续收紧约束；Team 不支持该预设参数，不会按成员名称猜测角色。
- 全局 `routes: []` 表示没有配置这条创建边界，保留原生继承。

例如，父模型为 `codex/gpt-6.1-sol`，允许列表只有 MiniMax，调用 Team fresh 或 fork 都会在启动前被拒绝。错误会指出实际继承模型、允许模型和当前工具是否支持选择模型。

标签仍然是选择提示，不是计费核验。若要硬性限定所有新建子 agent 只用 MiniMax，应让全局路由表只包含你认可的 MiniMax 路由；包含多个路由就允许在这些路由内选择。

## 如何用 MiniMax 做实现任务

先确认当前会话的 `subagent` schema 确有 `provider` 和 `model`。在本次真实运行时新会话中，启用官方模型选择后，这两个字段可用。示例参数如下；供应商和模型必须已存在于你的 DSH 目录：

```json
{
  "description": "Implement the model server",
  "provider": "minimax",
  "model": "MiniMax-M3.1-Flash",
  "prompt": "Implement the model server and run focused checks."
}
```

实现任务可以使用普通子任务；无需选择只读 reviewer 角色。如果需要耐久 Team 成员，当前原生接口要求 Lead 本身使用允许的模型，然后成员继承它。Hub 不添加虚构的 Team 模型参数，也不自动切换主会话模型。

若当前会话没有模型参数，核对官方配置托管或手动 allowlist；升级插件代码后重启 DSH，并开始新会话。已有会话保留启动时的工具 schema。

## 已有成员与保护范围

这项检查发生在创建工具执行前。已有成员不会自动改换模型；向旧成员 `send_message` 可能继续唤醒其原有路由。需要改变已有 Team 的模型时，先停止旧成员，并在正确模型的新会话中建立 Team。

其他插件在请求阶段改写模型也不在创建检查的覆盖范围内。并发上限仍按 `delegationTools` 配置执行；Team 的原生容量由 Team 运行时管理。

## 验证

[Host 入口回归](../packages/subagent-hub/test/team-guard.test.js) 使用报告中的 Codex / MiniMax id，并先观察到旧实现放行，再验证修复后拒绝。

[真实 Team 驱动](../packages/subagent-hub/test/e2e/driver/team.js)在隔离的 DSH_HOME 中读取原生 schema、实际请求记录和 Team roster：确认 fresh/fork 都继承；收紧列表后没有产生被拒绝的成员或子会话；允许路由仍正常创建；model-less independent fork 也被阻止。测试使用 SDK 自带的 Flash / Pro 路由作为允许 / 禁止配对，并拦截所有模型流，不调用外部模型。

```bash
node --test packages/subagent-hub/test/team-guard.test.js
HUB_TEAM_E2E=true bash packages/subagent-hub/test/e2e/run.sh
```
