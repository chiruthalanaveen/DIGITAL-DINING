
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const reply = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

async function authorize(request, storeId) {
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (!token) return null

  const db = getAdminSupabase()

  const {
    data: { user } = {},
    error,
  } = await db.auth.getUser(token)

  if (error || !user) return null

  const { data: member, error: memberError } = await db
    .from('ecommerce_store_members')
    .select('user_id')
    .eq('store_id', storeId)
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .maybeSingle()

  if (memberError || !member) return null

  const { data: store, error: storeError } = await db
    .from('ecommerce_stores')
    .select('id')
    .eq('id', storeId)
    .eq('approval_status', 'approved')
    .eq('is_active', true)
    .maybeSingle()

  if (storeError || !store) return null

  return { db, user }
}

export async function GET(request) {
  const storeId = new URL(request.url).searchParams.get('storeId')

  if (!UUID.test(storeId || '')) {
    return reply({
      success: false,
      message: 'Invalid store ID.',
    }, 400)
  }

  const auth = await authorize(request, storeId)

  if (!auth) {
    return reply({
      success: false,
      message: 'Owner authorization required.',
    }, 403)
  }

  const { data, error } = await auth.db
    .from('ecommerce_razorpay_edit_requests')
    .select(
      'id,reason,status,decision_note,created_at,decided_at,expires_at,consumed_at'
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return reply({
      success: false,
      message: 'Unable to load access requests.',
    }, 500)
  }

  return reply({
    success: true,
    requests: data || [],
  })
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}))

  const storeId = body?.storeId
  const reason = String(body?.reason || '').trim()

  if (
    !UUID.test(storeId || '') ||
    reason.length < 10 ||
    reason.length > 1000
  ) {
    return reply({
      success: false,
      message:
        'A valid store and reason (10–1000 characters) are required.',
    }, 400)
  }

  const auth = await authorize(request, storeId)

  if (!auth) {
    return reply({
      success: false,
      message: 'Owner authorization required.',
    }, 403)
  }

  const { data, error } = await auth.db
    .from('ecommerce_razorpay_edit_requests')
    .insert({
      store_id: storeId,
      requester_user_id: auth.user.id,
      reason,
    })
    .select('id,status,created_at')
    .single()

  if (error?.code === '23505') {
    return reply({
      success: false,
      message: 'An access request is already pending.',
    }, 409)
  }

  if (error) {
    console.error(
      '[ECOMMERCE RAZORPAY ACCESS REQUEST]',
      error.message
    )

    return reply({
      success: false,
      message: 'Unable to submit access request.',
    }, 500)
  }

  return reply({
    success: true,
    request: data,
  }, 201)
}
