<p align="center">
  <img src="docs/assets/hero.webp" alt="Subagent Hub — Named roles. Clear routes. Visible models." width="100%">
</p>

<p align="center">
  <a href="https://github.com/ccsert/dsh-subagent-hub/releases/tag/v0.10.3"><img src="https://img.shields.io/badge/version-0.10.3-66c8ab" alt="Version 0.10.3"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <a href="docs/install.md"><img src="https://img.shields.io/badge/DSH_Desktop-0.12.1-7087ad" alt="Tested with DSH Desktop 0.12.1"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/verified-102_unit_%2B_31_runtime-66c8ab" alt="102 unit tests and 31 runtime assertions verified"></a>
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

## 看看界面

**模型路由与角色配置**

![实际配置组件中的模型路由与具名角色](docs/assets/settings.webp)

**子会话的最近请求模型**

![子会话标题栏的供应商、完整模型 id 与推理强度](docs/assets/model-badge.webp)

截图使用实际插件组件和演示数据，不包含用户 profile、真实会话或密钥。完整图、移动宽度预览与来源见[截图说明](docs/screenshots.md)。Hero 由 [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen) 生成。

## 快速开始

已验证环境：**DSH Desktop 0.12.1 / `@deepseek-ai/dsh` 0.2.1-rc.2**。先在 DSH 中配置好可以调用的模型供应商。

1. 在 [Release](https://github.com/ccsert/dsh-subagent-hub/releases/latest) 下载 `dsh-subagent-hub-0.10.3.tgz`。
2. 在目标 profile 目录安装归档：

   ```bash
   pnpm add /absolute/path/to/dsh-subagent-hub-0.10.3.tgz
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

## 几个需要知道的边界

- **Team 的 context 选择历史。** 当前 `spawn_teammate` 的 fresh/fork 都继承 Lead 模型，没有模型选择输入。需要 MiniMax 等指定模型时，使用实际暴露模型参数的 `subagent`；详见 [Team 模型路由](docs/team-model-routing.md)。
- **全局路由范围也检查继承。** 非空 `routes` 对三个创建入口生效，越界或无法确认时拒绝；空列表保留原生继承。已有成员和请求期改写不在创建检查范围内。
- **标签辅助决策。** `fast`、`reasoning`、`免费` 等是你维护的标签。需要硬性限制时，把角色的 `routes` 限定到你认可的路由；标签本身不提供价格保证或自动回退。
- **守卫在派发前检查路由。** 其他插件在后续请求阶段改写模型时，不在此守卫覆盖范围中；同时使用时请核对它们的路由行为。
- **fork 遵循官方能力。** 目标运行时的 fork provider 不支持独立 `agent_preset`；具名角色通过 `subagent` 使用。
- **官方配置托管默认关闭。** `manageOfficialSettings` 默认为 `false`。开启后同步官方 allowlist；关闭后停止同步，已写入的配置会保留。
- **已有会话保留原工具 schema。** 配置保存即时生效；新增角色或工具参数请在新会话中使用。替换插件代码则需要重启 DSH。
- **Desktop 模型标识需 0.10.3 或更新。** 此版本修正原生 list 插槽的注册字段；组件示意图不等于已在当前 Desktop 窗口完成重载。详见[挂载修复记录](docs/model-badge-acceptance.md)。
- **模型标识来自请求记录。** `lastUsed` 显示最近请求；不同的 `next` 单独标为下一次选择。尚无请求显示“尚未请求”，记录不可用显示“未确认”。记录不代表调用成功或收费情况，fork 的继承历史也可能包含最近请求。

## 开发与验证

```bash
npm ci
npm run test:unit       # 无需模型账号的单元测试
npm run docs:check      # 文档链接、资源和包元数据
bash test.sh           # 真实 DSH 运行时集成验证，使用临时 DSH_HOME
npm run pack:check     # 检查将交付的 npm 格式归档
```

本版本验证了 **102 项单元测试和 31 项真实运行时断言**，并通过安装包中实际 Desktop 插槽注册器的独立回归。集成测试使用脚本化模型流，不调用外部模型。CI 运行单测、文档检查和打包检查；真实运行时验证另见[配置页验收](docs/ui-acceptance.md)、[模型标识验收](docs/model-badge-acceptance.md)和 [Team 路由验证](docs/team-model-routing.md)。

欢迎通过 [Issues](https://github.com/ccsert/dsh-subagent-hub/issues) 报告问题或提交 PR。架构、验证环境和发版步骤见 [CONTRIBUTING](CONTRIBUTING.md)、[设计说明](docs/design.md)和[发布指南](docs/releasing.md)。v0.3.0 的旧架构保留在对应 tag 中。

[MIT License](LICENSE) · Maintained by [ccsert](https://github.com/ccsert)
