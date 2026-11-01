import assert from 'node:assert/strict'
import { createHmac, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import { LOCAL_ANON_KEY, LOCAL_PASSWORD, LOCAL_SERVICE_KEY } from './commerce-fixture.mjs'

// Memory-only protocol fixture. This is not a substitute for installed RLS,
// real Supabase Auth, financial RPCs or hosted restaurant acceptance testing.
const SIGNING_SECRET = 'owner-account-loopback-signing-secret-only'
export const OWNER = { id: '81000000-0000-4000-8000-000000000001', email: 'owner-phase0@commerce.example.test' }
export const OTHER_OWNER = { id: '81000000-0000-4000-8000-000000000002', email: 'other-owner-phase0@commerce.example.test' }
export const BUSINESS_ID = '82000000-0000-4000-8000-000000000001'
export const OTHER_BUSINESS_ID = '82000000-0000-4000-8000-000000000002'

function user(source) {
  return { ...source, aud: 'authenticated', role: 'authenticated', email_confirmed_at: '2026-11-01T00:00:00Z',
    created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Development Owner' }, identities: [] }
}

export async function createOwnerAccountFixture({ port = 4319, appOrigin = 'http://127.0.0.1:4320' } = {}) {
  const accounts = [user(OWNER), user(OTHER_OWNER)]
  const requests = [], mutations = []
  let restaurants = []
  function session(account = accounts[0]) {
    const part = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const now = Math.floor(Date.now() / 1000)
    const data = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: account.id, aud: 'authenticated', role: 'authenticated', email: account.email, iat: now, exp: now + 3600 })}`
    const token = `${data}.${createHmac('sha256', SIGNING_SECRET).update(data).digest('base64url')}`
    return { access_token: token, refresh_token: `owner-local-refresh-${account.id}`, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user: account }
  }
  function authenticated(token) {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const signature = createHmac('sha256', SIGNING_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url')
    if (signature.length !== parts[2].length || !timingSafeEqual(Buffer.from(signature), Buffer.from(parts[2]))) return null
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url'))
      return claims.exp > Date.now() / 1000 ? accounts.find(account => account.id === claims.sub) : null
    } catch { return null }
  }
  function business(overrides = {}) {
    return { id: BUSINESS_ID, owner_id: OWNER.id, name: 'Development Owner Restaurant', approval_status: 'pending', approval_note: '',
      dob: '1990-01-01', email: OWNER.email, phone: '9000000000', restaurant_code: 'owner-phase0',
      subscription_status: 'active', plan: 'restaurant_pro', plan_code: 'restaurant_pro', is_open: true, business_type: 'restaurant',
      enable_counter_payment: true, is_delivery_enabled: false, ...overrides }
  }
  function setCase(name) {
    requests.length = 0; mutations.length = 0
    if (['pending', 'approved', 'rejected', 'suspended'].includes(name)) restaurants = [business({ approval_status: name })]
    else if (name === 'legacy') restaurants = [business({ id: OWNER.id, owner_id: null, approval_status: 'approved' })]
    else if (name === 'orphan') restaurants = []
    else if (name === 'multiple') restaurants = [business({ approval_status: 'approved' }), business({ id: OTHER_BUSINESS_ID, name: 'Second Development Restaurant', approval_status: 'approved' })]
    else if (name === 'collision') restaurants = [business({ id: OWNER.id, owner_id: OTHER_OWNER.id, approval_status: 'approved' })]
    else if (name === 'foreign') restaurants = [business({ owner_id: OTHER_OWNER.id, approval_status: 'approved' })]
    else throw new Error('Unknown isolated owner fixture case')
  }
  setCase('pending')
  const server = http.createServer(async (request, response) => {
    const address = new URL(request.url, `http://127.0.0.1:${port}`)
    const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const account = authenticated(token)
    response.setHeader('Access-Control-Allow-Origin', appOrigin)
    response.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,x-supabase-api-version,x-upsert,cache-control,prefer,range,range-unit,accept-profile,content-profile')
    response.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS')
    response.setHeader('Cache-Control', 'no-store')
    function json(value, status = 200) { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    let body = {}
    try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch { return json({ error: 'Invalid local JSON' }, 400) }
    requests.push({ method: request.method, path: address.pathname, query: Object.fromEntries(address.searchParams), actor: account?.id || null, service: token === LOCAL_SERVICE_KEY })
    try {
      if (address.pathname === '/auth/v1/token' && address.searchParams.get('grant_type') === 'password') {
        const match = accounts.find(item => item.email === body.email)
        if (!match || body.password !== LOCAL_PASSWORD) return json({ code: 'invalid_credentials', message: 'Invalid development credentials' }, 400)
        return json(session(match))
      }
      if (address.pathname === '/auth/v1/user') return account ? json(account) : json({ code: 'bad_jwt', message: 'Invalid development session' }, 401)
      if (address.pathname === '/auth/v1/logout') { response.writeHead(204); response.end(); return }
      if (address.pathname === '/auth/v1/token' && address.searchParams.get('grant_type') === 'refresh_token') return json({ code: 'refresh_token_not_found', message: 'No local refresh available' }, 400)
      if (address.pathname.startsWith('/rest/v1/')) {
        assert.ok([LOCAL_ANON_KEY, LOCAL_SERVICE_KEY].includes(String(request.headers.apikey)), 'Only synthetic local API keys are accepted')
        const table = address.pathname.slice('/rest/v1/'.length)
        if (table.startsWith('rpc/')) {
          // Unrelated dashboard read contracts only. No financial/order/status
          // mutation is exposed by this fixture.
          const rpc = table.slice(4)
          const reads = new Set(['owner_get_restaurant_orders_secure', 'owner_list_restaurant_staff'])
          if (!reads.has(rpc)) return json({ message: 'RPC outside owner admission test scope' }, 403)
          return json(rpc === 'owner_list_restaurant_staff' ? { success: true, staff: [] } : { success: true, orders: [], hasMore: false })
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          mutations.push({ table, method: request.method })
          return json({ message: 'This read-only fixture forbids business mutations' }, 403)
        }
        if (table === 'platform_settings') return json([{ key: 'website_status', status: 'Working', updated_at: null }])
        if (table === 'restaurants') {
          // This minimal in-memory filter is a test protocol model, not RLS.
          let rows = restaurants.filter(row => [...address.searchParams].every(([key, value]) => {
            if (['select', 'limit', 'order', 'offset'].includes(key)) return true
            if (value === 'is.null') return row[key] == null
            if (value.startsWith('eq.')) return String(row[key]) === value.slice(3)
            return false
          }))
          if (token !== LOCAL_SERVICE_KEY) rows = account ? rows.filter(row => String(row.owner_id || row.id) === account.id) : []
          if (address.searchParams.has('limit')) rows = rows.slice(0, Number(address.searchParams.get('limit')))
          const fields = address.searchParams.get('select') || '*'
          if (fields !== '*') rows = rows.map(row => Object.fromEntries(fields.split(',').map(key => [key.trim(), row[key.trim()]])))
          if (String(request.headers.accept || '').includes('vnd.pgrst.object+json')) return rows.length === 1 ? json(rows[0]) : json({ code: 'PGRST116', message: 'Expected one local row' }, 406)
          return json(rows)
        }
        return json([])
      }
      return json({ message: 'Unknown owner-only fixture path' }, 404)
    } catch (error) { return json({ message: error.message }, 500) }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  return { requests, mutations, setCase, session, async close() { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) } }
}
