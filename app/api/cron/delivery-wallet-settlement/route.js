import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

// Vercel Cron calls this route with GET. Only the server-side Supabase
// service-role client may execute the settlement RPC.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function authorizedCronRequest(request, secret) {
  const actual = request.headers.get('authorization') || ''
  const expected = `Bearer ${secret}`
  const actualBytes = Buffer.from(actual, 'utf8')
  const expectedBytes = Buffer.from(expected, 'utf8')

  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  )
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET || ''

  // Fail closed if a secret was not configured in Vercel.
  if (secret.length < 16) {
    console.error('[DELIVERY WALLET CRON] CRON_SECRET is missing or too short')
    return json({ success: false, message: 'Cron is not configured.' }, 503)
  }

  if (!authorizedCronRequest(request, secret)) {
    return json({ success: false, message: 'Unauthorized.' }, 401)
  }

  const { searchParams } = new URL(request.url)

  // Safe connectivity check: this branch NEVER runs the settlement RPC.
  // Only for local/deployment tests using the same Bearer token.
  if (searchParams.get('check') === '1') {
    return json({
      success: true,
      ready: true,
      message: 'Cron authorization passed. No settlement was executed.',
      scheduleUtc: '30 17 * * *',
      timeZone: 'Asia/Kolkata',
    })
  }

  try {
    const admin = getAdminSupabase()

    // No date supplied intentionally. Step 12 SQL computes the latest
    // completed 11:00 PM IST cutoff, including delayed cron invocations.
    // SQL owns the row locks, idempotency key and wallet transactions.
    const { data, error } = await admin.rpc(
      'delivery_wallet_run_daily_settlement',
      {}
    )

    if (error) {
      console.error('[DELIVERY WALLET CRON] Settlement RPC failed', {
        code: error.code,
        message: error.message,
      })
      return json({ success: false, message: 'Settlement failed; check server logs.' }, 500)
    }

    if (data?.success !== true) {
      console.error('[DELIVERY WALLET CRON] Unexpected settlement result', data)
      return json({ success: false, message: 'Unexpected settlement response.' }, 500)
    }

    console.info('[DELIVERY WALLET CRON] Settlement completed', {
      settlementDate: data.settlementDate,
      completedStores: data.completedStores,
      partialStores: data.partialStores,
      alreadyProcessedStores: data.alreadyProcessedStores,
      orderFeesSettled: data.orderFeesSettled,
      totalDebitedPaise: data.totalDebitedPaise,
    })

    return json({ success: true, settlement: data })
  } catch (error) {
    console.error('[DELIVERY WALLET CRON] Unexpected error', error)
    return json({ success: false, message: 'Settlement unavailable; check server logs.' }, 500)
  }
}
