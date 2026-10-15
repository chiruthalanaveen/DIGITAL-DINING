// VS Code destination: app/api/delivery/customer/overview/route.js
// Customer-specific order overview for the /delivery Home / Orders / Account screens.
import 'server-only'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import {
  DELIVERY_MOBILE_SESSION_COOKIE,
  readDeliveryMobileSession,
} from '@/lib/server/deliveryCustomerMobileSession'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RAW_TOKEN = /^[a-f0-9]{64}$/i
const reply = (body, status = 200) => NextResponse.json(body, {
  status,
  headers: {
    'Cache-Control': 'private, no-store, max-age=0',
    'Vary': 'Cookie, Authorization',
    'X-Content-Type-Options': 'nosniff',
  },
})

async function accountFromRequest(admin, request, selection) {
  const cookie = String(request.cookies.get(DELIVERY_MOBILE_SESSION_COOKIE)?.value || '')
  // Use the existing, hashed HttpOnly session. Never trust an accountId,
  // phone number or restaurantId supplied in a client query/body.
  if (selection !== 'google' && RAW_TOKEN.test(cookie)) {
    const tokenHash = createHash('sha256').update(cookie).digest('hex')
    const { data: session, error } = await admin.from('delivery_customer_sessions')
      .select('restaurant_id')
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (error) throw error
    if (session?.restaurant_id) {
      const account = await readDeliveryMobileSession(admin, request, session.restaurant_id)
      if (account?.id) {
        return { kind: 'mobile', id: account.id, restaurantId: session.restaurant_id,
          name: account.name, mobile: account.mobile, email: account.email }
      }
    }
    // Do not silently switch to a different Google user after mobile expiry.
    return { error: 'Your Mobile/PIN session expired. Sign in again, or explicitly choose your Google account.' }
  }
  if (selection === 'mobile') return { error: 'No valid Mobile/PIN session was found. Sign in again.' }

  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('authorization') || '')
  if (!match) return null
  const { data, error } = await admin.auth.getUser(match[1])
  if (error || !data?.user?.id) return null
  const user = data.user
  return {
    kind: 'google', id: user.id,
    name: String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Customer'),
    email: String(user.email || ''),
    mobile: String(user.phone || user.user_metadata?.phone || '').replace(/\D/g, '').slice(-10),
    restaurantId: null,
  }
}

export async function GET(request) {
  try {
    const selection = String(new URL(request.url).searchParams.get('accountType') || 'auto').toLowerCase()
    if (!['auto', 'mobile', 'google'].includes(selection)) {
      return reply({ success: false, code: 'INVALID_ACCOUNT_TYPE' }, 400)
    }
    const admin = getAdminSupabase()
    const account = await accountFromRequest(admin, request, selection)
    if (account?.error) return reply({ success: false, code: 'SESSION_EXPIRED', message: account.error }, 401)
    if (!account) return reply({ success: false, code: 'NOT_SIGNED_IN', message: 'Sign in to view your Delivery account.' }, 401)

    // Header profile labels can be loaded without querying private order rows.
    if (new URL(request.url).searchParams.get('summaryOnly') === '1') {
      return reply({ success: true, accountType: account.kind, account: {
        name: account.name, email: account.email, mobile: account.mobile,
      }, orders: [] })
    }

    let query = admin.from('delivery_orders')
      .select('id,restaurant_id,order_code,order_number,order_status,payment_method,payment_status,total_amount,created_at,driver_id')
      .eq(account.kind === 'mobile' ? 'customer_id' : 'customer_user_id', account.id)
      .order('created_at', { ascending: false }).limit(80)
    if (account.kind === 'mobile') {
      // Mobile/PIN accounts are always scoped to their verified store.
      query = query.eq('restaurant_id', account.restaurantId)
    }
    const { data: orders, error: ordersError } = await query
    if (ordersError) throw ordersError

    const ids = [...new Set((orders || []).map(row => row.restaurant_id).filter(Boolean))]
    const storesById = new Map()
    // This list is derived only from verified account-linked order rows.
    if (account.restaurantId) ids.push(account.restaurantId)
    if (ids.length) {
      const { data: stores, error: storeError } = await admin.from('restaurants')
        .select('id,restaurant_code,name')
        .in('id', [...new Set(ids)])
      if (storeError) throw storeError
      for (const store of stores || []) storesById.set(store.id, store)
    }
    const homeStore = storesById.get(account.restaurantId) || null
    return reply({
      success: true,
      accountType: account.kind,
      account: {
        name: account.name,
        email: account.email,
        mobile: account.mobile,
        restaurantCode: homeStore?.restaurant_code || '',
        restaurantName: homeStore?.name || '',
      },
      orders: (orders || []).map(order => ({
        id: order.id,
        order_code: order.order_code,
        order_number: order.order_number,
        restaurant_code: storesById.get(order.restaurant_id)?.restaurant_code || '',
        restaurant_name: storesById.get(order.restaurant_id)?.name || 'Delivery store',
        order_status: order.order_status,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        total_amount: Number(order.total_amount || 0),
        created_at: order.created_at,
        driver_assigned: Boolean(order.driver_id),
      })),
    })
  } catch (error) {
    console.error('[DELIVERY ACCOUNT OVERVIEW]', error?.code || 'ERROR', error?.message)
    return reply({ success: false, code: 'OVERVIEW_UNAVAILABLE', message: 'Unable to load account details right now.' }, 503)
  }
}