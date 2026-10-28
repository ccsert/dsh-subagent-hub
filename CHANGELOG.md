# Changelog

## 0.11.2 — 模型标识显示模型名称，补充贵模型统筹用法

- 修复子会话模型标识只显示裸 id 的问题：配置页的模型选择器原本显示模型目录里的名称，而标题栏摘要拼的是 `provider · model id 尾段`，于是同一条路由在配置里是 `Qwen3.8-Flash · Qoder CN`，使用时却是 `magpie-anthropic · qfmodel`。
- 标题栏摘要改为按配置页的同一份模型目录解析显示名（`modelCatalog` 的 `models[].name`），目录未列出该路由时回退到原来的 `provider · id 尾段`，因此不会出现臆造名称。
- 目录每个客户端运行时只读一次，读取失败、被拒或为空都降级为裸 id，不阻塞也不隐藏徽标；只在确有请求记录或总览打开时才触发读取。
- 读取改为可选调用：共用方传入没有 `load` 的普通 face 时不再抛错，显示名保持“可用即用、缺失即回退”，不会因为装配方式让整个徽标渲染失败。
- 子智能体总览的“最近一次请求”同步使用显示名，并支持用名称搜索；展开的“下次请求计划”与徽标详情始终保留精确的 provider 与 model id 作为证据。
- 新增 `modelBadge.summaryModel` 文案（中/英），并保持可访问名称与可见文本一致（label in name）。
- 演示 fixture 补上模型目录，模型标识截图按新外观重录：胶囊显示名称，展开浮层仍显示记录的 provider、完整 model id 与推理强度。
- 文档补充设计目的与推荐用法：主 agent 用最强（通常最贵）的模型负责拆解、审查与整合，把实现、测试、取证交给标注 `free`/`cheap` 的子 agent 路由；落地只需三件事——路由打标签、具名角色限定 cheap 路由、开启 `manageOfficialSettings`。同时写明前提与边界：Team 成员继承 Lead 模型、用 `spawn_teammate` 省不了贵模型用量；插件不校验价格、不做自动回退；子 agent 自身开销与拆分成本，以及深度判断应留在贵模型。中英文 README 与[设计说明](docs/design.md)同步。
- 验证：145 项单测（新增 6 项，覆盖名称解析与 provider/model 配对、目录只读一次、四种降级路径、总览命名与名称搜索）、33 项隔离运行时断言、已安装 Desktop 原生插槽回归（新增有目录时的命名路径），以及 CI 的 `docs:check` 与 `pack:check` 全部通过。

## 0.11.1 — 两层白名单同步与市场收录准备

- 会话模型白名单与配置不同步的问题被显式处理：插件读实时配置，原生层用 Session 创建时的快照。守卫先按该 Session 的快照判断，因此不会再把调用放进一个必然被原生层拒绝的路径。
- 每条拒绝都写明是哪一层拒绝（`layer 1/2` 实时配置 / `layer 2/2` 会话快照 / 具名 agent 限制），并列出该层实际允许的路由；两层不一致时说明差异与“需要新会话”。
- 运行时上下文在该 Session 使用旧快照时提示快照内容、当前配置以及只有新会话可用的路由，避免反复重试同一拒绝。两层一致时不增加任何 prompt 文本。
- 具名预设声明的路由不在新会话将会采用的白名单内时，改在**预设注册期**报出：写 warn 日志，并在设置页具名 agent 面板列出涉及的路由与白名单内容；不再等到调用时才拒绝。
- 保存涉及路由或预设的改动后，提示“路由变更从新会话起生效；已打开的会话沿用创建时的白名单”。
- 验证：139 项单测、33 项隔离运行时断言和已安装 Desktop 原生插槽回归；运行时断言新增一项，证明真实 Host 中确实能读到 Session 记录的白名单且与配置一致。

## 0.11.0 — 可选子智能体总览与官方风格界面

- 在 Desktop 原生会话标题栏增加子智能体总览，合并独立子任务和 Team 成员，提供搜索、筛选、排序、证据详情和原生会话导航。
- 展示最近请求模型、独立列出的下次计划、累计执行耗时与注明覆盖范围的 Token；Team 空闲不冒充完成，未知用量不记为零。
- 增加共享任务板、依赖和写入警告、投影异常与刷新失败诊断；刷新只读、最多四个并发，并在关闭后停止调度新读取。
- 新增原生持久投影，重建最近 64 条已识别 Hub 派发拒绝及计数，兼容当前 SDK 的工具结果文本格式。
- 总览改为可选：新增 `showAgentOverview`（默认关闭），在基础设置中切换并保存后实时显示/隐藏，关闭时卸载面板与订阅。入口采用与官方 Team 一致的无边框、语义色、图标和紧凑布局。
- 修复：Harness 未重启、仍运行旧 schema 时，保存会因未知字段 `showAgentOverview` 被整体拒绝，并误报“其他页面已更新”。现在仅在 Host 已识别该字段时写入，开关禁用并提示重启；拒绝时区分版本冲突与其他原因。
- 子会话模型标识改用官方标题栏控件样式：无边框、三级标签色、线性芯片图标与 SVG 展开箭头；详情浮层改用官方菜单底色、12px 圆角与 prominent 阴影。
- 总览面板改用官方 Team 面板的视觉语言：菜单毛玻璃底、prominent 阴影、无外框幽灵按钮、0.5px 描边卡片与胶囊状态标签；标题固定、内容独立滚动，按压反馈尊重减少动态效果设置。
- 新增插件图标 `icon.svg`（清单 `icon` 字段），沿用官方插件的 36×36 透明底渐变扁平风格。
- 验证：120 项单测、32 项隔离运行时断言和已安装 Desktop 原生插槽回归；浏览器组件交互覆盖中英文、导航/读取失败、键盘和窄窗口，以及设置实时切换和打开面板时的卸载清理。发布截图（模型标识、窄屏、总览、完整配置页）已从实际组件重新捕获。实际 Desktop 窗口尚未直接点击验收。

## 0.10.3 — Fix Desktop model badge registration

- 修复子会话模型标识未显示：`conversation.session.header.utilities` 是 list 插槽，需要 `id`；旧代码误用 keyed 插槽的 `key`，被 Desktop 原生注册器拒绝。
- 单测与浏览器 fixture 校验 list 身份字段；完整验证加入读取实际 Desktop/SDK 渲染器注册方法的回归，先复现真实异常，再确认注册与模型内容渲染。
- 原有 102 项单测、31 项隔离运行时断言保持通过；Desktop 当前窗口的模块重载与可视确认单独记录，不以组件演示冒充。

## 0.10.2 — Guard inherited child and Team routes

- 修复 `spawn_teammate` 未经模型路由检查便继承主模型的问题，fresh/fork 两种 context 均覆盖。
- 真实运行时进一步确认独立 `subagent_fork` 也能继承表外模型；统一在三个已知创建入口检查全局 `routes`，再叠加具名角色限制。
- 按实际工具 schema 决定模型参数是否有效，防止额外字段伪装继承路由；无法确认和无有效路由时拒绝创建，保留原生半参数配对错误。
- Team-only 会话也展示能力目录，明确 context 只控制历史；仅推荐确有模型输入的派发工具，不再建议传不存在的参数。
- 补齐全局路由、已有成员、请求期改写和原生 Team 容量的适用边界，更新 npm 分发说明。
- 验证：102 项单测、23 项独立委派运行时断言、8 项原生 Team/继承路由断言，全部模型流均被脚本拦截。

## 0.10.1 — Release packaging and project documentation

- 重写中文首页并新增完整英文 README，补齐归档安装、最小配置、使用边界、升级卸载、贡献与发布说明。
- 使用 dsh-image-gen 0.9.2 的 ChatGPT 订阅通道生成 Hero，发布优化后的横幅和可下载 PNG，保留提示词与来源记录。
- 从实际 Client 组件捕获配置页、角色编辑器、子会话模型标识及 320px 窄屏截图；演示数据与真实运行时验证范围明确分开。
- 补齐已声明的 MIT 许可证、包元数据与包内 README；增加文档资源检查、npm 归档白名单检查和 CI 单测/文档/打包门禁。
- 校正路由顺序和托管关闭的中英文提示：顺序保留在目录中，关闭托管后停止同步、保留已有配置。派发和模型行为不变。
- 验证：87 项单测、23 项真实运行时断言，以及文档与实际归档检查。

## 0.10.0 — 子会话标题栏显示最近请求的模型

- 通过官方 `conversation.session.header.utilities` 列表槽位加入紧凑的只读模型标识，仅在子会话出现。标题栏显示供应商与模型简名，展开可读取完整供应商 id、模型 id 和记录中的推理强度。
- 数据来自官方 `modelSelection.lastUsed`，由持久化 `request/header` 推进；不使用主模型、角色定义或配置标签猜测。`next` 与最近请求不同的时候单列“下一次选择（尚未请求）”；尚无请求显示“尚未请求”，投影缺失显示“未确认”。
- 直接订阅已有 Session 的公开 projection face，历史会话和后续请求共用数据来源；展示不会保留/创建 Session、切换模型或发起模型 RPC。切换会话时关闭详情并释放旧订阅。
- 使用原生 details/summary，支持键盘展开、Esc 关闭并归还焦点、点击外部关闭；更新使用稳定的状态播报。沿用主题变量，详情支持长 id 折行、320px 和祖先 200% CSS 缩放。
- Client 依赖补充官方 Session Controller 与 Conversation 模块，缺少可用会话能力时不影响原配置页。
- 验证：87 项单测、23 项临时 profile 的真实运行时 e2e 全通过。新增真实子请求的 projection 验证，包括子模型不同于父模型、只有创建选项而尚未请求、主会话不展示。浏览器使用实际贡献组件及安装版本的官方标题栏 CSS 验证交互、布局与订阅清理，详见 [模型标识验收](docs/model-badge-acceptance.md)。

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
