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
      'routes.addManual': '手动添加路由',
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
      'saved': '已保存，正在同步官方设置…',
      'invalid': '未保存：{error}',
      'unavailable': '这个 profile 没有提供配置表单；请直接编辑 profile 的 cordis.patch.yml。',
      'readOnly': '这个 profile 的配置当前不可写。',
      'saveFailed': '保存失败，请重试。',
      'common.remove': '删除',
      'common.moveUp': '上移',
      'common.moveDown': '下移',
      'route.id': 'id',
      'route.reasoningEffort': 'reasoningEffort',
      'route.note': 'note',
      'route.tags': '能力标签',
      'agent.id': 'id',
      'agent.description': 'description',
      'agent.instructions': 'instructions',
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
      'saved': 'Saved; syncing official settings…',
      'invalid': 'Not saved: {error}',
      'unavailable': 'This profile exposes no configuration form; edit the profile `cordis.patch.yml` directly.',
      'readOnly': 'This profile\'s configuration is not writable right now.',
      'saveFailed': 'The save failed; please try again.',
      'common.remove': 'Remove',
      'common.moveUp': 'Move up',
      'common.moveDown': 'Move down',
      'route.id': 'id',
      'route.reasoningEffort': 'reasoningEffort',
      'route.note': 'note',
      'route.tags': 'Capability tags',
      'agent.id': 'id',
      'agent.description': 'description',
      'agent.instructions': 'instructions',
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
.sah{display:flex;flex-direction:column;gap:24px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.sah-intro{margin:0;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:19px;max-width:72ch}
.sah-section{display:flex;flex-direction:column;gap:10px}
.sah-head{display:flex;flex-direction:column;gap:2px}
.sah-title{margin:0;font-size:14px;font-weight:600;line-height:20px}
.sah-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:17px;max-width:72ch}
.sah-card{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-layer-2);padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.sah-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.sah-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px 14px}
.sah-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.sah-label{color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:16px}
.sah-input{width:100%;box-sizing:border-box;padding:6px 9px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.sah-input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-state-business-primary)}
.sah-textarea{width:100%;box-sizing:border-box;padding:6px 9px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;resize:vertical;min-height:64px}
.sah-mono{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:12px}
.sah-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sah-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sah-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);font-size:11.5px;line-height:18px}
.sah-chip button{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0 2px;font:inherit;line-height:1}
.sah-chip button:hover{color:var(--dsw-alias-state-error-primary)}
.sah-picker{display:flex;flex-direction:column;gap:8px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-layer-2);padding:12px 14px;max-height:320px;overflow:auto}
.sah-group{display:flex;flex-direction:column;gap:4px}
.sah-groupName{color:var(--dsw-alias-label-secondary);font-size:11.5px;font-weight:500}
.sah-model{display:flex;align-items:baseline;gap:8px;padding:2px 0}
.sah-modelRoute{color:var(--dsw-alias-label-tertiary);font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11px}
.sah-notice{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px}
.sah-error{color:var(--dsw-alias-state-error-primary)}
.sah-preview{margin:8px 0 0;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11.5px;line-height:18px;white-space:pre-wrap;overflow:auto}
.sah-details summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px}
.sah-empty{padding:14px;border:.5px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,8px);color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center}
`

    const style = () => h('style', { key: 'css' }, CSS)

    const Field = (label, key, control) => h('label', { className: 'sah-field', key },
      h('span', { className: 'sah-label' }, label),
      control)

    const TextInput = (value, onChange, extra = {}) => h('input', {
      className: 'sah-input',
      value,
      onChange: event => onChange(event.target.value),
      ...extra,
    })

    /** A tag chip with a remove control. */
    function Chip({ tag, onRemove }) {
      return h('span', { className: 'sah-chip' },
        tag,
        onRemove === undefined ? null : h('button', { type: 'button', onClick: () => onRemove(tag), 'aria-label': `remove ${tag}` }, '×'))
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
          style: { flex: '1 1 120px', minWidth: '120px' },
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

    /** The official switch, or a plain checkbox when the shell lacks the primitive. */
    function Toggle({ checked, onChange, label, disabled }) {
      if (P.Switch !== undefined) return h(P.Switch, { checked, onChange, label, disabled })
      return h('label', { className: 'sah-model' },
        h('input', { type: 'checkbox', checked, disabled, onChange: event => onChange(event.target.checked) }),
        h('span', null, label))
    }

    /** The official checkbox, or a plain one. */
    function Check({ checked, onChange, label, disabled }) {
      if (P.Checkbox !== undefined) return h(P.Checkbox, { checked, onChange, label, disabled })
      return h('label', { className: 'sah-model' },
        h('input', { type: 'checkbox', checked, disabled, onChange: event => onChange(event.target.checked) }),
        h('span', null, label))
    }

    /** A small text button. */
    function SmallButton({ title, onClick, disabled, children }) {
      if (P.Button !== undefined) {
        return h(P.Button, { variant: 'ghost', size: 'sm', title, onClick, disabled, 'aria-label': title }, children)
      }
      return h('button', {
        type: 'button',
        title,
        'aria-label': title,
        disabled,
        onClick,
        style: {
          appearance: 'none',
          cursor: disabled ? 'default' : 'pointer',
          border: '.5px solid var(--dsw-alias-border-l2)',
          borderRadius: 'var(--dsw-radius-sm,6px)',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          fontSize: '11.5px',
          padding: '2px 8px',
        },
      }, children)
    }

    /** The official form shell (save button, read-only notice) or a plain footer. */
    function FormShell({ state, labels, onSave, onDiscard, children }) {
      if (P.SettingsForm !== undefined) {
        return h(P.SettingsForm, { state, labels, onSave, onDiscard, children })
      }
      return h('div', { className: 'sah-section' },
        children,
        h('div', { className: 'sah-actions' },
          h('button', { type: 'button', onClick: onSave, disabled: !state.writable || state.saving }, state.saving ? labels.saving : labels.save)))
    }

    // ── sections ─────────────────────────────────────────────────────────────────────────────────

    /** The catalog picker: every model the Host advertises, grouped by provider. */
    function ModelPicker({ catalog, selected, onToggle, t }) {
      const groups = filterCatalog(catalog.groups, catalog.query)
      if (catalog.status === 'loading') return h('p', { className: 'sah-notice' }, t('routes.loading'))
      if (catalog.status === 'error') {
        return h('div', { className: 'sah-row' },
          h('p', { className: 'sah-notice sah-error' }, t('routes.catalogError')),
          h(SmallButton, { title: t('routes.retry'), onClick: catalog.retry }, t('routes.retry')))
      }
      if (groups.length === 0) return h('p', { className: 'sah-notice' }, t('routes.empty'))
      return h('div', { className: 'sah-picker' },
        groups.map(group => h('div', { className: 'sah-group', key: group.id },
          h('div', { className: 'sah-groupName' }, group.name || group.id),
          group.models.map(model => h('div', { className: 'sah-model', key: `${group.id}/${model.id}` },
            h(Check, {
              checked: selected.has(routeKey(group.id, model.id)),
              label: model.name || model.id,
              onChange: () => onToggle(group.id, model.id),
            }),
            h('span', { className: 'sah-modelRoute' }, `${group.id}/${model.id}`))))))
    }

    /** One selected route: identity, capability tags, note, order. */
    function RouteCard({ route, index, total, onChange, onRemove, onMove, known, t }) {
      const set = patch => onChange({ ...route, ...patch })
      return h('div', { className: 'sah-card' },
        h('div', { className: 'sah-row' },
          h('span', { className: 'sah-mono' }, `${route.provider || '—'}/${route.model || '—'}`),
          h('div', { className: 'sah-actions' },
            h(SmallButton, { title: t('common.moveUp'), onClick: () => onMove(index, -1), disabled: index === 0 }, '↑'),
            h(SmallButton, { title: t('common.moveDown'), onClick: () => onMove(index, 1), disabled: index === total - 1 }, '↓'),
            h(SmallButton, { title: t('common.remove'), onClick: onRemove }, '×'))),
        h('div', { className: 'sah-grid' },
          Field(t('route.id'), `route-id-${index}`, TextInput(route.id, value => set({ id: value }), { placeholder: 'flash' })),
          Field(t('route.reasoningEffort'), `route-effort-${index}`, TextInput(route.reasoningEffort, value => set({ reasoningEffort: value }), { placeholder: 'high' })),
          Field(t('route.note'), `route-note-${index}`, TextInput(route.note, value => set({ note: value }), { placeholder: 'DeepSeek Flash' })),
          Field(t('route.tags'), `route-tags-${index}`, h(TagInput, {
            tags: route.tags,
            placeholder: t('routes.tagPlaceholder'),
            onChange: tags => set({ tags }),
          }))),
        known.length > 0 ? h('div', { className: 'sah-tags' },
          h('span', { className: 'sah-label' }, t('routes.suggestions', { tags: known.join(', ') })),
          known.map(tag => h('button', {
            key: tag,
            type: 'button',
            className: 'sah-chip',
            onClick: () => set({ tags: route.tags.includes(tag) ? removeTag(route.tags, tag) : addTag(route.tags, tag) }),
          }, tag))) : null)
    }

    /** One named agent: identity, purpose, persona, allowed routes, tags, base preset. */
    function AgentCard({ agent, index, routes, presets, onChange, onRemove, known, t }) {
      const set = patch => onChange({ ...agent, ...patch })
      const toggleRoute = id => {
        const next = agent.routes.includes(id)
          ? agent.routes.filter(item => item !== id)
          : [...agent.routes, id]
        set({ routes: next })
      }
      return h('div', { className: 'sah-card' },
        h('div', { className: 'sah-row' },
          h('span', { className: 'sah-mono' }, t('agents.presetId', { id: agent.id ? `hub-agent-${agent.id}` : 'hub-agent-<id>' })),
          h(SmallButton, { title: t('common.remove'), onClick: onRemove }, '×')),
        h('div', { className: 'sah-grid' },
          Field(t('agent.id'), `agent-id-${index}`, TextInput(agent.id, value => set({ id: value }), { placeholder: 'reviewer' })),
          Field(t('agent.description'), `agent-desc-${index}`, TextInput(agent.description, value => set({ description: value }), { placeholder: 'Reviews a diff and reports findings' }))),
        Field(t('agent.instructions'), `agent-instructions-${index}`, h('textarea', {
          className: 'sah-textarea',
          rows: 3,
          value: agent.instructions,
          placeholder: 'Report findings only; never edit files.',
          onChange: event => set({ instructions: event.target.value }),
        })),
        h('div', { className: 'sah-field' },
          h('span', { className: 'sah-label' }, t('agents.routesLabel')),
          routes.length === 0
            ? h('p', { className: 'sah-notice' }, t('agents.anyModel'))
            : h('div', { className: 'sah-tags' }, routes.map(route => h(Check, {
              key: route.id,
              checked: agent.routes.includes(route.id),
              label: `${route.id} = ${route.provider}/${route.model}`,
              onChange: () => toggleRoute(route.id),
            })))),
        h('div', { className: 'sah-grid' },
          Field(t('agents.needs'), `agent-needs-${index}`, h(TagInput, {
            tags: agent.needs,
            placeholder: t('routes.tagPlaceholder'),
            onChange: needs => set({ needs }),
          })),
          Field(t('agents.basePreset'), `agent-preset-${index}`, h('select', {
            className: 'sah-input',
            value: agent.basePreset,
            onChange: event => set({ basePreset: event.target.value }),
          }, presets.map(preset => h('option', { key: preset.id, value: preset.id }, preset.name ?? preset.id))))),
        known.length > 0 ? h('div', { className: 'sah-tags' },
          h('span', { className: 'sah-label' }, t('routes.suggestions', { tags: known.join(', ') })),
          known.map(tag => h('button', {
            key: tag,
            type: 'button',
            className: 'sah-chip',
            onClick: () => set({ needs: agent.needs.includes(tag) ? removeTag(agent.needs, tag) : addTag(agent.needs, tag) }),
          }, tag))) : null)
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

    /** The page itself: the draft editor plus the save footer. */
    function ConfigPage({ view = 'page', form, t, ctx }) {
      const value = form?.state?.value ?? {}
      const initial = React.useMemo(() => draftsOf(value), [])
      const [draft, setDraft] = React.useState(initial)
      const [catalog, setCatalog] = React.useState({ status: 'loading', groups: [], failures: [], query: '' })
      const [presets, setPresets] = React.useState([{ id: 'standard', name: 'standard' }])
      const [status, setStatus] = React.useState(undefined)
      const [busy, setBusy] = React.useState(false)
      const writable = form !== undefined && form.state?.writable !== false
      const hydrated = React.useRef(form?.state?.status !== 'loading')
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
          // the preset roster is optional; the base preset list stays in place
        }
      }, [ctx, loadCatalog])

      if (view === 'summary') {
        return h('span', null, t('summary', {
          routes: Array.isArray(value.routes) ? value.routes.length : 0,
          agents: Array.isArray(value.agents) ? value.agents.length : 0,
          managed: value.manageOfficialSettings === true ? t('summary.managedOn') : t('summary.managedOff'),
        }))
      }

      const selected = new Set(draft.routes.map(route => routeKey(route.provider, route.model)))
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
      const toggleModel = (provider, model) => setDraft(current => {
        const key = routeKey(provider, model)
        const index = current.routes.findIndex(route => routeKey(route.provider, route.model) === key)
        if (index >= 0) {
          const routes = current.routes.filter((_, at) => at !== index)
          return { ...current, routes }
        }
        const taken = new Set(current.routes.map(route => route.id))
        const route = { id: uniqueRouteId(model, taken), provider, model, reasoningEffort: '', tags: [], note: '' }
        return { ...current, routes: [...current.routes, route] }
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
        } catch (error) {
          setStatus({ kind: 'error', text: String(error?.message ?? error) })
        } finally {
          setBusy(false)
        }
      }

      const shellState = {
        available: form !== undefined,
        writable,
        dirty,
        invalid: problem !== undefined,
        saving: busy,
        failed: status?.kind === 'error',
      }
      const labels = {
        unavailable: t('unavailable'),
        readOnly: t('readOnly'),
        saveFailed: t('saveFailed'),
        save: t('save'),
        saving: t('saving'),
      }

      return h('div', { className: 'sah' },
        style(),
        h('p', { className: 'sah-intro' }, t('intro')),
        h('section', { className: 'sah-section' },
          h('div', { className: 'sah-head' }, h('h3', { className: 'sah-title' }, t('official.title'))),
          h('p', { className: 'sah-hint' }, t('official.hint')),
          h('div', { className: 'sah-row' },
            h(Toggle, {
              checked: draft.manageOfficialSettings,
              disabled: !writable,
              label: t('official.switch'),
              onChange: value => setDraft(current => ({ ...current, manageOfficialSettings: value })),
            }))),
        h('section', { className: 'sah-section' },
          h('div', { className: 'sah-head' }, h('h3', { className: 'sah-title' }, t('routes.title'))),
          h('p', { className: 'sah-hint' }, t('routes.hint')),
          h('input', {
            className: 'sah-input',
            value: catalog.query,
            placeholder: t('routes.search'),
            onChange: event => setCatalog(current => ({ ...current, query: event.target.value })),
          }),
          h(ModelPicker, {
            catalog: { ...catalog, retry: loadCatalog },
            selected,
            onToggle: toggleModel,
            t,
          }),
          catalog.failures?.length > 0 ? h('p', { className: 'sah-notice' },
            t('routes.unavailable', { names: catalog.failures.map(failure => failure.id ?? failure.name).join(', ') })) : null,
          h('div', { className: 'sah-head' }, h('h4', { className: 'sah-title' }, t('routes.selected'))),
          draft.routes.length === 0
            ? h('div', { className: 'sah-empty' }, t('routes.none'))
            : h('div', { className: 'sah-section' }, draft.routes.map((route, index) => h(RouteCard, {
              key: `${route.provider}/${route.model}/${index}`,
              route,
              index,
              total: draft.routes.length,
              known,
              t,
              onChange: value => updateRoute(index, value),
              onRemove: () => removeRoute(index),
              onMove: moveRoute,
            }))),
          h('div', { className: 'sah-actions' },
            h(SmallButton, {
              title: t('routes.addManual'),
              onClick: () => setDraft(current => {
                const taken = new Set(current.routes.map(route => route.id))
                return { ...current, routes: [...current.routes, { id: uniqueRouteId('route', taken), provider: '', model: '', reasoningEffort: '', tags: [], note: '' }] }
              }),
            }, t('routes.addManual')))),
        h('section', { className: 'sah-section' },
          h('div', { className: 'sah-head' }, h('h3', { className: 'sah-title' }, t('agents.title'))),
          h('p', { className: 'sah-hint' }, t('agents.hint')),
          draft.agents.length === 0
            ? h('div', { className: 'sah-empty' }, t('agents.none'))
            : h('div', { className: 'sah-section' }, draft.agents.map((agent, index) => h(AgentCard, {
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
          h('div', { className: 'sah-actions' },
            h(SmallButton, { title: t('agents.add'), onClick: addAgent }, t('agents.add')))),
        h('details', { className: 'sah-details' },
          h('summary', null, t('preview.title')),
          catalogPreview(draft) === ''
            ? h('p', { className: 'sah-notice' }, t('preview.empty'))
            : h('pre', { className: 'sah-preview' }, catalogPreview(draft))),
        status === undefined ? null : h('p', { className: status.kind === 'ok' ? 'sah-notice' : 'sah-notice sah-error' }, status.text),
        h(FormShell, { state: shellState, labels, onSave: save, onDiscard: () => setDraft(draftsOf(value)) },
          h('span', { className: 'sah-notice' })))
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
      ModelPicker,
      RouteCard,
      AgentCard,
      draftsOf,
      valuesOf,
      saveOps,
      draftProblem,
      catalogPreview,
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
