import crypto from 'crypto'
import Razorpay from 'razorpay'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const PLANS = {
  restaurant_standard: {
    legacyPlan: 'Standard',
    businessType: 'restaurant',
    resortEnabled: false,

    prices: {
      '1month': 799,
      '6months': 4315,
      '12months': 7670,
    },
  },

  restaurant_pro: {
    legacyPlan: 'Pro',
    businessType: 'restaurant',
    resortEnabled: false,

    prices: {
      '1month': 1299,
      '6months': 7015,
      '12months': 12470,
    },
  },

  restaurant_resort_standard: {
    legacyPlan: 'Standard',
    businessType:
      'restaurant_resort',

    resortEnabled: true,

    prices: {
      '1month': 1999,
      '6months': 10795,
      '12months': 19190,
    },
  },

  restaurant_resort_pro: {
    legacyPlan: 'Pro+',
    businessType:
      'restaurant_resort',

    resortEnabled: true,

    prices: {
      '1month': 199,
      '6months': 16195,
      '12months': 28790,
    },
  },
}

function getBearerToken(req) {
  const authorization =
    req.headers.get(
      'authorization'
    ) || ''

  if (
    !authorization.startsWith(
      'Bearer '
    )
  ) {
    return ''
  }

  return authorization
    .slice(7)
    .trim()
}

function getExpiry(
  billingCycle,
  isTrial = false
) {
  const expiry =
    new Date()

  if (isTrial) {
    expiry.setDate(
      expiry.getDate() + 14
    )

    return expiry
  }

  if (
    billingCycle ===
    '1month'
  ) {
    expiry.setMonth(
      expiry.getMonth() + 1
    )
  } else if (
    billingCycle ===
    '6months'
  ) {
    expiry.setMonth(
      expiry.getMonth() + 6
    )
  } else if (
    billingCycle ===
    '12months'
  ) {
    expiry.setFullYear(
      expiry.getFullYear() + 1
    )
  } else {
    throw new Error(
      'Invalid billing cycle.'
    )
  }

  return expiry
}

function safeEqual(
  first,
  second
) {
  const a =
    Buffer.from(
      String(first || '')
    )

  const b =
    Buffer.from(
      String(second || '')
    )

  if (
    a.length !== b.length
  ) {
    return false
  }

  return crypto.timingSafeEqual(
    a,
    b
  )
}

export async function POST(req) {
  try {
    const body =
      await req.json().catch(
        () => ({})
      )

    const restaurantId =
      String(
        body.restaurantId || ''
      ).trim()

    const mode =
      body.mode === 'trial'
        ? 'trial'
        : 'payment'

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

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL

    const anonKey =
      process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY

    const serviceRoleKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY

    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceRoleKey
    ) {
      console.error(
        'Supabase subscription configuration is incomplete.'
      )

      return NextResponse.json(
        {
          success: false,
          message:
            'Subscription database configuration is incomplete.',
        },
        { status: 500 }
      )
    }

    // --------------------------------------------------
    // VERIFY LOGGED-IN USER
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

    const userClient =
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
      await userClient.auth.getUser(
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

    // --------------------------------------------------
    // SERVER ADMIN CLIENT
    // --------------------------------------------------

    const admin =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      )

    // --------------------------------------------------
    // VERIFY RESTAURANT OWNER
    // --------------------------------------------------

    const {
      data: restaurant,
      error: restaurantError,
    } =
      await admin
        .from('restaurants')
        .select(
          'id, owner_id'
        )
        .eq(
          'id',
          restaurantId
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
            'Restaurant was not found.',
        },
        { status: 404 }
      )
    }

    if (
      String(
        restaurant.owner_id
      ) !==
      String(user.id)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'You are not authorized to update this restaurant.',
        },
        { status: 403 }
      )
    }

    let planCode = ''
    let billingCycle = ''
    let isTrial = false

    // ==================================================
    // FREE TRIAL
    // ==================================================

    if (mode === 'trial') {
      const trialPasscode =
        String(
          body.trialPasscode ||
            ''
        )

      const configuredPasscode =
        process.env
          .SUBSCRIPTION_TRIAL_PASSCODE ||
        'Naveen@2007'

      if (
        !safeEqual(
          trialPasscode,
          configuredPasscode
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Invalid trial coupon code.',
          },
          { status: 400 }
        )
      }

      // Preserve existing behavior:
      // 14-day Restaurant Pro trial.

      planCode =
        'restaurant_pro'

      billingCycle =
        '14days'

      isTrial = true
    }

    // ==================================================
    // PAID SUBSCRIPTION
    // ==================================================

    else {
      const requestedPlanCode =
        String(
          body.planCode || ''
        ).trim()

      const requestedBillingCycle =
        String(
          body.billingCycle || ''
        ).trim()

      const razorpayOrderId =
        String(
          body.razorpay_order_id ||
            ''
        ).trim()

      const razorpayPaymentId =
        String(
          body.razorpay_payment_id ||
            ''
        ).trim()

      const razorpaySignature =
        String(
          body.razorpay_signature ||
            ''
        ).trim()

      const keyId =
        process.env
          .RAZORPAY_KEY_ID

      const keySecret =
        process.env
          .RAZORPAY_SECRET

      if (
        !keyId ||
        !keySecret
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Razorpay configuration is missing.',
          },
          { status: 500 }
        )
      }

      if (
        !razorpayOrderId ||
        !razorpayPaymentId ||
        !razorpaySignature
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Payment verification details are missing.',
          },
          { status: 400 }
        )
      }

      // ----------------------------------------------
      // VERIFY RAZORPAY SIGNATURE
      // ----------------------------------------------

      const expectedSignature =
        crypto
          .createHmac(
            'sha256',
            keySecret
          )
          .update(
            `${razorpayOrderId}|${razorpayPaymentId}`
          )
          .digest('hex')

      if (
        !safeEqual(
          expectedSignature,
          razorpaySignature
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Payment signature verification failed.',
          },
          { status: 400 }
        )
      }

      // ----------------------------------------------
      // FETCH ORDER + PAYMENT FROM RAZORPAY
      // ----------------------------------------------

      const razorpay =
        new Razorpay({
          key_id: keyId,
          key_secret:
            keySecret,
        })

      const order =
        await razorpay.orders.fetch(
          razorpayOrderId
        )

      const payment =
        await razorpay.payments.fetch(
          razorpayPaymentId
        )

      const orderRestaurantId =
        String(
          order?.notes
            ?.restaurant_id ||
            ''
        )

      const orderPlanCode =
        String(
          order?.notes
            ?.plan_code ||
            ''
        )

      const orderBillingCycle =
        String(
          order?.notes
            ?.billing_cycle ||
            ''
        )

      const orderOwnerId =
        String(
          order?.notes
            ?.owner_id ||
            ''
        )

      if (
        orderRestaurantId !==
          restaurantId ||
        orderOwnerId !==
          String(user.id) ||
        orderPlanCode !==
          requestedPlanCode ||
        orderBillingCycle !==
          requestedBillingCycle
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Payment order does not match this subscription.',
          },
          { status: 400 }
        )
      }

      const selectedPlan =
        PLANS[orderPlanCode]

      if (
        !selectedPlan ||
        !selectedPlan.prices[
          orderBillingCycle
        ]
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Invalid subscription stored on payment order.',
          },
          { status: 400 }
        )
      }

      const expectedAmount =
        selectedPlan.prices[
          orderBillingCycle
        ] * 100

      if (
        Number(order.amount) !==
          expectedAmount ||
        String(
          order.currency
        ) !== 'INR' ||
        String(
          payment.order_id
        ) !==
          razorpayOrderId ||
        Number(
          payment.amount
        ) !==
          expectedAmount ||
        String(
          payment.currency
        ) !== 'INR'
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Payment amount verification failed.',
          },
          { status: 400 }
        )
      }

      const paymentStatus =
        String(
          payment.status || ''
        )

      if (
        ![
          'authorized',
          'captured',
        ].includes(
          paymentStatus
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              `Payment is not successful. Razorpay status: ${paymentStatus}`,
          },
          { status: 400 }
        )
      }

      planCode =
        orderPlanCode

      billingCycle =
        orderBillingCycle
    }

    // ==================================================
    // UPDATE SUBSCRIPTION
    // ==================================================

    const selectedPlan =
      PLANS[planCode]

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

    const subscriptionExpiry =
      getExpiry(
        billingCycle,
        isTrial
      )

    const updatePayload = {
      plan:
        selectedPlan.legacyPlan,

      plan_code:
        planCode,

      billing_cycle:
        billingCycle,

      subscription_status:
        'active',

      subscription_expires_at:
        subscriptionExpiry
          .toISOString(),

      business_type:
        selectedPlan.businessType,

      resort_enabled:
        selectedPlan.resortEnabled,
    }

    const {
      data:
        updatedRestaurant,

      error:
        updateError,
    } =
      await admin
        .from('restaurants')
        .update(
          updatePayload
        )
        .eq(
          'id',
          restaurantId
        )
        .select(
          `
            id,
            name,
            plan,
            plan_code,
            billing_cycle,
            subscription_status,
            subscription_expires_at,
            business_type,
            resort_enabled
          `
        )
        .single()

    if (updateError) {
      console.error(
        'Subscription update failed:',
        updateError
      )

      return NextResponse.json(
        {
          success: false,

          message:
            updateError.message ||
            'Unable to activate subscription.',
        },

        { status: 500 }
      )
    }

    // --------------------------------------------------
    // VERIFY DATABASE ACTUALLY CHANGED
    // --------------------------------------------------

    if (
      !updatedRestaurant ||
      updatedRestaurant
        .plan_code !==
        planCode ||
      updatedRestaurant
        .subscription_status !==
        'active'
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Subscription database update could not be confirmed.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,

      message:
        isTrial
          ? '14-day Restaurant+ Resort Pro trial activated successfully.'
          : 'Subscription activated successfully.',

      restaurant:
        updatedRestaurant,
    })
  } catch (error) {
    console.error(
      'VERIFY SUBSCRIPTION ERROR:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        message:
          error?.message ||
          'Unable to verify subscription.',
      },

      { status: 500 }
    )
  }
}