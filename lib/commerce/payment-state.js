const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const providerOrder = /^order_[A-Za-z0-9]{4,100}$/
const invalid = () => { throw new Error('The saved payment could not be verified for this store. Keep this attempt and contact the store before paying again.') }

/** A browser storage pointer is untrusted, even when its key contains a tenant. */
export function checkedStorePayment(payment, websiteId, intentId = null) {
  if (!payment || payment.website_id !== websiteId || !uuid.test(payment.id || '') || intentId && payment.id !== intentId || !Number.isSafeInteger(payment.amount_paise) || payment.amount_paise < 1 || payment.currency !== 'INR' || !['new', 'creating', 'provider_unknown', 'ready', 'captured_unfulfilled', 'fulfilled'].includes(payment.state)) invalid()
  if (payment.provider_order_id && !providerOrder.test(payment.provider_order_id)) invalid()
  const receipt = payment.receipt
  if (receipt && (!uuid.test(receipt.id || '') || receipt.amount_paise !== payment.amount_paise || receipt.currency !== payment.currency || !['captured_unfulfilled', 'fulfilled'].includes(receipt.state))) invalid()
  if (payment.state === 'fulfilled' && (!receipt || receipt.state !== 'fulfilled' || !uuid.test(payment.order?.id || '') || receipt.order_id !== payment.order.id || payment.order.website_id !== websiteId || payment.order.total_paise !== payment.amount_paise || payment.order.payment_method !== 'razorpay' || payment.order.payment_status !== 'paid' || !Array.isArray(payment.items))) invalid()
  if (payment.state === 'captured_unfulfilled' && (!receipt || receipt.state !== 'captured_unfulfilled' || receipt.order_id)) invalid()
  return payment
}

export function checkedStorePaymentCheckout(checkout, payment) {
  if (!checkout || payment.state !== 'ready' || payment.receipt || checkout.intent_id !== payment.id || checkout.provider_order_id !== payment.provider_order_id || !providerOrder.test(checkout.provider_order_id || '') || checkout.amount_paise !== payment.amount_paise || checkout.currency !== payment.currency || !/^rzp_(?:test|live)_[A-Za-z0-9]{6,80}$/.test(checkout.key_id || '')) invalid()
  return checkout
}
