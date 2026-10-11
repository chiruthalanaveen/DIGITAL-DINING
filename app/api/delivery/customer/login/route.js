import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COOKIE_NAME = 'dd_delivery_customer_session'

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null)

    const restaurantCode = String(
      body?.restaurantCode || ''
    ).trim()

    const mobile = String(body?.mobile || '')
      .replace(/\D/g, '')

    const pin = String(body?.pin || '').trim()

    if (
      !/^[A-Za-z0-9_-]{1,80}$/.test(restaurantCode) ||
      !/^[6-9]\d{9}$/.test(mobile) ||
      !/^\d{4}$/.test(pin)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'Enter a valid store code, mobile number and 4-digit PIN.',
        },
        { status: 400 }
      )
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL

    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration is missing')
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/delivery_customer_login`,
      {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_restaurant_code: restaurantCode,
          p_mobile: mobile,
          p_pin: pin,
          p_device_label: 'Digital Dine Delivery Web',
        }),
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      throw new Error('Customer authentication service unavailable')
    }

    const result = await response.json()

    if (!result?.success || !result?.session_token) {
      return NextResponse.json(
        {
          success: false,
          message: result?.message || 'Login failed.',
          code: result?.code || null,
        },
        { status: 401 }
      )
    }

    const output = NextResponse.json({
      success: true,
      customer: result.customer,
      expiresAt: result.expires_at,
    })

    output.cookies.set({
      name: COOKIE_NAME,
      value: result.session_token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/delivery/customer',
      maxAge: 60 * 60 * 24 * 30,
    })

    return output
  } catch (error) {
    console.error('Delivery customer login error:', error)

    return NextResponse.json(
      {
        success: false,
        message: 'Unable to sign in. Please try again.',
      },
      { status: 500 }
    )
  }
}