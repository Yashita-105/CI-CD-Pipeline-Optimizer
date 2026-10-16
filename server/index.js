import 'dotenv/config'
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { URL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dataDir = path.join(__dirname, 'data')
const dbFile = path.join(dataDir, 'db.json')
fs.mkdirSync(dataDir, { recursive: true })

const PORT = Number(process.env.PORT || 4000)
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-session-secret'
const CLIENT_ID = process.env.GITHUB_CLIENT_ID
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET
const CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || `http://localhost:${PORT}/api/auth/github/callback`

const defaultDb = { sessions: {}, users: {}, settings: {}, recommendations: {}, analyses: {} }
function readDb() {
  try { return { ...defaultDb, ...JSON.parse(fs.readFileSync(dbFile, 'utf8')) } } catch { return structuredClone(defaultDb) }
}
let db = readDb()
function saveDb() { fs.writeFileSync(dbFile, JSON.stringify(db, null, 2)) }

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(pair => {
    const i = pair.indexOf('='); return [pair.slice(0, i).trim(), decodeURIComponent(pair.slice(i + 1).trim())]
  }))
}
function sign(value) { return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex') }
function cryptoKey() { return crypto.createHash('sha256').update(SESSION_SECRET).digest() }
function encrypt(value) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', cryptoKey(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}` }
function decrypt(value) { try { const [ivHex, tagHex, encryptedHex] = value.split('.'); const decipher = crypto.createDecipheriv('aes-256-gcm', cryptoKey(), Buffer.from(ivHex, 'hex')); decipher.setAuthTag(Buffer.from(tagHex, 'hex')); return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8') } catch { return null } }
function makeSession(userId) {
  const id = crypto.randomBytes(32).toString('hex')
  db.sessions[id] = { userId, createdAt: Date.now() }
  saveDb()
  return id
}
function currentUser(req) {
  const cookie = parseCookies(req).session
  if (!cookie) return null
  const [id, signature] = cookie.split('.')
  if (!id || !signature) return null
  const expected = sign(id)
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  const session = db.sessions[id]
  if (!session) return null
  const user = db.users[session.userId] || null
  if (!user) return null
  if (user.tokenEncrypted) user.token = decrypt(user.tokenEncrypted)
  return user
}
function setSession(res, id) {
  res.setHeader('Set-Cookie', `session=${encodeURIComponent(`${id}.${sign(id)}`)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`)
}
function clearSession(res) { res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0') }
function json(res, status, payload) { const body = JSON.stringify(payload); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body) }
function redirect(res, location) { res.writeHead(302, { Location: location }); res.end() }
async function body(req) {
  let raw = ''; for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

function githubRequest(url, token, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: options.method || 'GET', headers: { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Pipeline-Optimizer/2.0', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(options.body) } : {}) } }, r => {
      let raw = ''; r.on('data', c => raw += c); r.on('end', () => { let parsed; try { parsed = raw ? JSON.parse(raw) : {} } catch { parsed = { raw } }; if (r.statusCode >= 200 && r.statusCode < 300) resolve(parsed); else { const e = new Error(parsed.message || `GitHub API ${r.statusCode}`); e.status = r.statusCode; e.details = parsed; reject(e) } })
    })
    req.on('error', reject); if (options.body) req.write(options.body); req.end()
  })
}

function requireUser(req, res) { const user = currentUser(req); if (!user) { json(res, 401, { error: 'Not authenticated', loginRequired: true }); return null }; return user }
function userSettings(userId) { return db.settings[userId] || { workspaceName: 'GitHub Workspace', defaultBranch: 'main', notifications: { failure: true, degradation: true, weekly: false, recommendations: true } } }
function normalizeRun(run) {
  const started = run.run_started_at || run.created_at
  const duration = started && run.updated_at ? Math.max(0, (new Date(run.updated_at) - new Date(started)) / 60000) : 0
  return { id: run.id, number: run.run_number, name: run.name, workflowId: run.workflow_id, branch: run.head_branch, commit: (run.head_sha || '').slice(0, 7), status: run.conclusion === 'success' ? 'success' : run.conclusion === 'failure' ? 'failed' : run.status === 'completed' ? 'warning' : 'running', conclusion: run.conclusion, duration: Number(duration.toFixed(1)), time: run.created_at, url: run.html_url, event: run.event, actor: run.actor?.login || '' }
}
function calculateAnalysis(runs) {
  const completed = runs.filter(r => r.status !== 'running')
  const successes = completed.filter(r => r.conclusion === 'success').length
  const durations = completed.map(r => r.duration).filter(Boolean)
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
  const failed = completed.filter(r => r.conclusion === 'failure').length
  return { successRate: completed.length ? Number((successes / completed.length * 100).toFixed(1)) : 0, avgDuration: Number(avg.toFixed(1)), runs: runs.length, failures: failed, updatedAt: new Date().toISOString() }
}
function recommendationsFrom(runs) {
  const analysis = calculateAnalysis(runs)
  const completedRuns = runs.filter(run => run.status !== 'running')
  const failedRuns = completedRuns.filter(run => run.conclusion === 'failure')
  const slowestRuns = completedRuns
    .filter(run => run.duration > 0)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 3)
  const recentRuns = runs.slice(0, 3)
  const evidence = (sampleRuns) => ({
    runsAnalyzed: runs.length,
    completedRuns: completedRuns.length,
    failedRuns: failedRuns.length,
    averageDuration: analysis.avgDuration,
    sampleRuns: sampleRuns.map(({ id, number, name, branch, duration, status, time, url }) => ({
      id, number, name, branch, duration, status, time, url
    }))
  })
  const recs = []
  if (analysis.avgDuration > 10) recs.push({ id: 'duration', priority: 'High', type: 'Performance', title: 'Reduce overall workflow duration', stage: 'Workflow', reason: `Average execution is ${analysis.avgDuration} minutes across the fetched runs. Inspect the slowest jobs and introduce caching or parallel jobs.`, benefit: 'Lower feedback time for every pull request.', evidence: evidence(slowestRuns) })
  if (analysis.failures > 0) recs.push({ id: 'failures', priority: 'High', type: 'Reliability', title: 'Investigate recurring failed runs', stage: 'Workflow', reason: `${analysis.failures} completed runs failed in the selected history. Open the failed runs and inspect their jobs/logs.`, benefit: 'Higher delivery reliability and fewer reruns.', evidence: evidence(failedRuns.slice(0, 3)) })
  if (!recs.length) recs.push({ id: 'healthy', priority: 'Low', type: 'Optimization', title: 'Pipeline is currently healthy', stage: 'Workflow', reason: 'No major duration or reliability signal was detected in the fetched run history.', benefit: 'Keep monitoring for regressions as workload changes.', evidence: evidence(recentRuns) })
  return recs
}

async function routes(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = url.pathname
  try {
    if (pathname === '/api/health') return json(res, 200, { ok: true, service: 'Pipeline Optimizer API', time: new Date().toISOString() })
    if (pathname === '/api/auth/status') {
      const user = currentUser(req); return json(res, 200, { authenticated: !!user, user: user ? { id: user.id, login: user.login, name: user.name, avatar: user.avatar } : null })
    }
    if (pathname === '/api/auth/github') {
      if (!CLIENT_ID || !CLIENT_SECRET) return json(res, 503, { error: 'GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .env.' })
      const state = crypto.randomBytes(24).toString('hex'); const stateSig = sign(state)
      res.setHeader('Set-Cookie', `oauth_state=${state}.${stateSig}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`)
      const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: CALLBACK_URL, scope: 'read:user repo workflow', state })
      return redirect(res, `https://github.com/login/oauth/authorize?${params}`)
    }
    if (pathname === '/api/auth/github/callback') {
      const code = url.searchParams.get('code'); const state = url.searchParams.get('state'); const cookieState = parseCookies(req).oauth_state?.split('.')[0]
      if (!code || !state || state !== cookieState || sign(state) !== parseCookies(req).oauth_state?.split('.')[1]) return json(res, 400, { error: 'Invalid OAuth state.' })
      const tokenResponse = await new Promise((resolve, reject) => {
        const data = JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, redirect_uri: CALLBACK_URL })
        const gh = https.request({ hostname: 'github.com', path: '/login/oauth/access_token', method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'User-Agent': 'Pipeline-Optimizer/2.0' } }, r => { let raw=''; r.on('data', c=>raw+=c); r.on('end', ()=>{ try { resolve(JSON.parse(raw)) } catch { reject(new Error('Invalid GitHub OAuth response')) } }) }); gh.on('error', reject); gh.write(data); gh.end()
      })
      if (!tokenResponse.access_token) return json(res, 400, { error: tokenResponse.error_description || 'GitHub OAuth failed.' })
      const ghUser = await githubRequest('https://api.github.com/user', tokenResponse.access_token)
      const id = String(ghUser.id)
      db.users[id] = { id, login: ghUser.login, name: ghUser.name || ghUser.login, avatar: ghUser.avatar_url, tokenEncrypted: encrypt(tokenResponse.access_token), updatedAt: Date.now() }
      const session = makeSession(id); setSession(res, session)
      return redirect(res, '/')
    }
    if (pathname === '/api/auth/logout' && req.method === 'POST') { const cookie = parseCookies(req).session; if (cookie) { const id = cookie.split('.')[0]; delete db.sessions[id]; saveDb() }; clearSession(res); return json(res, 200, { ok: true }) }

    const user = requireUser(req, res); if (!user) return
    const token = user.token

    if (pathname === '/api/me') return json(res, 200, { user: { id: user.id, login: user.login, name: user.name, avatar: user.avatar }, settings: userSettings(user.id) })
    if (pathname === '/api/settings' && req.method === 'GET') return json(res, 200, userSettings(user.id))
    if (pathname === '/api/settings' && req.method === 'POST') { const incoming = await body(req); db.settings[user.id] = { ...userSettings(user.id), ...incoming, notifications: { ...userSettings(user.id).notifications, ...(incoming.notifications || {}) } }; saveDb(); return json(res, 200, db.settings[user.id]) }
    if (pathname === '/api/repositories' && req.method === 'GET') {
      const repos = await githubRequest('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', token)
      return json(res, 200, repos.map(r => ({ id: r.id, name: r.name, fullName: r.full_name, owner: r.owner.login, private: r.private, defaultBranch: r.default_branch, url: r.html_url, description: r.description })))
    }
    const repoMatch = pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/actions\/runs$/)
    if (repoMatch && req.method === 'GET') {
      const [owner, repo] = repoMatch.slice(1); const perPage = Math.min(Number(url.searchParams.get('per_page') || 50), 100)
      const data = await githubRequest(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=${perPage}`, token)
      const runs = (data.workflow_runs || []).map(normalizeRun); db.analyses[`${user.id}:${owner}/${repo}`] = { ...(db.analyses[`${user.id}:${owner}/${repo}`] || {}), analysis: calculateAnalysis(runs), runs, savedAt: Date.now() }; saveDb()
      return json(res, 200, { total: data.total_count || runs.length, runs, analysis: calculateAnalysis(runs) })
    }
    const workflowsMatch = pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/actions\/workflows$/)
    if (workflowsMatch && req.method === 'GET') {
      const [owner, repo] = workflowsMatch.slice(1); const data = await githubRequest(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows?per_page=100`, token); return json(res, 200, data.workflows || [])
    }
    const dispatchMatch = pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/actions\/workflows\/([^/]+)\/dispatches$/)
    if (dispatchMatch && req.method === 'POST') {
      const [owner, repo, workflow] = dispatchMatch.slice(1); const input = await body(req); await githubRequest(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, token, { method: 'POST', body: JSON.stringify({ ref: input.ref || 'main', inputs: input.inputs || {} }) }); return json(res, 202, { ok: true, message: 'Workflow dispatch accepted by GitHub.' })
    }
    const runAction = pathname.match(/^\/api\/runs\/(\d+)\/(rerun|cancel)$/)
    if (runAction && req.method === 'POST') {
      const runId = runAction[1]; const action = runAction[2]; const endpoint = action === 'rerun' ? 'rerun' : 'cancel'; await githubRequest(`https://api.github.com/actions/runs/${runId}/${endpoint}`, token, { method: 'POST' }); return json(res, 202, { ok: true, message: `Run ${action} request accepted by GitHub.` })
    }
    const jobsMatch = pathname.match(/^\/api\/runs\/(\d+)\/jobs$/)
    if (jobsMatch && req.method === 'GET') { const data = await githubRequest(`https://api.github.com/repos/${url.searchParams.get('owner') || ''}/${url.searchParams.get('repo') || ''}/actions/runs/${jobsMatch[1]}/jobs`, token); return json(res, 200, data) }
    const recMatch = pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/recommendations$/)
    if (recMatch && req.method === 'GET') { const key = `${user.id}:${recMatch[1]}/${recMatch[2]}`; const stored = db.analyses[key]?.runs || []; const generated = recommendationsFrom(stored); const saved = db.recommendations[key] || []; return json(res, 200, { recommendations: generated.map(r => { const previous = saved.find(s => s.id === r.id); return { ...r, ...previous, evidence: r.evidence } }) }) }
    const reviewMatch = pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/recommendations\/([^/]+)\/review$/)
    if (reviewMatch && req.method === 'POST') {
      const key = `${user.id}:${reviewMatch[1]}/${reviewMatch[2]}`
      const input = await body(req)
      const generated = recommendationsFrom(db.analyses[key]?.runs || [])
      const previous = db.recommendations[key] || []
      if (!generated.some(r => r.id === reviewMatch[3])) return json(res, 404, { error: 'Recommendation not found. Refresh the recommendations and try again.' })
      db.recommendations[key] = generated.map(r => {
        const saved = previous.find(item => item.id === r.id)
        return {
          ...r,
          ...saved,
          evidence: r.evidence,
          ...(r.id === reviewMatch[3] ? {
            reviewed: input.reviewed !== false,
            reviewedAt: input.reviewed === false ? null : new Date().toISOString()
          } : {})
        }
      })
      saveDb()
      return json(res, 200, { ok: true, recommendations: db.recommendations[key] })
    }
    if (pathname === '/api/analyze' && req.method === 'POST') { const input = await body(req); const key = `${user.id}:${input.fullName}`; const stored = db.analyses[key]?.runs || []; const recs = recommendationsFrom(stored); db.recommendations[key] = recs; saveDb(); return json(res, 200, { recommendations: recs, analysis: calculateAnalysis(stored) }) }

    return json(res, 404, { error: 'API route not found' })
  } catch (error) {
    console.error(error)
    return json(res, error.status || 500, { error: error.message || 'Server error', details: error.details })
  }
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' }
const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith('/api/')) return routes(req, res)
  const dist = path.join(root, 'dist'); const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname; const candidate = path.normalize(path.join(dist, requestPath === '/' ? 'index.html' : requestPath))
  if (candidate.startsWith(dist) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) { res.writeHead(200, { 'Content-Type': mime[path.extname(candidate)] || 'application/octet-stream' }); return fs.createReadStream(candidate).pipe(res) }
  if (fs.existsSync(path.join(dist, 'index.html'))) { res.writeHead(200, { 'Content-Type': 'text/html' }); return fs.createReadStream(path.join(dist, 'index.html')).pipe(res) }
  res.writeHead(404); res.end('Build the frontend first with npm run build.')
})
server.listen(PORT, () => console.log(`Pipeline Optimizer API listening on http://localhost:${PORT}`))
