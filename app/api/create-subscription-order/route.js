import { NextResponse } from 'next/server'

// The old Starter/Pro/Enterprise payload accepted browser-supplied prices and
// never had a supported server handler. Do not translate it into a payment.
// Current checkout uses /api/create-order and /api/verify-subscription.
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      code: 'SUBSCRIPTION_ENDPOINT_RETIRED',
      message: 'This legacy checkout has been retired. Open your restaurant subscription page to choose a current plan.',
      replacement: '/api/create-order',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  )
}
