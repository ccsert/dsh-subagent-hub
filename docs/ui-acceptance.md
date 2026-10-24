# 配置页 0.9.0 验收记录

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
