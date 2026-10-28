<p align="center">
  <img src="docs/assets/hero.webp" alt="Subagent Hub — Named roles. Clear routes. Visible models." width="100%">
</p>

<p align="center">
  <a href="https://github.com/ccsert/dsh-subagent-hub/releases/tag/v0.11.2"><img src="https://img.shields.io/badge/version-0.11.2-66c8ab" alt="Version 0.11.2"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <a href="docs/install.md"><img src="https://img.shields.io/badge/DSH_Desktop-0.12.1-7087ad" alt="Tested with DSH Desktop 0.12.1"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/verified-144_unit_%2B_33_runtime-66c8ab" alt="144 unit tests and 33 runtime assertions verified"></a>
</p>

<p align="center"><b>简体中文</b> · <a href="README.en.md">English</a></p>

# Subagent Hub

给 DeepSeek Harness 的官方子 agent 补上**角色、模型选择信息和路由边界**。主 agent 可以找到适合的审查、测试或调研角色；你可以在设置里维护允许的模型，并在子会话中查看最近请求用了哪个模型。

沿用官方 `subagent` / `subagent_fork`、Agent Presets 和会话界面，安装后继续使用原来的主会话预设。

[安装](docs/install.md) · [下载 Release](https://github.com/ccsert/dsh-subagent-hub/releases/latest) · [配置示例](examples/subagent-hub.yml) · [变更记录](CHANGELOG.md) · [贡献指南](CONTRIBUTING.md)

## 可以做什么

| 能力 | 实际行为 |
|---|---|
| **具名子 agent** | 将角色注册成官方 `hub-agent-<id>` 预设，通过 `agent_preset` 派发 |
| **模型选择目录** | 向主 agent 提供路由、用途、能力标签和角色说明 |
| **路由约束** | 在 `subagent`、`subagent_fork`、Team 创建时检查全局路由范围，具名角色可进一步收紧 |
| **会话并发上限** | 限制一个父会话同时运行的子 agent 数量，与官方全局容量同时生效 |
| **原生配置表单** | 在 **设置 → 子代理中枢** 编辑模型、角色、标签与托管开关 |
| **请求模型可见** | 子会话标题栏显示最近请求的供应商与模型，展开读取完整 id 与推理强度 |
| **子智能体总览**（可选） | 标题栏入口汇总独立子任务与 Team 成员、共享任务和派发拒绝诊断，默认关闭 |

## 子智能体总览

0.11.1 起提供可选的 **子智能体总览**，默认关闭。在「设置 → 子代理中枢 → 基础设置」打开「显示子智能体总览」并保存，标题栏入口随即显示；关闭后仍可使用官方智能体团队界面。总览汇总独立子任务和 Team 成员，支持搜索、筛选、排序、打开原生子会话，以及查看共享任务、依赖和写入范围警告。最近请求模型、累计执行耗时和 Token 均读取原生投影；Team 空闲不表示任务完成，缺失用量不当作零。

诊断页从持久化工具结果重建最近 64 条 Hub 守卫拒绝，显示已记录总数；不包含其他工具错误。面板打开或点击刷新时只读刷新投影，并发最多 4 个，不启动子会话或模型请求。实现与验证范围见[总览契约](docs/overview-design.md)。

## 看看界面

**模型路由与角色配置**

![实际配置组件中的模型路由与具名角色](docs/assets/settings.webp)

**子会话的最近请求模型**

![子会话标题栏的供应商、完整模型 id 与推理强度](docs/assets/model-badge.webp)

**子智能体总览**

![总览面板中的成员、运行状态、模型与 Token 证据](docs/assets/overview.webp)

截图使用实际插件组件和演示数据，不包含用户 profile、真实会话或密钥。完整图、移动宽度预览与来源见[截图说明](docs/screenshots.md)。Hero 由 [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen) 生成。

## 快速开始

已验证环境：**DSH Desktop 0.12.1 / `@deepseek-ai/dsh` 0.2.1-rc.2**。先在 DSH 中配置好可以调用的模型供应商。

1. 在 [Release](https://github.com/ccsert/dsh-subagent-hub/releases/latest) 下载 `dsh-subagent-hub-0.11.2.tgz`。
2. 在目标 profile 目录安装归档：

   ```bash
   pnpm add /absolute/path/to/dsh-subagent-hub-0.11.2.tgz
   ```

3. 向该 profile 的 `package.json` 中 `dsh.profile.bundles` **追加** `"dsh-subagent-hub"`，保留原有 bundle；重启 DSH 加载插件代码。
4. 打开 **设置 → 子代理中枢**，添加已有供应商中的模型和角色。需要插件同步官方委派白名单时，开启 **托管官方委派配置** 并保存，再开始一个新会话。

也可从仓库检出安装。profile 定位、完整步骤、升级与卸载见[安装指南](docs/install.md)。npm 包已发布为 [dsh-subagent-hub](https://www.npmjs.com/package/dsh-subagent-hub)，也可使用固定版本的 GitHub Release 归档。Team/继承路由修复需要 0.10.2 或更高版本。

## 一个最小配置

界面和 profile patch 编辑的是同一份配置。下面的模型必须已在你的 DSH 中可用：

```yaml
- id: subagent-hub
  config:
    maxConcurrent: 4
    manageOfficialSettings: true
    routes:
      - id: flash
        provider: deepseek-official
        model: deepseek-flash
        tags: [fast, cheap]
    agents:
      - id: reviewer
        description: Reviews changes and reports concrete findings
        instructions: Read the diff, report actionable findings, and do not edit files.
        routes: [flash]
```

然后可以对主 agent 说：

> 用 reviewer 审查当前改动，只报告具体问题，不修改文件。

主 agent 根据任务与目录选择角色。工具参数可用时，可通过 `agent_preset: hub-agent-reviewer` 派发；路由限制会在派发前检查。

## 设计目的：贵模型统筹，便宜模型执行

这个插件不是为了「多开几个子 agent」，而是**让昂贵模型只做它无可替代的部分**。成本大头通常来自主 agent 逐条读文件、反复试错；把这些交给便宜甚至免费的路由，贵模型只负责理解需求、拆解、审查产出和最终整合。

```
主 agent（贵，例如 Claude Opus 5.5）
理解需求 → 拆解 → 派发 → 审查产出 → 整合 → 交付
             │
    ┌────────┴─────────┐
    ↓                  ↓
子 agent A（免费路由）  子 agent B（免费路由）
读代码 / 小步改动       跑测试 / 收集证据
```

配置上要做对三件事：

1. **给便宜路由打标签。** `routes` 把免费或低价模型标成 `tags: [free, fast]`，`note` 写清用途。这段目录会进入主 agent 的 system prompt，主 agent 据此选模型。
2. **把角色限定在便宜路由上。** 具名 agent 的 `routes` 只列便宜路由。越界的模型在派发前就被拒绝，既省钱，也避免子 agent 顺手用掉贵模型。
3. **开启托管官方委派配置，并至少配一条路由。** `manageOfficialSettings: true` 加上非空 `routes`，插件才会把 `modelSelectionSettings` 写进官方 `subagent` 工具；否则该工具有时不暴露 `provider`/`model`，主 agent 只能继承主会话模型，指定不了便宜路由。

```yaml
- id: subagent-hub
  config:
    maxConcurrent: 4
    manageOfficialSettings: true
    routes:
      - id: cheap            # 子 agent 用这条
        provider: your-gateway
        model: free-model
        tags: [free, fast]
        note: 日常实现、跑测试、收集证据
      - id: strong           # 留给主会话自己用
        provider: your-gateway
        model: expensive-model
        tags: [reasoning]
    agents:
      - id: worker
        description: 按给定范围实现改动并运行相关测试，报告结果
        instructions: 只改任务范围内的文件，运行相关测试，报告改动、命令与证据。
        routes: [cheap]
```

然后可以直接对主 agent 说：

> 你自己负责方案和最终审查，把实现和测试交给 hub-agent-worker。

`maxConcurrent` 限制同时运行的子 agent 数量，也就是这条用法自带的并发花费闸门；它和官方全局并行容量同时生效。

**关键前提：要用 `subagent`，别指望 `spawn_teammate`。** 当前运行时的 Team 成员没有 `provider`/`model`/`agent_preset` 输入，fresh 和 fork 都继承 Lead 模型——用 Team 派活等于让贵模型继续干活。能把子任务送到便宜路由的，是暴露 `provider`/`model` 的 `subagent`；用 `agent_preset` 指定具名角色走的也是这条路径。详见 [Team 模型路由](docs/team-model-routing.md)。

省下的是**贵模型的 token**，不是全部成本，也有不适用的时候：

- 标签是你维护的语义，插件不校验价格、不估算费用，也不做自动回退。
- 子 agent 仍会消耗自己的 token 和工具调用；派发本身有开销，小事不值得拆。
- 子 agent 的上下文是独立的，任务说明要自带足够信息，否则来回澄清更贵。
- 深度推理、架构决策和最终审查留在贵模型上才划算；把它们派给弱模型，往往以返工换回省下的钱。

## 几个需要知道的边界

- **Team 的 context 选择历史。** 当前 `spawn_teammate` 的 fresh/fork 都继承 Lead 模型，没有模型选择输入。需要 MiniMax 等指定模型时，使用实际暴露模型参数的 `subagent`；详见 [Team 模型路由](docs/team-model-routing.md)。
- **全局路由范围也检查继承。** 非空 `routes` 对三个创建入口生效，越界或无法确认时拒绝；空列表保留原生继承。已有成员和请求期改写不在创建检查范围内。
- **标签辅助决策。** `fast`、`reasoning`、`免费` 等是你维护的标签。需要硬性限制时，把角色的 `routes` 限定到你认可的路由；标签本身不提供价格保证或自动回退。
- **守卫在派发前检查路由。** 其他插件在后续请求阶段改写模型时，不在此守卫覆盖范围中；同时使用时请核对它们的路由行为。
- **fork 遵循官方能力。** 目标运行时的 fork provider 不支持独立 `agent_preset`；具名角色通过 `subagent` 使用。
- **官方配置托管默认关闭。** `manageOfficialSettings` 默认为 `false`。开启后同步官方 allowlist；关闭后停止同步，已写入的配置会保留。
- **已有会话保留原工具 schema。** 配置保存即时生效；新增角色或工具参数请在新会话中使用。替换插件代码则需要重启 DSH。
- **两层白名单可能不同步。** 插件每次调用读当前配置，官方运行层用的是 **会话开始时记录** 的子模型白名单，且不会被插件刷新。改了路由后，已打开的会话仍按旧白名单判断：守卫会拒绝并说明“需要新的顶层会话”，提示里给出两层各自允许的路由。**注意**：在该旧会话下新开的子会话会继承父会话的旧白名单，所以换路由后请开一个新的顶层会话，而不是在旧会话里再派一个子任务。具名角色声明的路由若不在新会话将采用的白名单里，保存后会在设置页与日志里直接列出，不必等到派发失败。
- **Desktop 模型标识需 0.10.3 或更新。** 此版本修正原生 list 插槽的注册字段；组件示意图不等于已在当前 Desktop 窗口完成重载。详见[挂载修复记录](docs/model-badge-acceptance.md)。
- **模型标识来自请求记录。** `lastUsed` 显示最近请求；不同的 `next` 单独标为下一次选择。尚无请求显示“尚未请求”，记录不可用显示“未确认”。记录不代表调用成功或收费情况，fork 的继承历史也可能包含最近请求。
- **摘要用模型名称，详情留原始 id。** 标题栏摘要按配置页的方式显示模型目录里的显示名（例如 `Qwen3.8-Flash · Qoder CN`）；目录没有列出该路由时回退为 `provider · id 尾段`。展开详情与总览里的计划路由始终保留精确的 provider 与 model id 作为证据。

## 开发与验证

```bash
npm ci
npm run test:unit       # 无需模型账号的单元测试
npm run docs:check      # 文档链接、资源和包元数据
bash test.sh           # 真实 DSH 运行时集成验证，使用临时 DSH_HOME
npm run pack:check     # 检查将交付的 npm 格式归档
```

本版本验证了 **144 项单元测试和 33 项真实运行时断言**，并通过安装包中实际 Desktop 插槽注册器的独立回归。集成测试使用脚本化模型流，不调用外部模型。CI 运行单测、文档检查和打包检查；真实运行时验证另见[配置页验收](docs/ui-acceptance.md)、[模型标识验收](docs/model-badge-acceptance.md)和 [Team 路由验证](docs/team-model-routing.md)。

欢迎通过 [Issues](https://github.com/ccsert/dsh-subagent-hub/issues) 报告问题或提交 PR。架构、验证环境和发版步骤见 [CONTRIBUTING](CONTRIBUTING.md)、[设计说明](docs/design.md)和[发布指南](docs/releasing.md)。v0.3.0 的旧架构保留在对应 tag 中。

[MIT License](LICENSE) · Maintained by [ccsert](https://github.com/ccsert)
