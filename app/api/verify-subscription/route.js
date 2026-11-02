import crypto from 'crypto'
import Razorpay from 'razorpay'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { callSubscriptionLedger, assertActivationReceipt, isSubscriptionCheckoutId, requirePaidSubscriptionCheckout, SubscriptionLedgerError } from '@/lib/server/subscriptionLedger'

export const runtime = 'nodejs'

// ==========================================================
// DIGITAL DINING - FINAL FIVE SUBSCRIPTION PLANS
// ==========================================================

const PLANS = {
  restaurant_pro: {
    name: 'Restaurant',
    legacyPlan: 'Pro',
    businessType: 'restaurant',
    restaurantEnabled: true,
    resortEnabled: false,
    deliveryEnabled: false,
    prices: {
      '1month': 1499,
      '6months': 8095,
      '12months': 14390,
    },
  },

  delivery: {
    name: 'Delivery',
    // Keep a legacy full-feature value for older code that still
    // reads restaurants.plan. plan_code remains authoritative.
    legacyPlan: 'Pro',
    businessType: 'delivery',
    restaurantEnabled: false,
    resortEnabled: false,
    deliveryEnabled: true,
    prices: {
      '1month': 1499,
      '6months': 8095,
      '12months': 14390,
    },
  },

  restaurant_resort_pro: {
    name: 'Restaurant + Resort',
    legacyPlan: 'Pro+',
    businessType: 'restaurant_resort',
    restaurantEnabled: true,
    resortEnabled: true,
    deliveryEnabled: false,
    prices: {
      '1month': 2999,
      '6months': 16195,
      '12months': 28790,
    },
  },

  restaurant_delivery: {
    name: 'Restaurant + Delivery',
    legacyPlan: 'Pro',
    businessType: 'restaurant_delivery',
    restaurantEnabled: true,
    resortEnabled: false,
    deliveryEnabled: true,
    prices: {
      '1month': 2999,
      '6months': 16195,
      '12months': 28790,
    },
  },

  restaurant_resort_delivery: {
    name: 'Restaurant + Resort + Delivery',
    legacyPlan: 'Pro+',
    businessType: 'restaurant_resort_delivery',
    restaurantEnabled: true,
    resortEnabled: true,
    deliveryEnabled: true,
    prices: {
      '1month': 3999,
      '6months': 21595,
      '12months': 38390,
    },
  },
}

function getBearerToken(req) {
  const authorization =
    req.headers.get('authorization') || ''

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

function safeEqual(first, second) {
  const a = Buffer.from(String(first || ''))
  const b = Buffer.from(String(second || ''))

  if (a.length !== b.length) {
    return false
  }

  return crypto.timingSafeEqual(a, b)
}


function normalizeCoupon(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
}

function getTestCouponDefinitions() {
  return [
    {
      key: 'restaurant_1m',
      planCode: 'restaurant_pro',
      code: normalizeCoupon(
        process.env.TEST_COUPON_RESTAURANT_1M
      ),
    },
    {
      key: 'delivery_1m',
      planCode: 'delivery',
      code: normalizeCoupon(
        process.env.TEST_COUPON_DELIVERY_1M
      ),
    },
    {
      key: 'restaurant_resort_1m',
      planCode: 'restaurant_resort_pro',
      code: normalizeCoupon(
        process.env.TEST_COUPON_RESTAURANT_RESORT_1M
      ),
    },
    {
      key: 'restaurant_delivery_1m',
      planCode: 'restaurant_delivery',
      code: normalizeCoupon(
        process.env.TEST_COUPON_RESTAURANT_DELIVERY_1M
      ),
    },
    {
      key: 'restaurant_resort_delivery_1m',
      planCode: 'restaurant_resort_delivery',
      code: normalizeCoupon(
        process.env.TEST_COUPON_ALL_1M
      ),
    },
  ].filter((item) => item.code)
}

function resolveTestCoupon(inputCode) {
  const normalized = normalizeCoupon(inputCode)

  if (!normalized) {
    return null
  }

  for (const coupon of getTestCouponDefinitions()) {
    if (safeEqual(normalized, coupon.code)) {
      return coupon
    }
  }

  return null
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))

    const restaurantId = String(
      body.restaurantId || ''
    ).trim().toLowerCase()

    const mode =
      body.mode === 'coupon'
        ? 'coupon'
        : 'payment'

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

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY

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
    // VERIFY LOGGED-IN OWNER
    // --------------------------------------------------

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

    const userClient = createClient(
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
    } = await userClient.auth.getUser(accessToken)

    const user = userData?.user

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Your login session is invalid or expired.',
        },
        { status: 401 }
      )
    }

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    const {
      data: restaurant,
      error: restaurantError,
    } = await admin
      .from('restaurants')
      .select(
        'id, owner_id, name, phone, approval_status'
      )
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant) {
      return NextResponse.json(
        {
          success: false,
          message: 'Restaurant was not found.',
        },
        { status: 404 }
      )
    }

    if (
      String(restaurant.owner_id) !==
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

    if (String(restaurant.approval_status || 'pending').trim().toLowerCase() !== 'approved') {
      return NextResponse.json(
        {
          success: false,
          code: 'OWNER_APPROVAL_REQUIRED',
          message: 'Super Admin approval is required before activating a subscription for this restaurant.',
        },
        { status: 403 }
      )
    }

    let planCode = ''
    let billingCycle = ''
    let activation

    if (mode === 'payment') requirePaidSubscriptionCheckout()

    // ==================================================
    // TEST COUPON - ONE MONTH FREE
    // ==================================================

    if (mode === 'coupon') {
      const coupon = resolveTestCoupon(
        body.couponCode
      )

      if (!coupon) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Invalid or unavailable subscription coupon.',
          },
          { status: 400 }
        )
      }

      const {
        data: couponResult,
        error: couponError,
      } = await admin.rpc(
        'activate_test_subscription_coupon',
        {
          p_restaurant_id: restaurantId,
          p_coupon_key: coupon.key,
          p_plan_code: coupon.planCode,
        }
      )

      if (couponError) {
        console.error(
          'Coupon activation failed:',
          couponError
        )

        return NextResponse.json(
          {
            success: false,
            message:
              couponError.message ||
              'Unable to activate this coupon.',
          },
          { status: 400 }
        )
      }

      if (
        !couponResult?.success ||
        !couponResult?.restaurant
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              couponResult?.message ||
              'Coupon activation could not be confirmed.',
          },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message:
          `${PLANS[coupon.planCode]?.name || 'Subscription'} activated free for 1 month.`,
        couponKey: coupon.key,
        restaurant:
          couponResult.restaurant,
      })
    }

    // ==================================================
    // PAID SUBSCRIPTION
    // ==================================================

    else {
      const requestedPlanCode = String(
        body.planCode || ''
      )
        .trim()
        .toLowerCase()

      const requestedBillingCycle = String(
        body.billingCycle || ''
      ).trim()

      const razorpayOrderId = String(
        body.razorpay_order_id || ''
      ).trim()

      const razorpayPaymentId = String(
        body.razorpay_payment_id || ''
      ).trim()

      const razorpaySignature = String(
        body.razorpay_signature || ''
      ).trim()

      const {
        keyId,
        keySecret,
      } = getPlatformRazorpayConfig()

      if (!keyId || !keySecret) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Platform Razorpay configuration is missing.',
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

      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
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

      const razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      })

      const order =
        await razorpay.orders.fetch(
          razorpayOrderId
        )

      const payment =
        await razorpay.payments.fetch(
          razorpayPaymentId
        )

      const orderRestaurantId = String(
        order?.notes?.restaurant_id || ''
      )

      const orderPlanCode = String(
        order?.notes?.plan_code || ''
      )
        .trim()
        .toLowerCase()

      const orderBillingCycle = String(
        order?.notes?.billing_cycle || ''
      )

      const orderOwnerId = String(
        order?.notes?.owner_id || ''
      )

      if (
        order?.id !== razorpayOrderId ||
        payment?.id !== razorpayPaymentId ||
        orderRestaurantId !== restaurantId ||
        orderOwnerId !== String(user.id) ||
        orderPlanCode !== requestedPlanCode ||
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
        String(order.currency) !== 'INR' ||
        String(payment.order_id) !==
          razorpayOrderId ||
        Number(payment.amount) !==
          expectedAmount ||
        String(payment.currency) !==
          'INR'
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

      const paymentStatus = String(
        payment.status || ''
      )

      if (paymentStatus === 'authorized') {
        return NextResponse.json(
          {
            success: false,
            pending: true,
            code: 'PAYMENT_NOT_CAPTURED',
            message: 'Payment is authorized but has not been captured. The subscription has not been activated. Retry verification shortly; do not pay again.',
          },
          { status: 202 }
        )
      }

      if (
        paymentStatus !== 'captured' ||
        payment.captured === false
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

      planCode = orderPlanCode
      billingCycle = orderBillingCycle

      const checkoutId = order?.notes?.checkout_id
      if (!isSubscriptionCheckoutId(checkoutId)) {
        return NextResponse.json({
          success: false,
          code: 'SUBSCRIPTION_RECONCILIATION_REQUIRED',
          message: 'This payment predates secure checkout registration or needs an account review. If you already paid, do not pay again; contact support with your payment reference.',
        }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
      }

      activation = await callSubscriptionLedger(admin, 'subscription_activate_payment', {
        p_checkout_id: checkoutId, p_restaurant_id: restaurantId, p_owner_id: user.id,
        p_provider_order_id: razorpayOrderId, p_provider_payment_id: razorpayPaymentId,
        p_amount_paise: expectedAmount, p_currency: 'INR', p_plan_code: planCode,
        p_billing_cycle: billingCycle, p_provider_key_id: keyId,
      })
      assertActivationReceipt(activation, {
        checkoutId, restaurantId, orderId: razorpayOrderId, paymentId: razorpayPaymentId,
        amountPaise: expectedAmount, planCode, billingCycle,
      }, selectedPlan)
    }

    // ==================================================
    // ACTIVATE SUBSCRIPTION
    // ==================================================

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

    // The RPC has atomically recorded the consumed payment and subscription.
    // Replays return its frozen result; never run a direct activation fallback.
    const updatedRestaurant = activation.restaurant

    // New Delivery subscriptions need their one-per-tenant settings row.
    if (selectedPlan.deliveryEnabled) {
      const {
        error: deliverySettingsError,
      } = await admin
        .from('delivery_settings')
        .upsert(
          {
            restaurant_id: restaurantId,
            store_name:
              restaurant.name || '',
            support_phone:
              restaurant.phone || '',
          },
          {
            onConflict: 'restaurant_id',
            ignoreDuplicates: true,
          }
        )

      if (deliverySettingsError) {
        // Subscription is already valid. Do not revoke it because a default
        // settings row could not be prepared; the dashboard can retry.
        console.error(
          'Unable to prepare Delivery settings:',
          { code: deliverySettingsError.code || 'unknown' }
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: activation.replayed
        ? 'This payment was already verified. No subscription changes were made.'
        : `${selectedPlan.name} subscription activated successfully.`,
      restaurant: updatedRestaurant,
      replayed: activation.replayed,
      receipt: activation.receipt,
    })
  } catch (error) {
    if (error instanceof SubscriptionLedgerError) {
      return NextResponse.json({ success: false, code: error.code, message: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } })
    }
    console.error('Subscription verification failed.', { code: error?.code || error?.name || 'unknown' })

    return NextResponse.json(
      {
        success: false,
        message:
          'Unable to verify subscription. If you already paid, do not pay again; retry verification or contact support.',
      },
      { status: 500 }
    )
  }
}
