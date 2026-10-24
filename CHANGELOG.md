# Changelog

## 0.9.1 — 修复保存后同步提示无法成功结束

- **根因**：客户端把 `preset-standard`（预设条目 id）当作可读取的 Settings 表单命名空间；真实 Host 没有服务这个表单，其状态一直是 `unavailable`，导致后台已经写入也无法进入成功分支。0.9.0 的浏览器 fixture 错误地返回了一个 ready 预设快照，漏掉了这个问题。
- 改用公开的 `agentPresets.list()` 核对角色注册，并读取确实存在的 `subagent-model-selection-settings` 核对模型白名单。提示明确描述核对范围，不再声称已读取标准预设内部工具行。
- 核对有独立的 15 秒截止计时；读取报错、请求不返回、快照尚未更新都会退出忙碌状态。未确认时提供“重新核对”，只重新读取状态，不重复写配置。取消、卸载、后续保存和超时后的旧请求均不会覆盖当前提示。
- 修正 fixture，使不存在的命名空间返回 unavailable；增加可控的延迟、报错和不返回模式。
- 回归：78 项单测、19 项真实运行时 e2e 全通过。其中新增初始配置与 live 保存后 Client observer 能结束的真实 Host 断言；修复前已实际观察到失败。Playwright 验证不返回请求的截止、报错恢复、延迟成功、无重复写入重试，以及 320px 的恢复按钮。

## 0.9.0 — 配置交互与视觉精修

- Provider 与 Model 合并为按供应商分组的模型选择器；不支持推理档位的模型不显示空下拉。已存但离线的模型仍可保留，并在选项上注明。
- 并发设置增加 1 / 2 / 4 / 8 / 不限快捷值。新增具名 agent 提供代码审查、测试、调研、空白四种模板，带用途和指令，新卡片自动展开。
- 重复名称、缺失用途、无效路由等问题显示在相应字段旁；可用键盘保存并跳到第一个错误，控件的标签、帮助和错误均有程序化关联。
- 删除路由或 agent 可撤销。路由改名同步更新引用；临时清空名称或输入重复名不会丢失原关联；删除与撤销通过稳定行身份恢复正确的 agent。
- 保存条支持 Ctrl/Cmd+S；未完成的新行也算修改；Host 返回 `false` 时保留草稿并报错，不再假报保存成功；只有模型白名单与标准预设均匹配才结束同步提示。
- 预览可复制，剪贴板不可用时展开文本并提供手动复制指引。修复中文输入法组合期间误提交标签，补上官方预设列表的 remote 注入。
- 统一分组、间距、选中与聚焦状态，适配 320px / 760px，支持减少动态效果与系统强制颜色。
- 验证：71 项单测、17 项临时 profile 的真实运行时 e2e 全通过；Playwright 实际验证模板、改名、删除撤销、失败保存恢复、快捷键、中文输入、复制和窄屏。详见 [配置页验收记录](docs/ui-acceptance.md)。

## 0.8.0 — 每会话并发上限；配置页视觉重做

- **并发上限 `maxConcurrent`（默认 4，0 = 不限，可在界面调整）**：0.4.0 删掉预算是因为当时它没有落点；现在落在 `tools/pre-execute` 守卫上。插件监听官方运行时的 `subagent/start` / `subagent/end`，按父会话统计正在运行的子 agent；达到上限时，对官方 `subagent` / `subagent_fork` 的再次派发在启动前拒绝，并提示主 agent 等待或自己完成。选择目录里也会写明上限。它与官方全局“并行容量”同时生效。
- **配置页视觉重做**：改为与官方设置页一致的分组面板；基础设置用“设置行 + 步进器 / 开关”；模型路由行带序号、下拉与图标操作，副行是路由名 / 标签框（内联输入 + 一键建议）/ 备注；具名 agent 改为可折叠卡片（头像、名称、`hub-agent-<名称>`、用途、允许模型摘要），展开后编辑，允许的模型改为可切换按钮；目录预览改为可折叠面板；底部保存栏吸底，显示“有未保存的修改”与同步进度；字段名全部本地化。
- 模型目录加载完成前不再把已存值误标为“不在当前目录”。
- 测试：53 项单元测试 + 17 项 e2e（新增并发上限的真实运行时断言：一个子 agent 运行中，第二次派发被拒绝）。

## 0.7.0 — 保存反馈：同步状态真的会结束

0.6.x 的页面在保存后一直停在“已保存，正在同步官方设置…”，既不结束也不报错——用户无法判断是在等还是卡住了。同步本身也确实慢：官方 allowlist 写在官方预设行里，每写一行就是一次 profile 重载（本机 profile 有多个预设，每次重载都要重建整棵预设树）。

- **状态会收敛**：保存后先显示“已保存”，随后显示“正在同步官方 allowlist（Host 需要重载官方预设，通常几秒到几十秒）…”，并轮询官方配置；一旦官方预设行里出现本插件的具名 agent，状态变成“官方 allowlist 已同步”；超过两分钟仍未完成则提示“仍在同步，稍后刷新确认”，而不是一直挂着。
- **Host 侧不再重复同步**：注册具名预设与写官方 allowlist 统一由后台 worker 承担（此前启动路径与 live 编辑路径各跑一次，会重复注册并多写几轮 profile）。
- **写入顺序调整**：先写模型允许列表（`provider`/`model` 参数立刻可用），再写各官方预设的 `allowedAgentPresets`。
- **写入仍然幂等**：内容一致就不重写，所以第二次启动不会再触发预设重载。
- 同步耗时会记入 Host 日志（`managed official settings in …ms`）与 e2e 报告。

## 0.6.0 — 配置页按官方设置页样式重做

0.5.0 把模型做成了“可勾选的模型列表”，可用但不好看，也和官方设置页的观感不一致。这一版改成官方设置页的行式布局。

- **模型路由行**：每条路由是一张卡片，第一行是三个下拉——Provider、Model、推理强度——都取自 Host 模型目录（`provider/model` 显示为 `名称 (id)`）；目录里没有的旧值仍然可选，并标注“不在当前目录”。选模型时路由 id 自动跟随模型名。
- **标签是胶囊**：已加的标签显示为可删除胶囊；下方只列出**尚未添加**的标签，点一下即加入。
- **具名 agent 行**：id + description + 删除按钮一行，instructions 文本域一行，允许使用的路由是胶囊（点击切换），能力标签胶囊，基础预设下拉（官方预设列表），并显示最终的 `hub-agent-<id>`。
- **保存栏**：底部一条分隔线，左侧是状态/错误文案，右侧“放弃修改”“保存”两个按钮，与官方插件页一致。
- **样式**：改用官方设置页的配色与尺寸（`--dsw-alias-*` 变量、10px 圆角、32px 控件高），并为变量提供回退色。
- 测试：48 项单元测试 + 16 项 e2e；新增 provider/model/推理强度选项的来源与旧值保留的断言。

## 0.5.0 — 配置界面重做：从手填表单到选择器

0.4.2 的页面能用，但每个字段都要手打：provider、model、id、标签、路由引用都得凭记忆输入，页面本身也没有官方设置页的观感。这一版把它换成原生观感的选择器。

- **模型不再手填**：读取 Host 的模型目录（`ctx.remote.session.modelCatalog()`），按 provider 分组列出可用模型，勾选即加入路由；路由 id 由模型名自动建议（可改），provider/model 只读展示。仍保留“手动添加路由”兜底。
- **标签用胶囊**：能力标签是可增删的胶囊，常用标签一键点击加入，不再是逗号分隔字符串。
- **具名 agent 的路由改成勾选**：直接勾“允许使用的路由”，不再手填路由 id；基础预设为下拉（取自官方预设列表），id 处实时显示 `hub-agent-<id>`。
- **目录预览**：页面底部折叠区实时显示主 agent 会看到的“模型 → 标签 / 具名 agent → 用途”目录。
- **官方 UI 组件**：使用官方 `@deepseek-ai/dsh-client-ui-primitives`（`SettingsForm`、`Switch`、`Checkbox`、`Button`）与官方主题变量，保存/只读/失败提示由官方表单外壳提供；旧 shell 缺组件时自动降级为原生元素。
- `dsh.client.inject` 补上 locale / ui-settings / ui-plugin-manager / api-remotes，使页面能拿到模型目录与官方预设列表。
- 测试：49 项单元测试 + 16 项 e2e；新增路由 id 建议、目录过滤、标签胶囊、目录预览与模型选择器的断言。

## 0.4.2 — 同一张配置表单也放进“设置”导航

0.4.1 的配置卡片只在 Plugins 页的 `subagent-hub` 行里，入口不够直观（用户会去“设置 → 内置插件”，而那里是官方只读清单）。

- 额外通过官方 `settings.section` 槽位注册一个设置页面“子代理中枢”，与 Plugins 页的行配置共用同一张表单和同一份 volatile 配置；入口在 **设置 → 子代理中枢**，与“Our Free Model / 插件市场”同级。
- 页面在 Host 配置命名空间可用时才出现（`configForms.whileServed`），表单首次加载时会 hydrate 到最新值。
- 两处入口保存的都是同一组字段（`routes` / `agents` / `manageOfficialSettings`），保存即时生效，行为完全一致。
- 测试：44 项单元测试 + 16 项 e2e；客户端测试覆盖 `settings.section` 注册、导航标签与设置页渲染。

## 0.4.1 — 官方 Plugins 页配置卡片，保存即时生效

0.4.0 删掉了 v1 的侧栏路由页和自建设置页，配置只能手改 profile patch。这一版把**配置卡片**加回来，但不恢复任何独立界面：它挂在官方 Plugins 页，通过官方 `plugins.row.config` 槽位与 `settings` 配置表单工作。

- `routes` / `agents` / `manageOfficialSettings` 声明为 volatile：在 Plugins → `dsh-subagent-hub` → `subagent-hub` 行的 **Configure** 页里编辑并保存，配置即时写入 profile patch、无需重启。
- 保存后 Host 侧自动重注册受影响的具名 Agent Preset、更新官方 `allowedAgentPresets` / `subagent-model-selection` allowlist；新会话立刻可用，已有会话 composition 不变。
- 表单提供：模型路由（id / provider / model / reasoningEffort / tags / note）、具名子 agent（id / description / instructions / routes / needs / basePreset）、以及“管理官方委派配置”开关；保存为一次带修订号的原子写入。
- 重新加入 Client 半侧（`lib/client.js`、`dsh.client`、locale）、`plugins.row.config` 注册与对应单元测试；`package.json` 版本 0.4.1。
- 修复 live 编辑路径与官方 HMR 事务嵌套冲突：配置变更由一个在 HMR 事务之外启动的长期 worker 串行应用，`configEditor` 不再在嵌套事务里报 “HMR transactions cannot be nested”。
- 测试：44 项单元测试 + 16 项真实运行时 e2e（新增：client bundle 上架、row config form 描述符、live 新增具名 agent 后预设/allowlist/schema/persona 全部生效）。

## 0.4.0 — 反转到官方机制

方向性重构：**不再替代官方派发，只给官方 subagent 补“怎么选”的信息。** 旧方案完整保留在 tag `v0.3.0`。

**为什么不再保留自己的 `delegate`**：它必然与官方工具、Agent Teams 以及其它子代理插件争抢同一个派发入口；为了让它可用，v1 还得派生 `<base>+hub` 预设（把“选对模式”的负担交给用户），再自己维护一套预算、投影、超时与结果传递。这些能力官方已经有，而且官方界面与设置页也在持续演进。v2 把同一份价值拆成四块，全部挂到官方机制上：具名 agent → 官方 Agent Preset；模型路由表 → 官方 `subagent-model-selection.allowedModels`；能力标签 → system prompt 目录；路由约束 → `tools/pre-execute` 守卫。派发工具、子 agent 生命周期、模型调用仍由官方运行时负责。

- 具名 agent 注册为官方 Agent Preset（稳定 id `hub-agent-<id>`，persona 追加 `instructions`），官方 `agent_preset` 参数直接可选；不再派生任何 `<base>+hub` 预设。
- 路由表映射为官方 `allowedModels`；插件不再选模型、不做回退。
- 新增 system prompt 目录段落：具名 agent → 用途 / 标签 / 限定路由；可用模型 → 标签；按官方工具实际暴露的参数调整指引。
- 新增 `tools/pre-execute` 路由约束守卫：`agent_preset` 指向声明了 `routes` 的具名 agent，而显式或继承的子路由不在其中时，派发前拒绝并列出允许的路由。
- 新增 `manageOfficialSettings`（默认 `false`）：开时通过 `configEditor` 幂等写入官方工具行的 `allowedAgentPresets` 与 `subagent-model-selection` 设置；默认不动其它插件的配置。
- 删除：右侧栏“子代理路由”页、设置页、`lib/client.js` 与 Client 半侧（`dsh.client`、locale、icon）、`delegate` / `define_subagent` 工具、`lib/budget.js`、`lib/projection.js`、`deriveHubPreset`、`basePresets`、`maxConcurrent`、`maxTokensPerSession`、workspace / external / session 定义层。
- 测试：36 项单元测试 + 12 项真实运行时 e2e（临时 `DSH_HOME`，脚本化 `llm/stream`）。

## 0.3.0 — M4: budgets and external definition sources

- 新增 `maxConcurrent`（默认 4）与可选的 `maxTokensPerSession`；超限时 `delegate` 拒绝并说明原因。
- 用量来源：运行中的子 agent 直接读投影；结束的子 agent 在 `agent/disposed` 时记入账本（每子会话取最新值，续聊不重复计）。账本为进程内。
- `ctx.subagentHub.registerSource({ id, priority, definitions })`：外部具名 agent 来源，优先级位于工作区层与会话层之间。
- `sumUsage` 同时兼容投影的 Host 状态（`{ totals, last }`）与 Client 视图（扁平 buckets）。

## 0.2.0 — M3: in-session definitions and a settings page

- `define_subagent` 工具：会话内创建具名 agent，定义写入会话日志（会话层）。
- 审批后晋升：`persist: workspace` 写 `.dsh/subagents/<id>.yaml`；`persist: profile` 写 profile patch 并即时生效；被拒则保留会话层。
- 设置页（`plugins.row.config`）：增删改路由与具名 agent，一次带修订号的原子保存。
- `routes` / `agents` 改为 volatile，保存不需要重载插件。

## 0.1.0 — M2: routing panel

- `subagentHub` 会话投影：从 `delegate` 的 `tool/result.meta` 折叠每次路由记录。
- 右侧栏「子代理路由」页：模型、实际模型（不一致时警告）、理由、回退、token 汇总，点击跳官方子会话。
- Bundle 清单、locale、图标；客户端以 `window.__ModuleLoader__` 手写格式加载，无构建步骤。
