import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
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
const topupId = '33333333-3333-4333-8333-333333333333'
const secret = 'local-razorpay-secret-never-a-real-credential'
const orderId = 'order_local_only'
const paymentId = 'pay_local_only'
const signature = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
const subscription = { restaurantId, planCode: 'restaurant_pro', billingCycle: '1month' }
const confirmation = { ...subscription, razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }

// Execute the real handlers with a lexical, synthetic environment. No process
// credentials are read or changed; SDK, SQL and HTTP effects are local fixtures.
function fixture(overrides = {}) {
  const state = {
    calls: [], writes: [], providerCalls: [], clients: [], logs: [],
    user: { id: ownerId },
    access: { ok: true, restaurantId },
    environment: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon-only',
      SUPABASE_SERVICE_ROLE_KEY: 'local-service-only',
      PLATFORM_RAZORPAY_KEY_ID: 'rzp_test_local_only',
      PLATFORM_RAZORPAY_KEY_SECRET: secret,
      DIGITAL_DINE_WALLET_RAZORPAY_KEY_ID: 'rzp_test_local_wallet_only',
      DIGITAL_DINE_WALLET_RAZORPAY_KEY_SECRET: secret,
    },
    tables: {
      restaurants: [{ id: restaurantId, owner_id: ownerId, name: 'Local restaurant', phone: '9000000000' }],
      delivery_wallet_topups: [{ id: topupId, restaurant_id: restaurantId, amount_paise: 200000, razorpay_order_id: orderId, status: 'created' }],
      delivery_store_wallets: [{ restaurant_id: restaurantId, min_topup_paise: 200000 }],
    },
    providerOrder: { id: orderId, amount: 149900, currency: 'INR', notes: { restaurant_id: restaurantId, owner_id: ownerId, plan_code: 'restaurant_pro', billing_cycle: '1month' } },
    providerPayment: { id: paymentId, order_id: orderId, amount: 149900, currency: 'INR', status: 'captured', captured: true },
    ...overrides,
  }
  const client = {
    auth: {
      async getUser(token) {
        state.calls.push({ auth: token })
        return { data: { user: token === 'local-valid-token' ? state.user : null }, error: null }
      },
    },
    from(table) {
      const entry = { table, filters: [] }
      state.calls.push(entry)
      const query = {
        select() { return query },
        eq(key, value) { entry.filters.push([key, value]); return query },
        update(payload) { entry.update = payload; state.writes.push({ table, payload }); return query },
        upsert(payload) { state.writes.push({ table, payload }); return Promise.resolve({ error: null }) },
        async maybeSingle() {
          return { data: (state.tables[table] || []).find(row => entry.filters.every(([key, value]) => row[key] === value)) || null, error: null }
        },
        async single() {
          const row = (state.tables[table] || []).find(value => entry.filters.every(([key, expected]) => value[key] === expected))
          return { data: row ? { ...row, ...entry.update } : null, error: null }
        },
      }
      return query
    },
    async rpc(name, args) {
      state.writes.push({ rpc: name, args })
      assert.equal(name, 'delivery_wallet_credit_verified_topup')
      return { data: { topup_status: 'paid', credited: true, wallet_balance_paise: 200000 }, error: null }
    },
  }
  class LocalRazorpay {
    constructor(options) {
      state.providerCalls.push({ constructor: options })
      this.orders = {
        create: async payload => { state.providerCalls.push({ create: payload }); return { id: orderId, ...payload } },
        fetch: async id => { state.providerCalls.push({ order: id }); return state.providerOrder },
      }
      this.payments = { fetch: async id => { state.providerCalls.push({ payment: id }); return state.providerPayment } }
    }
  }
  function load(relative) {
    const filename = path.resolve(root, relative)
    const loaded = new Module(filename)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    const nativeRequire = createRequire(filename)
    loaded.require = specifier => {
      if (specifier === '__fixture_environment__') return { env: state.environment }
      if (specifier === '__fixture_console__') return { error: (...args) => state.logs.push(args) }
      if (specifier === '__fixture_fetch__') return async url => {
        state.providerCalls.push({ fetch: String(url) })
        assert.equal(String(url), `https://api.razorpay.com/v1/payments/${paymentId}`)
        return new Response(JSON.stringify(state.providerPayment), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (specifier === 'razorpay') return LocalRazorpay
      if (specifier === '@supabase/supabase-js') return { createClient: (url, key, options) => { state.clients.push({ url, key, options }); return client } }
      if (specifier === '@/lib/server/ownerApproval') return { requireApprovedOwner: async () => state.access }
      if (specifier === '@/lib/server/adminSupabase') return { getAdminSupabase: () => { state.calls.push({ admin: true }); return client } }
      return nativeRequire(specifier)
    }
    loaded._compile("const process = require('__fixture_environment__'); const console = require('__fixture_console__'); const fetch = require('__fixture_fetch__');\n" + ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, filename)
    return loaded.exports
  }
  return { state, load }
}

function request(body = subscription, token = 'local-valid-token') {
  return new NextRequest('https://dining.example.test/api/local-test', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  })
}

test('subscription order rejects missing/expired authentication without provider or data writes', async () => {
  for (const token of [null, 'expired-local-token']) {
    const { load, state } = fixture()
    const response = await load('app/api/create-order/route.js').POST(request(subscription, token))
    assert.equal(response.status, 401)
    assert.deepEqual(state.providerCalls, [])
    assert.deepEqual(state.writes, [])
    assert.equal(state.calls.filter(call => call.table).length, 0)
  }
})

test('subscription order queries both restaurant and verified owner before creating a payment', async () => {
  const { load, state } = fixture({ user: { id: 'other-owner' } })
  const response = await load('app/api/create-order/route.js').POST(request())
  assert.equal(response.status, 403)
  assert.deepEqual(state.calls.find(call => call.table)?.filters, [['id', restaurantId], ['owner_id', 'other-owner']])
  assert.deepEqual(state.providerCalls, [])
  assert.deepEqual(state.writes, [])
})

test('subscription order ignores browser prices and derives Razorpay amount and ownership notes on server', async () => {
  const { load, state } = fixture()
  const response = await load('app/api/create-order/route.js').POST(request({ ...subscription, amount: 1, amountInPaise: 1, owner_id: 'other-owner', planName: 'Starter' }))
  assert.equal(response.status, 200)
  const created = state.providerCalls.find(call => call.create).create
  assert.equal(created.amount, 149900)
  assert.equal(created.currency, 'INR')
  assert.equal(created.notes.owner_id, ownerId)
  assert.equal(created.notes.restaurant_id, restaurantId)
  assert.equal(created.notes.plan_code, 'restaurant_pro')
  assert.equal(state.clients[0].key, 'local-anon-only')
  assert.equal(state.clients[0].options.global.headers.Authorization, 'Bearer local-valid-token')
  assert.deepEqual(state.writes, [])
  assert.equal(JSON.stringify(await response.json()).includes(secret), false)
})

test('subscription order rejects obsolete plans and cycles instead of charging a browser amount', async () => {
  for (const payload of [{ ...subscription, planCode: 'Starter' }, { ...subscription, billingCycle: 'free', amount: 1 }]) {
    const { load, state } = fixture()
    assert.equal((await load('app/api/create-order/route.js').POST(request(payload))).status, 400)
    assert.deepEqual(state.clients, [])
    assert.deepEqual(state.providerCalls, [])
  }
})

test('subscription order missing gateway configuration fails closed without SDK or database access', async () => {
  const { load, state } = fixture()
  delete state.environment.PLATFORM_RAZORPAY_KEY_SECRET
  assert.equal((await load('app/api/create-order/route.js').POST(request())).status, 500)
  assert.deepEqual(state.clients, [])
  assert.deepEqual(state.providerCalls, [])
  assert.deepEqual(state.writes, [])
})

test('subscription confirmation rejects missing or expired authentication before private lookup', async () => {
  for (const token of [null, 'expired-local-token']) {
    const { load, state } = fixture()
    assert.equal((await load('app/api/verify-subscription/route.js').POST(request(confirmation, token))).status, 401)
    assert.equal(state.calls.filter(call => call.table).length, 0)
    assert.deepEqual(state.providerCalls, [])
    assert.deepEqual(state.writes, [])
  }
})

test('subscription confirmation denies another restaurant owner before verification or activation', async () => {
  const { load, state } = fixture({ user: { id: 'other-owner' } })
  assert.equal((await load('app/api/verify-subscription/route.js').POST(request(confirmation))).status, 403)
  assert.deepEqual(state.providerCalls, [])
  assert.deepEqual(state.writes, [])
})

test('subscription confirmation rejects forged signatures before fetching payment or changing plan', async () => {
  const { load, state } = fixture()
  const response = await load('app/api/verify-subscription/route.js').POST(request({ ...confirmation, razorpay_signature: '0'.repeat(64) }))
  assert.equal(response.status, 400)
  assert.match((await response.json()).message, /signature/i)
  assert.deepEqual(state.providerCalls, [])
  assert.deepEqual(state.writes, [])
})

test('subscription confirmation rejects signed payment metadata for another tenant', async () => {
  const { load, state } = fixture()
  state.providerOrder.notes.restaurant_id = 'other-restaurant'
  const response = await load('app/api/verify-subscription/route.js').POST(request(confirmation))
  assert.equal(response.status, 400)
  assert.match((await response.json()).message, /does not match/i)
  assert.deepEqual(state.writes, [])
})

test('subscription confirmation refuses underpaid, foreign-currency and failed provider payments', async () => {
  for (const overrides of [{ amount: 1 }, { currency: 'USD' }, { order_id: 'other-order' }, { status: 'failed' }]) {
    const { load, state } = fixture()
    Object.assign(state.providerPayment, overrides)
    const response = await load('app/api/verify-subscription/route.js').POST(request(confirmation))
    assert.equal(response.status, 400)
    assert.deepEqual(state.writes, [])
  }
})

test('verified synthetic subscription activates only the owned restaurant after provider checks', async () => {
  const { load, state } = fixture()
  const response = await load('app/api/verify-subscription/route.js').POST(request(confirmation))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).restaurant.plan_code, 'restaurant_pro')
  assert.equal(state.writes.length, 1)
  assert.equal(state.writes[0].table, 'restaurants')
  assert.equal(state.writes[0].payload.subscription_status, 'active')
  assert.equal(state.writes[0].payload.delivery_enabled, false)
  assert.ok(state.calls.find(call => call.update)?.filters.some(([key, value]) => key === 'id' && value === restaurantId))
  assert.equal(state.providerCalls.filter(call => call.order || call.payment).length, 2)
})

test('wallet creation and verification preserve owner-approval denial without private or provider access', async () => {
  for (const route of ['create-order', 'verify-payment']) {
    const { load, state } = fixture({ access: { ok: false, status: 403, code: 'OWNER_APPROVAL_REQUIRED', message: 'Approval required.' } })
    const response = await load(`app/api/owner/wallet/${route}/route.js`).POST(request({ restaurantId, amountRupees: 2000 }))
    assert.equal(response.status, 403)
    assert.equal((await response.json()).code, 'OWNER_APPROVAL_REQUIRED')
    assert.deepEqual(state.calls, [])
    assert.deepEqual(state.providerCalls, [])
    assert.deepEqual(state.writes, [])
  }
})

test('wallet creation rejects unsafe recharge amounts before database or provider requests', async () => {
  for (const amountRupees of [1999, 2000.5, 500001, 'invalid']) {
    const { load, state } = fixture()
    assert.equal((await load('app/api/owner/wallet/create-order/route.js').POST(request({ restaurantId, amountRupees }))).status, 400)
    assert.deepEqual(state.calls, [])
    assert.deepEqual(state.providerCalls, [])
  }
})

test('wallet verification rejects forged signatures before touching wallet rows or credits', async () => {
  const { load, state } = fixture()
  assert.equal((await load('app/api/owner/wallet/verify-payment/route.js').POST(request({ restaurantId, topupId, ...confirmation, razorpay_signature: '0'.repeat(64) }))).status, 400)
  assert.deepEqual(state.calls, [])
  assert.deepEqual(state.providerCalls, [])
  assert.deepEqual(state.writes, [])
})

test('wallet confirmation scopes the signed topup lookup to the approved restaurant', async () => {
  const { load, state } = fixture()
  state.tables.delivery_wallet_topups[0].restaurant_id = 'other-restaurant'
  const response = await load('app/api/owner/wallet/verify-payment/route.js').POST(request({ restaurantId, topupId, ...confirmation }))
  assert.equal(response.status, 403)
  assert.deepEqual(state.calls.find(call => call.table)?.filters, [['id', topupId], ['restaurant_id', restaurantId]])
  assert.deepEqual(state.providerCalls, [])
  assert.deepEqual(state.writes, [])
})

test('wallet confirmation cannot credit an underpayment or an uncaptured authorization', async () => {
  for (const payment of [{ amount: 1 }, { amount: 200000, status: 'authorized', captured: false }]) {
    const { load, state } = fixture()
    Object.assign(state.providerPayment, payment)
    const response = await load('app/api/owner/wallet/verify-payment/route.js').POST(request({ restaurantId, topupId, ...confirmation }))
    assert.equal(response.status, payment.amount === 1 ? 400 : 409)
    assert.deepEqual(state.writes, [])
  }
})

test('captured synthetic wallet payment delegates exactly one atomic credit RPC with verified amount', async () => {
  const { load, state } = fixture()
  state.providerPayment.amount = 200000
  const response = await load('app/api/owner/wallet/verify-payment/route.js').POST(request({ restaurantId, topupId, ...confirmation, amount_paise: 9999999 }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).creditedNow, true)
  assert.deepEqual(state.writes, [{ rpc: 'delivery_wallet_credit_verified_topup', args: { p_topup_id: topupId, p_razorpay_order_id: orderId, p_razorpay_payment_id: paymentId, p_paid_amount_paise: 200000 } }])
})
