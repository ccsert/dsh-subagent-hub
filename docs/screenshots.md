# Screenshots / 界面预览

0.14.0 的角色、模型、常规设置截图来自当前插件实际 Client 组件，在 1440×1100 桌面视口下捕获 960×800 内容区；总览分析、成员监控、成员分布与任务板来自当前组件，在 580×995 模拟侧栏内容区展示六个合成成员、两层成员树与五项任务。配置只写 fixture 内存，模型用量来自合成投影，不调用外部模型。最近请求模型截图使用模拟的公开 Session face。原生侧栏用量与窄屏旧图保留历史来源，本版没有重新验收移动布局。所有素材均不含真实用户 profile、私有对话或密钥。

它们展示真实组件的外观和交互。实际请求投影与派发行为由[运行时验收](model-badge-acceptance.md)另行验证。

## 角色与配置助手入口

![紧凑单列角色配置与配置助手入口，演示配置](assets/settings.webp)

[PNG 原图](assets/settings.png) · [展开高级设置](assets/settings-full.png)

## 展开的角色编辑器

![角色说明、指令与允许路由](assets/role-editor.webp)

[PNG 原图](assets/role-editor.png)

## 模型与常规设置

![模型路由与推理强度](assets/models.webp)

[PNG 原图](assets/models.png)

![并发上限、总览开关与官方配置托管](assets/general.webp)

[PNG 原图](assets/general.png)

## 最近请求的模型

![子会话标题栏里的最近请求信息](assets/model-badge.webp)

[PNG 原图](assets/model-badge.png)

## 子智能体总览

![默认用量分析：角色、缓存、重试与实际请求路线](assets/overview-analysis.webp)

[PNG 原图](assets/overview-analysis.png)

![总览监控栏：每个子智能体的任务、当前动作、计划与汇报](assets/overview-sidebar.webp)

[PNG 原图](assets/overview-sidebar.png)

## 用量与直接点击筛选

![用量页的状态色块、模型图例与子智能体排名](assets/usage-filters.webp)

[PNG 原图](assets/usage-filters.png)

![点击隐藏空闲成员和 GPT 模型路线后的组合筛选](assets/usage-filtered.webp)

[PNG 原图](assets/usage-filtered.png)。直接点击色块或整行即可隐藏和恢复，图表与列表同步；累计总量保持不变，并单列当前显示用量。没有额外勾选框。

这两张图使用当前实际组件、模拟侧栏容器及六个演示成员，不代表真实模型用量。另见保留的[历史原生侧栏用量截图](assets/usage-sidebar.png)。

## 共享任务板

![原生侧栏中的任务状态与负责人筛选、依赖定位和成员导航](assets/task-board-sidebar.webp)

[PNG 原图](assets/task-board-sidebar.png)。截图展示当前组件中的五项合成任务投影；原生 Team 创建、持久化与跨进程恢复由最终归档的隔离 SDK 门禁另行验证。任务板提供只读筛选与导航，写操作保留给原生 Team。

## 历史窄屏素材（本版未复验）

![320px 窄屏下展开的完整模型信息](assets/model-badge-narrow.webp)

[PNG 原图](assets/model-badge-narrow.png)

## 复现与素材来源

渲染入口是[配置 fixture](../packages/subagent-hub/test/browser/render-fixture.mjs)、[模型标识 fixture](../packages/subagent-hub/test/browser/render-model-fixture.mjs)与[总览 fixture](../packages/subagent-hub/test/browser/render-overview-fixture.mjs)。用 Playwright 捕获组件区域，再无损压缩为 WebP；保留 PNG 下载版本。没有重绘或拼造界面控件。

Hero 使用 dsh-image-gen 0.9.2 的 Studio，通过已配置的 ChatGPT 订阅通道生成。它是项目插画。提示词、尺寸与生成记录见[素材说明](assets/README.md)。
