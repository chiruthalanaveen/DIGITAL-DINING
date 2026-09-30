import crypto from 'crypto'
import Razorpay from 'razorpay'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptGatewaySecret } from '@/lib/server/paymentGatewayCrypto'
import { sendDeliveryOrderPush } from '@/lib/server/sendDeliveryOrderPush'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeEqual(first, second) {
  const a =
    Buffer.from(
      String(first || '')
    )

  const b =
    Buffer.from(
      String(second || '')
    )

  if (a.length !== b.length) {
    return false
  }

  return crypto.timingSafeEqual(
    a,
    b
  )
}

function getAdminClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Delivery server configuration is incomplete.'
    )
  }

  return createClient(
    url,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}

async function readGateway(
  admin,
  restaurantId
) {
  const {
    data,
    error,
  } = await admin
    .from('payment_gateway_configs')
    .select(
      `
        key_id,
        secret_ciphertext,
        secret_iv,
        secret_tag,
        is_enabled
      `
    )
    .eq(
      'restaurant_id',
      restaurantId
    )
    .eq('module', 'delivery')
    .eq('provider', 'razorpay')
    .maybeSingle()

  if (error) throw error
  return data || null
}

export async function POST(request) {
  try {
    const body =
      await request
        .json()
        .catch(() => ({}))

    const deliveryOrderId =
      String(
        body?.deliveryOrderId ||
          ''
      ).trim()

    const razorpayOrderId =
      String(
        body?.razorpay_order_id ||
          ''
      ).trim()

    const razorpayPaymentId =
      String(
        body?.razorpay_payment_id ||
          ''
      ).trim()

    const razorpaySignature =
      String(
        body?.razorpay_signature ||
          ''
      ).trim()

    if (
      !deliveryOrderId ||
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

    const admin =
      getAdminClient()

    const {
      data: deliveryOrder,
      error: orderError,
    } = await admin
      .from('delivery_orders')
      .select(
        `
          id,
          restaurant_id,
          order_code,
          customer_name,
          total_amount,
          payment_method,
          payment_status,
          payment_provider,
          provider_order_id,
          provider_payment_id,
          order_status
        `
      )
      .eq('id', deliveryOrderId)
      .maybeSingle()

    if (
      orderError ||
      !deliveryOrder
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Delivery order was not found.',
        },
        { status: 404 }
      )
    }

    if (
      deliveryOrder.payment_method !==
      'razorpay'
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'This Delivery order is not an online-payment order.',
        },
        { status: 400 }
      )
    }

    if (
      deliveryOrder.payment_status ===
        'paid' &&
      deliveryOrder.provider_payment_id ===
        razorpayPaymentId
    ) {
      return NextResponse.json({
        success: true,
        orderCode:
          deliveryOrder.order_code,
        paymentStatus: 'paid',
        orderStatus:
          deliveryOrder.order_status,
      })
    }

    if (
      String(
        deliveryOrder.provider_order_id ||
          ''
      ) !== razorpayOrderId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Razorpay order does not match this Delivery order.',
        },
        { status: 400 }
      )
    }

    const gateway =
      await readGateway(
        admin,
        deliveryOrder.restaurant_id
      )

    if (
      !gateway?.is_enabled ||
      !gateway?.key_id
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Delivery Razorpay configuration is unavailable.',
        },
        { status: 400 }
      )
    }

    const keySecret =
      decryptGatewaySecret({
        ciphertext:
          gateway.secret_ciphertext,
        iv: gateway.secret_iv,
        tag: gateway.secret_tag,
      })

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
            'Delivery payment signature verification failed.',
        },
        { status: 400 }
      )
    }

    const razorpay =
      new Razorpay({
        key_id:
          gateway.key_id,
        key_secret:
          keySecret,
      })

    const [
      razorpayOrder,
      payment,
    ] = await Promise.all([
      razorpay.orders.fetch(
        razorpayOrderId
      ),
      razorpay.payments.fetch(
        razorpayPaymentId
      ),
    ])

    const expectedAmount =
      Math.round(
        Number(
          deliveryOrder.total_amount
        ) * 100
      )

    if (
      Number(
        razorpayOrder.amount
      ) !== expectedAmount ||
      String(
        razorpayOrder.currency
      ) !== 'INR' ||
      String(
        payment.order_id
      ) !== razorpayOrderId ||
      Number(
        payment.amount
      ) !== expectedAmount ||
      String(
        payment.currency
      ) !== 'INR'
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Delivery payment amount verification failed.',
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
            `Razorpay payment is not successful. Status: ${paymentStatus}`,
        },
        { status: 400 }
      )
    }

    const nextOrderStatus =
      deliveryOrder.order_status ===
      'received'
        ? 'confirmed'
        : deliveryOrder.order_status

    const {
      data: updated,
      error: updateError,
    } = await admin
      .from('delivery_orders')
      .update({
        payment_status: 'paid',
        payment_provider:
          'razorpay',
        provider_order_id:
          razorpayOrderId,
        provider_payment_id:
          razorpayPaymentId,
        order_status:
          nextOrderStatus,
        payment_expires_at:
          null,
      })
      .eq('id', deliveryOrder.id)
      .select(
        `
          id,
          order_code,
          payment_status,
          order_status
        `
      )
      .single()

    if (updateError) {
      throw updateError
    }

    await sendDeliveryOrderPush({
      restaurantId:
        deliveryOrder.restaurant_id,
      orderId:
        deliveryOrder.id,
      orderCode:
        updated.order_code,
      customerName:
        deliveryOrder.customer_name,
      totalAmount:
        deliveryOrder.total_amount,
    })

    return NextResponse.json({
      success: true,
      orderCode:
        updated.order_code,
      paymentStatus:
        updated.payment_status,
      orderStatus:
        updated.order_status,
    })
  } catch (error) {
    console.error(
      'Delivery Razorpay verification error:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          'Unable to verify Delivery payment.',
      },
      { status: 500 }
    )
  }
}
