// Browser half: the configuration page of the `subagent-hub` row on the official Plugins page.
// Hand-written module-loader format (no build step); React comes from the shell's module table.
// Saving writes the plugin's volatile `routes` / `agents` / `manageOfficialSettings` through the
// Host-provided config form; the Host re-registers presets and re-syncs official allowlists.
window.__ModuleLoader__.load({
  id: 'dsh-subagent-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'subagentHub'
    const ROW_CONFIG_KEY = 'dsh-subagent-hub#subagent-hub'

    const zh = {
      'summary': '{routes} 条模型路由 · {agents} 个具名子 agent · 官方设置：{managed}',
      'summary.managedOn': '由本插件托管',
      'summary.managedOff': '未托管',
      'page.intro': '保存后立即生效：具名子 agent 会注册成官方预设（id 为 hub-agent-<id>），路由表会同步成官方子代理模型白名单（需要打开下面的“托管官方设置”）。新会话里官方 subagent 工具即可按 agent_preset / provider / model 选择。',
      'page.official': '官方设置托管',
      'page.officialHint': '打开后，本插件会通过官方配置编辑器写入每个官方预设里 spawn 委派工具行的 allowedAgentPresets，以及 Host 的 subagent-model-selection（enabled + allowedModels）。关闭则完全不动官方配置。开启后官方预设的 config 会固定在 profile 层。',
      'page.officialOn': '由本插件管理官方委派配置',
      'page.routes': '模型路由（= 官方 allowedModels，按顺序）',
      'page.routesHint': '每条给一个 id、provider 和 model。tags 会显示在主 agent 的选择目录里；note 是备注。',
      'page.agents': '具名子 agent',
      'page.agentsHint': 'id 会成为 hub-agent-<id>；description 是“什么时候用它”；instructions 追加到子 agent 人设；routes 填上面路由的 id（不填=可用任意模型）。',
      'page.save': '保存',
      'page.saving': '保存中…',
      'page.saved': '已保存，正在同步官方设置…',
      'page.invalid': '未保存：{error}',
      'page.noForm': 'Host 没有提供这个插件的配置表单；请直接编辑 profile 的 cordis.patch.yml。',
      'page.readonly': '这个 profile 的配置当前不可写。',
      'route.id': 'id',
      'route.provider': 'provider',
      'route.model': 'model',
      'route.reasoningEffort': 'reasoningEffort',
      'route.tags': 'tags（逗号分隔）',
      'route.note': 'note',
      'agent.id': 'id',
      'agent.description': 'description',
      'agent.instructions': 'instructions',
      'agent.routes': 'routes（逗号分隔的路由 id）',
      'agent.needs': 'needs（逗号分隔的标签）',
      'agent.basePreset': 'basePreset',
      'agent.presetId': '官方预设 id：{id}',
      'common.add': '+',
      'common.remove': '-',
    }
    const en = {
      'summary': '{routes} model routes · {agents} named subagents · official settings: {managed}',
      'summary.managedOn': 'managed',
      'summary.managedOff': 'not managed',
      'page.intro': 'Saving applies immediately: named agents are registered as official presets (`hub-agent-<id>`) and the route table is mirrored into the official child-model allowlist (turn on “Manage official settings” below). New sessions then offer the official subagent tool with `agent_preset` / `provider` / `model`.',
      'page.official': 'Official settings',
      'page.officialHint': 'When on, this plugin writes `allowedAgentPresets` onto every official preset\'s spawn delegation row and enables the Host `subagent-model-selection` allowlist (`allowedModels`). When off, it touches no official configuration. Turning it on pins those presets\' config in the profile layer.',
      'page.officialOn': 'Manage the official delegation configuration',
      'page.routes': 'Model routes (= official allowedModels, in order)',
      'page.routesHint': 'Each row needs an id, a provider, and a model. Tags appear in the main agent\'s selection catalog; note is free text.',
      'page.agents': 'Named subagents',
      'page.agentsHint': 'The id becomes `hub-agent-<id>`; description says when to use it; instructions are appended to the child persona; routes lists route ids from above (empty = any configured model).',
      'page.save': 'Save',
      'page.saving': 'Saving…',
      'page.saved': 'Saved; syncing official settings…',
      'page.invalid': 'Not saved: {error}',
      'page.noForm': 'The Host exposes no configuration form for this plugin; edit the profile `cordis.patch.yml` directly.',
      'page.readonly': 'This profile\'s configuration is not writable right now.',
      'route.id': 'id',
      'route.provider': 'provider',
      'route.model': 'model',
      'route.reasoningEffort': 'reasoningEffort',
      'route.tags': 'tags (comma separated)',
      'route.note': 'note',
      'agent.id': 'id',
      'agent.description': 'description',
      'agent.instructions': 'instructions',
      'agent.routes': 'routes (comma separated route ids)',
      'agent.needs': 'needs (comma separated tags)',
      'agent.basePreset': 'basePreset',
      'agent.presetId': 'official preset id: {id}',
      'common.add': '+',
      'common.remove': '-',
    }

    const blankRoute = () => ({ id: '', provider: '', model: '', reasoningEffort: '', tags: [], note: '' })
    const blankAgent = () => ({ id: '', description: '', instructions: '', routes: [], needs: [], basePreset: 'standard' })
    const splitList = text => String(text ?? '').split(',').map(item => item.trim()).filter(item => item !== '')
    const hasRouteContent = route => Boolean(route.id || route.provider || route.model || route.reasoningEffort || route.note || route.tags.length > 0)
    const hasAgentContent = agent => Boolean(agent.id || agent.description || agent.instructions || agent.routes.length > 0 || agent.needs.length > 0 || agent.basePreset !== 'standard')

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

    const CSS = `
.sah-root{display:flex;flex-direction:column;gap:16px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}
.sah-hint{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;margin:0}
.sah-section{display:flex;flex-direction:column;gap:8px}
.sah-sectionHead{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sah-sectionTitle{margin:0;font-size:13px;font-weight:600;line-height:20px}
.sah-card{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;align-items:end;padding:10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2)}
.sah-field{display:flex;flex-direction:column;gap:3px;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary)}
.sah-input,.sah-textarea{width:100%;box-sizing:border-box;padding:4px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.sah-textarea{grid-column:1/-1;resize:vertical;font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace)}
.sah-btn{appearance:none;cursor:pointer;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;padding:3px 10px}
.sah-btn:disabled{opacity:.45;cursor:default}
.sah-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.sah-btnPrimary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-1);border-color:transparent}
.sah-btnQuiet{align-self:end;justify-self:start}
.sah-footer{display:flex;align-items:center;gap:10px;border-top:.5px solid var(--dsw-alias-border-l1);padding-top:10px}
.sah-ok{color:var(--dsw-alias-state-success-primary)}
.sah-error{color:var(--dsw-alias-state-error-primary)}
.sah-toggle{display:flex;align-items:center;gap:8px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2)}
.sah-toggle input{accent-color:var(--dsw-alias-brand-primary);width:15px;height:15px;margin:0}
.sah-preset{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);color:var(--dsw-alias-label-tertiary);font-size:11px}
`

    const field = (label, key, value, onChange, extra = {}) => h('label', { className: 'sah-field', key },
      h('span', null, label),
      h('input', { className: 'sah-input', value, onChange: event => onChange(event.target.value), ...extra }))

    const listField = (label, key, value, onChange) => field(label, key, value.join(', '), text => onChange(splitList(text)), { placeholder: 'a, b' })

    function SettingsPage({ view = 'page', form, t }) {
      const style = h('style', { key: 'css' }, CSS)
      const value = form?.state?.value ?? {}
      const initial = React.useMemo(() => draftsOf(value), [])
      const [drafts, setDrafts] = React.useState(initial)
      const [status, setStatus] = React.useState(undefined)
      const [busy, setBusy] = React.useState(false)
      const writable = form !== undefined && form.state?.writable !== false
      const update = (kind, index, patch) => setDrafts(current => ({
        ...current,
        [kind]: current[kind].map((row, at) => at === index ? { ...row, ...patch } : row),
      }))
      const remove = (kind, index) => setDrafts(current => ({ ...current, [kind]: current[kind].filter((_, at) => at !== index) }))
      const add = kind => setDrafts(current => ({ ...current, [kind]: [...current[kind], kind === 'routes' ? blankRoute() : blankAgent()] }))

      if (view === 'summary') {
        return h('span', null, t('summary', {
          routes: Array.isArray(value.routes) ? value.routes.length : 0,
          agents: Array.isArray(value.agents) ? value.agents.length : 0,
          managed: value.manageOfficialSettings === true ? t('summary.managedOn') : t('summary.managedOff'),
        }))
      }

      const save = async () => {
        const problem = draftProblem(drafts)
        if (problem !== undefined) {
          setStatus({ kind: 'error', text: t('page.invalid', { error: problem }) })
          return
        }
        setBusy(true)
        try {
          await form.mutate(saveOps(valuesOf(drafts)), form.state?.revision)
          setStatus({ kind: 'ok', text: t('page.saved') })
        } catch (error) {
          setStatus({ kind: 'error', text: String(error?.message ?? error) })
        } finally {
          setBusy(false)
        }
      }

      return h('div', { className: 'sah-root' },
        style,
        h('p', { className: 'sah-hint' }, t('page.intro')),
        form === undefined ? h('p', { className: 'sah-hint' }, t('page.noForm')) : null,
        form !== undefined && !writable ? h('p', { className: 'sah-hint' }, t('page.readonly')) : null,
        h('section', { className: 'sah-section' },
          h('header', { className: 'sah-sectionHead' }, h('h4', { className: 'sah-sectionTitle' }, t('page.official'))),
          h('p', { className: 'sah-hint' }, t('page.officialHint')),
          h('label', { className: 'sah-toggle' },
            h('input', {
              type: 'checkbox',
              checked: drafts.manageOfficialSettings,
              disabled: !writable,
              onChange: event => setDrafts(current => ({ ...current, manageOfficialSettings: event.target.checked })),
            }),
            h('span', null, t('page.officialOn')))),
        h('section', { className: 'sah-section' },
          h('header', { className: 'sah-sectionHead' },
            h('h4', { className: 'sah-sectionTitle' }, t('page.routes')),
            h('button', { type: 'button', className: 'sah-btn', disabled: !writable, onClick: () => add('routes') }, t('common.add'))),
          h('p', { className: 'sah-hint' }, t('page.routesHint')),
          drafts.routes.map((route, index) => h('div', { className: 'sah-card', key: `route-${index}` },
            field(t('route.id'), `rid-${index}`, route.id, text => update('routes', index, { id: text })),
            field(t('route.provider'), `rp-${index}`, route.provider, text => update('routes', index, { provider: text })),
            field(t('route.model'), `rm-${index}`, route.model, text => update('routes', index, { model: text })),
            field(t('route.reasoningEffort'), `re-${index}`, route.reasoningEffort, text => update('routes', index, { reasoningEffort: text })),
            listField(t('route.tags'), `rt-${index}`, route.tags, tags => update('routes', index, { tags })),
            field(t('route.note'), `rn-${index}`, route.note, text => update('routes', index, { note: text })),
            h('button', { type: 'button', className: 'sah-btn sah-btnQuiet', disabled: !writable, onClick: () => remove('routes', index) }, t('common.remove'))))),
        h('section', { className: 'sah-section' },
          h('header', { className: 'sah-sectionHead' },
            h('h4', { className: 'sah-sectionTitle' }, t('page.agents')),
            h('button', { type: 'button', className: 'sah-btn', disabled: !writable, onClick: () => add('agents') }, t('common.add'))),
          h('p', { className: 'sah-hint' }, t('page.agentsHint')),
          drafts.agents.map((agent, index) => h('div', { className: 'sah-card', key: `agent-${index}` },
            field(t('agent.id'), `aid-${index}`, agent.id, text => update('agents', index, { id: text })),
            h('span', { className: 'sah-preset' }, t('agent.presetId', { id: agent.id ? `hub-agent-${agent.id}` : 'hub-agent-<id>' })),
            field(t('agent.description'), `ad-${index}`, agent.description, text => update('agents', index, { description: text })),
            h('label', { className: 'sah-field', key: `ai-${index}` },
              h('span', null, t('agent.instructions')),
              h('textarea', { className: 'sah-textarea', rows: 3, value: agent.instructions, onChange: event => update('agents', index, { instructions: event.target.value }) })),
            listField(t('agent.routes'), `ar-${index}`, agent.routes, routes => update('agents', index, { routes })),
            listField(t('agent.needs'), `an-${index}`, agent.needs, needs => update('agents', index, { needs })),
            field(t('agent.basePreset'), `ab-${index}`, agent.basePreset, text => update('agents', index, { basePreset: text })),
            h('button', { type: 'button', className: 'sah-btn sah-btnQuiet', disabled: !writable, onClick: () => remove('agents', index) }, t('common.remove'))))),
        h('footer', { className: 'sah-footer' },
          h('button', { type: 'button', className: 'sah-btn sah-btnPrimary', disabled: !writable || busy, onClick: save },
            busy ? t('page.saving') : t('page.save')),
          status === undefined ? null : h('span', { className: status.kind === 'ok' ? 'sah-ok' : 'sah-error' }, status.text)))
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'subagent-hub: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: ROW_CONFIG_KEY,
        locale: NS,
      }, props => h(SettingsPage, { ...props, t: props.t ?? t })))
    }

    return {
      inject: ['slots', 'locale'],
      apply,
      // Pure helpers, exported for tests only.
      SettingsPage,
      draftsOf,
      valuesOf,
      saveOps,
      draftProblem,
      NS,
      ROW_CONFIG_KEY,
    }
  },
})
