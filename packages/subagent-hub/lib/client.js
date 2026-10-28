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
    /** Bound read-only confirmation; a network request may never settle. */
    const SYNC_TIMEOUT_MS = 15000
    const SYNC_POLL_MS = 1500

    const zh = {
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
      'agents.routesLabel': '允许使用的模型',
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
      'save.conflict': '配置已在其他页面更新，已同步最新版本，修改仍保留。再次保存会用当前内容覆盖。',
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
      'save.conflict': 'Configuration changed in another page. The latest version is loaded and your edits are kept; saving again overwrites it with this page.',
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

    // ── pure helpers ────────────────────────────────────────────────────────────────────────────

    const hasRouteContent = route => Boolean(route.id || route.provider || route.model || route.reasoningEffort || route.note || route.tags.length > 0)
    const hasAgentContent = agent => Boolean(agent.id || agent.description || agent.instructions || agent.routes.length > 0 || agent.needs.length > 0 || agent.basePreset !== 'standard')
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

    /** Check only public, observable state: the preset roster and model settings. */
    function officialSyncReady(values, presetState, modelState) {
      if (presetState?.status !== 'ready' || !Array.isArray(presetState.value?.presets)) return false
      const expected = values.agents.map(agent => `hub-agent-${agent.id}`).sort()
      const presets = presetState.value.presets.filter(preset => preset.id.startsWith('hub-agent-'))
      if (presets.some(preset => preset.broken !== undefined)) return false
      if (JSON.stringify(presets.map(preset => preset.id).sort()) !== JSON.stringify(expected)) return false
      if (values.routes.length === 0) return true
      if (modelState?.status !== 'ready' || modelState.value?.enabled !== true) return false
      const pairs = routes => [...new Set(routes.map(route => routeKey(route.provider, route.model)))].sort()
      return JSON.stringify(pairs(values.routes)) === JSON.stringify(pairs(modelState.value.allowedModels ?? []))
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
      const finish = state => {
        if (finished) return
        finished = true
        clearTimer(pollTimer)
        clearTimer(deadlineTimer)
        onState(state)
      }
      const schedule = () => {
        if (!finished) pollTimer = setTimer(poll, intervalMs)
      }
      const poll = () => {
        if (finished) return
        Promise.resolve().then(readState).then(state => {
          if (finished) return
          if (officialSyncReady(values, state.presets, state.models)) finish('complete')
          else schedule()
        }, schedule).catch(schedule)
      }
      deadlineTimer = setTimer(() => finish('pending'), timeoutMs)
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
`

    const style = () => h('style', { key: 'css' }, CSS)
    /** An official icon when the shell supplies one, otherwise a text glyph. */
    const glyph = (name, fallback, size = 14) => (P[name] === undefined ? fallback : h(P[name], { size }))

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
    function RouteCard({ route, index, total, groups, catalogReady = true, known, problems = {}, onChange, onRemove, onMove, disabled, t }) {
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
      return h('div', { className: 'sah-route-card' },
        h('div', { className: `sah-route-main${efforts.length > 0 ? '' : ' sah-route-main-solo'}` },
          h('span', { className: 'sah-order' }, String(index + 1)),
          h(Field, { label: t('route.model'), error: errorText('model') },
            h(GroupedSelect, {
              value: modelOptionValue(route.provider, route.model),
              disabled,
              placeholder: t('route.pickModel'),
              groups: modelGroups(groups, route.provider, route.model, missing),
              onChange: pickModel,
            })),
          efforts.length > 0
            ? h(Field, { label: t('route.effort') },
              h(Select, {
                value: route.reasoningEffort,
                disabled,
                options: [{ value: '', label: t('route.effortDefault') }, ...efforts],
                onChange: value => set({ reasoningEffort: value }),
              }))
            : null,
          h('div', { className: 'sah-row-actions' },
            h(IconButton, { title: t('route.moveUp'), disabled: disabled || index === 0, onClick: () => onMove(index, -1) }, glyph('IconChevronUpOutlineRegular', '↑')),
            h(IconButton, { title: t('route.moveDown'), disabled: disabled || index === total - 1, onClick: () => onMove(index, 1) }, glyph('IconChevronDownOutlineRegular', '↓')),
            h(IconButton, { title: t('route.remove'), danger: true, disabled, onClick: onRemove }, glyph('IconTrashOutlineRegular', '×')))),
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

    // ── page ─────────────────────────────────────────────────────────────────────────────────────

    /** Settings-section page sharing the row form; the namespace is served only with a profile. */
    function SectionPage({ ctx, t }) {
      const form = React.useMemo(() => ctx.configForms.get(ENTRY_ID), [ctx])
      const [snapshot, setSnapshot] = React.useState(() => form.getSnapshot())
      React.useEffect(() => form.subscribe(() => setSnapshot(form.getSnapshot())), [form])
      const view = snapshot.status === 'unavailable'
        ? undefined
        : { state: snapshot, mutate: (ops, revision) => form.mutate(ops, revision) }
      return h(ConfigPage, { view: 'page', form: view, t, ctx })
    }

    /** The page itself: general settings, model routes, named agents, preview, save bar. */
    function ConfigPage({ view = 'page', form, t, ctx = {} }) {
      const value = form?.state?.value ?? {}
      const initial = React.useMemo(() => editorDraftsOf(value), [])
      const [draft, setDraft] = React.useState(initial)
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
      const writable = form !== undefined && form.state?.status !== 'loading' && form.state?.writable !== false
      const hydrated = React.useRef(form?.state?.status !== 'loading')
      // The schema-resolved section lists every field the running Host knows, defaults included.
      const overviewSupported = Object.prototype.hasOwnProperty.call(value, 'showAgentOverview')
      const latestRevision = React.useRef(form?.state?.revision)
      latestRevision.current = form?.state?.revision
      const disposed = React.useRef(false)
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
        setDraft(editorDraftsOf(form.state.value))
        setBaseline(draftsOf(form.state.value))
      }, [form?.state?.status, form?.state?.revision])

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
            const list = (response.value?.presets ?? []).filter(preset => preset.broken === undefined && !String(preset.id).startsWith('hub-agent-'))
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
          onState: state => {
            if (disposed.current) return
            if (state === 'checking') setStatus({ kind: 'busy', text: t('syncing') })
            else if (state === 'complete') setStatus({ kind: 'ok', text: t(savedValues.routes.length > 0 ? 'synced' : 'syncRosterReady') })
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
      const moveRoute = (index, delta) => setDraft((current) => {
        const routes = [...current.routes]
        const target = index + delta
        if (target < 0 || target >= routes.length) return current
        const [row] = routes.splice(index, 1)
        routes.splice(target, 0, row)
        return { ...current, routes }
      })
      const addRoute = () => setDraft(current => ({ ...current, routes: [...current.routes, { _key: rowKey(), _referenceId: '', id: '', provider: '', model: '', reasoningEffort: '', tags: [], note: '' }] }))
      const updateAgent = (index, agent) => setDraft(current => ({ ...current, agents: current.agents.map((item, at) => at === index ? agent : item) }))
      const removeAgent = index => {
        const item = draft.agents[index]
        if (item === undefined) return
        setUndo({ kind: 'agent', index, item })
        setDraft(current => ({ ...current, agents: current.agents.filter((_, at) => at !== index) }))
      }
      /** Add a named agent from a template; the new card opens expanded. */
      const addAgent = template => {
        const source = template ?? { id: '', description: '', instructions: '' }
        const taken = new Set(draft.agents.map(agent => agent.id))
        const id = source.id === '' ? '' : uniqueRouteId(source.id, taken)
        setDraft(current => ({
          ...current,
          agents: [...current.agents, {
            _key: rowKey(), _fresh: true,
            id,
            description: source.description === undefined ? '' : t(source.description),
            instructions: source.instructions === undefined ? '' : t(source.instructions),
            routes: [],
            needs: [],
            basePreset: 'standard',
          }],
        }))
      }
      /** Put the last deleted route or agent back where it was. */
      const undoLast = () => {
        if (undo === undefined) return
        const entry = undo
        setUndo(undefined)
        setDraft(current => restoreDeletion(current, entry))
      }

      const save = async () => {
        if (!writable || saving.current) return
        setSubmitted(true)
        if (problem !== undefined) {
          setStatus({ kind: 'error', text: t('invalid.fields') })
          requestAnimationFrame(() => rootRef.current?.querySelector('[aria-invalid="true"]')?.focus())
          return
        }
        saving.current = true
        setBusy(true)
        stopSync.current()
        try {
          const revision = form.state?.revision
          const applied = await form.mutate(saveOps(values, overviewSupported), revision)
          if (applied !== true) {
            // A refused write reloads Host state; a moved revision means another editor won.
            await new Promise(resolve => setTimeout(resolve, 0))
            const conflict = latestRevision.current !== undefined && latestRevision.current !== revision
            setStatus({ kind: 'error', text: t(conflict ? 'save.conflict' : 'save.refused') })
            return
          }
          setBaseline(draftsOf(values))
          setDraft(editorDraftsOf(values))
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
        setDraft(editorDraftsOf(baseline))
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
            : null

      return h('div', { className: 'sah', ref: rootRef, tabIndex: -1, onKeyDown },
        style(),
        form === undefined ? h('p', { className: 'sah-notice sah-notice-error' }, t('unavailable'))
          : !writable ? h('p', { className: 'sah-notice' }, t('common.readOnly')) : null,
        h('div', { className: 'sah-hero' },
          h('p', { className: 'sah-intro' }, t('intro')),
          h('div', { className: 'sah-summary' },
            h('span', { className: 'sah-badge' }, t('badge.routes', { count: draft.routes.length })),
            h('span', { className: 'sah-badge' }, t('badge.agents', { count: draft.agents.length })),
            h('span', { className: 'sah-badge' }, maxConcurrent === 0 ? t('badge.unlimited') : t('badge.concurrency', { count: maxConcurrent })),
            h('span', { className: `sah-badge${draft.manageOfficialSettings ? ' sah-badge-on' : ''}` },
              h('span', { className: 'sah-badge-dot' }),
              t('badge.managed', { state: draft.manageOfficialSettings ? t('badge.on') : t('badge.off') })))),
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
          : h('div', { className: 'sah-list' }, draft.routes.map((route, index) => h(RouteCard, {
            key: route._key,
            route,
            index,
            total: draft.routes.length,
            groups: catalog.groups,
            catalogReady: catalog.status === 'ready',
            known,
            problems,
            disabled: locked,
            t,
            onChange: next => updateRoute(index, next),
            onRemove: () => removeRoute(index),
            onMove: moveRoute,
          })))),
        h(Panel, {
          icon: glyph('IconUsersOutlineRegular', null),
          title: t('agents.title'),
          hint: t('agents.hint'),
        },
        allowlistProblems.length === 0 ? null : h('div', { className: 'sah-notice sah-notice-warn', role: 'status' },
          h('div', null,
            h('strong', null, t('agents.allowlist.title')),
            h('ul', { className: 'sah-notice-list' }, allowlistProblems.map(problem => h('li', { key: problem.presetId },
              t('agents.allowlist.item', {
                agent: problem.agentId,
                routes: problem.outside.join(', '),
                allowed: problem.allowed.join(', '),
              })))),
            h('span', null, t('agents.allowlist.hint')))),
        draft.agents.length === 0
          ? h('div', { className: 'sah-empty' },
            h('span', null, t('agents.none')),
            templateRow)
          : h(React.Fragment, null,
            templateRow,
            h('div', { className: 'sah-list' }, draft.agents.map((agent, index) => h(AgentCard, {
              key: agent._key,
              agent,
              index,
              routes: draft.routes,
              presets,
              known,
              problems,
              disabled: locked,
              defaultOpen: agent._fresh === true,
              forceOpen: submitted && Object.keys(problems).some(key => key.startsWith(`agent:${index}:`)),
              t,
              onChange: next => updateAgent(index, next),
              onRemove: () => removeAgent(index),
            }))))),
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
        copyError ? h('p', { className: 'sah-notice sah-notice-error', role: 'status' }, t('preview.copyFailed')) : null,
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
        if (data.kind === 'recorded') names?.load(remote)
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
    const OVERVIEW_SLOT = 'conversation.session.header.actions'
    Object.assign(en, {
      'overview.setting': 'Show agent overview',
      'overview.settingHint': 'Off by default. Adds the Hub overview to the session header after saving; the official Agent Team UI is always available.',
      'overview.triggerHint': 'Agent overview · {running} running / {total} total',
      'overview.title': 'Agent overview', 'overview.close': 'Close', 'overview.refresh': 'Refresh',
      'overview.refreshing': 'Refreshing…', 'overview.search': 'Search name, model or session ID',
      'overview.all': 'All', 'overview.team': 'Team', 'overview.independent': 'Independent',
      'overview.running': 'Running', 'overview.inactive': 'Inactive', 'overview.completed': 'Completed',
      'overview.interrupted': 'Interrupted', 'overview.provisioning': 'Provisioning', 'overview.failed': 'Failed',
      'overview.unknown': 'Unconfirmed', 'overview.members': 'Members', 'overview.tasks': 'Task board',
      'overview.diagnostics': 'Diagnostics', 'overview.empty': 'No child agents in this session.',
      'overview.noMatches': 'No matching members. Clear the filters to see all members.',
      'overview.loading': 'Loading the child catalog…', 'overview.unavailable': 'The child catalog is unavailable.',
      'overview.migration': 'Open this conversation in DSH to migrate its history.',
      'overview.stale': 'Some data could not be refreshed. Displayed records may be outdated.',
      'overview.open': 'Open conversation', 'overview.noNavigation': 'This child mode cannot be opened here.',
      'overview.details': 'Evidence and details', 'overview.model': 'Last request', 'overview.next': 'Planned next request',
      'overview.noRequest': 'No request recorded', 'overview.noModel': 'Request model unconfirmed',
      'overview.duration': 'Active time', 'overview.tokens': 'Recorded tokens', 'overview.created': 'Created',
      'overview.kind': 'Type', 'overview.state': 'State', 'overview.sort': 'Sort',
      'overview.priority': 'Activity first', 'overview.newest': 'Newest first', 'overview.name': 'Name',
      'overview.timeSort': 'Active time', 'overview.tokenSort': 'Recorded tokens',
      'overview.inactiveNote': 'Inactive Team members are available for another turn. Only the task board records task completion.',
      'overview.tokenNote': 'Token totals cover {known} of {total} members; missing records are not zero. No price estimate.',
      'overview.durationNote': 'Active time sums agent turns, excluding time between turns. Interrupted open turns stop at the last recorded event.',
      'overview.owner': 'Owner', 'overview.unowned': 'Unassigned', 'overview.dependencies': 'Dependencies',
      'overview.scopes': 'Write scopes', 'overview.pending': 'Pending', 'overview.in_progress': 'In progress',
      'overview.ready': 'Ready', 'overview.blocked': 'Blocked', 'overview.noTasks': 'No shared tasks recorded.',
      'overview.noTeam': 'Team projection unavailable; Team may be disabled.',
      'overview.healthy': 'No projection errors reported.',
      'overview.coverage': 'Hub guard rejections reconstructed from committed tool results. This is not a log of every tool failure.',
      'overview.rejections': 'Dispatch rejections', 'overview.noRejections': 'No Hub guard rejections recorded.',
      'overview.noHistory': 'Rejection projection unavailable. Inspect tool results in the parent conversation.',
      'overview.historyCount': 'Showing the latest {shown} of {total} recorded rejections.',
      'overview.reset': 'Clear filters', 'overview.current': 'Current conversation', 'overview.lead': 'Lead',
    })
    Object.assign(zh, {
      'overview.setting': '显示子智能体总览',
      'overview.settingHint': '默认关闭。保存后在会话标题栏显示 Hub 总览入口；官方的智能体团队界面始终可用。',
      'overview.triggerHint': '子智能体总览 · {running} 个运行中 / 共 {total} 个',
      'overview.title': '子智能体总览', 'overview.close': '关闭', 'overview.refresh': '刷新',
      'overview.refreshing': '刷新中…', 'overview.search': '搜索名称、模型或会话 ID',
      'overview.all': '全部', 'overview.team': 'Team 成员', 'overview.independent': '独立子任务',
      'overview.running': '运行中', 'overview.inactive': '空闲', 'overview.completed': '已完成',
      'overview.interrupted': '已中断', 'overview.provisioning': '创建中', 'overview.failed': '创建失败',
      'overview.unknown': '未确认', 'overview.members': '成员', 'overview.tasks': '共享任务板',
      'overview.diagnostics': '诊断', 'overview.empty': '这个会话还没有子智能体。',
      'overview.noMatches': '没有匹配的成员。清除筛选可查看全部成员。',
      'overview.loading': '正在加载子任务目录…', 'overview.unavailable': '暂时无法获取子任务目录。',
      'overview.migration': '请在 DSH 中打开此会话以迁移历史记录。',
      'overview.stale': '部分数据刷新失败，当前显示的记录可能不是最新状态。',
      'overview.open': '打开会话', 'overview.noNavigation': '此类子任务暂不支持从这里打开。',
      'overview.details': '证据与详情', 'overview.model': '最近一次请求', 'overview.next': '下次请求计划',
      'overview.noRequest': '尚无请求记录', 'overview.noModel': '请求模型未确认',
      'overview.duration': '累计执行', 'overview.tokens': '已记录 Token', 'overview.created': '创建时间',
      'overview.kind': '类型', 'overview.state': '状态', 'overview.sort': '排序',
      'overview.priority': '活动优先', 'overview.newest': '最新创建', 'overview.name': '名称',
      'overview.timeSort': '执行耗时', 'overview.tokenSort': 'Token 用量',
      'overview.inactiveNote': 'Team 成员空闲表示当前没有回合在执行，任务是否完成以共享任务板为准。',
      'overview.tokenNote': 'Token 汇总覆盖 {known}/{total} 位成员；缺失记录不当作零，不估算费用。',
      'overview.durationNote': '累计执行时间只计各执行回合，不含回合间空闲；中断回合固定到最后一条事件的时间。',
      'overview.owner': '负责人', 'overview.unowned': '未分配', 'overview.dependencies': '依赖任务',
      'overview.scopes': '写入范围', 'overview.pending': '待处理', 'overview.in_progress': '进行中',
      'overview.ready': '可开始', 'overview.blocked': '依赖阻塞', 'overview.noTasks': '尚无共享任务记录。',
      'overview.noTeam': 'Team 投影不可用，可能未启用 Team。',
      'overview.healthy': '未报告投影错误。',
      'overview.coverage': '从持久化工具结果重建的 Hub 守卫拒绝记录，不包含其他工具错误。',
      'overview.rejections': '派发拒绝', 'overview.noRejections': '尚无 Hub 守卫拒绝记录。',
      'overview.noHistory': '拒绝记录投影不可用，可在父会话工具结果中查看。',
      'overview.historyCount': '显示最近 {shown} 条，共记录 {total} 次拒绝。',
      'overview.reset': '清除筛选', 'overview.current': '当前会话', 'overview.lead': 'Lead',
    })

    const OVERVIEW_CSS = `
.sah-overview-trigger{display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:12px;font-weight:400;min-height:28px;padding:3px 7px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#999);cursor:pointer;white-space:nowrap;-webkit-app-region:no-drag}
.sah-overview-trigger:hover,.sah-overview-trigger:focus-visible,.sah-overview-trigger[aria-expanded=true]{color:var(--dsw-alias-label-primary,#eee)}
.sah-overview-trigger-icon{display:inline-flex;align-items:center;flex:none}
.sah-overview-trigger-count{color:var(--dsw-alias-label-caption,#888);font-variant-numeric:tabular-nums;font-size:12px;font-weight:400;line-height:16px}
@container (width<=480px){.sah-overview-trigger-label{display:none}}
.sah-overview{box-sizing:border-box;width:min(880px,calc(100vw - 32px));max-height:min(760px,calc(100dvh - 32px));padding:0;border:0;border-radius:12px;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1,#ffffff1f);box-shadow:var(--dsw-elevation-prominent,0 0 0 .5px #ffffff1f,0 3px 8px #0000000a,0 0 20px #0000000d);background:var(--dsw-specific-menu,#303136f0);-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));color:var(--dsw-alias-label-primary,#eee);font-size:13px;line-height:20px;overflow:hidden;-webkit-app-region:no-drag}
.sah-overview[open]{display:flex;flex-direction:column}
.sah-overview::backdrop{background:#0000004d}
.sah-overview *{box-sizing:border-box}.sah-overview h2{font-size:14px;font-weight:500;margin:0}.sah-overview h3{font-size:13px;font-weight:500;margin:0}.sah-overview p{margin:4px 0;overflow-wrap:anywhere}
.sah-overview-head{flex:none;display:flex;align-items:center;gap:4px;padding:12px 12px 8px 18px}.sah-overview-head h2{margin-inline-end:auto}
.sah-overview-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:4px 12px 18px 18px;display:grid;align-content:start;gap:14px}
.sah-overview button,.sah-overview select,.sah-overview input{font:inherit;font-size:12px;color:inherit;border-radius:6px;min-height:28px}
.sah-overview button{display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:3px 9px;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#bbb);cursor:pointer;white-space:nowrap;transition:background-color .12s ease-out,color .12s ease-out,transform .1s ease-out}
.sah-overview button:not(:disabled):active{transform:scale(.96)}
.sah-overview button:disabled{opacity:.5;cursor:default}
.sah-overview select,.sah-overview input{padding:4px 8px;border:0;background:var(--dsw-alias-bg-layer-2,#ffffff0d);--dsw-elevation-stroke-color:var(--dsw-alias-border-l2,#ffffff1f);box-shadow:var(--dsw-elevation-stroke,0 0 0 .5px #ffffff1f)}
.sah-overview input::placeholder{color:var(--dsw-alias-label-caption,#888)}
@media(hover:hover){.sah-overview button:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#eee)}}
.sah-overview :is(button,input,select,summary):focus-visible,.sah-overview-trigger:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#719cff);outline-offset:2px}
.sah-overview-stats,.sah-overview-toolbar,.sah-overview-tabs{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.sah-overview-stat{flex:1;min-width:100px;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,#ffffff0a);--dsw-elevation-stroke-color:var(--dsw-alias-border-l2,#ffffff1f);box-shadow:var(--dsw-elevation-stroke,0 0 0 .5px #ffffff1f)}
.sah-overview-stat strong{display:block;margin-top:2px;font-size:18px;line-height:24px;font-weight:500;font-variant-numeric:tabular-nums}
.sah-overview-muted{color:var(--dsw-alias-label-tertiary,#999)}
.sah-overview-tabs{gap:2px}.sah-overview-tabs button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#eee);font-weight:500}
.sah-overview-toolbar{color:var(--dsw-alias-label-tertiary,#999);font-size:12px}.sah-overview-toolbar label{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.sah-overview-toolbar input{width:100%;min-width:0}.sah-overview-search{flex:1 1 100%}
.sah-overview-list{display:grid;gap:8px;list-style:none;margin:0;padding:0}
.sah-overview-card{min-width:0;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,#ffffff0a);--dsw-elevation-stroke-color:var(--dsw-alias-border-l2,#ffffff1f);box-shadow:var(--dsw-elevation-stroke,0 0 0 .5px #ffffff1f);overflow-wrap:anywhere}
.sah-overview-card-head{display:flex;align-items:center;flex-wrap:wrap;gap:6px}.sah-overview-card-head h3{flex:1;min-width:0}
.sah-overview-chip{font-size:11px;line-height:16px;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-tertiary,#999)}
.sah-overview-chip[data-state=running]{color:var(--dsw-alias-state-business-primary,#9bb8ff);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#9bb8ff) 14%,transparent)}
.sah-overview-chip[data-state=failed],.sah-overview-error{color:var(--dsw-alias-state-error-primary,#ffb0a8)}
.sah-overview-chip[data-state=failed]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ffb0a8) 14%,transparent)}
.sah-overview-meta{display:flex;flex-wrap:wrap;gap:4px 16px;margin-block:4px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999);font-variant-numeric:tabular-nums}
.sah-overview details{margin-block-start:4px}.sah-overview summary{cursor:pointer;min-height:28px;display:flex;align-items:center;gap:4px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999);border-radius:6px}.sah-overview summary:hover{color:var(--dsw-alias-label-primary,#eee)}
.sah-overview dl{display:grid;grid-template-columns:minmax(90px,auto) minmax(0,1fr);gap:4px 16px;margin:6px 0;font-size:12px}.sah-overview dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.sah-overview dt{color:var(--dsw-alias-label-tertiary,#999)}
.sah-overview code{font-size:12px;overflow-wrap:anywhere}
.sah-overview-notice{padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,#ffffff0a);--dsw-elevation-stroke-color:var(--dsw-alias-border-l2,#ffffff1f);box-shadow:var(--dsw-elevation-stroke,0 0 0 .5px #ffffff1f)}
.sah-overview-task-description{white-space:pre-wrap}
@media(prefers-reduced-motion:reduce){.sah-overview button{transition:none}.sah-overview button:not(:disabled):active{transform:none}}
@media(max-width:520px){.sah-overview{width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}.sah-overview-head{padding:10px 8px 6px 12px}.sah-overview-body{padding:4px 8px 12px 12px;gap:12px}.sah-overview dl{grid-template-columns:1fr;gap:2px}.sah-overview dd{margin-block-end:6px}.sah-overview-toolbar label{flex:1 1 100%}.sah-overview-toolbar select{flex:1;min-width:0}.sah-overview-card-head button{margin-inline-start:auto}}
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
    /** Membership is authoritative only in the parent's catalog/roster, never inferred from global sessions. */
    function overviewData(rootId, state, statuses, now = Date.now()) {
      const snapshots = state?.projectionsBySession ?? {}
      const summaries = state?.byId ?? {}
      const snapshot = snapshots[rootId]
      const values = { ...summaries[rootId]?.projectionValues, ...snapshot?.values }
      const catalog = values.subagentCatalog
      const team = values.agentTeam
      const members = new Map()
      for (const entry of catalog ?? []) members.set(entry.id, { ...entry, kind: 'independent', name: entry.label ?? summaries[entry.id]?.displayTitle ?? entry.id })
      for (const member of team?.members ?? []) {
        if (member.role === 'lead') continue
        members.set(member.id, { ...members.get(member.id), ...member, kind: 'team', mode: 'continuable' })
      }
      const rows = [...members.values()].map(member => {
        const child = snapshots[member.id]
        const projected = { ...summaries[member.id]?.projectionValues, ...child?.values }
        const running = statuses?.get(member.id)?.running ?? summaries[member.id]?.running
        const timing = projected.subagentTiming
        const status = member.phase === 'failed' ? 'failed' : member.phase === 'provisioning' ? 'provisioning'
          : running === true ? 'running' : running === undefined ? 'unknown'
          : member.kind === 'team' ? 'inactive'
          : member.mode === 'one-shot' && timing?.lastTurnCompleted === true ? 'completed'
          : timing?.lastTurnCompleted === false ? 'interrupted' : 'inactive'
        return { ...member, status, model: modelBadgeData({ subagent: true }, projected.modelSelection),
          duration: overviewDuration(timing, running === true, now), tokens: overviewTokens(projected.tokenUsage),
          readState: child?.state, readError: child?.error?.message,
          address: ['one-shot', 'continuable'].includes(member.mode) ? { parentSessionId: rootId, childSessionId: member.id, mode: member.mode } : undefined }
      })
      const issues = []
      if (snapshot?.error) issues.push({ id: rootId, message: snapshot.error.message ?? String(snapshot.error) })
      if (team?.failure) issues.push({ id: rootId, message: team.failure })
      for (const row of rows) {
        if (row.error) issues.push({ id: row.id, message: row.error })
        if (row.readError) issues.push({ id: row.id, message: row.readError })
      }
      return { rows, dispatch: values.subagentHubDispatch, tasks: (team?.tasks ?? []).filter(task => task.status !== 'deleted'), issues,
        teamAvailable: team !== undefined, catalogAvailable: Array.isArray(catalog),
        readState: snapshot?.state ?? (state?.phase === 'pending' ? 'loading' : 'idle'),
        running: rows.filter(row => row.status === 'running').length,
        tokenKnown: rows.filter(row => row.tokens !== undefined).length,
        tokens: rows.reduce((sum, row) => sum + (row.tokens ?? 0), 0) }
    }
    function overviewFilter(rows, { search = '', kind = 'all', status = 'all', sort = 'priority' } = {}, groups = []) {
      const query = search.trim().toLocaleLowerCase()
      const rank = { running: 0, provisioning: 1, failed: 2, interrupted: 3, unknown: 4, inactive: 5, completed: 6 }
      return rows.filter(row => (kind === 'all' || row.kind === kind) && (status === 'all' || row.status === status)
        && (!query || [row.name, row.id, row.model.last?.provider, row.model.last?.model, routeModelName(groups, row.model.last), row.error].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)))
        .sort((a, b) => {
          const primary = sort === 'name' ? a.name.localeCompare(b.name)
            : sort === 'newest' ? (b.createdAt ?? -1) - (a.createdAt ?? -1)
            : sort === 'timeSort' ? (b.duration ?? -1) - (a.duration ?? -1)
            : sort === 'tokenSort' ? (b.tokens ?? -1) - (a.tokens ?? -1) : rank[a.status] - rank[b.status]
          return primary || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
        })
    }
    /** Bound read pressure and let closing the panel stop scheduling further work. */
    async function refreshOverview(sessions, rootId, ids, cancelled = () => false) {
      const queue = [...new Set([rootId, ...ids].filter(Boolean))]
      const failures = []
      async function worker() {
        while (queue.length && !cancelled()) {
          const id = queue.shift()
          try { await sessions.refreshProjections(id) }
          catch (error) { failures.push({ id, message: String(error?.message ?? error) }) }
        }
      }
      await Promise.all([worker(), worker(), worker(), worker()])
      return failures
    }
    function OverviewMember({ row, currentId, openChild, t, groups = [] }) {
      // The card names a route the way the configuration page does; the details keep the exact
      // wire ids so the record itself stays checkable.
      const label = value => `${routeLabel(groups, value).value}${value.reasoningEffort ? ` · ${value.reasoningEffort}` : ''}`
      const raw = value => `${value.provider} / ${value.model}${value.reasoningEffort ? ` · ${value.reasoningEffort}` : ''}`
      return h('li', { className: 'sah-overview-card' },
        h('div', { className: 'sah-overview-card-head' }, h('h3', null, row.name),
          h('span', { className: 'sah-overview-chip' }, t(`overview.${row.kind}`)),
          h('span', { className: 'sah-overview-chip', 'data-state': row.status }, t(`overview.${row.status}`)),
          h('button', { type: 'button', disabled: !row.address || row.id === currentId,
            title: !row.address ? t('overview.noNavigation') : undefined,
            onClick: () => openChild(row.address) }, t(row.id === currentId ? 'overview.current' : 'overview.open'))),
        h('p', null, row.model.kind === 'recorded' ? `${t('overview.model')}: ${label(row.model.last)}`
          : t(row.model.kind === 'waiting' ? 'overview.noRequest' : 'overview.noModel')),
        h('div', { className: 'sah-overview-meta sah-overview-muted' },
          h('span', null, `${t('overview.duration')}: ${overviewTime(row.duration)}`),
          h('span', null, `${t('overview.tokens')}: ${row.tokens?.toLocaleString() ?? '—'}`)),
        row.error || row.readError ? h('p', { className: 'sah-overview-error' }, row.error || row.readError) : null,
        h('details', null, h('summary', null, t('overview.details')),
          h('dl', null, h('dt', null, 'Session ID'), h('dd', null, h('code', null, row.id)),
            h('dt', null, t('overview.kind')), h('dd', null, row.mode),
            Number.isFinite(row.createdAt) ? h(React.Fragment, null, h('dt', null, t('overview.created')), h('dd', null, new Date(row.createdAt).toLocaleString())) : null,
            row.model.next ? h(React.Fragment, null, h('dt', null, t('overview.next')), h('dd', null, raw(row.model.next))) : null),
          row.readState === 'migration-required' ? h('p', null, t('overview.migration')) : null))
    }
    function OverviewTasks({ tasks, teamAvailable, t }) {
      if (!teamAvailable) return h('p', { role: 'status' }, t('overview.noTeam'))
      if (!tasks.length) return h('p', null, t('overview.noTasks'))
      return h('ul', { className: 'sah-overview-list' }, ...tasks.map(task => h('li', { key: task.id, className: 'sah-overview-card' },
        h('div', { className: 'sah-overview-card-head' }, h('h3', null, task.subject),
          h('span', { className: 'sah-overview-chip' }, t(`overview.${task.status}`)),
          task.status === 'pending' ? h('span', { className: 'sah-overview-chip' }, t(task.ready ? 'overview.ready' : 'overview.blocked')) : null),
        h('p', { className: 'sah-overview-muted' }, `${task.id} · ${t('overview.owner')}: ${task.ownerName ?? t('overview.unowned')}`),
        h('details', null, h('summary', null, t('overview.details')),
          h('p', { className: 'sah-overview-task-description' }, task.description),
          h('dl', null, h('dt', null, t('overview.dependencies')), h('dd', null, task.blockedBy?.join(', ') || '—'),
            h('dt', null, t('overview.scopes')), h('dd', null, task.writeScopes?.join('\n') || '—'))),
        ...(task.writeScopeWarnings ?? []).map((warning, index) => h('p', { key: index, className: 'sah-overview-error' }, warning)))))
    }
    function OverviewContent({ data, currentId, openChild, t, errors = [], groups = [] }) {
      const [tab, setTab] = React.useState('members')
      const [filters, setFilters] = React.useState({ search: '', kind: 'all', status: 'all', sort: 'priority' })
      const rows = overviewFilter(data.rows, filters, groups)
      const issues = [...data.issues, ...errors]
      const select = (key, values) => h('label', null, t(`overview.${key === 'status' ? 'state' : key}`),
        h('select', { value: filters[key], onChange: event => setFilters(old => ({ ...old, [key]: event.target.value })) },
          ...values.map(value => h('option', { key: value, value }, t(`overview.${value}`)))))
      return h('div', { className: 'sah-overview-body' },
        h('div', { className: 'sah-overview-stats' }, ...[
          ['members', data.rows.length], ['running', data.running], ['tasks', data.tasks.length],
          ['tokens', data.tokenKnown ? data.tokens.toLocaleString() : '—'],
        ].map(([label, count]) => h('div', { key: label, className: 'sah-overview-stat' }, h('span', { className: 'sah-overview-muted' }, t(`overview.${label}`)), h('strong', null, count)))),
        issues.length ? h('div', { className: 'sah-overview-notice sah-overview-error', role: 'status' }, t('overview.stale')) : null,
        h('div', { className: 'sah-overview-tabs', role: 'group', 'aria-label': t('overview.title') },
          ...['members', 'tasks', 'diagnostics'].map(value => h('button', { type: 'button', key: value, 'aria-pressed': tab === value, onClick: () => setTab(value) },
            t(`overview.${value}`), value === 'diagnostics' && issues.length ? ` (${issues.length})` : ''))),
        tab === 'members' ? h(React.Fragment, null,
          h('div', { className: 'sah-overview-toolbar' },
            h('label', { className: 'sah-overview-search' }, t('overview.search'), h('input', { type: 'search', value: filters.search, onChange: event => setFilters(old => ({ ...old, search: event.target.value })) })),
            select('kind', ['all', 'team', 'independent']),
            select('status', ['all', 'running', 'provisioning', 'inactive', 'completed', 'interrupted', 'failed', 'unknown']),
            select('sort', ['priority', 'newest', 'name', 'timeSort', 'tokenSort']),
            h('button', { type: 'button', onClick: () => setFilters({ search: '', kind: 'all', status: 'all', sort: 'priority' }) }, t('overview.reset'))),
          !data.catalogAvailable ? h('p', { role: 'status' }, t(data.readState === 'loading' ? 'overview.loading' : data.readState === 'migration-required' ? 'overview.migration' : 'overview.unavailable')) : null,
          rows.length ? h('ul', { className: 'sah-overview-list' }, ...rows.map(row => h(OverviewMember, { key: row.id, row, currentId, openChild, t, groups })))
            : data.rows.length || data.catalogAvailable ? h('p', { role: 'status' }, t(data.rows.length ? 'overview.noMatches' : 'overview.empty')) : null,
          h('p', { className: 'sah-overview-muted' }, t('overview.inactiveNote')))
          : tab === 'tasks' ? h(OverviewTasks, { tasks: data.tasks, teamAvailable: data.teamAvailable, t })
            : h('section', null, h('h3', null, t('overview.diagnostics')),
              issues.length ? h('ul', null, ...issues.map((issue, index) => h('li', { key: index }, h('code', null, issue.id), ': ', issue.message))) : h('p', null, t('overview.healthy')),
              h('h3', null, t('overview.rejections')),
              !data.dispatch ? h('p', null, t('overview.noHistory')) : data.dispatch.records.length
                ? h(React.Fragment, null,
                  h('p', null, t('overview.historyCount', { shown: data.dispatch.records.length, total: data.dispatch.total })),
                  h('ul', { className: 'sah-overview-list' }, ...[...data.dispatch.records].reverse().map(record => h('li', { key: record.seq, className: 'sah-overview-card' },
                    h('h3', null, record.tool), h('p', { className: 'sah-overview-muted' }, `${new Date(record.time).toLocaleString()} · #${record.seq}`),
                    h('p', null, record.reason), h('code', null, record.callId)))))
                : h('p', null, t('overview.noRejections')),
              h('p', null, t('overview.coverage'))),
        h('div', { className: 'sah-overview-muted' },
          h('p', null, t('overview.tokenNote', { known: data.tokenKnown, total: data.rows.length })), h('p', null, t('overview.durationNote'))))
    }
    function AgentOverview({ sessionId, useSession, useSessions, useSessionStatus, sessions, openSession, names, remote, t }) {
      const rootId = useSession(value => value.subagent?.address.parentSessionId) ?? sessionId
      const state = useSessions(value => value)
      const statuses = useSessionStatus(value => value)
      const catalog = useSnapshot(names, NO_CATALOG)
      const [open, setOpen] = React.useState(false)
      const [now, setNow] = React.useState(Date.now)
      const [busy, setBusy] = React.useState(false)
      const [errors, setErrors] = React.useState([])
      const dialog = React.useRef(null)
      const trigger = React.useRef(null)
      const generation = React.useRef(0)
      const data = overviewData(rootId, state, statuses, now)
      const titleId = React.useId()
      const close = () => { dialog.current?.close(); setOpen(false); trigger.current?.focus() }
      const refresh = React.useCallback(async () => {
        const run = ++generation.current
        const cancelled = () => generation.current !== run
        setBusy(true)
        setErrors([])
        // Read the parent first so newly discovered members are included in this refresh.
        const failures = await refreshOverview(sessions, rootId, [], cancelled)
        const refreshed = overviewData(rootId, sessions.list.getSnapshot(), new Map())
        if (!cancelled()) failures.push(...await refreshOverview(sessions, undefined, refreshed.rows.map(row => row.id), cancelled))
        if (!cancelled()) { setErrors(failures); setBusy(false) }
      }, [sessions, rootId])
      React.useEffect(() => {
        if (!open) return
        dialog.current?.showModal()
        setNow(Date.now())
        dialog.current?.querySelector('[data-overview-close]')?.focus()
        refresh()
        return () => { generation.current++; dialog.current?.close() }
      }, [open, refresh])
      React.useEffect(() => { setOpen(false); setErrors([]); setBusy(false) }, [sessionId])
      React.useEffect(() => {
        if (!open || !data.running) return
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
      }, [open, data.running])
      // Names come from the same Host catalog the configuration page reads, once per runtime.
      React.useEffect(() => {
        if (open) names?.load(remote)
      }, [open, names, remote])
      const openChild = async address => {
        try { await openSession(address); close() }
        catch (error) { setErrors(old => [...old, { id: address.childSessionId, message: String(error?.message ?? error) }]) }
      }
      return h(React.Fragment, null, h('style', null, OVERVIEW_CSS),
        h('button', { type: 'button', ref: trigger, className: 'sah-overview-trigger', 'aria-haspopup': 'dialog', 'aria-expanded': open,
          'aria-label': t('overview.triggerHint', { running: data.running, total: data.rows.length }),
          title: t('overview.triggerHint', { running: data.running, total: data.rows.length }), onClick: () => setOpen(true) },
          h('span', { className: 'sah-overview-trigger-icon', 'aria-hidden': true }, glyph('IconBrowseOutlineRegular',
            h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
              h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1.5 }), h('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1.5 }),
              h('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1.5 }), h('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1.5 })))),
          h('span', { className: 'sah-overview-trigger-label' }, t('overview.title')),
          data.rows.length ? h('span', { className: 'sah-overview-trigger-count', 'aria-hidden': true }, `${data.running}/${data.rows.length}`) : null),
        h('dialog', { ref: dialog, className: 'sah-overview', 'aria-labelledby': titleId, onCancel: event => { event.preventDefault(); close() }, onClose: () => { if (!dialog.current?.open) setOpen(false) } },
          h('div', { className: 'sah-overview-head' }, h('h2', { id: titleId }, t('overview.title')),
            h('button', { type: 'button', disabled: busy, onClick: refresh }, t(busy ? 'overview.refreshing' : 'overview.refresh')),
            h('button', { type: 'button', onClick: close, 'data-overview-close': '', autoFocus: true }, t('overview.close'))),
          open ? h(OverviewContent, { key: rootId, data, currentId: sessionId, openChild, t, errors, groups: catalog.groups }) : null))
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
        ? h(AgentOverview, props) : null
    }
    function registerOverview(ctx, t, names = createModelNames()) {
      ctx.inject(['sessions', 'uiWorkspace'], scope => scope.slots.inject(OVERVIEW_SLOT, () => scope.slots.register({
        name: OVERVIEW_SLOT, id: 'subagent-hub-overview', order: -15, locale: NS,
        inject: () => ({ sessions: scope.sessions, openSession: address => scope.uiWorkspace.openSession(address), overviewForm: ctx.configForms.get(ENTRY_ID), names, remote: ctx.remote }),
      }, props => h(OverviewGate, { ...props, t: props.t ?? t }))))
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
      AgentOverview, OverviewGate, OverviewContent, OverviewMember, OverviewTasks, overviewData, overviewFilter,
      overviewDuration, overviewTokens, overviewTime, refreshOverview, registerOverview, OVERVIEW_SLOT,
      overviewLocales: { en, zh }, OVERVIEW_CSS,
      ModelBadge,
      modelBadgeData,
      modelBadgeShares,
      registerModelBadge,
      MODEL_BADGE_SLOT,
      ConfigPage,
      SectionPage,
      RouteCard,
      AgentCard,
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
      NO_CATALOG,
      NS,
      ROW_CONFIG_KEY,
      ENTRY_ID,
    }
  },
})
