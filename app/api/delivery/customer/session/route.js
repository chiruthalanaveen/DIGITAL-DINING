// app/api/delivery/customer/session/route.js
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import {
  DELIVERY_MOBILE_SESSION_COOKIE,
  readDeliveryMobileSession,
} from '@/lib/server/deliveryCustomerMobileSession'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CODE = /^[A-Za-z0-9_-]{1,80}$/
const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' }
const response = (data, status = 200) => NextResponse.json(data, { status, headers })

export async function GET(request) {
  try {
    const code = String(new URL(request.url).searchParams.get('restaurantCode') || '').trim()
    if (!CODE.test(code)) return response({ success: false, code: 'STORE_REQUIRED' }, 400)
    const admin = getAdminSupabase()
    const { data: store, error } = await admin.from('restaurants')
      .select('id,restaurant_code').ilike('restaurant_code', code).maybeSingle()
    if (error) throw error
    if (!store?.id) return response({ success: false, code: 'STORE_NOT_FOUND' }, 404)
    const customer = await readDeliveryMobileSession(admin, request, store.id)
    if (!customer) return response({ success: false, code: 'NOT_SIGNED_IN' }, 401)
    return response({ success: true, accountType: 'mobile', restaurantCode: store.restaurant_code, customer })
  } catch (error) {
    console.error('[DELIVERY MOBILE SESSION GET]', error?.code || error?.message)
    return response({ success: false, code: 'SESSION_UNAVAILABLE' }, 503)
  }
}

export async function DELETE(request) {
  try {
    // Logout does not require an account ID or store ID supplied by browser.
    const rawToken = request.cookies.get(DELIVERY_MOBILE_SESSION_COOKIE)?.value || ''
    if (/^[a-f0-9]{64}$/i.test(rawToken)) {
      const { createHash } = await import('node:crypto')
      const admin = getAdminSupabase()
      const { error } = await admin.from('delivery_customer_sessions')
        .delete().eq('token_hash', createHash('sha256').update(rawToken).digest('hex'))
      if (error) throw error
    }
    const result = response({ success: true })
    result.cookies.set(DELIVERY_MOBILE_SESSION_COOKIE, '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/', maxAge: 0,
    })
    return result
  } catch (error) {
    console.error('[DELIVERY MOBILE SESSION LOGOUT]', error?.code || error?.message)
    return response({ success: false, message: 'Unable to sign out right now.' }, 503)
  }
}
