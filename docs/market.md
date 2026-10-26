# 插件市场收录

状态：**已提交**（[PR #9501](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9501)），等待评审与合并。按规范术语，合并前只能称“已提交”，不是“已上架”。收录由第三方列表维护，进度以 GitHub 上的 PR 为准；本文件只记录**我们这边**提交了什么、之后怎么维护。

## 目标列表

[`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 的 `data/plugins/`，规则见其 [贡献指南](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)。

本插件属于 **monorepo 子包**。指南明确允许：`url` 指向子目录，`name` 用 `owner/repo#subname`，文件名带 `--packages-...`。仓库需要在根包或 `packages/` 子包声明 `dsh.bundle`——我们在 `packages/subagent-hub/package.json` 声明了。

## 条目文件

提交到列表仓库的路径：

```
data/plugins/ccsert__dsh-subagent-hub--packages-subagent-hub.yml
```

内容见 [market-entry.yml](market-entry.yml)。要点：

| 字段 | 取值 | 说明 |
|---|---|---|
| `url` | `https://github.com/ccsert/dsh-subagent-hub/tree/main/packages/subagent-hub` | 指向子包目录 |
| `name` | `ccsert/dsh-subagent-hub#subagent-hub` | 列表显示的链接文字 |
| `category` | `model` | 插件做的是子模型路由与白名单，不是界面主题 |
| `description.en` | 必填 | 只描述实际行为，不含营销词；评审会对着代码核对 |
| `description.zh` | 可选 | 一并提供 |
| `icon` | `https://raw.githubusercontent.com/ccsert/dsh-subagent-hub/main/docs/assets/icon.png` | 必须是 GitHub 托管的**位图**，SVG 会被拒 |

## 收录前提（已满足）

- 公开仓库 + MIT 许可证。
- `dsh.bundle` 声明（子包）+ 同目录 `cordis.patch.yml`。
- 仓库带 `dsh-plugin` topic。
- 仓库创建满 1 天。
- 真实可用的代码，不是聚合包：本插件自带守卫、prompt 目录、预设注册与设置页。
- npm 包的 `repository` 指回本仓库（`directory: packages/subagent-hub`）。

## 图标

市场卡片约 96px 显示，只收 GitHub 托管的位图。所以另存了 `docs/assets/icon.png`（512 × 512、透明底），由 [icon.svg](../packages/subagent-hub/icon.svg) 栅格化而来；SVG 仍是可编辑源文件。生成方式见[素材说明](assets/README.md#market-tile-icon)。

## 截图

市场详情页读**本仓库声明**的截图，不看列表仓库：[`packages/subagent-hub/screenshots.json`](../packages/subagent-hub/screenshots.json)，1–8 张。

这里用的是钉在发布 tag 上的 GitHub 绝对 URL，而不是相对路径——截图实际放在仓库根的 `docs/assets/`，相对路径不能跳出插件目录，而规则允许 GitHub 托管的 https 绝对 URL。钉 tag 而不是 `main` 是为了不随分支变动而指向未发布的界面。

**换截图时**：重拍 → 更新 `docs/assets/*.webp` → 发新版本 → 把 `screenshots.json` 里的 tag 一起改。列表仓库不用再提 PR，下一次 nightly 构建会读到。

## 提交与跟踪

1. fork `awesome-dsh-plugin`，新增上面那个 YAML 文件，**一个 PR 只加这一条**。
2. PR 由 CI 校验条目数量、`dsh.bundle`、仓库年龄、`awesome-lint` 与站点构建；通过不等于收录，维护者会实际读仓库。
3. 术语按规范区分：只开 PR 叫**已提交**；合并后叫**已合并，等待目录更新**；在市场里能看到并装得上才叫**已上架**。

## 之后

条目合并后，可在两份 README 的安装方式里补一行市场入口。不要手工改列表仓库生成的 README。
