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
const productId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const orderId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const idempotencyKey = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

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

const product = { name: 'Cotton Shirt', slug: 'cotton-shirt', price_paise: 12500 }
const checkout = { items: [{ product_id: productId, quantity: 2 }], customer: { name: 'Test Customer', phone: '+919876543210' }, fulfillment_method: 'pickup', idempotency_key: idempotencyKey, payment_method: 'cod' }

test('commerce user endpoints reject missing and expired tokens before querying data', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/commerce/applications/route.js')
  assert.equal((await route.GET(request(undefined, { token: null }))).status, 401)
  assert.equal((await route.GET(request(undefined, { token: 'expired' }))).status, 401)
  assert.equal(state.calls.filter(call => call.table || call.rpc).length, 0)
  assert.equal(state.adminClients, 0)
})

test('verified email comes from trusted Auth response rather than user metadata or phone confirmation', async t => {
  const { load, state } = fixture(t, { user: { id: ownerId, email: 'owner@example.test', confirmed_at: '2026-10-22', user_metadata: { email_confirmed: true } } })
  assert.equal((await load('app/api/commerce/workspace/route.js').GET(request())).status, 403)
  assert.equal(state.calls.filter(call => call.table).length, 0)
})

test('owner requests use anon key with the verified user JWT and never a service-role client', async t => {
  const { load, state } = fixture(t)
  const response = await load('app/api/commerce/workspace/route.js').GET(request())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).websites[0].id, websiteId)
  assert.equal(state.clients[0].options.global.headers.Authorization, 'Bearer valid-test-token')
  assert.equal(state.adminClients, 0)
})

test('another website ID cannot grant workspace access or trigger owner RPCs', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/commerce/workspace/[websiteId]/route.js')
  const context = { params: Promise.resolve({ websiteId: otherWebsiteId }) }
  assert.equal((await route.GET(request(), context)).status, 403)
  assert.equal((await route.POST(request(undefined, { method: 'POST', payload: { action: 'save_product', payload: product } }), context)).status, 403)
  assert.equal(state.calls.filter(call => call.rpc || call.table === 'commerce_products').length, 0)
})

test('cookie and bearer mutations reject cross-origin or missing-origin requests', async t => {
  const { load, context, state } = fixture(t)
  for (const origin of [null, 'https://untrusted.example']) {
    const response = await load('app/api/commerce/checkout/[websiteId]/route.js').POST(request(undefined, { method: 'POST', payload: checkout, origin }), context)
    assert.equal(response.status, 403)
    const adminResponse = await load('app/api/commerce/admin/route.js').POST(request(undefined, { method: 'POST', payload: {}, origin, admin: true }))
    assert.equal(adminResponse.status, 403)
  }
  assert.equal(state.calls.length, 0)
  assert.equal(state.adminClients, 0)
})

test('owner permissions and catalog/inventory feature switches are enforced before RPC execution', async t => {
  const { load, context, state } = fixture(t)
  const route = load('app/api/commerce/workspace/[websiteId]/route.js')
  state.tables.commerce_websites[0].owner_permissions = { products: false }
  assert.equal((await route.POST(request(undefined, { method: 'POST', payload: { action: 'save_product', payload: product } }), context)).status, 403)
  state.tables.commerce_websites[0].owner_permissions = {}
  state.tables.commerce_websites[0].features = { catalog: false, inventory: false }
  assert.equal((await route.POST(request(undefined, { method: 'POST', payload: { action: 'save_product', payload: product } }), context)).status, 403)
  assert.equal((await route.POST(request(undefined, { method: 'POST', payload: { action: 'adjust_stock', payload: { product_id: productId, delta: 1 } } }), context)).status, 403)
  assert.equal(state.calls.filter(call => call.rpc).length, 0)
})

test('missing or non-boolean permission and feature flags never grant owner mutations', async t => {
  const { load, context, state } = fixture(t)
  const route = load('app/api/commerce/workspace/[websiteId]/route.js')
  for (const permissions of [{}, { products: 'true' }, { products: null }]) {
    state.tables.commerce_websites[0].owner_permissions = permissions
    assert.equal((await route.POST(request(undefined, { method: 'POST', payload: { action: 'save_product', payload: product } }), context)).status, 403)
  }
  state.tables.commerce_websites[0].owner_permissions = { products: true }
  for (const features of [{}, { catalog: 'true' }, { catalog: null }]) {
    state.tables.commerce_websites[0].features = features
    assert.equal((await route.POST(request(undefined, { method: 'POST', payload: { action: 'save_product', payload: product } }), context)).status, 403)
  }
  assert.equal(state.calls.filter(call => call.rpc).length, 0)
})

test('workspace reads omit disabled customer and order modules before database queries', async t => {
  const { load, context, state } = fixture(t)
  state.tables.commerce_websites[0].owner_permissions = { products: true, categories: true, inventory: true, orders: false, customers: false }
  const response = await load('app/api/commerce/workspace/[websiteId]/route.js').GET(request(), context)
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).orders, [])
  assert.equal(state.calls.some(call => ['commerce_customers', 'commerce_orders', 'commerce_order_items'].includes(call.table)), false)
})

test('product edits reject arbitrary stock/tenant fields while valid product edits remain scoped', async t => {
  const { load, context, state } = fixture(t)
  const route = load('app/api/commerce/workspace/[websiteId]/route.js')
  for (const extra of [{ stock_quantity: 999 }, { website_id: otherWebsiteId }, { price_paise: -1 }]) {
    assert.equal((await route.POST(request(undefined, { method: 'POST', payload: { action: 'save_product', payload: { ...product, ...extra } } }), context)).status, 400)
  }
  state.rpcResults.commerce_owner_action = { id: productId, ...product }
  const response = await route.POST(request(undefined, { method: 'POST', payload: { action: 'save_product', payload: product } }), context)
  assert.equal(response.status, 200)
  const call = state.calls.find(call => call.rpc)
  assert.equal(call.args.p_website_id, websiteId)
  assert.equal(call.args.p_action, 'save_product')
  assert.deepEqual(call.args.p_payload, product)
})

test('checkout rejects online payments and client-controlled prices, totals or customer identity', async t => {
  const { load, context, state } = fixture(t)
  const route = load('app/api/commerce/checkout/[websiteId]/route.js')
  for (const payload of [{ ...checkout, payment_method: 'razorpay' }, { ...checkout, total_paise: 1 }, { ...checkout, customer_user_id: otherUserId }, { ...checkout, items: [{ product_id: productId, quantity: 1, price_paise: 1 }] }]) {
    assert.equal((await route.POST(request(undefined, { method: 'POST', payload }), context)).status, 400)
  }
  assert.equal(state.calls.filter(call => call.rpc).length, 0)
})

test('COD checkout forwards only server-approved RPC parameters and returns order snapshots', async t => {
  const { load, context, state } = fixture(t)
  state.rpcResults.commerce_create_cod_order = { order: { id: orderId, total_paise: 25000 }, items: [{ product_id: productId, quantity: 2 }] }
  const response = await load('app/api/commerce/checkout/[websiteId]/route.js').POST(request(undefined, { method: 'POST', payload: checkout }), context)
  assert.equal(response.status, 201)
  const result = await response.json()
  assert.equal(result.order.id, orderId)
  assert.equal(result.items[0].quantity, 2)
  const call = state.calls.find(call => call.rpc)
  assert.equal(call.rpc, 'commerce_create_cod_order')
  assert.deepEqual(Object.keys(call.args).sort(), ['p_customer', 'p_fulfillment', 'p_idempotency_key', 'p_items', 'p_website_id'])
  assert.equal(state.adminClients, 0)
})

test('checkout API and database limits agree before RPC execution', async t => {
  const { load, context, state } = fixture(t)
  const route = load('app/api/commerce/checkout/[websiteId]/route.js')
  const invalidPayloads = [
    { ...checkout, items: [{ product_id: productId, quantity: 1000 }] },
    { ...checkout, items: Array.from({ length: 51 }, () => ({ product_id: productId, quantity: 1 })) },
    { ...checkout, customer: { ...checkout.customer, phone: '123456' } },
  ]
  for (const payload of invalidPayloads) {
    assert.equal((await route.POST(request(undefined, { method: 'POST', payload }), context)).status, 400)
  }
  assert.equal(state.calls.some(call => call.rpc), false)
})

test('checkout never reports success when the database order response cannot be verified', async t => {
  const { load, context, state } = fixture(t)
  const route = load('app/api/commerce/checkout/[websiteId]/route.js')
  for (const result of [{}, { order: { id: orderId } }, { order: { id: 'invalid-id' }, items: [] }]) {
    state.rpcResults.commerce_create_cod_order = result
    const response = await route.POST(request(undefined, { method: 'POST', payload: checkout }), context)
    assert.equal(response.status, 503)
    assert.equal((await response.json()).success, false)
  }
})

test('customer order history filters the verified buyer and website, including item queries', async t => {
  const { load, state } = fixture(t)
  state.tables.commerce_orders = [
    { id: orderId, website_id: websiteId, customer_user_id: ownerId },
    { id: productId, website_id: websiteId, customer_user_id: otherUserId },
    { id: idempotencyKey, website_id: otherWebsiteId, customer_user_id: ownerId },
  ]
  state.tables.commerce_order_items = [{ order_id: orderId, website_id: websiteId }, { order_id: productId, website_id: websiteId }]
  const response = await load('app/api/commerce/customer/orders/route.js').GET(request('/api/commerce/customer/orders?website_id=' + websiteId))
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(result.orders.map(row => row.id), [orderId])
  assert.equal(result.order_items.length, 1)
})

test('admin endpoints require the existing signed session and derive actor email from it', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/commerce/admin/route.js')
  assert.equal((await route.GET(request())).status, 401)
  assert.equal(state.adminClients, 0)
  const payload = { slug: 'new-store', name: 'New Store', business_type: 'general' }
  assert.equal((await route.POST(request(undefined, { method: 'POST', admin: true, payload: { action: 'create_website', payload: { ...payload, actor_email: 'forged@example.test' } } }))).status, 400)
  state.rpcResults.commerce_admin_action = { id: websiteId, ...payload }
  const response = await route.POST(request(undefined, { method: 'POST', admin: true, payload: { action: 'create_website', payload } }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).website.id, websiteId)
  assert.equal(state.calls.find(call => call.rpc).args.p_actor_email, 'admin@example.test')
})

test('public catalog explicitly omits private owner, billing, application and customer data', async t => {
  const { load, state } = fixture(t)
  state.rpcResults.commerce_public_catalog = {
    website: { ...state.tables.commerce_websites[0], owner_id: ownerId, monthly_price_paise: 99999, branding: { primary_color: '#135724' }, fulfillment: {} },
    categories: [{ id: productId, name: 'Clothes', slug: 'clothes' }],
    products: [{ id: productId, name: 'Shirt', slug: 'shirt', description: 'Test', price_paise: 100, stock_quantity: 2, supplier_email: 'private@example.test' }],
    customers: [{ email: 'private@example.test' }],
  }
  const catalog = await load('lib/server/commerce/catalog.js').getPublicCatalog('first-store')
  assert.equal(catalog.website.branding.primary_color, '#135724')
  assert.equal(catalog.products[0].name, 'Shirt')
  assert.doesNotMatch(JSON.stringify(catalog), /owner_id|monthly_price|private@example|customers|supplier_email/)
  assert.equal(state.adminClients, 0)
  assert.equal(state.clients[0].options.global.headers, undefined)
})

test('public catalog rejects another slug and strips unsafe image URLs and unavailable features', async t => {
  const { load, state } = fixture(t)
  const { getPublicCatalog } = load('lib/server/commerce/catalog.js')
  state.rpcResults.commerce_public_catalog = {
    website: { ...state.tables.commerce_websites[0], slug: 'other-store' }, categories: [], products: [],
  }
  await assert.rejects(getPublicCatalog('first-store'), /Unable to verify website/)
  state.rpcResults.commerce_public_catalog = {
    website: { ...state.tables.commerce_websites[0], fulfillment: {} },
    categories: [],
    products: [{ id: productId, image_url: 'https://user:password@example.test/private-image.png' }],
  }
  const catalog = await getPublicCatalog('first-store')
  assert.equal(catalog.products[0].image_url, '')
  assert.equal(catalog.website.fulfillment.pickup, false)
  state.rpcResults.commerce_public_catalog.website.features = {}
  const disabled = await getPublicCatalog('first-store')
  assert.deepEqual(disabled.products, [])
  assert.deepEqual(disabled.categories, [])
  assert.equal(disabled.website.features.cod, false)
})

test('inactive and pharmacy stores are unavailable from the public catalog', async t => {
  const { load, state } = fixture(t)
  const { getPublicCatalog } = load('lib/server/commerce/catalog.js')
  for (const website of [{ slug: 'first-store', status: 'suspended' }, { slug: 'first-store', status: 'active', business_type: 'pharmacy' }]) {
    state.rpcResults.commerce_public_catalog = { website }
    assert.equal(await getPublicCatalog('first-store'), null)
  }
})

test('malformed, unsupported and oversized mutation bodies are rejected without RPC calls', async t => {
  const { load, context, state } = fixture(t)
  const route = load('app/api/commerce/checkout/[websiteId]/route.js')
  assert.equal((await route.POST(request(undefined, { method: 'POST', body: '{invalid' }), context)).status, 400)
  assert.equal((await route.POST(request(undefined, { method: 'POST', payload: checkout, contentType: 'text/plain' }), context)).status, 415)
  assert.equal((await route.POST(request(undefined, { method: 'POST', body: JSON.stringify({ value: 'x'.repeat(66000) }) }), context)).status, 413)
  assert.equal(state.calls.filter(call => call.rpc).length, 0)
})

test('database setup, stock conflicts and permission failures remain distinct', async t => {
  const { load, context, state } = fixture(t)
  const route = load('app/api/commerce/checkout/[websiteId]/route.js')
  for (const [error, status] of [[{ code: 'PGRST202', message: 'Missing RPC' }, 503], [{ code: 'P0001', message: 'Insufficient stock' }, 409], [{ code: '42501', message: 'permission denied' }, 403]]) {
    state.rpcError = error
    assert.equal((await route.POST(request(undefined, { method: 'POST', payload: checkout }), context)).status, status)
  }
})

test('operational database errors remain retryable HTTP503 responses before domain message fallbacks', async t => {
  const { load, context, state } = fixture(t)
  const route = load('app/api/commerce/checkout/[websiteId]/route.js')
  for (const [error, upstreamStatus] of [
    [{ code: '08006', message: 'Development database temporarily unavailable.' }, undefined],
    [{ code: '57P01', message: 'Database is unavailable during shutdown.' }, undefined],
    [{ code: '57014', message: 'Required database operation timed out.' }, undefined],
    [{ code: '', message: 'Upstream service unavailable.' }, 502],
  ]) {
    state.rpcError = error
    state.rpcStatus = upstreamStatus
    const response = await route.POST(request(undefined, { method: 'POST', payload: checkout }), context)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { success: false, message: 'Client Websites is temporarily unavailable. Please try again.' })
  }
  state.rpcStatus = undefined
  state.rpcError = { code: '22023', message: 'This fulfillment method is unavailable.' }
  assert.equal((await route.POST(request(undefined, { method: 'POST', payload: checkout }), context)).status, 400)
})
