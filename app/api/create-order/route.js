import Razorpay from 'razorpay'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const PLANS = {
  restaurant_standard: {
    prices: {
      '1month': 799,
      '6months': 4315,
      '12months': 7670,
    },
  },

  restaurant_pro: {
    prices: {
      '1month': 1299,
      '6months': 7015,
      '12months': 12470,
    },
  },

  restaurant_resort_standard: {
    prices: {
      '1month': 1999,
      '6months': 10795,
      '12months': 19190,
    },
  },

  restaurant_resort_pro: {
    prices: {
      '1month': 199,
      '6months': 16195,
      '12months': 28790,
    },
  },
}

function getBearerToken(req) {
  const authorization =
    req.headers.get('authorization') || ''

  if (!authorization.startsWith('Bearer ')) {
    return ''
  }

  return authorization
    .slice(7)
    .trim()
}

export async function POST(req) {
  try {
    const body =
      await req.json().catch(() => ({}))

    const restaurantId = String(
      body.restaurantId || ''
    ).trim()

    const planCode = String(
      body.plan || body.planCode || ''
    ).trim()

    const billingCycle = String(
      body.billingCycle || ''
    ).trim()

    const selectedPlan =
      PLANS[planCode]

    if (!restaurantId) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Restaurant ID is missing.',
        },
        { status: 400 }
      )
    }

    if (!selectedPlan) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Invalid subscription plan.',
        },
        { status: 400 }
      )
    }

    const amountInRupees =
      selectedPlan.prices[billingCycle]

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

    const keyId =
      process.env.RAZORPAY_KEY_ID

    const keySecret =
      process.env.RAZORPAY_SECRET

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL

    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (
      !keyId ||
      !keySecret ||
      !supabaseUrl ||
      !anonKey
    ) {
      console.error(
        'Payment server configuration is incomplete.'
      )

      return NextResponse.json(
        {
          success: false,
          message:
            'Payment server configuration is incomplete.',
        },
        { status: 500 }
      )
    }

    // --------------------------------------------------
    // VERIFY LOGGED-IN RESTAURANT OWNER
    // --------------------------------------------------

    const accessToken =
      getBearerToken(req)

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Please sign in again.',
        },
        { status: 401 }
      )
    }

    const supabase =
      createClient(
        supabaseUrl,
        anonKey,
        {
          global: {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
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
    } =
      await supabase.auth.getUser(
        accessToken
      )

    const user =
      userData?.user

    if (
      userError ||
      !user
    ) {
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
    } =
      await supabase
        .from('restaurants')
        .select('id, owner_id')
        .eq(
          'id',
          restaurantId
        )
        .eq(
          'owner_id',
          user.id
        )
        .maybeSingle()

    if (
      restaurantError ||
      !restaurant
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'You are not authorized to subscribe for this restaurant.',
        },
        { status: 403 }
      )
    }

    // --------------------------------------------------
    // CREATE RAZORPAY ORDER
    // --------------------------------------------------

    const amountInPaise =
      Math.round(
        amountInRupees * 100
      )

    const razorpay =
      new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      })

    const order =
      await razorpay.orders.create({
        amount:
          amountInPaise,

        currency:
          'INR',

        receipt:
          `sub_${Date.now()}`,

        notes: {
          restaurant_id:
            restaurantId,

          plan_code:
            planCode,

          billing_cycle:
            billingCycle,

          owner_id:
            user.id,
        },
      })

    return NextResponse.json({
      success: true,

      order,

      orderId:
        order.id,

      amount:
        order.amount,

      currency:
        order.currency,

      keyId,
    })
  } catch (error) {
    console.error(
      'Razorpay ORDER CREATION FAILED:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        message:
          error?.error
            ?.description ||
          error?.message ||
          'Internal Server Error during order creation.',
      },

      { status: 500 }
    )
  }
}