import Razorpay from 'razorpay'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { callSubscriptionLedger, assertCheckoutBinding, isSubscriptionCheckoutId, requirePaidSubscriptionCheckout, SubscriptionLedgerError } from '@/lib/server/subscriptionLedger'

export const runtime = 'nodejs'

// ==========================================================
// DIGITAL DINING - FINAL FIVE SUBSCRIPTION PLANS
// Prices are authoritative on the SERVER.
// Never trust a subscription amount supplied by the browser.
// ==========================================================

const PLANS = {
  restaurant_pro: {
    name: 'Restaurant',
    prices: {
      '1month': 1499,
      '6months': 8095,
      '12months': 14390,
    },
  },

  delivery: {
    name: 'Delivery',
    prices: {
      '1month': 1499,
      '6months': 8095,
      '12months': 14390,
    },
  },

  restaurant_resort_pro: {
    name: 'Restaurant + Resort',
    prices: {
      '1month': 2999,
      '6months': 16195,
      '12months': 28790,
    },
  },

  restaurant_delivery: {
    name: 'Restaurant + Delivery',
    prices: {
      '1month': 2999,
      '6months': 16195,
      '12months': 28790,
    },
  },

  restaurant_resort_delivery: {
    name: 'Restaurant + Resort + Delivery',
    prices: {
      '1month': 3999,
      '6months': 21595,
      '12months': 38390,
    },
  },
}

function getBearerToken(req) {
  const authorization = req.headers.get('authorization') || ''

  if (!authorization.startsWith('Bearer ')) {
    return ''
  }

  return authorization.slice(7).trim()
}

function getPlatformRazorpayConfig() {
  const keyId =
    process.env.PLATFORM_RAZORPAY_KEY_ID ||
    process.env.RAZORPAY_KEY_ID ||
    ''

  const keySecret =
    process.env.PLATFORM_RAZORPAY_KEY_SECRET ||
    process.env.RAZORPAY_KEY_SECRET ||
    process.env.RAZORPAY_SECRET ||
    ''

  return {
    keyId: String(keyId).trim(),
    keySecret: String(keySecret).trim(),
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))

    const restaurantId = String(body.restaurantId || '').trim().toLowerCase()
    const planCode = String(body.plan || body.planCode || '')
      .trim()
      .toLowerCase()
    const billingCycle = String(body.billingCycle || '').trim()

    if (!restaurantId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Restaurant ID is missing.',
        },
        { status: 400 }
      )
    }

    if (!isSubscriptionCheckoutId(restaurantId)) {
      return NextResponse.json({ success: false, message: 'A valid restaurant ID is required.' }, { status: 400 })
    }

    const selectedPlan = PLANS[planCode]

    if (!selectedPlan) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid subscription plan.',
        },
        { status: 400 }
      )
    }

    const amountInRupees = selectedPlan.prices[billingCycle]

    if (
      !Number.isFinite(amountInRupees) ||
      amountInRupees <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Invalid subscription billing cycle or amount.',
        },
        { status: 400 }
      )
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    const { keyId, keySecret } =
      getPlatformRazorpayConfig()

    const missingConfig = []

    if (!keyId) {
      missingConfig.push(
        'PLATFORM_RAZORPAY_KEY_ID or RAZORPAY_KEY_ID'
      )
    }

    if (!keySecret) {
      missingConfig.push(
        'PLATFORM_RAZORPAY_KEY_SECRET, RAZORPAY_KEY_SECRET or RAZORPAY_SECRET'
      )
    }

    if (!supabaseUrl) {
      missingConfig.push('NEXT_PUBLIC_SUPABASE_URL')
    }

    if (!anonKey) {
      missingConfig.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    }

    if (!serviceRoleKey) missingConfig.push('SUPABASE_SERVICE_ROLE_KEY')

    if (missingConfig.length > 0) {
      console.error(
        'Subscription payment server configuration missing:',
        missingConfig
      )

      return NextResponse.json(
        {
          success: false,
          message:
            `Payment server configuration is incomplete. Missing: ${missingConfig.join(', ')}`,
        },
        { status: 500 }
      )
    }

    const accessToken = getBearerToken(req)

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          message: 'Please sign in again.',
        },
        { status: 401 }
      )
    }

    const supabase = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    const {
      data: userData,
      error: userError,
    } = await supabase.auth.getUser(accessToken)

    const user = userData?.user

    if (userError || !user) {
      console.error(
        'Subscription authentication failed:',
        userError?.message
      )

      return NextResponse.json(
        {
          success: false,
          message:
            'Your login session is invalid or expired.',
        },
        { status: 401 }
      )
    }

    const {
      data: restaurant,
      error: restaurantError,
    } = await supabase
      .from('restaurants')
      .select('id, owner_id, name, approval_status')
      .eq('id', restaurantId)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (restaurantError) {
      console.error(
        'Restaurant ownership lookup failed:',
        restaurantError.message
      )

      return NextResponse.json(
        {
          success: false,
          message:
            'Unable to verify restaurant ownership.',
        },
        { status: 500 }
      )
    }

    if (!restaurant) {
      return NextResponse.json(
        {
          success: false,
          message:
            'You are not authorized to subscribe for this restaurant.',
        },
        { status: 403 }
      )
    }

    if (String(restaurant.approval_status || 'pending').trim().toLowerCase() !== 'approved') {
      return NextResponse.json(
        {
          success: false,
          code: 'OWNER_APPROVAL_REQUIRED',
          message: 'Super Admin approval is required before subscribing for this restaurant.',
        },
        { status: 403 }
      )
    }

    requirePaidSubscriptionCheckout()

    const amountInPaise = Math.round(
      amountInRupees * 100
    )

    if (
      !Number.isInteger(amountInPaise) ||
      amountInPaise <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Calculated Razorpay amount is invalid.',
        },
        { status: 400 }
      )
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const checkoutId = crypto.randomUUID()
    const expectedCheckout = { checkoutId, restaurantId, ownerId: user.id, planCode, billingCycle, amountPaise: amountInPaise, keyId }
    const opened = await callSubscriptionLedger(admin, 'subscription_open_checkout', {
      p_checkout_id: checkoutId, p_restaurant_id: restaurantId, p_owner_id: user.id,
      p_plan_code: planCode, p_billing_cycle: billingCycle, p_amount_paise: amountInPaise,
      p_currency: 'INR', p_provider_key_id: keyId,
    })
    assertCheckoutBinding(opened, expectedCheckout)

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    })

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `sub_${Date.now()}`,
      notes: {
        restaurant_id: restaurantId,
        restaurant_name: String(
          restaurant.name || ''
        ).slice(0, 200),
        plan_code: planCode,
        plan_name: selectedPlan.name,
        billing_cycle: billingCycle,
        owner_id: user.id,
        amount_rupees: String(amountInRupees),
        checkout_id: checkoutId,
      },
    })

    if (typeof order?.id !== 'string' || !order.id ||
        Number(order.amount) !== amountInPaise || order.currency !== 'INR') {
      throw new Error(
        'Razorpay did not return a valid order.'
      )
    }

    const bound = await callSubscriptionLedger(admin, 'subscription_bind_checkout', {
      p_checkout_id: checkoutId, p_restaurant_id: restaurantId, p_owner_id: user.id,
      p_provider_order_id: order.id,
    })
    assertCheckoutBinding(bound, { ...expectedCheckout, orderId: order.id })

    return NextResponse.json({
      success: true,
      order,
      orderId: order.id,
      checkoutId,
      amount: order.amount,
      currency: order.currency,
      // Safe to expose Key ID to Razorpay Checkout.
      // Never return the secret.
      keyId,
      planCode,
      billingCycle,
      planName: selectedPlan.name,
    })
  } catch (error) {
    if (error instanceof SubscriptionLedgerError) {
      return NextResponse.json({ success: false, code: error.code, message: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } })
    }
    console.error('Subscription checkout creation failed.', { code: error?.code || error?.name || 'unknown' })

    return NextResponse.json(
      {
        success: false,
        message: 'Unable to prepare subscription checkout. Please try again later. If you already paid, do not pay again; contact support.',
      },
      { status: 500 }
    )
  }
}
