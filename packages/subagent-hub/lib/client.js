// Browser half: the configuration page of `subagent-hub`.
//
// It renders twice, from the same code: as a row page on the official Plugins page and as a
// Settings section ("子代理中枢"). Both edit the plugin's volatile `routes` / `agents` /
// `manageOfficialSettings` through the Host-provided configuration form; the Host then
// re-registers presets and re-syncs the official allowlists.
//
// Hand-written module-loader format (no build step). React and the official UI primitives come
// from the shell's module table; the model catalog and the preset roster come from the Host.
window.__ModuleLoader__.load({
  id: 'dsh-subagent-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // The official UI kit (baseline module). Absent in an older shell: fall back to plain
    // elements rather than failing the whole page.
    let P = {}
    try {
      P = require('@deepseek-ai/dsh-client-ui-primitives') ?? {}
    } catch {
      P = {}
    }

    const NS = 'subagentHub'
    const ROW_CONFIG_KEY = 'dsh-subagent-hub#subagent-hub'
    const ENTRY_ID = 'subagent-hub'
    const CONFIGURATION_PRESET_ID = 'hub-configurator'
    /** Bound read-only confirmation; a network request may never settle. */
    const SYNC_TIMEOUT_MS = 15000
    const SYNC_POLL_MS = 1500

    const zh = {
      "workspace.title": "子代理中枢",
      "workspace.lead": "Lead 使用当前会话模型，不受角色配置限制",
      "workspace.roles": "角色",
      "workspace.renameRole": "编辑角色名称",
      "workspace.purpose": "用途",
      "workspace.models": "模型",
      "workspace.general": "常规",
      "workspace.navigation": "配置分区",
      "workspace.roleSearch": "搜索角色",
      "workspace.noResults": "没有匹配的角色",
      "workspace.clearSearch": "清除搜索",
      "workspace.rolePurpose": "将任务交给合适的子智能体",
      "workspace.advanced": "高级设置",
      "workspace.advancedHint": "角色标识、基础预设与能力标签",
      "workspace.roleName": "角色名称",
      "workspace.roleNameHint": "方便识别的名称，可使用中文",
      "workspace.roleId": "角色标识",
      "workspace.selectRole": "选择或创建一个角色开始配置",
      "workspace.roleList": "委派角色",
      "workspace.templates": "从模板创建",
      "workspace.addRole": "添加角色",
      "assistant.open": "配置助手",
      "assistant.hint": "通过对话创建角色、调整模型与设置",
      "assistant.dirty": "请先保存或撤销当前修改，再打开配置助手",
      "assistant.unavailable": "配置助手暂不可用。请重启 Harness 后，在新会话的模式列表中选择「Hub 配置助手」。",
      "assistant.starter": "请读取当前 Hub 配置，帮助我设计子智能体角色并调整模型与设置。先说明当前配置和可改进的地方。",
      "assistant.starting": "正在打开…",
      "workspace.showPreview": "查看主智能体看到的目录",

      'modelBadge.label': '模型',
      'modelBadge.summary': '模型：{provider} · {model}',
      'modelBadge.summaryModel': '模型：{model}',
      'modelBadge.waiting': '模型：尚未请求',
      'modelBadge.waitingShort': '尚未请求',
      'modelBadge.unknown': '模型：未确认',
      'modelBadge.unknownShort': '未确认',
      'modelBadge.details': '子 agent 模型信息',
      'modelBadge.recorded': '最近请求记录',
      'modelBadge.provider': '供应商',
      'modelBadge.model': '模型',
      'modelBadge.effort': '推理强度',
      'modelBadge.next': '下一次选择（尚未请求）',
      'modelBadge.note': '按本会话历史中最近一次请求显示。',
      'modelBadge.unavailableNote': '尚未获得模型请求记录，读取到记录后会自动更新。',
      'nav': '子代理中枢',
      'summary': '{routes} 条模型路由 · {agents} 个具名子 agent · 并发上限 {limit} · 官方设置：{managed}',
      'summary.managedOn': '托管中',
      'summary.managedOff': '未托管',
      'summary.unlimited': '不限',
      'intro': '先选择子 agent 可以使用的模型，再按需要添加审查、测试或调研角色。保存后应用配置；新增角色在新会话中可用。',
      'badge.routes': '{count} 条路由',
      'badge.agents': '{count} 个具名 agent',
      'badge.managed': '官方配置 {state}',
      'badge.on': '托管中',
      'badge.off': '未托管',
      'badge.concurrency': '并发上限 {count}',
      'badge.unlimited': '并发不限',
      'general.title': '基础设置',
      'general.hint': '子 agent 的并发上限，以及是否由本插件维护官方委派配置。',
      'concurrency.limit': '每个会话的并发上限',
      'concurrency.hint': '同一会话最多同时运行 {count} 个子 agent；超出的派发会被拒绝，并提示主 agent 等待或自己完成。官方“并行容量”是全局上限，两者同时生效。',
      'concurrency.unlimitedHint': '设为 0 表示不限制（仍受官方全局并行容量约束）。',
      'concurrency.decrease': '减少',
      'concurrency.increase': '增加',
      'concurrency.quick': '常用值',
      'concurrency.unlimited': '不限',
      'official.switch': '托管官方委派配置',
      'official.hint': '开启后，自动把具名 agent 加入官方 subagent 工具的 agent_preset 可选列表，并把下方路由同步为官方子代理模型白名单。关闭后停止同步，已写入的配置会保留。',
      'routes.title': '模型路由',
      'routes.hint': '主 agent 能为子 agent 指定的模型。列表顺序与能力标签会保留在选择目录中。',
      'routes.add': '添加路由',
      'routes.none': '还没有模型路由。添加后，主 agent 才能为子 agent 指定模型。',
      'routes.loading': '正在读取模型目录…',
      'routes.catalogError': '读取模型目录失败。',
      'routes.retry': '重试',
      'routes.empty': '模型目录为空，请先在“模型”设置里配置 Provider。',
      'routes.unavailable': '部分 Provider 暂不可用：{names}',
      'route.model': '模型',
      'route.effort': '推理强度',
      'route.effortDefault': '模型默认',
      'route.effortHint': '漏传时 Hub 会要求主智能体补上；显式值优先。',
      'route.pickModel': '选择模型',
      'route.missing': '不在当前目录',
      'route.id': '路由名',
      'route.idHint': '具名 agent 通过它引用这条路由',
      'route.tags': '能力标签',
      'route.note': '备注',
      'route.tagPlaceholder': '输入标签，回车添加',
      'route.moveUp': '上移',
      'route.moveDown': '下移',
      'route.remove': '删除路由',
      'route.unnamed': '未命名路由',
      'problem.route.id.empty': '请填写路由名',
      'problem.route.id.duplicate': '请换一个未使用的路由名',
      'problem.route.model.empty': '请选择模型',
      'problem.route.pair.duplicate': '该模型已被其他路由占用',
      'problem.agent.id.empty': '请填写名称',
      'problem.agent.id.invalid': '使用小写字母开头，后接小写字母、数字或短横线，最多 48 个字符',
      'problem.agent.id.duplicate': '请换一个未使用的名称',
      'problem.agent.description.empty': '请填写用途说明',
      'problem.agent.routes.unknown': '请重新选择可用路由：',
      'problem.concurrency': '并发上限必须是不小于 0 的整数',
      'agents.title': '具名子 agent',
      'agents.hint': '每个具名 agent 会注册为官方预设 hub-agent-<名称>，主 agent 通过 agent_preset 选择它。',
      'agents.add': '新增具名 agent',
      'agents.none': '还没有具名 agent。',
      'agents.routesLabel': '可用模型',
      'agents.routesHint': '不选 = 可用任意已配置模型；选了之后，越界的模型会在派发前被拒绝。',
      'agents.anyModel': '任意模型',
      'agents.noRoutes': '先在上方添加模型路由。',
      'agents.needs': '能力标签',
      'agents.basePreset': '基础预设',
      'agents.basePresetHint': '子 agent 的工具与人设从这个预设派生（会移除委派工具）。',
      'agent.id': '名称',
      'agent.idHint': '小写字母、数字和短横线',
      'agent.description': '用途说明',
      'agent.descriptionHint': '主 agent 据此判断什么任务交给它',
      'agent.instructions': '角色指令',
      'agent.instructionsHint': '追加在子 agent 系统人设之后',
      'agent.unnamed': '未命名',
      'agent.noDescription': '还没有用途说明',
      'agent.remove': '删除具名 agent',
      'agent.toggle': '展开或收起',
      'preview.title': '预览：主 agent 看到的选择目录',
      'preview.empty': '配置路由或具名 agent 后，这里会显示主 agent 看到的目录。',
      'preview.copy': '复制',
      'preview.copied': '已复制',
      'preview.copyFailed': '复制失败，请展开目录后手动选择并复制。',
      'save.refused': '保存未应用，修改仍保留。请重试；如仍失败，请按 ⌘⇧R 重启 Harness 后再保存。',
      'save.conflict': '配置已在其他页面或配置助手中更新。当前修改已保留；请先撤销并读取最新配置，再重新应用修改。',
      'overview.restartHint': 'Harness 尚未加载此设置。请按 ⌘⇧R 重启 Harness 后再开启；其他设置可正常保存。',
      'common.removeTag': '删除标签 {tag}',
      'common.readOnly': '此配置当前只读。',
      'footer.dirty': '有未保存的修改',
      'save': '保存',
      'saving': '保存中…',
      'saved': '已保存。',
      'saved.routes': '已保存。路由变更从新的顶层会话起生效；已打开的会话沿用创建时的模型白名单，在旧会话下新开的子会话也继承它。',
      'agents.allowlist.title': '以下预设声明的路由不在官方会话白名单里，派发会被拒绝：',
      'agents.allowlist.item': '{agent} → {routes}（新会话白名单只有 {allowed}）',
      'agents.allowlist.hint': '启用「托管官方委派配置」，或把该路由加进官方子代理模型白名单；保存后需要新的顶层会话才会采用。',
      'syncing': '已保存，正在核对模型白名单和角色目录…',
      'synced': '已保存；模型白名单已同步，具名角色已注册。',
      'syncRosterReady': '已保存；具名角色目录已更新。',
      'syncRetry': '重新核对',
      'syncPending': '已保存，但暂未确认生效。可重新核对，无需重复保存。',
      'syncRosterMissing': '已保存；但具名角色还没出现在宿主里。宿主可能仍在重载，稍后再点「重新核对」；若一直如此，请重启 Harness。',
      'syncAllowlistMissing': '已保存；但官方的子代理模型白名单没有出现在宿主中，说明宿主没有接受这次的镜像写入。原因在宿主日志的 “dsh-subagent-hub:” 警告里；修好后点「重新核对」即可，不用再保存一次。',
      'invalid': '无法保存：{error}',
      'unavailable': '这个 profile 没有提供配置表单，请直接编辑 cordis.patch.yml。',
      'discard': '放弃修改',
      'invalid.fields': '无法保存：请修正标红的字段',
      'undo.deleted': '已删除 {name}',
      'undo.action': '撤销',
      'footer.shortcut': 'Ctrl / ⌘ + S 保存',
      'template.reviewer.label': '代码审查',
      'template.reviewer.description': '审查代码改动，只报告问题，不修改文件',
      'template.reviewer.instructions': '你负责代码审查。逐个阅读改动，找出正确性、边界条件与安全问题。只报告发现，不要修改任何文件，也不要提交代码。',
      'template.tester.label': '测试',
      'template.tester.description': '为改动补充测试，并验证现有用例',
      'template.tester.instructions': '你负责测试。为给定改动设计并补充测试用例，覆盖正常路径与边界条件；能运行测试时运行它并报告结果。',
      'template.researcher.label': '调研',
      'template.researcher.description': '查资料、对比方案，给出结论与出处',
      'template.researcher.instructions': '你负责调研。围绕问题收集资料，比较可行方案，输出结论、理由与出处链接。不修改代码。',
      'template.blank.label': '空白',
      'template.blank.description': '',
      'template.blank.instructions': '',
    }
    const en = {
      "workspace.title": "Subagent Hub",
      "workspace.lead": "The Lead uses the current conversation model, independently of role settings",
      "workspace.roles": "Roles",
      "workspace.renameRole": "Edit role name",
      "workspace.purpose": "Purpose",
      "workspace.models": "Models",
      "workspace.general": "General",
      "workspace.navigation": "Configuration sections",
      "workspace.roleSearch": "Search roles",
      "workspace.noResults": "No matching roles",
      "workspace.clearSearch": "Clear search",
      "workspace.rolePurpose": "Delegate work to the right subagent",
      "workspace.advanced": "Advanced settings",
      "workspace.advancedHint": "Role ID, base preset and capability tags",
      "workspace.roleName": "Role name",
      "workspace.roleNameHint": "A readable name, in any language",
      "workspace.roleId": "Role ID",
      "workspace.selectRole": "Select or create a role to configure it",
      "workspace.roleList": "Delegation roles",
      "workspace.templates": "Create from a template",
      "workspace.addRole": "Add role",
      "assistant.open": "Configuration assistant",
      "assistant.hint": "Design roles and adjust models and settings through conversation",
      "assistant.dirty": "Save or discard your edits before opening the assistant",
      "assistant.unavailable": "The configuration assistant is unavailable. Restart Harness, then select “Hub 配置助手” in a new conversation’s mode list.",
      "assistant.starter": "Read my Hub configuration and help me design subagent roles and adjust models and settings. Start with the current configuration and opportunities to improve it.",
      "assistant.starting": "Opening…",
      "workspace.showPreview": "Preview the main agent’s selection catalog",

      'modelBadge.label': 'Model',
      'modelBadge.summary': 'Model: {provider} · {model}',
      'modelBadge.summaryModel': 'Model: {model}',
      'modelBadge.waiting': 'Model: no request yet',
      'modelBadge.waitingShort': 'No request yet',
      'modelBadge.unknown': 'Model: unconfirmed',
      'modelBadge.unknownShort': 'Unconfirmed',
      'modelBadge.details': 'Subagent model information',
      'modelBadge.recorded': 'Latest request record',
      'modelBadge.provider': 'Provider',
      'modelBadge.model': 'Model',
      'modelBadge.effort': 'Reasoning effort',
      'modelBadge.next': 'Next selection (not requested yet)',
      'modelBadge.note': 'Based on the latest request in this session history.',
      'modelBadge.unavailableNote': 'No model request record is available yet. This updates when a record arrives.',
      'nav': 'Subagent Hub',
      'summary': '{routes} model routes · {agents} named subagents · concurrency {limit} · official settings: {managed}',
      'summary.managedOn': 'managed',
      'summary.managedOff': 'not managed',
      'summary.unlimited': 'unlimited',
      'intro': 'Choose the models available to subagents, then add review, testing or research roles as needed. Save to apply; new roles are available in new sessions.',
      'badge.routes': '{count} routes',
      'badge.agents': '{count} named agents',
      'badge.managed': 'official config {state}',
      'badge.on': 'managed',
      'badge.off': 'not managed',
      'badge.concurrency': 'concurrency {count}',
      'badge.unlimited': 'unlimited concurrency',
      'general.title': 'General',
      'general.hint': 'The per-session concurrency cap and whether this plugin maintains the official delegation settings.',
      'concurrency.limit': 'Concurrent subagents per session',
      'concurrency.hint': 'At most {count} child agents run at once in one session; further delegations are refused and the main agent is told to wait or do the work itself. The official “parallel capacity” is the global cap; both apply.',
      'concurrency.unlimitedHint': '0 means unlimited (the official global parallel capacity still applies).',
      'concurrency.decrease': 'Decrease',
      'concurrency.increase': 'Increase',
      'concurrency.quick': 'Quick picks',
      'concurrency.unlimited': 'Unlimited',
      'official.switch': 'Manage the official delegation settings',
      'official.hint': 'When on, named agents are added to the official subagent tool\'s agent_preset choices and the routes below become the official subagent model allowlist. When off, syncing stops and previously written settings remain.',
      'routes.title': 'Model routes',
      'routes.hint': 'Models the main agent may pick for a child. List order and capability tags are kept in its selection catalog.',
      'routes.add': 'Add route',
      'routes.none': 'No model route yet. Add one so the main agent can choose a child model.',
      'routes.loading': 'Reading the model catalog…',
      'routes.catalogError': 'The model catalog could not be read.',
      'routes.retry': 'Retry',
      'routes.empty': 'The model catalog is empty; configure a provider under Models first.',
      'routes.unavailable': 'Some providers are unavailable: {names}',
      'route.model': 'Model',
      'route.effort': 'Reasoning effort',
      'route.effortDefault': 'Model default',
      'route.effortHint': 'If omitted, the Hub asks the main agent to add it; explicit values win.',
      'route.pickModel': 'Choose a model',
      'route.missing': 'not in the catalog',
      'route.id': 'Route name',
      'route.idHint': 'Named agents refer to the route by this name',
      'route.tags': 'Capability tags',
      'route.note': 'Note',
      'route.tagPlaceholder': 'Type a tag, Enter to add',
      'route.moveUp': 'Move up',
      'route.moveDown': 'Move down',
      'route.remove': 'Remove route',
      'route.unnamed': 'Unnamed route',
      'problem.route.id.empty': 'Route name is required',
      'problem.route.id.duplicate': 'Choose a route name that is not already in use',
      'problem.route.model.empty': 'Choose a model',
      'problem.route.pair.duplicate': 'This model is already routed',
      'problem.agent.id.empty': 'Name is required',
      'problem.agent.id.invalid': 'Start with a lowercase letter; use up to 48 lowercase letters, digits or dashes',
      'problem.agent.id.duplicate': 'Choose a name that is not already in use',
      'problem.agent.description.empty': 'Purpose is required',
      'problem.agent.routes.unknown': 'Choose available routes instead of:',
      'problem.concurrency': 'The concurrency limit must be a non-negative whole number',
      'agents.title': 'Named subagents',
      'agents.hint': 'Each named agent becomes the official preset hub-agent-<name>; the main agent selects it through agent_preset.',
      'agents.add': 'Add named agent',
      'agents.none': 'No named agent yet.',
      'agents.routesLabel': 'Allowed models',
      'agents.routesHint': 'None selected = any configured model; with a selection, other models are refused before the child starts.',
      'agents.anyModel': 'Any model',
      'agents.noRoutes': 'Add a model route above first.',
      'agents.needs': 'Capability tags',
      'agents.basePreset': 'Base preset',
      'agents.basePresetHint': 'The child\'s tools and persona derive from this preset (delegation tools removed).',
      'agent.id': 'Name',
      'agent.idHint': 'Lowercase letters, digits, and dashes',
      'agent.description': 'Purpose',
      'agent.descriptionHint': 'How the main agent decides what to hand to it',
      'agent.instructions': 'Role instructions',
      'agent.instructionsHint': 'Appended after the child\'s system persona',
      'agent.unnamed': 'Unnamed',
      'agent.noDescription': 'No purpose yet',
      'agent.remove': 'Remove named agent',
      'agent.toggle': 'Expand or collapse',
      'preview.title': 'Preview: the catalog the main agent sees',
      'preview.empty': 'Configure a route or a named agent to preview the main agent\'s catalog.',
      'preview.copy': 'Copy',
      'preview.copied': 'Copied',
      'preview.copyFailed': 'Copy failed. Expand the preview and select the text to copy it.',
      'save.refused': 'The save was not applied; your edits are kept. Try again, and if it still fails, restart Harness with ⌘⇧R and save.',
      'save.conflict': 'Configuration changed in another editor or the assistant. Your edits are kept; discard to load the latest configuration before reapplying them.',
      'overview.restartHint': 'Harness has not loaded this setting yet. Restart Harness with ⌘⇧R to turn it on; other settings save normally.',
      'common.removeTag': 'Remove tag {tag}',
      'common.readOnly': 'This configuration is read-only.',
      'footer.dirty': 'Unsaved changes',
      'save': 'Save',
      'saving': 'Saving…',
      'saved': 'Saved.',
      'saved.routes': 'Saved. Route changes apply to new top-level Sessions; open Sessions keep the allowlist they captured at start, and a new child under them inherits it.',
      'agents.allowlist.title': 'These presets declare routes outside the official session allowlist, so delegating to them is refused:',
      'agents.allowlist.item': '{agent} → {routes} (a new Session captures only {allowed})',
      'agents.allowlist.hint': 'Enable "Manage official delegation settings", or add the route to the official subagent model allowlist; a new top-level Session is required after saving.',
      'syncing': 'Saved; checking the model allowlist and role roster…',
      'synced': 'Saved; the model allowlist is in sync and the named roles are registered.',
      'syncRosterReady': 'Saved; the named role roster is up to date.',
      'syncRetry': 'Check again',
      'syncPending': 'Saved, but the update is not confirmed yet. Check again without saving twice.',
      'syncRosterMissing': 'Saved; the named roles have not appeared in the Host yet. It may still be reloading — check again shortly, and restart Harness if it never resolves.',
      'syncAllowlistMissing': 'Saved; the official subagent model allowlist did not appear in the Host, so the Host did not accept the mirrored write. The reason is in the Host log under "dsh-subagent-hub:"; check again after fixing it, there is no need to save twice.',
      'invalid': 'Cannot save: {error}',
      'unavailable': 'This profile exposes no configuration form; edit cordis.patch.yml directly.',
      'discard': 'Discard',
      'invalid.fields': 'Cannot save: fix the highlighted fields',
      'undo.deleted': 'Deleted {name}',
      'undo.action': 'Undo',
      'footer.shortcut': 'Ctrl / Cmd + S saves',
      'template.reviewer.label': 'Code review',
      'template.reviewer.description': 'Reviews code changes and reports findings without editing files',
      'template.reviewer.instructions': 'You review code changes. Read every diff hunk and look for correctness, edge cases and security issues. Report findings only; never edit a file and never commit.',
      'template.tester.label': 'Testing',
      'template.tester.description': 'Adds tests for a change and verifies the existing suite',
      'template.tester.instructions': 'You write tests. Design and add test cases for the given change, covering the happy path and the edge cases; run them when you can and report the results.',
      'template.researcher.label': 'Research',
      'template.researcher.description': 'Collects material, compares options, and reports a conclusion',
      'template.researcher.instructions': 'You research. Gather material around the question, compare the workable options, and report the conclusion, the reasons and the sources. Do not change code.',
      'template.blank.label': 'Blank',
      'template.blank.description': '',
      'template.blank.instructions': '',
    }

    Object.assign(zh, {
      'settings.clean': '没有未保存的修改', 'settings.loading': '正在读取配置…',
      'settings.searchModels': '搜索模型、供应商或标签', 'settings.searchRoles': '搜索角色或用途',
      'settings.view': '模型展示方式', 'settings.order': '配置顺序', 'settings.name': '模型名称',
      'settings.provider': '供应商分组', 'settings.allProviders': '全部供应商', 'settings.providerFilter': '筛选供应商',
      'settings.expandAll': '全部展开', 'settings.collapseAll': '全部折叠', 'settings.clear': '清除筛选',
      'settings.noResults': '没有匹配的条目', 'settings.orderHint': '清除筛选并切回配置顺序后，可调整保存顺序。',
      'settings.drag': '拖动排序，或用上下方向键调整', 'settings.moved': '已将 {name} 调整到第 {position} 位，保存后生效',
      'settings.modelColumns': '模型 / 供应商 / 推理强度 / 能力标签', 'settings.configureModels': '配置可用模型',
      'settings.selectedModels': '已选 {selected} / {total}', 'settings.anyModel': '未限定，可使用全部已配置模型',
      'settings.advanced': '编辑路由信息',
    })
    Object.assign(en, {
      'settings.clean': 'No unsaved changes', 'settings.loading': 'Loading configuration…',
      'settings.searchModels': 'Search models, providers or tags', 'settings.searchRoles': 'Search roles or purpose',
      'settings.view': 'Model view', 'settings.order': 'Configuration order', 'settings.name': 'Model name',
      'settings.provider': 'Group by provider', 'settings.allProviders': 'All providers', 'settings.providerFilter': 'Filter providers',
      'settings.expandAll': 'Expand all', 'settings.collapseAll': 'Collapse all', 'settings.clear': 'Clear filters',
      'settings.noResults': 'No matching entries', 'settings.orderHint': 'Clear filters and use configuration order to reorder saved entries.',
      'settings.drag': 'Drag to reorder, or use the up and down arrow keys', 'settings.moved': 'Moved {name} to position {position}; save to apply',
      'settings.modelColumns': 'Model / Provider / Reasoning effort / Capability tags', 'settings.configureModels': 'Configure allowed models',
      'settings.selectedModels': '{selected} / {total} selected', 'settings.anyModel': 'Unrestricted: all configured models are available',
      'settings.advanced': 'Edit route details',
    })

    /** A view retains the original indexes and never mutates saved configuration order. */
    function settingsRouteRows(routes, groups, { search = '', view = 'order', provider = '' } = {}) {
      const query = search.trim().toLocaleLowerCase()
      const rows = routes.map((route, index) => {
        const group = groups.find(group => group.id === route.provider)
        const label = group?.models?.find(model => model.id === route.model)?.name || route.model || route.id
        return { route, index, label, providerLabel: group?.name || route.provider }
      }).filter(row => (!provider || row.route.provider === provider) && (!query ||
        [row.label, row.providerLabel, row.route.id, row.route.provider, row.route.model, row.route.note, ...(row.route.tags ?? [])].join(' ').toLocaleLowerCase().includes(query)))
      if (view === 'name') rows.sort((a, b) => a.label.localeCompare(b.label) || a.index - b.index)
      if (view === 'provider') rows.sort((a, b) => a.providerLabel.localeCompare(b.providerLabel) || a.index - b.index)
      return rows
    }

    function moveSettingsRow(rows, key, target) {
      const from = rows.findIndex(row => row._key === key)
      if (from < 0 || target < 0 || target >= rows.length || from === target) return rows
      const next = [...rows]
      next.splice(target, 0, next.splice(from, 1)[0])
      return next
    }

    // ── pure helpers ────────────────────────────────────────────────────────────────────────────

    const hasRouteContent = route => Boolean(route.id || route.provider || route.model || route.reasoningEffort || route.note || route.tags.length > 0)
    const hasAgentContent = agent => Boolean(agent.name || agent.id || agent.description || agent.instructions || agent.routes.length > 0 || agent.needs.length > 0 || agent.basePreset !== 'standard')
    const routeKey = (provider, model) => `${provider}\0${model}`

    /** Separator between the provider and the model inside one merged model value. */
    const MODEL_SEPARATOR = '|'

    /**
     * Quick templates for a new named agent. Every text is a dictionary key, so the page can
     * localise it; the blank template starts empty and only carries its label.
     */
    const AGENT_TEMPLATES = [
      { id: 'reviewer', label: 'template.reviewer.label', description: 'template.reviewer.description', instructions: 'template.reviewer.instructions' },
      { id: 'tester', label: 'template.tester.label', description: 'template.tester.description', instructions: 'template.tester.instructions' },
      { id: 'researcher', label: 'template.researcher.label', description: 'template.researcher.description', instructions: 'template.researcher.instructions' },
      { id: '', label: 'template.blank.label', description: 'template.blank.description', instructions: 'template.blank.instructions' },
    ]

    /** The value of one merged model option: the provider and the model in one string. */
    function modelOptionValue(provider, model) {
      if ((provider ?? '') === '' && (model ?? '') === '') return ''
      return `${encodeURIComponent(provider ?? '')}${MODEL_SEPARATOR}${encodeURIComponent(model ?? '')}`
    }

    /** Split a merged model value back into its provider and its model. */
    function parseModelValue(value) {
      const text = String(value ?? '')
      const at = text.indexOf(MODEL_SEPARATOR)
      if (at < 0) return { provider: text, model: '' }
      const decode = part => { try { return decodeURIComponent(part) } catch { return part } }
      return { provider: decode(text.slice(0, at)), model: decode(text.slice(at + 1)) }
    }

    /**
     * Model options of every catalog provider, grouped for one merged select. A stored pair the
     * catalog no longer lists stays selectable and is marked as missing.
     */
    function modelGroups(groups, provider = '', model = '', missing = '不在当前目录') {
      const out = groups.map(group => ({
        id: group.id,
        label: group.name || group.id,
        options: group.models.map(item => ({ value: modelOptionValue(group.id, item.id), label: item.name || item.id })),
      }))
      if ((provider ?? '') === '' && (model ?? '') === '') return out
      let group = out.find(item => item.id === provider)
      if (group === undefined) {
        // A stored pair can name a model without a provider; label it by what it does know.
        const name = provider === '' ? model : provider
        group = { id: provider, label: missing ? `${name} (${missing})` : name, options: [] }
        out.unshift(group)
      }
      const value = modelOptionValue(provider, model)
      if (!group.options.some(option => option.value === value)) {
        const label = model === ''
          ? (missing ? `${provider} (${missing})` : provider)
          : (missing ? `${model} (${missing})` : model)
        group.options.unshift({ value, label })
      }
      return out
    }

    /** The reasoning efforts one model advertises, without the stored fallback. */
    function effortsOf(groups, provider, model) {
      const group = groups.find(item => item.id === provider)
      const found = group?.models.find(item => item.id === model)
      return found?.reasoning?.efforts ?? []
    }

    /** The tail of a wire model id: its last non-empty path segment. */
    function modelIdTail(model) {
      const text = String(model ?? '')
      return text.split('/').filter(Boolean).at(-1) ?? text
    }

    /**
     * The catalog display name of one recorded route. The wire projection carries only a
     * provider and a model id, so the name is advisory: an unadvertised route stays nameless.
     */
    function routeModelName(groups, route) {
      if (!Array.isArray(groups) || route === null || typeof route !== 'object') return undefined
      const group = groups.find(item => item?.id === route.provider)
      const model = group?.models?.find(item => item?.id === route.model)
      const name = typeof model?.name === 'string' ? model.name.trim() : ''
      return name === '' ? undefined : name
    }

    /**
     * Human label of one recorded route: the catalog name when the catalog advertises the
     * route, else the raw provider beside the model id tail. `named` keeps the two apart, so
     * accessible text can still name the provider whenever only the evidence is available.
     */
    function routeLabel(groups, route) {
      const name = routeModelName(groups, route)
      if (name !== undefined) return { value: name, named: true }
      return { value: `${route.provider} · ${modelIdTail(route.model)}`, named: false }
    }

    /** No catalog read yet; the raw ids stay readable in the meantime. */
    const NO_CATALOG = { status: 'idle', groups: [] }

    /**
     * One Host-wide model catalog, read at most once per client runtime. A display name only
     * decorates a recorded route, so a failed read degrades to raw ids: it never blocks, and
     * it never hides the evidence the badge exists to show.
     */
    function createModelNames() {
      let snapshot = NO_CATALOG
      const listeners = new Set()
      let pending
      const publish = next => {
        snapshot = next
        for (const listener of [...listeners]) listener()
      }
      const load = remote => {
        if (pending !== undefined || snapshot.status === 'ready') return pending
        if (typeof remote?.session?.modelCatalog !== 'function') {
          if (snapshot.status !== 'unavailable') publish({ status: 'unavailable', groups: [] })
          return undefined
        }
        publish({ status: 'loading', groups: [] })
        pending = Promise.resolve().then(() => remote.session.modelCatalog()).then(response => {
          const groups = response?.ok === false ? undefined : response?.value?.groups
          publish(Array.isArray(groups) && groups.length > 0 ? { status: 'ready', groups } : { status: 'unavailable', groups: [] })
        }).catch(() => publish({ status: 'unavailable', groups: [] }))
        return pending
      }
      return {
        load,
        getSnapshot: () => snapshot,
        subscribe: listener => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }

    /** Read the catalog only when the caller actually provides a loader. */
    function loadModelNames(names, remote) {
      if (typeof names?.load === 'function') names.load(remote)
    }

    /** Suggested route id for a catalog model: a short, readable slug. */
    function slugForModel(model) {
      const tail = String(model ?? '').split('/').filter(Boolean).pop() ?? ''
      const slug = tail
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
      return slug === '' ? 'route' : slug
    }

    /** Unique route id beside the ones already in use. */
    function uniqueRouteId(base, taken) {
      const slug = slugForModel(base)
      if (!taken.has(slug)) return slug
      for (let index = 2; ; index++) {
        const candidate = `${slug}-${index}`
        if (!taken.has(candidate)) return candidate
      }
    }

    /** Catalog groups filtered by a free-text query over provider and model names. */
    function filterCatalog(groups, query) {
      const needle = String(query ?? '').trim().toLowerCase()
      if (needle === '') return groups
      return groups
        .map(group => ({
          ...group,
          models: group.models.filter(model => [model.id, model.name, group.id, group.name]
            .some(value => String(value ?? '').toLowerCase().includes(needle))),
        }))
        .filter(group => group.models.length > 0)
    }

    /** Add a tag, keeping the list unique and trimmed. */
    function addTag(list, tag) {
      const value = String(tag ?? '').trim().toLowerCase()
      if (value === '' || list.includes(value)) return list
      return [...list, value]
    }

    /** Drop one tag. */
    function removeTag(list, tag) {
      return list.filter(item => item !== tag)
    }

    /** Every capability tag the route table advertises. */
    function knownTags(routes) {
      return [...new Set(routes.flatMap(route => route.tags ?? []))].sort()
    }

    /** Draft rows from a saved config value; unknown fields are dropped. */
    function draftsOf(value) {
      const routes = Array.isArray(value?.routes) ? value.routes : []
      const agents = Array.isArray(value?.agents) ? value.agents : []
      return {
        showAgentOverview: value?.showAgentOverview === true,
        manageOfficialSettings: value?.manageOfficialSettings === true,
        maxConcurrent: Number.isFinite(value?.maxConcurrent) ? Number(value.maxConcurrent) : 4,
        routes: routes.map(route => ({
          id: String(route?.id ?? ''),
          provider: String(route?.provider ?? ''),
          model: String(route?.model ?? ''),
          reasoningEffort: String(route?.reasoningEffort ?? ''),
          tags: Array.isArray(route?.tags) ? route.tags.map(String) : [],
          note: String(route?.note ?? ''),
        })),
        agents: agents.map(agent => ({
          id: String(agent?.id ?? ''),
          name: String(agent?.name ?? ''),
          description: String(agent?.description ?? ''),
          instructions: String(agent?.instructions ?? ''),
          routes: Array.isArray(agent?.routes) ? agent.routes.map(String) : [],
          needs: Array.isArray(agent?.needs) ? agent.needs.map(String) : [],
          basePreset: String(agent?.basePreset ?? 'standard'),
        })),
      }
    }

    /** Turn drafts back into config values, dropping blank rows and fields left empty. */
    function valuesOf(drafts) {
      const routes = drafts.routes
        .filter(hasRouteContent)
        .filter(route => route.id && route.provider && route.model)
        .map(route => ({
          id: route.id,
          provider: route.provider,
          model: route.model,
          ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}),
          ...(route.tags.length > 0 ? { tags: route.tags } : {}),
          ...(route.note ? { note: route.note } : {}),
        }))
      const agents = drafts.agents
        .filter(hasAgentContent)
        .filter(agent => agent.id && agent.description)
        .map(agent => ({
          id: agent.id,
          ...(agent.name ? { name: agent.name } : {}),
          description: agent.description,
          instructions: agent.instructions,
          ...(agent.routes.length > 0 ? { routes: agent.routes } : {}),
          ...(agent.needs.length > 0 ? { needs: agent.needs } : {}),
          ...(agent.basePreset && agent.basePreset !== 'standard' ? { basePreset: agent.basePreset } : {}),
        }))
      return { showAgentOverview: drafts.showAgentOverview === true, manageOfficialSettings: drafts.manageOfficialSettings === true, maxConcurrent: drafts.maxConcurrent, routes, agents }
    }

    /** The atomic mutate operations one save performs, against a single revision. */
    // A Host still running an older schema refuses the whole write over one unknown path, so
    // `showAgentOverview` is only written once the Host's resolved section carries that field.
    function saveOps(values, overviewSupported = true) {
      return [
        { op: 'set', path: ['routes'], value: values.routes },
        { op: 'set', path: ['agents'], value: values.agents },
        ...(overviewSupported ? [{ op: 'set', path: ['showAgentOverview'], value: values.showAgentOverview === true }] : []),
        { op: 'set', path: ['manageOfficialSettings'], value: values.manageOfficialSettings },
        { op: 'set', path: ['maxConcurrent'], value: values.maxConcurrent },
      ]
    }

    /** Validate drafts the way the Host will; returns a message or undefined. */
    function draftProblem(drafts) {
      if (!Number.isInteger(drafts.maxConcurrent) || drafts.maxConcurrent < 0) {
        return 'the concurrency limit must be a non-negative whole number'
      }
      const routeIds = new Set()
      const pairs = new Set()
      for (const route of drafts.routes) {
        if (!hasRouteContent(route)) continue
        if (!route.id || !route.provider || !route.model) return 'route rows need id, provider and model'
        if (routeIds.has(route.id)) return `duplicate route id "${route.id}"`
        routeIds.add(route.id)
        const pair = `${route.provider}/${route.model}`
        if (pairs.has(pair)) return `route "${route.id}" repeats ${pair}`
        pairs.add(pair)
      }
      const agentIds = new Set()
      for (const agent of drafts.agents) {
        if (!hasAgentContent(agent)) continue
        if (!agent.id || !agent.description) return 'agent rows need id and description'
        if (!/^[a-z][a-z0-9-]{0,47}$/.test(agent.id)) return `agent id "${agent.id}" must be lowercase letters, digits and dashes`
        if (agentIds.has(agent.id)) return `duplicate agent id "${agent.id}"`
        agentIds.add(agent.id)
        if (!agent.basePreset) return `agent "${agent.id}" needs a basePreset`
        const missing = agent.routes.filter(id => !routeIds.has(id))
        if (missing.length > 0) return `agent "${agent.id}" names unknown routes: ${missing.join(', ')}`
      }
      return undefined
    }

    /**
     * Per-field validation problems of one draft, keyed `route:<index>:<field>` and
     * `agent:<index>:<field>`. The values are dictionary keys, so the page can localise them;
     * blank rows are ignored, exactly like in {@link draftProblem}.
     */
    function fieldProblems(drafts) {
      const problems = {}
      const routeIdCount = new Map()
      const pairCount = new Map()
      const agentIdCount = new Map()
      const bump = (counter, key) => counter.set(key, (counter.get(key) ?? 0) + 1)

      for (const route of drafts.routes) {
        if (!hasRouteContent(route)) continue
        if (route.id !== '') bump(routeIdCount, route.id)
        if (route.provider !== '' && route.model !== '') bump(pairCount, routeKey(route.provider, route.model))
      }
      for (const agent of drafts.agents) {
        if (!hasAgentContent(agent)) continue
        if (agent.id !== '') bump(agentIdCount, agent.id)
      }

      drafts.routes.forEach((route, index) => {
        if (!hasRouteContent(route)) return
        const key = field => `route:${index}:${field}`
        if (route.id === '') problems[key('id')] = 'problem.route.id.empty'
        else if (routeIdCount.get(route.id) > 1) problems[key('id')] = 'problem.route.id.duplicate'
        if (route.provider === '' || route.model === '') problems[key('model')] = 'problem.route.model.empty'
        else if (pairCount.get(routeKey(route.provider, route.model)) > 1) problems[key('model')] = 'problem.route.pair.duplicate'
      })

      const routeIds = new Set(drafts.routes.filter(hasRouteContent).map(route => route.id).filter(id => id !== ''))
      drafts.agents.forEach((agent, index) => {
        if (!hasAgentContent(agent)) return
        const key = field => `agent:${index}:${field}`
        if (agent.id === '') problems[key('id')] = 'problem.agent.id.empty'
        else if (!/^[a-z][a-z0-9-]{0,47}$/.test(agent.id)) problems[key('id')] = 'problem.agent.id.invalid'
        else if (agentIdCount.get(agent.id) > 1) problems[key('id')] = 'problem.agent.id.duplicate'
        if (agent.description === '') problems[key('description')] = 'problem.agent.description.empty'
        if (agent.routes.some(id => !routeIds.has(id))) problems[key('routes')] = 'problem.agent.routes.unknown'
      })

      if (!Number.isInteger(drafts.maxConcurrent) || drafts.maxConcurrent < 0) {
        problems['general:maxConcurrent'] = 'problem.concurrency'
      }
      return problems
    }

    /** The official model-selection value, or undefined while unknown. */
    function officialModelsOf(ctx) {
      const snapshot = ctx?.configForms?.get?.('subagent-model-selection-settings')?.getSnapshot?.()
      return snapshot?.status === 'ready' ? snapshot.value : undefined
    }

    /**
     * Named agents whose declared routes are outside the allowlist a new Session would capture.
     * The Hub can only report this: the official setting belongs to another plugin, and while
     * `manageOfficialSettings` is on the Hub rewrites it anyway, so the two cannot disagree.
     * @returns {Array<{ presetId: string, agentId: string, outside: string[], allowed: string[] }>}
     */
    function presetAllowlistProblems(drafts, officialModels) {
      if (drafts.manageOfficialSettings === true) return []
      if (officialModels?.enabled !== true || !Array.isArray(officialModels.allowedModels)) return []
      const allowed = officialModels.allowedModels
        .filter(route => typeof route?.provider === 'string' && route.provider !== ''
          && typeof route?.model === 'string' && route.model !== '')
      if (allowed.length === 0) return []
      const allowedKeys = new Set(allowed.map(route => routeKey(route.provider, route.model)))
      const byId = new Map(drafts.routes.filter(route => route.id !== '').map(route => [route.id, route]))
      const problems = []
      for (const agent of drafts.agents) {
        if (!hasAgentContent(agent) || agent.id === '' || agent.routes.length === 0) continue
        const outside = agent.routes
          .map(id => byId.get(id))
          .filter(route => route !== undefined && route.provider !== '' && route.model !== '')
          .filter(route => !allowedKeys.has(routeKey(route.provider, route.model)))
          .map(route => `${route.provider}/${route.model}`)
        if (outside.length === 0) continue
        problems.push({
          presetId: `hub-agent-${agent.id}`,
          agentId: agent.id,
          outside,
          allowed: allowed.map(route => `${route.provider}/${route.model}`),
        })
      }
      return problems
    }

    /** Agents that referenced a renamed route now reference the new name. */
    function renameRouteRefs(drafts, oldId, newId) {
      if (!oldId || oldId === newId) return drafts
      return {
        ...drafts,
        agents: drafts.agents.map(agent => (agent.routes.includes(oldId)
          ? { ...agent, routes: agent.routes.map(id => (id === oldId ? newId : id)) }
          : agent)),
      }
    }

    /** Agents stop referencing a deleted route. */
    function dropRouteRefs(drafts, id) {
      if (!id) return drafts
      return {
        ...drafts,
        agents: drafts.agents.map(agent => (agent.routes.includes(id)
          ? { ...agent, routes: agent.routes.filter(item => item !== id) }
          : agent)),
      }
    }

    /** Put an item back into a list at the place it came from. */
    function insertAt(list, index, item) {
      const next = [...list]
      next.splice(Math.min(Math.max(index, 0), next.length), 0, item)
      return next
    }

    let rowSequence = 0
    const rowKey = () => `sah-row-${++rowSequence}`

    /** Editor state has stable row identities; valuesOf strips these before saving. */
    function editorDraftsOf(value) {
      const draft = draftsOf(value)
      return {
        ...draft,
        routes: draft.routes.map(route => ({ ...route, _key: rowKey(), _referenceId: route.id })),
        agents: draft.agents.map(agent => ({ ...agent, _key: rowKey() })),
      }
    }

    /** Compare every visible row, including incomplete rows, without editor-only identity. */
    function sameDraft(a, b) {
      return JSON.stringify(draftsOf(a)) === JSON.stringify(draftsOf(b))
    }

    /** Preserve references while a name is temporarily blank or duplicates another name. */
    function changeRoute(draft, index, route) {
      const previous = draft.routes[index]
      if (previous === undefined) return draft
      const oldId = previous._referenceId ?? previous.id
      const canRename = route.id.trim() !== '' && !draft.routes.some((item, at) => at !== index && item.id === route.id)
      const nextRoute = { ...route, _key: previous._key, _referenceId: canRename ? route.id : oldId }
      const next = { ...draft, routes: draft.routes.map((item, at) => at === index ? nextRoute : item) }
      return canRename ? renameRouteRefs(next, oldId, route.id) : next
    }

    /** Undo restores route references to the original agents, even after other rows move. */
    function restoreDeletion(draft, entry) {
      if (entry.kind === 'agent') return { ...draft, agents: insertAt(draft.agents, entry.index, entry.item) }
      const id = entry.item._referenceId ?? entry.item.id
      return {
        ...draft,
        routes: insertAt(draft.routes, entry.index, entry.item),
        agents: draft.agents.map(agent => {
          const reference = entry.refs.find(ref => ref.key === agent._key)
          if (reference === undefined || agent.routes.includes(id)) return agent
          return { ...agent, routes: insertAt(agent.routes, reference.index, id) }
        }),
      }
    }

    /** The spawn delegation rows of one official preset, with their `allowedAgentPresets`. */
    function officialAllowlists(plugins) {
      const lists = []
      const walk = (rows) => {
        for (const row of rows ?? []) {
          if (row === null || typeof row !== 'object') continue
          if (Array.isArray(row.config)) walk(row.config)
          if (row.name !== '@deepseek-ai/dsh-tool-subagent') continue
          if (row.config?.provider !== 'spawn') continue
          lists.push(row.config?.allowedAgentPresets ?? [])
        }
      }
      walk(plugins)
      return lists
    }

    /** Whether the official preset rows already carry every expected named agent. */
    function allowlistSynced(lists, expected) {
      if (expected.length === 0) return true
      const seen = new Set(lists.flat())
      return expected.every(id => seen.has(id))
    }

    /**
     * Which observable half of the saved configuration the Host has not published yet. Public
     * contracts only: the preset roster and the model-selection settings form.
     * @returns {undefined | 'roster' | 'allowlist'} undefined means every observable part matches.
     */
    function officialSyncGap(values, presetState, modelState) {
      if (presetState?.status !== 'ready' || !Array.isArray(presetState.value?.presets)) return 'roster'
      const expected = values.agents.map(agent => `hub-agent-${agent.id}`).sort()
      const presets = presetState.value.presets.filter(preset => preset.id.startsWith('hub-agent-'))
      if (presets.some(preset => preset.broken !== undefined)) return 'roster'
      if (JSON.stringify(presets.map(preset => preset.id).sort()) !== JSON.stringify(expected)) return 'roster'
      if (values.routes.length === 0) return undefined
      if (modelState?.status !== 'ready' || modelState.value?.enabled !== true) return 'allowlist'
      const pairs = routes => [...new Set(routes.map(route => routeKey(route.provider, route.model)))].sort()
      return JSON.stringify(pairs(values.routes)) === JSON.stringify(pairs(modelState.value.allowedModels ?? [])) ? undefined : 'allowlist'
    }

    /** Whether every observable part of the save is published. */
    function officialSyncReady(values, presetState, modelState) {
      return officialSyncGap(values, presetState, modelState) === undefined
    }

    /** Read public Remote/Settings contracts; preset entry ids are not form namespaces. */
    async function readOfficialSyncState(ctx) {
      const response = await ctx.remote.agentPresets.list()
      return {
        presets: response?.ok === true
          ? { status: 'ready', value: response.value }
          : { status: 'unavailable' },
        models: ctx.configForms.get('subagent-model-selection-settings')?.getSnapshot?.(),
      }
    }

    /**
     * A bounded observer shared by the page and integration tests. The deadline is independent
     * of requests, so a rejected or never-settling read cannot leave the page busy forever.
     * Returns a disposer; late results from a replaced save or an unmounted page are ignored.
     */
    function observeOfficialSync({ values, readState, onState, timeoutMs = SYNC_TIMEOUT_MS,
      intervalMs = SYNC_POLL_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
      let finished = false
      let pollTimer
      let deadlineTimer
      // The last thing actually observed, so the deadline can say which half is missing instead
      // of only "unconfirmed". A read that never settles leaves this unreadable.
      let gap = 'unreadable'
      const finish = (state, detail) => {
        if (finished) return
        finished = true
        clearTimer(pollTimer)
        clearTimer(deadlineTimer)
        onState(state, detail)
      }
      const schedule = () => {
        if (!finished) pollTimer = setTimer(poll, intervalMs)
      }
      const poll = () => {
        if (finished) return
        Promise.resolve().then(readState).then(state => {
          if (finished) return
          const next = officialSyncGap(values, state.presets, state.models)
          if (next === undefined) {
            finish('complete')
            return
          }
          gap = next
          schedule()
        }, schedule).catch(schedule)
      }
      deadlineTimer = setTimer(() => finish('pending', gap), timeoutMs)
      onState('checking')
      poll()
      return () => {
        finished = true
        clearTimer(pollTimer)
        clearTimer(deadlineTimer)
      }
    }

    /** The selection catalog the main agent receives, previewed from the draft. */
    function catalogPreview(drafts) {
      const lines = []
      const routes = drafts.routes.filter(route => route.id && route.provider && route.model)
      if (routes.length > 0) {
        lines.push('Models:')
        for (const route of routes) {
          const tags = route.tags.length > 0 ? ` — tags: ${route.tags.join(', ')}` : ''
          lines.push(`- \`${route.provider}/${route.model}\`${tags}${route.note ? `; ${route.note}` : ''}`)
        }
        const tags = knownTags(routes)
        if (tags.length > 0) lines.push(`Capability tags: ${tags.map(tag => `\`${tag}\``).join(', ')}.`)
      }
      const agents = drafts.agents.filter(agent => agent.id && agent.description)
      if (agents.length > 0) {
        lines.push('', 'Named agents:')
        for (const agent of agents) {
          const limited = agent.routes.length > 0
            ? agent.routes.map(id => {
              const route = routes.find(item => item.id === id)
              return route === undefined ? id : `${id} = ${route.provider}/${route.model}`
            }).join(', ')
            : 'any configured model'
          const needs = agent.needs.length > 0 ? `tags: ${agent.needs.join(', ')}; ` : ''
          lines.push(`- \`hub-agent-${agent.id}\` — ${agent.description} (${needs}routes: ${limited}).`)
        }
      }
      return lines.join('\n')
    }

    // ── presentation ──────────────────────────────────────────────────────────────────────────────

    const CSS = `
.sah{--sah-border:var(--dsw-alias-border-l2,#36373b);--sah-line:var(--dsw-alias-border-l1,#2c2d31);--sah-panel:var(--dsw-alias-bg-layer-2,#232529);--sah-raised:var(--dsw-alias-bg-layer-3,#202126);--sah-text:var(--dsw-alias-label-primary,#e6e6e6);--sah-sub:var(--dsw-alias-label-secondary,#b8b8b8);--sah-mute:var(--dsw-alias-label-tertiary,#8c8c8c);--sah-accent:var(--dsw-alias-state-business-primary,#5686fe);--sah-danger:var(--dsw-alias-state-error-primary,#ef4444);--sah-warn:var(--dsw-alias-state-warn-primary,#c69026);--sah-ok:var(--dsw-alias-state-success-primary,#3aa76d);--sah-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.05));display:flex;flex-direction:column;gap:16px;max-width:960px;font-size:13px;line-height:1.5;color:var(--sah-text)}
.sah *{box-sizing:border-box}
.sah-hero{display:flex;flex-direction:column;gap:8px}
.sah-intro{margin:0;color:var(--sah-sub);font-size:12.5px;line-height:20px;max-width:76ch}
.sah-summary{display:flex;flex-wrap:wrap;gap:8px}
.sah-badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border:1px solid var(--sah-border);border-radius:999px;font-size:12px;color:var(--sah-sub);background:var(--sah-panel)}
.sah-badge-dot{width:6px;height:6px;border-radius:50%;background:var(--sah-mute)}
.sah-badge-on .sah-badge-dot{background:var(--sah-ok)}
.sah-panel{border:1px solid var(--sah-border);border-radius:12px;background:var(--sah-panel);overflow:hidden}
.sah-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 16px 8px}
.sah-panel-heading{display:flex;flex-direction:column;gap:4px;min-width:0}
.sah-title{margin:0;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;line-height:20px}
.sah-icon{display:inline-flex;color:var(--sah-sub)}
.sah-hint{margin:0;color:var(--sah-mute);font-size:12px;line-height:18px;max-width:72ch}
.sah-panel-body{display:flex;flex-direction:column;gap:16px;padding:8px 16px 16px}
.sah-setting{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:12px 0;border-top:1px solid var(--sah-line)}
.sah-setting:first-child{border-top:0;padding-top:4px}
.sah-setting-text{display:flex;flex-direction:column;gap:4px;min-width:0}
.sah-setting-title{font-size:13px;font-weight:500}
.sah-setting-hint{font-size:12px;line-height:18px;color:var(--sah-mute);max-width:64ch}
.sah-setting-control{flex:none}
.sah-toggle{position:relative;width:36px;height:20px;border-radius:999px;border:0;padding:0;cursor:pointer;background:var(--sah-border);transition:background .16s}
.sah-toggle-on{background:var(--sah-accent)}
.sah-toggle:disabled{opacity:.45;cursor:default}
.sah-toggle-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .16s}
.sah-toggle-on .sah-toggle-thumb{transform:translateX(16px)}
.sah:focus-visible{outline:none}
.sah-tagbox button:focus-visible,.sah-linkbtn:focus-visible,.sah-stepper input:focus-visible,.sah-toggle:focus-visible,.sah-stepper button:focus-visible,.sah-iconbtn:focus-visible,.sah-btn:focus-visible,.sah-agent-toggle:focus-visible,.sah-disclosure:focus-visible,.sah-chipbtn:focus-visible,.sah-pick button:focus-visible,.sah-suggest button:focus-visible{outline:2px solid var(--sah-accent);outline-offset:2px}
.sah-concurrency{display:flex;align-items:center;gap:8px}
.sah-stepper{display:inline-flex;align-items:center;height:32px;border:1px solid var(--sah-border);border-radius:8px;background:var(--sah-raised);overflow:hidden}
.sah-stepper button{width:32px;height:100%;border:0;background:transparent;color:var(--sah-sub);font-size:16px;cursor:pointer}
.sah-stepper button:hover:not(:disabled){background:var(--sah-hover);color:var(--sah-text)}
.sah-stepper button:disabled{opacity:.35;cursor:default}
.sah-stepper input{width:48px;height:100%;border:0;border-left:1px solid var(--sah-border);border-right:1px solid var(--sah-border);background:transparent;color:var(--sah-text);font:inherit;text-align:center;font-variant-numeric:tabular-nums;-moz-appearance:textfield}
.sah-stepper input::-webkit-inner-spin-button,.sah-stepper input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.sah-chipbtn{height:28px;min-width:28px;padding:0 10px;border:1px solid var(--sah-border);border-radius:8px;background:var(--sah-panel);color:var(--sah-sub);font:inherit;font-size:12.5px;line-height:1;cursor:pointer;transition:border-color .16s,background .16s,color .16s}
.sah-chipbtn:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed,#5d5e63);color:var(--sah-text)}
.sah-chipbtn[aria-pressed="true"]{border-color:var(--sah-accent);background:color-mix(in srgb,var(--sah-accent) 14%,transparent);color:var(--sah-text)}
.sah-chipbtn:disabled{opacity:.4;cursor:default}
.sah-list{display:flex;flex-direction:column;gap:8px}
.sah-route-card,.sah-agent-card{border:1px solid var(--sah-border);border-radius:10px;background:var(--sah-raised);transition:border-color .16s}
.sah-route-card:hover,.sah-agent-card:hover{border-color:var(--dsw-alias-label-dimmed,#5d5e63)}
.sah-route-card{display:flex;flex-direction:column;gap:12px;padding:12px}
.sah-route-main{display:grid;grid-template-columns:28px minmax(0,1fr) minmax(0,150px) auto;gap:8px;align-items:start}
.sah-route-main-solo{grid-template-columns:28px minmax(0,1fr) auto}
.sah-route-meta{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.6fr) minmax(0,1fr);gap:8px;padding:12px 0 0 36px;border-top:1px dashed var(--sah-line)}
.sah-order{height:32px;margin-top:20px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:var(--sah-panel);color:var(--sah-mute);font-size:12px;font-variant-numeric:tabular-nums}
.sah-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.sah-field-wide{grid-column:1/-1}
.sah-label{font-size:12px;line-height:16px;color:var(--sah-sub)}
.sah-field-hint{font-size:11.5px;line-height:16px;color:var(--sah-mute)}
.sah-field-error{font-size:11.5px;line-height:16px;color:var(--sah-danger)}
.sah-field-bad .sah-input,.sah-field-bad .sah-select,.sah-field-bad .sah-textarea{border-color:var(--sah-danger)}
.sah-field-bad .sah-input:focus,.sah-field-bad .sah-select:focus,.sah-field-bad .sah-textarea:focus{box-shadow:0 0 0 3px color-mix(in srgb,var(--sah-danger) 20%,transparent)}
.sah-select,.sah-input,.sah-textarea{width:100%;border:1px solid var(--sah-border);border-radius:8px;background:var(--sah-panel);color:var(--sah-text);font:inherit;font-size:13px;transition:border-color .16s}
.sah-select,.sah-input{height:32px;padding:0 10px}
.sah-select{padding-right:26px;text-overflow:ellipsis}
.sah-textarea{padding:8px 10px;line-height:1.55;min-height:84px;resize:vertical}
.sah-select:hover:not(:disabled),.sah-input:hover:not(:disabled),.sah-textarea:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed,#5d5e63)}
.sah-select:focus,.sah-input:focus,.sah-textarea:focus{outline:none;border-color:var(--sah-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--sah-accent) 22%,transparent)}
.sah-select:disabled,.sah-input:disabled{color:var(--sah-mute);cursor:default}
.sah-row-actions{display:flex;gap:2px;height:32px;margin-top:20px;align-items:center}
.sah-iconbtn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:6px;background:transparent;color:var(--sah-mute);cursor:pointer;font-size:14px}
.sah-iconbtn:hover:not(:disabled){background:var(--sah-hover);color:var(--sah-text)}
.sah-iconbtn-danger:hover:not(:disabled){color:var(--sah-danger);background:color-mix(in srgb,var(--sah-danger) 14%,transparent)}
.sah-iconbtn:disabled{opacity:.3;cursor:default}
.sah-tagbox{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-height:32px;padding:3px 6px;border:1px solid var(--sah-border);border-radius:8px;background:var(--sah-panel)}
.sah-tagbox:focus-within{border-color:var(--sah-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--sah-accent) 22%,transparent)}
.sah-tagbox input{flex:1 1 80px;min-width:80px;height:24px;border:0;background:transparent;color:var(--sah-text);font:inherit;font-size:12.5px;outline:none}
.sah-chip{max-width:100%;overflow-wrap:anywhere;white-space:normal;min-height:24px;height:auto;display:inline-flex;align-items:center;gap:3px;padding:0 8px;border:1px solid var(--sah-border);border-radius:999px;background:var(--sah-raised);font-size:12px;color:var(--sah-sub)}
.sah-chip button{border:0;background:transparent;color:inherit;cursor:pointer;padding:0;font:inherit;line-height:1;opacity:.7}
.sah-chip button:hover{opacity:1;color:var(--sah-danger)}
.sah-suggest{display:flex;flex-wrap:wrap;gap:4px}
.sah-suggest button{height:22px;padding:0 8px;border:1px dashed var(--sah-border);border-radius:999px;background:transparent;color:var(--sah-mute);font:inherit;font-size:11.5px;cursor:pointer}
.sah-suggest button:hover{color:var(--sah-text);border-color:var(--sah-accent)}
.sah-pick{display:flex;flex-wrap:wrap;gap:8px}
.sah-pick button{max-width:100%;overflow-wrap:anywhere;white-space:normal;min-height:28px;height:auto;flex-wrap:wrap;display:inline-flex;align-items:center;gap:8px;padding:0 10px;border:1px solid var(--sah-border);border-radius:8px;background:var(--sah-panel);color:var(--sah-sub);font:inherit;font-size:12.5px;cursor:pointer;transition:border-color .16s,background .16s,color .16s}
.sah-pick button:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed,#5d5e63);color:var(--sah-text)}
.sah-pick button[aria-pressed="true"]{border-color:var(--sah-accent);background:color-mix(in srgb,var(--sah-accent) 14%,transparent);color:var(--sah-text)}
.sah-pick-route{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11px;color:var(--sah-mute)}
.sah-templates,.sah-chips{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.sah-templates-label{font-size:12px;color:var(--sah-mute)}
.sah-agent-head{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 0}
.sah-agent-toggle{flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:4px 4px 4px 12px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.sah-agent-toggle:hover{background:var(--sah-hover)}
.sah-avatar{flex:none;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:color-mix(in srgb,var(--sah-accent) 18%,transparent);color:var(--sah-accent);font-weight:600}
.sah-agent-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.sah-agent-name{display:flex;align-items:center;gap:8px;font-weight:500;min-width:0;flex-wrap:wrap;overflow-wrap:anywhere}
.sah-flag{width:7px;height:7px;flex:none;border-radius:50%;background:var(--sah-danger)}
.sah-agent-desc{color:var(--sah-mute);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sah-code{overflow-wrap:anywhere;max-width:100%;font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11px;font-weight:400;color:var(--sah-mute);padding:1px 6px;border-radius:4px;background:var(--sah-panel)}
.sah-agent-badges{display:flex;gap:4px;flex:none;max-width:40%;overflow:hidden}
.sah-chevron{display:inline-flex;color:var(--sah-mute);transition:transform .16s}
.sah-chevron-open{transform:rotate(180deg)}
.sah-agent-body{display:flex;flex-direction:column;gap:12px;padding:12px 16px 16px;border-top:1px solid var(--sah-line)}
.sah-grid-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:12px}
.sah-btn{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 14px;border:1px solid transparent;border-radius:8px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap}
.sah-btn:disabled{opacity:.4;cursor:default}
.sah-btn-outline{border-color:var(--sah-border);background:transparent;color:var(--sah-sub)}
.sah-btn-outline:hover:not(:disabled){background:var(--sah-hover);color:var(--sah-text)}
.sah-btn-primary{background:var(--sah-text);color:var(--sah-raised)}
.sah-btn-primary:hover:not(:disabled){opacity:.9}
.sah-btn-sm{height:28px;padding:0 10px;font-size:12.5px;font-weight:400}
.sah-empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:24px 16px;border:1px dashed var(--sah-border);border-radius:10px;color:var(--sah-mute);font-size:12.5px;text-align:center}
.sah-notice{margin:0;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--sah-sub)}
.sah-notice-error{color:var(--sah-danger)}
.sah-notice-warn{align-items:flex-start;color:var(--sah-warn);gap:10px}
.sah-notice-warn strong{display:block;font-weight:600;margin-bottom:4px}
.sah-notice-list{margin:0;padding-inline-start:18px;display:grid;gap:4px}
.sah-notice-list code{color:inherit}
.sah-notice-warn span{color:var(--sah-sub)}
.sah-linkbtn{border:0;background:transparent;color:var(--sah-accent);font:inherit;font-size:12px;cursor:pointer;padding:0}
.sah-linkbtn:hover{text-decoration:underline}
.sah-preview-head{display:flex;align-items:center;gap:8px;padding-right:12px}
.sah-preview{margin:0;padding:12px 14px;border-radius:8px;background:var(--sah-raised);color:var(--sah-sub);font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11.5px;line-height:18px;white-space:pre-wrap;overflow:auto;max-height:320px}
.sah-disclosure{flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.sah-disclosure:hover{background:var(--sah-hover)}
.sah-footer{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:12px;padding:12px 16px;margin-top:4px;border:1px solid var(--sah-border);border-radius:12px;background:color-mix(in srgb,var(--sah-panel) 92%,transparent);backdrop-filter:blur(8px)}
.sah-footer-left{flex:1;min-width:0;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--sah-sub)}
.sah-dirty-dot{width:7px;height:7px;border-radius:50%;background:var(--sah-warn);flex:none}
.sah-status-error{color:var(--sah-danger)}
.sah-status-warn{color:var(--sah-warn)}
.sah-status-ok{color:var(--sah-ok)}
.sah-undo{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--sah-sub);min-width:0;overflow-wrap:anywhere;flex-wrap:wrap}
.sah-footer-keys{font-size:11.5px;color:var(--sah-mute);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.sah *{transition:none!important;animation:none!important}}
@media (forced-colors:active){.sah-toggle,.sah-chipbtn[aria-pressed="true"],.sah-pick button[aria-pressed="true"]{border:2px solid Highlight}.sah *:focus-visible{outline:2px solid Highlight;box-shadow:none}}
@media (max-width:480px){.sah-panel-head{flex-wrap:wrap}.sah-agent-toggle{gap:8px}.sah-avatar{display:none}.sah-preview-head{flex-wrap:wrap}.sah-footer-left{flex-basis:100%}.sah-footer{gap:8px}.sah-btn{padding-inline:10px}.sah-route-main,.sah-route-main-solo{grid-template-columns:20px minmax(0,1fr)}.sah-order{min-width:0}.sah-concurrency{max-width:100%}.sah-setting-control{max-width:100%}}
@media (max-width:760px){.sah-route-main,.sah-route-main-solo{grid-template-columns:28px minmax(0,1fr)}.sah-route-main .sah-field{grid-column:2}.sah-route-main .sah-row-actions{grid-column:1/-1;justify-content:flex-end;margin-top:0}.sah-route-meta,.sah-grid-2{grid-template-columns:1fr;padding-left:0}.sah-agent-badges{display:none}.sah-setting{flex-direction:column;align-items:flex-start;gap:8px}.sah-footer{flex-wrap:wrap}.sah-footer-keys{display:none}.sah-concurrency{flex-wrap:wrap}}
.sah-workspace{box-sizing:border-box;max-width:960px;width:100%;gap:0;font-size:14px;height:min(800px,var(--sah-workspace-height,calc(100dvh - 120px)));min-height:0;overflow:hidden;border:1px solid var(--sah-border);border-radius:12px;background:var(--sah-panel);container-type:inline-size;container-name:sah-settings}
.sah-workspace-content{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:16px;scroll-padding-block:16px}
.sah-workspace>.sah-workspace-header{padding:12px 16px 4px;flex:none}
.sah-workspace>.sah-workspace-tabs{padding-inline:16px;margin-bottom:0;flex:none}
.sah-workspace>.sah-notice{margin:8px 16px;flex:none}
.sah-workspace .sah-footer{position:static;flex:none;margin:0;border:0;border-top:1px solid var(--sah-border);border-radius:0;padding:12px 16px;background:var(--sah-panel);backdrop-filter:none;flex-wrap:wrap}
.sah-workspace .sah-footer-left{color:var(--sah-sub);min-width:140px}
.sah-workspace .sah-footer>.sah-btn{min-width:84px;min-height:36px}
.sah-workspace .sah-role-list-head h3{margin-inline-end:auto}
.sah-workspace .sah-linkbtn{min-height:32px;padding-inline:6px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center}
.sah-workspace .sah-linkbtn:disabled{opacity:.4;cursor:default}
.sah-settings-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.sah-settings-toolbar .sah-input{flex:1;min-width:180px;width:auto}
.sah-settings-toolbar .sah-select{width:auto;max-width:180px}
.sah-workspace .sah-btn,.sah-workspace .sah-iconbtn{transition:background-color 150ms,color 150ms,border-color 150ms}
.sah-workspace .sah-iconbtn{min-width:30px;min-height:30px;flex:none}
.sah-workspace .sah-btn:hover:not(:disabled),.sah-workspace .sah-iconbtn:hover:not(:disabled){background:var(--sah-hover);color:var(--sah-text)}
.sah-workspace .sah-btn-primary:hover:not(:disabled){background:color-mix(in srgb,var(--sah-accent) 85%,var(--sah-text))}
.sah-workspace .sah-btn:active:not(:disabled),.sah-workspace .sah-iconbtn:active:not(:disabled){transform:scale(.96)}
.sah-workspace .sah-route-card{padding:0;gap:0;background:var(--sah-raised);overflow:hidden}
.sah-route-summary{display:flex;align-items:center;gap:4px;padding:4px 8px;min-height:54px}
.sah-route-toggle{display:grid;grid-template-columns:18px minmax(0,1fr) 120px 82px 130px;align-items:center;gap:12px;flex:1;min-width:0;min-height:44px;padding:4px;border:0;background:transparent;color:var(--sah-text);font:inherit;text-align:start;cursor:pointer;border-radius:6px}
.sah-route-toggle:hover{background:var(--sah-hover)}
.sah-route-label{display:flex;flex-direction:column;min-width:0;gap:2px}
.sah-route-label strong{font-size:13px;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sah-route-label small,.sah-route-provider{color:var(--sah-sub);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sah-route-effort{font-size:12px;color:var(--sah-sub);overflow-wrap:anywhere}
.sah-route-tags{display:flex;gap:4px;min-width:0;overflow:hidden}
.sah-route-tags .sah-chip{max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
.sah-workspace .sah-route-editor{padding:14px 16px 16px;border-top:1px solid var(--sah-border)}
.sah-workspace .sah-route-main{grid-template-columns:minmax(0,1fr) minmax(140px,.35fr)}
.sah-workspace .sah-route-main-solo{grid-template-columns:minmax(0,1fr)}
.sah-workspace .sah-route-meta{padding:14px 0 0;margin-top:14px;grid-template-columns:minmax(140px,1fr) minmax(180px,1.4fr)}
.sah-workspace .sah-route-meta>.sah-field:last-child{grid-column:1/-1}
.sah-row-order{display:flex;align-items:center;gap:2px;flex:none}
.sah-drag-handle{cursor:grab;color:var(--sah-sub)}
.sah-drag-handle:active{cursor:grabbing}
.sah-route-card[data-drop-target=true],.sah-role-accordion[data-drop-target=true]{outline:2px solid var(--sah-accent);outline-offset:-2px}
.sah-provider-group{border:0;margin:0 0 14px}
.sah-provider-group>summary{cursor:pointer;font-size:12px;font-weight:600;color:var(--sah-sub);padding:8px 0}
.sah-model-picker{border:1px solid var(--sah-border);border-radius:8px;padding:8px 10px}
.sah-model-picker>summary{cursor:pointer;display:list-item;color:var(--sah-sub);font-size:12px}
.sah-model-picker .sah-pick{margin-top:10px}
.sah-selected-models{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;color:var(--sah-sub);font-size:12px}
.sah-workspace .sah-role-accordion-head{padding-inline:8px}
.sah-workspace .sah-role-toggle{padding-inline:4px}
.sah-workspace .sah-setting{padding-block:18px;gap:20px}
.sah-workspace .sah-setting-hint,.sah-workspace .sah-hint{color:var(--sah-sub)}
.sah-workspace .sah-role-summary{color:var(--sah-sub)}
.sah-settings-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.sah-route-toggle:focus-visible,.sah-provider-group>summary:focus-visible,.sah-model-picker>summary:focus-visible{outline:2px solid var(--sah-accent);outline-offset:-2px}
@container sah-settings (max-width:820px){.sah-route-toggle{grid-template-columns:18px minmax(0,1fr) 72px}.sah-route-provider,.sah-route-tags{display:none}.sah-workspace .sah-role-summary{display:none}.sah-workspace .sah-route-meta{grid-template-columns:1fr}.sah-workspace .sah-setting{align-items:flex-start;flex-wrap:wrap}.sah-workspace .sah-setting-control{margin-inline-start:auto}}
@media(prefers-reduced-motion:reduce){.sah-workspace button{transition:none!important;transform:none!important}}
.sah-workspace-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 0 14px}
.sah-workspace-header h2{font-size:18px;line-height:26px;font-weight:600;margin:0;min-width:0}
.sah-workspace-tabs{display:flex;gap:22px;border-bottom:1px solid var(--sah-border);margin-bottom:20px}
.sah-workspace-tabs button{border:0;border-bottom:3px solid transparent;padding:10px 4px;background:transparent;color:var(--sah-sub);font:inherit;font-size:13px;font-weight:500;cursor:pointer}
.sah-workspace-tabs button[aria-selected="true"]{color:var(--sah-text);border-bottom-color:var(--sah-accent)}
.sah-workspace-tabs button:focus-visible,.sah-role-toggle:focus-visible,.sah-role-advanced summary:focus-visible,.sah-role-templates summary:focus-visible{outline:2px solid var(--sah-accent);outline-offset:2px}
.sah-tab-panel{min-width:0}
.sah-tab-panel[hidden]{display:none}
.sah-workspace .sah-panel{border:0;border-radius:0;background:transparent}
.sah-workspace .sah-panel-head{padding:0 0 14px}
.sah-workspace .sah-panel-body{padding:0 0 20px}
.sah-role-list-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:12px}
.sah-role-list-head h3{font-size:14px;margin:0;font-weight:600}
.sah-role-list-head>.sah-linkbtn{display:inline-flex;align-items:center;gap:6px}
.sah-role-accordions{display:flex;flex-direction:column;gap:10px}
.sah-role-accordion{min-width:0;border:1px solid var(--sah-border);border-radius:8px;overflow:hidden;background:var(--sah-panel)}
.sah-role-accordion-head{display:flex;align-items:center;gap:4px;padding-right:8px;min-height:46px}
.sah-role-toggle{display:flex;align-items:center;gap:10px;flex:1;min-width:0;min-height:46px;padding:10px 12px;border:0;background:transparent;color:var(--sah-text);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.sah-role-toggle:hover{background:var(--sah-hover)}
.sah-role-toggle strong{font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:45%}
.sah-role-caret{display:inline-flex;flex:none;color:var(--sah-sub);transition:transform .15s}
.sah-role-caret-open{transform:rotate(90deg)}
.sah-role-summary{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--sah-mute);font-size:12px}
.sah-role-models{display:flex;gap:4px;margin-left:auto;max-width:42%;min-width:0;overflow:hidden}
.sah-role-models .sah-chip{font-size:11px;min-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;line-height:20px}
.sah-role-accordion-body{padding:8px 16px 0}
.sah-role-editor{display:flex;flex-direction:column;gap:16px;min-width:0}
.sah-role-editor>.sah-field,.sah-role-rename>.sah-field{display:grid;grid-template-columns:84px minmax(0,1fr);gap:6px 12px;align-items:start}
.sah-role-editor>.sah-field>.sah-label,.sah-role-rename>.sah-field>.sah-label{grid-column:1;grid-row:1;padding-top:7px;font-size:13px;line-height:18px}
.sah-role-editor>.sah-field>:not(.sah-label),.sah-role-rename>.sah-field>:not(.sah-label){grid-column:2}
.sah-role-editor .sah-input{min-height:32px}
.sah-role-editor .sah-textarea{font-size:13px;min-height:84px;line-height:20px}
.sah-role-editor .sah-pick{gap:6px}
.sah-role-editor .sah-pick button{min-height:28px;border-radius:18px;padding:3px 10px;font-size:12px}
.sah-role-rename{margin-bottom:16px}
.sah-role-rename-trigger{display:inline-flex;align-items:center;justify-content:center;flex:none;min-width:28px;min-height:28px;padding:4px;border:0;border-radius:6px;background:transparent;color:var(--sah-mute);font:inherit;font-size:12px;cursor:pointer}
.sah-role-rename-trigger:hover:not(:disabled){background:var(--sah-hover);color:var(--sah-text)}
.sah-role-rename-trigger:disabled{opacity:.4;cursor:default}
.sah-role-rename-trigger:focus-visible{outline:2px solid var(--sah-accent);outline-offset:2px}
.sah-role-advanced{border-top:1px solid var(--sah-border);padding:12px 0;margin-top:2px}
.sah-role-advanced summary,.sah-role-templates summary{cursor:pointer;font-size:12px;color:var(--sah-sub)}
.sah-role-advanced summary span{margin-left:12px;color:var(--sah-mute);font-size:11px}
.sah-role-advanced-fields{display:grid;gap:14px;padding-top:16px}
.sah-role-remove{justify-self:start;color:var(--sah-danger)}
.sah-role-templates{margin-top:14px}
.sah-role-templates .sah-templates{padding-top:10px}
.sah-role-templates .sah-templates-label{display:none}
.sah-role-empty{padding:24px 12px;text-align:center;color:var(--sah-mute);font-size:13px}
.sah-workspace .sah-footer-keys{display:none}
.sah-workspace .sah-btn-primary{background:var(--sah-accent);color:var(--dsw-alias-label-on-color,#fff)}
@media(max-width:480px){.sah-role-advanced summary span{display:none}.sah-role-models{max-width:36%}.sah-role-summary{display:none}.sah-role-editor>.sah-field,.sah-role-rename>.sah-field{grid-template-columns:72px minmax(0,1fr);column-gap:8px}.sah-role-accordion-body{padding-inline:12px}}

`

    const style = () => h('style', { key: 'css' }, CSS)
    /** An official icon when the shell supplies one, otherwise a text glyph. */
    const glyph = (name, fallback, size = 14) => (P[name] === undefined
      ? fallback == null ? null : h('span', { 'aria-hidden': true }, fallback)
      : h(P[name], { size, 'aria-hidden': true }))

    /** Bind the visible label, hint and inline error to the actual focusable control. */
    function Field({ label, hint, error, wide, children }) {
      const id = React.useId()
      const descriptions = [hint ? `${id}-hint` : '', error === undefined ? '' : `${id}-error`].filter(Boolean).join(' ') || undefined
      const child = React.Children.only(children)
      const control = ['input', 'select', 'textarea'].includes(child.type) || [TextInput, Select, GroupedSelect, TagInput].includes(child.type)
      const props = {
        id: control ? id : undefined,
        'aria-labelledby': `${id}-label`,
        'aria-describedby': descriptions,
        'aria-invalid': error === undefined ? undefined : true,
        ...(control ? {} : { role: 'group', tabIndex: -1 }),
      }
      return h('div', { className: `sah-field${wide ? ' sah-field-wide' : ''}${error === undefined ? '' : ' sah-field-bad'}` },
        control ? h('label', { id: `${id}-label`, className: 'sah-label', htmlFor: id }, label) : h('span', { id: `${id}-label`, className: 'sah-label' }, label),
        React.cloneElement(child, props),
        error === undefined ? null : h('span', { id: `${id}-error`, className: 'sah-field-error' }, error),
        hint ? h('span', { id: `${id}-hint`, className: 'sah-field-hint' }, hint) : null)
    }

    /** Native select, styled like the official settings selects. */
    function Select({ value, options, onChange, ...extra }) {
      return h('select', {
        className: 'sah-select',
        value,
        onChange: event => onChange(event.target.value),
        ...extra,
      }, options.map(option => h('option', { key: option.value, value: option.value }, option.label)))
    }

    /** Native select whose options are grouped, one group per provider. */
    function GroupedSelect({ value, groups, placeholder, onChange, ...extra }) {
      return h('select', {
        className: 'sah-select',
        value,
        onChange: event => onChange(event.target.value),
        ...extra,
      },
      placeholder === undefined
        ? null
        : h('option', { key: '__placeholder', value: '' }, placeholder),
      groups.map(group => h('optgroup', { key: group.id, label: group.label },
        group.options.map(option => h('option', { key: option.value, value: option.value }, option.label)))))
    }

    /** Native text input, styled like the official settings inputs. */
    function TextInput({ value, onChange, ...extra }) {
      return h('input', { className: 'sah-input', value, onChange: event => onChange(event.target.value), ...extra })
    }

    /** A tag chip with an optional remove control. */
    function Chip({ tag, onRemove, removeLabel }) {
      return h('span', { className: 'sah-chip' },
        tag,
        onRemove === undefined ? null : h('button', { type: 'button', onClick: () => onRemove(tag), 'aria-label': removeLabel ?? tag }, '×'))
    }

    /** Chips plus an inline input that adds a tag on Enter, then one-click suggestions. */
    function TagInput({ tags, onChange, placeholder, suggestions = [], disabled, t, ...inputProps }) {
      const [text, setText] = React.useState('')
      const commit = () => {
        const next = addTag(tags, text)
        setText('')
        if (next.length !== tags.length) onChange(next)
      }
      const offered = suggestions.filter(tag => !tags.includes(tag))
      return h(React.Fragment, null,
        h('div', { className: 'sah-tagbox' },
          tags.map(tag => h(Chip, { key: tag, tag, removeLabel: t?.('common.removeTag', { tag }), onRemove: disabled ? undefined : value => onChange(removeTag(tags, value)) })),
          h('input', {
            ...inputProps,
            value: text,
            disabled,
            placeholder: tags.length === 0 ? placeholder : '',
            onChange: event => setText(event.target.value),
            onBlur: commit,
            onKeyDown: (event) => {
              if (event.isComposing || event.nativeEvent?.isComposing) return
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault()
                commit()
              } else if (event.key === 'Backspace' && text === '' && tags.length > 0) {
                onChange(tags.slice(0, -1))
              }
            },
          })),
        offered.length === 0 ? null : h('div', { className: 'sah-suggest' },
          offered.map(tag => h('button', { key: tag, type: 'button', disabled, onClick: () => onChange(addTag(tags, tag)) }, `+ ${tag}`))))
    }

    /** An on/off switch drawn like the official settings switch. */
    function Toggle({ checked, onChange, label, disabled }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked,
        'aria-label': label,
        disabled,
        className: `sah-toggle${checked ? ' sah-toggle-on' : ''}`,
        onClick: () => onChange(!checked),
      }, h('span', { className: 'sah-toggle-thumb' }))
    }

    /** A whole-number stepper. */
    function Stepper({ value, onChange, min = 0, max = 64, disabled, label, t }) {
      const set = next => onChange(Math.min(max, Math.max(min, Math.floor(Number(next) || 0))))
      return h('div', { className: 'sah-stepper' },
        h('button', { type: 'button', disabled: disabled || value <= min, onClick: () => set(value - 1), 'aria-label': t('concurrency.decrease') }, '−'),
        h('input', { type: 'number', min, max, step: 1, value: String(value), disabled, 'aria-label': label, onChange: event => set(event.target.value) }),
        h('button', { type: 'button', disabled: disabled || value >= max, onClick: () => set(value + 1), 'aria-label': t('concurrency.increase') }, '+'))
    }

    /** A small icon-only button. */
    function IconButton({ title, onClick, disabled, danger, children }) {
      return h('button', {
        type: 'button',
        className: `sah-iconbtn${danger ? ' sah-iconbtn-danger' : ''}`,
        title,
        'aria-label': title,
        disabled,
        onClick,
      }, children)
    }

    /** One grouped panel: heading, hint, optional action, body. */
    function Panel({ icon, title, hint, action, children }) {
      return h('section', { className: 'sah-panel' },
        h('header', { className: 'sah-panel-head' },
          h('div', { className: 'sah-panel-heading' },
            h('h3', { className: 'sah-title' }, icon ? h('span', { className: 'sah-icon' }, icon) : null, title),
            hint ? h('p', { className: 'sah-hint' }, hint) : null),
          action ?? null),
        h('div', { className: 'sah-panel-body' }, children))
    }

    /** A setting row: text on the left, its control on the right. */
    function SettingRow({ title, hint, children }) {
      return h('div', { className: 'sah-setting' },
        h('div', { className: 'sah-setting-text' },
          h('div', { className: 'sah-setting-title' }, title),
          hint ? h('div', { className: 'sah-setting-hint' }, hint) : null),
        h('div', { className: 'sah-setting-control' }, children))
    }

    // ── sections ─────────────────────────────────────────────────────────────────────────────────

    /** Provider choices from the catalog, keeping a stored provider the catalog no longer lists. */
    function providerChoices(groups, provider, missing = '不在当前目录') {
      const choices = groups.map(group => ({ value: group.id, label: `${group.name || group.id} (${group.id})` }))
      if (provider && !choices.some(choice => choice.value === provider)) {
        choices.unshift({ value: provider, label: missing ? `${provider} (${missing})` : provider })
      }
      return choices
    }

    /** Model choices of one provider, keeping a stored model the catalog no longer lists. */
    function modelChoices(groups, provider, model, missing = '不在当前目录') {
      const group = groups.find(item => item.id === provider)
      const choices = group === undefined ? [] : group.models.map(item => ({ value: item.id, label: item.name || item.id }))
      if (model && !choices.some(choice => choice.value === model)) {
        choices.unshift({ value: model, label: missing ? `${model} (${missing})` : model })
      }
      return choices
    }

    /** Reasoning efforts one model advertises, keeping a stored effort it no longer lists. */
    function effortChoices(groups, provider, model, effort, missing = '不在当前目录') {
      const group = groups.find(item => item.id === provider)
      const found = group?.models.find(item => item.id === model)
      const choices = (found?.reasoning?.efforts ?? []).map(item => ({ value: item.id, label: item.name || item.id }))
      if (effort && !choices.some(choice => choice.value === effort)) {
        choices.unshift({ value: effort, label: missing ? `${effort} (${missing})` : effort })
      }
      return choices
    }

    /** One model route: the merged model pick and the effort on top, then name, tags and note. */
    function OrderControls({ index, total, disabled, onMove, dragProps = {}, t }) {
      return h('div', { className: 'sah-row-order' },
        h('button', { type: 'button', className: 'sah-iconbtn sah-drag-handle', title: t('settings.drag'), 'aria-label': t('settings.drag'), disabled,
          ...dragProps, draggable: !disabled && !!dragProps.onDragStart,
          onKeyDown: event => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
            event.preventDefault()
            if (!disabled) onMove?.(index, event.key === 'ArrowUp' ? -1 : 1)
          },
        }, glyph('IconDragHandleOutlineRegular', '⠿')),
        h(IconButton, { title: t('route.moveUp'), disabled: disabled || index === 0, onClick: () => onMove?.(index, -1) }, glyph('IconChevronUpOutlineRegular', '↑')),
        h(IconButton, { title: t('route.moveDown'), disabled: disabled || index === total - 1, onClick: () => onMove?.(index, 1) }, glyph('IconChevronDownOutlineRegular', '↓')))
    }

    function RouteCard({ open = true, onToggle, rowProps = {}, dragProps, reorderDisabled, ...props }) {
      const { route, index, total, groups, disabled, problems = {}, onRemove, onMove, t } = props
      const panelId = React.useId()
      const group = groups.find(group => group.id === route.provider)
      const name = group?.models?.find(model => model.id === route.model)?.name || route.model || t('route.unnamed')
      const bad = Object.keys(problems).some(key => key.startsWith(`route:${index}:`))
      return h('article', { className: 'sah-route-card', 'data-sah-key': route._key, ...rowProps },
        h('div', { className: 'sah-route-summary' },
          h('button', { type: 'button', className: 'sah-route-toggle sah-row-toggle', 'aria-expanded': open, 'aria-controls': open ? panelId : undefined,
            title: `${route.provider}/${route.model}${route.note ? ` · ${route.note}` : ''}`, onClick: onToggle },
            h('span', { className: `sah-role-caret${open ? ' sah-role-caret-open' : ''}` }, glyph('IconChevronRightOutlineRegular', '›')),
            h('span', { className: 'sah-route-label' }, h('strong', null, name), h('small', null, `${index + 1}. ${route.id || t('route.unnamed')}`)),
            h('span', { className: 'sah-route-provider' }, group?.name || route.provider),
            h('span', { className: 'sah-route-effort' }, route.reasoningEffort || t('route.effortDefault')),
            h('span', { className: 'sah-route-tags', title: route.tags.join(', ') }, route.tags.slice(0, 2).map(tag => h(Chip, { key: tag, tag })), route.tags.length > 2 ? h(Chip, { tag: `+${route.tags.length - 2}` }) : null),
            bad ? h('span', { className: 'sah-field-error' }, '!') : null),
          h(OrderControls, { index, total, disabled: disabled || reorderDisabled, onMove, dragProps, t }),
          h(IconButton, { title: t('route.remove'), danger: true, disabled, onClick: onRemove }, glyph('IconTrashOutlineRegular', '×'))),
        open ? h('div', { id: panelId }, h(RouteEditor, props)) : null)
    }

    function RouteEditor({ route, index, groups, catalogReady = true, known, problems = {}, onChange, disabled, t }) {
      const set = patch => onChange({ ...route, ...patch })
      // Only a loaded catalog can say a stored value is gone.
      const missing = catalogReady ? t('route.missing') : null
      const derived = route.id === '' || route.id === slugForModel(route.model)
      // The effort select only appears when the model offers efforts, or one is already stored.
      const efforts = effortChoices(groups, route.provider, route.model, route.reasoningEffort, missing)
      const pickModel = value => {
        const picked = parseModelValue(value)
        onChange({ ...route, provider: picked.provider, model: picked.model, reasoningEffort: '', ...(derived ? { id: slugForModel(picked.model) } : {}) })
      }
      const errorText = field => {
        const key = problems[`route:${index}:${field}`]
        return key === undefined ? undefined : t(key)
      }
      return h('div', { className: 'sah-route-editor' },
        h('code', { className: 'sah-field-hint', style: { display: 'block', overflowWrap: 'anywhere', marginBottom: '10px' } }, `${route.provider}/${route.model}`),
        h('div', { className: `sah-route-main${efforts.length > 0 ? '' : ' sah-route-main-solo'}` },
          h(Field, { label: t('route.model'), error: errorText('model') },
            h(GroupedSelect, {
              value: modelOptionValue(route.provider, route.model),
              disabled,
              placeholder: t('route.pickModel'),
              groups: modelGroups(groups, route.provider, route.model, missing),
              onChange: pickModel,
            })),
          efforts.length > 0
            ? h(Field, { label: t('route.effort'), hint: route.reasoningEffort ? t('route.effortHint') : undefined },
              h(Select, {
                value: route.reasoningEffort,
                disabled,
                options: [{ value: '', label: t('route.effortDefault') }, ...efforts],
                onChange: value => set({ reasoningEffort: value }),
              }))
            : null),
        h('div', { className: 'sah-route-meta' },
          h(Field, { label: t('route.id'), hint: t('route.idHint'), error: errorText('id') },
            h(TextInput, { value: route.id, disabled, placeholder: 'flash', onChange: value => set({ id: value }) })),
          h(Field, { label: t('route.tags') },
            h(TagInput, { t, tags: route.tags, disabled, placeholder: t('route.tagPlaceholder'), suggestions: known, onChange: tags => set({ tags }) })),
          h(Field, { label: t('route.note') },
            h(TextInput, { value: route.note, disabled, placeholder: 'DeepSeek Flash', onChange: value => set({ note: value }) }))))
    }

    /** One named agent: a collapsible card whose header summarises it. */
    function AgentCard({ agent, index, routes, presets, known, problems = {}, onChange, onRemove, disabled, defaultOpen, forceOpen = false, t }) {
      const [open, setOpen] = React.useState(defaultOpen === true)
      React.useEffect(() => { if (forceOpen) setOpen(true) }, [forceOpen])
      const set = patch => onChange({ ...agent, ...patch })
      const usable = routes.filter(route => route.id && route.provider && route.model)
      const toggleRoute = id => set({ routes: agent.routes.includes(id) ? agent.routes.filter(item => item !== id) : [...agent.routes, id] })
      const presetOptions = presets.map(preset => ({ value: preset.id, label: preset.name && preset.name !== preset.id ? `${preset.name} (${preset.id})` : preset.id }))
      if (agent.basePreset && !presetOptions.some(option => option.value === agent.basePreset)) {
        presetOptions.unshift({ value: agent.basePreset, label: `${agent.basePreset} (${t('route.missing')})` })
      }
      const errorText = field => {
        const key = problems[`agent:${index}:${field}`]
        if (key === undefined) return undefined
        if (key !== 'problem.agent.routes.unknown') return t(key)
        // Name the routes the agent points at but the table no longer has.
        const unknown = agent.routes.filter(id => !usable.some(route => route.id === id))
        return h(React.Fragment, null, t(key), unknown.length > 0 ? ` ${unknown.join(', ')}` : '')
      }
      // A collapsed card still has to say that something is wrong with it.
      const broken = ['id', 'description', 'routes'].some(field => problems[`agent:${index}:${field}`] !== undefined)
      return h('div', { className: 'sah-agent-card' },
        h('div', { className: 'sah-agent-head' },
          h('button', {
            type: 'button',
            className: 'sah-agent-toggle',
            'aria-expanded': open,
            title: t('agent.toggle'),
            onClick: () => setOpen(!open),
          },
          h('span', { className: 'sah-avatar' }, (agent.id || '?').slice(0, 1).toUpperCase()),
          h('span', { className: 'sah-agent-text' },
            h('span', { className: 'sah-agent-name' },
              agent.id || t('agent.unnamed'),
              broken ? h('span', { className: 'sah-field-error' }, t('invalid.fields')) : null,
              h('code', { className: 'sah-code' }, `hub-agent-${agent.id || '<id>'}`)),
            h('span', { className: 'sah-agent-desc' }, agent.description || t('agent.noDescription'))),
          h('span', { className: 'sah-agent-badges' },
            agent.routes.length === 0
              ? h(Chip, { tag: t('agents.anyModel') })
              : agent.routes.slice(0, 2).map(id => h(Chip, { key: id, tag: id })),
            agent.routes.length > 2 ? h(Chip, { tag: `+${agent.routes.length - 2}` }) : null),
          h('span', { className: `sah-chevron${open ? ' sah-chevron-open' : ''}` }, glyph('IconChevronDownOutlineRegular', '▾'))),
          h(IconButton, { title: t('agent.remove'), danger: true, disabled, onClick: onRemove }, glyph('IconTrashOutlineRegular', '×'))),
        open ? h('div', { className: 'sah-agent-body' },
          h('div', { className: 'sah-grid-2' },
            h(Field, { label: t('agent.id'), hint: t('agent.idHint'), error: errorText('id') },
              h(TextInput, { value: agent.id, disabled, placeholder: 'reviewer', onChange: value => set({ id: value.trim().toLowerCase() }) })),
            h(Field, { label: t('agent.description'), hint: t('agent.descriptionHint'), error: errorText('description') },
              h(TextInput, { value: agent.description, disabled, placeholder: 'Reviews a diff and reports findings', onChange: value => set({ description: value }) }))),
          h(Field, { label: t('agent.instructions'), hint: t('agent.instructionsHint'), wide: true },
            h('textarea', {
              className: 'sah-textarea',
              rows: 4,
              value: agent.instructions,
              disabled,
              placeholder: 'Report findings only; never edit files.',
              onChange: event => set({ instructions: event.target.value }),
            })),
          h(Field, { label: t('agents.routesLabel'), hint: t('agents.routesHint'), error: errorText('routes'), wide: true },
            usable.length === 0
              ? h('span', { className: 'sah-field-hint' }, t('agents.noRoutes'))
              : h('div', { className: 'sah-pick' }, usable.map(route => h('button', {
                key: route.id,
                type: 'button',
                disabled,
                'aria-pressed': agent.routes.includes(route.id),
                onClick: () => toggleRoute(route.id),
              }, route.id, h('span', { className: 'sah-pick-route' }, `${route.provider}/${route.model}`))))),
          h('div', { className: 'sah-grid-2' },
            h(Field, { label: t('agents.basePreset'), hint: t('agents.basePresetHint') },
              h(Select, { value: agent.basePreset, disabled, options: presetOptions, onChange: value => set({ basePreset: value }) })),
            h(Field, { label: t('agents.needs') },
              h(TagInput, { t, tags: agent.needs, disabled, placeholder: t('route.tagPlaceholder'), suggestions: known, onChange: needs => set({ needs }) })))) : null)
    }

    function roleName(agent, t) {
      if (agent.name) return agent.name
      const template = AGENT_TEMPLATES.find(template => template.id && template.id === agent.id)
      return template ? t(template.label) : agent.id || t('agent.unnamed')
    }

    /** One role's compact inline fields. Technical settings stay collapsed. */
    function AgentEditor({ agent, index, routes, presets, known, problems, disabled, t, forceAdvanced, onChange, onRemove }) {
      const set = patch => onChange({ ...agent, ...patch })
      const usable = routes.filter(route => route.id && route.provider && route.model)
      const error = field => problems[`agent:${index}:${field}`] ? t(problems[`agent:${index}:${field}`]) : undefined
      const options = presets.map(preset => ({ value: preset.id, label: preset.name || preset.id }))
      if (!options.some(option => option.value === agent.basePreset)) options.unshift({ value: agent.basePreset, label: `${agent.basePreset} (${t('route.missing')})` })
      return h('div', { className: 'sah-role-editor' },
        h(Field, { label: t('workspace.purpose'), error: error('description') }, h(TextInput, { value: agent.description, disabled, onChange: description => set({ description }) })),
        h(Field, { label: t('agent.instructions') }, h('textarea', { className: 'sah-textarea', rows: 3, value: agent.instructions, disabled, onChange: event => set({ instructions: event.target.value }) })),
        h(Field, { label: t('agents.routesLabel'), error: error('routes') },
          usable.length ? h('div', null,
            h('div', { className: 'sah-selected-models' }, agent.routes.length
              ? agent.routes.map(id => h(Chip, { key: id, tag: routes.find(route => route.id === id)?.note || id }))
              : t('settings.anyModel')),
            h('details', { className: 'sah-model-picker' },
              h('summary', null, t('settings.configureModels'), ' · ', t('settings.selectedModels', { selected: agent.routes.length, total: usable.length })),
              h('p', { className: 'sah-field-hint' }, t('agents.routesHint')),
              h('div', { className: 'sah-pick' }, usable.map(route => h('button', { key: route.id, type: 'button', disabled, title: `${route.provider}/${route.model}`, 'aria-pressed': agent.routes.includes(route.id),
                onClick: () => set({ routes: agent.routes.includes(route.id) ? agent.routes.filter(id => id !== route.id) : [...agent.routes, route.id] }),
              }, route.note || route.id))))) : h('span', { className: 'sah-field-hint' }, t('agents.noRoutes'))),
        h('details', { className: 'sah-role-advanced', open: forceAdvanced || undefined },
          h('summary', null, t('workspace.advanced'), h('span', null, t('workspace.advancedHint'))),
          h('div', { className: 'sah-role-advanced-fields' },
            h(Field, { label: t('workspace.roleId'), hint: t('agent.idHint'), error: error('id') }, h(TextInput, { value: agent.id, disabled, onChange: id => set({ id: id.trim().toLowerCase() }) })),
            h(Field, { label: t('agents.basePreset'), hint: t('agents.basePresetHint') }, h(Select, { value: agent.basePreset, disabled, options, onChange: basePreset => set({ basePreset }) })),
            h(Field, { label: t('agents.needs') }, h(TagInput, { t, tags: agent.needs, disabled, suggestions: known, onChange: needs => set({ needs }) })),
            h('code', { className: 'sah-code' }, `hub-agent-${agent.id}`),
            h('button', { type: 'button', className: 'sah-linkbtn sah-role-remove', disabled, onClick: onRemove }, t('agent.remove')))))
    }

    /** A single-column accordion. The title is editable in place without a permanent extra row. */
    function RoleAccordion({ open, onToggle, rowProps = {}, dragProps, reorderDisabled, total, onMove, ...props }) {
      const { agent, index, routes, problems, disabled, t, onChange } = props
      const panelId = React.useId()
      const [renaming, setRenaming] = React.useState(agent._fresh === true)
      const nameRef = React.useRef(null)
      const originalName = React.useRef(agent.name)
      React.useEffect(() => {
        if (open && renaming) { nameRef.current?.focus(); nameRef.current?.select() }
      }, [open, renaming])
      const bad = Object.keys(problems).some(key => key.startsWith(`agent:${index}:`))
      const labels = agent.routes.map(id => routes.find(route => route.id === id)?.note || id)
      return h('article', { className: 'sah-role-accordion', 'data-sah-key': agent._key, 'data-open': open ? 'true' : undefined, ...rowProps },
        h('div', { className: 'sah-role-accordion-head' },
          h('button', { type: 'button', className: 'sah-role-toggle sah-row-toggle', 'aria-expanded': open, 'aria-controls': open ? panelId : undefined, onClick: () => { setRenaming(false); onToggle() } },
            h('span', { className: `sah-role-caret${open ? ' sah-role-caret-open' : ''}` }, glyph('IconChevronRightOutlineRegular', '›')),
            h('strong', null, roleName(agent, t)),
            !open ? h('span', { className: 'sah-role-summary' }, agent.description || t('agent.noDescription')) : null,
            bad ? h('span', { className: 'sah-flag', title: t('invalid.fields') }) : null,
            h('span', { className: 'sah-role-models' }, h(Chip, { tag: labels[0] || t('agents.anyModel') }), labels.length > 1 ? h(Chip, { tag: `+${labels.length - 1}` }) : null)),
          h(OrderControls, { index, total, disabled: disabled || reorderDisabled, onMove, dragProps, t }),
          open ? h('button', { type: 'button', className: 'sah-role-rename-trigger', title: t('workspace.renameRole'), 'aria-label': t('workspace.renameRole'), disabled, onClick: () => { originalName.current = agent.name; setRenaming(true) } }, glyph('IconEditOutlineRegular', '✎')) : null),
        open ? h('div', { id: panelId, className: 'sah-role-accordion-body' },
          renaming ? h('div', { className: 'sah-role-rename' }, h(Field, { label: t('workspace.roleName') },
            h('input', { ref: nameRef, type: 'text', className: 'sah-input', value: agent.name || '', placeholder: roleName(agent, t), disabled,
              onChange: event => onChange({ ...agent, name: event.target.value }), onBlur: () => setRenaming(false),
              onKeyDown: event => {
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onChange({ ...agent, name: originalName.current }); setRenaming(false) }
                if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); setRenaming(false) }
              },
            }))) : null,
          h(AgentEditor, props)) : null)
    }

    // ── page ─────────────────────────────────────────────────────────────────────────────────────

    /** Settings-section page sharing the row form; the namespace is served only with a profile. */
    function SectionPage({ ctx, t, close }) {
      const form = React.useMemo(() => ctx.configForms.get(ENTRY_ID), [ctx])
      const [snapshot, setSnapshot] = React.useState(() => form.getSnapshot())
      React.useEffect(() => form.subscribe(() => setSnapshot(form.getSnapshot())), [form])
      const view = snapshot.status === 'unavailable'
        ? undefined
        : { state: snapshot, mutate: (ops, revision) => form.mutate(ops, revision) }
      return h(ConfigPage, { view: 'page', form: view, t, ctx, close })
    }

    /** The page itself: general settings, model routes, named agents, preview, save bar. */
    function ConfigPage({ view = 'page', form, t, ctx = {}, close }) {
      const value = form?.state?.value ?? {}
      const initial = React.useMemo(() => editorDraftsOf(value), [])
      const [draft, setDraft] = React.useState(initial)
      const [activeTab, setActiveTab] = React.useState('roles')
      const [selectedRole, setSelectedRole] = React.useState(initial.agents[0]?._key)
      const [openRoutes, setOpenRoutes] = React.useState(() => new Set())
      const [routeSearch, setRouteSearch] = React.useState('')
      const [roleSearch, setRoleSearch] = React.useState('')
      const [routeView, setRouteView] = React.useState('order')
      const [routeProvider, setRouteProvider] = React.useState('')
      const [orderNotice, setOrderNotice] = React.useState('')
      const contentRef = React.useRef(null)
      const scrollPositions = React.useRef({})
      const dragging = React.useRef(null)
      const [assistantBusy, setAssistantBusy] = React.useState(false)
      const [catalog, setCatalog] = React.useState({ status: 'loading', groups: [], failures: [] })
      // The official allowlist a new Session would capture. Read-only here: the page only
      // reports a preset that could never run, it never rewrites another plugin's setting.
      // Seeded synchronously so the first render (and a static one) already shows the warning.
      const [officialModels, setOfficialModels] = React.useState(() => officialModelsOf(ctx))
      const [presets, setPresets] = React.useState([{ id: 'standard', name: 'standard' }])
      const [status, setStatus] = React.useState(undefined)
      const [busy, setBusy] = React.useState(false)
      const [baseline, setBaseline] = React.useState(() => draftsOf(value))
      const [submitted, setSubmitted] = React.useState(false)
      const [previewOpen, setPreviewOpen] = React.useState(false)
      const [undo, setUndo] = React.useState(undefined)
      const [copied, setCopied] = React.useState(false)
      const [copyError, setCopyError] = React.useState(false)
      const stopSync = React.useRef(() => {})
      const lastSyncValues = React.useRef(undefined)
      const copyTimer = React.useRef(undefined)
      const saving = React.useRef(false)
      const rootRef = React.useRef(null)
      // Bound this form to the actual native scroll host, without changing shell CSS.
      React.useEffect(() => {
        const element = rootRef.current
        const win = element?.ownerDocument?.defaultView
        if (!element || !win) return
        let host = element.parentElement
        while (host && !['auto', 'scroll'].includes(win.getComputedStyle(host).overflowY)) host = host.parentElement
        const measure = () => {
          const rect = element.getBoundingClientRect()
          const scale = element.offsetHeight ? rect.height / element.offsetHeight : 1
          const hostRect = host?.getBoundingClientRect()
          const offset = (rect.top - (hostRect?.top ?? 0)) / (scale || 1) + (host?.scrollTop ?? win.scrollY ?? 0)
          const available = Math.max(240, (host?.clientHeight ?? win.innerHeight / (scale || 1)) - Math.max(0, offset) - 24)
          element.style.setProperty('--sah-workspace-height', `${Math.floor(available)}px`)
        }
        measure()
        const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(measure) : null
        if (host) observer?.observe(host)
        win.addEventListener('resize', measure)
        return () => { observer?.disconnect(); win.removeEventListener('resize', measure) }
      }, [])
      React.useEffect(() => {
        if (contentRef.current) contentRef.current.scrollTop = scrollPositions.current[activeTab] ?? 0
      }, [activeTab])
      const writable = form !== undefined && form.state?.status !== 'loading' && form.state?.writable !== false
      const hydrated = React.useRef(form?.state?.status !== 'loading')
      // The schema-resolved section lists every field the running Host knows, defaults included.
      const overviewSupported = Object.prototype.hasOwnProperty.call(value, 'showAgentOverview')
      const latestRevision = React.useRef(form?.state?.revision)
      const baselineRevision = React.useRef(form?.state?.revision)
      latestRevision.current = form?.state?.revision
      const disposed = React.useRef(false)
      const retainOpenRoutes = next => setOpenRoutes(current => {
        const ids = new Set(draft.routes.filter(route => current.has(route._key)).map(route => route.id))
        return new Set(next.routes.filter(route => ids.has(route.id)).map(route => route._key))
      })
      React.useEffect(() => {
        disposed.current = false
        return () => {
          disposed.current = true
          stopSync.current()
          clearTimeout(copyTimer.current)
        }
      }, [])
      // The page owns the keyboard shortcut, so it needs the focus: it takes it only when
      // nothing else has it, and never scrolls the shell.
      React.useEffect(() => {
        const element = rootRef.current
        if (element === null || typeof element.focus !== 'function') return
        const doc = element.ownerDocument
        const active = doc?.activeElement
        if (active !== undefined && active !== null && active !== doc?.body) return
        try {
          element.focus({ preventScroll: true })
        } catch {
          element.focus()
        }
      }, [])
      React.useEffect(() => {
        if (hydrated.current || form?.state?.status !== 'ready') return
        hydrated.current = true
        const next = editorDraftsOf(form.state.value)
        retainOpenRoutes(next)
        setDraft(next)
        setSelectedRole(next.agents[0]?._key)
        setBaseline(draftsOf(form.state.value))
        baselineRevision.current = form.state.revision
      }, [form?.state?.status, form?.state?.revision])

      // Both editors share one revision. Dirty drafts retain the revision they were based on.
      React.useEffect(() => {
        if (form?.state?.status !== 'ready' || saving.current || baselineRevision.current === form.state.revision) return
        if (!sameDraft(draft, baseline)) { setStatus({ kind: 'error', text: t('save.conflict') }); return }
        baselineRevision.current = form.state.revision
        const next = editorDraftsOf(form.state.value)
        const selectedId = draft.agents.find(agent => agent._key === selectedRole)?.id
        retainOpenRoutes(next)
        setDraft(next)
        setBaseline(draftsOf(form.state.value))
        setSelectedRole(next.agents.find(agent => agent.id === selectedId)?._key)
      }, [form?.state?.revision, form?.state?.status])

      const loadCatalog = React.useCallback(async () => {
        setCatalog(current => ({ ...current, status: 'loading' }))
        try {
          const response = await ctx.remote.session.modelCatalog()
          if (response.ok === false) {
            setCatalog(current => ({ ...current, status: 'error' }))
            return
          }
          setCatalog(current => ({ ...current, status: 'ready', groups: response.value?.groups ?? [], failures: response.value?.failures ?? [] }))
        } catch {
          setCatalog(current => ({ ...current, status: 'error' }))
        }
      }, [ctx])

      React.useEffect(() => {
        if (ctx.remote === undefined) return
        loadCatalog()
        try {
          ctx.remote.agentPresets.list().then((response) => {
            if (response.ok === false) return
            const list = (response.value?.presets ?? []).filter(preset => preset.broken === undefined && preset.id !== CONFIGURATION_PRESET_ID && !String(preset.id).startsWith('hub-agent-'))
            setPresets(list.length > 0 ? list : [{ id: 'standard', name: 'standard' }])
          }).catch(() => {})
        } catch {
          // the preset roster is optional; the built-in list stays in place
        }
      }, [ctx, loadCatalog])

      // Observe the official child-model allowlist a new Session would capture. Absent means
      // "unknown" (selection off, namespace unserved, or still loading), never "empty".
      React.useEffect(() => {
        const form = ctx?.configForms?.get?.('subagent-model-selection-settings')
        if (form === undefined) return
        const update = () => setOfficialModels(officialModelsOf(ctx))
        const dispose = form.subscribe?.(update)
        update()
        return dispose
      }, [ctx])

      /** Check the public model settings and preset roster; every check has a hard deadline. */
      const watchOfficialSync = React.useCallback((savedValues) => {
        stopSync.current()
        lastSyncValues.current = savedValues
        if (!savedValues.manageOfficialSettings) return
        stopSync.current = observeOfficialSync({
          values: savedValues,
          readState: () => readOfficialSyncState(ctx),
          onState: (state, detail) => {
            if (disposed.current) return
            if (state === 'checking') setStatus({ kind: 'busy', text: t('syncing') })
            else if (state === 'complete') setStatus({ kind: 'ok', text: t(savedValues.routes.length > 0 ? 'synced' : 'syncRosterReady') })
            else if (detail === 'roster') setStatus({ kind: 'warn', text: t('syncRosterMissing'), retry: true })
            else if (detail === 'allowlist') setStatus({ kind: 'warn', text: t('syncAllowlistMissing'), retry: true })
            else setStatus({ kind: 'warn', text: t('syncPending'), retry: true })
          },
        })
      }, [ctx, t])

      if (view === 'summary') {
        const limit = Number.isFinite(value.maxConcurrent) ? value.maxConcurrent : 4
        return h('span', null, t('summary', {
          routes: Array.isArray(value.routes) ? value.routes.length : 0,
          agents: Array.isArray(value.agents) ? value.agents.length : 0,
          limit: limit === 0 ? t('summary.unlimited') : limit,
          managed: value.manageOfficialSettings === true ? t('summary.managedOn') : t('summary.managedOff'),
        }))
      }

      const known = knownTags(draft.routes)
      const maxConcurrent = draft.maxConcurrent
      const values = valuesOf(draft)
      const problem = draftProblem(draft)
      const allowlistProblems = presetAllowlistProblems(draft, officialModels)
      const problems = fieldProblems(draft)
      const dirty = !sameDraft(draft, baseline)
      const locked = !writable || busy
      const modelRows = settingsRouteRows(draft.routes, catalog.groups, { search: routeSearch, view: routeView, provider: routeProvider })
      const roleQuery = roleSearch.trim().toLocaleLowerCase()
      const roleRows = draft.agents.map((agent, index) => ({ agent, index })).filter(({ agent }) => !roleQuery ||
        [roleName(agent, t), agent.id, agent.description, ...agent.needs].join(' ').toLocaleLowerCase().includes(roleQuery))
      const routeReorderDisabled = locked || !!routeSearch.trim() || routeView !== 'order' || !!routeProvider
      const clearModelFilters = () => { setRouteSearch(''); setRouteView('order'); setRouteProvider('') }
      const focusRow = key => requestAnimationFrame(() => {
        const row = [...(rootRef.current?.querySelectorAll('[data-sah-key]') ?? [])].find(row => row.dataset.sahKey === key)
        const handle = row?.querySelector('.sah-drag-handle')
        handle?.focus({ preventScroll: true })
        const content = contentRef.current
        if (handle && content) {
          const target = handle.getBoundingClientRect(), visible = content.getBoundingClientRect()
          if (target.top < visible.top + 12) content.scrollTop -= visible.top + 12 - target.top
          else if (target.bottom > visible.bottom - 12) content.scrollTop += target.bottom - visible.bottom + 12
        }
      })
      const reorder = (kind, key, target) => {
        if (locked || target < 0 || target >= draft[kind].length || !key) return
        setDraft(current => ({ ...current, [kind]: moveSettingsRow(current[kind], key, target) }))
        const row = draft[kind].find(row => row._key === key)
        setOrderNotice(t('settings.moved', { name: kind === 'agents' ? roleName(row, t) : row.note || row.id || row.model, position: target + 1 }))
        focusRow(key)
      }
      const rowInteraction = (kind, key, disabled) => ({
        dragProps: {
          onDragStart: event => {
            if (disabled) { event.preventDefault(); return }
            dragging.current = { kind, key }
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('application/x-dsh-hub-row', key)
          },
          onDragEnd: () => { dragging.current = null; rootRef.current?.querySelectorAll('[data-drop-target]').forEach(row => row.removeAttribute('data-drop-target')) },
        },
        rowProps: {
          onDragOver: event => {
            if (disabled || dragging.current?.kind !== kind || dragging.current.key === key) return
            event.preventDefault(); event.dataTransfer.dropEffect = 'move'; event.currentTarget.dataset.dropTarget = 'true'
          },
          onDragLeave: event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute('data-drop-target') },
          onDrop: event => {
            event.currentTarget.removeAttribute('data-drop-target')
            const from = dragging.current
            dragging.current = null
            if (disabled || from?.kind !== kind) return
            event.preventDefault(); event.stopPropagation()
            reorder(kind, from.key, draft[kind].findIndex(row => row._key === key))
          },
        },
      })

      const updateRoute = (index, route) => setDraft(current => changeRoute(current, index, route))
      const removeRoute = index => {
        const item = draft.routes[index]
        if (item === undefined) return
        const id = item._referenceId ?? item.id
        const refs = draft.agents.filter(agent => agent.routes.includes(id))
          .map(agent => ({ key: agent._key, index: agent.routes.indexOf(id) }))
        setUndo({ kind: 'route', index, item, refs })
        setDraft(current => dropRouteRefs({ ...current, routes: current.routes.filter((_, at) => at !== index) }, id))
      }
      const moveRoute = (index, delta) => reorder('routes', draft.routes[index]?._key, index + delta)
      const moveAgent = (index, delta) => reorder('agents', draft.agents[index]?._key, index + delta)
      const addRoute = () => {
        const route = { _key: rowKey(), _referenceId: '', id: '', provider: '', model: '', reasoningEffort: '', tags: [], note: '' }
        setDraft(current => ({ ...current, routes: [...current.routes, route] }))
        setOpenRoutes(current => new Set([...current, route._key]))
        clearModelFilters()
        setActiveTab('models')
        requestAnimationFrame(() => {
          const row = [...(rootRef.current?.querySelectorAll('[data-sah-key]') ?? [])].find(row => row.dataset.sahKey === route._key)
          row?.querySelector('select')?.focus()
        })
      }
      const updateAgent = (index, agent) => setDraft(current => ({ ...current, agents: current.agents.map((item, at) => at === index ? agent : item) }))
      const removeAgent = index => {
        const item = draft.agents[index]
        if (item === undefined) return
        if (selectedRole === item._key) setSelectedRole(undefined)
        setUndo({ kind: 'agent', index, item })
        setDraft(current => ({ ...current, agents: current.agents.filter((_, at) => at !== index) }))
      }
      /** Add a named agent from a template; the new card opens expanded. */
      const addAgent = template => {
        const source = template ?? { id: '', description: '', instructions: '' }
        const taken = new Set(draft.agents.map(agent => agent.id))
        const id = uniqueRouteId(source.id || 'role', taken)
        const role = {
          _key: rowKey(), _fresh: true, id,
          name: source.label ? t(source.label) : '',
          description: source.description === undefined ? '' : t(source.description),
          instructions: source.instructions === undefined ? '' : t(source.instructions),
          routes: [], needs: [], basePreset: 'standard',
        }
        setDraft(current => ({ ...current, agents: [...current.agents, role] }))
        setSelectedRole(role._key)
        setRoleSearch('')
        setActiveTab('roles')
      }

      /** Put the last deleted route or agent back where it was. */
      const undoLast = () => {
        if (undo === undefined) return
        const entry = undo
        setUndo(undefined)
        setDraft(current => restoreDeletion(current, entry))
        if (entry.kind === 'agent') { setRoleSearch(''); setActiveTab('roles'); setSelectedRole(entry.item._key) }
        else { clearModelFilters(); setActiveTab('models'); setOpenRoutes(current => new Set([...current, entry.item._key])) }
      }

      const save = async () => {
        if (!writable || saving.current) return
        setSubmitted(true)
        if (problem !== undefined) {
          setStatus({ kind: 'error', text: t('invalid.fields') })
          const first = Object.keys(problems)[0]
          if (first?.startsWith('agent:')) { setRoleSearch(''); setActiveTab('roles'); setSelectedRole(draft.agents[Number(first.split(':')[1])]?._key) }
          else if (first?.startsWith('route:')) {
            clearModelFilters(); setActiveTab('models')
            const key = draft.routes[Number(first.split(':')[1])]?._key
            setOpenRoutes(current => new Set([...current, key]))
          } else setActiveTab('general')
          requestAnimationFrame(() => rootRef.current?.querySelector('[aria-invalid="true"]')?.focus())
          return
        }
        saving.current = true
        setBusy(true)
        stopSync.current()
        try {
          const revision = baselineRevision.current
          const applied = await form.mutate(saveOps(values, overviewSupported), revision)
          if (applied !== true) {
            // A refused write reloads Host state; a moved revision means another editor won.
            await new Promise(resolve => setTimeout(resolve, 0))
            const conflict = latestRevision.current !== undefined && latestRevision.current !== revision
            setStatus({ kind: 'error', text: t(conflict ? 'save.conflict' : 'save.refused') })
            return
          }
          setBaseline(draftsOf(values))
          baselineRevision.current = latestRevision.current
          const nextDraft = editorDraftsOf(values)
          setSelectedRole(nextDraft.agents.find(agent => agent.id === draft.agents.find(agent => agent._key === selectedRole)?.id)?._key)
          retainOpenRoutes(nextDraft)
          setDraft(nextDraft)
          setSubmitted(false)
          // Route and preset edits only reach Sessions that start afterwards; say so once here
          // instead of letting an open Session fail against its captured allowlist.
          const routingKeys = list => JSON.stringify(list)
          const routingChanged = routingKeys(values.routes) !== routingKeys(baseline.routes)
            || routingKeys(values.agents) !== routingKeys(baseline.agents)
          setStatus({ kind: 'ok', text: t(routingChanged ? 'saved.routes' : 'saved') })
          setCopyError(false)
          setUndo(undefined)
          watchOfficialSync(values)
        } catch (error) {
          setStatus({ kind: 'error', text: t('invalid', { error: String(error?.message ?? error) }) })
        } finally {
          saving.current = false
          setBusy(false)
        }
      }
      const discard = () => {
        stopSync.current()
        const latest = form?.state?.status === 'ready' ? form.state.value : baseline
        const next = editorDraftsOf(latest)
        retainOpenRoutes(next)
        setDraft(next)
        setBaseline(draftsOf(latest))
        baselineRevision.current = form?.state?.revision
        const selectedId = draft.agents.find(agent => agent._key === selectedRole)?.id
        setSelectedRole(next.agents.find(agent => agent.id === selectedId)?._key)
        setSubmitted(false)
        setStatus(undefined)
        setCopyError(false)
        setCopied(false)
        setUndo(undefined)
      }
      /** Copy the catalog preview; the clipboard is optional and may refuse. */
      const copyPreview = async () => {
        if (preview === '') return
        try {
          const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
          if (clipboard === undefined || typeof clipboard.writeText !== 'function') throw new Error('clipboard unavailable')
          await clipboard.writeText(preview)
          setCopied(true)
          setCopyError(false)
          clearTimeout(copyTimer.current)
          copyTimer.current = setTimeout(() => { if (!disposed.current) setCopied(false) }, 1600)
        } catch {
          setCopyError(true)
          setPreviewOpen(true)
        }
      }
      /** Ctrl / Cmd + S saves, but only when there is something valid to save. */
      const onKeyDown = event => {
        if (event.metaKey !== true && event.ctrlKey !== true) return
        if (event.key !== 's' && event.key !== 'S') return
        event.preventDefault()
        if (dirty && writable && !busy) save()
      }

      const renderModelRow = ({ route, index }) => h(RouteCard, {
        key: route._key, route, index, total: draft.routes.length, groups: catalog.groups,
        catalogReady: catalog.status === 'ready', known, problems, disabled: locked, t,
        open: openRoutes.has(route._key), onToggle: () => setOpenRoutes(current => {
          const next = new Set(current); if (next.has(route._key)) next.delete(route._key); else next.add(route._key); return next
        }),
        reorderDisabled: routeReorderDisabled,
        ...rowInteraction('routes', route._key, routeReorderDisabled),
        onChange: next => updateRoute(index, next), onRemove: () => removeRoute(index), onMove: moveRoute,
      })
      const providerIds = [...new Set(draft.routes.map(route => route.provider).filter(Boolean))]
      const providerName = id => catalog.groups.find(group => group.id === id)?.name || id
      const anyModelOpen = modelRows.some(({ route }) => openRoutes.has(route._key))
      const preview = catalogPreview(draft)
      const undoName = undo === undefined
        ? ''
        : undo.kind === 'route'
          ? (undo.item.id || t('route.unnamed'))
          : (undo.item.id || t('agent.unnamed'))
      const quickLimits = [1, 2, 4, 8, 0]
      const templateRow = h('div', { className: 'sah-templates' },
        h('span', { className: 'sah-templates-label' }, t('agents.add')),
        AGENT_TEMPLATES.map(template => h('button', {
          key: template.label,
          type: 'button',
          className: 'sah-chipbtn',
          disabled: locked,
          onClick: () => addAgent(template),
        }, t(template.label))))
      const footerText = status !== undefined && (!dirty || status.kind === 'error')
        ? h('span', { className: `sah-status-${status.kind === 'busy' ? 'warn' : status.kind}`, role: 'status' }, status.text)
        : problem !== undefined && dirty
          ? h('span', { className: 'sah-status-error' }, t('invalid.fields'))
          : dirty
            ? h(React.Fragment, null, h('span', { className: 'sah-dirty-dot' }), h('span', null, t('footer.dirty')))
            : h('span', null, t(form?.state?.status === 'loading' ? 'settings.loading' : 'settings.clean'))

      const startAssistant = async () => {
        if (dirty || assistantBusy) return
        setAssistantBusy(true)
        try {
          const response = await ctx.remote?.agentPresets?.list()
          if (response?.ok === false || !response?.value?.presets?.some(preset => preset.id === CONFIGURATION_PRESET_ID && !preset.broken)) throw new Error('mode unavailable')
          const workspace = ctx.get?.('uiWorkspace') ?? ctx.uiWorkspace
          if (typeof workspace?.startSession !== 'function') throw new Error('navigation unavailable')
          workspace.startSession(undefined, { agentPreset: CONFIGURATION_PRESET_ID, prompt: t('assistant.starter'), whenDraftExists: 'keep' })
          close?.()
        } catch { setStatus({ kind: 'error', text: t('assistant.unavailable') }) }
        finally { if (!disposed.current) setAssistantBusy(false) }
      }
      return h('div', { className: 'sah sah-workspace', ref: rootRef, tabIndex: -1, onKeyDown },
        style(),
        form === undefined ? h('p', { className: 'sah-notice sah-notice-error' }, t('unavailable'))
          : !writable ? h('p', { className: 'sah-notice' }, t('common.readOnly')) : null,
        h('header', { className: 'sah-workspace-header' },
          h('h2', { title: t('workspace.lead') }, t('workspace.title')),
          h('button', { type: 'button', className: 'sah-btn sah-btn-outline', disabled: dirty || assistantBusy || !form, title: t(dirty ? 'assistant.dirty' : 'assistant.hint'), onClick: startAssistant },
            glyph('IconChatBubbleOutlineRegular', null), t(assistantBusy ? 'assistant.starting' : 'assistant.open'))),
        h('div', { className: 'sah-workspace-tabs', role: 'tablist', 'aria-label': t('workspace.navigation') },
          ['roles', 'models', 'general'].map(tab => h('button', { key: tab, type: 'button', id: `sah-tab-${tab}`, role: 'tab', 'aria-selected': activeTab === tab, 'aria-controls': `sah-page-${tab}`, tabIndex: activeTab === tab ? 0 : -1,
            onClick: () => setActiveTab(tab), onKeyDown: event => {
              const tabs = ['roles', 'models', 'general'], at = tabs.indexOf(tab)
              const next = event.key === 'ArrowRight' ? tabs[(at + 1) % 3] : event.key === 'ArrowLeft' ? tabs[(at + 2) % 3] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[2] : undefined
              if (next) { event.preventDefault(); setActiveTab(next); rootRef.current?.querySelector(`#sah-tab-${next}`)?.focus() }
            } }, t(`workspace.${tab}`)))),
        h('div', { className: 'sah-workspace-content', ref: contentRef, onScroll: event => { scrollPositions.current[activeTab] = event.currentTarget.scrollTop } },
        h('section', { className: 'sah-tab-panel', id: 'sah-page-roles', role: 'tabpanel', 'aria-labelledby': 'sah-tab-roles', hidden: activeTab !== 'roles' },
          allowlistProblems.length ? h('div', { className: 'sah-notice sah-notice-warn', role: 'status' }, h('div', null,
            h('strong', null, t('agents.allowlist.title')),
            h('ul', null, allowlistProblems.map(problem => h('li', { key: problem.presetId }, t('agents.allowlist.item', { agent: problem.agentId, routes: problem.outside.join(', '), allowed: problem.allowed.join(', ') })))), t('agents.allowlist.hint'))) : null,
          h('div', { className: 'sah-role-list-head' },
            h('h3', null, t('workspace.roles'), ` · ${draft.agents.length}`),
            h('button', { type: 'button', className: 'sah-linkbtn', disabled: !selectedRole, onClick: () => setSelectedRole(undefined) }, t('settings.collapseAll')),
            h('button', { type: 'button', className: 'sah-linkbtn', disabled: locked, onClick: () => addAgent() }, glyph('IconPlusOutlineRegular', '+'), t('workspace.addRole'))),
          draft.agents.length ? h('div', { className: 'sah-settings-toolbar' },
            h('input', { type: 'search', className: 'sah-input', value: roleSearch, placeholder: t('settings.searchRoles'), 'aria-label': t('settings.searchRoles'), onChange: event => setRoleSearch(event.target.value) }),
            roleSearch ? h('button', { type: 'button', className: 'sah-btn sah-btn-outline', onClick: () => setRoleSearch('') }, t('settings.clear')) : null) : null,
          draft.agents.length && !roleRows.length ? h('p', { className: 'sah-role-empty', role: 'status' }, t('settings.noResults')) : null,
          draft.agents.length ? h('div', { className: 'sah-role-accordions' }, roleRows.map(({ agent, index }) => h(RoleAccordion, {
            key: agent._key, agent, index, total: draft.agents.length, routes: draft.routes, presets, known, problems, disabled: locked, t,
            reorderDisabled: !!roleQuery, onMove: moveAgent, ...rowInteraction('agents', agent._key, locked || !!roleQuery),
            open: selectedRole === agent._key, onToggle: () => setSelectedRole(current => current === agent._key ? undefined : agent._key),
            forceAdvanced: submitted && !!problems[`agent:${index}:id`],
            onChange: next => updateAgent(index, next), onRemove: () => removeAgent(index),
          }))) : h('div', { className: 'sah-role-empty' }, t('agents.none')),
          h('details', { className: 'sah-role-templates' }, h('summary', null, t('workspace.templates')), templateRow)),
        h('section', { className: 'sah-tab-panel', id: 'sah-page-models', role: 'tabpanel', 'aria-labelledby': 'sah-tab-models', hidden: activeTab !== 'models' },
        h(Panel, {
          icon: glyph('IconBrowseOutlineRegular', null),
          title: t('routes.title'),
          hint: t('routes.hint'),
          action: draft.routes.length === 0 ? null : h('button', { type: 'button', className: 'sah-btn sah-btn-outline', disabled: locked, onClick: addRoute },
            glyph('IconPlusOutlineRegular', '+'), t('routes.add')),
        },
        catalog.status === 'loading' ? h('p', { className: 'sah-notice' }, t('routes.loading')) : null,
        catalog.status === 'error'
          ? h('p', { className: 'sah-notice sah-notice-error' }, t('routes.catalogError'),
            h('button', { type: 'button', className: 'sah-linkbtn', onClick: loadCatalog }, t('routes.retry')))
          : null,
        catalog.status === 'ready' && catalog.groups.length === 0 ? h('p', { className: 'sah-notice' }, t('routes.empty')) : null,
        catalog.failures.length > 0
          ? h('p', { className: 'sah-notice' }, t('routes.unavailable', { names: catalog.failures.map(failure => failure.name ?? failure.id).join(', ') }))
          : null,
        draft.routes.length === 0
          ? h('div', { className: 'sah-empty' },
            h('span', null, t('routes.none')),
            h('button', { type: 'button', className: 'sah-btn sah-btn-outline', disabled: locked, onClick: addRoute }, glyph('IconPlusOutlineRegular', '+'), t('routes.add')))
          : h(React.Fragment, null,
            h('div', { className: 'sah-settings-toolbar' },
              h('input', { type: 'search', className: 'sah-input', value: routeSearch, placeholder: t('settings.searchModels'), 'aria-label': t('settings.searchModels'), onChange: event => setRouteSearch(event.target.value) }),
              h(Select, { value: routeView, 'aria-label': t('settings.view'), options: ['order', 'name', 'provider'].map(value => ({ value, label: t(`settings.${value}`) })), onChange: setRouteView }),
              h(Select, { value: routeProvider, 'aria-label': t('settings.providerFilter'), options: [{ value: '', label: t('settings.allProviders') }, ...providerIds.map(value => ({ value, label: providerName(value) }))], onChange: setRouteProvider }),
              h('button', { type: 'button', className: 'sah-btn sah-btn-outline', disabled: !modelRows.length, onClick: () => setOpenRoutes(current => {
                const next = new Set(current)
                for (const { route } of modelRows) { if (anyModelOpen) next.delete(route._key); else next.add(route._key) }
                return next
              }) }, t(anyModelOpen ? 'settings.collapseAll' : 'settings.expandAll'))),
            routeReorderDisabled && !locked ? h('p', { className: 'sah-field-hint' }, t('settings.orderHint'), ' ',
              h('button', { type: 'button', className: 'sah-linkbtn', onClick: clearModelFilters }, t('settings.clear'))) : null,
            !modelRows.length ? h('div', { className: 'sah-role-empty', role: 'status' }, t('settings.noResults'), ' ',
              h('button', { type: 'button', className: 'sah-linkbtn', onClick: clearModelFilters }, t('settings.clear'))) : null,
            h('div', { className: 'sah-list', 'aria-label': t('settings.modelColumns') }, routeView === 'provider'
              ? [...new Set(modelRows.map(row => row.route.provider))].map(id => h('details', { key: id, className: 'sah-provider-group', open: true },
                h('summary', null, providerName(id), ` · ${modelRows.filter(row => row.route.provider === id).length}`),
                h('div', { className: 'sah-list' }, modelRows.filter(row => row.route.provider === id).map(renderModelRow))))
              : modelRows.map(renderModelRow))))),

        h('section', { className: 'sah-tab-panel', id: 'sah-page-general', role: 'tabpanel', 'aria-labelledby': 'sah-tab-general', hidden: activeTab !== 'general' },
        h(Panel, { icon: glyph('IconSlidersTwoOutlineRegular', null), title: t('general.title'), hint: t('general.hint') },
          h(SettingRow, {
            title: t('concurrency.limit'),
            hint: maxConcurrent === 0 ? t('concurrency.unlimitedHint') : t('concurrency.hint', { count: maxConcurrent }),
          }, h('div', { className: 'sah-concurrency' },
            h(Stepper, { value: maxConcurrent, disabled: locked, label: t('concurrency.limit'), t, onChange: next => setDraft(current => ({ ...current, maxConcurrent: next })) }),
            h('div', { className: 'sah-chips', role: 'group', 'aria-label': t('concurrency.quick') },
              quickLimits.map(limit => h('button', {
                key: String(limit),
                type: 'button',
                className: 'sah-chipbtn',
                'aria-pressed': maxConcurrent === limit,
                disabled: locked,
                onClick: () => setDraft(current => ({ ...current, maxConcurrent: limit })),
              }, limit === 0 ? t('concurrency.unlimited') : String(limit)))))),
          h(SettingRow, { title: t('overview.setting'), hint: t(overviewSupported || form?.state?.status !== 'ready' ? 'overview.settingHint' : 'overview.restartHint') },
            h(Toggle, {
              checked: draft.showAgentOverview,
              disabled: locked || !overviewSupported,
              label: t('overview.setting'),
              onChange: next => setDraft(current => ({ ...current, showAgentOverview: next })),
            })),
          h(SettingRow, { title: t('official.switch'), hint: t('official.hint') },
            h(Toggle, {
              checked: draft.manageOfficialSettings,
              disabled: locked,
              label: t('official.switch'),
              onChange: next => setDraft(current => ({ ...current, manageOfficialSettings: next })),
            }))),
        h('section', { className: 'sah-panel' },
          h('div', { className: 'sah-preview-head' },
            h('button', {
              type: 'button',
              className: 'sah-disclosure',
              'aria-expanded': previewOpen,
              onClick: () => setPreviewOpen(!previewOpen),
            },
            h('span', { className: 'sah-title' }, glyph('IconBrowseOutlineRegular', null), t('preview.title')),
            h('span', { className: `sah-chevron${previewOpen ? ' sah-chevron-open' : ''}` }, glyph('IconChevronDownOutlineRegular', '▾'))),
            h('button', {
              type: 'button',
              className: 'sah-btn sah-btn-outline sah-btn-sm',
              disabled: preview === '',
              onClick: copyPreview,
            }, copied ? t('preview.copied') : t('preview.copy'))),
          previewOpen ? h('div', { className: 'sah-panel-body' },
            preview === ''
              ? h('p', { className: 'sah-notice' }, t('preview.empty'))
              : h('pre', { className: 'sah-preview' }, preview)) : null),
        copyError ? h('p', { className: 'sah-notice sah-notice-error', role: 'status' }, t('preview.copyFailed')) : null)),
        h('p', { className: 'sah-settings-sr', role: 'status', 'aria-live': 'polite' }, orderNotice),
        h('div', { className: 'sah-footer' },
          h('div', { className: 'sah-footer-left', role: 'status' }, footerText),
          undo === undefined ? null : h('span', { className: 'sah-undo' },
            h('span', null, t('undo.deleted', { name: undoName })),
            h('button', { type: 'button', className: 'sah-linkbtn', onClick: undoLast }, t('undo.action'))),
          !dirty && status?.retry === true ? h('button', { type: 'button', className: 'sah-linkbtn', onClick: () => watchOfficialSync(lastSyncValues.current) }, t('syncRetry')) : null,
          h('span', { className: 'sah-footer-keys' }, t('footer.shortcut')),
          h('button', { type: 'button', className: 'sah-btn sah-btn-outline', disabled: !dirty || busy, onClick: discard }, t('discard')),
          h('button', {
            type: 'button',
            className: 'sah-btn sah-btn-primary',
            disabled: !writable || !dirty || busy,
            onClick: save,
          }, busy ? t('saving') : t('save'))))
    }

    // ── read-only subagent request model ───────────────────────────────────────────────────────

    const EMPTY_SESSION = Object.freeze({ subagent: null })
    const MODEL_BADGE_SLOT = 'conversation.session.header.utilities'
    const MODEL_BADGE_CSS = `
.sah-runtime-model{position:relative;min-width:0;max-width:260px;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:16px;-webkit-app-region:no-drag}
.sah-runtime-model summary{display:inline-flex;box-sizing:border-box;align-items:center;gap:5px;min-height:28px;max-width:min(260px,42vw);padding:3px 7px;list-style:none;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;user-select:none;transition:color .12s ease-out}
.sah-runtime-model summary:hover,.sah-runtime-model summary:focus-visible,.sah-runtime-model[open] summary{color:var(--dsw-alias-label-primary,#e6e6e6)}
.sah-runtime-model-icon{display:inline-flex;flex:none}
@container (width<=480px){.sah-runtime-model-value{display:none}}
.sah-runtime-model summary::-webkit-details-marker{display:none}
.sah-runtime-model summary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#5686fe);outline-offset:2px}
.sah-runtime-model-arrow{flex:none;display:inline-flex;color:var(--dsw-alias-label-caption,#888)}
.sah-runtime-model-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sah-runtime-model-panel{position:fixed;top:64px;right:12px;z-index:1000;box-sizing:border-box;width:320px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;padding:12px 14px;border:0;border-radius:12px;background:transparent;isolation:isolate;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1,#36373b);box-shadow:var(--dsw-elevation-prominent,0 0 0 1px #36373b,0 8px 24px rgba(0,0,0,.24));color:var(--dsw-alias-label-primary,#e6e6e6);font-size:13px;line-height:20px;user-select:text}
.sah-runtime-model-panel::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,#232529));backdrop-filter:var(--dsw-menu-backdrop-filter,none)}
.sah-runtime-model-panel strong{font-weight:500}
.sah-runtime-model-panel p{margin:0 0 8px;overflow-wrap:anywhere}
.sah-runtime-model-panel dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 12px;margin:0}
.sah-runtime-model-panel dt{color:var(--dsw-alias-label-secondary,#b8b8b8)}
.sah-runtime-model-panel dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px}
.sah-runtime-model-note{margin-top:10px!important;color:var(--dsw-alias-label-tertiary,#999);font-size:12px}
.sah-runtime-model-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
@media(forced-colors:active){.sah-runtime-model summary:focus-visible{outline-color:Highlight}}
`

    /** The projection is the public wire value, not a Settings form or a model catalog entry. */
    function modelBadgeData(session, projection) {
      if (!session?.subagent) return { kind: 'hidden' }
      const route = value => {
        if (typeof value?.provider !== 'string' || !value.provider.trim()
          || typeof value?.model !== 'string' || !value.model.trim()) return undefined
        return { provider: value.provider, model: value.model,
          ...(typeof value.reasoningEffort === 'string' && value.reasoningEffort ? { reasoningEffort: value.reasoningEffort } : {}) }
      }
      const last = route(projection?.lastUsed)
      const next = route(projection?.next)
      if (last !== undefined) return { kind: 'recorded', last,
        ...(next !== undefined && JSON.stringify(last) !== JSON.stringify(next) ? { next } : {}) }
      if (projection?.lastUsed === null && (projection.next === null || next !== undefined)) {
        return { kind: 'waiting', ...(next === undefined ? {} : { next }) }
      }
      return { kind: 'unknown' }
    }

    /** Resolve the retained session only; never start, retain, or change a session to show its model. */
    function modelBadgeShares(sessions, sessionId) {
      const session = sessions.binding(sessionId)?.session
      return { session, projection: session?.projections.faceOf('modelSelection') }
    }

    function useSnapshot(face, fallback) {
      const subscribe = React.useCallback(listener => face?.subscribe(listener) ?? (() => {}), [face])
      const read = React.useCallback(() => face?.getSnapshot() ?? fallback, [face, fallback])
      return React.useSyncExternalStore(subscribe, read, read)
    }

    function ModelBadge({ session, projection, names, remote, t }) {
      const sessionState = useSnapshot(session, EMPTY_SESSION)
      const modelState = useSnapshot(projection, undefined)
      const catalog = useSnapshot(names, NO_CATALOG)
      const data = modelBadgeData(sessionState, modelState)
      const detailsRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const panelId = React.useId()
      const [open, setOpen] = React.useState(false)
      const [announcement, setAnnouncement] = React.useState('')
      React.useEffect(() => {
        if (detailsRef.current) detailsRef.current.open = false
        setOpen(false)
      }, [session])
      const label = data.kind === 'recorded' ? routeLabel(catalog.groups, data.last) : undefined
      const fullLabel = data.kind === 'recorded'
        ? t(label.named ? 'modelBadge.summaryModel' : 'modelBadge.summary',
          label.named ? { model: label.value } : { provider: data.last.provider, model: modelIdTail(data.last.model) })
        : t(data.kind === 'waiting' ? 'modelBadge.waiting' : 'modelBadge.unknown')
      // The name only decorates a recorded route, so the catalog is read once one exists.
      React.useEffect(() => {
        // A caller may share a plain face without a loader; names then stay advisory.
        if (data.kind === 'recorded') loadModelNames(names, remote)
      }, [names, remote, data.kind])
      React.useEffect(() => {
        setAnnouncement(data.kind === 'hidden' ? '' : fullLabel)
      }, [data.kind, fullLabel])
      React.useEffect(() => {
        if (!open) return
        const details = detailsRef.current
        const panel = panelRef.current
        if (!details || !panel) return
        const doc = details.ownerDocument
        const win = doc.defaultView
        const position = () => {
          const rect = details.querySelector('summary').getBoundingClientRect()
          // CSS zoom scales fixed descendants too. Measure that scale and coordinate origin
          // instead of mixing viewport pixels with the ancestor's CSS coordinates.
          panel.style.left = '0px'
          panel.style.top = '0px'
          panel.style.right = 'auto'
          const origin = panel.getBoundingClientRect()
          const scaleX = origin.width / panel.offsetWidth || 1
          const scaleY = origin.height / panel.offsetHeight || 1
          panel.style.width = `${Math.min(320, (win.innerWidth - 24) / scaleX)}px`
          panel.style.maxHeight = `${(win.innerHeight - 24) / scaleY}px`
          const box = panel.getBoundingClientRect()
          const left = Math.max(12, Math.min(rect.right - box.width, win.innerWidth - box.width - 12))
          const top = Math.max(12, Math.min(rect.bottom + 8, win.innerHeight - box.height - 12))
          panel.style.left = `${(left - origin.left) / scaleX}px`
          panel.style.top = `${(top - origin.top) / scaleY}px`
        }
        const outside = event => { if (!details.contains(event.target)) details.open = false }
        position()
        win.addEventListener('resize', position)
        win.addEventListener('scroll', position, true)
        doc.addEventListener('pointerdown', outside, true)
        return () => {
          win.removeEventListener('resize', position)
          win.removeEventListener('scroll', position, true)
          doc.removeEventListener('pointerdown', outside, true)
        }
      }, [open, fullLabel, data.last?.reasoningEffort, data.next?.provider, data.next?.model, data.next?.reasoningEffort])
      if (data.kind === 'hidden') return null
      const rows = route => h('dl', null,
        h('dt', null, t('modelBadge.provider')), h('dd', null, route.provider),
        h('dt', null, t('modelBadge.model')), h('dd', null, route.model),
        route.reasoningEffort === undefined ? null : h(React.Fragment, null,
          h('dt', null, t('modelBadge.effort')), h('dd', null, route.reasoningEffort)))
      return h(React.Fragment, null,
        h('style', null, MODEL_BADGE_CSS),
        h('details', { className: 'sah-runtime-model', ref: detailsRef,
          onToggle: event => setOpen(event.currentTarget.open),
          onKeyDown: event => {
            if (event.key === 'Escape' && detailsRef.current?.open) {
              event.preventDefault()
              event.stopPropagation()
              detailsRef.current.open = false
              detailsRef.current.querySelector('summary')?.focus()
            }
          },
        },
        h('summary', { 'aria-label': fullLabel, 'aria-controls': panelId, title: fullLabel },
          h('span', { className: 'sah-runtime-model-icon', 'aria-hidden': true },
            h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
              h('rect', { x: 6, y: 6, width: 12, height: 12, rx: 2.5 }), h('rect', { x: 9.5, y: 9.5, width: 5, height: 5, rx: 1 }),
              h('path', { d: 'M9.5 2.5v3.5M14.5 2.5v3.5M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5' }))),
          h('span', { className: 'sah-runtime-model-label sah-runtime-model-sr' }, t('modelBadge.label')),
          h('span', { className: 'sah-runtime-model-value' }, data.kind === 'recorded'
            ? label.value
            : t(data.kind === 'waiting' ? 'modelBadge.waitingShort' : 'modelBadge.unknownShort')),
          h('span', { className: 'sah-runtime-model-arrow', 'aria-hidden': true },
            h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
              h('path', { d: 'm7 10 5 5 5-5' })))),
        h('div', { className: 'sah-runtime-model-panel', ref: panelRef, id: panelId, role: 'group', 'aria-label': t('modelBadge.details') },
          h('p', null, h('strong', null, t(data.kind === 'recorded' ? 'modelBadge.recorded' : data.kind === 'waiting' ? 'modelBadge.waiting' : 'modelBadge.unknown'))),
          data.kind === 'recorded' ? rows(data.last) : null,
          data.next === undefined ? null : h(React.Fragment, null,
            h('p', { className: 'sah-runtime-model-note' }, t('modelBadge.next')), rows(data.next)),
          h('p', { className: 'sah-runtime-model-note' }, t(data.kind === 'unknown' ? 'modelBadge.unavailableNote' : 'modelBadge.note')))),
        h('span', { role: 'status', className: 'sah-runtime-model-sr' }, announcement))
    }

    function registerModelBadge(ctx, t, names = createModelNames()) {
      ctx.inject(['sessions'], scope => scope.slots.inject(MODEL_BADGE_SLOT, () => scope.slots.register({
        name: MODEL_BADGE_SLOT,
        id: 'subagent-hub-model',
        order: -10,
        locale: NS,
        inject: sessionId => modelBadgeShares(scope.sessions, sessionId),
      }, props => h(ModelBadge, { ...props, t: props.t ?? t, names, remote: ctx.remote }))))
    }

    // ── native child / Team overview ──────────────────────────────────────────
    // An official sidebar page: each card answers "what was it asked, what is it doing now,
    // what did it last say". The Hub's own `subagentHubActivity` projection supplies the
    // activity digest; native projections supply identity, model, timing and usage.
    const OVERVIEW_SLOT = 'conversation.session.header.actions'
    const OVERVIEW_KIND = 'subagent-hub-overview'
    const OVERVIEW_BODY_SLOT = 'sidebar.right.pane.tab'
    const EMPTY_VISIBILITY = new Set()
    const ACTIVITY_PROJECTION = 'subagentHubActivity'
    const LIVE_REFRESH_MS = 3000
    /** A failure or interruption older than this is history, not something to act on. */
    const ATTENTION_WINDOW_MS = 60 * 60 * 1000
    /** Running with no tool call and no recorded event for this long looks stuck. */
    const STALL_MS = 5 * 60 * 1000
    /** One tool call open for this long is worth a look (tests and CI waits are legitimately slow). */
    const LONG_CALL_MS = 15 * 60 * 1000
    /** While the panel is closed, running agents are re-read at this slower pace for the trigger. */
    const BACKGROUND_REFRESH_MS = 15_000
    const SEEN_KEY = 'subagent-hub:overview-seen:'
    Object.assign(en, {
      'overview.setting': 'Show agent overview',
      'overview.sidebarHint': 'View child agents, their activity and token usage in the sidebar.',
      'overview.disabled': 'Enable Show agent overview in Settings → Subagent Hub to view this page.',
      'overview.settingHint': 'Off by default. Adds a header entry that opens the overview in the official right sidebar; the native Agent Team UI is always available.',
      'overview.triggerHint': 'Agent overview · {running} running / {total} total',
      'overview.triggerAttention': '{count} need attention',
      'overview.triggerRunning': '{count} running',
      'overview.title': 'Agents', 'overview.close': 'Close', 'overview.refresh': 'Refresh',
      'overview.refreshing': 'Refreshing…', 'overview.search': 'Search name, task, model or session ID',
      'overview.all': 'All', 'overview.team': 'Team', 'overview.independent': 'Independent',
      'overview.running': 'Running', 'overview.inactive': 'Idle', 'overview.completed': 'Done',
      'overview.interrupted': 'Interrupted', 'overview.provisioning': 'Starting', 'overview.failed': 'Failed',
      'overview.unknown': 'Unconfirmed', 'overview.members': 'Agents', 'overview.tasks': 'Task board',
      'overview.diagnostics': 'Diagnostics', 'overview.empty': 'No child agents in this session yet. Delegated agents appear here with their task and live progress.',
      'overview.noMatches': 'No matching agents.',
      'overview.loading': 'Loading the child catalog…', 'overview.unavailable': 'The child catalog is unavailable.',
      'overview.migration': 'Open this conversation in DSH to migrate its history.',
      'overview.stale': 'Some data could not be refreshed. Displayed records may be outdated.',
      'overview.open': 'Open', 'overview.noNavigation': 'This child mode cannot be opened here.',
      'overview.details': 'Steps and details', 'overview.model': 'Model', 'overview.next': 'Planned next request',
      'overview.noRequest': 'No request yet', 'overview.noModel': 'Model unconfirmed',
      'overview.duration': 'Active time', 'overview.tokens': 'Tokens', 'overview.created': 'Created',
      'overview.kind': 'Type', 'overview.state': 'State', 'overview.sort': 'Sort',
      'overview.priority': 'Activity first', 'overview.newest': 'Newest first', 'overview.name': 'Name',
      'overview.timeSort': 'Active time', 'overview.tokenSort': 'Tokens',
      'overview.inactiveNote': 'An idle Team member has no turn executing; only the task board records task completion.',
      'overview.tokenNote': 'Token totals cover {known} of {total} agents; missing records are not zero. No price estimate.',
      'overview.durationNote': 'Active time sums agent turns, excluding time between turns. Interrupted open turns stop at the last recorded event.',
      'overview.owner': 'Owner', 'overview.unowned': 'Unassigned', 'overview.dependencies': 'Dependencies',
      'overview.scopes': 'Write scopes', 'overview.pending': 'Pending', 'overview.in_progress': 'In progress',
      'overview.ready': 'Ready', 'overview.blocked': 'Blocked', 'overview.noTasks': 'No shared tasks recorded.',
      'overview.noTeam': 'Team projection unavailable; Team may be disabled.',
      'overview.boardStatus': 'Task status', 'overview.boardOwner': 'Task owner',
      'overview.boardShown': 'Showing {shown} of {total} tasks', 'overview.boardNoMatches': 'No tasks match these filters.',
      'overview.boardPending': 'All pending', 'overview.boardDetails': 'Write scopes',
      'overview.boardWaiting': 'Waiting for dependencies', 'overview.boardPrerequisites': 'Prerequisites',
      'overview.boardReadinessUnknown': 'Not ready yet. Refresh to check dependency status.',
      'overview.boardDependency': 'Go to {id}: {subject}', 'overview.boardMissing': '{id} · unavailable',
      'overview.boardOpenOwner': 'Open {name}’s conversation', 'overview.boardOpenError': 'Could not open this member. Refresh and try again.',
      'overview.boardNoOwnerNavigation': 'The owner is not available in the current Team roster.',
      'overview.boardScopeOverlap': 'Write scopes overlap with {id}', 'overview.boardSharedScope': 'Shared write scope: {scope}',
      'overview.boardReadOnly': 'Task changes are managed by the native Team runtime.',
      'overview.healthy': 'No projection errors reported.',
      'overview.coverage': 'Hub guard rejections reconstructed from committed tool results. This is not a log of every tool failure.',
      'overview.rejections': 'Dispatch rejections', 'overview.noRejections': 'No Hub guard rejections recorded.',
      'overview.noHistory': 'Rejection projection unavailable. Inspect tool results in the parent conversation.',
      'overview.historyCount': 'Showing the latest {shown} of {total} recorded rejections.',
      'overview.reset': 'Clear filters', 'overview.current': 'Current', 'overview.lead': 'Lead',
      'overview.attention': 'Needs attention', 'overview.settled': 'Idle / finished',
      'overview.summary': '{running} running · {attention} need attention · {total} total',
      'overview.summaryQuiet': '{total} agents · none running',
      'overview.task': 'Task', 'overview.doing': 'Now', 'overview.thinking': 'Thinking…',
      'overview.approval': 'Waiting for approval: {tool}', 'overview.plan': 'Plan',
      'overview.planCurrent': 'now: {item}', 'overview.report': 'Report', 'overview.output': 'Latest output',
      'overview.inbox': 'Latest message', 'overview.steps': 'Recent steps', 'overview.noSteps': 'No tool calls yet.',
      'overview.counts': '{tools} tool calls · {errors} failed', 'overview.toolCount': '{tools} tool calls', 'overview.errorCount': '{errors} failed', 'overview.retries': '{count} LLM retries',
      'overview.ago': '{time} ago', 'overview.endedBy': 'Last turn ended: {kind}',
      'overview.noActivity': 'No activity digest yet. It appears after the next refresh once the Hub plugin is loaded.',
      'overview.monitorNote': 'Live while open: running agents refresh every few seconds.',
      'overview.effort': 'effort', 'overview.effortDefault': ' (model default)',
      'overview.fresh': 'New', 'overview.triggerFresh': '{count} with new results',
      'overview.stallQuiet': 'No activity for {time}; it may be stuck or thinking at length',
      'overview.stallCall': '{tool} has been running for {time}',
      'overview.usage': 'Usage', 'overview.usageTitle': 'Child agent tokens',
      'overview.usageAgents': '{count} agents', 'overview.usageRequests': '{count} requests',
      'overview.usageSplit': 'in {input} · out {output} · cache hit {rate}',
      'overview.usageApprox': 'Partly estimated from session totals', 'overview.usageUnrouted': 'Not a Hub route',
      'overview.usageMissing': '{count} agents have no recorded usage yet and are not counted.',
      'overview.usageNote': 'Child agents only; the main agent\'s own usage is not included. No price estimate.',
      'overview.usageEmpty': 'No recorded usage yet.',
      'overview.usageCache': 'Prompt cache hits', 'overview.usageIo': 'in {input} · out {output}',
      'overview.usageMap': 'Token use by agent, colored by route', 'overview.usageRest': '{count} more',
      'overview.usageList': 'By agent', 'overview.usageHover': 'Hover a tile or row to see which agent it is.',
      'overview.usageAll': 'Show all {count}', 'overview.usageLess': 'Show top 10',
      'overview.usageState.running': 'Running', 'overview.usageState.failed': 'Failed or interrupted', 'overview.usageState.done': 'Finished',
      'overview.usageState.idle': 'Idle', 'overview.usageState.unknown': 'Unknown status',
      'overview.usageFilterHint': 'Click a status or model to hide or show it. Percentages use total usage.',
      'overview.usageHide': 'Hide {name}', 'overview.usageShow': 'Show {name}', 'overview.usageShowAll': 'Show all',
      'overview.usageFiltered': 'Showing {shown} of {total} agents · {tokens} tokens · {share} of total',
      'overview.usageNoMatches': 'No agents match these filters. Show a status or model below, or show all.',
      'overview.usageNoneYet': 'no usage yet', 'overview.usageFailedChip': 'failed',
      'overview.usageEstimated': '{count} agents (≈) are estimated from session totals under their last route; a restart refolds them per request.',
    })
    Object.assign(zh, {
      'overview.setting': '显示子智能体总览',
      'overview.sidebarHint': '在侧边栏查看子智能体、执行进展与 Token 用量。',
      'overview.disabled': '在设置 → 子代理中枢中开启“显示子智能体总览”后查看。',
      'overview.settingHint': '默认关闭。保存后可从会话标题栏在官方右侧栏打开总览；官方的智能体团队界面始终可用。',
      'overview.triggerHint': '子智能体总览 · {running} 个运行中 / 共 {total} 个',
      'overview.triggerAttention': '{count} 个需处理',
      'overview.triggerRunning': '{count} 个运行中',
      'overview.title': '子智能体', 'overview.close': '关闭', 'overview.refresh': '刷新',
      'overview.refreshing': '刷新中…', 'overview.search': '搜索名称、任务、模型或会话 ID',
      'overview.all': '全部', 'overview.team': 'Team 成员', 'overview.independent': '独立子任务',
      'overview.running': '运行中', 'overview.inactive': '空闲', 'overview.completed': '已完成',
      'overview.interrupted': '已中断', 'overview.provisioning': '创建中', 'overview.failed': '创建失败',
      'overview.unknown': '未确认', 'overview.members': '成员', 'overview.tasks': '共享任务板',
      'overview.diagnostics': '诊断', 'overview.empty': '这个会话还没有子智能体。派发后，这里会显示每个子智能体的任务和实时进展。',
      'overview.noMatches': '没有匹配的子智能体。',
      'overview.loading': '正在加载子任务目录…', 'overview.unavailable': '暂时无法获取子任务目录。',
      'overview.migration': '请在 DSH 中打开此会话以迁移历史记录。',
      'overview.stale': '部分数据刷新失败，当前显示的记录可能不是最新状态。',
      'overview.open': '打开', 'overview.noNavigation': '此类子任务暂不支持从这里打开。',
      'overview.details': '步骤与详情', 'overview.model': '模型', 'overview.next': '下次请求计划',
      'overview.noRequest': '尚无请求', 'overview.noModel': '模型未确认',
      'overview.duration': '累计执行', 'overview.tokens': 'Token', 'overview.created': '创建时间',
      'overview.kind': '类型', 'overview.state': '状态', 'overview.sort': '排序',
      'overview.priority': '活动优先', 'overview.newest': '最新创建', 'overview.name': '名称',
      'overview.timeSort': '执行耗时', 'overview.tokenSort': 'Token 用量',
      'overview.inactiveNote': 'Team 成员空闲表示当前没有回合在执行，任务是否完成以共享任务板为准。',
      'overview.tokenNote': 'Token 汇总覆盖 {known}/{total} 个子智能体；缺失记录不当作零，不估算费用。',
      'overview.durationNote': '累计执行时间只计各执行回合，不含回合间空闲；中断回合固定到最后一条事件的时间。',
      'overview.owner': '负责人', 'overview.unowned': '未分配', 'overview.dependencies': '依赖任务',
      'overview.scopes': '写入范围', 'overview.pending': '待处理', 'overview.in_progress': '进行中',
      'overview.ready': '可开始', 'overview.blocked': '依赖阻塞', 'overview.noTasks': '尚无共享任务记录。',
      'overview.noTeam': 'Team 投影不可用，可能未启用 Team。',
      'overview.boardStatus': '任务状态', 'overview.boardOwner': '任务负责人',
      'overview.boardShown': '显示 {shown}/{total} 项任务', 'overview.boardNoMatches': '没有符合筛选条件的任务。',
      'overview.boardPending': '全部待处理', 'overview.boardDetails': '写入范围',
      'overview.boardWaiting': '等待依赖完成', 'overview.boardPrerequisites': '前置任务',
      'overview.boardReadinessUnknown': '尚未就绪，请刷新以核对依赖状态。',
      'overview.boardDependency': '定位 {id}：{subject}', 'overview.boardMissing': '{id} · 记录不可用',
      'overview.boardOpenOwner': '打开 {name} 的会话', 'overview.boardOpenError': '暂时无法打开该成员，请刷新后重试。',
      'overview.boardNoOwnerNavigation': '当前 Team 名单中没有可打开的负责人会话。',
      'overview.boardScopeOverlap': '与 {id} 的写入范围重叠', 'overview.boardSharedScope': '共享写入范围：{scope}',
      'overview.boardReadOnly': '任务变更由原生 Team 管理。',
      'overview.healthy': '未报告投影错误。',
      'overview.coverage': '从持久化工具结果重建的 Hub 守卫拒绝记录，不包含其他工具错误。',
      'overview.rejections': '派发拒绝', 'overview.noRejections': '尚无 Hub 守卫拒绝记录。',
      'overview.noHistory': '拒绝记录投影不可用，可在父会话工具结果中查看。',
      'overview.historyCount': '显示最近 {shown} 条，共记录 {total} 次拒绝。',
      'overview.reset': '清除筛选', 'overview.current': '当前会话', 'overview.lead': 'Lead',
      'overview.attention': '需处理', 'overview.settled': '空闲 / 已结束',
      'overview.summary': '{running} 个运行中 · {attention} 个需处理 · 共 {total} 个',
      'overview.summaryQuiet': '共 {total} 个 · 没有正在运行的',
      'overview.task': '任务', 'overview.doing': '正在', 'overview.thinking': '思考中…',
      'overview.approval': '等待审批：{tool}', 'overview.plan': '计划',
      'overview.planCurrent': '当前：{item}', 'overview.report': '汇报', 'overview.output': '最新输出',
      'overview.inbox': '最新消息', 'overview.steps': '最近步骤', 'overview.noSteps': '还没有工具调用。',
      'overview.counts': '{tools} 次工具调用 · {errors} 次失败', 'overview.toolCount': '{tools} 次工具调用', 'overview.errorCount': '{errors} 次失败', 'overview.retries': '{count} 次模型重试',
      'overview.ago': '{time}前', 'overview.endedBy': '上一回合结束方式：{kind}',
      'overview.noActivity': '暂无活动摘要。Hub 插件加载后，下次刷新即可看到。',
      'overview.monitorNote': '面板打开期间实时更新：运行中的子智能体每隔几秒刷新一次。',
      'overview.effort': '推理', 'overview.effortDefault': '（模型默认）',
      'overview.fresh': '新', 'overview.triggerFresh': '{count} 个有新结果',
      'overview.stallQuiet': '已 {time} 没有新动作，可能卡住，也可能在长时间思考',
      'overview.stallCall': '{tool} 已运行 {time}',
      'overview.usage': '用量', 'overview.usageTitle': '子智能体 Token 用量',
      'overview.usageAgents': '{count} 个子智能体', 'overview.usageRequests': '{count} 次请求',
      'overview.usageSplit': '输入 {input} · 输出 {output} · 缓存命中 {rate}',
      'overview.usageApprox': '部分按会话总量估算', 'overview.usageUnrouted': '非 Hub 路线',
      'overview.usageMissing': '{count} 个子智能体还没有用量记录，未计入。',
      'overview.usageNote': '只统计子智能体，不含主智能体自身用量；不估算费用。',
      'overview.usageEmpty': '还没有用量记录。',
      'overview.usageCache': '提示词缓存命中', 'overview.usageIo': '输入 {input} · 输出 {output}',
      'overview.usageMap': '各子智能体 Token 用量，按路线着色', 'overview.usageRest': '另外 {count} 个',
      'overview.usageList': '按子智能体', 'overview.usageHover': '悬停格子或列表行，查看对应的子智能体。',
      'overview.usageAll': '显示全部 {count} 个', 'overview.usageLess': '只看前 10 个',
      'overview.usageState.running': '运行中', 'overview.usageState.failed': '失败或中断', 'overview.usageState.done': '已结束',
      'overview.usageState.idle': '空闲', 'overview.usageState.unknown': '状态未知',
      'overview.usageFilterHint': '点击状态或模型标签隐藏或恢复，百分比按总用量计算。',
      'overview.usageHide': '隐藏“{name}”', 'overview.usageShow': '显示“{name}”', 'overview.usageShowAll': '全部显示',
      'overview.usageFiltered': '显示 {shown}/{total} 个子智能体 · {tokens} token · 占总量 {share}',
      'overview.usageNoMatches': '当前筛选下没有子智能体。可点击下方标签恢复，或全部显示。',
      'overview.usageNoneYet': '暂无用量', 'overview.usageFailedChip': '中断',
      'overview.usageEstimated': '{count} 个子智能体（≈）按会话总量估算，计入其最后使用的路线；重启 Harness 后会按每次请求重新统计。',
    })

    Object.assign(en, {
      'overview.analysis': 'Usage analysis', 'overview.analysisTitle': 'Roles and usage',
      'overview.analysisScope': '{count} agents · {depth} levels · discovered from this tree',
      'overview.role': 'Hub role', 'overview.roleUnknown': 'Role unconfirmed', 'overview.roleNone': 'No Hub role',
      'overview.roleChart': 'Token usage by Hub role', 'overview.roleEvidence': 'Roles come from recorded presets. Usage comes from request records; missing records stay unknown.',
      'overview.inputBucket': 'Uncached input', 'overview.cacheBucket': 'Cache read / write', 'overview.outputBucket': 'Output',
      'overview.roleMembers': 'Agents: {count}', 'overview.retryCount': 'Retries', 'overview.partialCount': 'Usage records {known}/{total}', 'overview.retryCoverage': 'Retry records {known}/{total}',
      'overview.analysisModels': 'Actual model routes', 'overview.routeRequests': 'Settled requests',
      'overview.comparisons': 'Configuration comparison', 'overview.comparisonNote': 'Recent requests compared with current configuration. Explicit overrides or later configuration changes can explain differences; these are not execution failures.',
      'overview.compareEffort': 'Route default {expected} → recorded {actual}',
      'overview.compareRoute': 'Recorded route is outside the current Hub catalog: {actual}',
      'overview.compareRoleRoute': 'Recorded route {actual}; current role allows {expected}',
      'overview.needAttention': '{count} agents need attention', 'overview.reviewAgent': 'Open agent',
      'overview.path': 'Member path', 'overview.preset': 'Recorded preset', 'overview.treeLimit': 'Showing at most 512 agents and 32 levels. Open a nested conversation to inspect a larger tree.',
      'overview.routeUnknown': 'Route unconfirmed', 'overview.usageBreakdown': 'Agent distribution',
      'overview.roleNoUsage': 'Usage not reported', 'overview.noComparisons': 'No differences found in the available records.',
      'overview.navigationError': 'Unable to open this agent. Try again from its parent conversation.',
      'overview.usageIncomplete': '{count} agents have route records below their Session totals. Only recorded route usage is included.',
    })
    Object.assign(zh, {
      'overview.analysis': '用量分析', 'overview.analysisTitle': '角色与用量',
      'overview.analysisScope': '{count} 个成员 · {depth} 层 · 来自当前成员树',
      'overview.role': 'Hub 角色', 'overview.roleUnknown': '角色未确认', 'overview.roleNone': '未使用 Hub 角色',
      'overview.roleChart': '按角色的 Token 用量', 'overview.roleEvidence': '角色以已记录预设为准，用量来自请求记录；缺失的记录保持未知。',
      'overview.inputBucket': '未缓存输入', 'overview.cacheBucket': '缓存读取 / 写入', 'overview.outputBucket': '输出',
      'overview.roleMembers': '{count} 个成员', 'overview.retryCount': '重试', 'overview.partialCount': '用量记录 {known}/{total}', 'overview.retryCoverage': '重试记录 {known}/{total}',
      'overview.analysisModels': '实际请求路线', 'overview.routeRequests': '已结算请求',
      'overview.comparisons': '配置对照', 'overview.comparisonNote': '将最近请求与当前配置对照。显式覆盖或后续配置更新均可能造成差异，不代表执行失败。',
      'overview.compareEffort': '路线默认 {expected} → 记录值 {actual}',
      'overview.compareRoute': '记录的路线不在当前 Hub 目录中：{actual}',
      'overview.compareRoleRoute': '记录的路线为 {actual}；当前角色允许 {expected}',
      'overview.needAttention': '{count} 个成员需要处理', 'overview.reviewAgent': '打开成员会话',
      'overview.path': '成员路径', 'overview.preset': '已记录预设', 'overview.treeLimit': '最多展示 512 个成员和 32 层。更大的树可打开下级会话继续查看。',
      'overview.routeUnknown': '路线未确认', 'overview.usageBreakdown': '成员分布',
      'overview.roleNoUsage': '尚未上报用量', 'overview.noComparisons': '可用记录中未发现差异。',
      'overview.navigationError': '无法打开成员会话，请从其父会话重试。',
      'overview.usageIncomplete': '{count} 个成员的分路线记录少于会话总量；这里只计入已记录的路线用量。',
    })
    const OVERVIEW_CSS = `
.sah-overview-trigger{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;font-weight:400;min-height:28px;padding:3px 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#999);cursor:pointer;white-space:nowrap;-webkit-app-region:no-drag;transition:background-color .12s ease-out,color .12s ease-out}
.sah-overview-trigger:hover,.sah-overview-trigger:focus-visible,.sah-overview-trigger[aria-expanded=true]{color:var(--dsw-alias-label-primary,#eee);background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.sah-overview-trigger-icon{display:inline-flex;align-items:center;flex:none}
.sah-overview-trigger-count{color:var(--dsw-alias-label-caption,#888);font-variant-numeric:tabular-nums;font-size:12px;line-height:16px}
.sah-overview-trigger[data-live=true] .sah-overview-trigger-count{color:var(--dsw-alias-state-business-primary,#9bb8ff)}
.sah-overview-trigger[data-attention=true] .sah-overview-trigger-count{color:var(--dsw-alias-state-warning-primary,#f5c26b)}
@container (width<=480px){.sah-overview-trigger-label{display:none}}
.sah-overview-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-caption,#6e6e78)}
.sah-overview-dot[data-state=running],.sah-overview-dot[data-state=provisioning]{background:var(--dsw-alias-state-business-primary,#9bb8ff);animation:sah-overview-pulse 1.6s ease-in-out infinite}
.sah-overview-dot[data-state=completed]{background:var(--dsw-alias-state-success-primary,#7fd1a0)}
.sah-overview-dot[data-state=failed],.sah-overview-dot[data-state=interrupted]{background:var(--dsw-alias-state-error-primary,#ff8a80)}
.sah-overview-dot[data-attention=true]{background:var(--dsw-alias-state-warning-primary,#f5c26b)}
@keyframes sah-overview-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.sah-overview{display:flex;flex-direction:column;box-sizing:border-box;width:100%;height:100%;min-width:0;min-height:0;padding:0;color:var(--dsw-alias-label-primary,#eee);font-size:13px;line-height:20px;overflow:hidden}
.sah-overview *{box-sizing:border-box}.sah-overview h2{font-size:14px;font-weight:600;margin:0}.sah-overview h3{font-size:13px;font-weight:500;margin:0}.sah-overview p{margin:0;overflow-wrap:anywhere}
.sah-overview-head{flex:none;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:2px 4px;padding:12px 10px 10px 16px;border-bottom:.5px solid var(--dsw-alias-border-l2,#ffffff1f)}
.sah-overview-head-actions{display:flex;gap:2px}
.sah-overview-summary{min-width:0;font-size:12px;color:var(--dsw-alias-label-tertiary,#999);font-variant-numeric:tabular-nums}
.sah-overview-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:10px 10px 16px 16px;display:grid;align-content:start;gap:10px}
.sah-overview button,.sah-overview input{font:inherit;font-size:12px;color:inherit;border-radius:6px;min-height:28px}
.sah-overview button{display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:3px 8px;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#bbb);cursor:pointer;white-space:nowrap;transition:background-color .12s ease-out,color .12s ease-out,transform .1s ease-out}
.sah-overview button:not(:disabled):active{transform:scale(.96)}
.sah-overview button:disabled{opacity:.5;cursor:default}
.sah-overview input{width:100%;padding:4px 8px;border:0;background:var(--dsw-alias-bg-layer-2,#ffffff0d);--dsw-elevation-stroke-color:var(--dsw-alias-border-l2,#ffffff1f);box-shadow:var(--dsw-elevation-stroke,0 0 0 .5px #ffffff1f)}
.sah-overview input::placeholder{color:var(--dsw-alias-label-caption,#888)}
@media(hover:hover){.sah-overview button:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#eee)}}
.sah-overview :is(button,input,summary):focus-visible,.sah-overview-trigger:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#719cff);outline-offset:2px}
.sah-overview-tabs,.sah-overview-filters{display:flex;flex-wrap:wrap;align-items:center;gap:2px}
.sah-overview-tabs button[aria-pressed=true],.sah-overview-filters button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#eee);font-weight:500}
.sah-overview-filters button{min-height:24px;padding:2px 8px;font-size:12px}
.sah-overview-badge{margin-inline-start:2px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-caption,#888)}
.sah-overview-muted{color:var(--dsw-alias-label-tertiary,#999)}
.sah-overview-list{display:grid;gap:8px;list-style:none;margin:0;padding:0}
.sah-overview-card{min-width:0;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,#ffffff0a);--dsw-elevation-stroke-color:var(--dsw-alias-border-l2,#ffffff1f);box-shadow:var(--dsw-elevation-stroke,0 0 0 .5px #ffffff1f);overflow-wrap:anywhere;display:grid;gap:6px}
.sah-overview-card[data-attention=true]{box-shadow:inset 2px 0 0 var(--dsw-alias-state-warning-primary,#f5c26b),var(--dsw-elevation-stroke,0 0 0 .5px #ffffff1f)}
.sah-overview-card-head{display:flex;align-items:center;gap:8px;min-width:0}.sah-overview-card-head h3{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sah-overview-card-head button{margin-inline-end:-6px}
.sah-overview-state{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary,#999);font-variant-numeric:tabular-nums;white-space:nowrap}
.sah-overview-model{font-size:12px;color:var(--dsw-alias-label-tertiary,#999);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:-4px}
.sah-overview-fields{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;margin:0;font-size:12px;line-height:18px}
.sah-overview-fields dt{color:var(--dsw-alias-label-tertiary,#999);white-space:nowrap}
.sah-overview-fields dd{margin:0;min-width:0;color:var(--dsw-alias-label-secondary,#ccc)}
.sah-overview-clamp{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:var(--lines,2);overflow:hidden}
.sah-overview-now{display:flex;align-items:baseline;gap:6px;min-width:0}
.sah-overview-now code{font-size:11px;padding:0 5px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#eee);flex:none}
.sah-overview-now span:first-of-type{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sah-overview-now .sah-overview-elapsed{flex:none;margin-inline-start:auto;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-caption,#888)}
.sah-overview-warn{color:var(--dsw-alias-state-warning-primary,#f5c26b)}
.sah-overview-error{color:var(--dsw-alias-state-error-primary,#ffb0a8)}
.sah-overview-progress{display:flex;align-items:center;gap:8px;min-width:0}
.sah-overview-bar{flex:none;width:56px;height:4px;border-radius:2px;overflow:hidden;background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}.sah-overview-bar span{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-state-business-primary,#9bb8ff);transition:width .2s ease-out}
.sah-overview-progress span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sah-overview-meta{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption,#888);font-variant-numeric:tabular-nums}
.sah-overview details summary{cursor:pointer;min-height:24px;display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999);border-radius:6px;list-style:none}
.sah-overview details summary::-webkit-details-marker{display:none}
.sah-overview details summary::before{content:'›';display:inline-block;transition:transform .12s ease-out}
.sah-overview details[open] summary::before{transform:rotate(90deg)}
.sah-overview details summary:hover{color:var(--dsw-alias-label-primary,#eee)}
.sah-overview-trail{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:2px;font-size:12px}
.sah-overview-trail li{display:grid;grid-template-columns:14px auto minmax(0,1fr) auto;align-items:baseline;gap:6px}
.sah-overview-trail li span:nth-child(3){overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#999)}
.sah-overview-trail li span:last-child{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-caption,#888)}
.sah-overview-trail [data-ok=true]{color:var(--dsw-alias-state-success-primary,#7fd1a0)}.sah-overview-trail [data-ok=false]{color:var(--dsw-alias-state-error-primary,#ff8a80)}
.sah-overview dl.sah-overview-evidence{display:grid;grid-template-columns:minmax(80px,auto) minmax(0,1fr);gap:2px 12px;margin:8px 0 0;font-size:12px}.sah-overview-evidence dd{margin:0;overflow-wrap:anywhere}.sah-overview-evidence dt{color:var(--dsw-alias-label-tertiary,#999)}
.sah-overview code{font-size:12px;overflow-wrap:anywhere}
.sah-overview-notice{padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#ffffff0a);font-size:12px}
.sah-overview-section{display:grid;gap:6px}
.sah-overview-task-description{white-space:pre-wrap}

.sah-task-board{display:grid;gap:10px;min-width:0}
.sah-task-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.sah-task-filters label{display:grid;gap:4px;min-width:0;font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}
.sah-task-filters select{min-width:0;width:100%;min-height:30px;padding:4px 8px;border:.5px solid var(--dsw-alias-border-l2,#ffffff1f);border-radius:6px;background:var(--dsw-alias-bg-layer-2,#232529);color:var(--dsw-alias-label-primary,#eee);font:inherit;font-size:12px}
.sah-task-filters select:focus-visible,.sah-task-card:focus{outline:2px solid var(--dsw-alias-state-business-primary,#9bb8ff);outline-offset:2px}
.sah-task-summary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:28px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}
.sah-task-summary p{min-width:0}.sah-task-summary button{flex:none}
.sah-task-card{scroll-margin-block:12px;gap:8px}
.sah-task-card[data-located]{box-shadow:inset 2px 0 0 var(--dsw-alias-state-business-primary,#9bb8ff),var(--dsw-elevation-stroke,0 0 0 .5px #ffffff1f)}
.sah-task-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:8px}
.sah-task-title{display:flex;align-items:baseline;gap:8px;min-width:0}.sah-task-title .sah-overview-dot{align-self:center}
.sah-task-title h3{min-width:0;white-space:normal;overflow-wrap:anywhere}
.sah-task-status{font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary,#999)}
.sah-task-status[data-state=ready]{color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#7fd1a0) 45%,var(--dsw-alias-label-primary,#eee))}
.sah-task-status[data-state=blocked]{color:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#f5c26b) 45%,var(--dsw-alias-label-primary,#eee))}
.sah-task-owner{display:flex;align-items:center;gap:4px 6px;flex-wrap:wrap;min-width:0;font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}
.sah-task-owner .sah-task-owner-link{min-height:24px;padding:2px 6px;white-space:normal;overflow-wrap:anywhere;background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.sah-task-id{font-size:11px;font-variant-numeric:tabular-nums}
.sah-task-description{font-size:12px;line-height:18px;white-space:pre-wrap;color:var(--dsw-alias-label-secondary,#bbb)}
.sah-task-dependencies{display:flex;align-items:center;gap:4px 6px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}
.sah-task-dependencies .sah-task-dependency{justify-content:flex-start;min-height:24px;max-width:100%;padding:2px 6px;white-space:normal;overflow-wrap:anywhere;background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.sah-task-dependency[data-completed]{color:var(--dsw-alias-label-caption,#888)}
.sah-task-dependency[data-missing]{font-size:12px;color:var(--dsw-alias-state-warning-primary,#f5c26b)}
.sah-task-scopes{margin:4px 0 0;padding-inline-start:16px;font-size:12px;color:var(--dsw-alias-label-secondary,#bbb);overflow-wrap:anywhere}
.sah-task-warning{font-size:12px;line-height:18px;color:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#f5c26b) 45%,var(--dsw-alias-label-primary,#eee))}
.sah-task-board .sah-task-warning-link{display:inline;min-height:24px;padding:2px 4px;color:inherit;text-align:start;white-space:normal;overflow-wrap:anywhere;text-decoration:underline;text-underline-offset:3px}
.sah-overview-fresh{flex:none;font-size:11px;line-height:16px;padding:0 6px;border-radius:999px;color:var(--dsw-alias-state-business-primary,#9bb8ff);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#9bb8ff) 16%,transparent)}
.sah-overview-trigger-fresh{flex:none;min-width:16px;height:16px;padding:0 4px;border-radius:999px;font-size:11px;line-height:16px;text-align:center;font-variant-numeric:tabular-nums;color:#fff;background:var(--dsw-alias-state-business-primary,#5b8cff)}
.sah-usage{display:grid;gap:14px}
.sah-usage p{margin:0}
.sah-usage-hero{display:grid;grid-template-columns:minmax(0,1fr) 128px;gap:16px;align-items:start}
.sah-usage-label{font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}
.sah-usage-big{margin-top:2px!important;font-size:30px;line-height:36px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.sah-usage-big span{font-size:13px;font-weight:400;letter-spacing:0;color:var(--dsw-alias-label-tertiary,#999)}
.sah-usage-sub{font-size:12px;color:var(--dsw-alias-label-tertiary,#999);font-variant-numeric:tabular-nums}
.sah-usage-mid{margin:2px 0 6px!important;font-size:20px;line-height:28px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-state-success-primary,#4fd1a5)}
.sah-usage-cache-bar{display:block;width:100%!important}.sah-usage-cache-bar span{background:var(--dsw-alias-state-success-primary,#4fd1a5)!important}
.sah-usage-map{position:relative;height:200px;margin-inline:-2px}
.sah-usage-tile{position:absolute;padding:2px!important;margin:0;border:0!important;background:transparent!important;min-height:0!important;border-radius:0!important;display:block!important;text-align:start;cursor:default}
button.sah-usage-tile{cursor:pointer}
.sah-usage-tile-inner{display:flex;flex-direction:column;gap:1px;width:100%;height:100%;padding:6px 8px;border-radius:8px;overflow:hidden;background:color-mix(in srgb,var(--c) 15%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 42%,transparent);transition:background-color .12s ease-out}
.sah-usage-tile-inner[data-rest]{background:repeating-linear-gradient(135deg,#ffffff08 0 4px,transparent 4px 8px);box-shadow:inset 0 0 0 1px #ffffff1f}
@media(hover:hover){button.sah-usage-tile:hover .sah-usage-tile-inner{background:color-mix(in srgb,var(--c) 26%,transparent)}}
.sah-usage-tile strong{flex:none;font-size:12px;line-height:15px;font-weight:600;color:var(--c);overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:var(--name-lines,1);word-break:break-word;white-space:normal}
.sah-usage-tile-inner[data-rest] strong{color:var(--dsw-alias-label-tertiary,#999)}
.sah-usage-tile small{font-size:11px;line-height:14px;color:var(--dsw-alias-label-tertiary,#999);font-variant-numeric:tabular-nums;white-space:nowrap}
.sah-usage-legend{display:grid;gap:6px;font-size:12px}
.sah-usage-legend>button{display:grid!important;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;gap:4px 6px;min-width:0;width:100%;text-align:start;font-size:12px!important}
.sah-usage-legend i,.sah-usage-list i{flex:none;width:8px;height:8px;border-radius:2px}
.sah-usage-legend>button>i{width:10px;height:10px;background:var(--c);box-shadow:inset 0 0 0 1px var(--c)}
.sah-usage-model{min-width:0;overflow-wrap:anywhere;white-space:normal}
.sah-usage-tags{grid-column:2/-1;grid-row:2;display:flex;flex-wrap:wrap;gap:4px;min-width:0}
.sah-usage-legend em,.sah-usage-list em{flex:none;font-style:normal;font-size:11px;line-height:16px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-tertiary,#999)}
.sah-usage-legend b{grid-column:3;grid-row:1;white-space:nowrap;font-weight:400;color:var(--dsw-alias-label-secondary,#ccc);font-variant-numeric:tabular-nums}
.sah-usage-list-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2,#ffffff1f)}
.sah-usage-list-head .sah-overview-filters button{display:inline-flex;align-items:center;gap:6px;max-width:150px;min-width:0}
.sah-usage-list-head .sah-overview-filters button span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sah-usage-list-head .sah-overview-filters i{flex:none;width:8px;height:8px;border-radius:2px}
.sah-usage-list{list-style:none;margin:0;padding:0;display:grid;gap:0}
.sah-usage-list li>*{display:grid!important;grid-template-columns:18px 8px minmax(0,1fr) 64px 46px 34px;align-items:center;gap:8px;width:100%;min-height:30px!important;padding:4px 6px!important;border-radius:6px;font-size:12px;color:inherit!important;text-align:start;justify-content:stretch!important}
.sah-usage-list li>* small{font-size:11px;color:var(--dsw-alias-label-caption,#888);font-variant-numeric:tabular-nums;text-align:end}
.sah-usage-list li>* span:nth-of-type(1){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sah-usage-list li>* span:nth-of-type(1) em{margin-inline-start:6px}
.sah-usage-list li[data-hot]>*{background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
.sah-usage-caption{display:flex;align-items:center;gap:6px;min-height:20px;font-size:12px;margin-top:-6px!important}
.sah-usage-caption i{flex:none;width:8px;height:8px;border-radius:2px}
.sah-usage-caption span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sah-usage-caption b{margin-inline-start:auto;flex:none;font-weight:400;color:var(--dsw-alias-label-secondary,#ccc);font-variant-numeric:tabular-nums}
.sah-usage-tile b{margin:auto;font-size:11px;font-weight:600;color:var(--c);font-variant-numeric:tabular-nums}
.sah-usage-tile[data-dim] .sah-usage-tile-inner{opacity:.45}
.sah-usage-tile[data-hot] .sah-usage-tile-inner{background:color-mix(in srgb,var(--c) 30%,transparent);box-shadow:inset 0 0 0 1.5px var(--c)}
.sah-usage-tile-inner{transition:background-color .12s ease-out,opacity .12s ease-out}
.sah-usage-tile[data-status=done] .sah-usage-tile-inner{background:color-mix(in srgb,var(--c) 7%,#ffffff05);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 22%,transparent)}
.sah-usage-tile[data-status=done] strong{color:color-mix(in srgb,var(--c) 55%,#9a9aa2)}
.sah-usage-tile[data-status=running] .sah-usage-tile-inner{position:relative;background:color-mix(in srgb,var(--c) 30%,transparent);box-shadow:inset 0 0 0 1.5px var(--c),0 0 12px color-mix(in srgb,var(--c) 35%,transparent)}
.sah-usage-tile[data-status=running] .sah-usage-tile-inner::after{content:'';position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:50%;background:var(--c);animation:sah-overview-pulse 1.6s ease-in-out infinite}
.sah-usage-tile[data-status=failed] .sah-usage-tile-inner{--c:var(--dsw-alias-state-error-primary,#ff8a80);background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--c) 18%,transparent) 0 5px,color-mix(in srgb,var(--c) 10%,transparent) 5px 10px);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 60%,transparent)}
.sah-usage-tile[data-status=failed] .sah-usage-tile-inner strong,.sah-usage-tile[data-status=failed] .sah-usage-tile-inner b{color:var(--c)}
.sah-usage-states{display:flex;flex-wrap:wrap;gap:4px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999);margin-top:-6px}
.sah-usage-states button{display:inline-flex;align-items:center;gap:6px;font-size:12px!important}
.sah-usage-states button,.sah-usage-legend>button{min-height:30px!important;padding:4px 6px!important;border-radius:6px;border:1px solid transparent!important}
.sah-usage-states button[aria-pressed=false],.sah-usage-legend>button[aria-pressed=false]{color:var(--dsw-alias-label-caption,#888)!important}
.sah-usage-states button[aria-pressed=false]>i,.sah-usage-legend>button[aria-pressed=false]>i{background:transparent!important;box-shadow:inset 0 0 0 1px var(--c,var(--dsw-alias-label-caption,#888))!important}
.sah-usage-states button[aria-pressed=false] b,.sah-usage-legend>button[aria-pressed=false] b{color:inherit}
.sah-usage-legend>button[aria-pressed=false] .sah-usage-tags{opacity:.55}
.sah-usage-filter-summary{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}
.sah-usage-filter-summary button{flex:none}
.sah-usage-map-empty{height:200px;display:grid;place-items:center;text-align:center;padding:20px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999);border:1px dashed var(--dsw-alias-border-l2,#ffffff1f);border-radius:8px}
.sah-usage button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#9bb8ff);outline-offset:2px}
.sah-usage-states b{font-weight:400;color:var(--dsw-alias-label-secondary,#ccc);font-variant-numeric:tabular-nums}
.sah-usage-states i{width:10px;height:10px;border-radius:3px}
.sah-usage-states [data-status=running]{--c:#8fa8ff}
.sah-usage-states [data-status=failed]{--c:#ff8a80}
.sah-usage-states [data-status=running] i{background:#8fa8ff4d;box-shadow:inset 0 0 0 1.5px #8fa8ff}
.sah-usage-states [data-status=failed] i{background:repeating-linear-gradient(135deg,#ff8a804d 0 2px,#ff8a801a 2px 4px);box-shadow:inset 0 0 0 1px #ff8a80}
.sah-usage-states [data-status=done] i{background:#ffffff0d;box-shadow:inset 0 0 0 1px #ffffff2e}
.sah-usage-states [data-status=idle] i{border:1px solid var(--dsw-alias-label-tertiary,#999)}
.sah-usage-states [data-status=unknown] i{border:1px dashed var(--dsw-alias-label-tertiary,#999)}
.sah-usage-list u{display:inline-block;width:6px;height:6px;margin-inline-end:6px;border-radius:50%;vertical-align:middle;background:var(--dsw-alias-state-business-primary,#9bb8ff);animation:sah-overview-pulse 1.6s ease-in-out infinite;text-decoration:none}
.sah-usage-list li[data-status=done]>* span:nth-of-type(1){color:var(--dsw-alias-label-secondary,#bbb)}
.sah-usage-list li[data-status=running]>* span:nth-of-type(1){font-weight:500}
.sah-usage .sah-usage-failed{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ff8a80) 16%,transparent)!important;color:var(--dsw-alias-state-error-primary,#ff8a80)!important}
@media(prefers-reduced-motion:reduce){.sah-usage-tile[data-status=running] .sah-usage-tile-inner::after,.sah-usage-list u{animation:none}}
.sah-overview .sah-usage-more{justify-self:start;margin-top:-6px}
.sah-usage-track{height:4px;border-radius:2px;background:var(--dsw-alias-interactive-bg-hover,#ffffff14);overflow:hidden}
.sah-usage-track span{display:block;height:100%;border-radius:inherit}
.sah-usage-list b{font-weight:400;text-align:end;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#ccc)}
.sah-overview-tag{flex:none;font-size:11px;line-height:16px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-tertiary,#999)}
.sah-overview-foot{font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption,#888);display:grid;gap:2px}
@media(prefers-reduced-motion:reduce){.sah-overview-dot{animation:none}.sah-overview button,.sah-overview-trigger{transition:none}.sah-overview button:not(:disabled):active{transform:none}}
.sah-analysis{display:grid;gap:20px;min-width:0;--sah-input:var(--dsw-alias-state-business-primary,#719cff);--sah-cache:var(--dsw-alias-state-success-primary,#4fd1a5);--sah-output:var(--dsw-alias-label-tertiary,#999)}
.sah-analysis h3{font-size:13px;font-weight:600;line-height:1.5}.sah-analysis p{margin:0}.sah-analysis .sah-overview-foot{color:var(--dsw-alias-label-tertiary,#999)}
.sah-analysis-metrics{display:flex;flex-wrap:wrap;gap:12px 24px;padding-block:4px 14px;border-bottom:.5px solid var(--dsw-alias-border-l2,#ffffff1f)}
.sah-analysis-metrics div{display:grid;gap:3px}.sah-analysis-metrics dt{font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}.sah-analysis-metrics dd{margin:0;font-size:23px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.3}
.sah-analysis-section{display:grid;gap:12px;min-width:0}.sah-analysis-roles{list-style:none;margin:0;padding:0;display:grid;gap:14px}.sah-analysis-role{display:grid;gap:5px}
.sah-analysis-role-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;font-size:13px}.sah-analysis-role-head strong{font-weight:500;overflow-wrap:anywhere}.sah-analysis-role-head span{font-variant-numeric:tabular-nums;font-size:12px;color:var(--dsw-alias-label-secondary,#ccc)}
.sah-analysis-track{height:12px;background:var(--dsw-alias-interactive-bg-hover,#ffffff14);border-radius:3px;overflow:hidden}.sah-analysis-stack{height:100%;display:flex;min-width:0}.sah-analysis-stack span{display:block;height:100%}.sah-analysis-input{background:var(--sah-input)}.sah-analysis-cache{background:var(--sah-cache)}.sah-analysis-output{background:var(--sah-output)}
.sah-analysis-legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:11px;color:var(--dsw-alias-label-tertiary,#999)}.sah-analysis-legend span{display:inline-flex;align-items:center;gap:5px}.sah-analysis-legend i{width:8px;height:8px;border-radius:2px}
.sah-analysis-role-meta{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;color:var(--dsw-alias-label-tertiary,#999);font-variant-numeric:tabular-nums}
.sah-analysis-table{width:100%;border-collapse:collapse;font-size:12px;text-align:start;table-layout:fixed}.sah-analysis-table th{font-weight:500;color:var(--dsw-alias-label-tertiary,#999)}.sah-analysis-table :is(th,td){padding:8px 6px;border-bottom:.5px solid var(--dsw-alias-border-l2,#ffffff1f);vertical-align:top;line-height:1.5;overflow-wrap:anywhere}.sah-analysis-table th:first-child,.sah-analysis-table td:first-child{padding-inline-start:0;width:53%}.sah-analysis-table th:not(:first-child),.sah-analysis-table td:not(:first-child){text-align:end;font-variant-numeric:tabular-nums}.sah-analysis-table small{display:block;color:var(--dsw-alias-label-tertiary,#999);font-size:11px}
.sah-analysis-attention{padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#ffffff0a);box-shadow:inset 2px 0 0 var(--dsw-alias-state-warning-primary,#f5c26b);display:grid;gap:8px}.sah-analysis-attention ul,.sah-analysis-comparisons{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.sah-analysis-attention li{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:12px}.sah-analysis-attention li span{min-width:0;overflow-wrap:anywhere}.sah-analysis-attention button{flex:none;background:var(--dsw-alias-interactive-bg-hover,#ffffff14);min-height:28px}
.sah-analysis-comparisons li{padding-block:8px;border-bottom:.5px solid var(--dsw-alias-border-l2,#ffffff1f);display:grid;gap:3px;font-size:12px}.sah-analysis-comparisons strong{font-weight:500;overflow-wrap:anywhere}.sah-analysis-comparisons code{font-size:11px}
.sah-overview-path{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#999);overflow-wrap:anywhere}.sah-overview-card[data-depth]{border-inline-start:2px solid var(--dsw-alias-border-l2,#ffffff1f)}
`

    function overviewDuration(timing, running, now) {
      if (!Number.isFinite(timing?.settledMs) || timing.settledMs < 0) return undefined
      if (!timing.active) return timing.settledMs
      const { since, through } = timing.active
      if (!Number.isFinite(since) || !Number.isFinite(through)) return undefined
      return timing.settledMs + Math.max(0, (running ? Math.max(now, through) : through) - since)
    }
    function overviewTokens(usage) {
      const buckets = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']
      if (!usage || buckets.some(key => !Number.isFinite(usage[key]) || usage[key] < 0)) return undefined
      return buckets.reduce((sum, key) => sum + usage[key], 0)
    }
    function overviewTime(ms) {
      if (!Number.isFinite(ms)) return '—'
      const seconds = Math.floor(Math.max(0, ms) / 1000)
      return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    }
    /** Compact elapsed span: 820ms, 4.2s, 3m 05s, 1h 02m. */
    function overviewSpan(ms) {
      if (!Number.isFinite(ms) || ms < 0) return '—'
      if (ms < 1000) return `${Math.round(ms)}ms`
      if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
      const minutes = Math.floor(ms / 60_000)
      if (minutes < 60) return `${minutes}m ${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}s`
      return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
    }
    /** Compact token count: 980, 12.4K, 2.41M, 34.5M, 1.69B. */
    function overviewCount(value) {
      if (!Number.isFinite(value)) return '—'
      if (value < 1000) return String(Math.round(value))
      if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}K`
      if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 2 : value < 100_000_000 ? 1 : 0)}M`
      return `${(value / 1_000_000_000).toFixed(2)}B`
    }
    const OVERVIEW_LIMIT = 512
    const OVERVIEW_DEPTH = 32
    const projectionValues = (state, id) => ({ ...state?.byId?.[id]?.projectionValues, ...state?.projectionsBySession?.[id]?.values })
    /** Follow only catalog-proven parent links; a global Session's parent hint is not membership. */
    function overviewRoot(sessionId, directParent, state) {
      let root = directParent ?? sessionId
      const seen = new Set([sessionId])
      for (let depth = 0; depth < OVERVIEW_DEPTH && !seen.has(root); depth++) {
        seen.add(root)
        const parent = state?.byId?.[root]?.parentId
        if (!parent || seen.has(parent) || !projectionValues(state, parent).subagentCatalog?.some(entry => entry.id === root)) break
        root = parent
      }
      return root
    }
    /** Discover descendants only through each parent's durable catalog, with exact direct-parent addresses. */
    function overviewData(rootId, state, statuses, now = Date.now()) {
      const snapshots = state?.projectionsBySession ?? {}
      const summaries = state?.byId ?? {}
      const snapshot = snapshots[rootId]
      const values = projectionValues(state, rootId)
      const catalog = values.subagentCatalog
      const team = values.agentTeam
      const members = new Map()
      const issues = []
      let treeLimited = false
      const queue = [{ parentId: rootId, parentPath: '', depth: 1 }]
      // rc.2 persists Team mode only on the root. Every descendant shares that selection.
      const teamEnabled = team?.enabled === true
      while (queue.length) {
        const { parentId, parentPath, depth } = queue.shift()
        const parent = projectionValues(state, parentId)
        const local = new Map()
        for (const entry of Array.isArray(parent.subagentCatalog) ? parent.subagentCatalog : []) {
          if (typeof entry?.id !== 'string' || entry.id === rootId || members.has(entry.id)) continue
          const name = entry.name || entry.label || summaries[entry.id]?.displayTitle || entry.id
          local.set(entry.id, { ...entry, name, kind: teamEnabled ? 'team' : 'independent' })
        }
        // rc.1 owns a separate roster. rc.2 owns all identities in subagentCatalog instead.
        for (const member of parent.agentTeam?.members ?? []) {
          if (member.role === 'lead' || member.id === rootId || members.has(member.id)) continue
          local.set(member.id, { ...local.get(member.id), ...member, kind: 'team', mode: 'continuable' })
        }
        for (const member of local.values()) {
          if (members.has(member.id)) continue
          if (depth > OVERVIEW_DEPTH) { treeLimited = true; continue }
          if (members.size >= OVERVIEW_LIMIT) { treeLimited = true; queue.length = 0; break }
          const path = parentPath ? `${parentPath}/${member.name}` : member.name
          members.set(member.id, { ...member, parentId, path, depth })
          if (['one-shot', 'continuable'].includes(member.mode)) queue.push({ parentId: member.id, parentPath: path, depth: depth + 1 })
        }
      }
      const rows = [...members.values()].map(member => {
        const child = snapshots[member.id]
        const projected = projectionValues(state, member.id)
        const running = statuses?.get(member.id)?.running ?? summaries[member.id]?.running
        const timing = projected.subagentTiming
        const status = member.phase === 'failed' ? 'failed' : member.phase === 'provisioning' ? 'provisioning'
          : running === true ? 'running' : running === undefined ? 'unknown'
          : member.kind === 'team' ? 'inactive'
          : member.mode === 'one-shot' && timing?.lastTurnCompleted === true ? 'completed'
          : timing?.lastTurnCompleted === false ? 'interrupted' : 'inactive'
        const activity = projected[ACTIVITY_PROJECTION] ?? undefined
        const lastActive = activity?.last ?? timing?.active?.through
        const when = lastActive ?? member.createdAt
        const recent = Number.isFinite(when) && now - when <= ATTENTION_WINDOW_MS
        const stall = status === 'running' ? overviewStall(activity, lastActive, now) : undefined
        const attention = activity?.approval !== undefined || stall !== undefined || ((status === 'failed' || status === 'interrupted') && recent)
        return { ...member, status, attention, stall, activity, model: modelBadgeData({ subagent: true }, projected.modelSelection),
          presetId: typeof projected.agentPreset === 'string' ? projected.agentPreset : undefined,
          presetKnown: typeof projected.agentPreset === 'string' || projected.agentPreset === null,
          duration: overviewDuration(timing, running === true, now), tokens: overviewTokens(projected.tokenUsage),
          tokenUsage: projected.tokenUsage, lastActive,
          readState: child?.state, readError: child?.error?.message,
          address: ['one-shot', 'continuable'].includes(member.mode) ? { parentSessionId: member.parentId, childSessionId: member.id, mode: member.mode } : undefined }
      })
      if (snapshot?.error) issues.push({ id: rootId, message: snapshot.error.message ?? String(snapshot.error) })
      if (team?.failure) issues.push({ id: rootId, message: team.failure })
      for (const row of rows) {
        if (row.error) issues.push({ id: row.id, message: row.error })
        if (row.readError) issues.push({ id: row.id, message: row.readError })
      }
      return { rows, dispatch: values.subagentHubDispatch, tasks: (team?.tasks ?? []).filter(task => task.status !== 'deleted'), issues, treeLimited,
        depth: rows.reduce((max, row) => Math.max(max, row.depth), 0),
        teamAvailable: team !== undefined, catalogAvailable: Array.isArray(catalog),
        readState: snapshot?.state ?? (state?.phase === 'pending' ? 'loading' : 'idle'),
        running: rows.filter(row => row.status === 'running').length,
        attention: rows.filter(row => row.attention).length,
        tokenKnown: rows.filter(row => row.tokens !== undefined).length,
        tokens: rows.reduce((sum, row) => sum + (row.tokens ?? 0), 0) }
    }
    /**
     * Whether a running agent looks stuck: quiet with no open tool call, or one call open far
     * longer than usual. Long model thinking also records no event, so this is a hint, not a verdict.
     */
    function overviewStall(activity, lastActive, now) {
      const call = activity?.pending?.at(-1)
      if (call !== undefined) {
        const ms = now - call.since
        return Number.isFinite(ms) && ms >= LONG_CALL_MS ? { kind: 'call', ms, tool: call.name } : undefined
      }
      const ms = now - lastActive
      return Number.isFinite(ms) && ms >= STALL_MS ? { kind: 'quiet', ms } : undefined
    }
    /** When an agent last produced something worth reading: a report, or the end of a turn. */
    function overviewNews(row) {
      const times = [row.activity?.report?.time, row.activity?.end?.time].filter(Number.isFinite)
      return times.length ? Math.max(...times) : undefined
    }
    /** Ids with a result newer than `seen`; `settled` adds agents seen to stop running meanwhile. */
    function overviewFresh(rows, seen, settled = new Set()) {
      if (!Number.isFinite(seen)) return new Set()
      return new Set(rows.filter(row => settled.has(row.id) || (overviewNews(row) ?? -Infinity) > seen).map(row => row.id))
    }
    const USAGE_BUCKETS = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']
    const validBuckets = value => value && USAGE_BUCKETS.every(key => Number.isFinite(value[key]) && value[key] >= 0)
    /**
     * Token use per route across this session's agents. The Hub digest splits a child's usage by
     * the route each request actually used; a child without it falls back to its session total
     * under its last recorded route, and that row is marked approximate.
     */
    function overviewUsage(rows, routes = []) {
      const byRoute = new Map()
      const entry = (provider, model) => {
        const key = `${provider}\0${model}`
        let item = byRoute.get(key)
        if (item === undefined) {
          const hub = routes.find(route => route?.provider === provider && route?.model === model)
          byRoute.set(key, item = { provider, model, agents: new Set(), requests: 0, requestsKnown: false, approximate: false,
            uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
            ...(hub ? { routeId: hub.id, tags: hub.tags ?? [] } : {}) })
        }
        return item
      }
      const add = (item, usage) => { for (const key of USAGE_BUCKETS) item[key] += usage[key] }
      const sumOf = usage => USAGE_BUCKETS.reduce((sum, key) => sum + usage[key], 0)
      const agents = []
      let missing = 0
      let estimated = 0
      let incomplete = 0
      for (const row of rows) {
        const split = Array.isArray(row.activity?.usage) ? row.activity.usage.filter(validBuckets) : []
        const tile = (provider, model, usage, isEstimate) => agents.push({ id: `${row.id}\0${provider}\0${model}`, rowId: row.id,
          name: row.name, address: row.address, routeKey: `${provider}\0${model}`, value: sumOf(usage), estimated: isEstimate,
          status: usageStatus(row) })
        if (split.length) {
          if (validBuckets(row.tokenUsage) && sumOf(row.tokenUsage) > split.reduce((total, item) => total + sumOf(item), 0)) incomplete++
          for (const usage of split) {
            const item = entry(usage.provider, usage.model)
            item.agents.add(row.id)
            if (Number.isFinite(usage.requests) && usage.requests >= 0) { item.requests += usage.requests; item.requestsKnown = true }
            add(item, usage)
            tile(usage.provider, usage.model, usage, false)
          }
        } else if (validBuckets(row.tokenUsage) && row.model.kind === 'recorded') {
          const item = entry(row.model.last.provider, row.model.last.model)
          item.agents.add(row.id)
          item.approximate = true
          add(item, row.tokenUsage)
          tile(row.model.last.provider, row.model.last.model, row.tokenUsage, true)
          estimated++
        } else {
          missing++
          // A running agent is shown even before its first usage report, so live work is never hidden.
          if (row.status === 'running') {
            const route = row.model.kind === 'recorded' ? row.model.last : undefined
            agents.push({ id: `${row.id}\0pending`, rowId: row.id, name: row.name, address: row.address,
              routeKey: route ? `${route.provider}\0${route.model}` : undefined, value: 0, estimated: false, status: 'running' })
          }
        }
      }
      const items = [...byRoute.values()].map(item => ({ ...item, key: `${item.provider}\0${item.model}`, agents: item.agents.size, total: sumOf(item) }))
      const total = items.reduce((sum, item) => sum + item.total, 0)
      const totals = Object.fromEntries(USAGE_BUCKETS.map(key => [key, items.reduce((sum, item) => sum + item[key], 0)]))
      return { total, missing, estimated, incomplete, ...totals, requests: items.reduce((sum, item) => sum + item.requests, 0),
        agents: agents.filter(agent => agent.value > 0 || agent.status === 'running').sort((a, b) => b.value - a.value),
        routes: items.map(item => ({ ...item, share: total ? item.total / total : 0 })).sort((a, b) => b.total - a.total) }
    }
    /** Attribute roles only from the native persisted preset projection, never from names or task text. */
    function overviewAnalytics(rows, routes = [], agents = []) {
      const groups = new Map()
      const comparisons = []
      for (const row of rows) {
        const roleId = row.presetId?.startsWith('hub-agent-') ? row.presetId.slice('hub-agent-'.length) : undefined
        const configured = roleId === undefined ? undefined : agents.find(agent => agent.id === roleId)
        const key = roleId === undefined ? (row.presetId || row.presetKnown ? 'unassigned' : 'unknown') : `role:${roleId}`
        if (!groups.has(key)) groups.set(key, { key, roleId, name: configured?.name || roleId, rows: [] })
        groups.get(key).rows.push(row)
        if (row.model.kind !== 'recorded') continue
        const last = row.model.last
        const route = routes.find(route => route.provider === last.provider && route.model === last.model)
        const actual = last.reasoningEffort ?? row.activity?.effort?.value
        if (route?.reasoningEffort && actual && route.reasoningEffort !== actual) {
          comparisons.push({ row, kind: 'effort', expected: route.reasoningEffort, actual, routeId: route.id })
        }
        if (routes.length && !route) comparisons.push({ row, kind: 'route', actual: `${last.provider} / ${last.model}` })
        if (route && configured?.routes?.length && !configured.routes.includes(route.id)) {
          comparisons.push({ row, kind: 'roleRoute', actual: route.id, expected: configured.routes.join(', ') })
        }
      }
      const roles = [...groups.values()].map(group => {
        const usage = overviewUsage(group.rows, routes)
        const known = group.rows.filter(row => Number.isFinite(row.activity?.retries) && row.activity.retries >= 0)
        return { ...group, usage, retries: known.reduce((total, row) => total + row.activity.retries, 0), retriesKnown: known.length }
      }).sort((a, b) => b.usage.total - a.usage.total || a.key.localeCompare(b.key))
      return { roles, comparisons, usage: overviewUsage(rows, routes), attention: rows.filter(row => row.attention) }
    }
    /** An idle continuable member or an unknown status must never imply task completion. */
    function usageStatus(row) {
      if (row.status === 'running' || row.status === 'provisioning') return 'running'
      if (row.status === 'failed' || row.status === 'interrupted') return 'failed'
      if (row.status === 'completed') return 'done'
      if (row.status === 'inactive') return 'idle'
      return 'unknown'
    }
    /** Status and model exclusions apply together to both the map and the list. */
    function usageVisible(agents, { hiddenStatuses = [], hiddenRoutes = [] } = {}) {
      return agents.filter(agent => !hiddenStatuses.includes(agent.status) && !hiddenRoutes.includes(agent.routeKey))
    }
    /**
     * The agents that get their own treemap tile: every running one, then the largest others,
     * `limit` in all; the rest share one tile. Running tiles get a minimum area so they stay visible.
     */
    function usageTiles(agents, limit = TREEMAP_TILES) {
      const running = agents.filter(agent => agent.status === 'running')
      const others = agents.filter(agent => agent.status !== 'running')
      const room = Math.max(0, limit - running.length - (running.length + others.length > limit ? 1 : 0))
      const own = [...running, ...others.slice(0, room)]
      const rest = others.slice(room)
      const total = agents.reduce((sum, agent) => sum + agent.value, 0)
      const floor = total > 0 ? total * 0.025 : 1
      const tiles = own.map(agent => ({ ...agent, area: agent.status === 'running' ? Math.max(agent.value, floor) : agent.value }))
        .filter(tile => tile.area > 0).sort((a, b) => b.area - a.area)
      return { tiles, rest }
    }
    /** Share of prompt tokens served from cache, or undefined when nothing was read. */
    function overviewCacheRate(item) {
      const prompt = item.uncachedInputTokens + item.cacheReadTokens + item.cacheWriteTokens
      return prompt > 0 ? item.cacheReadTokens / prompt : undefined
    }
    const SETTLED = new Set(['inactive', 'completed'])
    function overviewFilter(rows, { search = '', kind = 'all', status = 'all', sort = 'priority' } = {}, groups = [], fresh = new Set()) {
      const query = search.trim().toLocaleLowerCase()
      const rank = { running: 0, provisioning: 1, failed: 2, interrupted: 3, unknown: 4, inactive: 5, completed: 6 }
      const statusMatch = row => status === 'all' || row.status === status
        || (status === 'attention' && row.attention)
        || (status === 'settled' && !row.attention && (SETTLED.has(row.status) || row.status === 'failed' || row.status === 'interrupted'))
      return rows.filter(row => (kind === 'all' || row.kind === kind) && statusMatch(row)
        && (!query || [row.name, row.path, row.label, row.presetId, row.id, row.model.last?.provider, row.model.last?.model, routeModelName(groups, row.model.last), row.error, row.activity?.task?.text].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)))
        .sort((a, b) => {
          const primary = sort === 'name' ? a.name.localeCompare(b.name)
            : sort === 'newest' ? (b.createdAt ?? -1) - (a.createdAt ?? -1)
            : sort === 'timeSort' ? (b.duration ?? -1) - (a.duration ?? -1)
            : sort === 'tokenSort' ? (b.tokens ?? -1) - (a.tokens ?? -1)
            : (Number(b.attention) - Number(a.attention)) || (Number(fresh.has(b.id)) - Number(fresh.has(a.id)))
              || rank[a.status] - rank[b.status] || (b.lastActive ?? -1) - (a.lastActive ?? -1)
          return primary || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
        })
    }
    /** Read exactly the displayed catalog selection, rediscovering after each bounded batch. */
    async function refreshOverview(sessions, rootId, ids = [], cancelled = () => false) {
      const automatic = rootId !== undefined && typeof sessions.list?.getSnapshot === 'function'
      const initial = automatic ? [rootId] : [...new Set([rootId, ...ids].filter(Boolean))]
      let queue = [...initial]
      const seen = new Set()
      const failures = []
      while (queue.length && !cancelled() && seen.size < OVERVIEW_LIMIT + 1) {
        const batch = queue.filter(id => !seen.has(id)).slice(0, Math.min(4, OVERVIEW_LIMIT + 1 - seen.size))
        if (!batch.length) break
        for (const id of batch) seen.add(id)
        await Promise.all(batch.map(async id => {
          if (cancelled()) return
          try { await sessions.refreshProjections(id) }
          catch (error) { failures.push({ id, message: String(error?.message ?? error) }) }
        }))
        if (cancelled()) break
        const snapshot = automatic ? sessions.list.getSnapshot() : undefined
        // Finish a whole parent depth before scheduling deeper cached catalogs. Otherwise a
        // newly read earlier sibling could displace descendants whose reads consumed the cap.
        const discovered = snapshot ? overviewData(rootId, snapshot, new Map()).rows.filter(row => row.address && !seen.has(row.id)) : []
        const depth = Math.min(...discovered.map(row => row.depth))
        queue = snapshot ? discovered.filter(row => row.depth === depth).map(row => row.id) : initial.filter(id => !seen.has(id))
      }
      if (!cancelled() && automatic && overviewData(rootId, sessions.list.getSnapshot(), new Map()).rows.some(row => row.address && !seen.has(row.id))) {
        failures.push({ id: rootId, message: 'The member catalog changed while refreshing. Refresh again to read the remaining members.' })
      }
      return failures
    }
    /** The child's own plan: done count and the item it is on. */
    function overviewPlan(todos) {
      if (!Array.isArray(todos) || todos.length === 0) return undefined
      const done = todos.filter(todo => todo.status === 'completed').length
      const current = todos.find(todo => todo.status === 'in_progress') ?? todos.find(todo => todo.status !== 'completed')
      return { done, total: todos.length, current: current?.content }
    }
    /** Whichever the child said last: a report to another agent, or its own assistant text. */
    function overviewVoice(activity) {
      const report = activity?.report
      const output = activity?.output
      if (report && (!output || report.time >= output.time)) return { kind: 'report', ...report }
      return output ? { kind: 'output', ...output } : undefined
    }
    function OverviewMember({ row, currentId, openChild, t, groups = [], now = Date.now(), fresh = false }) {
      // The native view drops an adapter-defaulted effort; the Hub digest keeps what actually ran.
      const effortText = value => value.reasoningEffort ?? (row.activity?.effort ? `${row.activity.effort.value}${row.activity.effort.defaulted ? t('overview.effortDefault') : ''}` : undefined)
      const modelLabel = value => `${routeLabel(groups, value).value}${effortText(value) ? ` · ${t('overview.effort')} ${effortText(value)}` : ''}`
      const raw = value => `${value.provider} / ${value.model}${value.reasoningEffort ? ` · ${value.reasoningEffort}` : ''}`
      const activity = row.activity
      const live = row.status === 'running'
      const current = live ? activity?.pending?.at(-1) : undefined
      const plan = overviewPlan(activity?.todos)
      const voice = overviewVoice(activity)
      const field = (label, value, extra = {}) => h(React.Fragment, null, h('dt', null, label), h('dd', extra, value))
      const stateText = [t(`overview.${row.status}`), Number.isFinite(row.duration) ? overviewTime(row.duration) : undefined].filter(Boolean).join(' · ')
      return h('li', { className: 'sah-overview-card', 'data-attention': row.attention ? 'true' : undefined, 'data-depth': row.depth > 1 ? row.depth : undefined },
        h('div', { className: 'sah-overview-card-head' },
          h('span', { className: 'sah-overview-dot', 'data-state': row.status, 'data-attention': activity?.approval || row.stall ? 'true' : undefined, 'aria-hidden': true }),
          h('h3', { title: row.path || row.name }, row.name),
          fresh ? h('span', { className: 'sah-overview-fresh' }, t('overview.fresh')) : null,
          h('span', { className: 'sah-overview-state' }, stateText),
          h('button', { type: 'button', disabled: !row.address || row.id === currentId,
            title: !row.address ? t('overview.noNavigation') : undefined,
            onClick: () => openChild(row.address) }, t(row.id === currentId ? 'overview.current' : 'overview.open'))),
        row.depth > 1 ? h('p', { className: 'sah-overview-path' }, h('code', null, row.path)) : null,
        row.label && row.label !== row.name ? h('p', { className: 'sah-overview-path' }, row.label) : null,
        h('p', { className: 'sah-overview-model' }, row.model.kind === 'recorded'
          ? `${modelLabel(row.model.last)}${row.kind === 'team' ? ` · ${t('overview.team')}` : ''}`
          : t(row.model.kind === 'waiting' ? 'overview.noRequest' : 'overview.noModel')),
        activity ? h('dl', { className: 'sah-overview-fields' },
          activity.task ? field(t('overview.task'), activity.task.text, { className: 'sah-overview-clamp', title: activity.task.text }) : null,
          activity.approval ? field(t('overview.doing'), t('overview.approval', { tool: activity.approval.tool }), { className: 'sah-overview-warn' })
            : row.stall ? field(t('overview.doing'), row.stall.kind === 'call'
              ? t('overview.stallCall', { tool: row.stall.tool, time: overviewSpan(row.stall.ms) })
              : t('overview.stallQuiet', { time: overviewSpan(row.stall.ms) }), { className: 'sah-overview-warn' })
            : live ? field(t('overview.doing'), current
              ? h('span', { className: 'sah-overview-now' }, h('code', null, current.name), h('span', null, current.hint ?? ''),
                h('span', { className: 'sah-overview-elapsed' }, overviewSpan(now - current.since)))
              : h('span', { className: 'sah-overview-muted' }, t('overview.thinking'))) : null,
          plan ? field(t('overview.plan'), h('span', { className: 'sah-overview-progress' },
            h('span', { className: 'sah-overview-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': plan.total, 'aria-valuenow': plan.done, 'aria-label': t('overview.plan') },
              h('span', { style: { width: `${Math.round(plan.done / plan.total * 100)}%` } })),
            h('span', null, `${plan.done}/${plan.total}${plan.current ? ` · ${t('overview.planCurrent', { item: plan.current })}` : ''}`))) : null,
          activity.inbox && row.kind === 'team' ? field(t('overview.inbox'), activity.inbox.text, { className: 'sah-overview-clamp', style: { '--lines': 2 } }) : null,
          voice ? field(t(voice.kind === 'report' ? 'overview.report' : 'overview.output'), voice.text, { className: 'sah-overview-clamp', style: { '--lines': 3 }, title: voice.text }) : null)
          : row.readState === 'ready' ? h('p', { className: 'sah-overview-muted', style: { fontSize: 12 } }, t('overview.noActivity')) : null,
        row.error || row.readError ? h('p', { className: 'sah-overview-error' }, row.error || row.readError) : null,
        h('div', { className: 'sah-overview-meta' },
          activity ? h('span', null, t('overview.toolCount', { tools: activity.tools }),
            activity.errors ? h(React.Fragment, null, ' · ', h('span', { className: 'sah-overview-error' }, t('overview.errorCount', { errors: activity.errors }))) : null) : null,
          row.tokens !== undefined ? h('span', null, `${t('overview.tokens')} ${overviewCount(row.tokens)}`) : null,
          Number.isFinite(row.lastActive) && !live ? h('span', null, t('overview.ago', { time: overviewSpan(now - row.lastActive) })) : null),
        h('details', null, h('summary', null, t('overview.details')),
          activity ? (activity.recent.length
            ? h('ol', { className: 'sah-overview-trail', 'aria-label': t('overview.steps') }, ...[...activity.recent].reverse().map((step, index) => h('li', { key: `${step.time}-${index}` },
              h('span', { 'data-ok': String(step.ok), 'aria-hidden': true }, step.ok ? '✓' : '✕'),
              h('code', null, step.name), h('span', null, step.hint ?? ''), h('span', null, overviewSpan(step.ms)))))
            : h('p', { className: 'sah-overview-muted', style: { fontSize: 12, marginTop: 6 } }, t('overview.noSteps'))) : null,
          h('dl', { className: 'sah-overview-evidence' }, h('dt', null, 'Session ID'), h('dd', null, h('code', null, row.id)),
            h('dt', null, t('overview.path')), h('dd', null, row.path || row.name),
            row.presetId ? h(React.Fragment, null, h('dt', null, t('overview.preset')), h('dd', null, h('code', null, row.presetId))) : null,
            h('dt', null, t('overview.kind')), h('dd', null, row.mode),
            Number.isFinite(row.createdAt) ? h(React.Fragment, null, h('dt', null, t('overview.created')), h('dd', null, new Date(row.createdAt).toLocaleString())) : null,
            row.model.kind === 'recorded' ? h(React.Fragment, null, h('dt', null, t('overview.model')), h('dd', null, raw(row.model.last))) : null,
            effortText(row.model.last ?? {}) ? h(React.Fragment, null, h('dt', null, t('overview.effort')), h('dd', null, effortText(row.model.last ?? {}))) : null,
            row.model.next ? h(React.Fragment, null, h('dt', null, t('overview.next')), h('dd', null, raw(row.model.next))) : null,
            Number.isFinite(row.duration) ? h(React.Fragment, null, h('dt', null, t('overview.duration')), h('dd', null, overviewTime(row.duration))) : null,
            activity?.retries ? h(React.Fragment, null, h('dt', null, 'LLM'), h('dd', null, t('overview.retries', { count: activity.retries }))) : null,
            activity?.end ? h(React.Fragment, null, h('dt', null, t('overview.state')), h('dd', null, t('overview.endedBy', { kind: activity.end.kind }))) : null,
            activity?.task ? h(React.Fragment, null, h('dt', null, t('overview.task')), h('dd', { className: 'sah-overview-task-description' }, activity.task.text)) : null),
          row.readState === 'migration-required' ? h('p', null, t('overview.migration')) : null))
    }
    function taskBoardState(task) {
      if (task.status !== 'pending') return task.status
      return task.ready === true ? 'ready' : task.ready === false ? 'blocked' : 'pending'
    }
    function taskBoardOwnerKey(task) {
      if (typeof task.ownerId === 'string' && task.ownerId) return `owner-id:${task.ownerId}`
      return typeof task.ownerName === 'string' && task.ownerName !== '' ? `owner:${task.ownerName}` : 'unassigned'
    }
    function taskBoardFilter(tasks, { status = 'all', owner = 'all' } = {}) {
      return tasks.filter(task => task.status !== 'deleted'
        && (status === 'all' || (status === 'pending' ? task.status === 'pending' : taskBoardState(task) === status))
        && (owner === 'all' || taskBoardOwnerKey(task) === owner))
    }
    /** rc.2 owner IDs are authoritative; old name-only tasks require an unambiguous proven roster. */
    function taskBoardOwner(task, rows = []) {
      if (taskBoardOwnerKey(task) === 'unassigned') return undefined
      const matches = typeof task.ownerId === 'string' && task.ownerId
        ? rows.filter(row => row.id === task.ownerId)
        : rows.filter(row => row.kind === 'team' && (row.path === task.ownerName || row.name === task.ownerName))
      return matches.length === 1 && matches[0].address ? matches[0] : undefined
    }
    function taskBoardDependencies(task, tasks) {
      const byId = new Map(tasks.map(item => [String(item.id), item]))
      return [...new Set(task.blockedBy ?? [])].map(id => ({ id: String(id), task: byId.get(String(id)) }))
    }
    function OverviewTasks({ tasks, teamAvailable, t, rows = [], openChild }) {
      const [filters, setFilters] = React.useState({ status: 'all', owner: 'all' })
      const [focus, setFocus] = React.useState(undefined)
      const [opening, setOpening] = React.useState(undefined)
      const [error, setError] = React.useState(undefined)
      const cards = React.useRef(new Map())
      const nextFocus = React.useRef(0)
      const idPrefix = React.useId()
      React.useEffect(() => {
        if (focus === undefined) return
        const card = cards.current.get(focus.id)
        card?.scrollIntoView?.({ block: 'nearest' })
        card?.focus({ preventScroll: true })
      }, [focus])
      if (!teamAvailable) return h('p', { role: 'status' }, t('overview.noTeam'))
      const all = taskBoardFilter(tasks)
      if (!all.length) return h('p', null, t('overview.noTasks'))
      const visible = taskBoardFilter(all, filters)
      // Keep an emptied selection visible after live reassignment instead of displaying “All” for a still-active filter.
      const ownerKeys = [...new Set([...all.map(taskBoardOwnerKey), ...(filters.owner === 'all' ? [] : [filters.owner])])]
      const ownerLabel = key => {
        if (key === 'unassigned') return t('overview.unowned')
        const task = all.find(task => taskBoardOwnerKey(task) === key)
        const member = task && taskBoardOwner(task, rows)
        return member?.path || task?.ownerName || task?.ownerId || key.replace(/^owner(?:-id)?:/, '')
      }
      const isFiltered = filters.status !== 'all' || filters.owner !== 'all'
      const labelOfState = state => t(`overview.${state}`)
      const reset = () => { setFilters({ status: 'all', owner: 'all' }); setFocus(undefined) }
      const locate = id => {
        setFilters({ status: 'all', owner: 'all' })
        setFocus({ id: String(id), request: ++nextFocus.current })
      }
      const navigate = async owner => {
        setOpening(owner.id)
        setError(undefined)
        try { await openChild(owner.address) }
        catch { setError(t('overview.boardOpenError')) }
        finally { setOpening(undefined) }
      }
      return h('section', { className: 'sah-task-board', 'aria-label': t('overview.tasks') },
        h('div', { className: 'sah-task-filters' },
          h('label', null, t('overview.boardStatus'), h('select', { value: filters.status, onChange: event => { setFilters(old => ({ ...old, status: event.target.value })); setFocus(undefined) } },
            ...['all', 'pending', 'ready', 'blocked', 'in_progress', 'completed'].map(status => h('option', { key: status, value: status },
              `${status === 'all' ? t('overview.all') : status === 'pending' ? t('overview.boardPending') : labelOfState(status)} (${taskBoardFilter(all, { status }).length})`)))),
          h('label', null, t('overview.boardOwner'), h('select', { value: filters.owner, onChange: event => { setFilters(old => ({ ...old, owner: event.target.value })); setFocus(undefined) } },
            h('option', { value: 'all' }, t('overview.all')),
            ...ownerKeys.map(key => h('option', { key, value: key }, `${ownerLabel(key)} (${taskBoardFilter(all, { owner: key }).length})`))))),
        h('div', { className: 'sah-task-summary' },
          h('p', { role: 'status' }, t('overview.boardShown', { shown: visible.length, total: all.length })),
          isFiltered ? h('button', { type: 'button', onClick: reset }, t('overview.reset')) : null),
        error ? h('p', { role: 'alert', className: 'sah-overview-error' }, error) : null,
        visible.length ? h('ul', { className: 'sah-overview-list' }, ...visible.map(task => {
          const state = taskBoardState(task)
          const owner = taskBoardOwner(task, rows)
          const dependencies = taskBoardDependencies(task, all)
          const unresolved = dependencies.filter(item => item.task?.status !== 'completed')
          const shownDependencies = state === 'blocked' && unresolved.length ? unresolved : dependencies
          const scopeWarnings = task.writeScopeWarnings ?? []
          return h('li', { key: task.id, id: `${idPrefix}-${task.id}`, className: 'sah-overview-card sah-task-card', tabIndex: -1,
            ref: node => { if (node) cards.current.set(String(task.id), node); else cards.current.delete(String(task.id)) },
            'data-task-id': task.id, 'data-located': focus?.id === String(task.id) ? '' : undefined },
            h('div', { className: 'sah-task-head' },
              h('div', { className: 'sah-task-title' }, h('span', { className: 'sah-overview-dot', 'data-state': state === 'completed' ? 'completed' : state === 'in_progress' ? 'running' : 'inactive', 'aria-hidden': true }), h('h3', null, task.subject)),
              h('span', { className: 'sah-task-status', 'data-state': state }, labelOfState(state))),
            h('div', { className: 'sah-task-owner' }, h('span', { className: 'sah-task-id' }, task.id), h('span', { 'aria-hidden': true }, '·'), h('span', null, `${t('overview.owner')}：`),
              owner && openChild ? h('button', { type: 'button', className: 'sah-task-owner-link', disabled: opening === owner.id,
                title: t('overview.boardOpenOwner', { name: owner.path || owner.name }), onClick: () => navigate(owner) }, owner.path || owner.name)
                : h('span', { title: task.ownerName || task.ownerId ? t('overview.boardNoOwnerNavigation') : undefined }, task.ownerName || task.ownerId || t('overview.unowned'))),
            task.description ? h('p', { className: 'sah-task-description' }, task.description) : null,
            shownDependencies.length ? h('div', { className: 'sah-task-dependencies' },
              h('span', null, t(state === 'blocked' && unresolved.length ? 'overview.boardWaiting' : 'overview.boardPrerequisites')),
              ...shownDependencies.map(dependency => dependency.task
                ? h('button', { type: 'button', key: dependency.id, className: 'sah-task-dependency', 'data-completed': dependency.task.status === 'completed' ? '' : undefined,
                  'aria-controls': `${idPrefix}-${dependency.id}`, title: t('overview.boardDependency', { id: dependency.id, subject: dependency.task.subject }),
                  onClick: () => locate(dependency.id) }, dependency.task.subject || dependency.id)
                : h('span', { key: dependency.id, className: 'sah-task-dependency', 'data-missing': '' }, t('overview.boardMissing', { id: dependency.id })))) : null,
            state === 'blocked' && !unresolved.length ? h('p', { className: 'sah-task-warning' }, t('overview.boardReadinessUnknown')) : null,
            ...(scopeWarnings.map((warning, index) => {
              const overlap = /^write scopes overlap with (.+)$/.exec(warning)
              const shared = /^Shared write scope: (.+)$/.exec(warning)
              const text = overlap ? t('overview.boardScopeOverlap', { id: overlap[1] }) : shared ? t('overview.boardSharedScope', { scope: shared[1] }) : warning
              const target = overlap && all.find(item => String(item.id) === overlap[1])
              return h('p', { key: index, className: 'sah-task-warning' }, target
                ? h('button', { type: 'button', className: 'sah-task-warning-link', onClick: () => locate(target.id) }, text) : text)
            })),
            task.writeScopes?.length ? h('details', null, h('summary', null, `${t('overview.boardDetails')} (${task.writeScopes.length})`),
              h('ul', { className: 'sah-task-scopes' }, ...task.writeScopes.map((scope, index) => h('li', { key: index }, scope)))) : null)
        })) : h('p', { className: 'sah-overview-muted', role: 'status' }, t('overview.boardNoMatches')),
        h('p', { className: 'sah-overview-muted', style: { fontSize: 11 } }, t('overview.boardReadOnly')))
    }
    const FILTERS_FROM = 5
    /** Route colors, in route order; tuned for the dark menu surface. */
    const USAGE_COLORS = ['#8fa8ff', '#4fd1a5', '#f5b85b', '#5cc8f0', '#e58fd6', '#b49cff', '#ff9f8a', '#c2d36b']
    const TREEMAP_TILES = 16
    const USAGE_LIST_TOP = 10
    /**
     * Squarified treemap (Bruls et al.) of positive values into a w×h box, returned as
     * percentages so the tiles follow the container's actual size.
     */
    function overviewTreemap(values, w = 420, h = 200) {
      const total = values.reduce((sum, value) => sum + value, 0)
      if (!(total > 0)) return []
      const items = values.map((value, index) => ({ index, area: value / total * w * h }))
      const out = []
      let box = { x: 0, y: 0, w, h }
      const worst = (row, side) => {
        const sum = row.reduce((acc, item) => acc + item.area, 0)
        const max = Math.max(...row.map(item => item.area))
        const min = Math.min(...row.map(item => item.area))
        return Math.max(side * side * max / (sum * sum), sum * sum / (side * side * min))
      }
      const place = row => {
        const sum = row.reduce((acc, item) => acc + item.area, 0)
        if (box.w >= box.h) {
          const width = sum / box.h
          let y = box.y
          for (const item of row) { const height = item.area / width; out[item.index] = { x: box.x, y, w: width, h: height }; y += height }
          box = { x: box.x + width, y: box.y, w: box.w - width, h: box.h }
        } else {
          const height = sum / box.w
          let x = box.x
          for (const item of row) { const width = item.area / height; out[item.index] = { x, y: box.y, w: width, h: height }; x += width }
          box = { x: box.x, y: box.y + height, w: box.w, h: box.h - height }
        }
      }
      let row = []
      for (const item of items) {
        const side = Math.min(box.w, box.h)
        if (row.length === 0 || worst([...row, item], side) <= worst(row, side)) { row.push(item); continue }
        place(row)
        row = [item]
      }
      if (row.length) place(row)
      return out.map(rect => ({ left: rect.x / w * 100, top: rect.y / h * 100, width: rect.w / w * 100, height: rect.h / h * 100, px: rect }))
    }
    function OverviewUsage({ usage, groups = [], t, openChild, filters, onFiltersChange }) {
      const [localFilters, setLocalFilters] = React.useState({ hiddenStatuses: [], hiddenRoutes: [] })
      const activeFilters = filters ?? localFilters
      const setFilters = onFiltersChange ?? setLocalFilters
      const [hot, setHot] = React.useState(undefined)
      const [expanded, setExpanded] = React.useState(false)
      if (!usage.routes.length) return h('p', { className: 'sah-overview-muted' }, t('overview.usageEmpty'))
      const filtered = usageVisible(usage.agents, activeFilters)
      const visibleTotal = filtered.reduce((sum, agent) => sum + agent.value, 0)
      const isFiltered = activeFilters.hiddenStatuses.length > 0 || activeFilters.hiddenRoutes.length > 0
      const toggle = (field, value) => {
        setFilters(old => ({ ...old, [field]: old[field].includes(value) ? old[field].filter(item => item !== value) : [...old[field], value] }))
        setHot(undefined)
      }
      const reset = () => { setFilters({ hiddenStatuses: [], hiddenRoutes: [] }); setHot(undefined) }
      const percent = value => `${value >= 0.995 || value === 0 ? Math.round(value * 100) : value < 0.01 ? '<1' : Math.round(value * 100)}%`
      const colorOf = new Map(usage.routes.map((item, index) => [item.key, USAGE_COLORS[index % USAGE_COLORS.length]]))
      const nameOf = new Map(usage.routes.map(item => [item.key, routeLabel(groups, item).value]))
      const rate = overviewCacheRate(usage)
      // The biggest agents get their own tile; the long tail shares one so labels stay legible.
      const { tiles: own, rest: tail } = usageTiles(filtered)
      const restValue = tail.reduce((sum, item) => sum + item.value, 0)
      // Squarified layout wants descending areas, so the shared tile takes its place by size.
      const tiles = [...own, ...(tail.length && restValue > 0 ? [{ id: 'rest', name: t('overview.usageRest', { count: tail.length }), value: restValue, area: restValue }] : [])]
        .sort((a, b) => b.area - a.area)
      const rects = overviewTreemap(tiles.map(tile => tile.area))
      const statusCount = status => new Set(usage.agents.filter(agent => agent.status === status).map(agent => agent.rowId)).size
      // One rank per agent, shared by tiles and rows, so a small unlabeled tile can be found below.
      const rank = new Map(usage.agents.map((agent, index) => [agent.id, index + 1]))
      // Collapsed, the list keeps the top 10 plus every running agent, in rank order.
      const listed = expanded ? filtered : filtered.filter((agent, index) => index < USAGE_LIST_TOP || agent.status === 'running')
      const max = Math.max(1, ...filtered.map(agent => agent.value))
      // Mark estimates per row only when they are mixed; when all are estimated the footer says so once.
      const mixed = usage.estimated > 0 && usage.estimated < new Set(usage.agents.map(agent => agent.rowId)).size
      const share = value => percent(usage.total ? value / usage.total : 0)
      const hotAgent = hot === undefined ? undefined : tiles.find(tile => tile.id === hot) ?? filtered.find(agent => agent.id === hot)
      const hover = id => ({ onMouseEnter: () => setHot(id), onMouseLeave: () => setHot(undefined), onFocus: () => setHot(id), onBlur: () => setHot(undefined) })
      const open = agent => (agent.address && openChild ? () => openChild(agent.address) : undefined)
      return h('section', { className: 'sah-usage' },
        h('div', { className: 'sah-usage-hero' },
          h('div', null,
            h('p', { className: 'sah-usage-label' }, t('overview.usageTitle')),
            h('p', { className: 'sah-usage-big' }, overviewCount(usage.total), h('span', null, ' token')),
            h('p', { className: 'sah-usage-sub' }, [t('overview.usageAgents', { count: usage.agents.length ? new Set(usage.agents.map(agent => agent.rowId)).size : 0 }),
              usage.requests ? t('overview.usageRequests', { count: usage.requests.toLocaleString() }) : undefined].filter(Boolean).join(' · ')),
            h('p', { className: 'sah-usage-sub' }, t('overview.usageIo', { input: overviewCount(usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens), output: overviewCount(usage.outputTokens) }))),
          h('div', { className: 'sah-usage-cache' },
            h('p', { className: 'sah-usage-label' }, t('overview.usageCache')),
            h('p', { className: 'sah-usage-mid' }, rate === undefined ? '—' : percent(rate)),
            h('span', { className: 'sah-overview-bar sah-usage-cache-bar', role: 'img', 'aria-label': rate === undefined ? '—' : percent(rate) },
              h('span', { style: { width: `${Math.round((rate ?? 0) * 100)}%` } })))),
        filtered.length === 0 ? h('div', { className: 'sah-usage-map-empty', role: 'status' }, t('overview.usageNoMatches'))
          : h('div', { className: 'sah-usage-map', role: 'group', 'aria-label': t('overview.usageMap') }, ...tiles.map((tile, index) => {
          const rect = rects[index]
          if (!rect) return null
          const color = colorOf.get(tile.routeKey) ?? '#8c8c94'
          const roomy = rect.px.w >= 72 && rect.px.h >= 40
          const numbered = !roomy && tile.id !== 'rest' && rect.px.w >= 22 && rect.px.h >= 18
          const radius = Math.max(2, Math.min(8, Math.min(rect.px.w, rect.px.h) / 4))
          const label = `${tile.name} · ${tile.value > 0 ? overviewCount(tile.value) : t('overview.usageNoneYet')}${tile.routeKey ? ` · ${nameOf.get(tile.routeKey)}` : ''}`
          const action = open(tile)
          return h(action ? 'button' : 'div', { key: tile.id, type: action ? 'button' : undefined, className: 'sah-usage-tile', title: label, 'aria-label': tile.status ? `${label} · ${t(`overview.usageState.${tile.status}`)}` : label, onClick: action,
            'data-status': tile.status,
            'data-hot': hot === tile.id ? '' : undefined, 'data-dim': hot !== undefined && hot !== tile.id ? '' : undefined, ...hover(tile.id),
            style: { left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%`, '--c': color } },
            h('span', { className: 'sah-usage-tile-inner', 'data-rest': tile.id === 'rest' ? '' : undefined, style: { borderRadius: radius, '--name-lines': rect.px.h >= 56 ? 2 : 1, ...(roomy ? {} : { padding: 0 }) } },
              roomy ? h('strong', null, tile.id === 'rest' ? tile.name : `${rank.get(tile.id)} ${tile.name}`) : null,
              roomy ? h('small', null, tile.value > 0 ? `${overviewCount(tile.value)} · ${share(tile.value)}` : t('overview.usageNoneYet')) : null,
              numbered ? h('b', null, rank.get(tile.id)) : null))
        })),
        h('p', { className: 'sah-usage-caption', 'aria-live': 'polite' }, hotAgent
          ? h(React.Fragment, null, h('i', { style: { background: colorOf.get(hotAgent.routeKey) ?? '#8c8c94' } }),
            h('span', null, hotAgent.id === 'rest' ? hotAgent.name : `${rank.get(hotAgent.id)}. ${hotAgent.name}`),
            h('b', null, `${overviewCount(hotAgent.value)} · ${share(hotAgent.value)}`))
          : h('span', { className: 'sah-overview-muted' }, t('overview.usageHover'))),
        h('p', { className: 'sah-overview-muted', style: { fontSize: 12 } }, t('overview.usageFilterHint')),
        h('div', { className: 'sah-usage-states', role: 'group', 'aria-label': t('overview.state') },
          ...['running', 'failed', 'done', 'idle', 'unknown'].filter(status => statusCount(status) > 0 || activeFilters.hiddenStatuses.includes(status)).map(status => {
            const visible = !activeFilters.hiddenStatuses.includes(status)
            const name = t(`overview.usageState.${status}`)
            return h('button', { type: 'button', key: status, 'data-status': status, 'aria-pressed': visible,
              title: t(visible ? 'overview.usageHide' : 'overview.usageShow', { name }), onClick: () => toggle('hiddenStatuses', status) },
            h('i', { 'aria-hidden': true }), name, h('b', null, statusCount(status)))
          })),
        h('div', { className: 'sah-usage-legend', role: 'group', 'aria-label': t('overview.model') }, ...usage.routes.map(item => {
          const visible = !activeFilters.hiddenRoutes.includes(item.key)
          return h('button', { type: 'button', key: item.key, 'aria-pressed': visible,
          title: `${item.provider} / ${item.model} · ${t(visible ? 'overview.usageHide' : 'overview.usageShow', { name: nameOf.get(item.key) })}`,
          onClick: () => toggle('hiddenRoutes', item.key) },
          h('i', { 'aria-hidden': true, style: { '--c': colorOf.get(item.key) } }),
          h('span', { className: 'sah-usage-model' }, nameOf.get(item.key)),
          (item.tags?.length || item.routeId === undefined) ? h('span', { className: 'sah-usage-tags' },
            ...(item.tags ?? []).slice(0, 3).map(tag => h('em', { key: tag }, tag)),
            item.routeId === undefined ? h('em', null, t('overview.usageUnrouted')) : null) : null,
          h('b', null, `${overviewCount(item.total)} · ${percent(item.share)}`))
        })),
        isFiltered ? h('div', { className: 'sah-usage-filter-summary' },
          h('p', { role: 'status' }, t('overview.usageFiltered', { shown: new Set(filtered.map(agent => agent.rowId)).size,
            total: new Set(usage.agents.map(agent => agent.rowId)).size,
            tokens: overviewCount(visibleTotal), share: share(visibleTotal) })),
          h('button', { type: 'button', onClick: reset }, t('overview.usageShowAll'))) : null,
        h('div', { className: 'sah-usage-list-head' }, h('h3', null, t('overview.usageList'))),
        h('ol', { className: 'sah-usage-list' }, ...listed.map(agent => {
          const action = open(agent)
          return h('li', { key: agent.id, 'data-status': agent.status, 'data-hot': hot === agent.id || (hot === 'rest' && !tiles.some(tile => tile.id === agent.id)) ? '' : undefined },
            h(action ? 'button' : 'div', { type: action ? 'button' : undefined, onClick: action, title: action ? `${agent.name} · ${t('overview.open')}` : agent.name, ...hover(agent.id) },
              h('small', null, rank.get(agent.id)),
              h('i', { style: { background: colorOf.get(agent.routeKey) } }),
              h('span', null, agent.status === 'running' ? h('u', { 'aria-label': t('overview.usageState.running') }) : null, agent.name,
                agent.status === 'failed' ? h('em', { className: 'sah-usage-failed' }, t('overview.usageFailedChip')) : null,
                mixed && agent.estimated ? h('em', { title: t('overview.usageApprox') }, '≈') : null),
              h('span', { className: 'sah-usage-track' }, h('span', { style: { width: `${Math.max(2, agent.value / max * 100)}%`, background: colorOf.get(agent.routeKey) } })),
              h('b', null, agent.value > 0 ? overviewCount(agent.value) : '—'),
              h('small', null, share(agent.value))))
        })),
        filtered.length > USAGE_LIST_TOP ? h('button', { type: 'button', className: 'sah-usage-more', onClick: () => setExpanded(value => !value) },
          t(expanded ? 'overview.usageLess' : 'overview.usageAll', { count: filtered.length })) : null,
        h('div', { className: 'sah-overview-foot' },
          usage.estimated ? h('p', null, t('overview.usageEstimated', { count: usage.estimated })) : null,
          usage.incomplete ? h('p', null, t('overview.usageIncomplete', { count: usage.incomplete })) : null,
          usage.missing ? h('p', null, t('overview.usageMissing', { count: usage.missing })) : null,
          h('p', null, t('overview.usageNote'))))
    }
    function OverviewAnalysis({ data, routes = [], agents = [], groups = [], t, openChild }) {
      const [opening, setOpening] = React.useState(undefined)
      const [navigationError, setNavigationError] = React.useState(undefined)
      const navigate = async row => {
        setOpening(row.id)
        setNavigationError(undefined)
        try { await openChild(row.address) }
        catch { setNavigationError(t('overview.navigationError')) }
        finally { setOpening(undefined) }
      }
      const analysis = overviewAnalytics(data.rows, routes, agents)
      const usage = analysis.usage
      const rate = overviewCacheRate(usage)
      const max = Math.max(1, ...analysis.roles.map(role => role.usage.total))
      const roleLabel = role => role.name || t(role.key === 'unassigned' ? 'overview.roleNone' : 'overview.roleUnknown')
      const countLabel = role => `${t('overview.retryCount')} ${role.retriesKnown ? role.retries : '—'}${role.retriesKnown < role.rows.length ? ` · ${t('overview.retryCoverage', { known: role.retriesKnown, total: role.rows.length })}` : ''}`
      const attentionLabel = row => row.activity?.approval ? t('overview.approval', { tool: row.activity.approval.tool })
        : row.stall ? (row.stall.kind === 'call' ? t('overview.stallCall', { tool: row.stall.tool, time: overviewSpan(row.stall.ms) }) : t('overview.stallQuiet', { time: overviewSpan(row.stall.ms) }))
        : t(`overview.${row.status}`)
      return h('section', { className: 'sah-analysis', 'aria-label': t('overview.analysisTitle') },
        navigationError ? h('p', { role: 'alert', className: 'sah-overview-error' }, navigationError) : null,
        h('div', { className: 'sah-analysis-section' },
          h('h3', null, t('overview.analysisTitle')),
          h('p', { className: 'sah-usage-sub' }, t('overview.analysisScope', { count: data.rows.length, depth: data.depth ?? 1 })),
          h('dl', { className: 'sah-analysis-metrics' },
            h('div', null, h('dt', null, t('overview.tokens')), h('dd', null, usage.routes.length ? overviewCount(usage.total) : '—')),
            h('div', null, h('dt', null, t('overview.usageCache')), h('dd', null, rate === undefined ? '—' : `${Math.round(rate * 100)}%`)),
            h('div', null, h('dt', null, t('overview.running')), h('dd', null, data.running)))),
        analysis.attention.length ? h('section', { className: 'sah-analysis-attention', 'aria-label': t('overview.needAttention', { count: analysis.attention.length }) },
          h('h3', null, `⚠ ${t('overview.needAttention', { count: analysis.attention.length })}`),
          h('ul', null, ...analysis.attention.map(row => h('li', { key: row.id },
            h('span', null, h('strong', null, row.path || row.name), ` · ${attentionLabel(row)}`),
            row.address && openChild ? h('button', { type: 'button', disabled: opening !== undefined, onClick: () => navigate(row) }, t('overview.reviewAgent')) : null)))) : null,
        !data.catalogAvailable ? h('p', { role: 'status', className: 'sah-overview-muted' }, t(data.readState === 'loading' ? 'overview.loading' : data.readState === 'migration-required' ? 'overview.migration' : 'overview.unavailable'))
          : data.rows.length === 0 ? h('p', { role: 'status', className: 'sah-overview-muted' }, t('overview.empty')) : null,
        analysis.roles.length ? h('section', { className: 'sah-analysis-section', 'aria-label': t('overview.roleChart') },
          h('h3', null, t('overview.roleChart')),
          h('ul', { className: 'sah-analysis-roles' }, ...analysis.roles.map(role => {
            const total = role.usage.total
            const known = role.rows.length - role.usage.missing
            const parts = [role.usage.uncachedInputTokens, role.usage.cacheReadTokens + role.usage.cacheWriteTokens, role.usage.outputTokens]
            return h('li', { key: role.key, className: 'sah-analysis-role' },
              h('div', { className: 'sah-analysis-role-head' }, h('strong', null, roleLabel(role)), h('span', null, known ? overviewCount(total) : t('overview.roleNoUsage'))),
              h('div', { className: 'sah-analysis-track', role: 'img', 'aria-label': `${roleLabel(role)} · ${parts.map((value, index) => `${t(['overview.inputBucket', 'overview.cacheBucket', 'overview.outputBucket'][index])} ${known ? overviewCount(value) : '—'}`).join(' · ')}` },
                h('div', { className: 'sah-analysis-stack', style: { width: `${total / max * 100}%` } },
                  ...parts.map((value, index) => h('span', { key: index, className: ['sah-analysis-input', 'sah-analysis-cache', 'sah-analysis-output'][index], style: { width: `${total ? value / total * 100 : 0}%` } })))),
              h('div', { className: 'sah-analysis-role-meta' }, h('span', null, t('overview.roleMembers', { count: role.rows.length })),
                h('span', null, countLabel(role)), known < role.rows.length ? h('span', null, t('overview.partialCount', { known, total: role.rows.length })) : null))
          })),
          h('div', { className: 'sah-analysis-legend', 'aria-hidden': true }, ...['overview.inputBucket', 'overview.cacheBucket', 'overview.outputBucket'].map((key, index) => h('span', { key }, h('i', { className: ['sah-analysis-input', 'sah-analysis-cache', 'sah-analysis-output'][index] }), t(key)))),
          h('p', { className: 'sah-overview-foot' }, t('overview.roleEvidence'))) : null,
        usage.routes.length ? h('section', { className: 'sah-analysis-section' }, h('h3', null, t('overview.analysisModels')),
          h('table', { className: 'sah-analysis-table' }, h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('overview.model')), h('th', { scope: 'col' }, 'Token'), h('th', { scope: 'col' }, t('overview.routeRequests')))),
            h('tbody', null, ...usage.routes.map(route => h('tr', { key: route.key },
              h('td', { title: `${route.provider} / ${route.model}` }, routeLabel(groups, route).value, h('small', null, route.routeId || t('overview.usageUnrouted'))),
              h('td', null, overviewCount(route.total), route.approximate ? h('small', null, '≈') : null), h('td', null, route.requestsKnown ? `${route.approximate ? '≥' : ''}${route.requests}` : '—')))))) : null,
        h('details', null, h('summary', null, `${t('overview.comparisons')}${analysis.comparisons.length ? ` (${analysis.comparisons.length})` : ''}`),
          h('p', { className: 'sah-overview-foot', style: { marginBlock: 8 } }, t('overview.comparisonNote')),
          analysis.comparisons.length ? h('ul', { className: 'sah-analysis-comparisons' }, ...analysis.comparisons.map((item, index) => h('li', { key: `${item.row.id}-${index}` },
            h('strong', null, item.row.path || item.row.name), h('p', null, t(`overview.${item.kind === 'effort' ? 'compareEffort' : item.kind === 'route' ? 'compareRoute' : 'compareRoleRoute'}`, item)),
            h('code', null, `${item.row.model.last.provider} / ${item.row.model.last.model}`),
            item.row.address && openChild ? h('button', { type: 'button', disabled: opening !== undefined, onClick: () => navigate(item.row) }, t('overview.reviewAgent')) : null)))
            : h('p', { className: 'sah-overview-muted' }, t('overview.noComparisons'))),
        h('div', { className: 'sah-overview-foot' },
          usage.missing ? h('p', null, t('overview.usageMissing', { count: usage.missing })) : null,
          usage.estimated ? h('p', null, t('overview.usageEstimated', { count: usage.estimated })) : null,
          usage.incomplete ? h('p', null, t('overview.usageIncomplete', { count: usage.incomplete })) : null,
          h('p', null, t('overview.usageNote'))))
    }
    function OverviewContent({ data, currentId, openChild, t, errors = [], groups = [], now = Date.now(), fresh = new Set(), routes = [], agents = [], initialTab = 'analysis' }) {
      const [tab, setTab] = React.useState(initialTab)
      const [filters, setFilters] = React.useState({ search: '', status: 'all' })
      const [usageFilters, setUsageFilters] = React.useState({ hiddenStatuses: [], hiddenRoutes: [] })
      const rows = overviewFilter(data.rows, filters, groups, fresh)
      const usage = overviewUsage(data.rows, routes)
      const issues = [...data.issues, ...errors]
      const count = status => overviewFilter(data.rows, { status }).length
      // The task board only exists for Agent Team work; an empty board is noise, not information.
      const tabs = ['analysis', 'members', ...(usage.routes.length ? ['usage'] : []), ...(data.teamAvailable && data.tasks.length > 0 ? ['tasks'] : []), 'diagnostics']
      const shown = tabs.includes(tab) ? tab : 'analysis'
      return h('div', { className: 'sah-overview-body' },
        issues.length ? h('p', { className: 'sah-overview-notice sah-overview-error', role: 'status' }, t('overview.stale')) : null,
        data.treeLimited ? h('p', { className: 'sah-overview-notice', role: 'status' }, t('overview.treeLimit')) : null,
        h('div', { className: 'sah-overview-tabs', role: 'group', 'aria-label': t('overview.title') },
          ...tabs.map(value => h('button', { type: 'button', key: value, 'aria-pressed': shown === value, onClick: () => setTab(value) },
            t(value === 'usage' ? 'overview.usageBreakdown' : `overview.${value}`),
            value === 'members' && data.rows.length ? h('span', { className: 'sah-overview-badge' }, data.rows.length) : null,
            value === 'tasks' && data.tasks.length ? h('span', { className: 'sah-overview-badge' }, data.tasks.length) : null,
            value === 'diagnostics' && issues.length ? h('span', { className: 'sah-overview-badge' }, issues.length) : null))),
        shown === 'analysis' ? h(OverviewAnalysis, { data, routes, agents, groups, t, openChild }) : shown === 'members' ? h(React.Fragment, null,
          data.rows.length >= FILTERS_FROM ? h(React.Fragment, null,
            h('input', { type: 'search', placeholder: t('overview.search'), 'aria-label': t('overview.search'), value: filters.search, onChange: event => setFilters(old => ({ ...old, search: event.target.value })) }),
            h('div', { className: 'sah-overview-filters', role: 'group', 'aria-label': t('overview.state') },
              ...['all', 'running', 'attention', 'settled'].map(value => h('button', { type: 'button', key: value, 'aria-pressed': filters.status === value, onClick: () => setFilters(old => ({ ...old, status: value })) },
                t(`overview.${value}`), value === 'all' ? null : h('span', { className: 'sah-overview-badge' }, count(value)))))) : null,
          !data.catalogAvailable ? h('p', { role: 'status', className: 'sah-overview-muted' }, t(data.readState === 'loading' ? 'overview.loading' : data.readState === 'migration-required' ? 'overview.migration' : 'overview.unavailable')) : null,
          rows.length ? h('ul', { className: 'sah-overview-list' }, ...rows.map(row => h(OverviewMember, { key: row.id, row, currentId, openChild, t, groups, now, fresh: fresh.has(row.id) })))
            : data.rows.length || data.catalogAvailable ? h('p', { role: 'status', className: 'sah-overview-muted' }, t(data.rows.length ? 'overview.noMatches' : 'overview.empty')) : null)
          : shown === 'usage' ? h(OverviewUsage, { usage, groups, t, openChild, filters: usageFilters, onFiltersChange: setUsageFilters })
          : shown === 'tasks' ? h(OverviewTasks, { tasks: data.tasks, teamAvailable: data.teamAvailable, rows: data.rows, openChild, t })
            : h('section', { className: 'sah-overview-section' }, h('h3', null, t('overview.diagnostics')),
              issues.length ? h('ul', null, ...issues.map((issue, index) => h('li', { key: index }, h('code', null, issue.id), ': ', issue.message))) : h('p', { className: 'sah-overview-muted' }, t('overview.healthy')),
              h('h3', null, t('overview.rejections')),
              !data.dispatch ? h('p', { className: 'sah-overview-muted' }, t('overview.noHistory')) : data.dispatch.records.length
                ? h(React.Fragment, null,
                  h('p', { className: 'sah-overview-muted' }, t('overview.historyCount', { shown: data.dispatch.records.length, total: data.dispatch.total })),
                  h('ul', { className: 'sah-overview-list' }, ...[...data.dispatch.records].reverse().map(record => h('li', { key: record.seq, className: 'sah-overview-card' },
                    h('h3', null, record.tool), h('p', { className: 'sah-overview-muted' }, `${new Date(record.time).toLocaleString()} · #${record.seq}`),
                    h('p', null, record.reason), h('code', null, record.callId)))))
                : h('p', { className: 'sah-overview-muted' }, t('overview.noRejections')),
              h('div', { className: 'sah-overview-foot' },
                h('p', null, t('overview.monitorNote')),
                h('p', null, t('overview.tokenNote', { known: data.tokenKnown, total: data.rows.length })),
                h('p', null, t('overview.durationNote')),
                data.teamAvailable ? h('p', null, t('overview.inactiveNote')) : null,
                h('p', null, t('overview.coverage')))))
    }
    /** Derived visibility only: the official useTabInfo hook owns every tab's lifetime. */
    function createOverviewVisibility() {
      const views = new Map()
      const listeners = new Set()
      let snapshot = new Set()
      const publish = () => {
        const next = new Set(views.keys())
        if (next.size === snapshot.size && [...next].every(id => snapshot.has(id))) return
        snapshot = next
        for (const listener of listeners) listener()
      }
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        enter(rootId) {
          const token = Symbol()
          const entries = views.get(rootId) ?? new Set()
          entries.add(token)
          views.set(rootId, entries)
          publish()
          return () => {
            entries.delete(token)
            if (entries.size === 0 && views.get(rootId) === entries) views.delete(rootId)
            publish()
          }
        },
      }
    }
    /** Per-conversation "seen up to" time; the first visit starts now so old history is not news. */
    function readSeen(rootId) {
      try {
        const stored = Number(globalThis.localStorage?.getItem(SEEN_KEY + rootId))
        if (Number.isFinite(stored) && stored > 0) return stored
      } catch {}
      return writeSeen(rootId, Date.now())
    }
    function writeSeen(rootId, time) {
      try { globalThis.localStorage?.setItem(SEEN_KEY + rootId, String(time)) } catch {}
      return time
    }
    function useAgentOverview({ sessionId, useSession, useSessions, useSessionStatus, sessions, openSession, names, remote, t, routes = [], visibility, tab }) {
      const directParent = useSession(value => value.subagent?.address.parentSessionId)
      const state = useSessions(value => value)
      const rootId = overviewRoot(sessionId, directParent, state)
      const statuses = useSessionStatus(value => value)
      const catalog = useSnapshot(names, NO_CATALOG)
      const shown = useSnapshot(visibility, EMPTY_VISIBILITY)
      const open = tab === undefined ? shown.has(rootId) : tab.visible
      const [now, setNow] = React.useState(Date.now)
      const [busy, setBusy] = React.useState(false)
      const [errors, setErrors] = React.useState([])
      const generation = React.useRef(0)
      const data = overviewData(rootId, state, statuses, now)
      // "New" = a report or finished turn after the last time the panel was looked at. Status
      // pushes arrive while closed even when digests are stale, so a running → stopped transition
      // observed meanwhile also counts.
      const [seen, setSeen] = React.useState(() => readSeen(rootId))
      const [settled, setSettled] = React.useState(() => new Set())
      const [highlight, setHighlight] = React.useState(() => new Set())
      const wasRunning = React.useRef(new Set())
      React.useEffect(() => { setSeen(readSeen(rootId)); setSettled(new Set()); setHighlight(new Set()); wasRunning.current = new Set() }, [rootId])
      const runningNow = data.rows.filter(row => row.status === 'running').map(row => row.id)
      React.useEffect(() => {
        const stopped = [...wasRunning.current].filter(id => !runningNow.includes(id))
        wasRunning.current = new Set(runningNow)
        if (!open && stopped.length) setSettled(old => new Set([...old, ...stopped]))
      }, [runningNow.join('\n'), open])
      const fresh = open ? highlight : overviewFresh(data.rows, seen, settled)
      const markSeen = React.useCallback(() => { setSeen(writeSeen(rootId, Date.now())); setSettled(new Set()) }, [rootId])
      React.useEffect(() => {
        if (tab?.visible) return visibility?.enter(rootId)
      }, [visibility, rootId, tab?.id, tab?.visible])
      React.useEffect(() => {
        if (!open) return
        setHighlight(overviewFresh(data.rows, seen, settled))
        setNow(Date.now())
        markSeen()
        return markSeen
      }, [open, markSeen])
      const refresh = React.useCallback(async () => {
        const run = ++generation.current
        const cancelled = () => generation.current !== run
        setBusy(true)
        setErrors([])
        // Each successful parent read discovers its descendants in the same bounded refresh.
        const failures = await refreshOverview(sessions, rootId, [], cancelled)
        if (!cancelled()) { setErrors(failures); setBusy(false) }
      }, [sessions, rootId])
      React.useEffect(() => {
        if (tab === undefined || !open) return
        refresh()
        return () => { generation.current++ }
      }, [open, refresh, tab?.id])
      // Closed: keep the trigger honest about stalls and new results at a gentler pace.
      const backgroundIds = data.rows.filter(row => row.address && row.status === 'running').map(row => row.id).join('\n')
      React.useEffect(() => {
        if (tab !== undefined || open || backgroundIds === '') return
        let stopped = false
        const timer = setInterval(() => {
          setNow(Date.now())
          if (!stopped) refreshOverview(sessions, rootId, backgroundIds.split('\n'), () => stopped).catch(() => {})
        }, BACKGROUND_REFRESH_MS)
        return () => { stopped = true; clearInterval(timer) }
      }, [open, tab?.id, backgroundIds, sessions, rootId])
      // Live while open: tick elapsed times every second, re-read running agents every few.
      const runningIds = data.rows.filter(row => row.status === 'running' || row.status === 'provisioning').map(row => row.id).join('\n')
      React.useEffect(() => {
        if (tab === undefined || !open || runningIds === '') return
        const tick = setInterval(() => setNow(Date.now()), 1000)
        let stopped = false
        const poll = setInterval(() => {
          if (!stopped) refreshOverview(sessions, rootId, runningIds.split('\n'), () => stopped).catch(() => {})
        }, LIVE_REFRESH_MS)
        return () => { stopped = true; clearInterval(tick); clearInterval(poll) }
      }, [open, tab?.id, runningIds, sessions, rootId])
      // Names come from the same Host catalog the configuration page reads, once per runtime.
      React.useEffect(() => {
        if (tab !== undefined && open) loadModelNames(names, remote)
      }, [open, tab?.id, names, remote])
      const openChild = async address => {
        try { await openSession(address) }
        catch (error) { setErrors(old => [...old, { id: address.childSessionId, message: String(error?.message ?? error) }]) }
      }
      const live = data.running > 0
      // One number everywhere: the usage tab's total, which also covers per-route digests.
      const usageTotal = open ? overviewUsage(data.rows, routes).total : 0
      const hint = t('overview.triggerHint', { running: data.running, total: data.rows.length })
        + (data.attention ? ` · ${t('overview.triggerAttention', { count: data.attention })}` : '')
        + (!open && fresh.size ? ` · ${t('overview.triggerFresh', { count: fresh.size })}` : '')
      return { rootId, data, catalog, now, busy, errors, fresh, refresh, openChild, live, usageTotal, hint, open }
    }

    /** A small header entry; navigation and layout belong to the official sidebar. */
    function AgentOverview(props) {
      const { t, openOverview } = props
      const { data, fresh, live, hint, open } = useAgentOverview(props)
      return h(React.Fragment, null, h('style', null, OVERVIEW_CSS),
        h('button', { type: 'button', className: 'sah-overview-trigger', 'aria-expanded': open,
          'data-live': live ? 'true' : undefined, 'data-attention': data.attention ? 'true' : undefined,
          'aria-label': hint, title: `${hint} · ${t('overview.sidebarHint')}`, onClick: openOverview },
          live || data.attention
            ? h('span', { className: 'sah-overview-dot', 'data-state': live ? 'running' : 'inactive', 'data-attention': data.attention ? 'true' : undefined, 'aria-hidden': true })
            : h('span', { className: 'sah-overview-trigger-icon', 'aria-hidden': true }, glyph('IconBrowseOutlineRegular',
              h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
                h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1.5 }), h('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1.5 }),
                h('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1.5 }), h('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1.5 })))),
          h('span', { className: 'sah-overview-trigger-label' }, t('overview.title')),
          data.rows.length ? h('span', { className: 'sah-overview-trigger-count', 'aria-hidden': true }, `${data.running}/${data.rows.length}`) : null,
          !open && fresh.size ? h('span', { className: 'sah-overview-trigger-fresh', 'aria-hidden': true }, fresh.size) : null))
    }

    /** Body of the native tab: no window geometry, popover or duplicate close controls. */
    function OverviewPanel(props) {
      const { t } = props
      const { rootId, data, catalog, now, busy, errors, fresh, refresh, openChild, usageTotal } = useAgentOverview(props)
      return h('section', { className: 'sah-overview', 'aria-label': t('overview.title') },
        h('style', null, OVERVIEW_CSS),
        h('div', { className: 'sah-overview-head' },
          h('p', { className: 'sah-overview-summary', role: 'status' }, data.running || data.attention
            ? t('overview.summary', { running: data.running, attention: data.attention, total: data.rows.length })
            : t('overview.summaryQuiet', { total: data.rows.length }),
            usageTotal ? ` · ${t('overview.tokens')} ${overviewCount(usageTotal)}` : ''),
          h('button', { type: 'button', disabled: busy, onClick: refresh }, t(busy ? 'overview.refreshing' : 'overview.refresh'))),
        h(OverviewContent, { key: rootId, data, currentId: props.sessionId, openChild, t, errors, groups: catalog.groups, now, fresh, routes: props.routes, agents: props.agents }))
    }

    function OverviewSidebar(props) {
      const { tab } = props.useTabInfo()
      return h(OverviewGate, { ...props, tab })
    }
    function OverviewGate({ overviewForm, ...props }) {
      const [snapshot, setSnapshot] = React.useState(() => overviewForm?.getSnapshot())
      React.useEffect(() => {
        const update = () => setSnapshot(overviewForm?.getSnapshot())
        const dispose = overviewForm?.subscribe(update)
        update()
        return dispose
      }, [overviewForm])
      return snapshot?.status === 'ready' && snapshot.value?.showAgentOverview === true
        ? h(props.tab === undefined ? AgentOverview : OverviewPanel, { ...props, routes: Array.isArray(snapshot.value.routes) ? snapshot.value.routes : [], agents: Array.isArray(snapshot.value.agents) ? snapshot.value.agents : [] })
        : props.tab === undefined ? null : h('p', { style: { padding: 16 }, role: 'status' }, props.t('overview.disabled'))
    }
    function registerOverview(ctx, t, names = createModelNames()) {
      ctx.inject(['sessions', 'uiWorkspace', 'sidebarRight', 'sidebarRightTabs'], scope => {
        const visibility = createOverviewVisibility()
        const shared = () => ({ sessions: scope.sessions, openSession: address => scope.uiWorkspace.openSession(address),
          overviewForm: ctx.configForms.get(ENTRY_ID), names, remote: ctx.remote, visibility })
        scope.effect(() => scope.sidebarRightTabs.register({
          id: OVERVIEW_KIND, kind: OVERVIEW_KIND, title: () => t('overview.title'),
          guide: [{ id: 'overview', order: 40, title: () => t('overview.title'), description: () => t('overview.sidebarHint') }],
        }))
        scope.effect(() => scope.slots.inject(OVERVIEW_BODY_SLOT, () => scope.slots.register({
          name: OVERVIEW_BODY_SLOT, key: OVERVIEW_KIND, locale: NS, inject: shared,
        }, props => h(OverviewSidebar, { ...props, t: props.t ?? t }))))
        scope.effect(() => scope.slots.inject(OVERVIEW_SLOT, () => scope.slots.register({
          name: OVERVIEW_SLOT, id: 'subagent-hub-overview', order: -15, locale: NS,
          inject: sessionId => ({ ...shared(), openOverview: () => scope.sidebarRight.openTabIn(sessionId, OVERVIEW_KIND) }),
        }, props => h(OverviewGate, { ...props, t: props.t ?? t }))))
      })
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'subagent-hub: dictionaries')
      const t = ctx.locale.bind(NS)
      // One catalog read serves the badge and the overview: both label the same recorded routes.
      const names = createModelNames()
      registerModelBadge(ctx, t, names)
      registerOverview(ctx, t, names)
      // The same form is reachable from the Plugins page row and from a top-level
      // Settings section, which is where people expect plugin configuration.
      ctx.effect(() => ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: ROW_CONFIG_KEY,
        locale: NS,
      }, props => h(ConfigPage, { ...props, t: props.t ?? t, ctx })))), 'subagent-hub: row config page')
      ctx.effect(() => ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: ENTRY_ID,
        order: 30,
        label: () => t('nav'),
        locale: NS,
      }, props => h(SectionPage, { ...props, ctx, t: props.t ?? t })))), 'subagent-hub: settings section')
    }

    return {
      inject: ['slots', 'locale', 'configForms', 'remote', 'remote.session', 'remote.agentPresets'],
      apply,
      // Pure helpers, exported for tests only.
      AgentOverview, OverviewPanel, OverviewSidebar, OverviewGate, OverviewContent, OverviewMember, OverviewTasks, taskBoardState, taskBoardOwnerKey, taskBoardFilter, taskBoardOwner, taskBoardDependencies, overviewData, overviewFilter,
      overviewDuration, overviewTokens, overviewTime, overviewRoot, overviewAnalytics, OverviewAnalysis, OVERVIEW_LIMIT, refreshOverview, registerOverview, OVERVIEW_SLOT, OVERVIEW_KIND, OVERVIEW_BODY_SLOT, createOverviewVisibility,
      overviewSpan, overviewCount, ATTENTION_WINDOW_MS, overviewTreemap, usageTiles, usageStatus, usageVisible, STALL_MS, LONG_CALL_MS, overviewStall, overviewNews, overviewFresh, overviewUsage, overviewCacheRate, OverviewUsage, overviewPlan, overviewVoice, ACTIVITY_PROJECTION,
      overviewLocales: { en, zh }, OVERVIEW_CSS,
      ModelBadge,
      modelBadgeData,
      modelBadgeShares,
      registerModelBadge,
      MODEL_BADGE_SLOT,
      ConfigPage,
      SectionPage,
      RouteCard,
      settingsRouteRows,
      moveSettingsRow,
      AgentCard, AgentEditor, RoleAccordion, roleName, CONFIGURATION_PRESET_ID,
      providerChoices,
      modelChoices,
      effortChoices,
      draftsOf,
      valuesOf,
      saveOps,
      draftProblem,
      presetAllowlistProblems,
      catalogPreview,
      officialAllowlists,
      officialSyncReady,
      officialSyncGap,
      readOfficialSyncState,
      observeOfficialSync,
      allowlistSynced,
      slugForModel,
      uniqueRouteId,
      filterCatalog,
      addTag,
      removeTag,
      knownTags,
      AGENT_TEMPLATES,
      fieldProblems,
      editorDraftsOf,
      sameDraft,
      changeRoute,
      restoreDeletion,
      renameRouteRefs,
      dropRouteRefs,
      insertAt,
      modelOptionValue,
      parseModelValue,
      modelGroups,
      effortsOf,
      modelIdTail,
      routeModelName,
      routeLabel,
      createModelNames,
      loadModelNames,
      NO_CATALOG,
      NS,
      ROW_CONFIG_KEY,
      ENTRY_ID,
    }
  },
})
