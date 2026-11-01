import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
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
const deliveryOrderId = '22222222-2222-4222-8222-222222222222'
const orderId = 'order_local_capture'
const paymentId = 'pay_local_capture'
const secret = 'synthetic-delivery-capture-secret-only'
const signature = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')

// Execute the real handler with lexical credentials and effect dependencies.
// No process credentials, provider SDK, network, push or database is used.
function fixture() {
  const state = {
    queries: [], mutations: [], rpcs: [], providerReads: [], pushes: [], logs: [],
    providerOrder: { id: orderId, amount: 12550, currency: 'INR' },
    payment: { id: paymentId, order_id: orderId, amount: 12550, currency: 'INR', status: 'captured', captured: true },
    booking: {
      id: deliveryOrderId, restaurant_id: restaurantId, order_code: 'LOCAL-ORDER',
      customer_name: 'Synthetic customer', total_amount: 125.50,
      payment_method: 'razorpay', payment_status: 'pending', payment_provider: 'razorpay',
      provider_order_id: orderId, provider_payment_id: null,
      order_status: 'received', inventory_status: 'reserved',
    },
  }
  const gateway = {
    restaurant_id: restaurantId, module: 'delivery', provider: 'razorpay',
    key_id: 'rzp_test_synthetic_delivery', secret_ciphertext: 'local-ciphertext',
    secret_iv: 'local-iv', secret_tag: 'local-tag', is_enabled: true,
  }
  const client = {
    from(table) {
      assert.ok(['delivery_orders', 'payment_gateway_configs'].includes(table), `Unexpected table: ${table}`)
      const entry = { table, filters: [] }
      state.queries.push(entry)
      const query = {
        select() { return query },
        eq(key, value) { entry.filters.push([key, value]); return query },
        update(payload) { entry.payload = payload; state.mutations.push(entry); return query },
        async maybeSingle() {
          const row = table === 'delivery_orders' ? state.booking : gateway
          return { data: entry.filters.every(([key, value]) => row[key] === value) ? structuredClone(row) : null, error: null }
        },
        async single() {
          assert.ok(entry.payload)
          assert.deepEqual(entry.filters, [['id', deliveryOrderId]])
          return { data: { ...state.booking, ...entry.payload }, error: null }
        },
      }
      return query
    },
    async rpc(name, args) {
      assert.ok(['delivery_consume_order_inventory', 'try_delivery_auto_assignment'].includes(name), `Unexpected RPC: ${name}`)
      state.rpcs.push({ name, args })
      return { data: { success: true, inventoryStatus: 'consumed' }, error: null }
    },
  }
  class LocalRazorpay {
    constructor(config) {
      assert.deepEqual(config, { key_id: gateway.key_id, key_secret: secret })
      this.orders = { async fetch(id) { state.providerReads.push({ order: id }); return state.providerOrder } }
      this.payments = { async fetch(id) { state.providerReads.push({ payment: id }); return state.payment } }
    }
  }
  const dependencies = {
    'next/server': require('next/server'), crypto, razorpay: LocalRazorpay,
    '@supabase/supabase-js': { createClient(url, key) {
      assert.equal(url, 'http://127.0.0.1:54321')
      assert.equal(key, 'local-service-only')
      return client
    } },
    '@/lib/server/paymentGatewayCrypto': { decryptGatewaySecret() { return secret } },
    '@/lib/server/sendDeliveryOrderPush': { async sendDeliveryOrderPush(payload) { state.pushes.push(payload) } },
    '__local_environment__': { env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'local-service-only' } },
    '__local_console__': { error: (...args) => state.logs.push(args) },
  }
  const filename = path.resolve(root, 'app/api/delivery/razorpay/verify-payment/route.js')
  const loaded = new Module(filename)
  loaded.filename = filename
  loaded.require = specifier => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected dependency: ${specifier}`)
    return dependencies[specifier]
  }
  loaded._compile("const process = require('__local_environment__'); const console = require('__local_console__'); const fetch = () => { throw new Error('Network is forbidden in this fixture') };\n" + ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename)
  return { state, route: loaded.exports }
}

function request(overrides = {}) {
  return new NextRequest('https://dining.example.test/api/delivery/razorpay/verify-payment', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deliveryOrderId, razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature, ...overrides }),
  })
}

function assertNoOrderEffects(state) {
  assert.deepEqual(state.rpcs, [])
  assert.deepEqual(state.mutations, [])
  assert.deepEqual(state.pushes, [])
}

test('authorized delivery payment remains pending without inventory, paid status, assignment or notification', async () => {
  const { state, route } = fixture()
  state.payment.status = 'authorized'
  state.payment.captured = false
  const response = await route.POST(request())
  assert.equal(response.status, 202)
  const body = await response.json()
  assert.equal(body.success, false)
  assert.equal(body.pending, true)
  assert.equal(body.code, 'PAYMENT_NOT_CAPTURED')
  assert.equal(state.providerReads.length, 2)
  assertNoOrderEffects(state)
})

test('failed, created and contradictory uncaptured delivery payments cannot be marked paid', async () => {
  for (const payment of [{ status: 'failed', captured: false }, { status: 'created', captured: false }, { status: 'captured', captured: false }]) {
    const { state, route } = fixture()
    Object.assign(state.payment, payment)
    const response = await route.POST(request())
    assert.equal(response.status, 400)
    assert.equal((await response.json()).success, false)
    assertNoOrderEffects(state)
  }
})

test('captured delivery verification retains provider binding and rejects tampered signatures and amounts', async () => {
  const forged = fixture()
  assert.equal((await forged.route.POST(request({ razorpay_signature: '0'.repeat(64) }))).status, 400)
  assert.deepEqual(forged.state.providerReads, [])
  assertNoOrderEffects(forged.state)
  for (const variation of [{ order_id: 'order_other_store' }, { amount: 1 }, { currency: 'USD' }]) {
    const { state, route } = fixture()
    Object.assign(state.payment, variation)
    assert.equal((await route.POST(request())).status, 400)
    assertNoOrderEffects(state)
  }
})

test('matching captured delivery payment retains inventory finalization, confirmation and notification', async () => {
  const { state, route } = fixture()
  const response = await route.POST(request())
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.success, true)
  assert.equal(body.paymentStatus, 'paid')
  assert.equal(body.orderStatus, 'confirmed')
  assert.deepEqual(state.rpcs, [
    { name: 'delivery_consume_order_inventory', args: { p_order_id: deliveryOrderId } },
    { name: 'try_delivery_auto_assignment', args: { p_restaurant_id: restaurantId } },
  ])
  assert.equal(state.mutations.length, 1)
  assert.equal(state.mutations[0].payload.payment_status, 'paid')
  assert.equal(state.mutations[0].payload.provider_payment_id, paymentId)
  assert.equal(state.pushes.length, 1)
  assert.equal(state.pushes[0].orderId, deliveryOrderId)
})
