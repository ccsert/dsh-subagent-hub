# 配置页与总览验收记录

## 原生右侧栏（2026-11-11，0.13.0）

总览通过官方 `sidebarRightTabs` 注册 `subagent-hub-overview` 页签类型，通过 `sidebar.right.pane.tab` 提供页面。标题栏只调用 `sidebarRight.openTabIn(sessionId, kind)`；页面使用 `useTabInfo().tab.visible` 控制刷新。插件不再维护 popover、窗口坐标、独立关闭或侧栏布局。

验证环境为安装的 DSH SDK 0.2.1-rc.2、隔离的 Web profile 与脚本化模型流；未修改用户 profile、未调用外部模型。原生类型注册与 keyed/list 插槽回归通过，272 项单元测试通过，文档与打包检查通过。

真实 DSH 浏览器检查覆盖：标题栏打开原生页签、重复打开不增加重复页签、成员与用量显示、模型色块隐藏和全部恢复、官方收起/展开后保留当前页、375px 原生全屏无横向溢出、切换会话后页签归属隔离。[成员截图](assets/overview-sidebar.webp)与[用量截图](assets/usage-sidebar.webp)来自该真实宿主。

独立组件 fixture 另行检查：隐藏页签后停止 3 秒高频刷新、收起后保留筛选、打开成员不主动关闭侧栏、关闭功能时卸载读取组件并显示启用说明。fixture 的侧栏容器是模拟宿主，不作为原生侧栏验收证据。

迁移初验时曾有四项旧集成失败，未修改 HEAD 也可复现。本轮已修复：Hub 不再用 activation 驻留 start/end 计算执行并发，而读取原生 Agent 当前 running 与精确归属；driver 按宿主能力使用单调用或批量执行，并对普通子任务等待原生 whenIdle。普通运行时 26 项、Team 专项 8 项全部通过，空闲释放与消息唤醒占位均有真实断言。

共享任务板在隔离的当前 SDK 中以原生 Team 服务创建四项持久化任务，覆盖进行中、依赖阻塞、可开始、已完成。浏览器验证状态/负责人组合筛选、空结果恢复、依赖定位与焦点、真实负责人会话导航；组件 fixture 另测英文、键盘、320px 与 RTL。当前客户端未提供匹配的写命令，未添加假写入入口。

---

## 0.9.1 同步提示回归修正

用户反馈保存提示停留在“正在同步官方配置”。真实 Host 中复现了根因：`preset-standard` 是配置条目 id，不是 Settings 服务暴露的表单命名空间。0.9.0 的 fixture 为这个 id 人工返回 ready 快照，导致原验收关于“标准预设可读取”的结论不成立；下文 0.9.0 的同步部分仅作为历史记录。

复现命令：

```sh
bash packages/subagent-hub/test/e2e/run.sh
```

修复前该命令中新增的 Client 完成检查实际失败，其余后台同步与注册检查通过：

```text
FAIL settings: saved official configuration can leave the syncing state:
{"modelNamespace":"ready","presetNamespace":"unavailable","canFinish":false}
```

修复使用真实公开契约：`agentPresets.list()` 返回角色目录，模型设置仍读取存在的表单命名空间。完成文案只报告模型白名单与角色注册，不声称核对了标准预设的内部工具行。observer 的独立截止计时为 15 秒；请求报错、不返回、旧结果晚到都不会一直显示“正在核对”。未确认可点击“重新核对”，只发起读取，不重复提交配置。

修复后 **78 项单测、19 项真实运行时 e2e 全通过**。e2e 直接执行实际 Client 的 public reader 与 observer，数据来自真实 Host describe 和角色目录；同时覆盖初始就绪与 live 保存，确认在预设表单仍为 unavailable 时可以正常完成。浏览器 fixture 也改为对未知命名空间返回 unavailable。

Playwright 使用实际组件并控制读取行为，验证了：不返回请求在 15 秒后退出忙碌、读取报错后恢复、延迟出现的角色能结束核对、“重新核对”不增加保存次数、320px 无横向溢出且重试按钮可用。计时通过浏览器虚拟时钟推进；最终完成文案为“已保存；模型白名单已同步，具名角色已注册。”

对应实现与回归：[Client](../packages/subagent-hub/lib/client.js)、[observer 单测](../packages/subagent-hub/test/sync-observer.test.js)、[真实运行时 driver](../packages/subagent-hub/test/e2e/driver/index.js)、[e2e 断言](../packages/subagent-hub/test/e2e/assert.js)。

本轮没有修改用户 profile、重启 DSH，或声称已在用户当前 GUI 进程中加载补丁。部署仍需要重启现有 Desktop 进程。

---

以下为 0.9.0 的原始验收记录。

## 范围与约定

范围是“设置 → 子代理中枢”以及共用同一表单的 Plugins 配置入口，覆盖模型选择、角色模板、编辑校验、保存、撤销、预览与窄屏。代码采用 React 手写 module-loader 模块、原生表单控件、官方 `--dsw-alias-*` 主题变量，无新增运行依赖。现有约定来自 [设计文档](design.md) 与 [插件说明](../packages/subagent-hub/README.md)；仓库未发现额外的 AGENTS、CLAUDE、CONTRIBUTING 或 CODING_STANDARDS 文件。

实现先交给指定的 `magpie / minimax-cn/MiniMax-M3.1-Flash` 子 agent，再由主 agent 审阅、修正并验收。该路由在用户当前配置中标记为“免费”。这不构成计费平台账单核对。

| 领域 | 实际检查证据 | 结果 |
|---|---|---|
| 可访问性 | 浏览器可访问树、可见输入与选择器的名称；无效保存后的聚焦；中文标签输入；减少动态效果 | 已修复标签关联、错误聚焦、输入法问题；最后检查的可见控件无未命名项。未运行真实屏幕阅读器 |
| 布局 | 1100px 桌面截图、760px / 320px 展开卡片；英文 760px | 320 与 760 的 document scrollWidth 分别为 320、760，无横向溢出 |
| 文案 | 中英文文案与字典、错误恢复提示、复制失败提示、保存结果 | 操作名与结果一致；失败保存不再报成功；字段错误说明修复方法 |
| 排版 | 实际长模型名、预设 id、展开角色指令、窄屏折行 | 原生选择器可展开查看完整选项；长引用在窄屏折行，角色摘要可展开 |
| 颜色 | 暗色 fixture 实际计算样式 | 辅助文字 `rgb(140,140,140)` 对面板 `rgb(35,37,41)` 为 4.56:1，达到普通文字 4.5:1。未验证实际 DSH 的所有主题覆盖值 |
| UI 细节 | 分组、间距、按需出现推理下拉、选中值、删除撤销、复制反馈 | 已检查桌面和窄屏状态；减少动态效果下开关拇指 transitionDuration 为 0s |

## 验收发现与修正

下表是验收中发现并已修复的根因，位置指向最终实现。

| 级别 | 领域 | 位置 | 原问题 | 最终实现 | 影响 |
|---|---|---|---|---|---|
| HIGH | 可访问性 | [Field](../packages/subagent-hub/lib/client.js#L798) | 可见字段标题没有绑定输入框，错误仅靠边框表示 | 关联 label、帮助与错误；保存时展开错误卡片并聚焦首个错误 | 键盘与辅助技术能定位并修复问题 |
| HIGH | 交互可靠性 | [save](../packages/subagent-hub/lib/client.js#L1295) | mutate 返回 false 仍显示成功；未完成行可能被排除在修改检测之外 | 明确收到 true 才成功；按完整可见草稿比较；失败保留内容 | 避免误以为配置已落盘 |
| HIGH | 交互可靠性 | [changeRoute / restoreDeletion](../packages/subagent-hub/lib/client.js#L574) | 清空再改名可能断开引用；撤销按数组下标恢复关联 | 稳定行身份与上一有效引用名；按 agent 身份撤销 | 防止模型限制关联到错误对象 |
| MEDIUM | 反馈 | [officialSyncReady](../packages/subagent-hub/lib/client.js#L623) | 仅发现预设 id 就声称所有配置已同步 | 同时核对标准预设与模型白名单；未就绪快照不算成功 | 同步状态与实际核对范围一致 |
| MEDIUM | 文案 / 反馈 | [copyPreview](../packages/subagent-hub/lib/client.js#L1335) | 剪贴板拒绝时没有恢复指引 | 展开预览并提示手动选择复制 | 失败后仍能完成复制任务 |
| MEDIUM | 布局 / 动态效果 | [样式](../packages/subagent-hub/lib/client.js#L787) | 长名称、窄屏控件与动态效果偏好未充分处理 | 长文本折行、窄屏重排、强制颜色与 reduced motion 规则 | 在已检查宽度和偏好下能继续使用 |

## 验证

通过的命令：

```sh
node --check packages/subagent-hub/lib/client.js
node packages/subagent-hub/test/browser/render-fixture.mjs
bash test.sh
```

最终测试结果：**71 项单测通过，17 项真实运行时 e2e 通过**。e2e 使用临时 `DSH_HOME` 和脚本化 `llm/stream`，不会调用模型，也不会写用户 profile。

浏览器验收使用实际 Client 模块和内存配置 fixture，在 `http://127.0.0.1:18765/settings.html` 通过 Playwright 操作，验证：

1. 并发快捷值、拒绝保存后的草稿保留、重试成功与同步提示结束。
2. 路由名清空再重写后，agent 引用更新；Cmd+S 保存当前草稿。
3. 测试模板填好名称、用途和指令，新卡片展开。
4. 删除路由 / agent 后撤销，原来的允许模型选择恢复。
5. 新增空行仍可“放弃修改”；分组选择模型后自动建议路由名，并按模型能力显示推理档位。
6. 重复路由名时定位首个无效输入，并显示就近说明。
7. 复制预览写入实际目录；剪贴板拒绝后提示手动恢复。
8. 中文组合输入的 Enter 不提前提交标签，组合结束后可正常加入。
9. 桌面、760px、320px 及英文 760px；最终加载过程没有 Client pageerror。

截图由验收命令生成于 `output/playwright/`，不提交生成文件。截图包含 fixture 标识，代表真实组件在测试数据下的效果，不代表用户当前 DSH 进程已经加载新版。

未验证：真实屏幕阅读器、系统级 200% 浏览器缩放、实际 DSH 全部明暗主题和其它第三方插件的 CSS 覆盖。没有重启用户 DSH，也没有把测试数据写入用户配置。

## 插件现场验证

- 默认模型池最初选到了 `qodercn/qfmodel`，子任务在调用模型前因“未配置凭据，请先登录”失败。随后显式指定上述 MiniMax 路由完成实现；未修改 profile 或替用户配置凭据。
- 一次具名 reviewer 省略模型的调用会继承父路由；因为不在 reviewer 允许的 MiniMax 路由内，被 `subagent-hub:` 守卫拒绝。该测试验证了派发前的越界拒绝，不能据此推断所有入口都已有模型选择参数。
- 完整 e2e 另外验证官方 `agent_preset`、配置落盘、live 重配置，以及并发上限 1 时拒绝第二个运行中的子任务。

## 结论

**Approve（限上述已验证范围）**：验收发现的阻断问题已修复，当前测试范围内未发现待修复的 HIGH 问题。部署到用户当前 Desktop 进程仍需要其重启加载新的 Client bundle。

## 后续改动验证（2026-11-11）

`hub_spawn_teammate` 已在 SDK 0.2.2-rc.1 的隔离 Web profile 通过 58 项专项断言：初始进程 41 项，关闭后以新 OS 进程恢复 17 项。确认首次请求、fresh/fork、多个供应商、非 GPT Lead、角色与思考强度、消息唤醒及原成员身份/模型的恢复；并验证路由/角色/容量元数据不满足时不会先登记成员。模型流全部拦截，不访问真实供应商模型。

整套回归为 285 项单测、31 项普通运行时断言、8 项原生 Team 断言、58 项跨模型 Team 断言及实际安装 SDK 插槽回归；文档和打包检查通过。先前的 272/26/8 是当时的历史记录，不是当前计数。

紧凑单列设置页仅包含单测回归，本轮没有恢复该页面的浏览器视觉验收。Desktop 安装件兼容、HMR、真实模型接口调用仍待验证；未将源码或隔离 SDK 测试视为已在用户 Desktop profile 加载。

### 追加：真实 Qoder Team 验证

使用用户当前已配置的 Magpie Qoder 通道，在独立临时 profile 中直接调用真实模型：Qwen4-Max-Preview Lead、DeepSeek-Flash fresh 成员、Qwen4 fork 成员，验证角色校验词、计算结果及 Flash 唤醒后保留原模型。另以 DeepSeek-Flash 担任 Lead，由模型自行调用 `hub_spawn_teammate` 创建 Qwen4 成员，成员回复经原生通道返回后，Lead 成功汇总。最终两条流程共 19 项检查通过，无运行时错误。

初次自主流程的路由和结果成功，但测试要求只调用创建工具，模型额外使用原生 `wait_agent` / `list_agents`，触发过严断言。调整测试允许正常协作工具后，重新真实调用，7 项全部通过。共 21 次真实适配器调用（含初次流程与自动标题），适配器报告输出 1,418 tokens；不由 token 数推算订阅扣费。原始记录及汇总保存在本地 `output/team-verification/real-qoder/`。

以上模型名称来自既有配置，未独立认证网关下游模型身份。未改用户 profile 或 DSH 源码，临时进程已停止，复制的单项凭据已移除。此次验证不覆盖 Desktop 安装件、HMR、真实进程恢复与长历史压缩，也没有新增设置页面视觉验收。

### 0.13.0 发布前桌面组件验收

2026-11-11 使用 Chromium / Playwright 重新渲染并截图当前 Client：桌面视口 1120px，设置内容区 560px，侧栏内容区 460px。角色、模型、常规页签和展开高级设置均已重拍；单列角色一次展开一个，内容无横向溢出。配置助手按钮确实导航到 `hub-configurator`，并保留已有草稿会话。

验证未保存草稿时禁用助手入口；模拟另一编辑器将并发更新到 8 后，旧草稿保存被版本检查拒绝，草稿保持可见；放弃旧草稿、读取最新值后重新编辑保存成功，并保留并发 8。页面报告模型白名单与角色注册已同步，浏览器无错误。

用量页直接点击「已结束」色块/整行，再点击一个模型图例，组合排除同步作用于树图与列表。没有额外 checkbox 输入；总量仍为演示值 5.76B，筛选后另列 5/47 个成员、805M、占总量 14%。新截图使用 50 个合成成员的实际组件，模拟侧栏容器；与原生侧栏截图的来源分别标注。未新增移动端或用户 Desktop 安装件验收。

本次发布检查还通过全量 285 项单测、97 项隔离 SDK 运行时断言及安装 SDK 插槽回归。图片、链接、市场截图声明与 0.13.0 归档内容检查均纳入发布检查。
