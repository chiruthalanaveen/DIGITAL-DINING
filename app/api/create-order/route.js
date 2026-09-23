import Razorpay from 'razorpay'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ==========================================================
// DIGITAL DINING SUBSCRIPTION PLANS
// IMPORTANT:
// Prices are defined on the SERVER.
// Never trust a payment amount sent by the browser.
// ==========================================================

const PLANS = {
  restaurant_standard: {
    name: 'Restaurant Standard',
    prices: {
      '1month': 799,
      '6months': 4315,
      '12months': 7670,
    },
  },

  restaurant_pro: {
    name: 'Restaurant Pro',
    prices: {
      '1month': 1299,
      '6months': 7015,
      '12months': 12470,
    },
  },

  restaurant_resort_standard: {
    name: 'Restaurant + Resort Standard',
    prices: {
      '1month': 1999,
      '6months': 10795,
      '12months': 19190,
    },
  },

  restaurant_resort_pro: {
    name: 'Restaurant + Resort Pro',
    prices: {
      '1month': 2999,
      '6months': 16195,
      '12months': 28790,
    },
  },
}

// ==========================================================
// GET BEARER TOKEN
// ==========================================================

function getBearerToken(req) {
  const authorization =
    req.headers.get('authorization') || ''

  if (!authorization.startsWith('Bearer ')) {
    return ''
  }

  return authorization.slice(7).trim()
}

// ==========================================================
// CREATE RAZORPAY ORDER
// ==========================================================

export async function POST(req) {
  try {
    // ------------------------------------------------------
    // READ REQUEST
    // ------------------------------------------------------

    const body =
      await req.json().catch(() => ({}))

    const restaurantId = String(
      body.restaurantId || ''
    ).trim()

    const planCode = String(
      body.plan ||
      body.planCode ||
      ''
    ).trim()

    const billingCycle = String(
      body.billingCycle || ''
    ).trim()

    // ------------------------------------------------------
    // BASIC VALIDATION
    // ------------------------------------------------------

    if (!restaurantId) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Restaurant ID is missing.',
        },
        {
          status: 400,
        }
      )
    }

    const selectedPlan =
      PLANS[planCode]

    if (!selectedPlan) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Invalid subscription plan.',
        },
        {
          status: 400,
        }
      )
    }

    const amountInRupees =
      selectedPlan.prices[
        billingCycle
      ]

    if (
      !Number.isFinite(
        amountInRupees
      ) ||
      amountInRupees <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Invalid subscription billing cycle or amount.',
        },
        {
          status: 400,
        }
      )
    }

    // ------------------------------------------------------
    // SERVER ENVIRONMENT VARIABLES
    // ------------------------------------------------------

    const keyId =
      process.env
        .RAZORPAY_KEY_ID

    const keySecret =
      process.env
        .RAZORPAY_SECRET

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL

    const anonKey =
      process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY

    // ------------------------------------------------------
    // CONFIGURATION CHECK
    //
    // This intentionally returns only missing VARIABLE NAMES.
    // It never exposes secret values.
    // ------------------------------------------------------

    const missingConfig = []

    if (!keyId) {
      missingConfig.push(
        'RAZORPAY_KEY_ID'
      )
    }

    if (!keySecret) {
      missingConfig.push(
        'RAZORPAY_SECRET'
      )
    }

    if (!supabaseUrl) {
      missingConfig.push(
        'NEXT_PUBLIC_SUPABASE_URL'
      )
    }

    if (!anonKey) {
      missingConfig.push(
        'NEXT_PUBLIC_SUPABASE_ANON_KEY'
      )
    }

    if (
      missingConfig.length > 0
    ) {
      console.error(
        'Payment server configuration missing:',
        missingConfig
      )

      return NextResponse.json(
        {
          success: false,

          message:
            `Payment server configuration is incomplete. Missing: ${missingConfig.join(', ')}`,
        },
        {
          status: 500,
        }
      )
    }

    // ------------------------------------------------------
    // GET LOGIN TOKEN
    // ------------------------------------------------------

    const accessToken =
      getBearerToken(req)

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Please sign in again.',
        },
        {
          status: 401,
        }
      )
    }

    // ------------------------------------------------------
    // CREATE AUTHENTICATED SUPABASE CLIENT
    // ------------------------------------------------------

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

    // ------------------------------------------------------
    // VERIFY AUTHENTICATED USER
    // ------------------------------------------------------

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
        {
          status: 401,
        }
      )
    }

    // ------------------------------------------------------
    // VERIFY RESTAURANT OWNERSHIP
    // ------------------------------------------------------

    const {
      data: restaurant,
      error: restaurantError,
    } =
      await supabase
        .from('restaurants')
        .select(
          'id, owner_id, name'
        )
        .eq(
          'id',
          restaurantId
        )
        .eq(
          'owner_id',
          user.id
        )
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
        {
          status: 500,
        }
      )
    }

    if (!restaurant) {
      return NextResponse.json(
        {
          success: false,
          message:
            'You are not authorized to subscribe for this restaurant.',
        },
        {
          status: 403,
        }
      )
    }

    // ------------------------------------------------------
    // CONVERT RUPEES TO PAISE
    // ------------------------------------------------------

    const amountInPaise =
      Math.round(
        amountInRupees * 100
      )

    if (
      !Number.isInteger(
        amountInPaise
      ) ||
      amountInPaise <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Calculated Razorpay amount is invalid.',
        },
        {
          status: 400,
        }
      )
    }

    // ------------------------------------------------------
    // INITIALIZE RAZORPAY
    // ------------------------------------------------------

    const razorpay =
      new Razorpay({
        key_id:
          keyId,

        key_secret:
          keySecret,
      })

    // ------------------------------------------------------
    // CREATE RAZORPAY ORDER
    // ------------------------------------------------------

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

          restaurant_name:
            String(
              restaurant.name || ''
            ).slice(0, 200),

          plan_code:
            planCode,

          plan_name:
            selectedPlan.name,

          billing_cycle:
            billingCycle,

          owner_id:
            user.id,

          amount_rupees:
            String(
              amountInRupees
            ),
        },
      })

    if (
      !order ||
      !order.id
    ) {
      throw new Error(
        'Razorpay did not return a valid order.'
      )
    }

    // ------------------------------------------------------
    // SUCCESS
    // ------------------------------------------------------

    return NextResponse.json({
      success: true,

      order,

      orderId:
        order.id,

      amount:
        order.amount,

      currency:
        order.currency,

      // Key ID is safe to expose to Razorpay Checkout.
      // Never return keySecret.
      keyId,
    })
  } catch (error) {
    console.error(
      'Razorpay ORDER CREATION FAILED:',
      error
    )

    const razorpayMessage =
      error?.error
        ?.description ||
      error?.description ||
      error?.message ||
      'Internal Server Error during order creation.'

    return NextResponse.json(
      {
        success: false,
        message:
          razorpayMessage,
      },
      {
        status: 500,
      }
    )
  }
}