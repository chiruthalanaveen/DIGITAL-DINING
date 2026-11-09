// Destination: app/api/admin/ecommerce/payment-readiness/route.js
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

// Read-only diagnostics. Never returns secrets or customer/payment details.
export async function GET(request) {
  try {
    const session = await requireAdmin(request)
    if (!session) return respond({ success: false, message: 'Super Admin login required.' }, 401)

    const db = getAdminSupabase()
    const checks = [
      ['orders', 'ecommerce_orders'],
      ['orderItems', 'ecommerce_order_items'],
      ['paymentAttempts', 'ecommerce_payment_attempts'],
      ['webhookEvents', 'ecommerce_payment_webhook_events'],
    ]
    const results = await Promise.all(checks.map(async ([name, table]) => {
      const { error } = await db.from(table).select('id', { head: true, count: 'exact' })
      return { name, ready: !error, errorCode: error?.code || null }
    }))

    const { error: reserveError } = await db.rpc('ecommerce_reserve_checkout', {
      p_store_id: null,
      p_idempotency_key: null,
      p_customer_name: '',
      p_customer_phone: '',
      p_customer_email: null,
      p_shipping_address: {},
      p_payment_mode: 'prepaid',
      p_items: [],
    })
    // Expected error from the function's input validation. No order is created.
    const reservationFunctionPresent = reserveError?.code !== 'PGRST202' &&
      reserveError?.code !== '42883'

    return respond({
      success: true,
      checkoutEnabled: false,
      paymentProcessingEnabled: false,
      reservationFunctionPresent,
      tables: results,
      readyForNextImplementation: results.every((r) => r.ready) && reservationFunctionPresent,
      note: 'Database readiness only. Razorpay, shipping, webhook verification, and scheduled expiry remain disabled.',
    })
  } catch (error) {
    console.error('[ECOMMERCE PAYMENT READINESS]', error)
    return respond({ success: false, message: 'Payment readiness check failed.' }, 500)
  }
}