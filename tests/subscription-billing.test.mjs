import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const restaurantId = '11111111-1111-4111-8111-111111111111'
const ownerId = '22222222-2222-4222-8222-222222222222'
const secret = 'synthetic-subscription-test-secret'
const currentPlans = {
  restaurant_pro: [1499, 8095, 14390],
  delivery: [1499, 8095, 14390],
  restaurant_resort_pro: [2999, 16195, 28790],
  restaurant_delivery: [2999, 16195, 28790],
  restaurant_resort_delivery: [3999, 21595, 38390],
}

// Compile the real modules in memory with explicit local dependencies. No
// provider SDK, credentials from the environment, fetch or network is used.
function load(relative, dependencies) {
  const filename = path.resolve(root, relative)
  const loaded = new Module(filename)
  loaded.filename = filename
  loaded.require = specifier => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected dependency: ${specifier}`)
    return dependencies[specifier]
  }
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename)
  return loaded.exports
}

function fixture(t, overrides = {}) {
  const environment = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
    PLATFORM_RAZORPAY_KEY_ID: 'rzp_test_synthetic',
    PLATFORM_RAZORPAY_KEY_SECRET: secret,
  }
  for (const [key, value] of Object.entries(environment)) {
    const previous = process.env[key]
    process.env[key] = value
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
  const state = {
    user: { id: ownerId },
    restaurant: { id: restaurantId, owner_id: ownerId, name: 'Development Restaurant', phone: '9000000000' },
    queries: [], clients: [], orders: [], providerReads: [], updates: [], defaults: [],
    order: {
      id: 'order_development', amount: 149900, currency: 'INR',
      notes: { restaurant_id: restaurantId, owner_id: ownerId, plan_code: 'restaurant_pro', billing_cycle: '1month' },
    },
    payment: { order_id: 'order_development', amount: 149900, currency: 'INR', status: 'captured' },
    ...overrides,
  }
  const client = {
    auth: { async getUser(token) { return token === 'valid-development-token' ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: 'Expired development session' } } } },
    from(table) {
      const record = { table, filters: [] }
      state.queries.push(record)
      const query = {
        select() { return query },
        eq(key, value) { record.filters.push([key, value]); return query },
        async maybeSingle() {
          const row = state.restaurant
          return { data: row && record.filters.every(([key, value]) => row[key] === value) ? row : null, error: null }
        },
        update(payload) { state.updates.push({ table, payload, filters: record.filters }); record.payload = payload; return query },
        async single() { return { data: { id: restaurantId, ...record.payload }, error: null } },
        async upsert(payload, options) { state.defaults.push({ table, payload, options }); return { error: null } },
      }
      return query
    },
  }
  class Razorpay {
    constructor(config) {
      assert.deepEqual(config, { key_id: 'rzp_test_synthetic', key_secret: secret })
      this.orders = {
        async create(order) { state.orders.push(order); return { id: 'order_development', ...order } },
        async fetch(id) { state.providerReads.push({ order: id }); return state.order },
      }
      this.payments = { async fetch(id) { state.providerReads.push({ payment: id }); return state.payment } }
    }
  }
  const dependencies = {
    'next/server': require('next/server'),
    crypto,
    razorpay: Razorpay,
    '@supabase/supabase-js': { createClient(url, key, options) {
      assert.equal(url, environment.NEXT_PUBLIC_SUPABASE_URL)
      assert.ok([environment.NEXT_PUBLIC_SUPABASE_ANON_KEY, environment.SUPABASE_SERVICE_ROLE_KEY].includes(key))
      state.clients.push({ key, options })
      return client
    } },
  }
  return { state, load: relative => load(relative, dependencies) }
}

function request(payload, token = 'valid-development-token') {
  return new NextRequest('https://dining.example.test/api/create-order', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  })
}

function paidPayload(overrides = {}) {
  const order = 'order_development'
  const payment = 'payment_development'
  return {
    restaurantId, planCode: 'restaurant_pro', billingCycle: '1month',
    razorpay_order_id: order, razorpay_payment_id: payment,
    razorpay_signature: crypto.createHmac('sha256', secret).update(`${order}|${payment}`).digest('hex'),
    ...overrides,
  }
}

test('bookmarked billing URL awaits route params and redirects to current subscription checkout', async () => {
  const redirects = []
  const page = load('app/dashboard/[id]/billing/page.jsx', { 'next/navigation': { redirect: target => { redirects.push(target) } } }).default
  await page({ params: Promise.resolve({ id: restaurantId }), searchParams: Promise.resolve({}) })
  assert.deepEqual(redirects, [`/subscribe/${restaurantId}`])
})

test('billing redirect preserves current plan selections while dropping obsolete or unsafe query inputs', async () => {
  let destination
  const page = load('app/dashboard/[id]/billing/page.jsx', { 'next/navigation': { redirect: target => { destination = target } } }).default
  for (const plan of Object.keys(currentPlans)) {
    await page({ params: Promise.resolve({ id: restaurantId }), searchParams: Promise.resolve({ plan, amount: '1' }) })
    assert.equal(destination, `/subscribe/${restaurantId}?plan=${plan}`)
  }
  for (const plan of ['Starter', 'Enterprise', '//external.example', ['delivery', 'restaurant_pro']]) {
    await page({ params: Promise.resolve({ id: restaurantId }), searchParams: Promise.resolve({ plan, amount: '1', next: 'https://external.example' }) })
    assert.equal(destination, `/subscribe/${restaurantId}`)
  }
  await page({ params: Promise.resolve({ id: '../other?next=https://external.example' }) })
  assert.equal(destination, '/subscribe/..%2Fother%3Fnext%3Dhttps%3A%2F%2Fexternal.example')
})

test('retired subscription-order endpoint returns explicit 410 without reading a payload or importing database/payment clients', async () => {
  const { POST } = load('app/api/create-subscription-order/route.js', { 'next/server': require('next/server') })
  const response = await POST({ json() { throw new Error('Retired endpoint must not parse or process payment payloads') } })
  assert.equal(response.status, 410)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), {
    success: false,
    code: 'SUBSCRIPTION_ENDPOINT_RETIRED',
    message: 'This legacy checkout has been retired. Open your restaurant subscription page to choose a current plan.',
    replacement: '/api/create-order',
  })
})

test('current subscription checkout rejects obsolete browser-price contracts and invalid billing cycles before any access', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/create-order/route.js')
  for (const body of [
    { restaurantId, planName: 'Starter Plan', amount: 799 },
    { restaurantId, plan: 'restaurant_pro', billingCycle: 'unlimited', amount: 1 },
  ]) {
    assert.equal((await route.POST(request(body))).status, 400)
  }
  assert.deepEqual(state.clients, [])
  assert.deepEqual(state.orders, [])
})

test('current subscription checkout requires a valid owner session and denies another restaurant owner', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/create-order/route.js')
  const body = { restaurantId, plan: 'restaurant_pro', billingCycle: '1month' }
  assert.equal((await route.POST(request(body, null))).status, 401)
  assert.equal((await route.POST(request(body, 'expired'))).status, 401)
  assert.deepEqual(state.queries, [])
  state.restaurant.owner_id = 'another-owner'
  assert.equal((await route.POST(request(body))).status, 403)
  assert.deepEqual(state.queries[0].filters, [['id', restaurantId], ['owner_id', ownerId]])
  assert.deepEqual(state.orders, [])
  assert.deepEqual(state.updates, [])
})

test('all fifteen current plan/cycle combinations use server prices despite a forged client amount', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/create-order/route.js')
  for (const [plan, prices] of Object.entries(currentPlans)) {
    for (const [index, billingCycle] of ['1month', '6months', '12months'].entries()) {
      const response = await route.POST(request({ restaurantId, plan, billingCycle, amount: 1, owner_id: 'another-owner' }))
      assert.equal(response.status, 200)
      const data = await response.json()
      const order = state.orders.at(-1)
      assert.equal(order.amount, prices[index] * 100)
      assert.equal(order.currency, 'INR')
      assert.equal(order.notes.restaurant_id, restaurantId)
      assert.equal(order.notes.owner_id, ownerId)
      assert.equal(order.notes.plan_code, plan)
      assert.equal(order.notes.billing_cycle, billingCycle)
      assert.equal(data.keyId, 'rzp_test_synthetic')
      assert.equal(data.keySecret, undefined)
      assert.equal(data.planCode, plan)
    }
  }
  assert.equal(state.orders.length, 15)
  assert.ok(state.clients.every(client => client.key === 'synthetic-anon-key' && client.options.global.headers.Authorization === 'Bearer valid-development-token'))
  assert.deepEqual(state.updates, [])
})

test('subscription verification rejects missing/invalid sessions and another owner before provider reads or data changes', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/verify-subscription/route.js')
  assert.equal((await route.POST(request(paidPayload(), null))).status, 401)
  assert.equal((await route.POST(request(paidPayload(), 'expired'))).status, 401)
  state.restaurant.owner_id = 'another-owner'
  assert.equal((await route.POST(request(paidPayload()))).status, 403)
  assert.deepEqual(state.providerReads, [])
  assert.deepEqual(state.updates, [])
})

test('subscription verification rejects forged payment signatures before provider reads or data changes', async t => {
  const { load, state } = fixture(t)
  const response = await load('app/api/verify-subscription/route.js').POST(request(paidPayload({ razorpay_signature: 'forged' })))
  assert.equal(response.status, 400)
  assert.equal((await response.json()).message, 'Payment signature verification failed.')
  assert.deepEqual(state.providerReads, [])
  assert.deepEqual(state.updates, [])
})

test('subscription verification rejects mismatched tenant, plan, amount, currency and unsuccessful provider states', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/verify-subscription/route.js')
  const originalOrder = structuredClone(state.order)
  const originalPayment = structuredClone(state.payment)
  const variations = [
    { order: { ...originalOrder, notes: { ...originalOrder.notes, restaurant_id: 'another-restaurant' } } },
    { order: { ...originalOrder, notes: { ...originalOrder.notes, owner_id: 'another-owner' } } },
    { order: { ...originalOrder, notes: { ...originalOrder.notes, plan_code: 'delivery' } } },
    { order: { ...originalOrder, amount: 1 } },
    { order: { ...originalOrder, currency: 'USD' } },
    { payment: { ...originalPayment, order_id: 'another-order' } },
    { payment: { ...originalPayment, amount: 1 } },
    { payment: { ...originalPayment, currency: 'USD' } },
    { payment: { ...originalPayment, status: 'failed' } },
    { payment: { ...originalPayment, status: 'created' } },
  ]
  for (const variation of variations) {
    state.order = variation.order || originalOrder
    state.payment = variation.payment || originalPayment
    const response = await route.POST(request(paidPayload()))
    assert.equal(response.status, 400)
    assert.equal((await response.json()).success, false)
    assert.deepEqual(state.updates, [])
    assert.deepEqual(state.defaults, [])
  }
})

test('verified test payment activates only the authenticated restaurant and prepares delivery settings when applicable', async t => {
  const { load, state } = fixture(t)
  state.order.notes.plan_code = 'restaurant_delivery'
  state.order.amount = 299900
  state.payment.amount = 299900
  const response = await load('app/api/verify-subscription/route.js').POST(request(paidPayload({ planCode: 'restaurant_delivery' })))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).restaurant.subscription_status, 'active')
  assert.equal(state.updates.length, 1)
  const update = state.updates[0]
  assert.equal(update.table, 'restaurants')
  assert.deepEqual(update.filters, [['id', restaurantId]])
  assert.equal(update.payload.plan_code, 'restaurant_delivery')
  assert.equal(update.payload.delivery_enabled, true)
  assert.equal(update.payload.resort_enabled, false)
  assert.equal(update.payload.subscription_status, 'active')
  assert.equal(state.defaults.length, 1)
  assert.equal(state.defaults[0].table, 'delivery_settings')
  assert.equal(state.defaults[0].payload.restaurant_id, restaurantId)
  assert.deepEqual(state.defaults[0].options, { onConflict: 'restaurant_id', ignoreDuplicates: true })
})
