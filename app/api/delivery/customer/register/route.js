import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CUSTOMER_COOKIE = 'digitaldine_delivery_customer_session'
const SECONDS_30_DAYS = 30 * 24 * 60 * 60
const SAFE_STORE_CODE = /^[A-Za-z0-9_-]{1,80}$/

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Pragma': 'no-cache',
      'Vary': 'Authorization',
    },
  })
}

export async function POST(request) {
  try {
    const authorization = String(request.headers.get('authorization') || '')
    const accessToken = authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1] || ''
    if (!accessToken) {
      return respond({ success: false, message: 'Verify your mobile number by OTP before registering.' }, 401)
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return respond({ success: false, message: 'Invalid registration details.' }, 400)
    }

    const restaurantCode = String(body.restaurantCode || '').trim()
    const name = String(body.name || '').trim().replace(/[<>]/g, '')
    const mobile = String(body.mobile || '').replace(/\D/g, '')
    const pin = String(body.pin || '')

    if (!SAFE_STORE_CODE.test(restaurantCode)) {
      return respond({ success: false, message: 'Select a valid delivery store.' }, 400)
    }
    if (name.length < 2 || name.length > 100) {
      return respond({ success: false, message: 'Enter a name between 2 and 100 characters.' }, 400)
    }
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return respond({ success: false, message: 'Enter a valid 10-digit Indian mobile number.' }, 400)
    }
    if (!/^\d{4}$/.test(pin)) {
      return respond({ success: false, message: 'Create a valid 4-digit PIN.' }, 400)
    }

    const admin = getAdminSupabase()
    // getUser(token) makes a server-side request to Supabase Auth. Never trust
    // a phone number or a user id supplied by the browser on its own.
    const { data: verified, error: authError } = await admin.auth.getUser(accessToken)
    const user = verified?.user
    const verifiedPhone = String(user?.phone || '').replace(/\D/g, '')

    if (authError || !user?.id || !user.phone_confirmed_at || verifiedPhone !== `91${mobile}`) {
      return respond({ success: false, message: 'Mobile verification is missing or does not match. Request a new OTP.' }, 401)
    }

    // This DB function is accessible ONLY to service_role after the security SQL.
    // It already checks the delivery plan and creates a bcrypt/crypt PIN hash,
    // a hashed recovery code, and a hashed 30-day session token.
    const { data: registration, error: rpcError } = await admin.rpc('delivery_customer_register', {
      p_restaurant_code: restaurantCode,
      p_name: name,
      p_mobile: mobile,
      p_pin: pin,
      p_device_label: 'Delivery mobile signup (verified SMS)',
    })

    if (rpcError) {
      console.error('[DELIVERY VERIFIED REGISTER] RPC error:', rpcError.code)
      return respond({ success: false, message: 'Registration could not be completed. Try again or contact support.' }, 500)
    }
    if (registration?.success !== true) {
      const knownExists = registration?.code === 'ACCOUNT_EXISTS'
      return respond({
        success: false,
        code: knownExists ? 'ACCOUNT_EXISTS' : 'REGISTRATION_UNAVAILABLE',
        message: knownExists
          ? 'An account already exists for this mobile at this store. Please sign in.'
          : (registration?.message || 'Unable to create your delivery account.'),
      }, knownExists ? 409 : 400)
    }

    const rawToken = String(registration.session_token || '')
    const recoveryCode = String(registration.recovery_code || '')
    if (!/^[0-9a-f]{64}$/i.test(rawToken) || !/^DD-[A-Za-z0-9]{12}$/.test(recoveryCode)) {
      // The account might already exist. Do not call the RPC again blindly.
      console.error('[DELIVERY VERIFIED REGISTER] RPC returned an incomplete session or recovery code')
      return respond({
        success: false,
        message: 'Account was created, but session setup needs support. Do not register again.',
      }, 500)
    }

    const response = respond({
      success: true,
      recoveryCode,
      customer: {
        id: registration?.customer?.id || null,
        name: registration?.customer?.name || name,
        mobile: registration?.customer?.mobile || mobile,
      },
      message: 'Your verified mobile account was created successfully.',
    })
    response.cookies.set(CUSTOMER_COOKIE, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SECONDS_30_DAYS,
    })
    return response
  } catch (error) {
    console.error('[DELIVERY VERIFIED REGISTER]', error?.message || error)
    return respond({
      success: false,
      message: 'Unable to register right now. Try again or contact support.',
    }, 500)
  }
}
