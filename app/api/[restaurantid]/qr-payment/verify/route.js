import { createHmac, timingSafeEqual } from 'node:crypto'
import { qrAdmin, qrRespond, qrError, qrGateway, QR_ID_RE } from '@/lib/server/qrPaymentServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeEqualHex(a, b) {
  if (!/^[0-9a-f]{64}$/i.test(a || '') || !/^[0-9a-f]{64}$/i.test(b || '')) return false
  const aa = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return aa.length === bb.length && timingSafeEqual(aa, bb)
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const intentId = String(body.intentId || '').trim()
    const providerOrderId = String(body.razorpay_order_id || '').trim()
    const providerPaymentId = String(body.razorpay_payment_id || '').trim()
    const signature = String(body.razorpay_signature || '').trim()
    if (!QR_ID_RE.test(intentId) || !/^order_[a-zA-Z0-9]+$/.test(providerOrderId) ||
      !/^pay_[a-zA-Z0-9]+$/.test(providerPaymentId) || !/^[0-9a-f]{64}$/i.test(signature)) {
      return qrError('Invalid payment verification details.', 400, 'INVALID_PAYMENT_DETAILS')
    }

    const admin = qrAdmin()
    const { data: intent, error: findError } = await admin
      .from('qr_payment_intents')
      .select('id,restaurant_id,key_id,razorpay_order_id,razorpay_payment_id,amount_paise,status,final_order_id')
      .eq('id', intentId).maybeSingle()
    if (findError) throw findError
    if (!intent || intent.razorpay_order_id !== providerOrderId ||
      (intent.razorpay_payment_id && intent.razorpay_payment_id !== providerPaymentId)) {
      return qrError('Payment order does not match your checkout.', 400, 'PAYMENT_INTENT_MISMATCH')
    }

    const { data: restaurant, error: restaurantError } = await admin
      .from('restaurants').select('id').eq('id', intent.restaurant_id).maybeSingle()
    if (restaurantError) throw restaurantError
    if (!restaurant) return qrError('Restaurant not found.', 404, 'RESTAURANT_NOT_FOUND')
    const gateway = await qrGateway(admin, restaurant)
    if (gateway.keyId !== intent.key_id) {
      // Rotated merchant keys require manual reconciliation with the prior key;
      // do not attempt verification using a different restaurant's credentials.
      return qrError('The payment gateway configuration changed. Please contact support with your payment ID.',
        409, 'GATEWAY_KEYS_CHANGED')
    }

    const expected = createHmac('sha256', gateway.keySecret)
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest('hex')
    if (!safeEqualHex(expected, signature)) {
      return qrError('Payment verification failed.', 403, 'PAYMENT_SIGNATURE_INVALID')
    }

    // Verify status, amount, order and currency directly with the provider.
    // Browser callbacks and HMAC alone do not prove that funds were captured.
    const payment = await gateway.razorpay.payments.fetch(providerPaymentId)
    if (String(payment?.order_id || '') !== providerOrderId ||
      Number(payment?.amount) !== Number(intent.amount_paise) ||
      String(payment?.currency) !== 'INR') {
      return qrError('Razorpay payment amount or order mismatch.', 409, 'PAYMENT_AMOUNT_MISMATCH')
    }

    if (String(payment?.status) !== 'captured') {
      // Do not mark an authorized/pending/failed payment as paid. The verified
      // callback can be retried once capture completes. No duplicate order.
      return qrRespond({ success: false, pending: true,
        code: 'PAYMENT_NOT_CAPTURED',
        message: 'Payment is not captured yet. Please wait before retrying payment verification.' }, 202)
    }

    const { data: finalized, error: finalizeError } = await admin.rpc(
      'qr_finalize_verified_payment', {
        p_intent_id: intentId,
        p_razorpay_order_id: providerOrderId,
        p_razorpay_payment_id: providerPaymentId,
      }
    )
    if (finalizeError || !finalized?.success) {
      console.error('[QR PAYMENT VERIFY] Finalization failed:', finalizeError?.code || finalizeError?.message || 'unknown')
      // Captured payment is preserved for retry / manual reconciliation.
      // Do not mark it FAILED or ask the customer to pay again.
      await admin.from('qr_payment_intents')
        .update({ status: 'needs_reconciliation',
          last_error: String(finalizeError?.code || 'Order finalization pending').slice(0, 200),
          updated_at: new Date().toISOString() })
        .eq('id', intentId).in('status', ['checkout_ready','verified','needs_reconciliation'])
      return qrRespond({ success: false, pending: true, paymentReceived: true,
        code: 'PAYMENT_RECONCILIATION_REQUIRED',
        message: 'Your payment was captured, but the order needs confirmation. Do not pay again. Please retry verification or contact restaurant support.',
        paymentId: providerPaymentId }, 202)
    }

    return qrRespond({ success: true, paymentId: providerPaymentId,
      orderNumber: finalized.order_number,
      order: finalized.order,
      alreadyFinalized: Boolean(finalized.alreadyFinalized) })
  } catch (error) {
    console.error('[QR PAYMENT VERIFY] Server error:', error?.code || error?.message || 'unknown')
    return qrError('Unable to confirm your payment right now. Do not pay again if money was deducted. Please retry verification or contact restaurant support.',
      503, 'VERIFICATION_TEMPORARILY_UNAVAILABLE')
  }
}