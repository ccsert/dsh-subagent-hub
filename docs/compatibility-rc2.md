# 0.14.0 rc.2 兼容性与验收

本页记录 Hub **0.14.0** 的 rc.2 适配及验收。开发基于 0.13.0；旧版 npm 包与 Release 归档不包含本页的新功能。当前发布截图已更新为实际 0.14.0 组件，下面保留开发与本地试用的历史记录。

## 委派和权限

Hub 通过公开 `namesOf`、`startActivation` 和 `resolveMaxDepth` 能力识别原生具名树。rc.2 使用原生 `subagent` / `subagent_fork`：`name` 是消息和任务归属的成员身份，`agent_preset` 是角色，二者不能互换。rc.1 保留 `hub_spawn_teammate` 跨模型 Team 入口及其 legacy 行为。标准 rc.2 fork schema 不提供模型或 `agent_preset` 选择，保留继承；以当前会话实际工具 schema 为准。

rc.2 派生角色保留基础 preset 原有委派行，但不会添加 allowlist、`maxDepth` 或工具权限。原生默认 `maxDepth=1` 仍拒绝孙成员；要使用嵌套角色，宿主须配置足够深度（例如 `maxDepth=3`），基础 preset 的 `allowedAgentPresets` 也须合法授权目标角色。Hub 的当前路由与会话创建时的原生模型白名单均需允许选择。

rc.2 显式传 `provider` 和 `model` 而省略 effort 时使用模型默认值，即使选择父会话同一路线也不继承父 effort。Hub 配置路线默认 effort 后会要求显式补齐，显式值可以覆盖；继承的 effort 不匹配时按提示同时传 `provider`、`model` 和 `reasoning_effort` 重试。守卫只返回判定，不修改只读工具参数。Hub 自有投影等待注册并释放句柄；原生 policy 仍按 key 兼容，不接管其注册。

## 总览口径

默认「用量分析」按公开 `agentPreset` 投影识别 Hub 角色，区分角色未确认与未使用 Hub 角色；按角色展示未缓存输入、缓存读写、输出、用量与重试记录覆盖率，以及实际请求路线表。配置对照比较当前配置与历史最近请求；显式覆盖或后续改配置均可造成差异，不能据此判断失败。缺失用量保持未知，估算标注；分路线记录少于会话总量时明确披露，不能当作完整路线分布。

成员身份 name、展示 label 和路径分别保留。总览沿持久 catalog 按层广度优先发现成员，最多 512 个成员、32 层，最多四个并行读取，读取和展示使用相同选择；按层读取避免缓存变化挤占更浅层。根 Team 的模式作用于整棵树；任务负责人优先按 `ownerId` 精确定位，不回退到错误的人，旧版只有 name 时须在名册中唯一匹配。外部会话不读取本地投影；刷新只读，不调用模型或 retain 会话。

## 开发验证与复现

主工作树的 `output/rc2-gate.log` 与 `output/rc1-gate.log` 记录了完整根测试：两次均为 314 单测通过、0 失败，且两个 SDK 的 native slot 检查通过。rc.2 为 native initial 43 项、另一进程 recovery 7 项；覆盖嵌套、默认深度拒绝、未授权角色拒绝、授权后 builder/checker、ownerId/ownerName 恢复、路由 effort、双白名单及官方服务 seam 取消。rc.1 为普通 31、Team 8、routed 41、recovery 17，共 97 项。fixture 拦截模型流，不发真实模型请求。0.13.0 的真实 Qoder 19 项是历史验证，不是本次 rc.2 证据。

在仓库根目录安装隔离 SDK 并运行：

```bash
bash packages/subagent-hub/test/e2e/install-rc2-sdk.sh
DSH_SDK_DIR="$PWD/output/sdk-rc2/node_modules/@deepseek-ai/dsh" DSH_EXPECT_VERSION=0.2.2-rc.2 bash test.sh
DSH_SDK_DIR="/absolute/path/to/rc1/@deepseek-ai/dsh" DSH_EXPECT_VERSION=0.2.2-rc.1 bash test.sh
npm run docs:check
```

安装脚本只写本 checkout 的 `output/sdk-rc2`。runner 使用临时 `DSH_HOME`；`DSH_SDK_DIR` 指 SDK 包目录，`DSH_CLI` 可显式指定 CLI，二者同时提供时版本须一致，`DSH_EXPECT_VERSION` 可强制预期版本。默认从 PATH 发现 CLI；仅支持 rc.1 和 rc.2 测试套件。`KEEP_HOME` 非空时保留临时 home 以供排查。

桌面浏览器在 1440×1100 视口完成 18 项实际组件检查：默认分析页、图表数值标签、二级任务负责人精确导航、负责人筛选、成员路径搜索、键盘焦点、配置对照、隐藏页签停止高频读取、慢请求期间隐藏不再安排后续读取、英文与深色布局、浅深色说明文字对比度、错误保留与空状态，以及无未处理页面异常。截图为 `output/playwright/analytics-desktop-light.png` 和 `output/playwright/analytics-desktop-dark.png`。浅色说明文字实测为 5.61:1；深色为 4.82:1。

复现时先生成 fixture，再通过本地静态 HTTP 预览运行[浏览器验收脚本](../packages/subagent-hub/test/browser/verify-overview.mjs)：

```bash
node packages/subagent-hub/test/browser/render-overview-fixture.mjs
# 在独立终端运行，仅服务测试产物
python3 -m http.server 8765 --bind 127.0.0.1 --directory output/playwright
# 浏览器命令在仓库根目录运行
playwright-cli -s=hub-overview open http://127.0.0.1:8765/overview.html
playwright-cli -s=hub-overview run-code --filename=packages/subagent-hub/test/browser/verify-overview.mjs
playwright-cli -s=hub-overview close
```

fixture 使用实际 React 组件，原生容器和会话数据由 fixture 模拟，以上 18 项属于组件验收。没有进行移动端、真实屏幕阅读器或用户自定义主题验收。

## 2026-11-12 Desktop 本地试用安装

随后通过运行中的 Desktop 官方插件管理页，将 profile 中的 Hub 0.12.1 替换为本地开发包 `0.13.1-rc2-dev.20261112`。当时后缀仅用于本地安装件，仓库版本号、npm 和 Release 均未更新。组件显示「运行中」，无需重启 Host；同一个 Desktop Host 的真实会话页面已显示新版原生侧栏分析页，读取到 6 个成员的真实角色、请求路线、用量及缓存统计。

安装后 21 个运行文件与已验证源码逐一匹配；7 条路由、1 个角色、并发上限 8、总览开关和其他插件版本均保留，整个 profile patch 与安装前逐字节一致。安装前已保存 profile 清单、锁文件、patch、baseline 和旧安装包，回滚备份留在用户私有 Harness home。临时本机 GUI 连接器和启动链接文件已清理。

验收通过已认证的浏览器客户端连接同一 Desktop Host；未采集 Electron 原生窗口截图，也未增加模型任务作为安装测试。安装校验记录与实际分析页截图位于本 checkout 的 `output/desktop-install-20261112`。

## 2026-11-12 设置页 A 方案

用户选择紧凑折叠工作台后，三个设置页统一为按宿主可用高度布局的表单：页签与保存区保持稳定，内容独立滚动，保存区不覆盖列表。模型默认摘要折叠，支持搜索、名称展示和供应商分组；这些展示操作不改配置顺序。角色与模型共用拖动、方向键及上下移动排序，保存后才写入顺序；角色的可用模型选择按需展开。

新增验证后共 316 项单元测试通过；[设置页交互脚本](../packages/subagent-hub/test/browser/verify-settings.mjs)完成 26 项桌面检查，包括慢保存期间折叠、连续键盘排序、拖动排序、引用保留、隐藏错误项定位、撤销、放弃、异步加载与长列表。使用原有语义色的组件 fixture 中，设置说明文字浅色对比度为 7.28:1，深色为 7.74:1，按钮悬停与键盘焦点均有反馈；这不等于所有控件和自定义主题均已验收。

本地安装件为 `0.13.1-rc2-dev.20261112.2`，当时源码包版本仍为 0.13.0，未发布。官方管理页安装阶段曾给出未托管插件的重启提示，随后立即启用成功，实际同一 Desktop Host 页面已加载新版布局，未重启 Host。真实 1874×972 CSS 视口内，角色、模型、常规三个页签均为 960×658px，保存区位于视口内且未覆盖内容。21 个运行文件与源码匹配，整个 profile patch 与更新前逐字节一致，其他插件版本未变。证据位于 `output/settings-a`；没有进行移动端或真实屏幕阅读器验收。

## 0.14.0 最终归档门禁（2026-11-12）

最终归档为 `dsh-subagent-hub-0.14.0.tgz`。从同一归档解包后，分别以 `HUB_PACKAGE_DIR` 指向其 package 目录执行完整 `bash test.sh`：两套 SDK 各自通过 316 单测；rc.1 普通 31、Team 8、routed initial 41、recovery 17，共 97 项；rc.2 initial 43、另一 OS 进程 recovery 7。两套原生插槽检查通过。模型流均被拦截，不调用真实供应商。正式归档不含测试，runner 从源码单独装载测试驱动，运行时代码仍来自该归档。

归档 SHA-256：`c6f73fbfc4496ac43a2c7f5ceef085330f1ec66a0e63d46eb6faa58ee120c629`。本轮设置页 26 项、总览 18 项桌面组件交互检查再次通过。日志及归档记录保留在 `output/releases/v0.14.0`；发布下载校验在上传后另行执行。
