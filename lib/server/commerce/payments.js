// Server-only commerce merchant adapter. Never uses restaurant, wallet or subscription keys.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import { CommerceError, dataResult } from './core'
import { uuid } from './validation'
import { openPaymentCredentials, paymentMode, requireAllowedPaymentMode, sealPaymentCredentials } from './payment-credentials'
import { paymentAttemptControl } from './payment-attempt-control'

const providerId = prefix => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{4,100}$`))
export const paymentCreateSchema = z.object({
  website_id: uuid, idempotency_key: uuid, payment_method: z.literal('razorpay').optional(),
  items: z.array(z.object({ product_id: uuid, variant_id: uuid.optional(), quantity: z.number().int().min(1).max(999) }).strict()).min(1).max(50),
  customer: z.object({ name: z.string().trim().min(2).max(180), phone: z.string().trim().min(7).max(30).regex(/^\+?[0-9][0-9 ()-]+$/), address: z.string().trim().max(1000).optional(), pincode: z.union([z.literal(''), z.string().regex(/^[0-9]{6}$/)]).optional(), saved_address_id: uuid.optional() }).strict(),
  fulfillment_method: z.enum(['pickup','delivery']), coupon_code: z.union([z.literal(''), z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/)]).optional(),
}).strict().refine(value => value.fulfillment_method !== 'delivery' || value.customer.saved_address_id || (value.customer.address || '').length >= 5, 'Enter a delivery address.')
export const paymentVerifySchema = z.object({ intent_id: uuid, razorpay_order_id: providerId('order'), razorpay_payment_id: providerId('pay'), razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i) }).strict()
export const paymentStatusSchema = z.object({ intent_id: uuid, resume: z.boolean().optional() }).strict()
const credentialsSchema = z.object({ key_id: z.string().min(15).max(100), key_secret: z.string().min(16).max(200), webhook_secret: z.string().min(16).max(200) }).strict()
export const paymentAdminSchema = z.discriminatedUnion('action', [
  z.object({ website_id: uuid, action: z.literal('configure'), enabled: z.boolean(), credentials: credentialsSchema }).strict(),
  z.object({ website_id: uuid, action: z.literal('disable') }).strict(),
  z.object({ website_id: uuid, action: z.literal('reconcile'), intent_id: uuid, provider_order_id: providerId('order').optional() }).strict(),
])

export function paymentRollout() {
  return { enabled: process.env.COMMERCE_ONLINE_PAYMENTS_ENABLED === 'true', live_allowed: process.env.COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE === 'true' }
}
function requireEnabled() {
  if (!paymentRollout().enabled) throw new CommerceError('Online store payments are currently disabled.', 503)
}
export function validPaymentSignature(message, signature, secret) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false
  const expected = createHmac('sha256', secret).update(message).digest()
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
}
async function service(action, payload, client = getAdminSupabase()) {
  return dataResult(client.rpc('commerce_payment_service', { p_action: action, p_payload: payload }))
}
function assertView(payment) {
  if (!uuid.safeParse(payment?.id).success || !uuid.safeParse(payment?.website_id).success || !Number.isSafeInteger(payment.amount_paise) || payment.amount_paise < 1 || payment.currency !== 'INR' || !['new','creating','provider_unknown','ready','captured_unfulfilled','fulfilled','cancelled_unstarted'].includes(payment.state)) throw new CommerceError('The payment state could not be confirmed. Keep the same checkout attempt.', 503)
  if (payment.state === 'cancelled_unstarted' && (payment.provider_order_id !== null || payment.receipt !== null || payment.order !== null || !Array.isArray(payment.items) || payment.items.length)) throw new CommerceError('The stopped checkout state could not be verified. Keep the same attempt.', 503)
  if (payment.state === 'fulfilled' && (!uuid.safeParse(payment.order?.id).success || !uuid.safeParse(payment.receipt?.id).success || payment.receipt.order_id !== payment.order.id || payment.receipt.state !== 'fulfilled')) throw new CommerceError('The payment receipt could not be confirmed. Keep the same checkout attempt.', 503)
  return payment
}
export async function paymentStatus(client, intentId) {
  return assertView(await dataResult(client.rpc('commerce_payment_status', { p_intent_id: intentId })))
}
async function context(intentId, buyerId, client) {
  const result = await service('context', { intent_id: intentId, ...(buyerId ? { buyer_id: buyerId } : {}) }, client)
  if (!result || result.id !== intentId || !uuid.safeParse(result.credential_version).success || (buyerId && result.buyer_id !== buyerId)) throw new CommerceError('The payment binding could not be confirmed.', 503)
  if (result.state === 'cancelled_unstarted') throw new CommerceError('This checkout was stopped before provider creation. Check its cancellation reference.', 409)
  const credentials = openPaymentCredentials(result.website_id, result.credential_version, result.ciphertext)
  if (paymentMode(credentials.key_id) !== result.mode) throw new CommerceError('Merchant credential mode mismatch.', 503)
  return { intent: result, credentials }
}

// A fixed origin and bounded request; tests inject a fetch stub, never a live key/network.
export async function razorpayRequest(credentials, path, { method = 'GET', body, fetcher = fetch } = {}) {
  requireAllowedPaymentMode(paymentMode(credentials.key_id))
  if (!/^\/(?:orders(?:\/order_[A-Za-z0-9]{4,100}(?:\/payments)?)?|payments\/pay_[A-Za-z0-9]{4,100})$/.test(path)) throw new CommerceError('Invalid commerce provider operation.', 400)
  const response = await fetcher(`https://api.razorpay.com/v1${path}`, { method, headers: { Authorization: `Basic ${Buffer.from(`${credentials.key_id}:${credentials.key_secret}`).toString('base64')}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new CommerceError('The payment provider could not confirm this attempt. Use Check payment; keep the same attempt.', 503)
  try { return await response.json() } catch { throw new CommerceError('The payment provider response was incomplete. Keep the same attempt.', 503) }
}
function receiptFor(intent) { return `cp_${intent.id.replaceAll('-', '')}` }
export function assertProviderOrder(order, intent) {
  if (!providerId('order').safeParse(order?.id).success || (intent.provider_order_id && order.id !== intent.provider_order_id) || order.amount !== intent.amount_paise || order.currency !== 'INR' || order.receipt !== receiptFor(intent) || order.notes?.commerce_intent_id !== intent.id || order.notes?.website_id !== intent.website_id) throw new CommerceError('Provider order does not match the saved store checkout. Reconciliation is required.', 409)
}
export function assertCapturedPayment(payment, intent) {
  if (!providerId('pay').safeParse(payment?.id).success || payment.order_id !== intent.provider_order_id || payment.amount !== intent.amount_paise || payment.currency !== 'INR' || payment.status !== 'captured' || payment.captured !== true || !Number.isSafeInteger(payment.amount_refunded ?? 0) || (payment.amount_refunded ?? 0) !== 0) throw new CommerceError('Payment capture is not confirmed for this checkout. Keep this attempt and check its status.', 409)
}
async function captureVerified(intent, credentials, paymentId, client, fetcher) {
  const [order, payment] = await Promise.all([
    razorpayRequest(credentials, `/orders/${intent.provider_order_id}`, { fetcher }),
    razorpayRequest(credentials, `/payments/${paymentId}`, { fetcher }),
  ])
  assertProviderOrder(order, intent)
  assertCapturedPayment(payment, intent)
  if (payment.id !== paymentId) throw new CommerceError('Provider payment identity mismatch.', 409)
  return assertView(await service('capture', { intent_id: intent.id, credential_version: intent.credential_version, provider_order_id: intent.provider_order_id, provider_payment_id: payment.id, amount_paise: payment.amount, currency: payment.currency }, client))
}
async function cancelledAttempt(client, payment, payload) {
  const control = await paymentAttemptControl(client, payment.website_id, payload.idempotency_key, 'inspect', payment.id)
  if (!control.cancellation || control.payment?.state !== 'cancelled_unstarted') throw new CommerceError('The stopped checkout could not be confirmed. Keep the same attempt and check again.', 503)
  return { payment: control.payment, attempt_control: control }
}
export async function createPayment(userClient, buyer, payload, { serviceClient, fetcher } = {}) {
  requireEnabled()
  let payment = assertView(await dataResult(userClient.rpc('commerce_payment_start', { p_website_id: payload.website_id, p_items: payload.items, p_customer: payload.customer, p_fulfillment: payload.fulfillment_method, p_cart_key: payload.idempotency_key, p_coupon_code: payload.coupon_code || '' })))
  if (payment.state === 'cancelled_unstarted') return cancelledAttempt(userClient, payment, payload)
  if (payment.receipt) return { payment }
  const { intent, credentials } = await context(payment.id, buyer.id, serviceClient)
  if (!intent.merchant_enabled) throw new CommerceError('Store online payments are disabled. Use Check payment for an existing charge.', 503)
  if (!intent.provider_order_id) {
    const lease = await service('claim_create', { intent_id: intent.id, buyer_id: buyer.id }, serviceClient)
    if (lease?.claimed) {
      try {
        const order = await razorpayRequest(credentials, '/orders', { method: 'POST', body: { amount: intent.amount_paise, currency: 'INR', receipt: receiptFor(intent), notes: { commerce_intent_id: intent.id, website_id: intent.website_id } }, fetcher })
        assertProviderOrder(order, intent)
        payment = assertView(await service('attach_create', { intent_id: intent.id, lease_token: lease.lease_token, provider_order_id: order.id, amount_paise: order.amount, currency: order.currency }, serviceClient))
      } catch {
        // Even a timeout may have created an order. No automatic second POST.
        payment = assertView(await service('create_unknown', { intent_id: intent.id, lease_token: lease.lease_token }, serviceClient))
      }
    } else payment = await paymentStatus(userClient, intent.id)
  }
  if (payment.state === 'cancelled_unstarted') return cancelledAttempt(userClient, payment, payload)
  if (payment.state !== 'ready' || !payment.provider_order_id) return { payment }
  return { payment, checkout: { key_id: credentials.key_id, provider_order_id: payment.provider_order_id, amount_paise: payment.amount_paise, currency: 'INR', intent_id: payment.id } }
}
export async function resumePayment(userClient, buyer, intentId, { serviceClient } = {}) {
  const payment = await paymentStatus(userClient, intentId)
  if (payment.state !== 'ready' || payment.receipt) return { payment }
  requireEnabled()
  const { intent, credentials } = await context(intentId, buyer.id, serviceClient)
  if (!intent.merchant_enabled) throw new CommerceError('Store online payments are disabled. Use Check payment for an existing charge.', 503)
  return { payment, checkout: { key_id: credentials.key_id, provider_order_id: payment.provider_order_id, amount_paise: payment.amount_paise, currency: 'INR', intent_id: payment.id } }
}
export async function verifyPayment(userClient, buyer, payload, { serviceClient, fetcher } = {}) {
  const original = await paymentStatus(userClient, payload.intent_id) // Auth scoped before service access.
  if (original.state === 'cancelled_unstarted') throw new CommerceError('This checkout was stopped before provider creation. No payment verification is available for it.', 409)
  const { intent, credentials } = await context(payload.intent_id, buyer.id, serviceClient)
  if (intent.provider_order_id !== payload.razorpay_order_id || !validPaymentSignature(`${intent.provider_order_id}|${payload.razorpay_payment_id}`, payload.razorpay_signature, credentials.key_secret)) throw new CommerceError('The payment signature is invalid for this checkout.', 400)
  return captureVerified(intent, credentials, payload.razorpay_payment_id, serviceClient, fetcher)
}
export async function reconcilePayment(intentId, { buyerId, websiteId, providerOrderId, serviceClient, fetcher } = {}) {
  const { intent, credentials } = await context(intentId, buyerId, serviceClient)
  if (websiteId && intent.website_id !== websiteId) throw new CommerceError('Payment belongs to another website.', 403)
  if (!intent.provider_order_id) {
    if (!providerOrderId) return { payment: null, reconciliation_required: true }
    const order = await razorpayRequest(credentials, `/orders/${providerOrderId}`, { fetcher })
    assertProviderOrder(order, intent)
    await service('attach_reconciled', { intent_id: intent.id, provider_order_id: order.id, amount_paise: order.amount, currency: order.currency }, serviceClient)
    intent.provider_order_id = order.id
  }
  const result = await razorpayRequest(credentials, `/orders/${intent.provider_order_id}/payments`, { fetcher })
  if (!Array.isArray(result?.items)) throw new CommerceError('Provider payments could not be confirmed.', 503)
  const captured = result.items.filter(payment => payment.status === 'captured' && payment.captured === true)
  if (captured.length > 1) throw new CommerceError('Multiple captured payments require merchant reconciliation.', 409)
  if (!captured.length) return { payment: null, capture_pending: true }
  return { payment: await captureVerified(intent, credentials, captured[0].id, serviceClient, fetcher) }
}
export async function configurePaymentMerchant(client, session, payload) {
  if (payload.action === 'reconcile') return reconcilePayment(payload.intent_id, { websiteId: payload.website_id, providerOrderId: payload.provider_order_id, serviceClient: client })
  let values = {}
  if (payload.action === 'configure') {
    if (payload.enabled) requireEnabled()
    const version = randomUUID()
    const sealed = sealPaymentCredentials(payload.website_id, version, payload.credentials)
    values = { version_id: version, mode: sealed.mode, ciphertext: sealed.ciphertext, enabled: payload.enabled, actor_email: session.email }
  }
  return { readiness: await dataResult(client.rpc('commerce_payment_admin', { p_website_id: payload.website_id, p_action: payload.action, p_payload: values })), rollout: paymentRollout() }
}

export async function readPaymentWebhook(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new CommerceError('Send a JSON event.', 415)
  if (Number(request.headers.get('content-length')) > 65536) throw new CommerceError('Webhook too large.', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new CommerceError('Webhook body required.')
  const chunks = []; let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536) { await reader.cancel(); throw new CommerceError('Webhook too large.', 413) }
      chunks.push(Buffer.from(value))
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks)
}
export async function processPaymentWebhook(request, { serviceClient, fetcher } = {}) {
  const url = new URL(request.url)
  const websiteId = uuid.parse(url.searchParams.get('website_id'))
  const version = uuid.parse(url.searchParams.get('credential_version'))
  const raw = await readPaymentWebhook(request)
  const stored = await service('credentials', { website_id: websiteId, credential_version: version }, serviceClient)
  const credentials = openPaymentCredentials(websiteId, version, stored.ciphertext)
  if (!validPaymentSignature(raw, request.headers.get('x-razorpay-signature'), credentials.webhook_secret)) throw new CommerceError('Invalid webhook signature.', 400)
  let event
  try { event = JSON.parse(raw.toString('utf8')) } catch { throw new CommerceError('Invalid webhook event.') }
  if (!['payment.captured','order.paid'].includes(event?.event)) return { accepted: true, ignored: true }
  const payment = event.payload?.payment?.entity
  const eventId = z.string().min(1).max(200).safeParse(request.headers.get('x-razorpay-event-id'))
  if (!eventId.success || !providerId('order').safeParse(payment?.order_id).success || !providerId('pay').safeParse(payment?.id).success) throw new CommerceError('Invalid payment event binding.')
  const lease = await service('webhook_claim', { website_id: websiteId, credential_version: version, event_id: eventId.data, body_hash: createHash('sha256').update(raw).digest('hex'), provider_order_id: payment.order_id, provider_payment_id: payment.id }, serviceClient)
  if (!lease?.claimed) return { accepted: true, duplicate: true }
  try {
    if (!lease.intent_id) throw new CommerceError('Webhook order requires reconciliation.', 409)
    const bound = await context(lease.intent_id, null, serviceClient)
    if (bound.intent.website_id !== websiteId || bound.intent.credential_version !== version || bound.intent.provider_order_id !== payment.order_id) throw new CommerceError('Webhook tenant mismatch.', 409)
    await captureVerified(bound.intent, credentials, payment.id, serviceClient, fetcher)
    await service('webhook_ack', { event_id: lease.id, lease_token: lease.lease_token, processed: true }, serviceClient)
    return { accepted: true }
  } catch (error) {
    await service('webhook_ack', { event_id: lease.id, lease_token: lease.lease_token, processed: false }, serviceClient)
    throw error
  }
}
