// Browser half: a right-sidebar "Routing" page listing each `delegate` run of the current
// Session with the routed model, the model the child actually used, why, and its tokens.
// Hand-written module-loader format (no build step); React comes from the shell's module table.
window.__ModuleLoader__.load({
  id: 'dsh-subagent-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'subagentHub'
    const TAB_ID = 'dsh-subagent-hub/routing'
    const TAB_KIND = 'subagent-hub-routing'
    const CHAT_ADDRESS = 'dsh-resource://subagentchat/session/'

    const zh = {
      'tab.title': '子代理路由',
      'tab.description': '每个子代理用了哪个模型、为什么',
      'empty': '这个会话还没有通过 delegate 派发过子代理。',
      'summary.runs': '{count} 次派发',
      'summary.tokens': '{value} tok',
      'summary.byModel': '按模型',
      'row.general': '通用',
      'row.inherit': '继承父模型',
      'row.actual': '实际运行：{model}',
      'row.pending': '尚未发出请求',
      'row.fallbacks': '跳过 {count} 条路由',
      'row.open': '打开子会话',
      'tokens.unknown': '—',
      'settings.title': '子代理中枢',
      'settings.summary': '{routes} 条模型路由 · {agents} 个具名子代理',
      'settings.routes': '模型路由（按偏好排序）',
      'settings.agents': '具名子代理',
      'settings.routesHint': 'YAML 对象列表：id / provider / model / reasoningEffort / tags / note。标签供 delegate 的 needs 使用。',
      'settings.agentsHint': 'YAML 对象列表：id / description / instructions / routes / needs / basePreset。',
      'settings.save': '保存',
      'settings.saving': '保存中…',
      'settings.saved': '已保存',
      'settings.invalid': '无法解析或结构不对，未保存：{error}',
      'settings.readonly': '这些值来自 profile 配置，当前不可在此页面修改。',
      'settings.notWritable': 'Host 报告配置只读，保存被拒绝。',
      'settings.noForm': 'Host 未提供这个插件的配置表单；请直接编辑 profile 的 cordis.patch.yml。',
      'settings.presetHint': '新会话请选择带 “+ Hub” 的预设（如 standard+hub）才会看到 delegate。',
    }
    const en = {
      'tab.title': 'Subagent routing',
      'tab.description': 'Which model each subagent used, and why',
      'empty': 'No subagents have been delegated in this session yet.',
      'summary.runs': '{count} delegations',
      'summary.tokens': '{value} tok',
      'summary.byModel': 'By model',
      'row.general': 'general',
      'row.inherit': 'inherits parent',
      'row.actual': 'Actually ran: {model}',
      'row.pending': 'No request yet',
      'row.fallbacks': 'skipped {count} route(s)',
      'row.open': 'Open subagent conversation',
      'tokens.unknown': '—',
      'settings.title': 'Subagent Hub',
      'settings.summary': '{routes} routes · {agents} named subagents',
      'settings.routes': 'Model routes (in preference order)',
      'settings.agents': 'Named subagents',
      'settings.routesHint': 'YAML list of mappings: id / provider / model / reasoningEffort / tags / note. Tags feed `needs` in delegate.',
      'settings.agentsHint': 'YAML list of mappings: id / description / instructions / routes / needs / basePreset.',
      'settings.save': 'Save',
      'settings.saving': 'Saving…',
      'settings.saved': 'Saved',
      'settings.invalid': 'Not saved: {error}',
      'settings.readonly': 'These values come from the profile configuration and cannot be edited here.',
      'settings.notWritable': 'The Host reports this configuration as read-only; the save was refused.',
      'settings.noForm': 'The Host exposes no configuration form for this plugin; edit the profile cordis.patch.yml directly.',
      'settings.presetHint': 'Pick a “+ Hub” preset (for example standard+hub) for a new Session to get `delegate`.',
    }

    const routeName = route => `${route.provider}/${route.model}`
    const tokenTotal = usage => usage === undefined
      ? undefined
      : usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
    const formatTokens = value => value === undefined
      ? undefined
      : value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : String(value)

    /**
     * Join routing records with each child's own projections (absent until the child catalog loads).
     * @param runs - `subagentHub.runs` of the parent Session.
     * @param childValues - child id → `{ modelSelection?, tokenUsage? }`.
     */
    function summarize(runs, childValues) {
      const rows = runs.map((run) => {
        const values = childValues[run.subagentId] ?? {}
        const lastUsed = values.modelSelection?.lastUsed ?? undefined
        const routed = routeName(run)
        const actual = lastUsed === undefined || lastUsed === null ? undefined : routeName(lastUsed)
        return { ...run, routed, actual, diverged: actual !== undefined && actual !== routed, tokens: tokenTotal(values.tokenUsage) }
      })
      const byModel = new Map()
      for (const row of rows) {
        const key = row.actual ?? row.routed
        const entry = byModel.get(key) ?? { model: key, runs: 0, tokens: 0, known: 0 }
        entry.runs++
        if (row.tokens !== undefined) {
          entry.tokens += row.tokens
          entry.known++
        }
        byModel.set(key, entry)
      }
      const known = rows.filter(row => row.tokens !== undefined)
      return {
        rows: [...rows].reverse(),
        byModel: [...byModel.values()].sort((a, b) => b.runs - a.runs || a.model.localeCompare(b.model)),
        tokens: known.length === 0 ? undefined : known.reduce((sum, row) => sum + row.tokens, 0),
      }
    }

    const CSS = `
.sah-root{display:flex;flex-direction:column;gap:12px;height:100%;overflow:auto;padding:12px;box-sizing:border-box;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}
.sah-empty{color:var(--dsw-alias-label-secondary);padding:24px 4px;text-align:center}
.sah-summary{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1)}
.sah-summaryHead{display:flex;justify-content:space-between;font-weight:500}
.sah-muted{color:var(--dsw-alias-label-secondary)}
.sah-models{display:flex;flex-direction:column;gap:2px}
.sah-modelRow{display:flex;justify-content:space-between;gap:8px;font-variant-numeric:tabular-nums}
.sah-mono{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sah-list{display:flex;flex-direction:column;gap:2px}
.sah-row{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;padding:8px 10px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:inherit;font:inherit;cursor:pointer}
.sah-row:hover,.sah-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));outline:none}
.sah-line{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.sah-label{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sah-badge{flex:none;padding:0 6px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:16px}
.sah-reason{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.sah-warn{color:var(--dsw-alias-state-warn-primary);font-size:11px;line-height:16px}
.sah-settings{display:flex;flex-direction:column;gap:16px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}
.sah-summaryLine{color:var(--dsw-alias-label-secondary)}
.sah-section{display:flex;flex-direction:column;gap:8px}
.sah-sectionHead{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sah-sectionTitle{margin:0;font-size:13px;font-weight:600;line-height:20px}
.sah-hint{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;margin:0}
.sah-rowCard{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;align-items:end;padding:10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2)}
.sah-field{display:flex;flex-direction:column;gap:3px;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary)}
.sah-fieldLabel{color:var(--dsw-alias-label-secondary)}
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
`

    function RoutingTab({ sessionId, useProjection, useSessions, t, open, refresh }) {
      const projection = useProjection('subagentHub')
      const runs = projection?.runs ?? []
      const childIds = runs.map(run => run.subagentId).join('\n')
      const projections = useSessions(state => state.projectionsBySession)
      React.useEffect(() => {
        if (runs.length > 0) refresh(sessionId)
      }, [sessionId, childIds])
      const childValues = {}
      for (const run of runs) childValues[run.subagentId] = projections?.[run.subagentId]?.values ?? {}
      const view = summarize(runs, childValues)
      const style = h('style', { key: 'css' }, CSS)
      if (runs.length === 0) return h('div', { className: 'sah-root' }, style, h('div', { className: 'sah-empty' }, t('empty')))
      return h('div', { className: 'sah-root' },
        style,
        h('section', { className: 'sah-summary', 'aria-label': t('tab.title') },
          h('div', { className: 'sah-summaryHead' },
            h('span', null, t('summary.runs', { count: runs.length })),
            h('span', { className: 'sah-muted' }, view.tokens === undefined ? t('tokens.unknown') : t('summary.tokens', { value: formatTokens(view.tokens) }))),
          h('div', { className: 'sah-muted' }, t('summary.byModel')),
          h('div', { className: 'sah-models' }, view.byModel.map(entry => h('div', { key: entry.model, className: 'sah-modelRow' },
            h('span', { className: 'sah-mono', title: entry.model }, entry.model),
            h('span', { className: 'sah-muted' }, `×${entry.runs}${entry.known > 0 ? ` · ${formatTokens(entry.tokens)}` : ''}`))))),
        h('div', { className: 'sah-list', role: 'list' }, view.rows.map(row => h('button', {
          key: row.callId,
          type: 'button',
          role: 'listitem',
          className: 'sah-row',
          title: t('row.open'),
          onClick: () => open(sessionId, row.subagentId),
        },
        h('div', { className: 'sah-line' },
          h('span', { className: 'sah-label' }, row.label ?? row.subagentId),
          h('span', { className: 'sah-badge' }, row.agent ?? t('row.general'))),
        h('div', { className: 'sah-line' },
          h('span', { className: 'sah-mono', title: row.routed }, row.mode === 'inherit' ? `${row.routed} · ${t('row.inherit')}` : row.routed),
          h('span', { className: 'sah-muted' }, formatTokens(row.tokens) ?? t('tokens.unknown'))),
        row.diverged ? h('div', { className: 'sah-warn' }, t('row.actual', { model: row.actual })) : null,
        h('div', { className: 'sah-reason' }, row.reason + (row.fallbacks.length > 0 ? ` · ${t('row.fallbacks', { count: row.fallbacks.length })}` : '')),
        ))))
    }


    // ── Settings page: routes and named agents, saved through the Host's config form ──────────

    const blankRoute = () => ({ id: '', provider: '', model: '', reasoningEffort: '', tags: [] })
    const blankAgent = () => ({ id: '', description: '', instructions: '', routes: [], needs: [], basePreset: 'standard' })
    const splitList = text => String(text ?? '').split(',').map(item => item.trim()).filter(item => item !== '')

    /** Draft rows from a saved config value; unknown fields are dropped. */
    function draftsOf(value) {
      const routes = Array.isArray(value?.routes) ? value.routes : []
      const agents = Array.isArray(value?.agents) ? value.agents : []
      return {
        routes: routes.map(route => ({
          id: String(route?.id ?? ''),
          provider: String(route?.provider ?? ''),
          model: String(route?.model ?? ''),
          reasoningEffort: String(route?.reasoningEffort ?? ''),
          tags: Array.isArray(route?.tags) ? route.tags.map(String) : [],
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

    /** Turn drafts back into config values, dropping the fields a row left empty. */
    function valuesOf(drafts) {
      const routes = drafts.routes
        .filter(route => route.id && route.provider && route.model)
        .map(route => ({
          id: route.id, provider: route.provider, model: route.model,
          ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}),
          ...(route.tags.length > 0 ? { tags: route.tags } : {}),
        }))
      const agents = drafts.agents
        .filter(agent => agent.id && agent.description)
        .map(agent => ({
          id: agent.id,
          description: agent.description,
          instructions: agent.instructions,
          ...(agent.routes.length > 0 ? { routes: agent.routes } : {}),
          ...(agent.needs.length > 0 ? { needs: agent.needs } : {}),
          ...(agent.basePreset && agent.basePreset !== 'standard' ? { basePreset: agent.basePreset } : {}),
        }))
      return { routes, agents }
    }

    /** The atomic mutate operations one save performs, against a single revision. */
    function saveOps(values) {
      return [
        { op: 'set', path: ['routes'], value: values.routes },
        { op: 'set', path: ['agents'], value: values.agents },
      ]
    }

    /** Validate drafts the way the Host will; returns a message or undefined. */
    function draftProblem(drafts) {
      const seen = new Set()
      for (const route of drafts.routes) {
        if (!route.id || !route.provider || !route.model) return 'route rows need id, provider and model'
        if (seen.has(route.id)) return `duplicate route id "${route.id}"`
        seen.add(route.id)
      }
      const ids = new Set()
      for (const agent of drafts.agents) {
        if (!agent.id || !agent.description) return 'agent rows need id and description'
        if (!/^[a-z][a-z0-9-]{0,47}$/.test(agent.id)) return `agent id "${agent.id}" must be lowercase letters, digits and dashes`
        if (ids.has(agent.id)) return `duplicate agent id "${agent.id}"`
        ids.add(agent.id)
        const missing = agent.routes.filter(id => !seen.has(id))
        if (missing.length > 0) return `agent "${agent.id}" names unknown routes: ${missing.join(', ')}`
      }
      return undefined
    }

    const field = (label, key, value, onChange, extra = {}) => h('label', { className: 'sah-field', key },
      h('span', { className: 'sah-fieldLabel' }, label),
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
        return h('span', { className: 'sah-summaryLine' }, t('settings.summary', {
          routes: Array.isArray(value.routes) ? value.routes.length : 0,
          agents: Array.isArray(value.agents) ? value.agents.length : 0,
        }))
      }

      const save = async () => {
        const problem = draftProblem(drafts)
        if (problem !== undefined) {
          setStatus({ kind: 'error', text: t('settings.invalid', { error: problem }) })
          return
        }
        setBusy(true)
        try {
          await form.mutate(saveOps(valuesOf(drafts)), form.state?.revision)
          setStatus({ kind: 'ok', text: t('settings.saved') })
        } catch (error) {
          setStatus({ kind: 'error', text: String(error?.message ?? error) })
        } finally {
          setBusy(false)
        }
      }

      return h('div', { className: 'sah-settings' },
        style,
        h('p', { className: 'sah-hint' }, t('settings.presetHint')),
        form === undefined ? h('p', { className: 'sah-hint' }, t('settings.noForm')) : null,
        form !== undefined && !writable ? h('p', { className: 'sah-hint' }, t('settings.notWritable')) : null,
        h('section', { className: 'sah-section' },
          h('header', { className: 'sah-sectionHead' },
            h('h4', { className: 'sah-sectionTitle' }, t('settings.routes')),
            h('button', { type: 'button', className: 'sah-btn', disabled: !writable, onClick: () => add('routes') }, '+')),
          h('p', { className: 'sah-hint' }, t('settings.routesHint')),
          drafts.routes.map((route, index) => h('div', { className: 'sah-rowCard', key: `route-${index}` },
            field('id', `rid-${index}`, route.id, text => update('routes', index, { id: text })),
            field('provider', `rp-${index}`, route.provider, text => update('routes', index, { provider: text })),
            field('model', `rm-${index}`, route.model, text => update('routes', index, { model: text })),
            field('reasoningEffort', `re-${index}`, route.reasoningEffort, text => update('routes', index, { reasoningEffort: text })),
            listField('tags', `rt-${index}`, route.tags, tags => update('routes', index, { tags })),
            h('button', { type: 'button', className: 'sah-btn sah-btnQuiet', disabled: !writable, onClick: () => remove('routes', index) }, '-')))),
        h('section', { className: 'sah-section' },
          h('header', { className: 'sah-sectionHead' },
            h('h4', { className: 'sah-sectionTitle' }, t('settings.agents')),
            h('button', { type: 'button', className: 'sah-btn', disabled: !writable, onClick: () => add('agents') }, '+')),
          h('p', { className: 'sah-hint' }, t('settings.agentsHint')),
          drafts.agents.map((agent, index) => h('div', { className: 'sah-rowCard', key: `agent-${index}` },
            field('id', `aid-${index}`, agent.id, text => update('agents', index, { id: text })),
            field('description', `ad-${index}`, agent.description, text => update('agents', index, { description: text })),
            h('label', { className: 'sah-field', key: `ai-${index}` },
              h('span', { className: 'sah-fieldLabel' }, 'instructions'),
              h('textarea', { className: 'sah-textarea', rows: 3, value: agent.instructions, onChange: event => update('agents', index, { instructions: event.target.value }) })),
            listField('routes', `ar-${index}`, agent.routes, routes => update('agents', index, { routes })),
            listField('needs', `an-${index}`, agent.needs, needs => update('agents', index, { needs })),
            field('basePreset', `ab-${index}`, agent.basePreset, text => update('agents', index, { basePreset: text })),
            h('button', { type: 'button', className: 'sah-btn sah-btnQuiet', disabled: !writable, onClick: () => remove('agents', index) }, '-')))),
        h('footer', { className: 'sah-footer' },
          h('button', { type: 'button', className: 'sah-btn sah-btnPrimary', disabled: !writable || busy, onClick: save },
            busy ? t('settings.saving') : t('settings.save')),
          status === undefined ? null : h('span', { className: status.kind === 'ok' ? 'sah-ok' : 'sah-error' }, status.text)))
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'subagent-hub: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        title: () => t('tab.title'),
        guide: [{ id: 'open', order: 55, title: () => t('tab.title'), description: () => t('tab.description') }],
      }), 'subagent-hub: sidebar tab type')
      const open = (parentSessionId, childSessionId) => {
        const query = new URLSearchParams({ parent: parentSessionId, mode: 'continuable' })
        ctx.sidebarRight.openResource(`${CHAT_ADDRESS}${encodeURIComponent(childSessionId)}?${query}`, { kind: 'subagentchat', preferNewPane: true })
      }
      const refresh = parentSessionId => ctx.sessions.refreshProjections(parentSessionId)
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: 'dsh-subagent-hub#subagent-hub',
        locale: NS,
      }, props => h(SettingsPage, { ...props, t: props.t ?? t })))
      ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        locale: NS,
      }, props => h(RoutingTab, { ...props, t: props.t ?? t, open, refresh })))
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'sidebarRight', 'sidebarRightTabs'],
      apply,
      // Pure helpers, exported for tests only.
      summarize,
      RoutingTab,
      SettingsPage,
      draftsOf,
      valuesOf,
      saveOps,
      draftProblem,
    }
  },
})
