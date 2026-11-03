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
const websiteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherWebsite = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const userId = '11111111-1111-4111-8111-111111111111'
const productId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const orderId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const customerPath = 'app/api/commerce/customer/experience/route.js'
const ownerPath = 'app/api/commerce/workspace/[websiteId]/engagement/route.js'

function fixture(t) {
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'development-anon-key' })) {
    const before = process.env[key]; process.env[key] = value
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before })
  }
  const state = {
    user: { id: userId, email: 'customer@example.test', email_confirmed_at: '2026-11-02T00:00:00Z' },
    calls: [], clients: [], error: null, result: { wishlist: [productId], addresses: [], reviews: [], requests: [], events: [] },
    website: { id: websiteId, status: 'active', owner_permissions: { products: true, orders: true } },
  }
  const client = {
    auth: { async getUser(token) { state.calls.push({ auth: token }); return token === 'valid' ? { data: { user: state.user } } : { error: { message: 'expired' } } } },
    from(table) {
      const call = { table, filters: [] }; state.calls.push(call)
      const query = {
        select() { return query }, eq(key, value) { call.filters.push([key, value]); return query }, maybeSingle() { return query },
        then(resolve, reject) {
          let data = table === 'commerce_memberships' ? { website_id: websiteId, user_id: userId, role: 'owner', active: true } : state.website
          if (!call.filters.every(([key, value]) => data[key] === value)) data = null
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }; return query
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
      if (specifier === '@/lib/server/adminSession') return { requireAdmin() { throw new Error('Customer routes must not use an Admin session.') } }
      if (specifier === '@/lib/server/adminSupabase') return { getAdminSupabase() { throw new Error('Customer routes must never use a service-role client.') } }
      if (specifier.startsWith('@/lib/server/')) return load(specifier.slice(2))
      if (specifier.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
      return nativeRequire(specifier)
    }
    loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
    return loaded.exports
  }
  return { state, load, context: { params: Promise.resolve({ websiteId }) } }
}

function request({ method = 'GET', query = `website_id=${websiteId}`, payload, token = 'valid', origin = 'https://dining.example' } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  if (origin) { headers.origin = origin; headers['sec-fetch-site'] = origin === 'https://dining.example' ? 'same-origin' : 'cross-site' }
  return new NextRequest(`https://dining.example/api/commerce/customer/experience?${query}`, { method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify(payload) }) })
}
const mutation = (action, payload) => ({ method: 'POST', payload: { website_id: websiteId, action, payload } })
const ownerMutation = (action, payload) => ({ method: 'POST', payload: { action, payload } })

test('private customer tools require a trusted verified Auth session before any RPC', async t => {
  const { load, state } = fixture(t); const route = load(customerPath)
  assert.equal((await route.GET(request({ token: null }))).status, 401)
  assert.equal((await route.GET(request({ token: 'expired' }))).status, 401)
  state.user.email_confirmed_at = null; state.user.user_metadata = { email_confirmed: true }
  assert.equal((await route.GET(request())).status, 403)
  assert.equal(state.calls.some(call => call.rpc || call.table), false)
})

test('public reviews use only the public RPC and exclude every private field', async t => {
  const { load, state } = fixture(t)
  state.result = { reviews: [{ id: productId, rating: 4, title: 'Good', body: 'Useful product', created_at: '2026-11-02', customer_user_id: userId, order_id: orderId }], rating_count: 1, average_rating: 4, addresses: [{ address: 'Private' }], wishlist: [productId] }
  const response = await load(customerPath).GET(request({ query: `website_id=${websiteId}&product_id=${productId}`, token: null }))
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.deepEqual(Object.keys(result).sort(), ['average_rating', 'rating_count', 'reviews', 'success'])
  assert.deepEqual(Object.keys(result.reviews[0]).sort(), ['body', 'created_at', 'id', 'rating', 'title'])
  assert.equal(state.calls.some(call => call.auth || call.table), false)
  assert.equal(state.calls[0].rpc, 'commerce_public_product_reviews')
  assert.equal(state.clients[0].options.global.headers, undefined)
})

test('invalid public review identifiers cannot fall through to a private query', async t => {
  const { load, state } = fixture(t)
  assert.equal((await load(customerPath).GET(request({ query: `website_id=${websiteId}&product_id=invalid`, token: null }))).status, 400)
  assert.equal(state.calls.length, 0)
})

test('customer and owner mutations reject cross-origin requests before Auth or SQL', async t => {
  const { load, state, context } = fixture(t)
  for (const origin of [null, 'https://untrusted.example']) {
    assert.equal((await load(customerPath).POST(request({ ...mutation('wishlist_add', { product_id: productId }), origin }))).status, 403)
    assert.equal((await load(ownerPath).POST(request({ ...ownerMutation('review_moderate', { review_id: productId, status: 'approved' }), origin }), context)).status, 403)
  }
  assert.equal(state.calls.length, 0)
})

test('all customer actions reject submitted user, tenant, status and financial fields', async t => {
  const { load, state } = fixture(t); const route = load(customerPath)
  const payloads = [
    mutation('wishlist_add', { product_id: productId, customer_user_id: userId }),
    mutation('review_save', { order_id: orderId, product_id: productId, rating: 5, title: '', body: 'Test', status: 'approved' }),
    mutation('request_create', { order_id: orderId, type: 'cancellation', reason: 'Changed my mind', refund: true }),
    mutation('request_create', { order_id: orderId, type: 'refund', reason: 'Changed my mind' }),
    mutation('address_delete', { address_id: productId, website_id: otherWebsite }),
    mutation('__proto__', {}),
  ]
  for (const payload of payloads) assert.equal((await route.POST(request(payload))).status, 400)
  assert.equal(state.calls.some(call => call.rpc), false)
})

test('saved addresses validate exact types, pincode and limits without coercion', async t => {
  const { load, state } = fixture(t); const route = load(customerPath)
  const address = { label: 'Home', name: 'Test Customer', phone: '+919876543210', address: '12 Test Street', pincode: '560001', is_default: true }
  for (const invalid of [{ pincode: 560001 }, { pincode: '56000' }, { is_default: 'true' }, { name: true }, { address: '' }, { label: 'x'.repeat(61) }]) assert.equal((await route.POST(request(mutation('address_save', { ...address, ...invalid })))).status, 400)
  assert.equal(state.calls.some(call => call.rpc), false)
  assert.equal((await route.POST(request(mutation('address_save', address)))).status, 200)
  assert.deepEqual(state.calls.find(call => call.rpc).args, { p_website_id: websiteId, p_action: 'address_save', p_payload: address })
  assert.equal(state.clients.at(-1).options.global.headers.Authorization, 'Bearer valid')
})

test('customer requests carry only verified JWT context and leave eligibility to transactional SQL', async t => {
  const { load, state } = fixture(t)
  const response = await load(customerPath).POST(request(mutation('request_create', { order_id: orderId, type: 'return', reason: 'The item arrived damaged' })))
  assert.equal(response.status, 200)
  const call = state.calls.find(call => call.rpc)
  assert.equal(call.rpc, 'commerce_customer_experience')
  assert.deepEqual(Object.keys(call.args).sort(), ['p_action', 'p_payload', 'p_website_id'])
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
})

test('another tenant cannot read engagement or submit decisions', async t => {
  const { load, state } = fixture(t); const route = load(ownerPath)
  const context = { params: Promise.resolve({ websiteId: otherWebsite }) }
  assert.equal((await route.GET(request(), context)).status, 403)
  assert.equal((await route.POST(request(ownerMutation('review_moderate', { review_id: productId, status: 'approved' })), context)).status, 403)
  assert.equal(state.calls.some(call => call.rpc), false)
})

test('review moderation and order decisions enforce distinct owner permissions', async t => {
  const { load, state, context } = fixture(t); const route = load(ownerPath)
  state.website.owner_permissions = { products: true, orders: false }
  assert.equal((await route.POST(request(ownerMutation('request_decide', { request_id: orderId, decision: 'approved', note: '' })), context)).status, 403)
  assert.equal((await route.POST(request(ownerMutation('review_moderate', { review_id: productId, status: 'approved' })), context)).status, 200)
  state.website.owner_permissions = { products: false, orders: true }
  assert.equal((await route.POST(request(ownerMutation('review_moderate', { review_id: productId, status: 'approved' })), context)).status, 403)
  assert.equal((await route.POST(request(ownerMutation('request_decide', { request_id: orderId, decision: 'rejected', note: 'Outside policy' })), context)).status, 200)
  assert.equal(state.calls.filter(call => call.rpc).length, 2)
})

test('owner cannot rewrite customer ratings or claim payment refunds through a decision', async t => {
  const { load, state, context } = fixture(t); const route = load(ownerPath)
  assert.equal((await route.POST(request(ownerMutation('review_moderate', { review_id: productId, status: 'approved', rating: 5 })), context)).status, 400)
  assert.equal((await route.POST(request(ownerMutation('request_decide', { request_id: orderId, decision: 'approved', note: '', payment_status: 'refunded' })), context)).status, 400)
  state.website.status = 'suspended'
  assert.equal((await route.POST(request(ownerMutation('review_moderate', { review_id: productId, status: 'approved' })), context)).status, 403)
  assert.equal(state.calls.some(call => call.rpc), false)
})

test('missing optional migration and SQL denials fail closed with no legacy mutation fallback', async t => {
  const { load, state } = fixture(t); const route = load(customerPath)
  state.error = { code: 'PGRST202', message: 'Function not found' }
  assert.equal((await route.POST(request(mutation('wishlist_add', { product_id: productId })))).status, 503)
  state.error = { code: '42501', message: 'Private cross customer details must not be echoed' }
  const response = await route.POST(request(mutation('request_create', { order_id: orderId, type: 'return', reason: 'Damaged item' })))
  assert.equal(response.status, 403)
  assert.equal(JSON.stringify(await response.json()).includes('cross customer'), false)
  assert.equal(state.calls.filter(call => call.rpc).every(call => call.rpc === 'commerce_customer_experience'), true)
})
