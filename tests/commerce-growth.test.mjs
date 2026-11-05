import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const root = fileURLToPath(new URL('../', import.meta.url))
const ownerId = '11111111-1111-4111-8111-111111111111'
const otherUserId = '22222222-2222-4222-8222-222222222222'
const websiteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherWebsiteId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function fixture(t, overrides = {}) {
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'development-anon-key' })) {
    const previous = process.env[key]
    process.env[key] = value
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
  const state = {
    user: { id: ownerId, email: 'owner@example.test', email_confirmed_at: '2026-10-22T00:00:00Z' },
    calls: [], clients: [], adminClients: 0, queryError: null, rpcError: null,
    tables: {
      commerce_websites: [{ id: websiteId, name: 'First Store', slug: 'first-store', status: 'active', business_type: 'general', owner_permissions: { products: true, categories: true, inventory: true, orders: true, branding: false, customers: false }, features: { catalog: true, inventory: true, cod: true } }],
      commerce_memberships: [{ website_id: websiteId, user_id: ownerId, role: 'owner', active: true }],
      commerce_products: [], commerce_categories: [], commerce_orders: [], commerce_order_items: [], commerce_customers: [], commerce_applications: [], commerce_audit_logs: [],
    },
    rpcResults: {},
    ...overrides,
  }
  const client = {
    auth: { async getUser(token) { state.calls.push({ auth: token }); return token === 'valid-test-token' ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: 'expired' } } } },
    from(table) {
      const record = { table, filters: [] }; state.calls.push(record)
      let single = false
      const query = {
        select(fields) { record.select = fields; return query },
        eq(key, value) { record.filters.push([key, value]); return query },
        in(key, values) { record.filters.push([key, values]); return query },
        order() { return query },
        limit(maximum) { record.limit = maximum; return query },
        maybeSingle() { single = true; return query },
        then(resolve, reject) {
          let rows = state.tables[table] || []
          rows = rows.filter(row => record.filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value))
          return Promise.resolve({ data: single ? rows[0] || null : rows, error: state.queryError }).then(resolve, reject)
        },
      }
      return query
    },
    async rpc(name, args) {
      state.calls.push({ rpc: name, args })
      const result = state.rpcResults[name]
      return { data: typeof result === 'function' ? result(args) : result ?? {}, error: state.rpcError, status: state.rpcStatus }
    },
  }
  const cache = new Map()
  function load(relative) {
    let filename = path.resolve(root, relative)
    if (!path.extname(filename)) filename += '.js'
    if (cache.has(filename)) return cache.get(filename).exports
    const loaded = new Module(filename)
    cache.set(filename, loaded)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    const nativeRequire = createRequire(filename)
    loaded.require = specifier => {
      if (specifier === '@supabase/supabase-js') return { createClient: (url, key, options) => { state.clients.push({ url, key, options }); assert.equal(key, 'development-anon-key'); return client } }
      if (specifier === '@/lib/server/adminSession') return { requireAdmin: request => request.headers.get('x-test-admin') === 'yes' ? { email: 'admin@example.test' } : null }
      if (specifier === '@/lib/server/adminSupabase') return { getAdminSupabase: () => { state.adminClients++; return client } }
      if (specifier.startsWith('@/lib/server/commerce/') || specifier === '@/lib/server/adminRequestOrigin') return load(specifier.slice(2))
      if (specifier.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
      return nativeRequire(specifier)
    }
    loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
    return loaded.exports
  }
  return { state, load, context: { params: Promise.resolve({ websiteId }) } }
}

function request(pathname = '/api/commerce/applications', { method = 'GET', payload, body, token = 'valid-test-token', origin = 'https://dining.example', admin = false, contentType = 'application/json' } = {}) {
  const headers = { 'content-type': contentType }
  if (token) headers.authorization = `Bearer ${token}`
  if (origin !== null) headers.origin = origin
  if (admin) headers['x-test-admin'] = 'yes'
  if (origin) headers['sec-fetch-site'] = origin === 'https://dining.example' ? 'same-origin' : 'cross-site'
  return new NextRequest('https://dining.example' + pathname, { method, headers, ...(method === 'GET' ? {} : { body: body ?? JSON.stringify(payload ?? {}) }) })
}

const coupon = { code: 'SAVE10', kind: 'percentage', discount_value: 1000, minimum_subtotal_paise: 10000, maximum_discount_paise: 2500, usage_limit: 20, per_customer_limit: 1, active: true }
const enabledConfig = { enabled: true, from: 'orders@example.test', apiKey: 'stub-development-key', provider: 'resend' }
const job = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', order_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', lease_token: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', event_type: 'order_placed', recipient_email: 'buyer@example.test', website_name: 'Local Test Store' }

test('coupon validation rejects fractional paise, unknown totals, bad dates and out-of-range percentage', t => {
  const { load } = fixture(t)
  const { couponSchema, decimalToPaise } = load('lib/server/commerce/growth.js')
  assert.equal(couponSchema.safeParse(coupon).success, true)
  assert.equal(couponSchema.parse({ ...coupon, code: ' save10 ' }).code, 'SAVE10')
  for (const change of [{ discount_value: 1.5 }, { discount_value: 10001 }, { minimum_subtotal_paise: true }, { total_paise: 5 }, { usage_limit: 0 }, { active: 'true' }, { starts_at: 'tomorrow' }, { starts_at: '2026-11-04T00:00:00Z', ends_at: '2026-11-03T00:00:00Z' }]) assert.equal(couponSchema.safeParse({ ...coupon, ...change }).success, false)
  assert.equal(decimalToPaise('0.29'), 29)
  assert.equal(decimalToPaise('999999.99'), 99999999)
  for (const input of ['1.001', '-1', '1e2', '', true, '1000000.01']) assert.throws(() => decimalToPaise(input))
})

test('growth API requires a verified owner session and current website membership', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/commerce/workspace/[websiteId]/growth/route.js')
  assert.equal((await route.GET(request(undefined, { token: null }), { params: Promise.resolve({ websiteId }) })).status, 401)
  assert.equal((await route.GET(request(), { params: Promise.resolve({ websiteId: otherWebsiteId }) })).status, 403)
  state.user.email_confirmed_at = null
  assert.equal((await route.GET(request(), { params: Promise.resolve({ websiteId }) })).status, 403)
  assert.equal(state.calls.filter(call => call.rpc).length, 0)
})

test('growth API scopes analytics/coupons by authorized website and never uses a service client', async t => {
  const { load, state, context } = fixture(t)
  state.rpcResults.commerce_growth_workspace = { coupons: [], analytics: { placed_order_value_paise: 12345, completed_cod_value_paise: 5000, settled_funds_paise: null }, notification_status: { pending: 1 } }
  const response = await load('app/api/commerce/workspace/[websiteId]/growth/route.js').GET(request(), context)
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.analytics.settled_funds_paise, null)
  assert.deepEqual(state.calls.find(call => call.rpc).args, { p_website_id: websiteId })
  assert.equal(state.adminClients, 0)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(JSON.stringify(result).includes('apiKey'), false)
})

test('analytics period filters stay tenant scoped and reject unsupported or injected ranges', async t => {
  const { load, state, context } = fixture(t)
  const route = load('app/api/commerce/workspace/[websiteId]/growth/route.js')
  state.rpcResults.commerce_growth_workspace = { coupons: [], analytics: { period_days: 30 } }
  state.rpcResults.commerce_growth_analytics = { period_days: 7, daily_trend: [], low_stock_available: false, low_stock: [] }
  const response = await route.GET(request(`/api/commerce/workspace/${websiteId}/growth?days=7`), context)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).analytics.period_days, 7)
  assert.deepEqual(state.calls.find(call => call.rpc === 'commerce_growth_analytics').args, { p_website_id: websiteId, p_days: 7 })
  for (const days of ['0', '8', '30.0', '365', '7%3Bselect']) {
    state.calls.length = 0
    assert.equal((await route.GET(request(`/api/commerce/workspace/${websiteId}/growth?days=${days}`), context)).status, 400)
    assert.equal(state.calls.some(call => call.rpc), false)
  }
  state.calls.length = 0
  assert.equal((await route.GET(request(`/api/commerce/workspace/${otherWebsiteId}/growth?days=7`), { params: Promise.resolve({ websiteId: otherWebsiteId }) })).status, 403)
  assert.equal(state.calls.some(call => call.rpc), false)
})

test('coupon timestamp precision matches the database millisecond contract', t => {
  const { load } = fixture(t)
  const { couponSchema } = load('lib/server/commerce/growth.js')
  assert.equal(couponSchema.safeParse({ ...coupon, starts_at: '2026-11-03T12:00:00.123+05:30' }).success, true)
  assert.equal(couponSchema.safeParse({ ...coupon, starts_at: '2026-11-03T12:00:00.1234Z' }).success, false)
})

test('growth API rejects missing permissions, suspended writes, cross-origin and tampered payloads', async t => {
  const { load, state, context } = fixture(t)
  const route = load('app/api/commerce/workspace/[websiteId]/growth/route.js')
  state.tables.commerce_websites[0].owner_permissions.orders = false
  assert.equal((await route.GET(request(), context)).status, 403)
  state.tables.commerce_websites[0].owner_permissions.orders = true
  state.tables.commerce_websites[0].status = 'suspended'
  const mutation = opts => request(undefined, { method: 'POST', payload: { action: 'save_coupon', payload: coupon }, ...opts })
  assert.equal((await route.POST(mutation(), context)).status, 403)
  state.tables.commerce_websites[0].status = 'active'
  assert.equal((await route.POST(mutation({ origin: 'https://foreign.example' }), context)).status, 403)
  assert.equal((await route.POST(mutation({ payload: { action: 'save_coupon', payload: { ...coupon, user_id: otherUserId } } }), context)).status, 400)
  assert.equal((await route.POST(mutation({ payload: { action: 'activate_provider', payload: {} } }), context)).status, 400)
  assert.equal(state.calls.filter(call => call.rpc).length, 0)
})

test('growth API sends normalized coupons and archival to the dedicated owner RPC', async t => {
  const { load, state, context } = fixture(t)
  const route = load('app/api/commerce/workspace/[websiteId]/growth/route.js')
  const response = await route.POST(request(undefined, { method: 'POST', payload: { action: 'save_coupon', payload: { ...coupon, code: ' save10 ' } } }), context)
  assert.equal(response.status, 200)
  assert.equal(state.calls.find(call => call.rpc).args.p_payload.code, 'SAVE10')
  state.rpcError = { code: 'PGRST202', message: 'missing growth function' }
  assert.equal((await route.POST(request(undefined, { method: 'POST', payload: { action: 'archive_coupon', payload: { id: job.id } } }), context)).status, 503)
})

test('notification configuration requires every explicit server flag and a valid sender', t => {
  const { load } = fixture(t)
  const { notificationConfiguration } = load('lib/server/commerce/notifications.js')
  const env = { COMMERCE_NOTIFICATIONS_ENABLED: 'true', COMMERCE_NOTIFICATION_PROVIDER: 'resend', COMMERCE_NOTIFICATION_SENDER_VERIFIED: 'true', COMMERCE_NOTIFICATION_FROM: 'orders@example.test', COMMERCE_NOTIFICATION_API_KEY: 'stub-development-key' }
  assert.equal(notificationConfiguration(env).enabled, true)
  assert.equal(notificationConfiguration({}).enabled, false)
  for (const key of Object.keys(env)) assert.equal(notificationConfiguration({ ...env, [key]: '' }).enabled, false)
  assert.equal(notificationConfiguration({ ...env, COMMERCE_NOTIFICATIONS_ENABLED: 'TRUE' }).enabled, false)
  assert.equal(notificationConfiguration({ ...env, COMMERCE_NOTIFICATION_FROM: 'orders@example.test\r\nBcc:x@y.test' }).enabled, false)
})

test('disabled notification worker makes no database claim or network calls', async t => {
  const { load } = fixture(t)
  const { processCommerceNotifications, sendCommerceNotification } = load('lib/server/commerce/notifications.js')
  let calls = 0
  await assert.rejects(processCommerceNotifications({ rpc: () => { calls++; throw new Error('must not claim') } }, { configuration: { enabled: false } }), /disabled/)
  await assert.rejects(sendCommerceNotification(job, { configuration: { enabled: false }, fetchImpl: () => { calls++; throw new Error('must not send') } }), /disabled/)
  assert.equal(calls, 0)
})

test('provider adapter uses a stable idempotency key, verified sender and plain-text event', async t => {
  const { load } = fixture(t)
  const { sendCommerceNotification } = load('lib/server/commerce/notifications.js')
  let captured
  const result = await sendCommerceNotification(job, { configuration: enabledConfig, fetchImpl: async (url, init) => { captured = { url, init }; return { ok: true, json: async () => ({ id: 'stub-message-id' }) } } })
  assert.equal(result.providerMessageId, 'stub-message-id')
  assert.equal(captured.url, 'https://api.resend.com/emails')
  assert.equal(captured.init.headers['Idempotency-Key'], `commerce:${job.id}`)
  const payload = JSON.parse(captured.init.body)
  assert.equal(payload.from, enabledConfig.from)
  assert.deepEqual(payload.to, [job.recipient_email])
  assert.equal(Object.hasOwn(payload, 'html'), false)
  assert.match(payload.text, /does not confirm a captured payment or refund/)
})

test('provider adapter maps rejection safely without exposing provider bodies', async t => {
  const { load } = fixture(t)
  const { sendCommerceNotification } = load('lib/server/commerce/notifications.js')
  await assert.rejects(sendCommerceNotification(job, { configuration: enabledConfig, fetchImpl: async () => ({ ok: false, status: 429 }) }), /^Error: provider_unavailable$/)
  await assert.rejects(sendCommerceNotification(job, { configuration: enabledConfig, fetchImpl: async () => ({ ok: false, status: 400 }) }), /^Error: provider_rejected$/)
})

test('worker ACKs each lease with only safe failure codes and returns aggregate counts', async t => {
  const { load } = fixture(t)
  const { processCommerceNotifications } = load('lib/server/commerce/notifications.js')
  const calls = []
  const client = { rpc: async (rpc, args) => { calls.push({ rpc, args }); return { data: rpc === 'commerce_notification_claim' ? [job, { ...job, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }] : {}, error: null } } }
  const result = await processCommerceNotifications(client, { configuration: enabledConfig, send: async current => { if (current.id !== job.id) throw new Error('sensitive provider response buyer@example.test'); return { providerMessageId: 'stub-id' } } })
  assert.deepEqual(result, { claimed: 2, sent: 1, retried_or_failed: 1 })
  assert.equal(calls[1].args.p_lease_token, job.lease_token)
  assert.equal(calls[2].args.p_error_code, 'provider_unavailable')
  assert.equal(JSON.stringify(result).includes('example.test'), false)
})

test('ambiguous success ACK stays recoverable and never records a second failed send', async t => {
  const { load } = fixture(t)
  const { processCommerceNotifications } = load('lib/server/commerce/notifications.js')
  const calls = []
  const client = { rpc: async (rpc, args) => { calls.push({ rpc, args }); return rpc === 'commerce_notification_claim' ? { data: [job], error: null } : { data: null, error: { code: '08006' } } } }
  await assert.rejects(processCommerceNotifications(client, { configuration: enabledConfig, send: async () => ({ providerMessageId: 'stub-id' }) }), /temporarily unavailable/)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].args.p_sent, true)
})

test('notification Admin API requires signed Admin and same origin; disabled process does not claim', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/commerce/admin/notifications/route.js')
  assert.equal((await route.GET(request())).status, 401)
  assert.equal((await route.POST(request(undefined, { method: 'POST', admin: true, origin: 'https://foreign.example', payload: { action: 'process', payload: {} } }))).status, 403)
  assert.equal((await route.POST(request(undefined, { method: 'POST', admin: true, payload: { action: 'process', payload: {} } }))).status, 503)
  assert.equal(state.calls.filter(call => call.rpc === 'commerce_notification_claim').length, 0)
  assert.equal((await route.POST(request(undefined, { method: 'POST', admin: true, payload: { action: 'retry', payload: { id: job.id, recipient_email: 'forged@example.test' } } }))).status, 400)
})
