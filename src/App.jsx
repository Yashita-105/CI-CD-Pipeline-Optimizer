import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import {
  Activity, AlertTriangle, BarChart3, Bell, CheckCircle2, ChevronDown, CircleHelp,
  Clock3, GitBranch, Github, LayoutDashboard, Link2, ListChecks, LogOut, Menu,
  MoreHorizontal, PlayCircle, RefreshCw, Search, Settings, ShieldCheck, SlidersHorizontal,
  User, X, ExternalLink, Square, RotateCcw, Play, Sun, Moon, LogIn, Gauge, ShieldAlert
} from 'lucide-react'

const api = async (path, options = {}) => {
  const response = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/pipelines', label: 'Pipelines', icon: PlayCircle },
  { to: '/recommendations', label: 'Recommendations', icon: ListChecks },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/integrations', label: 'Integrations', icon: Link2 },
  { to: '/settings', label: 'Settings', icon: Settings }
]

function App() {
  const [auth, setAuth] = useState({ loading: true, authenticated: false, user: null })
  const [repos, setRepos] = useState([])
  const [repo, setRepo] = useState(null)
  const [range, setRange] = useState('30 days')
  const [toast, setToast] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')

  const notify = useCallback((message) => {
    setToast(message)
    window.clearTimeout(window.__toastTimer)
    window.__toastTimer = window.setTimeout(() => setToast(''), 3000)
  }, [])

  const load = useCallback(async () => {
    try {
      const status = await api('/api/auth/status')
      setAuth({ loading: false, ...status })
      if (!status.authenticated) return
      const data = await api('/api/repositories')
      setRepos(data)
      const saved = localStorage.getItem('selectedRepo')
      setRepo(data.find(r => r.fullName === saved) || data[0] || null)
    } catch (e) {
      setAuth({ loading: false, authenticated: false, user: null })
      notify(e.message)
    }
  }, [notify])

  useEffect(() => { load() }, [load])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme) }, [theme])

  if (auth.loading) return <div className="auth-screen"><Activity className="spin" size={28} /><strong>Loading Pipeline Optimizer…</strong></div>
  if (!auth.authenticated) return <LoginScreen />
  if (!repo) return <div className="auth-screen"><Github size={30} /><strong>No accessible repositories were found.</strong><button className="button button-primary" onClick={() => window.location.reload()}>Refresh</button></div>

  const changeRepo = (next) => { setRepo(next); localStorage.setItem('selectedRepo', next.fullName) }
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }); setAuth({ loading: false, authenticated: false, user: null }) }

  return <div className="app-shell">
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={auth.user} repos={repos} onLogout={logout} />
    <div className="app-main">
      <Topbar repo={repo} repos={repos} onRepoChange={changeRepo} onMenu={() => setSidebarOpen(true)} onNotify={notify} user={auth.user} theme={theme} onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
      <main className="content">
        <Routes>
          <Route path="/" element={<Overview repo={repo} range={range} setRange={setRange} notify={notify} />} />
          <Route path="/pipelines" element={<Pipelines repo={repo} notify={notify} />} />
          <Route path="/recommendations" element={<Recommendations repo={repo} notify={notify} />} />
          <Route path="/analytics" element={<Analytics repo={repo} range={range} setRange={setRange} />} />
          <Route path="/integrations" element={<Integrations notify={notify} />} />
          <Route path="/settings" element={<SettingsPage user={auth.user} notify={notify} />} />
        </Routes>
      </main>
    </div>
    {toast && <div className="toast"><CheckCircle2 size={16} />{toast}</div>}
  </div>
}

function LoginScreen() {
  return <div className="auth-screen">
    <div className="auth-card">
      <div className="brand-mark"><Activity size={21} /></div>
      <div className="eyebrow">CI/CD MONITORING</div>
      <h1>Pipeline Optimizer</h1>
      <p>Connect GitHub to inspect real repositories, GitHub Actions runs and pipeline performance.</p>
      <a className="button button-primary login-button" href="/api/auth/github"><Github size={18} /> Continue with GitHub</a>
      <small>GitHub permissions are requested only through GitHub's OAuth consent screen.</small>
    </div>
  </div>
}

function Sidebar({ open, onClose, user, repos, onLogout }) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  return <>
    {open && <div className="mobile-backdrop" onClick={onClose} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Activity size={19} /></div><div><strong>Pipeline Optimizer</strong><span>CI/CD monitoring</span></div><button className="icon-button sidebar-close" onClick={onClose}><X size={18} /></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-menu-wrap"><button className="workspace-select workspace-button" onClick={() => setWorkspaceOpen(v => !v)} aria-expanded={workspaceOpen}><div className="avatar">{initials(user.name || user.login)}</div><div><strong>{user.name || user.login}</strong><span>GitHub workspace</span></div><ChevronDown size={15} className={workspaceOpen ? 'chevron-open' : ''} /></button>{workspaceOpen && <div className="workspace-dropdown"><div className="workspace-dropdown-head"><strong>@{user.login}</strong><span><i /> GitHub connected</span></div><div className="workspace-meta"><span>Accessible repositories</span><strong>{repos.length}</strong></div><button onClick={() => { setWorkspaceOpen(false); onLogout() }}><LogOut size={15} /> Sign out</button></div>}</div>
      <nav className="nav">{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={onClose}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-card"><div className="sidebar-card-icon"><CircleHelp size={17} /></div><div><strong>Live GitHub data</strong><span>Runs and workflow actions come directly from GitHub.</span></div></div>
      <button className="user-card user-card-button" onClick={onLogout}><div className="avatar">{initials(user.name || user.login)}</div><div><strong>{user.name || user.login}</strong><span>@{user.login} · Sign out</span></div><LogOut size={17} /></button>
    </aside>
  </>
}

function Topbar({ repo, repos, onRepoChange, onMenu, onNotify, user, theme, onToggleTheme }) {
  const refresh = () => { onNotify('Refreshing live GitHub data…'); window.location.reload() }
  return <header className="topbar">
    <button className="icon-button mobile-menu" onClick={onMenu}><Menu size={20} /></button>
    <div className="breadcrumb"><span>Workspace</span><span>/</span><strong>{repo.name}</strong></div>
    <div className="topbar-actions">
      <div className="repo-picker"><GitBranch size={16} /><select value={repo.fullName} onChange={e => onRepoChange(repos.find(r => r.fullName === e.target.value))}>{repos.map(r => <option key={r.id} value={r.fullName}>{r.fullName}</option>)}</select></div>
      <button className="icon-button" onClick={refresh} title="Refresh"><RefreshCw size={17} /></button><button className="icon-button theme-toggle" onClick={onToggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
      <button className="icon-button" onClick={() => onNotify(`Signed in as @${user.login}`)} title="Account"><Bell size={17} /></button>
      <div className="top-user"><div className="avatar">{initials(user.name || user.login)}</div><span>{user.login}</span><ChevronDown size={14} /></div>
    </div>
  </header>
}

function PageTitle({ eyebrow, title, description, actions }) { return <div className="page-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div> }

function Overview({ repo, range, setRange, notify }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => { setLoading(true); try { setData(await api(`/api/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/actions/runs?per_page=50`)) } catch (e) { notify(e.message) } finally { setLoading(false) } }, [repo, notify])
  useEffect(() => { refresh() }, [refresh])
  const runs = filterByRange(data?.runs || [], range)
  const analysis = calculateClientAnalysis(runs)
  const chart = chartData(runs)
  const stages = deriveStages(runs)
  return <>
    <PageTitle eyebrow="PIPELINE OVERVIEW" title="Repository health" description={`A live view of ${repo.fullName}'s GitHub Actions performance.`} actions={<><select className="select-control" value={range} onChange={e => setRange(e.target.value)}><option>7 days</option><option>30 days</option><option>90 days</option></select><button className="button button-primary" disabled={loading} onClick={() => { refresh(); notify('Live pipeline analysis refreshed') }}><Activity size={16} /> {loading ? 'Analyzing…' : 'Analyze pipeline'}</button></>} />
    <section className="stat-grid"><StatCard label="Success rate" value={`${analysis.successRate}%`} detail={`${analysis.runs} live runs analyzed`} icon={CheckCircle2} tone="success" /><StatCard label="Average duration" value={`${analysis.avgDuration} min`} detail="From completed Actions runs" icon={Clock3} tone="blue" /><StatCard label="Pipeline runs" value={analysis.runs} detail={`${range} view · live API`} icon={PlayCircle} tone="neutral" /><StatCard label="Failed runs" value={analysis.failures} detail={analysis.failures ? 'Needs attention' : 'No failures in fetched history'} icon={AlertTriangle} tone={analysis.failures ? 'warning' : 'success'} /></section>
    <section className="two-col"><Panel title="Pipeline duration" subtitle="Recent GitHub Actions runs"><LineChart data={chart.durations} suffix=" min" /></Panel><Panel title="Success rate" subtitle="Rolling recent runs"><LineChart data={chart.successes} suffix="%" min={0} max={100} /></Panel></section>
    <section className="two-col lower-grid"><Panel title="Current bottlenecks" subtitle="Derived from recent run durations"><div className="bottleneck-list">{stages.map(stage => <div className="bottleneck-row" key={stage.name}><div className="stage-name"><span className={`status-dot ${stage.status}`} />{stage.name}</div><div className="stage-bar"><span style={{ width: `${stage.share}%` }} /></div><strong>{stage.duration}m</strong></div>)}</div></Panel><Panel title="Recent pipeline runs" subtitle="Latest execution activity" action={<NavLink className="text-link" to="/pipelines">View all</NavLink>}><RunList runs={runs.slice(0, 5)} /></Panel></section>
  </>
}

function Pipelines({ repo, notify }) {
  const [data, setData] = useState({ runs: [], analysis: {} }); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [selected, setSelected] = useState(null); const [workflows, setWorkflows] = useState([]); const [workflowId, setWorkflowId] = useState(''); const [menuRun, setMenuRun] = useState(null); const [preflight, setPreflight] = useState(false); const [dispatching, setDispatching] = useState(false)
  const refresh = useCallback(async () => { setLoading(true); try { setData(await api(`/api/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/actions/runs?per_page=100`)) } catch (e) { notify(e.message) } finally { setLoading(false) } }, [repo, notify])
  useEffect(() => { refresh(); api(`/api/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/actions/workflows`).then(d => { setWorkflows(d); if (d[0]) setWorkflowId(String(d[0].id)) }).catch(() => {}) }, [refresh, repo])
  const filtered = data.runs.filter(r => `${r.id} ${r.number} ${r.branch} ${r.commit} ${r.name}`.toLowerCase().includes(query.toLowerCase()))
  const action = async (run, type) => { try { await api(`/api/runs/${run.id}/${type}`, { method: 'POST' }); notify(`${type === 'rerun' ? 'Rerun' : 'Cancel'} requested for #${run.number}`); refresh() } catch (e) { notify(e.message) } }
  const dispatch = async () => { if (!workflowId) return notify('No GitHub Actions workflow is available for this repository'); setDispatching(true); try { await api(`/api/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: repo.defaultBranch }) }); notify('Workflow dispatch accepted by GitHub'); setPreflight(false); setTimeout(refresh, 1500) } catch (e) { notify(e.message) } finally { setDispatching(false) } }
  const risk = preRunRisk(data.runs)
  return <>
    <PageTitle eyebrow="PIPELINES" title="Pipeline runs" description={`Live GitHub Actions execution history for ${repo.fullName}.`} actions={<><select className="select-control" value={workflowId} onChange={e => setWorkflowId(e.target.value)} disabled={!workflows.length}><option value="">{workflows.length ? 'Select workflow' : 'No workflows'}</option>{workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select><button className="button button-primary" onClick={() => setPreflight(true)} disabled={!workflowId}><Gauge size={16} /> Pre-run analysis</button><button className="button button-secondary" onClick={() => { refresh(); notify('Live run data refreshed') }}><RefreshCw size={16} /> {loading ? 'Loading…' : 'Refresh'}</button></>} />
    <Panel><div className="table-toolbar"><div className="search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search runs, branches or commits..." /></div><span className="live-pill"><i /> GitHub live</span></div><div className="table-wrap"><table><thead><tr><th>Run</th><th>Workflow</th><th>Branch</th><th>Commit</th><th>Duration</th><th>Status</th><th>Started</th><th /></tr></thead><tbody>{filtered.map(run => <tr key={run.id}><td><strong>#{run.number}</strong></td><td>{run.name}</td><td><span className="mono">{run.branch}</span></td><td><span className="mono">{run.commit}</span></td><td>{run.duration} min</td><td><StatusBadge status={run.status} /></td><td>{formatTime(run.time)}</td><td><button className="icon-button" onClick={() => setMenuRun(menuRun?.id === run.id ? null : run)}><MoreHorizontal size={17} /></button>{menuRun?.id === run.id && <RunMenu run={run} onAction={action} onDetails={() => { setSelected(run); setMenuRun(null) }} onClose={() => setMenuRun(null)} />}</td></tr>)}{!loading && !filtered.length && <tr><td colSpan="8" className="empty-cell">No GitHub Actions runs match this search.</td></tr>}</tbody></table></div></Panel>
    {selected && <RunDetails run={selected} onAction={action} onClose={() => setSelected(null)} />}
    {preflight && <PreflightModal risk={risk} workflow={workflows.find(w => String(w.id) === workflowId)} repo={repo} onClose={() => setPreflight(false)} onRun={dispatch} dispatching={dispatching} />}
    <div className="pipeline-detail-grid"><Panel title="Live health summary" subtitle="Calculated from fetched runs"><div className="health-summary"><div className="health-score">{Math.max(0, Math.min(100, Math.round((data.analysis.successRate || 0) - Math.min(20, (data.analysis.failures || 0) * 2))))}<span>/100</span></div><div><strong>{(data.analysis.successRate || 0) >= 90 ? 'Healthy pipeline' : 'Needs attention'}</strong><p>{data.analysis.runs || 0} runs fetched from GitHub. {data.analysis.failures || 0} completed runs failed.</p></div></div><div className="mini-metrics"><div><span>Success</span><strong>{data.analysis.successRate || 0}%</strong></div><div><span>Avg. duration</span><strong>{data.analysis.avgDuration || 0}m</strong></div><div><span>Failures</span><strong>{data.analysis.failures || 0}</strong></div></div></Panel><Panel title="Repository" subtitle="Connected GitHub source"><div className="explain-list"><Explain number="01" title="Source" text={repo.fullName} /><Explain number="02" title="Default branch" text={repo.defaultBranch} /><Explain number="03" title="Actions" text="Runs can be refreshed, rerun and cancelled from this dashboard." /></div></Panel></div>
  </>
}

function RunMenu({ run, onAction, onDetails, onClose }) {
  return <div className="run-menu" onMouseLeave={onClose}>
    <button onClick={onDetails}><ListChecks size={15} /> View details</button>
    <a href={run.url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open on GitHub</a>
    {run.status === 'running' ? <button onClick={() => { onAction(run, 'cancel'); onClose() }}><Square size={14} /> Cancel run</button> : <button onClick={() => { onAction(run, 'rerun'); onClose() }}><RotateCcw size={15} /> Rerun</button>}
  </div>
}

function RunDetails({ run, onAction, onClose }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal-card" onClick={e => e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">RUN DETAILS</div><h2>#{run.number} · {run.name}</h2></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="detail-grid"><div><span>Status</span><StatusBadge status={run.status} /></div><div><span>Duration</span><strong>{run.duration} min</strong></div><div><span>Branch</span><strong className="mono">{run.branch}</strong></div><div><span>Commit</span><strong className="mono">{run.commit}</strong></div><div><span>Triggered</span><strong>{formatTime(run.time)}</strong></div><div><span>Event</span><strong>{run.event || '—'}</strong></div></div><div className="modal-actions"><a className="button button-secondary" href={run.url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> GitHub run</a>{run.status === 'running' ? <button className="button button-secondary" onClick={() => onAction(run, 'cancel')}><Square size={14} /> Cancel</button> : <button className="button button-primary" onClick={() => onAction(run, 'rerun')}><RotateCcw size={15} /> Rerun workflow</button>}</div></div></div>
}

function PreflightModal({ risk, workflow, repo, onClose, onRun, dispatching }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal-card preflight-card" onClick={e => e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">PRE-RUN RISK ANALYSIS</div><h2>Deployment readiness check</h2><p>{workflow?.name || 'Selected workflow'} · {repo.defaultBranch}</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><div className={`risk-hero risk-${risk.level.toLowerCase()}`}><ShieldAlert size={24} /><div><span>Predicted failure risk</span><strong>{risk.percent}% · {risk.level}</strong><p>{risk.summary}</p></div></div><div className="risk-reasons">{risk.reasons.map((r,i) => <div key={i}><CheckCircle2 size={16} /><span>{r}</span></div>)}</div><div className="preflight-note">Prediction is based on recent GitHub Actions history. It estimates risk; it cannot know the result with certainty before GitHub executes the workflow.</div><div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" onClick={onRun} disabled={dispatching}><Play size={15} /> {dispatching ? 'Starting…' : 'Run workflow anyway'}</button></div></div></div>
}

function Recommendations({ repo, notify }) {
  const [items, setItems] = useState([]); const [loading, setLoading] = useState(true)
  const load = useCallback(async () => { setLoading(true); try { const data = await api(`/api/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/recommendations`); setItems(data.recommendations) } catch (e) { notify(e.message) } finally { setLoading(false) } }, [repo, notify])
  useEffect(() => { load() }, [load])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme) }, [theme])
  return <><PageTitle eyebrow="OPTIMIZATION" title="Recommendations" description="Suggestions generated from your real GitHub Actions run history." actions={<button className="button button-primary" disabled={loading} onClick={() => { load(); notify('Recommendations recalculated from live data') }}><Activity size={16} /> Recalculate</button>} /><div className="recommendation-layout"><div className="recommendation-list">{items.map(r => <article className="recommendation-card" key={r.id}><div className="recommendation-top"><PriorityBadge value={r.priority} /><span>{r.type}</span></div><h3>{r.title}</h3><div className="affected"><GitBranch size={15} /> Affected stage: <strong>{r.stage}</strong></div><p>{r.reason}</p><div className="benefit"><CheckCircle2 size={16} /><strong>Expected benefit:</strong> {r.benefit}</div><div className="recommendation-actions"><button className="button button-secondary" onClick={() => notify(`Recommendation: ${r.title}`)}>View details</button><button className="button button-primary" onClick={async () => { try { await api(`/api/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/recommendations/${encodeURIComponent(r.id)}/review`, { method: 'POST', body: JSON.stringify({ reviewed: true }) }); setItems(items.map(x => x.id === r.id ? { ...x, reviewed: true } : x)); notify('Recommendation saved for review') } catch (e) { notify(e.message) } }}>{r.reviewed ? 'Reviewed' : 'Mark for review'}</button></div></article>)}{!items.length && <Panel><div className="empty-state">{loading ? 'Analyzing live runs…' : 'No recommendations yet. Refresh the pipeline data first.'}</div></Panel>}</div><Panel title="How recommendations work" subtitle="Evidence-based analysis"><div className="explain-list"><Explain number="01" title="Measure" text="Real GitHub Actions run durations, statuses and branches are collected." /><Explain number="02" title="Detect" text="The backend compares the observed history for duration and reliability signals." /><Explain number="03" title="Recommend" text="Detected issues become reviewable optimization suggestions." /></div></Panel></div></>
}

function Analytics({ repo, range, setRange }) {
  const [data, setData] = useState({ runs: [], analysis: {} })
  useEffect(() => { api(`/api/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/actions/runs?per_page=100`).then(setData).catch(() => {}) }, [repo])
  const rangedRuns = filterByRange(data.runs, range); const rangedAnalysis = calculateClientAnalysis(rangedRuns); const chart = chartData(rangedRuns); const stages = deriveStages(rangedRuns)
  return <><PageTitle eyebrow="ANALYTICS" title="Historical analytics" description="Live GitHub Actions performance over the fetched execution history." actions={<select className="select-control" value={range} onChange={e => setRange(e.target.value)}><option>7 days</option><option>30 days</option><option>90 days</option></select>} /><section className="stat-grid"><StatCard label="Avg. duration" value={`${rangedAnalysis.avgDuration || 0} min`} detail="From GitHub runs" icon={Clock3} tone="blue" /><StatCard label="Success rate" value={`${rangedAnalysis.successRate || 0}%`} detail="Completed runs" icon={CheckCircle2} tone="success" /><StatCard label="Failed runs" value={rangedAnalysis.failures || 0} detail="Real GitHub Actions failures" icon={AlertTriangle} tone="warning" /><StatCard label="Runs analyzed" value={rangedAnalysis.runs || 0} detail="Fetched from GitHub" icon={BarChart3} tone="neutral" /></section><Panel title="Average pipeline duration" subtitle={`Live recent runs · ${range}`}><LineChart data={chart.durations} suffix=" min" /></Panel><div className="two-col lower-grid"><Panel title="Run contribution" subtitle="Relative duration of recent runs">{stages.map(s => <div className="bar-row" key={s.name}><div><span>{s.name}</span><strong>{s.share}%</strong></div><div className="wide-bar"><i style={{ width: `${s.share}%` }} /></div></div>)}</Panel><Panel title="Reliability" subtitle="Success rate by recent run"><LineChart data={chart.successes} suffix="%" min={0} max={100} /></Panel></div></>
}

function Integrations({ notify }) {
  const providers = [{ name: 'GitHub Actions', description: 'Connected through GitHub OAuth. Repositories, workflow runs and workflow controls use the GitHub API.', connected: true, icon: Github }, { name: 'GitLab CI/CD', description: 'Provider adapter not implemented yet. The dashboard does not fake a connection.', connected: false, icon: GitBranch }, { name: 'Jenkins', description: 'Provider adapter not implemented yet. Add it as a separate integration when needed.', connected: false, icon: Activity }]
  return <><PageTitle eyebrow="INTEGRATIONS" title="CI/CD connections" description="GitHub is live; other providers are intentionally shown as unavailable until their adapters are implemented." /><div className="integration-grid">{providers.map(p => <div className="integration-card" key={p.name}><div className="integration-icon"><p.icon size={22} /></div><div className="integration-body"><div className="integration-title"><h3>{p.name}</h3>{p.connected && <span className="connected"><CheckCircle2 size={14} /> Connected</span>}</div><p>{p.description}</p><button className={`button ${p.connected ? 'button-secondary' : 'button-primary'}`} onClick={() => notify(p.connected ? 'GitHub OAuth is active for this workspace' : `${p.name} adapter is not available yet`)}>{p.connected ? 'Manage connection' : 'Not available'}</button></div></div>)}</div><div className="security-note"><ShieldCheck size={20} /><div><strong>Integration security</strong><p>GitHub access tokens stay server-side and are never sent to the React client.</p></div></div></>
}

function SettingsPage({ user, notify }) {
  const [settings, setSettings] = useState(null)
  useEffect(() => { api('/api/settings').then(setSettings).catch(e => notify(e.message)) }, [notify])
  if (!settings) return <div className="loading-inline"><RefreshCw className="spin" size={17} /> Loading settings…</div>
  const update = (key, value) => setSettings(s => ({ ...s, [key]: value }))
  const toggle = key => setSettings(s => ({ ...s, notifications: { ...s.notifications, [key]: !s.notifications[key] } }))
  const save = async () => { try { await api('/api/settings', { method: 'POST', body: JSON.stringify(settings) }); notify('Settings saved to persistent storage') } catch (e) { notify(e.message) } }
  return <><PageTitle eyebrow="SETTINGS" title="Workspace settings" description="Persist workspace preferences and notification controls." /><div className="settings-layout"><Panel title="General" subtitle={`Signed in as @${user.login}`}><label className="form-field">Workspace name<input value={settings.workspaceName} onChange={e => update('workspaceName', e.target.value)} /></label><label className="form-field">Default branch<input value={settings.defaultBranch} onChange={e => update('defaultBranch', e.target.value)} /></label><button className="button button-primary" onClick={save}>Save changes</button></Panel><Panel title="Notifications" subtitle="Stored on the server"><Toggle label="Pipeline failure alerts" checked={settings.notifications.failure} onChange={() => toggle('failure')} /><Toggle label="Performance degradation alerts" checked={settings.notifications.degradation} onChange={() => toggle('degradation')} /><Toggle label="Weekly performance summary" checked={settings.notifications.weekly} onChange={() => toggle('weekly')} /><Toggle label="Recommendation updates" checked={settings.notifications.recommendations} onChange={() => toggle('recommendations')} /></Panel><Panel title="Access control" subtitle="GitHub identity"><div className="role-row"><div><strong>{user.name || user.login}</strong><span>@{user.login}</span></div><span className="role-badge">Owner</span></div></Panel></div></>
}

function StatCard({ label, value, detail, icon: Icon, tone }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={18} /></div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className={`stat-detail ${tone}`}>{detail}</span></div> }
function Panel({ title, subtitle, action, children }) { return <section className="panel"><div className="panel-header">{title && <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>}{action}</div>{children}</section> }
function RunList({ runs }) { return <div className="run-list compact">{runs.map(r => <div className="run-row" key={r.id}><StatusIcon status={r.status} /><div><strong>#{r.number} · {r.branch}</strong><span>{r.commit} · {formatTime(r.time)}</span></div><strong>{r.duration}m</strong></div>)}{!runs.length && <div className="empty-state">No runs returned by GitHub.</div>}</div> }
function StatusBadge({ status }) { const map = { success: ['Success', 'success'], failed: ['Failed', 'danger'], warning: ['Warning', 'warning'], running: ['Running', 'blue'] }; const [label, tone] = map[status] || ['Unknown', 'neutral']; return <span className={`status-badge ${tone}`}><i />{label}</span> }
function StatusIcon({ status }) { return status === 'success' ? <CheckCircle2 className="status-success" size={17} /> : status === 'running' ? <Play className="status-success" size={17} /> : <AlertTriangle className="status-danger" size={17} /> }
function PriorityBadge({ value }) { return <span className={`priority ${value.toLowerCase()}`}>{value} priority</span> }
function Explain({ number, title, text }) { return <div className="explain"><span>{number}</span><div><strong>{title}</strong><p>{text}</p></div></div> }
function Toggle({ label, checked = false, onChange }) { const [on, setOn] = useState(checked); useEffect(() => setOn(checked), [checked]); const change = () => { setOn(!on); onChange?.() }; return <button className="toggle-row" onClick={change}><span>{label}</span><span className={`toggle ${on ? 'on' : ''}`}><i /></span></button> }
function LineChart({ data, suffix = '', min, max }) { const safe = data?.length ? data : [0]; const width = 700, height = 220; const lo = min ?? Math.min(...safe) - Math.max(...safe, 1) * 0.06; const hi = max ?? Math.max(...safe) + Math.max(...safe, 1) * 0.06; const points = safe.map((v, i) => { const x = safe.length === 1 ? width / 2 : 18 + (i / (safe.length - 1)) * (width - 36); const y = height - 22 - ((v - lo) / Math.max(hi - lo, 1)) * (height - 42); return [x, y] }); const line = points.map(p => p.join(',')).join(' '); const area = `18,${height - 22} ${line} ${width - 18},${height - 22}`; return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"><line x1="18" y1="55" x2="682" y2="55" className="grid-line" /><line x1="18" y1="115" x2="682" y2="115" className="grid-line" /><line x1="18" y1="175" x2="682" y2="175" className="grid-line" /><polygon points={area} className="chart-area" /><polyline points={line} className="chart-line" fill="none" /></svg><div className="chart-labels"><span>{safe[0]}{suffix}</span><span>{safe[Math.floor(safe.length / 2)]}{suffix}</span><span>{safe[safe.length - 1]}{suffix}</span></div></div> }

function preRunRisk(runs) {
  const completed = runs.filter(r => r.status !== 'running').slice(0, 20)
  if (!completed.length) return { percent: 35, level: 'Medium', summary: 'Not enough run history is available for a confident estimate.', reasons: ['No completed historical runs available', 'Using a conservative baseline risk'] }
  const failures = completed.filter(r => r.conclusion === 'failure').length
  const recent = completed.slice(0, 5); const recentFailures = recent.filter(r => r.conclusion === 'failure').length
  const failureRate = failures / completed.length
  const consecutive = recent.findIndex(r => r.conclusion === 'success'); const failureStreak = consecutive === -1 ? recent.length : consecutive
  let percent = Math.round(failureRate * 65 + (recentFailures / Math.max(recent.length,1)) * 25 + Math.min(failureStreak * 5, 10))
  percent = Math.max(5, Math.min(95, percent))
  const level = percent >= 55 ? 'High' : percent >= 25 ? 'Medium' : 'Low'
  return { percent, level, summary: level === 'High' ? 'Recent workflow history shows elevated reliability risk.' : level === 'Medium' ? 'Some historical failures increase the chance of a failed run.' : 'Recent workflow history is stable and indicates a low failure risk.', reasons: [`${failures} failure${failures === 1 ? '' : 's'} across ${completed.length} completed runs`, `${recentFailures} failure${recentFailures === 1 ? '' : 's'} in the latest ${recent.length} runs`, failureStreak ? `${failureStreak} most recent run${failureStreak === 1 ? '' : 's'} failed consecutively` : 'Most recent completed run succeeded'] }
}

function chartData(runs) { const recent = [...runs].reverse().slice(-12); return { durations: recent.map(r => r.duration || 0), successes: recent.map((_, i) => { const slice = recent.slice(0, i + 1); return Number((slice.filter(r => r.conclusion === 'success').length / slice.length * 100).toFixed(1)) }) } }
function deriveStages(runs) { const avg = runs.length ? runs.reduce((s, r) => s + (r.duration || 0), 0) / runs.length : 0; return [{ name: 'Workflow execution', duration: Number(avg.toFixed(1)), share: 100, status: avg > 10 ? 'warning' : 'success' }, { name: 'Successful runs', duration: Number((runs.filter(r => r.conclusion === 'success').length / Math.max(runs.length, 1)).toFixed(1)), share: Math.round(runs.filter(r => r.conclusion === 'success').length / Math.max(runs.length, 1) * 100), status: 'success' }].filter(s => s.duration > 0 || s.share > 0) }
function formatTime(value) { if (!value) return '—'; return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }
function filterByRange(runs, range) { const days = Number.parseInt(range, 10) || 30; const cutoff = Date.now() - days * 86400000; return runs.filter(r => new Date(r.time).getTime() >= cutoff) }
function calculateClientAnalysis(runs) { const completed = runs.filter(r => r.status !== 'running'); const success = completed.filter(r => r.conclusion === 'success').length; const durations = completed.map(r => r.duration).filter(Boolean); return { runs: runs.length, failures: completed.filter(r => r.conclusion === 'failure').length, successRate: completed.length ? Number((success / completed.length * 100).toFixed(1)) : 0, avgDuration: durations.length ? Number((durations.reduce((a,b) => a+b, 0) / durations.length).toFixed(1)) : 0 } }
function initials(name) { return (name || 'GH').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase() }

export default App
