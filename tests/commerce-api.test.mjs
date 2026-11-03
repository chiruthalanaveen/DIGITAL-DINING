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
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'development-anon-key', COMMERCE_ONLINE_PAYMENTS_ENABLED: 'false', COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE: 'false' })) {
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
    rpcResults: {}, rpcErrors: {},
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
      const missingExtension = ['commerce_public_catalog_v2', 'commerce_create_cod_order_v2'].includes(name) && !Object.hasOwn(state.rpcResults, name)
      const error = state.rpcErrors[name] || state.rpcError || (missingExtension ? { code: 'PGRST202', message: 'Development fixture optional RPC is not installed.' } : null)
      return { data: typeof result === 'function' ? result(args) : Object.hasOwn(state.rpcResults, name) ? result : {}, error, status: state.rpcStatus }
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
const variantId = '12345678-1234-4234-8234-123456789012'
const imageId = '12345678-1234-4234-8234-123456789013'
const zoneId = '12345678-1234-4234-8234-123456789014'

function expandedCatalog(state) {
  return {
    website: { ...state.tables.commerce_websites[0], template: 'grocery', settings: { template: 'grocery', delivery_zones_enabled: true, policies: { shipping: 'Delivery on working days.', returns_enabled: false, return_days: 0 }, faq: [{ question: 'Where do you deliver?', answer: 'Within our listed PIN codes.' }], sections: [{ id: 'welcome', type: 'hero', enabled: true, title: 'Fresh produce' }], seo: { title: 'First Grocery', description: 'Local produce.' }, website_id: websiteId, internal_note: 'private-catalog-note' }, fulfillment: { pickup: true, delivery: true, delivery_fee_paise: 500, minimum_order_paise: 1000 }, owner_id: ownerId, monthly_price_paise: 4000 },
    categories: [],
    products: [{ id: productId, category_id: null, name: 'Rice', slug: 'rice', description: 'Fresh rice', price_paise: 2000, stock_quantity: 4, image_url: 'https://images.example.test/rice.jpg', attributes: { Weight: '1 kg' }, variants_required: true, images: [{ id: imageId, url: 'https://images.example.test/rice-front.jpg', alt: 'Rice front', sort_order: 0, website_id: websiteId }], variants: [{ id: variantId, product_id: productId, sku: 'RICE-1KG', name: 'One kilogram', options: { Weight: '1 kg' }, price_paise: 2100, stock_quantity: 3, active: true, supplier_email: 'private-supplier@example.test' }], supplier_email: 'private-supplier@example.test' }],
    delivery_zones: [{ id: zoneId, name: 'Local area', pincodes: ['560001'], delivery_fee_paise: 500, minimum_order_paise: 1000, website_id: websiteId, internal_note: 'private-zone-note' }],
    customers: [{ email: 'private-customer@example.test' }],
  }
}

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
  const call = state.calls.find(call => call.rpc === 'commerce_create_cod_order')
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

test('expanded public catalog preserves safe templates, galleries, variants and delivery zones without private columns', async t => {
  const { load, state } = fixture(t)
  state.rpcResults.commerce_public_catalog_v2 = expandedCatalog(state)
  const catalog = await load('lib/server/commerce/catalog.js').getPublicCatalog('first-store')
  assert.equal(catalog.website.template, 'grocery')
  assert.equal(catalog.website.settings.seo.title, 'First Grocery')
  assert.equal(catalog.website.settings.sections[0].id, 'welcome')
  assert.equal(catalog.products[0].variants_required, true)
  assert.deepEqual(catalog.products[0].variants, [{ id: variantId, product_id: productId, sku: 'RICE-1KG', name: 'One kilogram', options: { Weight: '1 kg' }, price_paise: 2100, stock_quantity: 3, active: true }])
  assert.deepEqual(catalog.products[0].images, [{ id: imageId, url: 'https://images.example.test/rice-front.jpg', alt: 'Rice front', sort_order: 0 }])
  assert.deepEqual(catalog.delivery_zones, [{ id: zoneId, name: 'Local area', pincodes: ['560001'], delivery_fee_paise: 500, minimum_order_paise: 1000 }])
  assert.equal(catalog.expansion_available, true)
  assert.doesNotMatch(JSON.stringify(catalog), /owner_id|website_id|supplier_email|internal_note|monthly_price|private-catalog|private-supplier|private-customer|private-zone/)
  assert.deepEqual(state.calls.filter(call => call.rpc).map(call => call.rpc), ['commerce_public_catalog_v2'])
  assert.equal(state.adminClients, 0)
})

test('catalog uses the legacy contract only when the optional schema has a typed missing-function or missing-table error', async t => {
  const { load, state } = fixture(t)
  state.rpcResults.commerce_public_catalog = { website: { ...state.tables.commerce_websites[0], fulfillment: {} }, categories: [], products: [] }
  const { getPublicCatalog } = load('lib/server/commerce/catalog.js')
  for (const code of ['PGRST202', 'PGRST205', '42883', '42P01']) {
    state.calls.length = 0
    state.rpcErrors.commerce_public_catalog_v2 = { code, message: 'Optional development extension is absent.' }
    const catalog = await getPublicCatalog('first-store')
    assert.equal(catalog.website.template, 'general')
    assert.equal(Object.hasOwn(catalog.website, 'settings'), false, 'Legacy stores must not require an unavailable quote endpoint.')
    assert.deepEqual(state.calls.filter(call => call.rpc).map(call => call.rpc), ['commerce_public_catalog_v2', 'commerce_public_catalog'])
  }
})

test('denied or unavailable catalog extensions never fall back to weaker legacy reads', async t => {
  const { load, state } = fixture(t)
  state.rpcResults.commerce_public_catalog = { website: state.tables.commerce_websites[0], categories: [], products: [] }
  const { getPublicCatalog } = load('lib/server/commerce/catalog.js')
  for (const [code, status] of [['42501', 403], ['57014', 503], ['08006', 503], ['P0001', 503]]) {
    state.calls.length = 0
    state.rpcErrors.commerce_public_catalog_v2 = { code, message: 'Development catalog failure.' }
    await assert.rejects(getPublicCatalog('first-store'), error => error.status === status)
    assert.equal(state.calls.some(call => call.rpc === 'commerce_public_catalog'), false)
  }
})

test('successful null catalog stays unavailable and malformed successful catalog cannot trigger legacy fallback', async t => {
  const { load, state } = fixture(t)
  const { getPublicCatalog } = load('lib/server/commerce/catalog.js')
  state.rpcResults.commerce_public_catalog_v2 = null
  assert.equal(await getPublicCatalog('first-store'), null)
  const mismatchedTemplate = expandedCatalog(state)
  mismatchedTemplate.website.template = 'fashion'
  const negativeStock = expandedCatalog(state)
  negativeStock.products[0].variants[0].stock_quantity = -1
  const crossProductVariant = expandedCatalog(state)
  crossProductVariant.products[0].variants[0].product_id = otherWebsiteId
  const unsafeSettings = expandedCatalog(state)
  unsafeSettings.website.settings.sections[0].image_url = 'javascript:alert(1)'
  for (const malformed of [{}, [], { website: {} }, mismatchedTemplate, negativeStock, crossProductVariant, unsafeSettings]) {
    state.rpcResults.commerce_public_catalog_v2 = malformed
    await assert.rejects(getPublicCatalog('first-store'), error => error.status === 503)
  }
  assert.equal(state.calls.some(call => call.rpc === 'commerce_public_catalog'), false)
})

test('extended checkout carries variants, saved-address identity and normalized coupon to v2 while keeping prices server-owned', async t => {
  const { load, state, context } = fixture(t)
  state.rpcResults.commerce_create_cod_order_v2 = { order: { id: orderId, total_paise: 4600 }, items: [{ product_id: productId, variant_id: variantId, quantity: 2, unit_price_paise: 2100 }] }
  const payload = { ...checkout, fulfillment_method: 'delivery', items: [{ product_id: productId, variant_id: variantId, quantity: 2 }], customer: { ...checkout.customer, saved_address_id: imageId }, coupon_code: 'fresh10' }
  const response = await load('app/api/commerce/checkout/[websiteId]/route.js').POST(request(undefined, { method: 'POST', payload }), context)
  assert.equal(response.status, 201)
  const calls = state.calls.filter(call => call.rpc)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].rpc, 'commerce_create_cod_order_v2')
  assert.deepEqual(calls[0].args, { p_website_id: websiteId, p_items: payload.items, p_customer: payload.customer, p_fulfillment: 'delivery', p_idempotency_key: idempotencyKey, p_coupon_code: 'FRESH10' })
  assert.equal((await response.json()).items[0].unit_price_paise, 2100)
  assert.equal(state.adminClients, 0)
})

test('missing v2 checkout refuses every extended option instead of silently dropping it', async t => {
  const { load, state, context } = fixture(t)
  const route = load('app/api/commerce/checkout/[websiteId]/route.js')
  const payloads = [
    { ...checkout, items: [{ product_id: productId, quantity: 1, variant_id: variantId }] },
    { ...checkout, coupon_code: 'FRESH10' },
    { ...checkout, customer: { ...checkout.customer, saved_address_id: imageId } },
    { ...checkout, customer: { ...checkout.customer, pincode: '560001' } },
  ]
  for (const payload of payloads) {
    const response = await route.POST(request(undefined, { method: 'POST', payload }), context)
    assert.equal(response.status, 503)
    assert.equal((await response.json()).success, false)
  }
  assert.equal(state.calls.some(call => call.rpc === 'commerce_create_cod_order'), false)
})

test('denied, timed-out and malformed v2 checkout responses preserve the original attempt and never call legacy checkout', async t => {
  const { load, state, context } = fixture(t)
  const route = load('app/api/commerce/checkout/[websiteId]/route.js')
  for (const [code, status] of [['42501', 403], ['57014', 503]]) {
    state.rpcErrors.commerce_create_cod_order_v2 = { code, message: 'Development checkout failure.' }
    assert.equal((await route.POST(request(undefined, { method: 'POST', payload: checkout }), context)).status, status)
  }
  delete state.rpcErrors.commerce_create_cod_order_v2
  for (const data of [null, {}, { order: { id: 'invalid' }, items: [] }, { order: { id: orderId } }]) {
    state.rpcResults.commerce_create_cod_order_v2 = data
    assert.equal((await route.POST(request(undefined, { method: 'POST', payload: checkout }), context)).status, 503)
  }
  assert.equal(state.calls.some(call => call.rpc === 'commerce_create_cod_order'), false)
  assert.ok(state.calls.filter(call => call.rpc).every(call => call.args.p_idempotency_key === idempotencyKey))
})

test('quote endpoint requires verified buyers, forwards no client price and checks authoritative arithmetic', async t => {
  const { load, state, context } = fixture(t)
  const route = load('app/api/commerce/quote/[websiteId]/route.js')
  const payload = { items: [{ product_id: productId, variant_id: variantId, quantity: 2 }], customer: checkout.customer, fulfillment_method: 'pickup', coupon_code: 'fresh10' }
  const quote = { items: [{ product_id: productId, variant_id: variantId, quantity: 2, unit_price_paise: 2100, line_total_paise: 4200 }], subtotal_paise: 4200, delivery_fee_paise: 0, discount_paise: 420, total_paise: 3780, minimum_order_paise: 0, delivery_zone: null }
  assert.equal((await route.POST(request(undefined, { method: 'POST', payload, token: null }), context)).status, 401)
  state.rpcResults.commerce_checkout_quote_v2 = quote
  const response = await route.POST(request(undefined, { method: 'POST', payload }), context)
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).quote, quote)
  assert.deepEqual(state.calls.find(call => call.rpc)?.args, { p_website_id: websiteId, p_items: payload.items, p_customer: checkout.customer, p_fulfillment: 'pickup', p_coupon_code: 'FRESH10' })
  for (const invalid of [{ ...quote, total_paise: 1 }, { ...quote, discount_paise: -1 }, { ...quote, total_paise: '3780' }, { ...quote, subtotal_paise: Number.MAX_SAFE_INTEGER + 1 }]) {
    state.rpcResults.commerce_checkout_quote_v2 = invalid
    assert.equal((await route.POST(request(undefined, { method: 'POST', payload }), context)).status, 503)
  }
  const before = state.calls.filter(call => call.rpc).length
  for (const invalid of [{ ...payload, total_paise: 1 }, { ...payload, customer_user_id: otherUserId }, { ...payload, items: [{ product_id: productId, quantity: 1, price_paise: 1 }] }, { ...payload, customer: { ...checkout.customer, pincode: 'badpin' } }]) {
    assert.equal((await route.POST(request(undefined, { method: 'POST', payload: invalid }), context)).status, 400)
  }
  assert.equal(state.calls.filter(call => call.rpc).length, before)
})

test('catalog owner mutations check tenant membership, feature flags and distinct product, inventory and branding permissions', async t => {
  const { load, state, context } = fixture(t)
  const route = load('app/api/commerce/workspace/[websiteId]/catalog/route.js')
  state.rpcResults.commerce_catalog_owner_action = { id: variantId }
  const variant = { product_id: productId, name: 'One kilogram', sku: 'RICE-1KG', options: { Weight: '1 kg' }, price_paise: 2100, active: true }
  const otherContext = { params: Promise.resolve({ websiteId: otherWebsiteId }) }
  const mutation = payload => request(undefined, { method: 'POST', payload })
  assert.equal((await route.POST(mutation({ action: 'save_variant', payload: variant }), otherContext)).status, 403)
  assert.equal((await route.POST(mutation({ action: 'save_settings', payload: { faq: [] } }), context)).status, 403)
  state.tables.commerce_websites[0].owner_permissions.inventory = false
  assert.equal((await route.POST(mutation({ action: 'adjust_variant_stock', payload: { variant_id: variantId, delta: 1 } }), context)).status, 403)
  state.tables.commerce_websites[0].features.catalog = false
  assert.equal((await route.POST(mutation({ action: 'save_variant', payload: variant }), context)).status, 403)
  state.tables.commerce_websites[0].features.catalog = true
  const response = await route.POST(mutation({ action: 'save_variant', payload: variant }), context)
  assert.equal(response.status, 200)
  assert.deepEqual(state.calls.filter(call => call.rpc), [{ rpc: 'commerce_catalog_owner_action', args: { p_website_id: websiteId, p_action: 'save_variant', p_payload: variant } }])
  assert.equal(state.adminClients, 0)
})

test('owner extension schemas reject raw stock overwrite, mismatched gallery order, unknown settings, unsafe URLs and incomplete return policies', async t => {
  const { load, state, context } = fixture(t)
  state.tables.commerce_websites[0].owner_permissions.branding = true
  const route = load('app/api/commerce/workspace/[websiteId]/catalog/route.js')
  const invalidActions = [
    ['save_variant', { product_id: productId, name: 'Large', sku: 'LARGE', options: {}, price_paise: 100, stock_quantity: 500 }],
    ['save_product_options', { product_id: productId, variants_required: false, images: [{ url: 'https://images.example.test/rice.jpg', sort_order: 1 }] }],
    ['save_product_options', { product_id: productId, variants_required: false, images: [{ url: 'https://user:password@images.example.test/rice.jpg' }] }],
    ['save_settings', { template: 'fashion' }],
    ['save_settings', { seo: { image_url: 'javascript:alert(1)' } }],
    ['save_settings', { policies: { returns_enabled: true, return_days: 0, returns: 'Return within window.' } }],
    ['save_settings', { policies: { returns_enabled: true, return_days: 14, returns: '' } }],
    ['save_delivery_zone', { name: 'Local', pincodes: ['560001', '560001'], delivery_fee_paise: 0, minimum_order_paise: 0 }],
    ['save_delivery_zone', { name: 'Local', pincodes: ['badpin'], delivery_fee_paise: 0, minimum_order_paise: 0 }],
    ['adjust_variant_stock', { variant_id: variantId, delta: '1' }],
  ]
  for (const [action, payload] of invalidActions) assert.equal((await route.POST(request(undefined, { method: 'POST', payload: { action, payload } }), context)).status, 400)
  assert.equal(state.calls.some(call => call.rpc), false)
})

test('template assignment and Admin catalog inspection require signed Admin and never accept owner elevation or forged tenant identity', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/commerce/admin/catalog/route.js')
  const path = '/api/commerce/admin/catalog?website_id=' + websiteId + '&workspace=1'
  assert.equal((await route.GET(request(path))).status, 401)
  const payload = { website_id: websiteId, action: 'save_template', payload: { template: 'sarees' } }
  assert.equal((await route.POST(request(path, { method: 'POST', payload }))).status, 401)
  assert.equal(state.adminClients, 0)
  assert.equal((await route.POST(request(path, { method: 'POST', admin: true, origin: 'https://untrusted.example', payload }))).status, 403)
  assert.equal((await route.POST(request(path, { method: 'POST', admin: true, payload: { ...payload, actor_email: 'forged@example.test' } }))).status, 400)
  assert.equal((await route.POST(request(path, { method: 'POST', admin: true, payload: { ...payload, payload: { template: 'unsupported' } } }))).status, 400)
  state.rpcResults.commerce_catalog_admin_action = { template: 'sarees' }
  assert.equal((await route.POST(request(path, { method: 'POST', admin: true, payload }))).status, 200)
  state.rpcResults.commerce_catalog_admin_action = { settings: { template: 'sarees' }, product_profiles: [], images: [], variants: [], delivery_zones: [] }
  const response = await route.GET(request(path, { admin: true }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).settings.template, 'sarees')
  const calls = state.calls.filter(call => call.rpc)
  assert.deepEqual(calls.map(call => call.args.p_action), ['save_template', 'get_workspace'])
  assert.ok(calls.every(call => call.args.p_website_id === websiteId))
  assert.equal(state.calls.some(call => call.auth), false, 'Admin inspection must not create or impersonate an owner session.')
})

test('online payment visibility needs the global flag, safe readiness projection and separate live-mode permission', async t => {
  const { load, state } = fixture(t)
  state.rpcResults.commerce_public_catalog_v2 = expandedCatalog(state)
  state.rpcResults.commerce_payment_availability = { available: true, provider: 'razorpay', mode: 'test', key_secret: 'never-public-secret', merchant_email: 'private@example.test' }
  const { getPublicCatalog } = load('lib/server/commerce/catalog.js')
  assert.deepEqual((await getPublicCatalog('first-store')).payments, { available: false })
  assert.equal(state.calls.some(call => call.rpc === 'commerce_payment_availability'), false)
  process.env.COMMERCE_ONLINE_PAYMENTS_ENABLED = 'true'
  const catalog = await getPublicCatalog('first-store')
  assert.deepEqual(catalog.payments, { available: true, provider: 'razorpay', mode: 'test' })
  assert.doesNotMatch(JSON.stringify(catalog), /never-public|key_secret|merchant_email/)
  state.rpcResults.commerce_payment_availability.mode = 'live'
  assert.deepEqual((await getPublicCatalog('first-store')).payments, { available: false })
  process.env.COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE = 'true'
  assert.deepEqual((await getPublicCatalog('first-store')).payments, { available: true, provider: 'razorpay', mode: 'live' })
  state.rpcResults.commerce_payment_availability.provider = 'unknown'
  assert.deepEqual((await getPublicCatalog('first-store')).payments, { available: false })
})

test('Admin template assignment never confirms malformed or mismatched successful database responses', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/commerce/admin/catalog/route.js')
  const payload = { website_id: websiteId, action: 'save_template', payload: { template: 'sarees' } }
  for (const result of [null, [], {}, { template: 'fashion' }, { template: 'unsupported' }]) {
    state.rpcResults.commerce_catalog_admin_action = result
    const response = await route.POST(request(undefined, { method: 'POST', admin: true, payload }))
    assert.equal(response.status, 503, `Malformed or mismatched template result ${JSON.stringify(result)} must fail closed.`)
    assert.equal((await response.json()).success, false)
  }
})

test('Admin catalog reads distinguish absent capability from malformed successful workspace data', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/commerce/admin/catalog/route.js')
  const path = '/api/commerce/admin/catalog?website_id=' + websiteId + '&workspace=1'
  for (const result of [null, [], {}, 'invalid', { settings: [], product_profiles: [], images: [], variants: [], delivery_zones: [] }]) {
    state.rpcResults.commerce_catalog_admin_action = result
    assert.equal((await route.GET(request(path, { admin: true }))).status, 503)
  }
  state.rpcErrors.commerce_catalog_admin_action = { code: 'PGRST202', message: 'Development extension absent.' }
  const response = await route.GET(request(path, { admin: true }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).available, false)
})

test('owner catalog reads reject malformed and cross-tenant workspaces while keeping optional schema absence separate', async t => {
  const { load, state, context } = fixture(t)
  const route = load('app/api/commerce/workspace/[websiteId]/catalog/route.js')
  const workspace = () => ({ settings: { template: 'grocery', website_id: websiteId, internal_note: 'private-settings-note' }, product_profiles: [], images: [], variants: [], delivery_zones: [], available: false, success: false, unrelated: 'discard-this-root-key' })
  const foreignRows = ['product_profiles', 'images', 'variants', 'delivery_zones'].map(key => ({ ...workspace(), [key]: [{ website_id: otherWebsiteId, id: variantId }] }))
  for (const malformed of [null, [], {}, { ...workspace(), settings: [] }, { ...workspace(), variants: {} }, { ...workspace(), images: [null] }, { ...workspace(), settings: { template: 'unsupported' } }, ...foreignRows]) {
    state.rpcResults.commerce_catalog_workspace = malformed
    const response = await route.GET(request(), context)
    assert.equal(response.status, 503, 'Malformed or cross-tenant workspace rows must fail closed.')
    assert.equal((await response.json()).success, false)
  }
  state.rpcResults.commerce_catalog_workspace = workspace()
  const response = await route.GET(request(), context)
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.success, true)
  assert.equal(result.available, true)
  assert.equal(result.settings.template, 'grocery')
  assert.doesNotMatch(JSON.stringify(result), /private-settings-note|internal_note|unrelated|discard-this/)
  assert.deepEqual(state.calls.filter(call => call.rpc).at(-1).args, { p_website_id: websiteId })
  state.rpcErrors.commerce_catalog_workspace = { code: 'PGRST202', message: 'Development extension is absent.' }
  const missingResponse = await route.GET(request(), context)
  assert.equal(missingResponse.status, 200)
  assert.equal((await missingResponse.json()).available, false)
  state.rpcErrors.commerce_catalog_workspace = { code: '42501', message: 'Development permission denied.' }
  assert.equal((await route.GET(request(), context)).status, 403)
  assert.equal(state.adminClients, 0)
})
