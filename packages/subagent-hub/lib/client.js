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
    /** The official preset row whose allowlist the page watches (the shipped default). */
    const OFFICIAL_PRESET_NAMESPACE = 'preset-standard'
    /** How long the page waits for the Host's official allowlist writes before it gives up. */
    const SYNC_TIMEOUT_MS = 120000
    const SYNC_POLL_MS = 1500

    const zh = {
      'nav': '子代理中枢',
      'summary': '{routes} 条模型路由 · {agents} 个具名子 agent · 并发上限 {limit} · 官方设置：{managed}',
      'summary.managedOn': '托管中',
      'summary.managedOff': '未托管',
      'summary.unlimited': '不限',
      'intro': '为官方 subagent 工具补充“怎么选”：具名子 agent 注册成官方预设，模型路由同步为官方模型白名单，主 agent 在系统提示里看到选择目录。保存后立即生效，新会话可用。',
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
      'official.switch': '托管官方委派配置',
      'official.hint': '开启后，自动把具名 agent 加入官方 subagent 工具的 agent_preset 可选列表，并把下方路由同步为官方子代理模型白名单。关闭则不改动任何官方配置。',
      'routes.title': '模型路由',
      'routes.hint': '主 agent 能为子 agent 指定的模型，顺序即优先级。能力标签会写进主 agent 的选择目录。',
      'routes.add': '添加路由',
      'routes.none': '还没有模型路由。添加后，主 agent 才能为子 agent 指定模型。',
      'routes.loading': '正在读取模型目录…',
      'routes.catalogError': '读取模型目录失败。',
      'routes.retry': '重试',
      'routes.empty': '模型目录为空，请先在“模型”设置里配置 Provider。',
      'routes.unavailable': '部分 Provider 暂不可用：{names}',
      'route.provider': 'Provider',
      'route.model': '模型',
      'route.effort': '推理强度',
      'route.effortDefault': '模型默认',
      'route.pickProvider': '选择 Provider',
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
      'footer.dirty': '有未保存的修改',
      'save': '保存',
      'saving': '保存中…',
      'saved': '已保存。',
      'syncing': '已保存，正在同步官方配置（Host 需要重载官方预设，可能要几十秒）…',
      'synced': '已保存，官方配置已同步。',
      'syncPending': '已保存；官方配置仍在同步，稍后刷新本页确认。',
      'invalid': '无法保存：{error}',
      'unavailable': '这个 profile 没有提供配置表单，请直接编辑 cordis.patch.yml。',
      'discard': '放弃修改',
    }
    const en = {
      'nav': 'Subagent Hub',
      'summary': '{routes} model routes · {agents} named subagents · concurrency {limit} · official settings: {managed}',
      'summary.managedOn': 'managed',
      'summary.managedOff': 'not managed',
      'summary.unlimited': 'unlimited',
      'intro': 'Tells the official subagent tool “what to pick”: named subagents become official presets, model routes become the official model allowlist, and the main agent sees a selection catalog. Saving applies to new sessions immediately.',
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
      'official.switch': 'Manage the official delegation settings',
      'official.hint': 'When on, named agents are added to the official subagent tool\'s agent_preset choices and the routes below become the official subagent model allowlist. When off, no official setting is touched.',
      'routes.title': 'Model routes',
      'routes.hint': 'Models the main agent may pick for a child, in priority order. Capability tags go into the main agent\'s selection catalog.',
      'routes.add': 'Add route',
      'routes.none': 'No model route yet. Add one so the main agent can choose a child model.',
      'routes.loading': 'Reading the model catalog…',
      'routes.catalogError': 'The model catalog could not be read.',
      'routes.retry': 'Retry',
      'routes.empty': 'The model catalog is empty; configure a provider under Models first.',
      'routes.unavailable': 'Some providers are unavailable: {names}',
      'route.provider': 'Provider',
      'route.model': 'Model',
      'route.effort': 'Reasoning effort',
      'route.effortDefault': 'Model default',
      'route.pickProvider': 'Choose a provider',
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
      'footer.dirty': 'Unsaved changes',
      'save': 'Save',
      'saving': 'Saving…',
      'saved': 'Saved.',
      'syncing': 'Saved; syncing the official settings (the Host reloads the official presets, up to a minute)…',
      'synced': 'Saved; the official settings are in sync.',
      'syncPending': 'Saved; the official settings are still syncing. Refresh this page in a moment to confirm.',
      'invalid': 'Cannot save: {error}',
      'unavailable': 'This profile exposes no configuration form; edit cordis.patch.yml directly.',
      'discard': 'Discard',
    }

    // ── pure helpers ────────────────────────────────────────────────────────────────────────────

    const hasRouteContent = route => Boolean(route.id || route.provider || route.model || route.reasoningEffort || route.note || route.tags.length > 0)
    const hasAgentContent = agent => Boolean(agent.id || agent.description || agent.instructions || agent.routes.length > 0 || agent.needs.length > 0 || agent.basePreset !== 'standard')
    const routeKey = (provider, model) => `${provider}\0${model}`

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
      return { manageOfficialSettings: drafts.manageOfficialSettings === true, maxConcurrent: drafts.maxConcurrent, routes, agents }
    }

    /** The atomic mutate operations one save performs, against a single revision. */
    function saveOps(values) {
      return [
        { op: 'set', path: ['routes'], value: values.routes },
        { op: 'set', path: ['agents'], value: values.agents },
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
.sah-hero{display:flex;flex-direction:column;gap:10px}
.sah-intro{margin:0;color:var(--sah-sub);font-size:12.5px;line-height:19px;max-width:76ch}
.sah-summary{display:flex;flex-wrap:wrap;gap:6px}
.sah-badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border:1px solid var(--sah-border);border-radius:999px;font-size:12px;color:var(--sah-sub);background:var(--sah-panel)}
.sah-badge-dot{width:6px;height:6px;border-radius:50%;background:var(--sah-mute)}
.sah-badge-on .sah-badge-dot{background:var(--sah-ok)}
.sah-panel{border:1px solid var(--sah-border);border-radius:12px;background:var(--sah-panel);overflow:hidden}
.sah-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:14px 16px 12px}
.sah-panel-heading{display:flex;flex-direction:column;gap:3px;min-width:0}
.sah-title{margin:0;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;line-height:20px}
.sah-icon{display:inline-flex;color:var(--sah-sub)}
.sah-hint{margin:0;color:var(--sah-mute);font-size:12px;line-height:18px;max-width:72ch}
.sah-panel-body{display:flex;flex-direction:column;gap:10px;padding:0 16px 16px}
.sah-setting{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:12px 0;border-top:1px solid var(--sah-line)}
.sah-setting:first-child{border-top:0;padding-top:2px}
.sah-setting-text{display:flex;flex-direction:column;gap:3px;min-width:0}
.sah-setting-title{font-size:13px;font-weight:500}
.sah-setting-hint{font-size:12px;line-height:18px;color:var(--sah-mute);max-width:64ch}
.sah-setting-control{flex:none}
.sah-toggle{position:relative;width:36px;height:20px;border-radius:999px;border:0;padding:0;cursor:pointer;background:var(--sah-border);transition:background .16s}
.sah-toggle-on{background:var(--sah-accent)}
.sah-toggle:disabled{opacity:.45;cursor:default}
.sah-toggle-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .16s}
.sah-toggle-on .sah-toggle-thumb{transform:translateX(16px)}
.sah-toggle:focus-visible,.sah-stepper button:focus-visible,.sah-iconbtn:focus-visible,.sah-btn:focus-visible,.sah-agent-toggle:focus-visible,.sah-disclosure:focus-visible{outline:2px solid var(--sah-accent);outline-offset:2px}
.sah-stepper{display:inline-flex;align-items:center;height:32px;border:1px solid var(--sah-border);border-radius:8px;background:var(--sah-raised);overflow:hidden}
.sah-stepper button{width:32px;height:100%;border:0;background:transparent;color:var(--sah-sub);font-size:16px;cursor:pointer}
.sah-stepper button:hover:not(:disabled){background:var(--sah-hover);color:var(--sah-text)}
.sah-stepper button:disabled{opacity:.35;cursor:default}
.sah-stepper input{width:48px;height:100%;border:0;border-left:1px solid var(--sah-border);border-right:1px solid var(--sah-border);background:transparent;color:var(--sah-text);font:inherit;text-align:center;font-variant-numeric:tabular-nums;-moz-appearance:textfield}
.sah-stepper input::-webkit-inner-spin-button,.sah-stepper input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.sah-list{display:flex;flex-direction:column;gap:8px}
.sah-route-card,.sah-agent-card{border:1px solid var(--sah-border);border-radius:10px;background:var(--sah-raised);transition:border-color .16s}
.sah-route-card:hover,.sah-agent-card:hover{border-color:var(--dsw-alias-label-dimmed,#5d5e63)}
.sah-route-card{display:flex;flex-direction:column;gap:10px;padding:12px}
.sah-route-main{display:grid;grid-template-columns:24px minmax(0,1fr) minmax(0,1.3fr) minmax(0,.9fr) auto;gap:10px;align-items:end}
.sah-route-meta{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.6fr) minmax(0,1fr);gap:10px;padding:10px 0 0 34px;border-top:1px dashed var(--sah-line)}
.sah-order{height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:var(--sah-panel);color:var(--sah-mute);font-size:12px;font-variant-numeric:tabular-nums}
.sah-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.sah-field-wide{grid-column:1/-1}
.sah-label{font-size:12px;line-height:16px;color:var(--sah-sub)}
.sah-field-hint{font-size:11.5px;line-height:16px;color:var(--sah-mute)}
.sah-select,.sah-input,.sah-textarea{width:100%;border:1px solid var(--sah-border);border-radius:8px;background:var(--sah-panel);color:var(--sah-text);font:inherit;font-size:13px;transition:border-color .16s}
.sah-select,.sah-input{height:32px;padding:0 10px}
.sah-select{padding-right:26px;text-overflow:ellipsis}
.sah-textarea{padding:8px 10px;line-height:1.55;min-height:84px;resize:vertical}
.sah-select:hover:not(:disabled),.sah-input:hover:not(:disabled),.sah-textarea:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed,#5d5e63)}
.sah-select:focus,.sah-input:focus,.sah-textarea:focus{outline:none;border-color:var(--sah-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--sah-accent) 22%,transparent)}
.sah-select:disabled,.sah-input:disabled{color:var(--sah-mute);cursor:default}
.sah-row-actions{display:flex;gap:2px;height:32px;align-items:center}
.sah-iconbtn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:6px;background:transparent;color:var(--sah-mute);cursor:pointer;font-size:14px}
.sah-iconbtn:hover:not(:disabled){background:var(--sah-hover);color:var(--sah-text)}
.sah-iconbtn-danger:hover:not(:disabled){color:var(--sah-danger);background:color-mix(in srgb,var(--sah-danger) 14%,transparent)}
.sah-iconbtn:disabled{opacity:.3;cursor:default}
.sah-tagbox{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-height:32px;padding:3px 6px;border:1px solid var(--sah-border);border-radius:8px;background:var(--sah-panel)}
.sah-tagbox:focus-within{border-color:var(--sah-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--sah-accent) 22%,transparent)}
.sah-tagbox input{flex:1 1 80px;min-width:80px;height:24px;border:0;background:transparent;color:var(--sah-text);font:inherit;font-size:12.5px;outline:none}
.sah-chip{display:inline-flex;align-items:center;gap:3px;height:22px;padding:0 8px;border:1px solid var(--sah-border);border-radius:999px;background:var(--sah-raised);font-size:12px;color:var(--sah-sub);white-space:nowrap}
.sah-chip button{border:0;background:transparent;color:inherit;cursor:pointer;padding:0;font:inherit;line-height:1;opacity:.7}
.sah-chip button:hover{opacity:1;color:var(--sah-danger)}
.sah-suggest{display:flex;flex-wrap:wrap;gap:4px}
.sah-suggest button{height:22px;padding:0 8px;border:1px dashed var(--sah-border);border-radius:999px;background:transparent;color:var(--sah-mute);font:inherit;font-size:11.5px;cursor:pointer}
.sah-suggest button:hover{color:var(--sah-text);border-color:var(--sah-accent)}
.sah-pick{display:flex;flex-wrap:wrap;gap:6px}
.sah-pick button{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:1px solid var(--sah-border);border-radius:8px;background:var(--sah-panel);color:var(--sah-sub);font:inherit;font-size:12.5px;cursor:pointer;transition:border-color .16s,background .16s}
.sah-pick button:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed,#5d5e63);color:var(--sah-text)}
.sah-pick button[aria-pressed="true"]{border-color:var(--sah-accent);background:color-mix(in srgb,var(--sah-accent) 14%,transparent);color:var(--sah-text)}
.sah-pick-route{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11px;color:var(--sah-mute)}
.sah-agent-head{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 0}
.sah-agent-toggle{flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:4px 4px 4px 12px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.sah-avatar{flex:none;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:color-mix(in srgb,var(--sah-accent) 18%,transparent);color:var(--sah-accent);font-weight:600}
.sah-agent-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.sah-agent-name{display:flex;align-items:center;gap:8px;font-weight:500;min-width:0}
.sah-agent-desc{color:var(--sah-mute);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sah-code{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11px;font-weight:400;color:var(--sah-mute);padding:1px 6px;border-radius:4px;background:var(--sah-panel)}
.sah-agent-badges{display:flex;gap:4px;flex:none;max-width:40%;overflow:hidden}
.sah-chevron{display:inline-flex;color:var(--sah-mute);transition:transform .16s}
.sah-chevron-open{transform:rotate(180deg)}
.sah-agent-body{display:flex;flex-direction:column;gap:12px;padding:12px 16px 16px;border-top:1px solid var(--sah-line)}
.sah-grid-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:12px}
.sah-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border:1px solid transparent;border-radius:8px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap}
.sah-btn:disabled{opacity:.4;cursor:default}
.sah-btn-outline{border-color:var(--sah-border);background:transparent;color:var(--sah-sub)}
.sah-btn-outline:hover:not(:disabled){background:var(--sah-hover);color:var(--sah-text)}
.sah-btn-primary{background:var(--sah-text);color:var(--sah-raised)}
.sah-btn-primary:hover:not(:disabled){opacity:.9}
.sah-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:22px 16px;border:1px dashed var(--sah-border);border-radius:10px;color:var(--sah-mute);font-size:12.5px;text-align:center}
.sah-notice{margin:0;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--sah-sub)}
.sah-notice-error{color:var(--sah-danger)}
.sah-linkbtn{border:0;background:transparent;color:var(--sah-accent);font:inherit;font-size:12px;cursor:pointer;padding:0}
.sah-preview{margin:0;padding:12px 14px;border-radius:8px;background:var(--sah-raised);color:var(--sah-sub);font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11.5px;line-height:18px;white-space:pre-wrap;overflow:auto;max-height:320px}
.sah-disclosure{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.sah-disclosure:hover{background:var(--sah-hover)}
.sah-footer{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:8px;padding:12px 16px;margin-top:4px;border:1px solid var(--sah-border);border-radius:12px;background:color-mix(in srgb,var(--sah-panel) 92%,transparent);backdrop-filter:blur(8px)}
.sah-footer-left{flex:1;min-width:0;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--sah-sub)}
.sah-dirty-dot{width:7px;height:7px;border-radius:50%;background:var(--sah-warn);flex:none}
.sah-status-error{color:var(--sah-danger)}
.sah-status-warn{color:var(--sah-warn)}
.sah-status-ok{color:var(--sah-ok)}
@media (max-width:760px){.sah-route-main{grid-template-columns:24px 1fr 1fr}.sah-route-main>.sah-row-actions{grid-column:1/-1;justify-content:flex-end}.sah-route-meta,.sah-grid-2{grid-template-columns:1fr;padding-left:0}.sah-agent-badges{display:none}}
`

    const style = () => h('style', { key: 'css' }, CSS)
    /** An official icon when the shell supplies one, otherwise a text glyph. */
    const glyph = (name, fallback, size = 14) => (P[name] === undefined ? fallback : h(P[name], { size }))

    /** A labelled control with an optional hint; a div so composite controls keep their own focus. */
    function Field({ label, hint, wide, children }) {
      return h('div', { className: `sah-field${wide ? ' sah-field-wide' : ''}` },
        h('span', { className: 'sah-label' }, label),
        children,
        hint ? h('span', { className: 'sah-field-hint' }, hint) : null)
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

    /** Native text input, styled like the official settings inputs. */
    function TextInput({ value, onChange, ...extra }) {
      return h('input', { className: 'sah-input', value, onChange: event => onChange(event.target.value), ...extra })
    }

    /** A tag chip with an optional remove control. */
    function Chip({ tag, onRemove }) {
      return h('span', { className: 'sah-chip' },
        tag,
        onRemove === undefined ? null : h('button', { type: 'button', onClick: () => onRemove(tag), 'aria-label': `remove ${tag}` }, '×'))
    }

    /** Chips plus an inline input that adds a tag on Enter, then one-click suggestions. */
    function TagInput({ tags, onChange, placeholder, suggestions = [], disabled }) {
      const [text, setText] = React.useState('')
      const commit = () => {
        const next = addTag(tags, text)
        setText('')
        if (next.length !== tags.length) onChange(next)
      }
      const offered = suggestions.filter(tag => !tags.includes(tag))
      return h(React.Fragment, null,
        h('div', { className: 'sah-tagbox' },
          tags.map(tag => h(Chip, { key: tag, tag, onRemove: disabled ? undefined : value => onChange(removeTag(tags, value)) })),
          h('input', {
            value: text,
            disabled,
            placeholder: tags.length === 0 ? placeholder : '',
            onChange: event => setText(event.target.value),
            onBlur: commit,
            onKeyDown: (event) => {
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

    /** One model route: provider / model / effort on top, then its name, tags and note. */
    function RouteCard({ route, index, total, groups, catalogReady = true, known, onChange, onRemove, onMove, disabled, t }) {
      const set = patch => onChange({ ...route, ...patch })
      // Only a loaded catalog can say a stored value is gone.
      const missing = catalogReady ? t('route.missing') : null
      const derived = route.id === '' || route.id === slugForModel(route.model)
      const pickProvider = provider => onChange({ ...route, provider, model: '', reasoningEffort: '', ...(derived ? { id: '' } : {}) })
      const pickModel = model => onChange({ ...route, model, reasoningEffort: '', ...(derived ? { id: slugForModel(model) } : {}) })
      return h('div', { className: 'sah-route-card' },
        h('div', { className: 'sah-route-main' },
          h('span', { className: 'sah-order' }, String(index + 1)),
          h(Field, { label: t('route.provider') }, h(Select, {
            value: route.provider,
            disabled,
            options: [{ value: '', label: t('route.pickProvider') }, ...providerChoices(groups, route.provider, missing)],
            onChange: pickProvider,
          })),
          h(Field, { label: t('route.model') }, h(Select, {
            value: route.model,
            disabled: disabled || route.provider === '',
            options: [{ value: '', label: t('route.pickModel') }, ...modelChoices(groups, route.provider, route.model, missing)],
            onChange: pickModel,
          })),
          h(Field, { label: t('route.effort') }, h(Select, {
            value: route.reasoningEffort,
            disabled: disabled || route.model === '',
            options: [{ value: '', label: t('route.effortDefault') }, ...effortChoices(groups, route.provider, route.model, route.reasoningEffort, missing)],
            onChange: value => set({ reasoningEffort: value }),
          })),
          h('div', { className: 'sah-row-actions' },
            h(IconButton, { title: t('route.moveUp'), disabled: disabled || index === 0, onClick: () => onMove(index, -1) }, glyph('IconChevronUpOutlineRegular', '↑')),
            h(IconButton, { title: t('route.moveDown'), disabled: disabled || index === total - 1, onClick: () => onMove(index, 1) }, glyph('IconChevronDownOutlineRegular', '↓')),
            h(IconButton, { title: t('route.remove'), danger: true, disabled, onClick: onRemove }, glyph('IconTrashOutlineRegular', '×')))),
        h('div', { className: 'sah-route-meta' },
          h(Field, { label: t('route.id'), hint: t('route.idHint') },
            h(TextInput, { value: route.id, disabled, placeholder: 'flash', onChange: value => set({ id: value }) })),
          h(Field, { label: t('route.tags') },
            h(TagInput, { tags: route.tags, disabled, placeholder: t('route.tagPlaceholder'), suggestions: known, onChange: tags => set({ tags }) })),
          h(Field, { label: t('route.note') },
            h(TextInput, { value: route.note, disabled, placeholder: 'DeepSeek Flash', onChange: value => set({ note: value }) }))))
    }

    /** One named agent: a collapsible card whose header summarises it. */
    function AgentCard({ agent, index, routes, presets, known, onChange, onRemove, disabled, defaultOpen, t }) {
      const [open, setOpen] = React.useState(defaultOpen === true)
      const set = patch => onChange({ ...agent, ...patch })
      const usable = routes.filter(route => route.id && route.provider && route.model)
      const toggleRoute = id => set({ routes: agent.routes.includes(id) ? agent.routes.filter(item => item !== id) : [...agent.routes, id] })
      const presetOptions = presets.map(preset => ({ value: preset.id, label: preset.name && preset.name !== preset.id ? `${preset.name} (${preset.id})` : preset.id }))
      if (agent.basePreset && !presetOptions.some(option => option.value === agent.basePreset)) {
        presetOptions.unshift({ value: agent.basePreset, label: `${agent.basePreset} (${t('route.missing')})` })
      }
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
            h(Field, { label: t('agent.id'), hint: t('agent.idHint') },
              h(TextInput, { value: agent.id, disabled, placeholder: 'reviewer', onChange: value => set({ id: value.trim().toLowerCase() }) })),
            h(Field, { label: t('agent.description'), hint: t('agent.descriptionHint') },
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
          h(Field, { label: t('agents.routesLabel'), hint: t('agents.routesHint'), wide: true },
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
              h(TagInput, { tags: agent.needs, disabled, placeholder: t('route.tagPlaceholder'), suggestions: known, onChange: needs => set({ needs }) })))) : null)
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
      const initial = React.useMemo(() => draftsOf(value), [])
      const [draft, setDraft] = React.useState(initial)
      const [catalog, setCatalog] = React.useState({ status: 'loading', groups: [], failures: [] })
      const [presets, setPresets] = React.useState([{ id: 'standard', name: 'standard' }])
      const [status, setStatus] = React.useState(undefined)
      const [busy, setBusy] = React.useState(false)
      const [fresh, setFresh] = React.useState(() => new Set())
      const [previewOpen, setPreviewOpen] = React.useState(false)
      const writable = form !== undefined && form.state?.writable !== false
      const hydrated = React.useRef(form?.state?.status !== 'loading')
      const disposed = React.useRef(false)
      React.useEffect(() => () => { disposed.current = true }, [])
      React.useEffect(() => {
        if (hydrated.current || form?.state?.status !== 'ready') return
        hydrated.current = true
        setDraft(draftsOf(form.state.value))
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

      /**
       * Watch the official configuration until the Host has written the allowlists. Every write
       * is one profile reload, so this takes seconds; the page says so instead of claiming
       * success it cannot know.
       */
      const watchOfficialSync = React.useCallback((savedValues) => {
        if (ctx.configForms === undefined) return
        const expected = savedValues.agents.map(agent => `hub-agent-${agent.id}`)
        if (!savedValues.manageOfficialSettings || expected.length === 0) return
        setStatus({ kind: 'busy', text: t('syncing') })
        const deadline = Date.now() + SYNC_TIMEOUT_MS
        const tick = () => {
          if (disposed.current) return
          const snapshot = ctx.configForms.get(OFFICIAL_PRESET_NAMESPACE)?.getSnapshot?.()
          if (allowlistSynced(officialAllowlists(snapshot?.value?.plugins), expected)) {
            setStatus({ kind: 'ok', text: t('synced') })
            return
          }
          if (Date.now() > deadline) {
            setStatus({ kind: 'warn', text: t('syncPending') })
            return
          }
          setTimeout(tick, SYNC_POLL_MS)
        }
        setTimeout(tick, SYNC_POLL_MS)
      }, [ctx])

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
      const dirty = JSON.stringify(values) !== JSON.stringify(valuesOf(draftsOf(value)))
      const locked = !writable || busy

      const updateRoute = (index, route) => setDraft(current => ({ ...current, routes: current.routes.map((item, at) => at === index ? route : item) }))
      const removeRoute = index => setDraft(current => ({ ...current, routes: current.routes.filter((_, at) => at !== index) }))
      const moveRoute = (index, delta) => setDraft((current) => {
        const routes = [...current.routes]
        const target = index + delta
        if (target < 0 || target >= routes.length) return current
        const [row] = routes.splice(index, 1)
        routes.splice(target, 0, row)
        return { ...current, routes }
      })
      const addRoute = () => setDraft(current => ({ ...current, routes: [...current.routes, { id: '', provider: '', model: '', reasoningEffort: '', tags: [], note: '' }] }))
      const updateAgent = (index, agent) => setDraft(current => ({ ...current, agents: current.agents.map((item, at) => at === index ? agent : item) }))
      const removeAgent = index => setDraft(current => ({ ...current, agents: current.agents.filter((_, at) => at !== index) }))
      const addAgent = () => {
        const id = uniqueRouteId('agent', new Set(draft.agents.map(agent => agent.id)))
        setFresh(current => new Set(current).add(draft.agents.length))
        setDraft(current => ({ ...current, agents: [...current.agents, { id, description: '', instructions: '', routes: [], needs: [], basePreset: 'standard' }] }))
      }

      const save = async () => {
        if (problem !== undefined) {
          setStatus({ kind: 'error', text: t('invalid', { error: problem }) })
          return
        }
        setBusy(true)
        try {
          await form.mutate(saveOps(values), form.state?.revision)
          setStatus({ kind: 'ok', text: t('saved') })
          watchOfficialSync(values)
        } catch (error) {
          setStatus({ kind: 'error', text: String(error?.message ?? error) })
        } finally {
          setBusy(false)
        }
      }
      const discard = () => {
        setDraft(draftsOf(value))
        setStatus(undefined)
      }

      const preview = catalogPreview(draft)
      const footerText = status !== undefined
        ? h('span', { className: `sah-status-${status.kind === 'busy' ? 'warn' : status.kind}`, role: 'status' }, status.text)
        : problem !== undefined && dirty
          ? h('span', { className: 'sah-status-error' }, t('invalid', { error: problem }))
          : dirty
            ? h(React.Fragment, null, h('span', { className: 'sah-dirty-dot' }), h('span', null, t('footer.dirty')))
            : null

      return h('div', { className: 'sah' },
        style(),
        form === undefined ? h('p', { className: 'sah-notice sah-notice-error' }, t('unavailable')) : null,
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
          }, h(Stepper, { value: maxConcurrent, disabled: locked, label: t('concurrency.limit'), t, onChange: next => setDraft(current => ({ ...current, maxConcurrent: next })) })),
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
            key: index,
            route,
            index,
            total: draft.routes.length,
            groups: catalog.groups,
            catalogReady: catalog.status === 'ready',
            known,
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
          action: draft.agents.length === 0 ? null : h('button', { type: 'button', className: 'sah-btn sah-btn-outline', disabled: locked, onClick: addAgent },
            glyph('IconPlusOutlineRegular', '+'), t('agents.add')),
        },
        draft.agents.length === 0
          ? h('div', { className: 'sah-empty' },
            h('span', null, t('agents.none')),
            h('button', { type: 'button', className: 'sah-btn sah-btn-outline', disabled: locked, onClick: addAgent }, glyph('IconPlusOutlineRegular', '+'), t('agents.add')))
          : h('div', { className: 'sah-list' }, draft.agents.map((agent, index) => h(AgentCard, {
            key: index,
            agent,
            index,
            routes: draft.routes,
            presets,
            known,
            disabled: locked,
            defaultOpen: fresh.has(index),
            t,
            onChange: next => updateAgent(index, next),
            onRemove: () => removeAgent(index),
          })))),
        h('section', { className: 'sah-panel' },
          h('button', {
            type: 'button',
            className: 'sah-disclosure',
            'aria-expanded': previewOpen,
            onClick: () => setPreviewOpen(!previewOpen),
          },
          h('span', { className: 'sah-title' }, glyph('IconBrowseOutlineRegular', null), t('preview.title')),
          h('span', { className: `sah-chevron${previewOpen ? ' sah-chevron-open' : ''}` }, glyph('IconChevronDownOutlineRegular', '▾'))),
          previewOpen ? h('div', { className: 'sah-panel-body' },
            preview === ''
              ? h('p', { className: 'sah-notice' }, t('preview.empty'))
              : h('pre', { className: 'sah-preview' }, preview)) : null),
        h('div', { className: 'sah-footer' },
          h('div', { className: 'sah-footer-left' }, footerText),
          h('button', { type: 'button', className: 'sah-btn sah-btn-outline', disabled: !dirty || busy, onClick: discard }, t('discard')),
          h('button', {
            type: 'button',
            className: 'sah-btn sah-btn-primary',
            disabled: !writable || !dirty || busy || problem !== undefined,
            onClick: save,
          }, busy ? t('saving') : t('save'))))
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'subagent-hub: dictionaries')
      const t = ctx.locale.bind(NS)
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
      inject: ['slots', 'locale', 'configForms', 'remote', 'remote.session'],
      apply,
      // Pure helpers, exported for tests only.
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
      catalogPreview,
      officialAllowlists,
      allowlistSynced,
      slugForModel,
      uniqueRouteId,
      filterCatalog,
      addTag,
      removeTag,
      knownTags,
      NS,
      ROW_CONFIG_KEY,
      ENTRY_ID,
    }
  },
})
