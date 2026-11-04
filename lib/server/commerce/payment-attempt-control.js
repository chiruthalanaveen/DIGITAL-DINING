import { z } from 'zod'
import { checkedPaymentAttemptControl, checkedUnstartedCancellation } from '@/lib/commerce/payment-state'
import { CommerceError } from './core'
import { optionalCommerceRpc } from './expansion'
import { uuid } from './validation'

export const paymentAttemptSchema = z.object({
  website_id: uuid, cart_key: uuid, intent_id: uuid.nullable().optional(),
  action: z.enum(['inspect', 'cancel_unstarted']).default('inspect'),
}).strict()

const pick = (row, keys) => row && typeof row === 'object' && !Array.isArray(row) ? Object.fromEntries(keys.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]])) : row
function publicPayment(value) {
  if (value == null) return null
  const result = pick(value, ['id', 'website_id', 'state', 'amount_paise', 'currency', 'provider_order_id', 'receipt', 'order', 'items'])
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result
  result.receipt = pick(result.receipt, ['id', 'state', 'amount_paise', 'currency', 'provider_payment_id', 'captured_at', 'order_id', 'reconciliation_required'])
  result.order = pick(result.order, ['id', 'website_id', 'status', 'fulfillment_method', 'payment_method', 'payment_status', 'subtotal_paise', 'delivery_fee_paise', 'discount_paise', 'total_paise', 'created_at'])
  if (Array.isArray(result.items)) result.items = result.items.map(row => pick(row, ['id', 'website_id', 'order_id', 'product_id', 'product_name', 'variant_id', 'variant_name', 'sku', 'option_snapshot', 'quantity', 'unit_price_paise', 'line_total_paise']))
  return result
}

export async function paymentAttemptControl(client, websiteId, cartKey, action = 'inspect', expectedIntentId = null) {
  const website = websiteId.toLowerCase(), cart = cartKey.toLowerCase(), expected = expectedIntentId?.toLowerCase() || null
  const response = await optionalCommerceRpc(client, 'commerce_payment_attempt_control', { p_website_id: website, p_cart_key: cart, p_action: action, p_expected_intent_id: expected })
  if (!response.available) {
    if (action === 'cancel_unstarted') throw new CommerceError('Stopping this checkout is not available. Keep its reference and contact the store.', 503)
    return { available: false, website_id: website, cart_key: cart, intent_id: null, found: false, payment: null, cancellation: null, can_cancel_unstarted: false }
  }
  const raw = response.data
  const control = { available: true, ...pick(raw, ['website_id', 'cart_key', 'intent_id', 'found', 'can_cancel_unstarted']) , payment: publicPayment(raw?.payment), cancellation: pick(raw?.cancellation, ['id', 'intent_id', 'cancelled_at', 'reason']) }
  try {
    checkedPaymentAttemptControl(control, website, cart, expected)
    if (action === 'cancel_unstarted') checkedUnstartedCancellation(control, website, cart, expected)
  } catch { throw new CommerceError('The checkout state could not be verified. Keep the same attempt and check again.', 503) }
  return control
}
