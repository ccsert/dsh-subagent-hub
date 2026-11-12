# 子智能体总览契约

状态：0.11.0 起提供，0.13.0 迁入官方右侧栏，默认关闭。入口位于 Desktop 官方 `conversation.session.header.actions` 插槽；不替代官方会话、派发工具或任务服务。

## 数据与状态

0.14.0 沿经 catalog 证明的父子关系递归读取 `subagentCatalog`、`agentTeam`，以 Session id 去重，排除 Lead。成员 name、label、路径分开；根 Team 模式作用于整棵树。最多 512 成员、32 层，超限提示；不从全局 Session 猜测成员关系。

- 运行状态以原生 status store 为准，名册补充创建中、创建失败。Team 空闲不表示任务完成；只有独立 one-shot 存在停止且正常结束的 timing 证据时才标为完成。
- `modelSelection.lastUsed` 是最近请求证据，`next` 单独显示为下次计划。未请求与数据缺失分别呈现。
- 执行时间为 `subagentTiming.settledMs` 加活动回合时间，不计回合间空闲；已停止的回合固定到 `through`。只在面板打开且有运行成员时更新时间。
- Token 为 `uncachedInputTokens + outputTokens + cacheReadTokens + cacheWriteTokens`，注明统计覆盖成员数。未知不是零，不估算费用。
- 缺失投影、加载中、加载失败、需要迁移、真正空目录分别呈现。保留上次成功数据时同时提示读取错误。

默认用量分析按公开 `agentPreset` 投影归组角色，区分未确认与未使用 Hub 角色；显示输入、缓存、输出、重试覆盖和实际路线。配置对照只比较当前配置与历史最近请求，显式覆盖或配置更新可能造成差异，不代表失败。未知用量不计为零，估算标注，分路线记录小于会话总量时披露。共享任务负责人优先按 `ownerId` 精确匹配；旧 name-only 名册须唯一匹配。

## 交互

入口默认关闭，使用原生配置字段 `showAgentOverview: false`（volatile）。设置页和插件配置卡片共用「显示子智能体总览」开关，随其他字段原子保存；保存后实时挂载/卸载总览，关闭时不订阅会话数据，也不执行面板刷新。已打开的面板在关闭设置时一并卸载、清理计时与后续刷新调度。官方团队 UI 不受影响。

入口对齐安装版官方 Team 控件：无边框、28px 最小高度、3px × 7px 内边距、6px 圆角和 5px 图文间距；使用原生图标、三级标签色与独立等宽数字计数，hover/focus 提升为主标签色。容器宽度 ≤480px 隐藏文字，保留图标、计数及完整无障碍名称。

面板提供名称/模型/Session ID 搜索、类型和状态筛选、活动/创建时间/名称/耗时/用量排序、成员证据详情、共享任务板、依赖与写入警告、诊断页和原生会话导航。导航失败保留面板并显示错误；external/unknown 模式禁用导航。

打开面板或点击刷新时按层广度优先读取投影，从最新目录发现子会话，最多四个并行读取；读取与展示采用同一截断顺序。关闭后停止安排新的读取；已发出的只读请求可以完成。刷新不 retain 或迁移会话，不触发模型请求。实时更新依赖原生会话列表/状态订阅，刷新补齐持久化投影。

通过 `sidebarRightTabs` 注册页签类型，通过 `sidebar.right.pane.tab` 提供 keyed body；由 `sidebarRight.openTabIn(sessionId, kind)` 打开。收起、关闭、尺寸和会话归属交给宿主；组件读取 `useTabInfo().tab.visible`，隐藏时停止高频刷新。可见表单标签、键盘操作、中英文文案及浅/深色原生语义色保留。

## 持久拒绝历史

`subagentHubDispatch` 是原生 session projection，从已提交 `tool/call` 与 `tool/result` 回放，不依赖浏览器临时数组。结构化 `error.reason` 以 `subagent-hub:` 开头时可识别；当前 SDK 的前置守卫未附结构化 info，因此也识别原生派发工具及 `hub_spawn_teammate` 失败结果中的原生单块 `Error: subagent-hub: ...` 文本。其他工具、成功输出和普通用户消息不会被此文本回退识别。

保留最近 64 条识别到的拒绝及回放计数；关联待完成调用最多 128 条，不保留工具参数、提示词或成功输出。记录包含时间、事件 seq、调用 id、工具名和原因。投影不可用与没有已识别记录分别呈现。替换既有 surface 的结果不算新派发。

范围是该 Session 可回放日志，包括原生分叉继承的事件，不是全局审计日志；日志外、未提交或无法关联的旧文本拒绝不保证覆盖。没有记录不证明历史上从未拒绝过派发。

## 验证与边界

单元测试覆盖成员合并、状态/模型/时间/用量证据、缺失与陈旧数据、筛选、刷新并发和取消、SSR 转义、拒绝历史边界。原生集成通过已安装 Desktop 的真实 list-slot registry 验证入口注册，并在隔离 SDK profile 中将真实 Hub 守卫结果按原生循环格式提交，再读取真实 projection registry 验证回放。

当前浏览器 fixture 使用实际 React 组件、模拟原生 store 与侧栏容器，覆盖筛选、隐藏页签停止刷新、任务导航、空目录、错误恢复和用量组合排除。0.13.0 发布前重新检查桌面设置组件、助手入口、保存冲突和用量色块交互，并直接查看截图像素；截图与来源见[界面预览](screenshots.md)。早期 modal/Esc、窄屏和缩放验收是当时的历史记录，不作为新版侧栏或移动端验收。

0.14.0 开发验证及实际组件 fixture 边界见 [rc.2 兼容与验收](compatibility-rc2.md)。fixture 的原生容器为模拟，未安装或重载用户 GUI，Desktop 端到端仍待验收。
