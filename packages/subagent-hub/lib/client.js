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
      'summary': '{routes} 条模型路由 · {agents} 个具名子 agent · 官方设置：{managed}',
      'summary.managedOn': '由本插件托管',
      'summary.managedOff': '未托管',
      'intro': '给官方子代理补上“怎么选”的信息：把具名子 agent 注册成官方预设，把模型路由表同步成官方 allowedModels。主 agent 用官方 subagent 工具的 agent_preset / provider / model 参数选择。保存即时生效。',
      'official.title': '官方委派配置',
      'official.hint': '打开后，本插件通过官方配置编辑器写入每个官方预设里 spawn 委派工具行的 allowedAgentPresets，并启用 Host 的 subagent-model-selection（allowedModels）。关闭则完全不碰官方配置。',
      'official.switch': '由本插件管理官方委派配置',
      'routes.title': '模型路由',
      'routes.hint': '这些模型会进入官方 allowedModels；顺序即优先级。标签会展示给主 agent，作为“这活该配哪个模型”的依据。',
      'routes.search': '搜索模型',
      'routes.empty': '没有匹配的模型。',
      'routes.unavailable': '部分 provider 不可用：{names}',
      'routes.catalogError': '读取模型目录失败。',
      'routes.retry': '重试',
      'routes.loading': '正在读取模型目录…',
      'routes.selected': '已选路由',
      'routes.none': '还没有选模型。',
      'routes.addManual': '添加路由',
      'routes.tagPlaceholder': '标签，回车添加',
      'routes.suggestions': '常用标签：{tags}',
      'agents.title': '具名子 agent',
      'agents.hint': '每个定义注册成官方预设 hub-agent-<id>。description 是“什么时候用它”，instructions 追加到子 agent 人设，勾选的路由是它被允许使用的模型（不勾=任意模型）。',
      'agents.add': '新增具名 agent',
      'agents.none': '还没有具名 agent。',
      'agents.routesLabel': '允许使用的路由',
      'agents.anyModel': '不限制（任意已配置模型）',
      'agents.needs': '能力标签',
      'agents.basePreset': '基础预设',
      'agents.presetId': '官方预设 id：{id}',
      'preview.title': '主 agent 会看到的目录',
      'preview.empty': '配置路由或具名 agent 后，这里会显示主 agent 看到的选择目录。',
      'save': '保存',
      'saving': '保存中…',
      'saved': '已保存。',
      'syncing': '已保存；正在同步官方 allowlist（Host 需要重载官方预设，通常几秒到几十秒）…',
      'synced': '已保存，官方 allowlist 已同步。',
      'syncPending': '已保存；官方 allowlist 仍在同步（Host 正在重载官方预设）。稍后刷新本页可确认。',
      'invalid': '未保存：{error}',
      'unavailable': '这个 profile 没有提供配置表单；请直接编辑 profile 的 cordis.patch.yml。',
      'readOnly': '这个 profile 的配置当前不可写。',
      'saveFailed': '保存失败，请重试。',
      'common.remove': '删除',
      'common.moveUp': '上移',
      'common.moveDown': '下移',
      'route.id': 'id',
      'route.provider': 'Provider',
      'route.model': 'Model',
      'route.effort': '推理强度',
      'route.effortDefault': '模型默认',
      'route.pickProvider': '选择 Provider',
      'route.pickModel': '选择 Model',
      'route.note': 'note',
      'route.tags': '能力标签',
      'agent.id': 'id',
      'agent.description': 'description',
      'agent.instructions': 'instructions',
      'discard': '放弃修改',
    }
    const en = {
      'nav': 'Subagent Hub',
      'summary': '{routes} model routes · {agents} named subagents · official settings: {managed}',
      'summary.managedOn': 'managed',
      'summary.managedOff': 'not managed',
      'intro': 'Supplies the official subagents with “what to pick”: named subagents become official presets and the route table becomes the official allowedModels. The main agent picks with the official subagent tool\'s agent_preset / provider / model arguments. Saving applies immediately.',
      'official.title': 'Official delegation configuration',
      'official.hint': 'When on, this plugin writes `allowedAgentPresets` onto every official preset\'s spawn delegation row and enables the Host `subagent-model-selection` allowlist. When off, it touches no official configuration.',
      'official.switch': 'Manage the official delegation configuration',
      'routes.title': 'Model routes',
      'routes.hint': 'These models become the official allowedModels; their order is their priority. Tags are shown to the main agent as “which model fits this job”.',
      'routes.search': 'Search models',
      'routes.empty': 'No matching model.',
      'routes.unavailable': 'Some providers are unavailable: {names}',
      'routes.catalogError': 'The model catalog could not be read.',
      'routes.retry': 'Retry',
      'routes.loading': 'Reading the model catalog…',
      'routes.selected': 'Selected routes',
      'routes.none': 'No model selected yet.',
      'routes.addManual': 'Add a route by hand',
      'routes.tagPlaceholder': 'tag, Enter to add',
      'routes.suggestions': 'Common tags: {tags}',
      'agents.title': 'Named subagents',
      'agents.hint': 'Each definition becomes the official preset hub-agent-<id>. The description says when to use it, the instructions extend the child persona, and the checked routes are the models it may use (none = any model).',
      'agents.add': 'Add a named agent',
      'agents.none': 'No named agent yet.',
      'agents.routesLabel': 'Allowed routes',
      'agents.anyModel': 'Unrestricted (any configured model)',
      'agents.needs': 'Capability tags',
      'agents.basePreset': 'Base preset',
      'agents.presetId': 'official preset id: {id}',
      'preview.title': 'The catalog the main agent sees',
      'preview.empty': 'Configure a route or a named agent to see the selection catalog the main agent receives.',
      'save': 'Save',
      'saving': 'Saving…',
      'saved': 'Saved.',
      'syncing': 'Saved; syncing the official allowlist (the Host reloads the official presets — seconds to a minute)…',
      'synced': 'Saved; the official allowlist is in sync.',
      'syncPending': 'Saved; the official allowlist is still syncing (the Host is reloading the official presets). Refresh this page in a moment to confirm.',
      'invalid': 'Not saved: {error}',
      'unavailable': 'This profile exposes no configuration form; edit the profile `cordis.patch.yml` directly.',
      'readOnly': 'This profile\'s configuration is not writable right now.',
      'saveFailed': 'The save failed; please try again.',
      'common.remove': 'Remove',
      'common.moveUp': 'Move up',
      'common.moveDown': 'Move down',
      'route.id': 'id',
      'route.provider': 'Provider',
      'route.model': 'Model',
      'route.effort': 'Reasoning effort',
      'route.effortDefault': 'model default',
      'route.pickProvider': 'Choose a provider',
      'route.pickModel': 'Choose a model',
      'route.note': 'note',
      'route.tags': 'Capability tags',
      'agent.id': 'id',
      'agent.description': 'description',
      'agent.instructions': 'instructions',
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
      return { manageOfficialSettings: drafts.manageOfficialSettings === true, routes, agents }
    }

    /** The atomic mutate operations one save performs, against a single revision. */
    function saveOps(values) {
      return [
        { op: 'set', path: ['routes'], value: values.routes },
        { op: 'set', path: ['agents'], value: values.agents },
        { op: 'set', path: ['manageOfficialSettings'], value: values.manageOfficialSettings },
      ]
    }

    /** Validate drafts the way the Host will; returns a message or undefined. */
    function draftProblem(drafts) {
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
.sah{display:flex;flex-direction:column;gap:14px;margin:0;padding:0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,#e6e6e6)}
.sah-intro{margin:0;color:var(--dsw-alias-label-secondary,#b8b8b8);font-size:12px;line-height:18px}
.sah-section{display:flex;flex-direction:column;gap:10px}
.sah-head{display:flex;flex-direction:column;gap:2px}
.sah-title{margin:0;font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary,#e6e6e6)}
.sah-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#b8b8b8)}
.sah-muted{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#999)}
.sah-list{display:flex;flex-direction:column;gap:10px}
.sah-card{border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:10px;background:var(--dsw-alias-bg-layer-3,#202126);padding:10px;display:flex;flex-direction:column;gap:8px}
.sah-route{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) auto;gap:8px;align-items:end}
.sah-meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr);gap:8px;align-items:end}
.sah-agent{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:8px;align-items:end}
.sah-field{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#b8b8b8)}
.sah-select,.sah-input{width:100%;max-width:220px;height:32px;padding:0 28px 0 10px;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#232529);color:var(--dsw-alias-label-primary,#e6e6e6);font:inherit;font-size:13px;line-height:1.5;box-sizing:border-box}
.sah-input{padding:0 10px}
.sah-select:focus,.sah-input:focus{outline:2px solid var(--dsw-alias-state-business-primary,#5686fe);outline-offset:1px}
.sah-select:disabled{color:var(--dsw-alias-label-tertiary,#999);cursor:default}
.sah-textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#232529);color:var(--dsw-alias-label-primary,#e6e6e6);font:inherit;font-size:13px;line-height:1.5;resize:vertical;min-height:64px}
.sah-remove{height:32px;min-width:32px;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#b8b8b8);cursor:pointer;font-size:16px;line-height:1}
.sah-remove:hover{color:var(--dsw-alias-state-error-primary,#ef4444);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(242,90,90,.15))}
.sah-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.sah-btn:disabled{opacity:.4;cursor:default}
.sah-btn-outline{border-color:var(--dsw-alias-border-l2,#36373b);color:var(--dsw-alias-label-secondary,#b8b8b8);background:transparent;font-weight:500}
.sah-btn-outline:hover:not(:disabled){color:var(--dsw-alias-label-primary,#e6e6e6);background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.04))}
.sah-btn-primary{background:var(--dsw-alias-label-primary,#e6e6e6);color:var(--dsw-alias-bg-layer-3,#202126);font-weight:500}
.sah-btn-primary:hover:not(:disabled){opacity:.9}
.sah-options{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.sah-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sah-chip{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:999px;background:var(--dsw-alias-bg-layer-2,#232529);font-size:12px;line-height:1;cursor:pointer;color:var(--dsw-alias-label-secondary,#b8b8b8)}
.sah-chip:hover{color:var(--dsw-alias-label-primary,#e6e6e6);border-color:var(--dsw-alias-label-dimmed,#777)}
.sah-chip-on{border-color:var(--dsw-alias-state-business-primary,#5686fe);color:var(--dsw-alias-label-primary,#e6e6e6)}
.sah-chip-static{cursor:default}
.sah-chip-static:hover{color:var(--dsw-alias-label-secondary,#b8b8b8);border-color:var(--dsw-alias-border-l2,#36373b)}
.sah-footer{border-top:1px solid var(--dsw-alias-border-l2,#36373b);display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 0 4px}
.sah-footer-left{flex:1;min-width:0}
.sah-status{flex:1;min-width:0;color:var(--dsw-alias-label-secondary,#b8b8b8);font-size:12px;line-height:1.5}
.sah-status-error{color:var(--dsw-alias-label-error,#ef4444)}
.sah-status-warn{color:var(--dsw-alias-state-warn-primary,#c69026)}
.sah-notice{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#b8b8b8)}
.sah-warn{grid-column:1/-1;color:var(--dsw-alias-label-error,#ef4444);font-size:12px;line-height:18px}
.sah-preview{margin:8px 0 0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#232529);color:var(--dsw-alias-label-secondary,#b8b8b8);font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11.5px;line-height:18px;white-space:pre-wrap;overflow:auto}
.sah-details summary{cursor:pointer;color:var(--dsw-alias-label-secondary,#b8b8b8);font-size:12px}
.sah-switch{display:flex;align-items:center;gap:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#b8b8b8);cursor:pointer}
.sah-switch input{width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary,#5686fe);cursor:pointer}
.sah-monospace{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:12px}
`

    const style = () => h('style', { key: 'css' }, CSS)

    /** A labelled field: the label sits above its control, as in the official cards. */
    const Field = (label, key, control) => h('label', { className: 'sah-field', key },
      h('span', null, label),
      control)

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
    const TextInput = (value, onChange, extra = {}) => h('input', {
      className: 'sah-input',
      value,
      onChange: event => onChange(event.target.value),
      ...extra,
    })

    /** A removable tag chip. */
    function Chip({ tag, onRemove, active }) {
      return h('span', { className: `sah-chip${active ? ' sah-chip-on' : ''}${onRemove === undefined ? ' sah-chip-static' : ''}` },
        tag,
        onRemove === undefined ? null : h('button', {
          type: 'button',
          style: { appearance: 'none', border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit', padding: 0 },
          onClick: () => onRemove(tag),
          'aria-label': `remove ${tag}`,
        }, '×'))
    }

    /** Text input that adds a tag on Enter. */
    function TagInput({ tags, onChange, placeholder }) {
      const [text, setText] = React.useState('')
      const commit = () => {
        const value = text.trim()
        if (value === '') return
        const next = addTag(tags, value)
        setText('')
        if (next.length !== tags.length) onChange(next)
      }
      return h('div', { className: 'sah-tags' },
        tags.map(tag => h(Chip, { key: tag, tag, onRemove: value => onChange(removeTag(tags, value)) })),
        h('input', {
          className: 'sah-input',
          style: { maxWidth: '160px' },
          value: text,
          placeholder,
          onChange: event => setText(event.target.value),
          onKeyDown: event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          },
        }))
    }

    // ── sections ─────────────────────────────────────────────────────────────────────────────────

    /** Provider choices from the catalog, keeping a stored provider the catalog no longer lists. */
    function providerChoices(groups, provider) {
      const choices = groups.map(group => ({ value: group.id, label: `${group.name || group.id} (${group.id})` }))
      if (provider && !choices.some(choice => choice.value === provider)) {
        choices.unshift({ value: provider, label: `${provider} (不在当前目录)` })
      }
      return choices
    }

    /** Model choices of one provider, keeping a stored model the catalog no longer lists. */
    function modelChoices(groups, provider, model) {
      const group = groups.find(item => item.id === provider)
      const choices = group === undefined ? [] : group.models.map(item => ({ value: item.id, label: item.name || item.id }))
      if (model && !choices.some(choice => choice.value === model)) {
        choices.unshift({ value: model, label: `${model} (不在当前目录)` })
      }
      return choices
    }

    /** Reasoning efforts one model advertises, keeping a stored effort it no longer lists. */
    function effortChoices(groups, provider, model, effort) {
      const group = groups.find(item => item.id === provider)
      const found = group?.models.find(item => item.id === model)
      const efforts = found?.reasoning?.efforts ?? []
      const choices = efforts.map(item => ({ value: item.id, label: item.name || item.id }))
      if (effort && !choices.some(choice => choice.value === effort)) {
        choices.unshift({ value: effort, label: `${effort} (不在当前目录)` })
      }
      return choices
    }

    /** One model route: provider, model and effort as dropdowns, then its identity and tags. */
    function RouteCard({ route, index, groups, known, onChange, onRemove, onMove, total, t }) {
      const set = patch => onChange({ ...route, ...patch })
      const models = modelChoices(groups, route.provider, route.model)
      const efforts = effortChoices(groups, route.provider, route.model, route.reasoningEffort)
      const pickProvider = provider => {
        const next = { ...route, provider, model: '', reasoningEffort: '' }
        // The id follows the model only while it was derived from it.
        if (route.id === '' || route.id === slugForModel(route.model)) next.id = ''
        onChange(next)
      }
      const pickModel = model => {
        const next = { ...route, model, reasoningEffort: '' }
        if (route.id === '' || route.id === slugForModel(route.model)) next.id = slugForModel(model)
        onChange(next)
      }
      return h('div', { className: 'sah-card' },
        h('div', { className: 'sah-route' },
          Field(t('route.provider'), `route-provider-${index}`, h(Select, {
            value: route.provider,
            options: [{ value: '', label: t('route.pickProvider') }, ...providerChoices(groups, route.provider)],
            onChange: pickProvider,
          })),
          Field(t('route.model'), `route-model-${index}`, h(Select, {
            value: route.model,
            disabled: route.provider === '',
            options: [{ value: '', label: t('route.pickModel') }, ...models],
            onChange: pickModel,
          })),
          Field(t('route.effort'), `route-effort-${index}`, h(Select, {
            value: route.reasoningEffort,
            disabled: route.model === '',
            options: [{ value: '', label: t('route.effortDefault') }, ...efforts],
            onChange: value => set({ reasoningEffort: value }),
          })),
          h('button', {
            className: 'sah-remove',
            type: 'button',
            'aria-label': t('common.remove'),
            title: t('common.remove'),
            onClick: onRemove,
          }, '×')),
        h('div', { className: 'sah-meta' },
          Field(t('route.id'), `route-id-${index}`, TextInput(route.id, value => set({ id: value }), { placeholder: 'flash' })),
          Field(t('route.tags'), `route-tags-${index}`, h(TagInput, {
            tags: route.tags,
            placeholder: t('routes.tagPlaceholder'),
            onChange: tags => set({ tags }),
          })),
          Field(t('route.note'), `route-note-${index}`, TextInput(route.note, value => set({ note: value }), { placeholder: 'DeepSeek Flash' }))),
        known.some(tag => !route.tags.includes(tag))
          ? h('div', { className: 'sah-tags' },
            known.filter(tag => !route.tags.includes(tag)).map(tag => h(Chip, {
              key: tag,
              tag,
              onRemove: () => set({ tags: addTag(route.tags, tag) }),
            })))
          : null,
        total > 1 ? h('div', { className: 'sah-options' },
          h('button', {
            className: 'sah-btn sah-btn-outline',
            type: 'button',
            disabled: index === 0,
            onClick: () => onMove(index, -1),
          }, '↑ ' + t('common.moveUp')),
          h('button', {
            className: 'sah-btn sah-btn-outline',
            type: 'button',
            disabled: index === total - 1,
            onClick: () => onMove(index, 1),
          }, '↓ ' + t('common.moveDown'))) : null)
    }

    /** One named agent: identity, purpose, persona, allowed routes, tags, base preset. */
    function AgentCard({ agent, index, routes, presets, known, onChange, onRemove, t }) {
      const set = patch => onChange({ ...agent, ...patch })
      const toggleRoute = id => {
        const next = agent.routes.includes(id)
          ? agent.routes.filter(item => item !== id)
          : [...agent.routes, id]
        set({ routes: next })
      }
      return h('div', { className: 'sah-card' },
        h('div', { className: 'sah-agent' },
          Field(t('agent.id'), `agent-id-${index}`, TextInput(agent.id, value => set({ id: value }), { placeholder: 'reviewer' })),
          Field(t('agent.description'), `agent-desc-${index}`, TextInput(agent.description, value => set({ description: value }), { placeholder: 'Reviews a diff and reports findings' })),
          h('button', {
            className: 'sah-remove',
            type: 'button',
            'aria-label': t('common.remove'),
            title: t('common.remove'),
            onClick: onRemove,
          }, '×')),
        h('div', { className: 'sah-field' },
          h('span', null, t('agent.instructions')),
          h('textarea', {
            className: 'sah-textarea',
            rows: 3,
            value: agent.instructions,
            placeholder: 'Report findings only; never edit files.',
            onChange: event => set({ instructions: event.target.value }),
          })),
        h('div', { className: 'sah-field' },
          h('span', null, t('agents.routesLabel')),
          routes.length === 0
            ? h('div', { className: 'sah-muted' }, t('agents.anyModel'))
            : h('div', { className: 'sah-tags' }, routes.map(route => h(Chip, {
              key: route.id,
              tag: `${route.id} = ${route.provider}/${route.model}`,
              active: agent.routes.includes(route.id),
              onRemove: () => toggleRoute(route.id),
            })))),
        h('div', { className: 'sah-meta' },
          Field(t('agents.needs'), `agent-needs-${index}`, h(TagInput, {
            tags: agent.needs,
            placeholder: t('routes.tagPlaceholder'),
            onChange: needs => set({ needs }),
          })),
          Field(t('agents.basePreset'), `agent-preset-${index}`, h(Select, {
            value: agent.basePreset,
            options: presets.map(preset => ({ value: preset.id, label: `${preset.name ?? preset.id} (${preset.id})` })),
            onChange: value => set({ basePreset: value }),
          })),
          Field(t('agents.presetId', { id: agent.id ? `hub-agent-${agent.id}` : 'hub-agent-<id>' }), `agent-preset-id-${index}`,
            h('span', { className: 'sah-monospace' }, `hub-agent-${agent.id || '<id>'}`))),
        known.some(tag => !agent.needs.includes(tag))
          ? h('div', { className: 'sah-tags' },
            known.filter(tag => !agent.needs.includes(tag)).map(tag => h(Chip, {
              key: tag,
              tag,
              onRemove: () => set({ needs: addTag(agent.needs, tag) }),
            })))
          : null)
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

    /** The page itself: the route table, the named agents, and the save footer. */
    function ConfigPage({ view = 'page', form, t, ctx }) {
      const value = form?.state?.value ?? {}
      const initial = React.useMemo(() => draftsOf(value), [])
      const [draft, setDraft] = React.useState(initial)
      const [catalog, setCatalog] = React.useState({ status: 'loading', groups: [], failures: [] })
      const [presets, setPresets] = React.useState([{ id: 'standard', name: 'standard' }])
      const [status, setStatus] = React.useState(undefined)
      const [busy, setBusy] = React.useState(false)
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
            const list = (response.value?.presets ?? []).filter(preset => preset.broken === undefined)
            setPresets(list.length > 0 ? list : [{ id: 'standard', name: 'standard' }])
          }).catch(() => {})
        } catch {
          // the preset roster is optional; the built-in list stays in place
        }
      }, [ctx, loadCatalog])

      if (view === 'summary') {
        return h('span', null, t('summary', {
          routes: Array.isArray(value.routes) ? value.routes.length : 0,
          agents: Array.isArray(value.agents) ? value.agents.length : 0,
          managed: value.manageOfficialSettings === true ? t('summary.managedOn') : t('summary.managedOff'),
        }))
      }

      const known = knownTags(draft.routes)
      const values = valuesOf(draft)
      const problem = draftProblem(draft)
      const saved = valuesOf(draftsOf(value))
      const dirty = JSON.stringify(values) !== JSON.stringify(saved)

      const updateRoute = (index, route) => setDraft(current => ({ ...current, routes: current.routes.map((item, at) => at === index ? route : item) }))
      const removeRoute = index => setDraft(current => ({ ...current, routes: current.routes.filter((_, at) => at !== index) }))
      const moveRoute = (index, delta) => setDraft(current => {
        const routes = [...current.routes]
        const target = index + delta
        if (target < 0 || target >= routes.length) return current
        const [row] = routes.splice(index, 1)
        routes.splice(target, 0, row)
        return { ...current, routes }
      })
      const addRoute = () => setDraft(current => {
        const taken = new Set(current.routes.map(route => route.id))
        return { ...current, routes: [...current.routes, { id: uniqueRouteId('route', taken), provider: '', model: '', reasoningEffort: '', tags: [], note: '' }] }
      })
      const updateAgent = (index, agent) => setDraft(current => ({ ...current, agents: current.agents.map((item, at) => at === index ? agent : item) }))
      const removeAgent = index => setDraft(current => ({ ...current, agents: current.agents.filter((_, at) => at !== index) }))
      const addAgent = () => setDraft(current => {
        const taken = new Set(current.agents.map(agent => agent.id))
        const id = uniqueRouteId('agent', taken)
        return { ...current, agents: [...current.agents, { id, description: '', instructions: '', routes: [], needs: [], basePreset: 'standard' }] }
      })

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

      /**
       * Watch the official configuration until the Host has written the allowlists. Every write
       * is one profile reload, so this takes seconds; the page says so instead of freezing on
       * "saving" or claiming success it cannot know.
       */
      const watchOfficialSync = React.useCallback((savedValues) => {
        if (ctx.configForms === undefined) return
        const expected = savedValues.agents.map(agent => `hub-agent-${agent.id}`)
        if (!savedValues.manageOfficialSettings || expected.length === 0) return
        setStatus({ kind: 'ok', text: t('syncing') })
        const deadline = Date.now() + SYNC_TIMEOUT_MS
        const tick = () => {
          if (disposed.current) return
          const form = ctx.configForms.get(OFFICIAL_PRESET_NAMESPACE)
          const snapshot = form?.getSnapshot?.()
          const lists = officialAllowlists(snapshot?.value?.plugins)
          if (allowlistSynced(lists, expected)) {
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
      const discard = () => {
        setDraft(draftsOf(value))
        setStatus(undefined)
      }

      return h('section', { className: 'sah' },
        style(),
        form === undefined ? h('p', { className: 'sah-notice sah-status-error' }, t('unavailable')) : null,
        h('p', { className: 'sah-intro' }, t('intro')),
        h('div', { className: 'sah-section' },
          h('h3', { className: 'sah-title' }, t('official.title')),
          h('p', { className: 'sah-hint' }, t('official.hint')),
          h('label', { className: 'sah-switch' },
            h('input', {
              type: 'checkbox',
              checked: draft.manageOfficialSettings,
              disabled: !writable,
              onChange: event => setDraft(current => ({ ...current, manageOfficialSettings: event.target.checked })),
            }),
            h('span', null, t('official.switch')))),
        h('div', { className: 'sah-section' },
          h('h3', { className: 'sah-title' }, t('routes.title')),
          h('p', { className: 'sah-hint' }, t('routes.hint')),
          catalog.status === 'error'
            ? h('p', { className: 'sah-notice sah-status-error' }, t('routes.catalogError'))
            : null,
          catalog.status === 'loading' ? h('p', { className: 'sah-notice' }, t('routes.loading')) : null,
          catalog.status === 'ready' && catalog.groups.length === 0 ? h('p', { className: 'sah-notice' }, t('routes.empty')) : null,
          catalog.failures.length > 0 ? h('p', { className: 'sah-notice' },
            t('routes.unavailable', { names: catalog.failures.map(failure => failure.id ?? failure.name).join(', ') })) : null,
          draft.routes.length === 0
            ? h('p', { className: 'sah-hint' }, t('routes.none'))
            : h('div', { className: 'sah-list' }, draft.routes.map((route, index) => h(RouteCard, {
              key: `${route.provider}/${route.model}/${index}`,
              route,
              index,
              total: draft.routes.length,
              groups: catalog.groups,
              known,
              t,
              onChange: value => updateRoute(index, value),
              onRemove: () => removeRoute(index),
              onMove: moveRoute,
            }))),
          h('div', { className: 'sah-options' },
            h('button', { type: 'button', className: 'sah-btn sah-btn-outline', disabled: !writable, onClick: addRoute }, t('routes.addManual')))),
        h('div', { className: 'sah-section' },
          h('h3', { className: 'sah-title' }, t('agents.title')),
          h('p', { className: 'sah-hint' }, t('agents.hint')),
          draft.agents.length === 0
            ? h('p', { className: 'sah-hint' }, t('agents.none'))
            : h('div', { className: 'sah-list' }, draft.agents.map((agent, index) => h(AgentCard, {
              key: `${agent.id}/${index}`,
              agent,
              index,
              routes: draft.routes,
              presets,
              known,
              t,
              onChange: value => updateAgent(index, value),
              onRemove: () => removeAgent(index),
            }))),
          h('div', { className: 'sah-options' },
            h('button', { type: 'button', className: 'sah-btn sah-btn-outline', disabled: !writable, onClick: addAgent }, t('agents.add')))),
        h('details', { className: 'sah-details' },
          h('summary', null, t('preview.title')),
          catalogPreview(draft) === ''
            ? h('p', { className: 'sah-notice' }, t('preview.empty'))
            : h('pre', { className: 'sah-preview' }, catalogPreview(draft))),
        h('div', { className: 'sah-footer' },
          h('div', { className: 'sah-footer-left' },
            status === undefined
              ? h('span', { className: 'sah-status' }, problem === undefined ? '' : t('invalid', { error: problem }))
              : h('span', {
                className: `sah-status${status.kind === 'error' ? ' sah-status-error' : status.kind === 'warn' ? ' sah-status-warn' : ''}`,
                role: 'status',
              }, status.text)),
          h('button', {
            type: 'button',
            className: 'sah-btn sah-btn-outline',
            disabled: !dirty || busy,
            onClick: discard,
          }, t('discard')),
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
