import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')

// Load the real handlers in memory. Only their Auth/database dependencies are
// local fixtures; these tests do not read credentials or contact a service.
function fixture({ signedIn = true, returnsEnabled = true, orderCustomerId = 'customer-a' } = {}) {
  const calls = []
  const tables = {
    restaurants: [{ id: 'restaurant-a', restaurant_code: 'TESTSTORE' }],
    delivery_orders: [{ id: 'order-a', restaurant_id: 'restaurant-a', order_code: 'ORDER001', customer_id: orderCustomerId, customer_mobile: '9000000000', order_status: 'delivered', payment_method: 'cod', payment_status: 'unpaid' }],
    delivery_settings: [{ restaurant_id: 'restaurant-a', customer_returns_enabled: returnsEnabled }],
  }
  const admin = {
    from(table) {
      const entry = { table, filters: [] }
      calls.push(entry)
      const query = {
        select() { return query },
        eq(key, value) { entry.filters.push({ key, value, insensitive: false }); return query },
        ilike(key, value) { entry.filters.push({ key, value, insensitive: true }); return query },
        async maybeSingle() {
          const data = (tables[table] || []).find(row => entry.filters.every(filter => filter.insensitive
            ? String(row[filter.key]).toLowerCase() === String(filter.value).toLowerCase()
            : row[filter.key] === filter.value)) || null
          return { data, error: null }
        },
      }
      return query
    },
    auth: { async getUser() { throw new Error('Unexpected bearer lookup in the Mobile/PIN fixture.') } },
    async rpc(name, args) {
      calls.push({ rpc: name, args })
      if (name === 'get_public_delivery_order') return { data: { success: true, order: { id: 'order-a', order_code: 'ORDER001' } }, error: null }
      assert.equal(name, 'create_public_delivery_after_sales_request')
      return { data: { success: true, case: { id: 'return-case-a', case_type: args.p_case_type } }, error: null }
    },
  }
  const cache = new Map()
  function load(relative) {
    const filename = path.resolve(root, relative.endsWith('.js') ? relative : `${relative}.js`)
    if (cache.has(filename)) return cache.get(filename).exports
    const loaded = new Module(filename)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    cache.set(filename, loaded)
    const nativeRequire = createRequire(filename)
    loaded.require = specifier => {
      if (specifier === '@/lib/server/adminSupabase') return { getAdminSupabase: () => admin }
      if (specifier === '@/lib/server/deliveryCustomerMobileSession') return { readDeliveryMobileSession: async () => signedIn ? { id: 'customer-a' } : null }
      if (specifier.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
      return nativeRequire(specifier)
    }
    loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, filename)
    return loaded.exports
  }
  return { calls, original: load('app/api/delivery/customer/return/route.js'), alias: load('app/api/delivery/customer/returns/route.js') }
}

const payload = { restaurantCode: 'TESTSTORE', orderCode: 'ORDER001', accountType: 'mobile', caseType: 'return', reason: 'Development fixture item issue', items: [{ id: 'item-a', quantity: 1 }] }
function request(method = 'GET', body = payload) {
  const url = 'https://dining.example.test/api/delivery/customer/returns?restaurantCode=TESTSTORE&orderCode=ORDER001&accountType=mobile'
  return new NextRequest(url, { method, ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) })
}

test('plural delivery return route exports the original GET and POST handlers unchanged', () => {
  const { original, alias } = fixture()
  assert.equal(alias.GET, original.GET)
  assert.equal(alias.POST, original.POST)
  assert.equal(alias.runtime, 'nodejs')
  assert.equal(alias.dynamic, 'force-dynamic')
})

test('plural delivery return route retains GET and POST validation before database access', async () => {
  const { alias, calls } = fixture()
  const get = await alias.GET(new NextRequest('https://dining.example.test/api/delivery/customer/returns'))
  const post = await alias.POST(request('POST', {}))
  assert.equal(get.status, 400)
  assert.equal(post.status, 400)
  assert.equal((await get.json()).success, false)
  assert.equal((await post.json()).success, false)
  assert.deepEqual(calls, [])
})

test('plural delivery return route retains the Mobile/PIN session requirement for both methods', async () => {
  const { alias, calls } = fixture({ signedIn: false })
  for (const method of ['GET', 'POST']) {
    const response = await alias[method](request(method))
    assert.equal(response.status, 401)
    assert.equal((await response.json()).code, 'MOBILE_SESSION_REQUIRED')
  }
  assert.equal(calls.filter(call => call.rpc).length, 0)
  assert.equal(calls.filter(call => call.table === 'delivery_orders').length, 0)
})

test('plural delivery return route rejects an order belonging to another customer', async () => {
  const { alias, calls } = fixture({ orderCustomerId: 'customer-b' })
  for (const method of ['GET', 'POST']) {
    const response = await alias[method](request(method))
    assert.equal(response.status, 404)
    assert.equal((await response.json()).message, 'This order is not linked to your account.')
  }
  assert.equal(calls.filter(call => call.rpc).length, 0)
  const lookups = calls.filter(call => call.table === 'delivery_orders')
  assert.ok(lookups.every(call => call.filters.some(filter => filter.key === 'customer_id' && filter.value === 'customer-a')))
})

test('plural delivery return GET preserves the delegated response, privacy headers and scoped RPC', async () => {
  const { alias, calls } = fixture()
  const response = await alias.GET(request())
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, order: { id: 'order-a', order_code: 'ORDER001' } })
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('vary'), 'Cookie, Authorization')
  assert.deepEqual(calls.find(call => call.rpc), { rpc: 'get_public_delivery_order', args: { p_restaurant_code: 'TESTSTORE', p_order_code: 'ORDER001', p_customer_mobile: '9000000000' } })
})

test('plural delivery return POST preserves successful case creation without inventing payment behavior', async () => {
  const { alias, calls } = fixture()
  const response = await alias.POST(request('POST'))
  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), { success: true, case: { id: 'return-case-a', case_type: 'return' } })
  assert.deepEqual(calls.find(call => call.rpc), { rpc: 'create_public_delivery_after_sales_request', args: { p_restaurant_code: 'TESTSTORE', p_order_code: 'ORDER001', p_customer_mobile: '9000000000', p_case_type: 'return', p_items: [{ id: 'item-a', quantity: 1 }], p_reason: 'Development fixture item issue' } })
})

test('plural delivery return route retains the store return-policy denial', async () => {
  const { alias, calls } = fixture({ returnsEnabled: false })
  const response = await alias.POST(request('POST'))
  assert.equal(response.status, 403)
  assert.equal((await response.json()).code, 'CUSTOMER_RETURNS_DISABLED')
  assert.equal(calls.filter(call => call.rpc).length, 0)
})
