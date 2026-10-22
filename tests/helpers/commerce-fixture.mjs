import assert from 'node:assert/strict'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import { Pool, types } from 'pg'

// PostgreSQL bigint values in this module are bounded below Number.MAX_SAFE_INTEGER.
types.setTypeParser(20, value => Number(value))

export const LOCAL_ANON_KEY = 'commerce-local-anon-key'
export const LOCAL_SERVICE_KEY = 'commerce-local-service-key'
export const LOCAL_PASSWORD = 'commerce-local-password-only'
const LOCAL_JWT_SECRET = 'commerce-local-jwt-test-signing-secret-only'
export const developmentUsers = [
  { id: '90000000-0000-4000-8000-000000000001', email: 'owner-a@commerce.example.test', name: 'Asha Owner' },
  { id: '90000000-0000-4000-8000-000000000002', email: 'owner-b@commerce.example.test', name: 'Bala Owner' },
  { id: '90000000-0000-4000-8000-000000000003', email: 'customer-a@commerce.example.test', name: 'Chitra Customer' },
  { id: '90000000-0000-4000-8000-000000000004', email: 'customer-b@commerce.example.test', name: 'Dev Customer' },
]

export function developmentEnvironment({ fixturePort = 4319 } = {}) {
  const clean = {}
  for (const key of ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE']) {
    if (process.env[key]) clean[key] = process.env[key]
  }
  return Object.assign(clean, {
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixturePort}`,
    SUPABASE_URL: `http://127.0.0.1:${fixturePort}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE_KEY,
    ADMIN_EMAIL: 'admin@commerce.example.test',
    ADMIN_PASSWORD: LOCAL_PASSWORD,
    ADMIN_SESSION_SECRET: 'commerce-local-admin-session-secret-at-least-32-characters',
    MAINTENANCE_MODE: 'false',
  })
}

function signedToken(user) {
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const data = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })}`
  return `${data}.${createHmac('sha256', LOCAL_JWT_SECRET).update(data).digest('base64url')}`
}

function verifiedSubject(token) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const expected = createHmac('sha256', LOCAL_JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url')
  if (expected.length !== parts[2].length || !timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url'))
    return payload.exp > Date.now() / 1000 ? payload.sub : null
  } catch { return null }
}

function quote(identifier) {
  assert.match(identifier, /^[a-z_][a-z0-9_]*$/)
  return `"${identifier}"`
}

const RPC_ARGUMENTS = {
  commerce_public_catalog: { p_slug: 'text' },
  commerce_submit_application: { p_payload: 'jsonb' },
  commerce_owner_action: { p_website_id: 'uuid', p_action: 'text', p_payload: 'jsonb' },
  commerce_create_cod_order: { p_website_id: 'uuid', p_items: 'jsonb', p_customer: 'jsonb', p_fulfillment: 'text', p_idempotency_key: 'uuid' },
  commerce_admin_action: { p_action: 'text', p_payload: 'jsonb', p_actor_email: 'text' },
}
const TABLES = new Set(['commerce_websites', 'commerce_memberships', 'commerce_applications', 'commerce_categories', 'commerce_products', 'commerce_customers', 'commerce_orders', 'commerce_order_items', 'commerce_audit_logs'])

export async function createCommerceFixture({ databaseUrl, port = 4319, appOrigin = 'http://127.0.0.1:4320' }) {
  const target = new URL(databaseUrl)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Fixture permits loopback PostgreSQL only.')
  assert.equal(target.pathname, '/commerce_test', 'Fixture requires disposable commerce_test database.')
  assert.ok(!target.searchParams.has('host') && !target.searchParams.has('hostaddr'))
  const pool = new Pool({ connectionString: databaseUrl, max: 8, application_name: 'commerce-browser-development-fixture' })
  const users = new Map()
  const uploads = new Map()
  const requests = []
  const state = { unavailable: false, requests }
  for (const source of developmentUsers) {
    const user = {
      id: source.id, email: source.email, aud: 'authenticated', role: 'authenticated',
      email_confirmed_at: '2026-10-22T10:00:00Z', confirmed_at: '2026-10-22T10:00:00Z',
      created_at: '2026-10-22T10:00:00Z', updated_at: '2026-10-22T10:00:00Z',
      user_metadata: { full_name: source.name }, app_metadata: { provider: 'email', providers: ['email'] }, identities: [],
    }
    await pool.query('INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET email=excluded.email,email_confirmed_at=excluded.email_confirmed_at', [user.id, user.email, user.email_confirmed_at, JSON.stringify(user.user_metadata)])
    users.set(user.id, user)
  }

  function session(user) {
    return { access_token: signedToken(user), refresh_token: `local-refresh-${user.id}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }
  }

  async function database(role, subject, work) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL ROLE ${quote(role)}`)
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)", [subject || '', role])
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    res.setHeader('Access-Control-Allow-Origin', appOrigin)
    res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,x-client-info,content-type,x-supabase-api-version,x-upsert,cache-control')
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    const respond = (status, value) => { res.writeHead(status); res.end(value === undefined ? undefined : JSON.stringify(value)) }
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const raw = Buffer.concat(chunks)
      const json = raw.length && String(req.headers['content-type']).includes('json') ? JSON.parse(raw) : {}
      const token = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1] || ''
      const subject = verifiedSubject(token)
      const user = users.get(subject)
      const role = token === LOCAL_SERVICE_KEY ? 'service_role' : user ? 'authenticated' : 'anon'
      requests.push({ method: req.method, path: url.pathname, role })

      if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
        const account = url.searchParams.get('grant_type') === 'refresh_token'
          ? users.get(String(json.refresh_token || '').replace('local-refresh-', ''))
          : [...users.values()].find(item => item.email === json.email && json.password === LOCAL_PASSWORD)
        if (!account) return respond(400, { error: 'invalid_grant', error_description: 'Development credentials rejected.' })
        return respond(200, session(account))
      }
      if (url.pathname === '/auth/v1/user') {
        if (!user) return respond(401, { message: 'Invalid development session.', code: 'bad_jwt' })
        return respond(200, user)
      }
      if (['/auth/v1/recover', '/auth/v1/resend'].includes(url.pathname)) return respond(200, {})
      if (url.pathname === '/auth/v1/logout') return respond(204)
      if (url.pathname === '/auth/v1/signup') {
        const account = { id: randomUUID(), email: json.email, aud: 'authenticated', role: 'authenticated', email_confirmed_at: null, user_metadata: json.data || {}, app_metadata: { provider: 'email', providers: ['email'] }, created_at: new Date().toISOString(), identities: [] }
        await pool.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3)', [account.id, account.email, JSON.stringify(account.user_metadata)])
        users.set(account.id, account)
        return respond(200, account)
      }

      if (state.unavailable && url.pathname.startsWith('/rest/')) return respond(503, { code: '08006', message: 'Development database temporarily unavailable.' })
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.split('/').pop()
        const argumentsByName = RPC_ARGUMENTS[name]
        if (!argumentsByName || req.method !== 'POST') return respond(404, { code: 'PGRST202', message: 'Fixture RPC is not available.' })
        assert.deepEqual(Object.keys(json).sort(), Object.keys(argumentsByName).sort(), `Unexpected arguments for ${name}`)
        const values = []
        const argumentsSql = Object.entries(argumentsByName).map(([key, type], index) => {
          values.push(type === 'jsonb' ? JSON.stringify(json[key]) : json[key])
          return `${quote(key)} => $${index + 1}::${type}`
        })
        const result = await database(role, subject, client => client.query(`SELECT public.${quote(name)}(${argumentsSql.join(',')}) AS result`, values))
        return respond(200, result.rows[0].result)
      }

      if (url.pathname.startsWith('/rest/v1/') && ['GET', 'HEAD'].includes(req.method)) {
        const table = url.pathname.split('/').pop()
        let rows
        if (table === 'platform_settings') rows = [{ key: 'website_status', status: 'Working', updated_at: new Date().toISOString() }]
        else if (table === 'customer_auth_settings') rows = [{ id: 1, otp_enabled: true, updated_at: new Date().toISOString() }]
        else if (!table.startsWith('commerce_')) rows = []
        else {
          assert.ok(TABLES.has(table), 'Fixture refuses unknown commerce tables.')
          const selected = url.searchParams.get('select') || '*'
          const columns = selected === '*' ? '*' : selected.split(',').map(quote).join(',')
          const values = []
          const conditions = []
          for (const [key, filter] of url.searchParams.entries()) {
            if (['select', 'order', 'limit', 'offset'].includes(key)) continue
            if (filter.startsWith('eq.')) { values.push(filter.slice(3)); conditions.push(`${quote(key)}=$${values.length}`) }
            else if (filter.startsWith('in.(') && filter.endsWith(')')) { values.push(filter.slice(4, -1).split(',').map(value => value.replace(/^"|"$/g, ''))); conditions.push(`${quote(key)}::text=ANY($${values.length}::text[])`) }
            else throw Error(`Unsupported fixture filter ${key}`)
          }
          let query = `SELECT ${columns} FROM public.${quote(table)}`
          if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`
          const ordering = url.searchParams.get('order')
          if (ordering) query += ` ORDER BY ${ordering.split(',').map(value => { const [key, direction = 'asc'] = value.split('.'); assert.ok(['asc', 'desc'].includes(direction)); return `${quote(key)} ${direction}` }).join(',')}`
          const limit = Number(url.searchParams.get('limit') || 5000)
          assert.ok(Number.isInteger(limit) && limit >= 0 && limit <= 10000)
          query += ` LIMIT ${limit}`
          const result = await database(role, subject, client => client.query(query, values))
          rows = result.rows
        }
        const object = String(req.headers.accept || '').includes('vnd.pgrst.object')
        if (object && rows.length !== 1) return respond(406, { code: 'PGRST116', message: 'JSON object requested but result is not one row.' })
        res.setHeader('Content-Range', rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0')
        return respond(200, object ? rows[0] : rows)
      }

      if (url.pathname.startsWith('/storage/v1/object/public/commerce-media/')) {
        const name = decodeURIComponent(url.pathname.slice('/storage/v1/object/public/commerce-media/'.length))
        const object = uploads.get(name)
        if (!object) return respond(404, { message: 'Not found.' })
        res.setHeader('Content-Type', object.type); res.writeHead(200); res.end(object.bytes); return
      }
      if (url.pathname.startsWith('/storage/v1/object/commerce-media/') && req.method === 'POST') {
        if (!user) return respond(401, { message: 'Sign in required.' })
        const name = decodeURIComponent(url.pathname.slice('/storage/v1/object/commerce-media/'.length))
        let type = String(req.headers['content-type'] || ''), bytes = raw
        if (type.startsWith('multipart/form-data')) {
          const form = await new Response(raw, { headers: { 'Content-Type': type } }).formData()
          const file = [...form.values()].find(value => typeof value !== 'string')
          assert.ok(file, 'The development upload must contain an image.')
          type = file.type; bytes = Buffer.from(await file.arrayBuffer())
        }
        assert.ok(['image/png', 'image/jpeg', 'image/webp'].includes(type) && bytes.length <= 5242880)
        await database(role, subject, client => client.query('INSERT INTO storage.objects(bucket_id,name,owner,owner_id,metadata) VALUES ($1,$2,$3::uuid,$4::text,$5::jsonb)', ['commerce-media', name, user.id, user.id, JSON.stringify({ mimetype: type, size: bytes.length })]))
        uploads.set(name, { bytes, type })
        return respond(200, { Key: `commerce-media/${name}`, Id: randomUUID() })
      }
      return respond(404, { message: 'Endpoint not implemented in isolated development fixture.' })
    } catch (error) {
      return respond(error.code === '42501' ? 403 : error.code === '23505' ? 409 : 400, { code: error.code || 'FIXTURE_ERROR', message: error.message })
    }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  return {
    pool, state, users, session,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await pool.end() },
  }
}
