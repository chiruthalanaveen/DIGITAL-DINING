import crypto from 'crypto'
import Razorpay from 'razorpay'
import {
  NextResponse,
} from 'next/server'
import {
  createClient,
} from '@supabase/supabase-js'

import {
  decryptGatewaySecret,
} from '@/lib/server/paymentGatewayCrypto'

import {
  sendDeliveryOrderPush,
} from '@/lib/server/sendDeliveryOrderPush'

export const runtime = 'nodejs'

export const dynamic =
  'force-dynamic'


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
    a.length !==
    b.length
  ) {
    return false
  }

  return crypto.timingSafeEqual(
    a,
    b
  )
}


function getAdminClient() {
  const url =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL

  const serviceKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY

  if (
    !url ||
    !serviceKey
  ) {
    throw new Error(
      'Delivery server configuration is incomplete.'
    )
  }

  return createClient(
    url,
    serviceKey,
    {
      auth: {
        persistSession:
          false,

        autoRefreshToken:
          false,
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
  } =
    await admin
      .from(
        'payment_gateway_configs'
      )
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
      .eq(
        'module',
        'delivery'
      )
      .eq(
        'provider',
        'razorpay'
      )
      .maybeSingle()

  if (error) {
    throw error
  }

  return data || null
}


async function ensureCapturedPayment({
  razorpay,
  paymentId,
  expectedAmount,
}) {
  let payment =
    await razorpay
      .payments
      .fetch(
        paymentId
      )

  if (
    String(
      payment?.status || ''
    ) === 'captured'
  ) {
    return payment
  }

  /*
   * Razorpay can briefly report an otherwise-successful payment
   * as "authorized" before automatic capture finishes.
   *
   * First give auto-capture a small window to finish.
   */
  if (
    String(
      payment?.status || ''
    ) === 'authorized'
  ) {
    for (
      let attempt = 0;
      attempt < 3;
      attempt += 1
    ) {
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            600
          )
      )

      payment =
        await razorpay
          .payments
          .fetch(
            paymentId
          )

      if (
        String(
          payment?.status || ''
        ) === 'captured'
      ) {
        return payment
      }
    }
  }

  /*
   * If it is still authorized, capture it server-side.
   * This guarantees we never activate the Delivery order merely
   * because a payment was authorized.
   */
  if (
    String(
      payment?.status || ''
    ) === 'authorized'
  ) {
    try {
      payment =
        await razorpay
          .payments
          .capture(
            paymentId,
            expectedAmount,
            'INR'
          )
    } catch (
      captureError
    ) {
      /*
       * Auto-capture may have completed between our last fetch
       * and the manual capture request. Re-fetch before treating
       * the capture exception as a real failure.
       */
      const latest =
        await razorpay
          .payments
          .fetch(
            paymentId
          )

      if (
        String(
          latest?.status || ''
        ) === 'captured'
      ) {
        payment = latest
      } else {
        throw captureError
      }
    }
  }

  return payment
}


export async function POST(
  request
) {
  try {
    const body =
      await request
        .json()
        .catch(
          () => ({})
        )

    const deliveryOrderId =
      String(
        body?.deliveryOrderId ||
          ''
      ).trim()

    const razorpayOrderId =
      String(
        body
          ?.razorpay_order_id ||
          ''
      ).trim()

    const razorpayPaymentId =
      String(
        body
          ?.razorpay_payment_id ||
          ''
      ).trim()

    const razorpaySignature =
      String(
        body
          ?.razorpay_signature ||
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
        {
          status: 400,
        }
      )
    }

    const admin =
      getAdminClient()

    const {
      data:
        deliveryOrder,

      error:
        orderError,
    } =
      await admin
        .from(
          'delivery_orders'
        )
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
        .eq(
          'id',
          deliveryOrderId
        )
        .maybeSingle()

    if (
      orderError ||
      !deliveryOrder
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            'Delivery payment order was not found.',
        },
        {
          status: 404,
        }
      )
    }

    if (
      String(
        deliveryOrder
          .payment_method ||
          ''
      ).toLowerCase() !==
      'razorpay'
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            'This Delivery order is not an online-payment order.',
        },
        {
          status: 400,
        }
      )
    }

    /*
     * Idempotency:
     * If this exact Razorpay payment was already processed,
     * simply return success.
     */
    if (
      deliveryOrder
        .payment_status ===
        'paid' &&
      deliveryOrder
        .provider_payment_id ===
        razorpayPaymentId
    ) {
      return NextResponse.json({
        success: true,

        orderCode:
          deliveryOrder
            .order_code,

        paymentStatus:
          'paid',

        orderStatus:
          deliveryOrder
            .order_status,
      })
    }

    /*
     * A paid Delivery order must never be overwritten by a
     * different Razorpay payment ID.
     */
    if (
      deliveryOrder
        .payment_status ===
        'paid'
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            'This Delivery order has already been paid.',
        },
        {
          status: 409,
        }
      )
    }

    if (
      String(
        deliveryOrder
          .provider_order_id ||
          ''
      ) !==
      razorpayOrderId
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            'Razorpay order does not match this Delivery payment.',
        },
        {
          status: 400,
        }
      )
    }

    const gateway =
      await readGateway(
        admin,
        deliveryOrder
          .restaurant_id
      )

    if (
      !gateway
        ?.is_enabled ||
      !gateway
        ?.key_id
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            'Delivery Razorpay configuration is unavailable.',
        },
        {
          status: 400,
        }
      )
    }

    const keySecret =
      decryptGatewaySecret({
        ciphertext:
          gateway
            .secret_ciphertext,

        iv:
          gateway
            .secret_iv,

        tag:
          gateway
            .secret_tag,
      })

    /*
     * Verify Razorpay checkout signature.
     */
    const expectedSignature =
      crypto
        .createHmac(
          'sha256',
          keySecret
        )
        .update(
          `${razorpayOrderId}|${razorpayPaymentId}`
        )
        .digest(
          'hex'
        )

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
        {
          status: 400,
        }
      )
    }

    const razorpay =
      new Razorpay({
        key_id:
          gateway.key_id,

        key_secret:
          keySecret,
      })

    const razorpayOrder =
      await razorpay
        .orders
        .fetch(
          razorpayOrderId
        )

    const expectedAmount =
      Math.round(
        Number(
          deliveryOrder
            .total_amount
        ) * 100
      )

    if (
      !Number.isInteger(
        expectedAmount
      ) ||
      expectedAmount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            'Delivery payment amount is invalid.',
        },
        {
          status: 400,
        }
      )
    }

    if (
      Number(
        razorpayOrder
          .amount
      ) !==
        expectedAmount ||
      String(
        razorpayOrder
          .currency
      ) !==
        'INR'
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            'Delivery Razorpay order amount verification failed.',
        },
        {
          status: 400,
        }
      )
    }

    let payment

    try {
      payment =
        await ensureCapturedPayment({
          razorpay,

          paymentId:
            razorpayPaymentId,

          expectedAmount,
        })
    } catch (
      captureError
    ) {
      console.error(
        'Delivery Razorpay capture error:',
        captureError
      )

      return NextResponse.json(
        {
          success: false,

          message:
            'Payment was authorized but could not be captured. Do not pay again. Please contact the store.',
        },
        {
          status: 409,
        }
      )
    }

    if (
      String(
        payment
          ?.order_id ||
          ''
      ) !==
      razorpayOrderId
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            'Razorpay payment does not belong to this Delivery order.',
        },
        {
          status: 400,
        }
      )
    }

    if (
      Number(
        payment
          ?.amount
      ) !==
        expectedAmount ||
      String(
        payment
          ?.currency ||
          ''
      ) !==
        'INR'
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            'Delivery payment amount verification failed.',
        },
        {
          status: 400,
        }
      )
    }

    /*
     * CRITICAL:
     *
     * Authorized is NOT enough.
     * The order becomes operational only after Razorpay says
     * the payment is CAPTURED.
     */
    if (
      String(
        payment
          ?.status ||
          ''
      ) !==
      'captured'
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            `Online payment has not been captured successfully. Current status: ${
              payment
                ?.status ||
              'unknown'
            }`,
        },
        {
          status: 409,
        }
      )
    }

    const nextOrderStatus =
      deliveryOrder
        .order_status ===
        'received'
        ? 'confirmed'
        : deliveryOrder
            .order_status

    const paidAt =
      new Date()
        .toISOString()

    /*
     * This is the moment the temporary payment row becomes a
     * real operational Delivery order.
     */
    const {
      data: updated,
      error:
        updateError,
    } =
      await admin
        .from(
          'delivery_orders'
        )
        .update({
          payment_status:
            'paid',

          payment_provider:
            'razorpay',

          provider_order_id:
            razorpayOrderId,

          provider_payment_id:
            razorpayPaymentId,

          order_status:
            nextOrderStatus,

          /*
           * placed_at now represents the time the online order
           * actually became valid.
           */
          placed_at:
            paidAt,

          payment_expires_at:
            null,
        })
        .eq(
          'id',
          deliveryOrder.id
        )
        .eq(
          'provider_order_id',
          razorpayOrderId
        )
        .select(
          `
            id,
            order_code,
            payment_status,
            order_status,
            placed_at
          `
        )
        .single()

    if (
      updateError
    ) {
      throw updateError
    }

    /*
     * Only PAID online orders reach auto assignment.
     */
    try {
      await admin.rpc(
        'try_delivery_auto_assignment',
        {
          p_restaurant_id:
            deliveryOrder
              .restaurant_id,
        }
      )
    } catch (
      assignmentError
    ) {
      console.error(
        'Delivery Razorpay auto assignment fallback error:',
        assignmentError
      )
    }

    /*
     * Only after successful payment verification/capture
     * do Owner/Manager devices receive the new-order push.
     */
    try {
      await sendDeliveryOrderPush({
        restaurantId:
          deliveryOrder
            .restaurant_id,

        orderId:
          deliveryOrder.id,

        orderCode:
          updated.order_code,

        customerName:
          deliveryOrder
            .customer_name,

        totalAmount:
          deliveryOrder
            .total_amount,
      })
    } catch (
      pushError
    ) {
      /*
       * Push failure must not undo a successful payment/order.
       */
      console.error(
        'Delivery paid-order push error:',
        pushError
      )
    }

    return NextResponse.json({
      success: true,

      orderCode:
        updated
          .order_code,

      paymentStatus:
        updated
          .payment_status,

      orderStatus:
        updated
          .order_status,
    })
  } catch (
    error
  ) {
    console.error(
      'Delivery Razorpay verification error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        message:
          error
            ?.message ||
          'Unable to verify Delivery payment.',
      },
      {
        status: 500,
      }
    )
  }
}