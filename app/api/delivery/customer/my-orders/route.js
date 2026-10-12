import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase server configuration is missing.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const fail = (status, message) => NextResponse.json(
  { success: false, message },
  { status, headers: { 'Cache-Control': 'private, no-store' } }
)

function safeCode(value, max = 100) {
  const v = String(value || '').trim()
  return /^[A-Za-z0-9_-]+$/.test(v) && v.length <= max ? v : ''
}

async function authenticatedIdentity(admin, request, restaurantId) {
  // Verify Google/Supabase Auth using Supabase itself (never decode a JWT without verification).
  const accessToken = String(request.headers.get('authorization') || '')
    .match(/^Bearer\s+([^\s]+)$/i)?.[1] || ''
  if (accessToken) {
    const { data, error } = await admin.auth.getUser(accessToken)
    if (error || !data?.user?.id) return null
    return { kind: 'google', id: data.user.id, email: String(data.user.email || '') }
  }

  // Existing mobile+PIN accounts use 30-day, random 64-hex-character tokens
  // stored hashed in delivery_customer_sessions. The login API may have put
  // this token in an HttpOnly cookie. No mobile numbers or PINs are trusted.
  const cookies = request.cookies.getAll()
  const potentialTokens = cookies.map((cookie) => String(cookie.value || ''))
    .filter((v) => /^[a-f0-9]{64}$/i.test(v)).slice(0, 8)
  for (const raw of potentialTokens) {
    const tokenHash = createHash('sha256').update(raw).digest('hex')
    const { data: session, error } = await admin
      .from('delivery_customer_sessions')
      .select('customer_id, restaurant_id, expires_at')
      .eq('token_hash', tokenHash)
      .eq('restaurant_id', restaurantId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (!error && session?.customer_id) {
      return { kind: 'mobile', id: session.customer_id }
    }
  }
  return null
}

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const restaurantCode = safeCode(url.searchParams.get('restaurantCode'), 80)
    const selectedOrderCode = url.searchParams.get('orderCode')
      ? safeCode(url.searchParams.get('orderCode'), 100) : ''
    const details = url.searchParams.get('details') === '1'
    // Google accounts can see orders across ALL delivery stores.
    // Order detail requests remain limited to their specific store.
    const allStoresRequested = url.searchParams.get('allStores') === '1' && !details && !selectedOrderCode
    if (!restaurantCode || (url.searchParams.has('orderCode') && !selectedOrderCode)) {
      return fail(400, 'A valid delivery store and order code are required.')
    }

    const admin = adminClient()
    const { data: restaurant, error: restaurantError } = await admin
      .from('restaurants')
      .select('id')
      .ilike('restaurant_code', restaurantCode)
      .maybeSingle()
    if (restaurantError) throw restaurantError
    if (!restaurant?.id) return fail(404, 'Delivery store not found.')

    const identity = await authenticatedIdentity(admin, request, restaurant.id)
    if (!identity) return fail(401, 'Sign in to your delivery account to see your orders.')

    // A mobile/PIN login is store-scoped. Never expand it across other stores.
    const allStores = allStoresRequested && identity.kind === 'google'

    // Scope every query to the actual verified account ID, never a phone
    // number, email, or user ID supplied by the client.
    let query = admin.from('delivery_orders')
      .select('id, restaurant_id, order_code, order_number, customer_mobile, order_status, payment_status, payment_method, total_amount, created_at, driver_id')
      .eq(identity.kind === 'google' ? 'customer_user_id' : 'customer_id', identity.id)
      .order('created_at', { ascending: false })
      .limit(60)
    if (!allStores) query = query.eq('restaurant_id', restaurant.id)
    if (selectedOrderCode) query = query.eq('order_code', selectedOrderCode)
    const { data: rows, error: ordersError } = await query
    if (ordersError) throw ordersError

    // Look up the verified account's order store codes, so each order links
    // to the correct store-specific tracking URL. Never trust client store IDs.
    const storeInfo = new Map()
    const restaurantIds = [...new Set((rows || []).map((row) => row.restaurant_id).filter(Boolean))]
    if (restaurantIds.length) {
      const { data: stores, error: storesError } = await admin.from('restaurants')
        .select('id, restaurant_code, name')
        .in('id', restaurantIds)
      if (storesError) throw storesError
      for (const store of (stores || [])) {
        storeInfo.set(store.id, {
          code: String(store.restaurant_code || ''),
          name: String(store.name || ''),
        })
      }
    }

    // Helpful empty-state diagnostic: maybe the signed-in customer ordered
    // under a different store. Check only the verified account ID.
    let ownOrdersInOtherStores = 0
    if (!rows?.length && !selectedOrderCode && !allStores) {
      const { count, error: countError } = await admin
        .from('delivery_orders')
        .select('id', { count: 'exact', head: true })
        .eq(identity.kind === 'google' ? 'customer_user_id' : 'customer_id', identity.id)
        .neq('restaurant_id', restaurant.id)
      if (countError) {
        console.warn('[MY ORDERS] Cross-store count unavailable:', countError.message)
      } else {
        ownOrdersInOtherStores = Number(count || 0)
      }
    }

    // The store's order list never needs the phone number.
    if (!details) return NextResponse.json({
      success: true,
      accountType: identity.kind,
      accountEmail: identity.kind === 'google' ? identity.email : '',
      allStores,
      otherStoreOrderCount: ownOrdersInOtherStores,
      orders: (rows || []).map((row) => ({
        id: row.id,
        order_code: row.order_code,
        order_number: row.order_number,
        restaurant_code: storeInfo.get(row.restaurant_id)?.code || restaurantCode,
        restaurant_name: storeInfo.get(row.restaurant_id)?.name || '',
        order_status: row.order_status,
        payment_status: row.payment_status,
        payment_method: row.payment_method,
        total_amount: Number(row.total_amount || 0),
        created_at: row.created_at,
        driver_assigned: Boolean(row.driver_id),
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })

    // Reuse the EXISTING order-detail RPC and its live driver status fields.
    // Only request detail for orders we already proved this account owns.
    const result = await Promise.all((rows || []).map(async (row) => {
      const mobile = String(row.customer_mobile || '').replace(/\D/g, '').slice(0, 10)
      if (!/^[0-9]{10}$/.test(mobile)) return null
      const { data, error } = await admin.rpc('get_public_delivery_order', {
        p_restaurant_code: restaurantCode,
        p_order_code: row.order_code,
        p_customer_mobile: mobile,
      })
      if (error || !data?.success || !data?.order) return null
      // Protect against an unexpected mismatch in the existing RPC.
      if (String(data.order.order_code) !== String(row.order_code)) return null
      return data.order
    }))
    return NextResponse.json({
      success: true,
      accountType: identity.kind,
      orders: result.filter(Boolean),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[DELIVERY MY ORDERS]', error)
    return fail(500, 'Unable to load account orders right now.')
  }
}
