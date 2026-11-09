import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function respond(body, status = 200) {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'no-store, private')
  return response
}

function clients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase server environment is incomplete.')
  const opts = { auth: { persistSession: false, autoRefreshToken: false } }
  return { auth: createClient(url, anonKey, opts), admin: createClient(url, serviceKey, opts) }
}

async function ownerContext(request, restaurantId) {
  if (!UUID.test(restaurantId)) return { error: respond({ success: false, message: 'Invalid restaurant.' }, 400) }
  const bearer = String(request.headers.get('authorization') || '')
  const token = bearer.toLowerCase().startsWith('bearer ') ? bearer.slice(7).trim() : ''
  if (!token) return { error: respond({ success: false, message: 'Owner sign-in required.' }, 401) }
  const { auth, admin } = clients()
  const { data: { user } = {}, error: authError } = await auth.auth.getUser(token)
  if (authError || !user) return { error: respond({ success: false, message: 'Owner session expired.' }, 401) }
  const { data: restaurant, error } = await admin.from('restaurants')
    .select('id,owner_id,approval_status').eq('id', restaurantId).maybeSingle()
  if (error) throw error
  if (!restaurant || String(restaurant.owner_id) !== String(user.id) || restaurant.approval_status !== 'approved') {
    return { error: respond({ success: false, message: 'You cannot manage this restaurant.' }, 403) }
  }
  return { admin, user }
}

export async function GET(request) {
  try {
    const restaurantId = new URL(request.url).searchParams.get('restaurantId') || ''
    const ctx = await ownerContext(request, restaurantId)
    if (ctx.error) return ctx.error
    const { data, error } = await ctx.admin.rpc('dd_list_failed_returns_core', { p_restaurant_id: restaurantId })
    if (error) throw error
    return respond(data)
  } catch (error) {
    console.error('[FAILED RETURN GET]', error?.code || error?.message)
    return respond({ success: false, message: 'Unable to load returned orders.' }, 503)
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const restaurantId = String(body.restaurantId || '')
    const orderId = String(body.orderId || '')
    if (!UUID.test(orderId)) return respond({ success: false, message: 'Invalid order.' }, 400)
    const ctx = await ownerContext(request, restaurantId)
    if (ctx.error) return ctx.error
    const { data, error } = await ctx.admin.rpc('dd_confirm_failed_return_core', {
      p_restaurant_id: restaurantId,
      p_order_id: orderId,
      p_actor: `owner:${ctx.user.id}`,
    })
    if (error) throw error
    return respond(data, data?.success ? 200 : 409)
  } catch (error) {
    console.error('[FAILED RETURN POST]', error?.code || error?.message)
    return respond({ success: false, message: 'Unable to confirm returned items.' }, 503)
  }
}