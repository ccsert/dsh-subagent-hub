# 子会话模型标识验证记录

## 0.10.3：Desktop 挂载错误修复

用户在真实 Desktop 子会话中未看到模型标识。复现发现，标题栏 utilities 是 list 插槽，实际 Desktop 注册器要求 `options.id`；旧代码传入 `key`，抛出 `list slot "conversation.session.header.utilities" requires options.id`，组件根本未注册。

修复为 `id: subagent-hub-model`，并让单测和 fixture 验证该字段。新增[原生消费者回归](../packages/subagent-hub/test/e2e/native-slot.js)，直接读取已安装 Desktop ASAR 中的渲染器注册方法，在隔离 VM 中运行，不连接或改变用户进程。该回归先观察到旧代码失败，修复后验证原生注册、MiniMax 内容渲染及独立贡献清理。非 Desktop 环境使用安装 SDK 的对应注册器。

```bash
node packages/subagent-hub/test/e2e/native-slot.js
bash test.sh
```

本次 102 项单测、31 项运行时断言及 Desktop 原生注册回归通过。原有演示只验证组件和数据，没有覆盖真实注册器，是此次漏测原因。当前用户窗口的可视验证仍需客户端加载修复后的模块；不声称已远程重载 Desktop。

## 0.10.0 组件与数据验证（历史范围）

## 范围与来源

范围是官方子 agent 对话的标题栏，只增加一个只读详情标识。主会话不展示，也不替换官方子 agent 树或模型选择器。

- 槽位：`conversation.session.header.utilities`，session 范围的 list 贡献。
- 生命周期：读取已有 `binding(sessionId).session` 的公开快照，`subagent` 非空时展示。
- 数据：读取 `session.projections.faceOf('modelSelection')` 的裸 wire 值。安装版本的官方投影由 `request/header.config` 推进 `lastUsed`；`next` 是计划选择或最近使用值。
- 展示：最近请求只使用 `lastUsed`。计划不同则另列“下一次选择（尚未请求）”；尚无记录显示“尚未请求”，投影缺失/不完整显示“未确认”。
- 行为：无模型选择 RPC、无额外 Session retain、无定时器、无模型目录或标签推断。订阅绑定替换时释放，详情同时关闭。

实现：[数据解释与公开 shares](../packages/subagent-hub/lib/client.js#L1600)、[ModelBadge](../packages/subagent-hub/lib/client.js#L1630)、[官方槽位注册](../packages/subagent-hub/lib/client.js#L1719)。

## 验证

```sh
node --check packages/subagent-hub/lib/client.js
bash test.sh
node packages/subagent-hub/test/browser/render-model-fixture.mjs
```

最终回归为 **87 项单测、23 项真实运行时 e2e 全通过**。e2e 使用临时 `DSH_HOME`、真实派发与持久化请求记录、脚本化模型流，不调用外部模型。

| 检查 | 证据与结果 |
|---|---|
| 真实子请求 | [e2e driver](../packages/subagent-hub/test/e2e/driver/index.js) 读取真实子 Session 的官方投影，再运行实际 Client 的解释函数；named child 显示已记录的 Flash |
| 子模型不同于父模型 | 父模型为 Flash、generic child 显式选择 Pro，显示 Pro，避免误用父模型 |
| 未请求 | 创建选项配置 Pro 但尚未请求的真实子 Session 仍为 waiting，没有已使用模型 |
| 主会话 | 主 Session 的解释结果 hidden；浏览器切换到主会话时无标识 DOM |
| 公共契约 | [单测](../packages/subagent-hub/test/model-badge.test.js) 验证 slot 与 session face 的读取，不调用 retain、目录或模型选择接口 |
| 实际组件交互 | 浏览器 fixture 通过真实 `apply` 注册的贡献渲染，使用安装版本官方标题栏 CSS 和槽位结构；Enter / Space 展开，Esc 关闭并返回焦点，外部点击关闭 |
| 实时与导航 | 更新请求投影后标识和打开的详情更新；直接替换 Session 时关闭详情，旧 Session 与 projection 订阅均归零 |
| 状态与计划 | waiting 不把 next 显示为已用模型；unknown 不猜测；lastUsed 与 next 不同则分开显示 |
| 可访问性 | Chrome AX 树暴露原生 DisclosureTriangle、完整 accessible name、expanded=true；2px 键盘焦点环；关闭详情时状态播报仍在可访问树中 |
| 窄屏与长 id | 320px 下文档无横向溢出；长 id 在详情折行，实测内容宽度与 scrollWidth 均为 294px |
| 缩放 | 祖先 CSS zoom=2 后浮层保持在 800×720 视口内，长内容允许垂直滚动；系统/浏览器级缩放未作等价声明 |
| 颜色偏好 | 沿用官方主题 token。强制颜色模式保留 2px 焦点环；浅色 token 样本中标签 rgb(98,103,114) 对白色为 5.67:1，达到普通文字 4.5:1 |
| 文案与故障边界 | 中英文请求详情及等待状态通过；最终浏览器加载无 pageerror |

浏览器 fixture 是实际贡献组件配合内存 Session face，不是用户当前 Desktop 进程。生成物位于 `output/playwright/`：桌面、320px 和浅色 token 预览；不提交生成 HTML 或截图。

## 验收中修正的细节

| Severity | Location | Before | After | Why |
|---|---|---|---|---|
| MEDIUM | [ModelBadge](../packages/subagent-hub/lib/client.js#L1630) | 状态播报位于 details 折叠内容里 | 移到可折叠内容之外，保持稳定 live region | 关闭详情时仍能宣布模型更新 |
| MEDIUM | [浮层位置](../packages/subagent-hub/lib/client.js#L1656) | 祖先 200% CSS 缩放后混用局部坐标和视口坐标，测得 x=838、宽=640，超出 800px 视口 | 测量比例和原点并按视口限制宽高；修复后 x=50、宽=640、高约696，处于视口内 | 放大阅读时仍能读完整 id |
| MEDIUM | [浮层位置](../packages/subagent-hub/lib/client.js#L1656) | 只按主标签变化定位，计划选择单独改变时高度可能变化 | 计划路由及推理档位改变时也重新定位 | 新增详情行不会停留在旧的边界位置 |

## 已知边界

记录表示该 Session 历史中最近一次请求的路由，不是调用成功或计费证明。fork 的继承前缀也属于历史，在新的请求记录出现前可能显示继承的最后请求。这里不推断“免费”。

未验证：真实屏幕阅读器的语音输出、实际 Desktop 进程重启后的挂载、所有第三方插件的样式组合、系统级 200% 缩放。未修改用户 profile、重启其 Desktop，或声称本轮已在用户正在使用的 GUI 里重载组件。

**Approve（限上述已验证范围）**：当前范围没有待修复的 HIGH 可访问性或 UI 问题；上述验收发现均已修正。
