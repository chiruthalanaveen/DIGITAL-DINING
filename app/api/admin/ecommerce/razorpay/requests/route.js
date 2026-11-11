
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const session = requireAdmin(request)

  if (!session) {
    return NextResponse.json({
      success: false,
      message: 'Admin authentication required.',
    }, {
      status: 401,
    })
  }

  try {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')

    const allowed = new Set([
      'pending',
      'approved',
      'rejected',
      'consumed',
      'revoked',
      'expired',
    ])

    if (status && !allowed.has(status)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid status.',
      }, {
        status: 400,
      })
    }

    const db = getAdminSupabase()

    let query = db
      .from('ecommerce_razorpay_edit_requests')
      .select(
        'id,store_id,requester_user_id,reason,status,decided_by,decision_note,decided_at,expires_at,consumed_at,created_at'
      )
      .order('created_at', { ascending: false })
      .limit(200)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      requests: data || [],
    }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error(
      '[ECOMMERCE RAZORPAY REQUESTS]',
      error?.message
    )

    return NextResponse.json({
      success: false,
      message: 'Unable to load requests.',
    }, {
      status: 500,
    })
  }
}
