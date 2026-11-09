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

export async function POST(request) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return respond({ success: false, message: 'Admin login required.' }, 401)

    const origin = request.headers.get('origin')
    if (!origin || origin !== request.nextUrl.origin) {
      return respond({ success: false, message: 'Invalid origin.' }, 403)
    }

    const body = await request.json().catch(() => ({}))
    const limit = body.limit === undefined ? 100 : body.limit
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return respond({ success: false, message: 'Limit must be 1–500.' }, 400)
    }

    const db = getAdminSupabase()
    const { data, error } = await db.rpc('ecommerce_expire_reservations', {
      p_limit: limit,
    })
    if (error) throw error

    return respond({ success: true, expiredCount: Number(data || 0) })
  } catch (error) {
    console.error('[ECOMMERCE EXPIRE RESERVATIONS]', error)
    return respond({ success: false, message: 'Unable to expire reservations.' }, 500)
  }
}