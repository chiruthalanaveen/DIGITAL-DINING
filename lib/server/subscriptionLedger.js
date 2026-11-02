// Server-only protocol for the durable subscription RPCs. Provider capture and
// Auth verification happen in the route before activation is requested.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value))

export function isSubscriptionCheckoutId(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

export class SubscriptionLedgerError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'SubscriptionLedgerError'
    this.status = status
    this.code = code
  }
}

export function requirePaidSubscriptionCheckout() {
  if (process.env.SUBSCRIPTION_PAID_CHECKOUT_ENABLED !== 'true') {
    throw new SubscriptionLedgerError(503, 'SUBSCRIPTION_PAYMENTS_DISABLED',
      'Paid subscription checkout is temporarily unavailable. If you already paid, do not pay again; contact support or retry verification after service is restored.')
  }
}

function unavailable() {
  return new SubscriptionLedgerError(503, 'SUBSCRIPTION_LEDGER_UNAVAILABLE',
    'Secure subscription verification is temporarily unavailable. If you already paid, do not pay again; retry verification or contact support.')
}

export async function callSubscriptionLedger(admin, name, parameters) {
  let result
  try {
    result = await admin.rpc(name, parameters)
  } catch {
    // A timeout can occur after the transaction committed. Keep the response
    // indeterminate; retrying the same verified payment is safe in the ledger.
    throw unavailable()
  }
  if (result?.error) {
    const code = String(result.error.code || '')
    if (code === '42501') {
      throw new SubscriptionLedgerError(403, 'OWNER_APPROVAL_REQUIRED',
        'Your approved owner access could not be confirmed. Contact Super Admin before continuing.')
    }
    if (['22023', '23505', '55000'].includes(code)) {
      throw new SubscriptionLedgerError(409, 'SUBSCRIPTION_RECONCILIATION_REQUIRED',
        'This subscription payment requires an account review. If you already paid, do not pay again; contact support with your payment reference.')
    }
    throw unavailable()
  }
  if (result?.data?.success !== true) throw unavailable()
  return result.data
}

export function assertCheckoutBinding(result, expected) {
  const checkout = result?.checkout
  if (!checkout || checkout.id !== expected.checkoutId ||
      checkout.restaurant_id !== expected.restaurantId || checkout.owner_id !== expected.ownerId ||
      checkout.plan_code !== expected.planCode || checkout.billing_cycle !== expected.billingCycle ||
      Number(checkout.amount_paise) !== expected.amountPaise || checkout.currency !== 'INR' ||
      checkout.provider_key_id !== expected.keyId ||
      (expected.orderId ? checkout.provider_order_id !== expected.orderId : checkout.provider_order_id != null) ||
      !timestamp(checkout.created_at)) {
    throw unavailable()
  }
  return checkout
}

export function assertActivationReceipt(result, expected, plan) {
  const receipt = result?.receipt
  const restaurant = result?.restaurant
  if (typeof result?.replayed !== 'boolean' || !receipt || !restaurant ||
      receipt.checkout_id !== expected.checkoutId || receipt.provider_order_id !== expected.orderId ||
      receipt.provider_payment_id !== expected.paymentId || Number(receipt.amount_paise) !== expected.amountPaise ||
      receipt.currency !== 'INR' || !timestamp(receipt.activated_at) ||
      !timestamp(receipt.subscription_expires_at) ||
      Date.parse(receipt.subscription_expires_at) <= Date.parse(receipt.activated_at) ||
      restaurant.id !== expected.restaurantId || restaurant.plan_code !== expected.planCode ||
      restaurant.billing_cycle !== expected.billingCycle || restaurant.subscription_status !== 'active' ||
      restaurant.subscription_expires_at !== receipt.subscription_expires_at ||
      restaurant.plan !== plan.legacyPlan || restaurant.business_type !== plan.businessType ||
      restaurant.resort_enabled !== plan.resortEnabled || restaurant.delivery_enabled !== plan.deliveryEnabled) {
    throw unavailable()
  }
  return result
}
