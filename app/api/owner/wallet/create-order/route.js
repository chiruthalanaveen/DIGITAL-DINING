import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
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

function razorpayCredentials() {
  // Use DIGITAL_DINE_WALLET_* so the platform wallet cannot accidentally
  // charge through a restaurant's own customer-payment gateway.
  const keyId = process.env.DIGITAL_DINE_WALLET_RAZORPAY_KEY_ID?.trim()
  const keySecret = process.env.DIGITAL_DINE_WALLET_RAZORPAY_KEY_SECRET?.trim()
  if (!keyId || !keySecret) return null
  return { keyId, keySecret }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const restaurantId = String(body?.restaurantId || '').trim()
    const access = await requireApprovedOwner(request, restaurantId)
    if (!access.ok) {
      return reply({ success: false, code: access.code, message: access.message }, access.status)
    }

    // Require whole rupees, and bound each request to reduce accidental overcharges.
    const amountRupees = Number(body?.amountRupees)
    if (!Number.isSafeInteger(amountRupees) || amountRupees < 2000 || amountRupees > 500000) {
      return reply({ success: false, message: 'Enter a recharge amount from ₹2,000 to ₹5,00,000 in whole rupees.' }, 400)
    }

    const credentials = razorpayCredentials()
    if (!credentials) {
      return reply({ success: false, message: 'Wallet payment gateway has not been configured.' }, 503)
    }

    const admin = getAdminSupabase()
    const { data: wallet, error: walletError } = await admin
      .from('delivery_store_wallets')
      .select('restaurant_id,min_topup_paise')
      .eq('restaurant_id', access.restaurantId)
      .maybeSingle()
    if (walletError) throw walletError
    if (!wallet) return reply({ success: false, message: 'Store wallet is missing.' }, 409)

    const amountPaise = amountRupees * 100
    if (amountPaise < wallet.min_topup_paise) {
      return reply({ success: false, message: `Minimum wallet recharge is ₹${(wallet.min_topup_paise / 100).toLocaleString('en-IN')}.` }, 400)
    }

    const receipt = `wallet_${randomUUID().replace(/-/g, '').slice(0, 24)}`
    const basic = Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64')
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: { purpose: 'delivery_wallet_topup', restaurant_id: access.restaurantId },
      }),
      signal: AbortSignal.timeout(15000),
    })
    const order = await response.json().catch(() => ({}))
    if (!response.ok || !order?.id || order.amount !== amountPaise || order.currency !== 'INR') {
      console.error('[WALLET RAZORPAY ORDER]', response.status, order?.error?.code || 'invalid response')
      return reply({ success: false, message: 'Could not create wallet payment. Please retry.' }, 502)
    }

    const { data: topup, error: insertError } = await admin
      .from('delivery_wallet_topups')
      .insert({
        restaurant_id: access.restaurantId,
        amount_paise: amountPaise,
        razorpay_order_id: order.id,
        status: 'created',
      })
      .select('id')
      .single()
    if (insertError) throw insertError

    return reply({
      success: true,
      topupId: topup.id,
      razorpayOrderId: order.id,
      keyId: credentials.keyId,
      amountPaise,
      currency: 'INR',
      restaurantId: access.restaurantId,
    })
  } catch (error) {
    console.error('[WALLET CREATE ORDER]', error)
    return reply({ success: false, message: 'Unable to start wallet recharge.' }, 500)
  }
}
