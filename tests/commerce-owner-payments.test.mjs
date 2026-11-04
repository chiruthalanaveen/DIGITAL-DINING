import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const root = fileURLToPath(new URL('../', import.meta.url))
const websiteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const foreignWebsiteId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const userId = '11111111-1111-4111-8111-111111111111'
const routePath = 'app/api/commerce/workspace/[websiteId]/payments/route.js'
const componentPath = 'app/components/commerce/OwnerPaymentStatus.jsx'

function fixture(t) {
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'development-anon-key', COMMERCE_ONLINE_PAYMENTS_ENABLED: 'false', COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE: 'false' })) {
    const before = process.env[key]; process.env[key] = value
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before })
  }
  const state = {
    calls: [], clients: [], error: null, result: { configured: false, merchant_enabled: false },
    user: { id: userId, email: 'owner@example.test', email_confirmed_at: '2026-11-04T00:00:00Z' },
    membership: { website_id: websiteId, user_id: userId, active: true, role: 'owner' },
    website: { id: websiteId, status: 'active', business_type: 'general', features: { catalog: true }, fulfillment: { pickup: true }, owner_permissions: { orders: true } },
  }
  const client = {
    auth: { async getUser(token) { state.calls.push({ auth: token }); return token === 'valid' ? { data: { user: state.user } } : { error: { message: 'expired' } } } },
    from(table) {
      const call = { table, filters: [] }; state.calls.push(call)
      const query = {
        select() { return query }, eq(key, value) { call.filters.push([key, value]); return query }, maybeSingle() { return query },
        then(resolve, reject) {
          const source = table === 'commerce_memberships' ? state.membership : state.website
          const data = source && call.filters.every(([key, value]) => source[key] === value) ? source : null
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return query
    },
    async rpc(name, args) { state.calls.push({ rpc: name, args }); return { data: state.result, error: state.error } },
  }
  const cache = new Map()
  function load(relative) {
    let filename = path.resolve(root, relative)
    if (!path.extname(filename)) filename += '.js'
    if (cache.has(filename)) return cache.get(filename).exports
    const loaded = new Module(filename); cache.set(filename, loaded)
    loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    const nativeRequire = createRequire(filename)
    loaded.require = specifier => {
      if (specifier === '@supabase/supabase-js') return { createClient(url, key, options) { assert.equal(key, 'development-anon-key'); state.clients.push({ url, key, options }); return client } }
      if (specifier === '@/lib/server/adminSession') return { requireAdmin() { throw new Error('Owner status must never use an Admin session.') } }
      if (specifier === '@/lib/server/adminSupabase') return { getAdminSupabase() { throw new Error('Owner status must never create a service-role client.') } }
      if (specifier === '@/lib/commerce/client') return { commerceFetch() { throw new Error('Server markup tests must not issue browser requests.') } }
      if (specifier.startsWith('@/lib/server/')) return load(specifier.slice(2))
      if (specifier.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
      return nativeRequire(specifier)
    }
    loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
    return loaded.exports
  }
  return { load, state, context: { params: Promise.resolve({ websiteId }) } }
}

function request(token = 'valid') {
  return new NextRequest(`https://commerce.example.test/api/commerce/workspace/${websiteId}/payments`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
}

test('owner payment configuration requires verified JWT before reading membership or RPCs', async t => {
  const { load, state, context } = fixture(t)
  const { GET } = load(routePath)
  assert.equal((await GET(request(null), context)).status, 401)
  assert.equal((await GET(request('expired'), context)).status, 401)
  state.user.email_confirmed_at = null
  state.user.user_metadata = { email_confirmed: true }
  assert.equal((await GET(request(), context)).status, 403)
  assert.equal(state.calls.some(call => call.table || call.rpc), false)
})

test('owner payment configuration rejects foreign websites, inactive memberships and missing orders permission before RPC', async t => {
  const { load, state, context } = fixture(t)
  const { GET } = load(routePath)
  assert.equal((await GET(request(), { params: Promise.resolve({ websiteId: foreignWebsiteId }) })).status, 403)
  state.membership.active = false
  assert.equal((await GET(request(), context)).status, 403)
  state.membership.active = true
  for (const orders of [undefined, false, 'true', null]) {
    state.website.owner_permissions.orders = orders
    assert.equal((await GET(request(), context)).status, 403)
  }
  assert.equal(state.calls.some(call => call.rpc), false)
})

test('owner payment status uses only owner JWT and safe readiness projection without credentials or merchant administration', async t => {
  const { load, state, context } = fixture(t)
  state.result = { configured: true, merchant_enabled: true, mode: 'test', credential_created_at: '2026-11-04', credential_version: userId, key_id: 'private-key-id', ciphertext: 'private-ciphertext', webhook_secret: 'private-webhook-secret', actor_email: 'private-admin@example.test' }
  const response = await load(routePath).GET(request(), context)
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.deepEqual(result.readiness, { configured: true, merchant_enabled: true, mode: 'test' })
  assert.deepEqual(result.rollout, { enabled: false, live_allowed: false })
  assert.equal(result.status, 'disabled')
  assert.equal(result.blocked_reason, 'platform_disabled')
  assert.doesNotMatch(JSON.stringify(result), /private-|credential_version|created_at|ciphertext|secret|actor_email|key_id/)
  assert.deepEqual(state.calls.filter(call => call.rpc), [{ rpc: 'commerce_payment_readiness', args: { p_website_id: websiteId } }])
  assert.equal(state.clients[0].options.global.headers.Authorization, 'Bearer valid')
})

test('missing payment schema is explicitly unavailable while denial, timeout and malformed data fail closed', async t => {
  const { load, state, context } = fixture(t)
  const { GET } = load(routePath)
  for (const code of ['PGRST202', 'PGRST205', '42883', '42P01']) {
    state.error = { code, message: 'Optional development schema is missing.' }
    const response = await GET(request(), context)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { success: true, available: false, readiness: null, rollout: { enabled: false, live_allowed: false }, status: 'unavailable', blocked_reason: null })
  }
  for (const [code, status] of [['42501', 403], ['08006', 503], ['57014', 503]]) {
    state.error = { code, message: 'Development read failure.' }
    assert.equal((await GET(request(), context)).status, status)
  }
  state.error = null
  for (const data of [null, [], {}, { configured: 'true', merchant_enabled: true, mode: 'live' }, { configured: true, merchant_enabled: 'true', mode: 'live' }, { configured: true, merchant_enabled: true }, { configured: true, merchant_enabled: true, mode: 'unknown' }, { configured: false, merchant_enabled: true }, { configured: false, merchant_enabled: false, mode: 'live' }]) {
    state.result = data
    const response = await GET(request(), context)
    assert.equal(response.status, 503)
    assert.equal((await response.json()).success, false)
  }
})

test('configuration states distinguish unconfigured, disabled, provider test mode and permitted live mode', async t => {
  const { load, state, context } = fixture(t)
  const { GET } = load(routePath)
  const read = async () => (await GET(request(), context)).json()
  assert.equal((await read()).status, 'not_configured')
  state.result = { configured: true, merchant_enabled: true, mode: 'test' }
  process.env.COMMERCE_ONLINE_PAYMENTS_ENABLED = 'true'
  assert.equal((await read()).status, 'test')
  state.result.mode = 'live'
  let result = await read()
  assert.equal(result.status, 'disabled')
  assert.equal(result.blocked_reason, 'live_mode_not_allowed')
  process.env.COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE = 'true'
  assert.equal((await read()).status, 'available')
  state.result.merchant_enabled = false
  result = await read()
  assert.equal(result.status, 'disabled')
  assert.equal(result.blocked_reason, 'merchant_disabled')
})

test('store activation, catalog, business restriction and fulfillment gates prevent false checkout availability', async t => {
  const { load, state, context } = fixture(t)
  const { GET } = load(routePath)
  state.result = { configured: true, merchant_enabled: true, mode: 'live' }
  process.env.COMMERCE_ONLINE_PAYMENTS_ENABLED = 'true'
  process.env.COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE = 'true'
  const original = structuredClone(state.website)
  for (const overrides of [{ status: 'setup' }, { status: 'suspended' }, { features: { catalog: false } }, { features: { catalog: 'true' } }, { business_type: 'pharmacy' }, { fulfillment: { pickup: false, delivery: false } }, { fulfillment: { pickup: 'true' } }]) {
    state.website = { ...original, ...overrides }
    const response = await GET(request(), context)
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.status, 'disabled')
    assert.equal(result.blocked_reason, 'store_unavailable')
  }
})

test('payment status markup labels test and disabled configuration honestly without provider verification or owner activation controls', t => {
  const { load } = fixture(t)
  const { OwnerPaymentStatusDetails } = load(componentPath)
  const result = { available: true, readiness: { configured: true, merchant_enabled: true, mode: 'test' }, rollout: { enabled: true, live_allowed: false }, status: 'test', blocked_reason: null }
  let markup = renderToStaticMarkup(React.createElement(OwnerPaymentStatusDetails, { result }))
  assert.match(markup, /Provider test mode/)
  assert.match(markup, /does not collect real payments/)
  assert.match(markup, /does not verify provider connectivity, payment capture or settlement/)
  assert.match(markup, /Super Admin manages merchant settings and activation/)
  assert.doesNotMatch(markup, /<button|<form|<input/)
  markup = renderToStaticMarkup(React.createElement(OwnerPaymentStatusDetails, { result: { ...result, status: 'disabled', blocked_reason: 'platform_disabled', rollout: { enabled: false, live_allowed: false } } }))
  assert.match(markup, /Checkout disabled/)
  assert.match(markup, /Platform online checkout is disabled/)
  assert.doesNotMatch(markup, /Live-mode checkout is enabled/)
})

test('unknown and inconsistent payment status markup never claims checkout is enabled', t => {
  const { load } = fixture(t)
  const { OwnerPaymentStatusDetails, default: OwnerPaymentStatus } = load(componentPath)
  const valid = { available: true, readiness: { configured: true, merchant_enabled: true, mode: 'live' }, rollout: { enabled: true, live_allowed: true }, status: 'available', blocked_reason: null }
  for (const result of [null, {}, { ...valid, status: 'unknown' }, { ...valid, available: false }, { ...valid, readiness: { configured: false, merchant_enabled: false, mode: null } }, { ...valid, rollout: { enabled: false, live_allowed: true } }, { ...valid, rollout: { enabled: true, live_allowed: false } }]) {
    const markup = renderToStaticMarkup(React.createElement(OwnerPaymentStatusDetails, { result }))
    assert.match(markup, /could not be verified/)
    assert.doesNotMatch(markup, /Checkout configured|Live-mode checkout is enabled/)
  }
  const loading = renderToStaticMarkup(React.createElement(OwnerPaymentStatus, { website: { id: websiteId, name: 'Asha Store' }, client: {} }))
  assert.match(loading, /Loading payment status/)
  assert.doesNotMatch(loading, /Checkout configured|Live-mode checkout is enabled/)
})
