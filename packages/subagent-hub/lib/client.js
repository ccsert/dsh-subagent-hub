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
    }
  },
})
