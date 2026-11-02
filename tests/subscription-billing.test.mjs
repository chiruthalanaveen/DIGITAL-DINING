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
const checkoutId = '33333333-3333-4333-8333-333333333333'
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
    SUBSCRIPTION_PAID_CHECKOUT_ENABLED: 'true',
    TEST_COUPON_RESTAURANT_1M: 'SYNTHETIC-COUPON-ONLY',
  }
  for (const [key, value] of Object.entries(environment)) {
    const previous = process.env[key]
    process.env[key] = value
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
  const initialIntent = {
    id: checkoutId, restaurant_id: restaurantId, owner_id: ownerId,
    plan_code: 'restaurant_pro', billing_cycle: '1month', amount_paise: 149900,
    currency: 'INR', provider_key_id: environment.PLATFORM_RAZORPAY_KEY_ID,
    provider_order_id: 'order_development', created_at: '2026-11-01T00:00:00.000Z',
  }
  const state = {
    user: { id: ownerId },
    restaurant: { id: restaurantId, owner_id: ownerId, name: 'Development Restaurant', phone: '9000000000', approval_status: 'approved' },
    queries: [], clients: [], orders: [], providerReads: [], updates: [], defaults: [],
    ledgerCalls: [], activationWrites: [], events: [],
    intents: new Map([[checkoutId, initialIntent]]), receipts: new Map(),
    rpcErrors: {}, rpcResults: {},
    order: {
      id: 'order_development', amount: 149900, currency: 'INR',
      notes: { restaurant_id: restaurantId, owner_id: ownerId, plan_code: 'restaurant_pro', billing_cycle: '1month', checkout_id: checkoutId },
    },
    payment: { id: 'payment_development', order_id: 'order_development', amount: 149900, currency: 'INR', status: 'captured' },
    ...overrides,
  }
  const baseClient = {
    auth: { async getUser(token) { return token === 'valid-development-token' ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: 'Expired development session' } } } },
    from(table) {
      assert.ok(['restaurants', 'delivery_settings'].includes(table), `Unexpected table: ${table}`)
      const record = { table, filters: [] }
      state.queries.push(record)
      const query = {
        select() { return query },
        eq(key, value) { record.filters.push([key, value]); return query },
        async maybeSingle() {
          const row = state.restaurant
          return { data: row && record.filters.every(([key, value]) => row[key] === value) ? row : null, error: null }
        },
        update() { throw new Error('Paid subscription route must never directly update a restaurant') },
        async upsert(payload, options) { state.defaults.push({ table, payload, options }); return { error: state.defaultError || null } },
      }
      return query
    },
  }
  async function rpc(name, args, key) {
    assert.equal(key, environment.SUPABASE_SERVICE_ROLE_KEY, 'Only server service client may call the private ledger')
    state.events.push('rpc:' + name)
    state.ledgerCalls.push({ name, args: structuredClone(args) })
    if (name === 'activate_test_subscription_coupon') return { data: { success: true, restaurant: { id: restaurantId, plan_code: 'restaurant_pro', subscription_status: 'active' } }, error: null }
    if (state.rpcErrors[name]) return { data: null, error: state.rpcErrors[name] }
    if (Object.hasOwn(state.rpcResults, name)) return { data: state.rpcResults[name], error: null }
    if (name === 'subscription_open_checkout') {
      const checkout = { id: args.p_checkout_id, restaurant_id: args.p_restaurant_id, owner_id: args.p_owner_id,
        plan_code: args.p_plan_code, billing_cycle: args.p_billing_cycle, amount_paise: args.p_amount_paise,
        currency: args.p_currency, provider_key_id: args.p_provider_key_id, provider_order_id: null,
        created_at: '2026-11-01T00:00:00.000Z' }
      state.intents.set(checkout.id, checkout)
      return { data: { success: true, checkout: structuredClone(checkout) }, error: null }
    }
    const intent = state.intents.get(args.p_checkout_id)
    if (!intent) return { data: null, error: { code: '55000' } }
    if (name === 'subscription_bind_checkout') {
      intent.provider_order_id = args.p_provider_order_id
      return { data: { success: true, checkout: structuredClone(intent) }, error: null }
    }
    assert.equal(name, 'subscription_activate_payment', `Unexpected RPC: ${name}`)
    const matches = ['restaurant_id', 'owner_id', 'provider_order_id', 'amount_paise', 'currency', 'plan_code', 'billing_cycle', 'provider_key_id']
      .every(field => intent[field] === args['p_' + field])
    if (!matches) return { data: null, error: { code: '22023' } }
    const stored = state.receipts.get(args.p_provider_payment_id)
    if (stored) return { data: { ...structuredClone(stored), replayed: true }, error: null }
    const hasResort = args.p_plan_code.includes('resort')
    const hasDelivery = args.p_plan_code.includes('delivery')
    const expiry = ({ '1month': '2026-12-01', '6months': '2027-05-01', '12months': '2027-11-01' })[args.p_billing_cycle] + 'T00:00:00.000Z'
    const result = {
      success: true, replayed: false,
      receipt: { checkout_id: args.p_checkout_id, provider_order_id: args.p_provider_order_id,
        provider_payment_id: args.p_provider_payment_id, amount_paise: args.p_amount_paise, currency: args.p_currency,
        activated_at: '2026-11-01T00:00:00.000Z', subscription_expires_at: expiry },
      restaurant: { id: args.p_restaurant_id, name: state.restaurant.name, plan: hasResort ? 'Pro+' : 'Pro',
        plan_code: args.p_plan_code, billing_cycle: args.p_billing_cycle, subscription_status: 'active',
        subscription_expires_at: expiry, business_type: args.p_plan_code === 'restaurant_pro' ? 'restaurant' : args.p_plan_code === 'restaurant_resort_pro' ? 'restaurant_resort' : args.p_plan_code,
        resort_enabled: hasResort, delivery_enabled: hasDelivery },
    }
    state.activationWrites.push(structuredClone(result))
    state.receipts.set(args.p_provider_payment_id, structuredClone(result))
    if (state.loseNextActivationResponse) {
      state.loseNextActivationResponse = false
      return { data: null, error: { code: '08006' } }
    }
    return { data: result, error: null }
  }
  class Razorpay {
    constructor(config) {
      assert.deepEqual(config, { key_id: 'rzp_test_synthetic', key_secret: secret })
      state.events.push('provider:constructed')
      this.orders = {
        async create(order) {
          state.events.push('provider:create')
          state.orders.push(order)
          return state.providerCreateResult || { id: 'order_development', ...order }
        },
        async fetch(id) { state.providerReads.push({ order: id }); return state.order },
      }
      this.payments = { async fetch(id) { state.providerReads.push({ payment: id }); return state.payment } }
    }
  }
  const dependencies = {
    'next/server': require('next/server'),
    crypto,
    '@/lib/server/subscriptionLedger': load('lib/server/subscriptionLedger.js', {}),
    razorpay: Razorpay,
    '@supabase/supabase-js': { createClient(url, key, options) {
      assert.equal(url, environment.NEXT_PUBLIC_SUPABASE_URL)
      assert.ok([environment.NEXT_PUBLIC_SUPABASE_ANON_KEY, environment.SUPABASE_SERVICE_ROLE_KEY].includes(key))
      state.clients.push({ key, options })
      return { ...baseClient, rpc: (name, args) => rpc(name, args, key) }
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

test('subscription creation and both activation modes require explicit Super Admin approval before provider or mutation work', async t => {
  for (const approvalStatus of ['pending', 'rejected', 'suspended', null, undefined, '']) {
    const { load, state } = fixture(t)
    state.restaurant.approval_status = approvalStatus
    const attempts = [
      ['app/api/create-order/route.js', { restaurantId, plan: 'restaurant_pro', billingCycle: '1month' }],
      ['app/api/verify-subscription/route.js', paidPayload()],
      ['app/api/verify-subscription/route.js', { restaurantId, mode: 'coupon', couponCode: 'local-unavailable-coupon' }],
    ]
    for (const [route, payload] of attempts) {
      const response = await load(route).POST(request(payload))
      assert.equal(response.status, 403, `${route}: ${approvalStatus}`)
      const body = await response.json()
      assert.equal(body.success, false)
      assert.equal(body.code, 'OWNER_APPROVAL_REQUIRED')
    }
    assert.deepEqual(state.orders, [])
    assert.deepEqual(state.providerReads, [])
    assert.deepEqual(state.updates, [])
    assert.deepEqual(state.defaults, [])
  }
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
  assert.ok(state.clients.filter(client => client.key === 'synthetic-anon-key').every(client => client.options.global.headers.Authorization === 'Bearer valid-development-token'))
  assert.equal(state.clients.filter(client => client.key === 'synthetic-service-key').length, 15)
  assert.equal(state.ledgerCalls.length, 30)
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

test('authorized but uncaptured subscription payment remains pending without activation or delivery defaults', async t => {
  const { load, state } = fixture(t)
  state.payment.status = 'authorized'
  state.payment.captured = false
  const response = await load('app/api/verify-subscription/route.js').POST(request(paidPayload()))
  assert.equal(response.status, 202)
  const body = await response.json()
  assert.equal(body.success, false)
  assert.equal(body.pending, true)
  assert.equal(body.code, 'PAYMENT_NOT_CAPTURED')
  assert.equal(state.providerReads.length, 2)
  assert.deepEqual(state.updates, [])
  assert.deepEqual(state.defaults, [])
})

test('contradictory captured=false provider response cannot activate a subscription', async t => {
  const { load, state } = fixture(t)
  state.payment.captured = false
  const response = await load('app/api/verify-subscription/route.js').POST(request(paidPayload()))
  assert.equal(response.status, 400)
  assert.equal((await response.json()).success, false)
  assert.deepEqual(state.updates, [])
  assert.deepEqual(state.defaults, [])
})

test('verified captured payment activates through the ledger and retains non-overwriting delivery defaults', async t => {
  const { load, state } = fixture(t)
  state.order.notes.plan_code = 'restaurant_delivery'
  state.order.amount = 299900
  state.payment.amount = 299900
  Object.assign(state.intents.get(checkoutId), { plan_code: 'restaurant_delivery', amount_paise: 299900 })
  const response = await load('app/api/verify-subscription/route.js').POST(request(paidPayload({ planCode: 'restaurant_delivery' })))
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.restaurant.subscription_status, 'active')
  assert.equal(data.replayed, false)
  assert.equal(data.receipt.checkout_id, checkoutId)
  assert.deepEqual(state.updates, [])
  assert.equal(state.activationWrites.length, 1)
  const call = state.ledgerCalls[0]
  assert.equal(call.name, 'subscription_activate_payment')
  assert.equal(call.args.p_restaurant_id, restaurantId)
  assert.equal(call.args.p_owner_id, ownerId)
  assert.equal(call.args.p_plan_code, 'restaurant_delivery')
  assert.equal(call.args.p_amount_paise, 299900)
  assert.equal(call.args.p_provider_key_id, 'rzp_test_synthetic')
  assert.equal(state.defaults.length, 1)
  assert.equal(state.defaults[0].table, 'delivery_settings')
  assert.equal(state.defaults[0].payload.restaurant_id, restaurantId)
  assert.deepEqual(state.defaults[0].options, { onConflict: 'restaurant_id', ignoreDuplicates: true })
})

test('checkout opens a server-owned intent before provider creation and binds before exposing the order', async t => {
  const { load, state } = fixture(t)
  const response = await load('app/api/create-order/route.js').POST(request({ restaurantId, plan: 'restaurant_pro', billingCycle: '1month', checkoutId: 'browser-forged-id' }))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.match(body.checkoutId, /^[0-9a-f-]{36}$/)
  assert.notEqual(body.checkoutId, 'browser-forged-id')
  assert.equal(state.orders[0].notes.checkout_id, body.checkoutId)
  assert.deepEqual(state.events, ['rpc:subscription_open_checkout', 'provider:constructed', 'provider:create', 'rpc:subscription_bind_checkout'])
  const opened = state.ledgerCalls[0].args
  assert.equal(opened.p_owner_id, ownerId)
  assert.equal(opened.p_amount_paise, 149900)
  assert.equal(opened.p_provider_key_id, 'rzp_test_synthetic')
  assert.deepEqual(state.ledgerCalls[1].args, { p_checkout_id: body.checkoutId, p_restaurant_id: restaurantId, p_owner_id: ownerId, p_provider_order_id: 'order_development' })
  assert.equal(state.activationWrites.length, 0)
})

test('missing migration or unreachable intent RPC fails before any provider order is created', async t => {
  for (const code of ['PGRST202', '42883', '42P01', '08006']) {
    const { load, state } = fixture(t)
    state.rpcErrors.subscription_open_checkout = { code, message: 'private SQL detail never shown' }
    const response = await load('app/api/create-order/route.js').POST(request({ restaurantId, plan: 'restaurant_pro', billingCycle: '1month' }))
    assert.equal(response.status, 503)
    const body = await response.json()
    assert.equal(body.success, false)
    assert.equal(body.code, 'SUBSCRIPTION_LEDGER_UNAVAILABLE')
    assert.match(body.message, /do not pay again/i)
    assert.equal(JSON.stringify(body).includes('private SQL detail'), false)
    assert.deepEqual(state.orders, [])
    assert.deepEqual(state.events, ['rpc:subscription_open_checkout'])
    assert.deepEqual(state.activationWrites, [])
  }
})

test('malformed opened intent cannot expose checkout or create a provider order', async t => {
  const { load, state } = fixture(t)
  state.rpcResults.subscription_open_checkout = { success: true, checkout: { id: 'wrong-owner-or-context' } }
  const response = await load('app/api/create-order/route.js').POST(request({ restaurantId, plan: 'restaurant_pro', billingCycle: '1month' }))
  assert.equal(response.status, 503)
  assert.deepEqual(state.orders, [])
  assert.deepEqual(state.events, ['rpc:subscription_open_checkout'])
})

test('provider order is withheld when binding is unavailable or returns a mismatched order', async t => {
  for (const malformed of [false, true]) {
    const { load, state } = fixture(t)
    if (malformed) state.rpcResults.subscription_bind_checkout = { success: true, checkout: {} }
    else state.rpcErrors.subscription_bind_checkout = { code: 'PGRST202' }
    const response = await load('app/api/create-order/route.js').POST(request({ restaurantId, plan: 'restaurant_pro', billingCycle: '1month' }))
    assert.equal(response.status, 503)
    const body = await response.json()
    assert.equal(body.order, undefined)
    assert.equal(body.orderId, undefined)
    assert.equal(body.success, false)
    assert.equal(state.orders.length, 1, 'A failed binding may leave an unpaid provider order, never a checkout exposed for payment')
    assert.deepEqual(state.activationWrites, [])
  }
})

test('unexpected provider-created amount, currency or missing ID is never bound or exposed', async t => {
  for (const providerCreateResult of [
    { id: 'order_development', amount: 1, currency: 'INR' },
    { id: 'order_development', amount: 149900, currency: 'USD' },
    { amount: 149900, currency: 'INR' },
  ]) {
    const { load, state } = fixture(t, { providerCreateResult })
    const response = await load('app/api/create-order/route.js').POST(request({ restaurantId, plan: 'restaurant_pro', billingCycle: '1month' }))
    assert.equal(response.status, 500)
    assert.equal((await response.json()).orderId, undefined)
    assert.equal(state.ledgerCalls.length, 1)
    assert.deepEqual(state.activationWrites, [])
  }
})

test('historical captured orders cannot be auto-registered using a browser-supplied checkout ID', async t => {
  for (const historical of [undefined, '', 'not-a-uuid']) {
    const { load, state } = fixture(t)
    state.order.notes.checkout_id = historical
    const response = await load('app/api/verify-subscription/route.js').POST(request(paidPayload({ checkoutId })))
    assert.equal(response.status, 409)
    const body = await response.json()
    assert.equal(body.code, 'SUBSCRIPTION_RECONCILIATION_REQUIRED')
    assert.match(body.message, /do not pay again/i)
    assert.deepEqual(state.ledgerCalls, [])
    assert.deepEqual(state.updates, [])
    assert.deepEqual(state.defaults, [])
  }
})

test('fetched provider order and payment IDs must exactly match the signed request', async t => {
  for (const field of ['order', 'payment']) {
    const { load, state } = fixture(t)
    state[field].id = 'provider-returned-another-reference'
    assert.equal((await load('app/api/verify-subscription/route.js').POST(request(paidPayload()))).status, 400)
    assert.deepEqual(state.ledgerCalls, [])
    assert.deepEqual(state.activationWrites, [])
  }
})

test('activation RPC failure, unknown historical intent and approval revocation never fall back to direct writes', async t => {
  for (const [code, expected] of [['PGRST202', 503], ['08006', 503], ['55000', 409], ['22023', 409], ['23505', 409], ['42501', 403]]) {
    const { load, state } = fixture(t)
    state.rpcErrors.subscription_activate_payment = { code, message: 'private database diagnostic' }
    const response = await load('app/api/verify-subscription/route.js').POST(request(paidPayload()))
    assert.equal(response.status, expected)
    const body = await response.json()
    assert.equal(body.success, false)
    assert.equal(JSON.stringify(body).includes('private database diagnostic'), false)
    assert.deepEqual(state.updates, [])
    assert.deepEqual(state.defaults, [])
    assert.deepEqual(state.activationWrites, [])
  }
})

test('identical captured callback returns its stored receipt without repeated activation or expiry change', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/verify-subscription/route.js')
  const first = await route.POST(request(paidPayload()))
  const firstBody = await first.json()
  assert.equal(first.status, 200)
  const replay = await route.POST(request(paidPayload()))
  const replayBody = await replay.json()
  assert.equal(replay.status, 200)
  assert.equal(firstBody.replayed, false)
  assert.equal(firstBody.message, 'Restaurant subscription activated successfully.')
  assert.equal(replayBody.replayed, true)
  assert.equal(replayBody.message, 'This payment was already verified. No subscription changes were made.')
  assert.deepEqual(replayBody.receipt, firstBody.receipt)
  assert.deepEqual(replayBody.restaurant, firstBody.restaurant)
  assert.equal(state.activationWrites.length, 1)
  assert.deepEqual(state.updates, [])
})

test('lost database response after commit is reported indeterminate and the same verified payment can recover', async t => {
  const { load, state } = fixture(t, { loseNextActivationResponse: true })
  const route = load('app/api/verify-subscription/route.js')
  const first = await route.POST(request(paidPayload()))
  assert.equal(first.status, 503)
  assert.equal((await first.json()).success, false)
  assert.equal(state.activationWrites.length, 1)
  const retry = await route.POST(request(paidPayload()))
  assert.equal(retry.status, 200)
  assert.equal((await retry.json()).replayed, true)
  assert.equal(state.activationWrites.length, 1)
  assert.deepEqual(state.updates, [])
})

test('old payment replay cannot rewrite a later subscription snapshot', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/verify-subscription/route.js')
  assert.equal((await route.POST(request(paidPayload()))).status, 200)
  state.restaurant.plan_code = 'restaurant_resort_delivery'
  state.restaurant.subscription_expires_at = '2028-01-01T00:00:00.000Z'
  const current = structuredClone(state.restaurant)
  const replay = await route.POST(request(paidPayload()))
  assert.equal(replay.status, 200)
  assert.equal((await replay.json()).replayed, true)
  assert.deepEqual(state.restaurant, current)
  assert.equal(state.activationWrites.length, 1)
})

test('malformed authoritative activation response cannot be inferred as success', async t => {
  const { load, state } = fixture(t)
  state.rpcResults.subscription_activate_payment = { success: true, replayed: false, restaurant: { id: restaurantId, plan_code: 'restaurant_pro', subscription_status: 'active' } }
  const response = await load('app/api/verify-subscription/route.js').POST(request(paidPayload()))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).success, false)
  assert.deepEqual(state.updates, [])
  assert.deepEqual(state.defaults, [])
})

test('all fifteen paid plan/cycle terms retain server validation and the atomic activation contract', async t => {
  for (const [planCode, prices] of Object.entries(currentPlans)) {
    for (const [index, billingCycle] of ['1month', '6months', '12months'].entries()) {
      const { load, state } = fixture(t)
      Object.assign(state.order.notes, { plan_code: planCode, billing_cycle: billingCycle })
      state.order.amount = prices[index] * 100
      state.payment.amount = state.order.amount
      Object.assign(state.intents.get(checkoutId), { plan_code: planCode, billing_cycle: billingCycle, amount_paise: state.order.amount })
      const response = await load('app/api/verify-subscription/route.js').POST(request(paidPayload({ planCode, billingCycle, amount: 1 })))
      assert.equal(response.status, 200, planCode + ':' + billingCycle)
      assert.equal(state.activationWrites.length, 1)
      assert.equal(state.ledgerCalls[0].args.p_amount_paise, state.order.amount)
      assert.equal(state.ledgerCalls[0].args.p_owner_id, ownerId)
      assert.deepEqual(state.updates, [])
    }
  }
})

test('paid subscription rollout is disabled by default and accepts only the exact server flag true', async t => {
  for (const value of [undefined, '', 'false', 'TRUE', '1']) {
    const { load, state } = fixture(t)
    if (value === undefined) delete process.env.SUBSCRIPTION_PAID_CHECKOUT_ENABLED
    else process.env.SUBSCRIPTION_PAID_CHECKOUT_ENABLED = value
    for (const [route, body] of [
      ['app/api/create-order/route.js', { restaurantId, plan: 'restaurant_pro', billingCycle: '1month' }],
      ['app/api/verify-subscription/route.js', paidPayload()],
    ]) {
      const response = await load(route).POST(request(body))
      assert.equal(response.status, 503)
      const result = await response.json()
      assert.equal(result.success, false)
      assert.equal(result.code, 'SUBSCRIPTION_PAYMENTS_DISABLED')
      assert.match(result.message, /do not pay again/i)
    }
    assert.deepEqual(state.events, [])
    assert.deepEqual(state.orders, [])
    assert.deepEqual(state.providerReads, [])
    assert.deepEqual(state.ledgerCalls, [])
    assert.deepEqual(state.activationWrites, [])
  }
})


test('existing approved-owner coupon activation remains available while paid checkout is disabled', async t => {
  const { load, state } = fixture(t)
  delete process.env.SUBSCRIPTION_PAID_CHECKOUT_ENABLED
  const response = await load('app/api/verify-subscription/route.js').POST(request({ restaurantId, mode: 'coupon', couponCode: 'synthetic-coupon-only' }))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.success, true)
  assert.equal(body.couponKey, 'restaurant_1m')
  assert.deepEqual(state.ledgerCalls, [{ name: 'activate_test_subscription_coupon', args: { p_restaurant_id: restaurantId, p_coupon_key: 'restaurant_1m', p_plan_code: 'restaurant_pro' } }])
  assert.deepEqual(state.orders, [])
  assert.deepEqual(state.providerReads, [])
  assert.deepEqual(state.activationWrites, [])
})

test('delivery default initialization failure cannot undo an authoritative captured activation receipt', async t => {
  const { load, state } = fixture(t)
  state.order.notes.plan_code = 'restaurant_delivery'
  state.order.amount = 299900
  state.payment.amount = 299900
  Object.assign(state.intents.get(checkoutId), { plan_code: 'restaurant_delivery', amount_paise: 299900 })
  state.defaultError = { code: 'PGRST_LOCAL_ONLY', message: 'private diagnostics are never returned' }
  const response = await load('app/api/verify-subscription/route.js').POST(request(paidPayload({ planCode: 'restaurant_delivery' })))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.success, true)
  assert.equal(body.receipt.checkout_id, checkoutId)
  assert.equal(state.activationWrites.length, 1)
  assert.deepEqual(state.updates, [])
  assert.equal(JSON.stringify(body).includes('private diagnostics'), false)
})

test('malformed restaurant identifiers are rejected before Auth, provider or ledger access', async t => {
  for (const id of ['not-a-uuid', '../other-tenant', '11111111-1111-1111-1111-111111111111']) {
    const { load, state } = fixture(t)
    for (const [route, body] of [
      ['app/api/create-order/route.js', { restaurantId: id, plan: 'restaurant_pro', billingCycle: '1month' }],
      ['app/api/verify-subscription/route.js', paidPayload({ restaurantId: id })],
    ]) assert.equal((await load(route).POST(request(body))).status, 400)
    assert.deepEqual(state.clients, [])
    assert.deepEqual(state.orders, [])
    assert.deepEqual(state.providerReads, [])
    assert.deepEqual(state.ledgerCalls, [])
  }
})

test('uppercase restaurant UUIDs open and bind checkout using the canonical database identity', async t => {
  const canonicalId = 'abcdefab-cdef-4abc-8def-abcdefabcdef'
  const { load, state } = fixture(t)
  state.restaurant.id = canonicalId
  const response = await load('app/api/create-order/route.js').POST(request({ restaurantId: canonicalId.toUpperCase(), plan: 'restaurant_pro', billingCycle: '1month' }))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.success, true)
  assert.deepEqual(state.queries[0].filters, [['id', canonicalId], ['owner_id', ownerId]])
  assert.equal(state.orders[0].notes.restaurant_id, canonicalId)
  assert.equal(state.ledgerCalls[0].args.p_restaurant_id, canonicalId)
  assert.equal(state.ledgerCalls[1].args.p_restaurant_id, canonicalId)
})

test('uppercase restaurant UUIDs verify captured payments against canonical provider notes and receipt IDs', async t => {
  const canonicalId = 'abcdefab-cdef-4abc-8def-abcdefabcdef'
  const { load, state } = fixture(t)
  state.restaurant.id = canonicalId
  state.order.notes.restaurant_id = canonicalId
  state.intents.get(checkoutId).restaurant_id = canonicalId
  const response = await load('app/api/verify-subscription/route.js').POST(request(paidPayload({ restaurantId: canonicalId.toUpperCase() })))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.success, true)
  assert.equal(body.restaurant.id, canonicalId)
  assert.equal(state.ledgerCalls[0].args.p_restaurant_id, canonicalId)
  assert.equal(state.activationWrites.length, 1)
  assert.deepEqual(state.updates, [])
})
