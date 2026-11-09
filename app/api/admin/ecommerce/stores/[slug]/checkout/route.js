import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function reply(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

// Intentionally disabled until payment verification, cancellation,
// rate limiting, shipping/serviceability, and scheduled expiry are live.
export async function POST(request, { params }) {
  const { slug } = await params
  if (typeof slug !== 'string' || !SLUG.test(slug)) {
    return reply({ success: false, message: 'Invalid store.' }, 400)
  }

  return reply({
    success: false,
    code: 'CHECKOUT_NOT_LIVE',
    message: 'Checkout is being prepared. No order or stock reservation was created.',
  }, 503)
}