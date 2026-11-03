import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const root = fileURLToPath(new URL('../', import.meta.url))
const website = '72000000-0000-4000-8000-000000000001'
const buyer = '71000000-0000-4000-8000-000000000002'
const foreign = '71000000-0000-4000-8000-000000000003'
const version = '75000000-0000-4000-8000-000000000001'
const intentId = '78000000-0000-4000-8000-000000000001'
const receiptId = '79000000-0000-4000-8000-000000000001'
const orderId = '7a000000-0000-4000-8000-000000000001'
const credentials = { key_id: 'rzp_test_fixture001', key_secret: 'commerce-only-test-secret-00000001', webhook_secret: 'commerce-only-webhook-secret-0001' }
const checkout = { website_id: website, idempotency_key: '76000000-0000-4000-8000-000000000001', items: [{ product_id: '74000000-0000-4000-8000-000000000001', quantity: 2 }], customer: { name: 'Fixture Buyer', phone: '9000000000' }, fulfillment_method: 'pickup', payment_method: 'razorpay' }
function req(route, { method = 'POST', payload, token = 'valid-token', origin = 'https://commerce.example.test', admin = false, body, headers: extra } = {}) {
  const headers = { 'content-type': 'application/json', ...extra }
  if (token) headers.authorization = `Bearer ${token}`
  if (origin) { headers.origin = origin; headers['sec-fetch-site'] = origin === 'https://commerce.example.test' ? 'same-origin' : 'cross-site' }
  if (admin) headers['x-test-admin'] = 'true'
  return new NextRequest(`https://commerce.example.test/api/commerce/payments/${route}`, { method, headers, ...(method !== 'GET' ? { body: body ?? JSON.stringify(payload ?? {}) } : {}) })
}
function fixture(t, env = {}) {
  const settings = { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon', COMMERCE_ONLINE_PAYMENTS_ENABLED: 'true', COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE: 'false', COMMERCE_PAYMENT_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('base64'), ...env }
  for (const [key, value] of Object.entries(settings)) {
    const old = process.env[key]
    if (value === undefined) delete process.env[key]; else process.env[key] = value
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old })
  }
  const state = { calls: [], providerCalls: [], adminClients: 0, user: { id: buyer, email: 'buyer@example.test', email_confirmed_at: '2026-11-03' }, intent: { id: intentId, website_id: website, buyer_id: buyer, credential_version: version, amount_paise: 502, currency: 'INR', state: 'new', provider_order_id: null, mode: 'test', merchant_enabled: true }, receipt: null, lease: '7b000000-0000-4000-8000-000000000001', webhookClaimed: true, captureHeld: false }
  function view() { return { id: intentId, website_id: website, state: state.intent.state, amount_paise: 502, currency: 'INR', provider_order_id: state.intent.provider_order_id, receipt: state.receipt, order: state.receipt?.state === 'fulfilled' ? { id: orderId, payment_status: 'paid', payment_method: 'razorpay' } : null, items: [] } }
  const userClient = { auth: { async getUser(token) { return { data: { user: token === 'valid-token' ? state.user : null }, error: null } } }, async rpc(name, args) {
    state.calls.push({ client: 'user', name, args })
    if (name === 'commerce_payment_start') return { data: view(), error: null }
    if (name === 'commerce_payment_quote') return { data: state.quote || { subtotal_paise: 502, delivery_fee_paise: 0, discount_paise: 0, total_paise: 502 }, error: null }
    if (name === 'commerce_payment_status') return state.user.id === buyer ? { data: view(), error: null } : { data: null, error: { code: '42501' } }
    throw new Error(`Unexpected user RPC ${name}`)
  } }
  const serviceClient = { async rpc(name, args) {
    state.calls.push({ client: 'service', name, args })
    if (name === 'commerce_payment_admin') return { data: { configured: true, merchant_enabled: args.p_payload.enabled ?? false, credential_version: args.p_payload.version_id || version, mode: 'test' }, error: null }
    assert.equal(name, 'commerce_payment_service')
    const payload = args.p_payload
    let result
    switch (args.p_action) {
      case 'context': result = { ...state.intent }; break
      case 'credentials': result = { website_id: website, credential_version: version, ciphertext: state.intent.ciphertext }; break
      case 'claim_create': result = { claimed: state.intent.state === 'new', lease_token: state.lease }; if (result.claimed) state.intent.state = 'creating'; break
      case 'create_unknown': state.intent.state = 'provider_unknown'; result = view(); break
      case 'attach_create': case 'attach_reconciled': state.intent.provider_order_id = payload.provider_order_id; state.intent.state = 'ready'; result = view(); break
      case 'capture': state.intent.state = state.captureHeld ? 'captured_unfulfilled' : 'fulfilled'; state.receipt = { id: receiptId, state: state.intent.state, amount_paise: 502, currency: 'INR', provider_payment_id: payload.provider_payment_id, order_id: state.captureHeld ? null : orderId }; result = view(); break
      case 'webhook_claim': result = { id: '7c000000-0000-4000-8000-000000000001', claimed: state.webhookClaimed, lease_token: state.lease, intent_id: intentId }; break
      case 'webhook_ack': result = { acknowledged: true }; break
      default: throw new Error(`Unexpected service operation ${args.p_action}`)
    }
    return { data: result, error: null }
  } }
  const cache = new Map()
  function load(relative) {
    let filename = path.resolve(root, relative)
    if (!path.extname(filename)) filename += '.js'
    if (cache.has(filename)) return cache.get(filename).exports
    const loaded = new Module(filename); cache.set(filename, loaded); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    const native = createRequire(filename)
    loaded.require = specifier => {
      if (specifier === '@supabase/supabase-js') return { createClient: () => userClient }
      if (specifier === '@/lib/server/adminSession') return { requireAdmin: request => request.headers.get('x-test-admin') === 'true' ? { email: 'admin@example.test' } : null }
      if (specifier === '@/lib/server/adminSupabase') return { getAdminSupabase: () => { state.adminClients++; return serviceClient } }
      if (specifier.startsWith('@/')) return load(specifier.slice(2))
      if (specifier.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
      return native(specifier)
    }
    loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
    return loaded.exports
  }
  state.intent.ciphertext = load('lib/server/commerce/payment-credentials.js').sealPaymentCredentials(website, version, credentials).ciphertext
  const providerOrder = () => ({ id: 'order_fixture001', amount: 502, currency: 'INR', receipt: `cp_${intentId.replaceAll('-', '')}`, notes: { commerce_intent_id: intentId, website_id: website } })
  const providerPayment = () => ({ id: 'pay_fixture001', order_id: 'order_fixture001', amount: 502, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0 })
  const fetcher = async (url, options) => {
    assert.match(url, /^https:\/\/api\.razorpay\.com\/v1\//)
    state.providerCalls.push({ url, options })
    if (state.providerFailure) throw new Error('Synthetic timeout; no network was used')
    let data = url.endsWith('/payments') ? { items: [providerPayment()] } : url.includes('/payments/pay_') ? { ...providerPayment(), ...state.paymentOverride } : { ...providerOrder(), ...state.orderOverride }
    return { ok: true, async json() { return data } }
  }
  return { state, load, userClient, serviceClient, fetcher, providerOrder, providerPayment, view }
}
function ready(state) { state.intent.state = 'ready'; state.intent.provider_order_id = 'order_fixture001' }
const signature = () => createHmac('sha256', credentials.key_secret).update('order_fixture001|pay_fixture001').digest('hex')
const verification = () => ({ intent_id: intentId, razorpay_order_id: 'order_fixture001', razorpay_payment_id: 'pay_fixture001', razorpay_signature: signature() })

test('commerce online payments default disabled before RPC/provider access', async t => {
  const { load, state } = fixture(t, { COMMERCE_ONLINE_PAYMENTS_ENABLED: undefined })
  const response = await load('app/api/commerce/payments/create/route.js').POST(req('create', { payload: checkout }))
  assert.equal(response.status, 503); assert.equal(state.calls.length, 0); assert.equal(state.adminClients, 0)
})
test('online-only quotes require verified same-origin Auth and rollout, use no provider or service credentials', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/commerce/payments/quote/route.js')
  const { website_id, idempotency_key: ignoredKey, ...details } = checkout
  void ignoredKey
  const payload = { website_id, checkout: details }
  assert.equal((await route.POST(req('quote', { payload, token: null }))).status, 401)
  assert.equal((await route.POST(req('quote', { payload, origin: 'https://foreign.example' }))).status, 403)
  assert.equal((await route.POST(req('quote', { payload: { ...payload, checkout: { ...details, total_paise: 1 } } }))).status, 400)
  const response = await route.POST(req('quote', { payload }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).quote.total_paise, 502)
  assert.deepEqual(state.calls[0].args, { p_website_id: website, p_items: checkout.items, p_customer: checkout.customer, p_fulfillment: 'pickup', p_coupon_code: '' })
  assert.equal(state.adminClients, 0)
  assert.equal(state.providerCalls.length, 0)
  state.quote = { subtotal_paise: 502, delivery_fee_paise: 0, discount_paise: 0, total_paise: 1 }
  assert.equal((await route.POST(req('quote', { payload }))).status, 503)
  process.env.COMMERCE_ONLINE_PAYMENTS_ENABLED = 'false'
  state.calls.length = 0
  assert.equal((await route.POST(req('quote', { payload }))).status, 503)
  assert.equal(state.calls.length, 0)
})
test('payment APIs require verified Auth and same-origin before mutation/service access', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/commerce/payments/create/route.js')
  for (const opts of [{ token: null }, { token: 'expired' }]) assert.equal((await route.POST(req('create', { ...opts, payload: checkout }))).status, 401)
  for (const origin of [null, 'https://foreign.example.test']) assert.equal((await route.POST(req('create', { origin, payload: checkout }))).status, 403)
  state.user.email_confirmed_at = null
  assert.equal((await route.POST(req('create', { payload: checkout }))).status, 403)
  assert.equal(state.calls.length, 0); assert.equal(state.adminClients, 0)
})
test('payment input rejects caller totals, identities, item prices and unknown fields', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/commerce/payments/create/route.js')
  for (const extra of [{ amount_paise: 1 }, { buyer_id: foreign }, { credential_version: version }, { items: [{ ...checkout.items[0], price_paise: 1 }] }]) assert.equal((await route.POST(req('create', { payload: { ...checkout, ...extra } }))).status, 400)
  assert.equal(state.calls.length, 0)
})
test('merchant ciphertext uses separate key and tenant/version authenticated encryption', t => {
  const { load, state } = fixture(t)
  const crypto = load('lib/server/commerce/payment-credentials.js')
  assert.deepEqual(crypto.openPaymentCredentials(website, version, state.intent.ciphertext), credentials)
  assert.throws(() => crypto.openPaymentCredentials(foreign, version, state.intent.ciphertext), /could not be opened/)
  assert.throws(() => crypto.openPaymentCredentials(website, foreign, state.intent.ciphertext), /could not be opened/)
  assert.throws(() => crypto.sealPaymentCredentials(website, version, { ...credentials, key_id: 'rzp_live_fixture001' }), /not enabled/)
  delete process.env.COMMERCE_PAYMENT_ENCRYPTION_KEY
  assert.throws(() => crypto.sealPaymentCredentials(website, version, credentials), /encryption is not configured/)
})
test('provider order creation uses saved integer-paise quote and only exposes public checkout key', async t => {
  const { load, state, userClient, serviceClient, fetcher } = fixture(t)
  const payments = load('lib/server/commerce/payments.js')
  const result = await payments.createPayment(userClient, { id: buyer }, checkout, { serviceClient, fetcher })
  const sent = JSON.parse(state.providerCalls[0].options.body)
  assert.equal(sent.amount, 502); assert.equal(sent.currency, 'INR'); assert.equal(sent.notes.commerce_intent_id, intentId)
  assert.equal(result.checkout.key_id, credentials.key_id)
  assert.doesNotMatch(JSON.stringify(result), /key_secret|webhook_secret|ciphertext|commerce-only/)
  await payments.createPayment(userClient, { id: buyer }, checkout, { serviceClient, fetcher })
  assert.equal(state.providerCalls.filter(call => call.options.method === 'POST').length, 1)
})
test('unknown create result is durably reconciled and never automatically retried as a new provider order', async t => {
  const { load, state, userClient, serviceClient, fetcher } = fixture(t)
  state.providerFailure = true
  const payments = load('lib/server/commerce/payments.js')
  assert.equal((await payments.createPayment(userClient, { id: buyer }, checkout, { serviceClient, fetcher })).payment.state, 'provider_unknown')
  assert.equal((await payments.createPayment(userClient, { id: buyer }, checkout, { serviceClient, fetcher })).checkout, undefined)
  assert.equal(state.providerCalls.length, 1)
})
test('mismatched provider order amount/notes cannot be attached as ready', async t => {
  const { load, state, userClient, serviceClient, fetcher } = fixture(t)
  state.orderOverride = { amount: 1 }
  const result = await load('lib/server/commerce/payments.js').createPayment(userClient, { id: buyer }, checkout, { serviceClient, fetcher })
  assert.equal(result.payment.state, 'provider_unknown')
  assert.equal(state.calls.some(call => call.args.p_action === 'attach_create'), false)
})
test('invalid callback signature cannot invoke provider or capture', async t => {
  const { load, state, userClient, serviceClient, fetcher } = fixture(t); ready(state)
  await assert.rejects(load('lib/server/commerce/payments.js').verifyPayment(userClient, { id: buyer }, { ...verification(), razorpay_signature: '0'.repeat(64) }, { serviceClient, fetcher }), /signature is invalid/)
  assert.equal(state.providerCalls.length, 0); assert.equal(state.calls.some(call => call.args.p_action === 'capture'), false)
})
test('callback signature alone never accepts authorized, uncaptured, wrong-amount/currency or refunded provider payments', async t => {
  const f = fixture(t); ready(f.state)
  const payments = f.load('lib/server/commerce/payments.js')
  for (const override of [{ status: 'authorized', captured: false }, { captured: false }, { amount: 501 }, { currency: 'USD' }, { amount_refunded: 1 }, { order_id: 'order_foreign001' }]) {
    f.state.paymentOverride = override
    await assert.rejects(payments.verifyPayment(f.userClient, { id: buyer }, verification(), { serviceClient: f.serviceClient, fetcher: f.fetcher }), /capture is not confirmed/)
  }
  assert.equal(f.state.calls.some(call => call.args.p_action === 'capture'), false)
})
test('verified captured provider result binds original receipt and safe replay', async t => {
  const f = fixture(t); ready(f.state)
  const payments = f.load('lib/server/commerce/payments.js')
  const first = await payments.verifyPayment(f.userClient, { id: buyer }, verification(), { serviceClient: f.serviceClient, fetcher: f.fetcher })
  const replay = await payments.verifyPayment(f.userClient, { id: buyer }, verification(), { serviceClient: f.serviceClient, fetcher: f.fetcher })
  assert.equal(first.receipt.id, replay.receipt.id); assert.equal(first.order.id, replay.order.id)
  assert.equal(first.order.payment_method, 'razorpay'); assert.equal(first.order.payment_status, 'paid')
  assert.equal(f.state.calls.filter(call => call.args.p_action === 'capture')[0].args.p_payload.credential_version, version)
})
test('captured but unfulfilled receipt returns pending reconciliation and cannot open another charge', async t => {
  const f = fixture(t); ready(f.state); f.state.captureHeld = true
  const payments = f.load('lib/server/commerce/payments.js')
  const result = await payments.verifyPayment(f.userClient, { id: buyer }, verification(), { serviceClient: f.serviceClient, fetcher: f.fetcher })
  assert.equal(result.state, 'captured_unfulfilled'); assert.equal(result.order, null); assert.equal(result.receipt.order_id, null)
  const retried = await payments.createPayment(f.userClient, { id: buyer }, checkout, { serviceClient: f.serviceClient, fetcher: f.fetcher })
  assert.equal(retried.checkout, undefined); assert.equal(retried.payment.receipt.id, receiptId)
})
test('cross-buyer verification/status is denied before service credential access', async t => {
  const f = fixture(t); ready(f.state); f.state.user.id = foreign
  const response = await f.load('app/api/commerce/payments/verify/route.js').POST(req('verify', { payload: verification() }))
  assert.equal(response.status, 403); assert.equal(f.state.adminClients, 0)
})
test('admin merchant configuration requires signed Admin session and never returns saved secrets', async t => {
  const f = fixture(t)
  const route = f.load('app/api/commerce/payments/admin/route.js')
  const payload = { website_id: website, action: 'configure', credentials, enabled: false }
  assert.equal((await route.POST(req('admin', { payload }))).status, 401)
  assert.equal((await route.POST(req('admin', { payload: { ...payload, actor_email: 'forged@example.test' }, admin: true }))).status, 400)
  const response = await route.POST(req('admin', { payload, admin: true }))
  assert.equal(response.status, 200); assert.doesNotMatch(JSON.stringify(await response.json()), /key_secret|webhook_secret|ciphertext|commerce-only/)
  const configured = f.state.calls.find(call => call.name === 'commerce_payment_admin')
  assert.equal(configured.args.p_payload.actor_email, 'admin@example.test')
  assert.notEqual(configured.args.p_payload.ciphertext, JSON.stringify(credentials))
})
test('provider reconciliation reads original order and payment, never posts a replacement charge', async t => {
  const f = fixture(t); ready(f.state)
  const result = await f.load('lib/server/commerce/payments.js').reconcilePayment(intentId, { buyerId: buyer, serviceClient: f.serviceClient, fetcher: f.fetcher })
  assert.equal(result.payment.receipt.id, receiptId)
  assert.ok(f.state.providerCalls.every(call => call.options.method === 'GET'))
})
function webhook(f, { signature: override, eventId = 'evt_fixture001', amount = 502 } = {}) {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { ...f.providerPayment(), amount } } } })
  return req(`webhook?website_id=${website}&credential_version=${version}`, { body, token: null, origin: null, headers: { 'x-razorpay-signature': override || createHmac('sha256', credentials.webhook_secret).update(body).digest('hex'), 'x-razorpay-event-id': eventId } })
}
test('webhook authenticates exact raw bytes before dedup/capture and does not trust payload capture data', async t => {
  const f = fixture(t); ready(f.state)
  const payments = f.load('lib/server/commerce/payments.js')
  await assert.rejects(payments.processPaymentWebhook(webhook(f, { signature: '0'.repeat(64) }), { serviceClient: f.serviceClient, fetcher: f.fetcher }), /Invalid webhook signature/)
  assert.equal(f.state.calls.some(call => call.args.p_action === 'webhook_claim'), false)
  f.state.paymentOverride = { status: 'authorized', captured: false }
  await assert.rejects(payments.processPaymentWebhook(webhook(f), { serviceClient: f.serviceClient, fetcher: f.fetcher }), /capture is not confirmed/)
  assert.equal(f.state.calls.findLast(call => call.args.p_action === 'webhook_ack').args.p_payload.processed, false)
})
test('verified webhook shares capture path and duplicate event skips provider calls', async t => {
  const f = fixture(t); ready(f.state)
  const payments = f.load('lib/server/commerce/payments.js')
  assert.equal((await payments.processPaymentWebhook(webhook(f), { serviceClient: f.serviceClient, fetcher: f.fetcher })).accepted, true)
  assert.equal(f.state.receipt.id, receiptId)
  const before = f.state.providerCalls.length; f.state.webhookClaimed = false
  assert.equal((await payments.processPaymentWebhook(webhook(f), { serviceClient: f.serviceClient, fetcher: f.fetcher })).duplicate, true)
  assert.equal(f.state.providerCalls.length, before)
})
