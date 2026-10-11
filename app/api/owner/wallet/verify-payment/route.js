import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { requireApprovedOwner } from '@/lib/server/ownerApproval'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function reply(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

const isRazorpayId = (value) => /^[a-zA-Z0-9_\-]{5,100}$/.test(value)

function signatureIsValid(orderId, paymentId, signature, secret) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false
  const expected = createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')
  const left = Buffer.from(expected, 'hex')
  const right = Buffer.from(signature, 'hex')
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const restaurantId = String(body?.restaurantId || '').trim()
    const access = await requireApprovedOwner(request, restaurantId)
    if (!access.ok) {
      return reply({ success: false, code: access.code, message: access.message }, access.status)
    }

    const topupId = String(body?.topupId || '').trim()
    const orderId = String(body?.razorpay_order_id || '').trim()
    const paymentId = String(body?.razorpay_payment_id || '').trim()
    const signature = String(body?.razorpay_signature || '').trim()
    if (!/^[a-f0-9-]{36}$/i.test(topupId) || !isRazorpayId(orderId) || !isRazorpayId(paymentId) || !signature) {
      return reply({ success: false, message: 'Invalid payment confirmation.' }, 400)
    }

    const keyId = process.env.DIGITAL_DINE_WALLET_RAZORPAY_KEY_ID?.trim()
    const secret = process.env.DIGITAL_DINE_WALLET_RAZORPAY_KEY_SECRET?.trim()
    if (!keyId || !secret) {
      return reply({ success: false, message: 'Wallet payment gateway has not been configured.' }, 503)
    }
    if (!signatureIsValid(orderId, paymentId, signature, secret)) {
      return reply({ success: false, message: 'Payment signature verification failed.' }, 400)
    }

    const admin = getAdminSupabase()
    const { data: topup, error: topupError } = await admin
      .from('delivery_wallet_topups')
      .select('id,restaurant_id,amount_paise,razorpay_order_id,status')
      .eq('id', topupId)
      .eq('restaurant_id', access.restaurantId)
      .maybeSingle()
    if (topupError) throw topupError
    if (!topup || topup.razorpay_order_id !== orderId) {
      return reply({ success: false, message: 'This wallet payment does not belong to your store.' }, 403)
    }

    // Server-to-server check: signed callbacks alone do not prove capture.
    const basic = Buffer.from(`${keyId}:${secret}`).toString('base64')
    const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      cache: 'no-store',
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(15000),
    })
    const payment = await response.json().catch(() => ({}))
    if (!response.ok) {
      console.error('[WALLET RAZORPAY PAYMENT]', response.status, payment?.error?.code || 'request failed')
      return reply({ success: false, message: 'Could not confirm payment with Razorpay. Retry verification shortly.' }, 502)
    }

    if (
      payment?.id !== paymentId ||
      payment?.order_id !== orderId ||
      payment?.currency !== 'INR' ||
      Number(payment?.amount) !== Number(topup.amount_paise)
    ) {
      return reply({ success: false, message: 'Razorpay payment details do not match the wallet recharge.' }, 400)
    }
    if (payment?.status !== 'captured' || payment?.captured !== true) {
      return reply({ success: false, code: 'PAYMENT_NOT_CAPTURED', message: 'Payment is not captured yet. Wallet has not been credited.' }, 409)
    }

    // Atomic, idempotent database function installed and verified in Step 8.
    const { data, error } = await admin.rpc('delivery_wallet_credit_verified_topup', {
      p_topup_id: topup.id,
      p_razorpay_order_id: orderId,
      p_razorpay_payment_id: paymentId,
      p_paid_amount_paise: Number(payment.amount),
    })
    if (error) throw error
    const result = Array.isArray(data) ? data[0] : data
    if (!result || result.topup_status !== 'paid') {
      throw new Error('Wallet credit confirmation was not returned.')
    }

    return reply({
      success: true,
      message: result.credited ? 'Wallet recharged successfully.' : 'This wallet recharge was already credited.',
      creditedNow: result.credited === true,
      balancePaise: Number(result.wallet_balance_paise || 0),
      topupId: topup.id,
    })
  } catch (error) {
    console.error('[WALLET VERIFY PAYMENT]', error)
    return reply({ success: false, message: 'Unable to verify wallet payment. If you paid, do not pay again; contact support for reconciliation.' }, 500)
  }
}
