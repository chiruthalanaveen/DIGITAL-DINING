// app/api/delivery/customer/login/route.js
// Replace your login API only if it doesn't set the HttpOnly customer cookie.
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import {
  enforceSignupThrottle, validStoreCode, cleanMobile, validMobile, validPin,
} from '@/lib/server/deliveryCustomerSignupSecurity'
import {
  DELIVERY_MOBILE_SESSION_COOKIE, DELIVERY_MOBILE_SESSION_TTL,
} from '@/lib/server/deliveryCustomerMobileSession'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const reply = (data, status = 200) => NextResponse.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store' },
})

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null)
    const restaurantCode = String(body?.restaurantCode || '').trim()
    const mobile = cleanMobile(body?.mobile)
    const pin = String(body?.pin || '')
    if (!validStoreCode(restaurantCode) || !validMobile(mobile) || !validPin(pin)) {
      return reply({ success: false, message: 'Enter a valid store, mobile number and four-digit PIN.' }, 400)
    }
    // Extra server-side rate limit; database login RPC still applies its own PIN lockout.
    if (!(await enforceSignupThrottle(request, 'mobile-login', restaurantCode, mobile, 10))) {
      return reply({ success: false, code: 'LOGIN_RATE_LIMIT', message: 'Too many attempts. Try again later.' }, 429)
    }
    const admin = getAdminSupabase()
    const { data, error } = await admin.rpc('delivery_customer_login', {
      p_restaurant_code: restaurantCode,
      p_mobile: mobile,
      p_pin: pin,
      p_device_label: 'Digital Dine-In delivery web login',
    })
    if (error) {
      console.error('[DELIVERY MOBILE LOGIN RPC]', error.code || error.message)
      return reply({ success: false, code: 'LOGIN_UNAVAILABLE', message: 'Unable to sign in right now.' }, 503)
    }
    if (data?.success !== true) {
      return reply({ success: false, code: data?.code || 'INVALID_CREDENTIALS', message: data?.message || 'Invalid mobile number or PIN.' }, 401)
    }
    const rawToken = String(data.session_token || '')
    if (!/^[a-f0-9]{64}$/i.test(rawToken)) {
      console.error('[DELIVERY MOBILE LOGIN] RPC returned no valid session token')
      return reply({ success: false, code: 'SESSION_MISSING', message: 'Session could not be created. Contact support.' }, 503)
    }
    const result = reply({ success: true, accountType: 'mobile', message: 'Signed in successfully.' })
    result.cookies.set(DELIVERY_MOBILE_SESSION_COOKIE, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: DELIVERY_MOBILE_SESSION_TTL,
    })
    return result
  } catch (error) {
    console.error('[DELIVERY MOBILE LOGIN]', error?.code || error?.message)
    return reply({ success: false, code: 'LOGIN_UNAVAILABLE', message: 'Unable to sign in right now.' }, 503)
  }
}
