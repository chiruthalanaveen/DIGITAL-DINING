import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptGatewaySecret } from '@/lib/server/paymentGatewayCrypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serverConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      'Delivery refund server configuration is incomplete.'
    )
  }

  return {
    url,
    anonKey,
    serviceKey,
  }
}

function adminClient() {
  const { url, serviceKey } = serverConfig()

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function ownerClient(accessToken) {
  const { url, anonKey } = serverConfig()

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function cleanText(value, max = 500) {
  return String(value || '').trim().slice(0, max)
}

function basicAuth(keyId, keySecret) {
  return `Basic ${Buffer.from(
    `${keyId}:${keySecret}`
  ).toString('base64')}`
}

async function readJsonSafe(response) {
  return response
    .json()
    .catch(() => ({}))
}

async function authenticateActor({
  admin,
  body,
  authorization,
}) {
  const actorType = cleanText(
    body?.actorType,
    20
  ).toLowerCase()

  if (actorType === 'owner') {
    const restaurantId = cleanText(
      body?.restaurantId,
      80
    )

    const caseId = cleanText(
      body?.caseId,
      80
    )

    const accessToken = String(
      authorization || ''
    )
      .replace(/^Bearer\s+/i, '')
      .trim()

    if (
      !restaurantId ||
      !caseId ||
      !accessToken
    ) {
      throw new Error(
        'Owner authentication details are missing.'
      )
    }

    const client =
      ownerClient(accessToken)

    const {
      data,
      error,
    } = await client.rpc(
      'owner_delivery_get_after_sales',
      {
        p_restaurant_id:
          restaurantId,
        p_case_id:
          caseId,
      }
    )

    if (error) throw error

    if (!data?.success) {
      throw new Error(
        data?.message ||
          'Owner is not authorized for this Delivery refund.'
      )
    }

    return {
      actorType: 'owner',
      restaurantId,
      actorName: 'Owner',
    }
  }

  if (actorType === 'manager') {
    const sessionToken = cleanText(
      body?.sessionToken,
      500
    )

    let authResult

    if (sessionToken) {
      const {
        data,
        error,
      } = await admin.rpc(
        'manager_delivery_auth_session',
        {
          p_session_token:
            sessionToken,
        }
      )

      if (error) throw error
      authResult = data
    } else {
      const {
        data,
        error,
      } = await admin.rpc(
        'manager_delivery_auth',
        {
          p_restaurant_id:
            cleanText(
              body?.restaurantId,
              80
            ),

          p_restaurant_code:
            cleanText(
              body?.restaurantCode,
              120
            ),

          p_user_id:
            cleanText(
              body?.userId,
              120
            ).toLowerCase(),

          p_password:
            String(
              body?.password || ''
            ),
        }
      )

      if (error) throw error
      authResult = data
    }

    if (!authResult?.success) {
      throw new Error(
        authResult?.message ||
          'Manager authentication failed.'
      )
    }

    return {
      actorType: 'manager',

      restaurantId:
        cleanText(
          authResult?.restaurantId,
          80
        ),

      actorName:
        cleanText(
          authResult?.managerName ||
            'Manager',
          120
        ) || 'Manager',
    }
  }

  throw new Error(
    'Refund actor must be owner or manager.'
  )
}

async function loadRefundContext({
  admin,
  restaurantId,
  caseId,
}) {
  const {
    data: caseRow,
    error: caseError,
  } = await admin
    .from(
      'delivery_after_sales_cases'
    )
    .select(
      `
        id,
        case_code,
        restaurant_id,
        original_order_id,
        case_type,
        status,
        refund_required,
        refund_amount,
        refund_completed_amount,
        refund_status,
        refund_method,
        provider_refund_id
      `
    )
    .eq('id', caseId)
    .eq(
      'restaurant_id',
      restaurantId
    )
    .maybeSingle()

  if (caseError) throw caseError

  if (!caseRow) {
    const error = new Error(
      'After-sales refund case was not found.'
    )
    error.statusCode = 404
    throw error
  }

  const {
    data: order,
    error: orderError,
  } = await admin
    .from('delivery_orders')
    .select(
      `
        id,
        restaurant_id,
        order_code,
        payment_method,
        payment_status,
        payment_provider,
        provider_payment_id,
        total_amount
      `
    )
    .eq(
      'id',
      caseRow.original_order_id
    )
    .eq(
      'restaurant_id',
      restaurantId
    )
    .maybeSingle()

  if (orderError) throw orderError

  if (!order) {
    const error = new Error(
      'Original Delivery order was not found.'
    )
    error.statusCode = 404
    throw error
  }

  return {
    caseRow,
    order,
  }
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

  if (
    !data?.is_enabled ||
    !data?.key_id ||
    !data?.secret_ciphertext ||
    !data?.secret_iv ||
    !data?.secret_tag
  ) {
    const gatewayError =
      new Error(
        'Delivery Razorpay configuration is unavailable.'
      )

    gatewayError.statusCode = 400
    throw gatewayError
  }

  return data
}

async function recordProviderRefund({
  admin,
  caseId,
  amount,
  refundId,
  status,
  note,
}) {
  const {
    data,
    error,
  } = await admin.rpc(
    'delivery_after_sales_record_provider_refund',
    {
      p_case_id: caseId,
      p_amount: amount,
      p_provider_refund_id:
        refundId || '',
      p_status: status,
      p_note: note || '',
    }
  )

  if (error) throw error

  if (!data?.success) {
    throw new Error(
      data?.message ||
        'Unable to record provider refund result.'
    )
  }

  return data
}

function mapProviderStatus(status) {
  const normalized =
    cleanText(status, 40)
      .toLowerCase()

  if (
    normalized === 'processed' ||
    normalized === 'completed'
  ) {
    return 'completed'
  }

  if (normalized === 'failed') {
    return 'failed'
  }

  return 'processing'
}

async function fetchRefundFromRazorpay({
  keyId,
  keySecret,
  refundId,
}) {
  const response = await fetch(
    `https://api.razorpay.com/v1/refunds/${encodeURIComponent(
      refundId
    )}`,
    {
      method: 'GET',
      headers: {
        Authorization:
          basicAuth(
            keyId,
            keySecret
          ),
        Accept:
          'application/json',
      },
      cache: 'no-store',
    }
  )

  const data =
    await readJsonSafe(response)

  if (!response.ok) {
    const providerError =
      new Error(
        data?.error?.description ||
          data?.error?.reason ||
          data?.error?.code ||
          'Unable to check Razorpay refund status.'
      )

    providerError.httpStatus =
      response.status

    providerError.providerData =
      data

    throw providerError
  }

  return data
}

async function createRazorpayRefund({
  keyId,
  keySecret,
  paymentId,
  amountPaise,
  caseCode,
  caseId,
  orderCode,
}) {
  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(
      paymentId
    )}/refund`,
    {
      method: 'POST',

      headers: {
        Authorization:
          basicAuth(
            keyId,
            keySecret
          ),

        'Content-Type':
          'application/json',

        Accept:
          'application/json',
      },

      body: JSON.stringify({
        amount:
          amountPaise,

        notes: {
          module:
            'digital-dine-in-delivery',

          after_sales_case:
            String(caseCode || ''),

          after_sales_case_id:
            String(caseId || ''),

          delivery_order:
            String(orderCode || ''),
        },
      }),

      cache: 'no-store',
    }
  )

  const data =
    await readJsonSafe(response)

  if (!response.ok) {
    const providerError =
      new Error(
        data?.error?.description ||
          data?.error?.reason ||
          data?.error?.code ||
          'Razorpay rejected the refund request.'
      )

    providerError.httpStatus =
      response.status

    providerError.providerData =
      data

    throw providerError
  }

  return data
}

async function syncExistingAttempt({
  admin,
  attempt,
  keyId,
  keySecret,
}) {
  if (
    !attempt?.provider_refund_id
  ) {
    const uncertainError =
      new Error(
        'A refund attempt already exists but no provider refund ID was confirmed. Do not create another refund automatically. Check the Razorpay Dashboard before retrying.'
      )

    uncertainError.statusCode = 409
    throw uncertainError
  }

  const providerRefund =
    await fetchRefundFromRazorpay({
      keyId,
      keySecret,
      refundId:
        attempt.provider_refund_id,
    })

  const mappedStatus =
    mapProviderStatus(
      providerRefund?.status
    )

  if (
    mappedStatus ===
    'completed'
  ) {
    const recorder =
      await recordProviderRefund({
        admin,
        caseId:
          attempt.case_id,
        amount:
          Number(
            attempt.amount || 0
          ),
        refundId:
          providerRefund?.id ||
          attempt.provider_refund_id,
        status:
          'completed',
        note:
          'Razorpay refund confirmed as processed.',
      })

    await admin
      .from(
        'delivery_refund_attempts'
      )
      .update({
        status: 'completed',
        provider_refund_id:
          providerRefund?.id ||
          attempt.provider_refund_id,
        provider_status:
          String(
            providerRefund?.status ||
              'processed'
          ),
        provider_response:
          providerRefund || {},
        error_message: '',
        completed_at:
          new Date().toISOString(),
      })
      .eq('id', attempt.id)

    return {
      success: true,
      completed: true,
      message:
        'Razorpay refund is processed.',
      refund:
        providerRefund,
      case:
        recorder,
    }
  }

  if (
    mappedStatus === 'failed'
  ) {
    await recordProviderRefund({
      admin,
      caseId:
        attempt.case_id,
      amount: 0,
      refundId:
        providerRefund?.id ||
        attempt.provider_refund_id,
      status: 'failed',
      note:
        'Razorpay reported that the refund failed.',
    })

    await admin
      .from(
        'delivery_refund_attempts'
      )
      .update({
        status: 'failed',
        provider_refund_id:
          providerRefund?.id ||
          attempt.provider_refund_id,
        provider_status:
          String(
            providerRefund?.status ||
              'failed'
          ),
        provider_response:
          providerRefund || {},
        error_message:
          'Razorpay refund failed.',
      })
      .eq('id', attempt.id)

    return {
      success: false,
      completed: false,
      message:
        'Razorpay reported that this refund failed. You can retry after reviewing the payment in Razorpay.',
      refund:
        providerRefund,
    }
  }

  await admin
    .from(
      'delivery_refund_attempts'
    )
    .update({
      status: 'processing',
      provider_status:
        String(
          providerRefund?.status ||
            'pending'
        ),
      provider_response:
        providerRefund || {},
      error_message: '',
    })
    .eq('id', attempt.id)

  return {
    success: true,
    completed: false,
    processing: true,
    message:
      'Razorpay refund is still processing. Use Check Refund Status again later.',
    refund:
      providerRefund,
  }
}

export async function POST(request) {
  let attemptId = ''
  let admin = null

  try {
    const body =
      await request
        .json()
        .catch(() => ({}))

    const caseId =
      cleanText(
        body?.caseId,
        80
      )

    if (!caseId) {
      return NextResponse.json(
        {
          success: false,
          message:
            'After-sales case ID is required.',
        },
        { status: 400 }
      )
    }

    admin =
      adminClient()

    const actor =
      await authenticateActor({
        admin,
        body,
        authorization:
          request.headers.get(
            'authorization'
          ),
      })

    if (!actor.restaurantId) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Authenticated restaurant was not resolved.',
        },
        { status: 401 }
      )
    }

    const {
      caseRow,
      order,
    } = await loadRefundContext({
      admin,
      restaurantId:
        actor.restaurantId,
      caseId,
    })

    if (
      caseRow.refund_required !==
      true
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'This after-sales case does not require a refund.',
        },
        { status: 409 }
      )
    }

    if (
      String(
        order.payment_method || ''
      ).toLowerCase() !==
      'razorpay'
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Only Razorpay orders can use the Razorpay refund API.',
        },
        { status: 409 }
      )
    }

    if (
      String(
        order.payment_status || ''
      ).toLowerCase() !==
      'paid'
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'The original Razorpay payment is not marked as paid.',
        },
        { status: 409 }
      )
    }

    if (
      !String(
        order.provider_payment_id ||
          ''
      ).trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'The Razorpay payment ID is missing from this Delivery order.',
        },
        { status: 409 }
      )
    }

    const approvedAmount =
      Number(
        caseRow.refund_amount || 0
      )

    const completedAmount =
      Number(
        caseRow.refund_completed_amount ||
          0
      )

    const remainingAmount =
      Math.max(
        0,
        Math.round(
          (
            approvedAmount -
            completedAmount
          ) *
            100
        ) / 100
      )

    if (
      remainingAmount <= 0 ||
      String(
        caseRow.refund_status ||
          ''
      ).toLowerCase() ===
        'completed'
    ) {
      return NextResponse.json({
        success: true,
        completed: true,
        message:
          'This refund is already complete.',
        remainingAmount: 0,
      })
    }

    if (
      String(
        caseRow.status || ''
      ).toLowerCase() !==
        'refund_pending'
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'This case is not currently ready for refund processing.',
        },
        { status: 409 }
      )
    }

    const gateway =
      await readGateway(
        admin,
        actor.restaurantId
      )

    const keySecret =
      decryptGatewaySecret({
        ciphertext:
          gateway.secret_ciphertext,
        iv:
          gateway.secret_iv,
        tag:
          gateway.secret_tag,
      })

    const {
      data: existingAttempt,
      error: existingError,
    } = await admin
      .from(
        'delivery_refund_attempts'
      )
      .select('*')
      .eq(
        'case_id',
        caseRow.id
      )
      .eq(
        'base_completed_amount',
        completedAmount
      )
      .in('status', [
        'processing',
        'completed',
        'uncertain',
      ])
      .order('created_at', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    if (existingAttempt) {
      if (
        existingAttempt.status ===
        'completed'
      ) {
        return NextResponse.json({
          success: true,
          completed: true,
          message:
            'This Razorpay refund was already processed.',
          refundId:
            existingAttempt.provider_refund_id ||
            '',
        })
      }

      const synced =
        await syncExistingAttempt({
          admin,
          attempt:
            existingAttempt,
          keyId:
            gateway.key_id,
          keySecret,
        })

      return NextResponse.json(
        synced,
        {
          status:
            synced.success === false
              ? 409
              : 200,
        }
      )
    }

    const {
      data: attempt,
      error: attemptError,
    } = await admin
      .from(
        'delivery_refund_attempts'
      )
      .insert({
        restaurant_id:
          actor.restaurantId,

        case_id:
          caseRow.id,

        delivery_order_id:
          order.id,

        payment_id:
          String(
            order.provider_payment_id
          ),

        amount:
          remainingAmount,

        base_completed_amount:
          completedAmount,

        status:
          'processing',

        requested_by_role:
          actor.actorType,

        requested_by_name:
          actor.actorName,
      })
      .select('*')
      .single()

    if (attemptError) {
      if (
        String(
          attemptError.code || ''
        ) === '23505'
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              'A refund for this balance is already being processed. Refresh the Returns / Refunds tab and check its status.',
          },
          { status: 409 }
        )
      }

      throw attemptError
    }

    attemptId =
      attempt.id

    const amountPaise =
      Math.round(
        remainingAmount *
          100
      )

    let providerRefund

    try {
      providerRefund =
        await createRazorpayRefund({
          keyId:
            gateway.key_id,
          keySecret,
          paymentId:
            order.provider_payment_id,
          amountPaise,
          caseCode:
            caseRow.case_code,
          caseId:
            caseRow.id,
          orderCode:
            order.order_code,
        })
    } catch (providerError) {
      const httpStatus =
        Number(
          providerError?.httpStatus ||
            0
        )

      const knownRejected =
        httpStatus >= 400 &&
        httpStatus < 500

      await admin
        .from(
          'delivery_refund_attempts'
        )
        .update({
          status:
            knownRejected
              ? 'failed'
              : 'uncertain',

          provider_status:
            '',

          provider_response:
            providerError
              ?.providerData ||
            {},

          error_message:
            cleanText(
              providerError?.message,
              1000
            ),
        })
        .eq(
          'id',
          attempt.id
        )

      if (knownRejected) {
        await recordProviderRefund({
          admin,
          caseId:
            caseRow.id,
          amount: 0,
          refundId: '',
          status: 'failed',
          note:
            cleanText(
              providerError?.message,
              1000
            ),
        })
      }

      return NextResponse.json(
        {
          success: false,

          uncertain:
            !knownRejected,

          message:
            knownRejected
              ? (
                  providerError?.message ||
                  'Razorpay rejected the refund request.'
                )
              : 'The connection ended before the refund result could be confirmed. Do not retry automatically. Check Razorpay Dashboard or retry Check Refund Status after verifying whether a refund ID was created.',
        },
        {
          status:
            knownRejected
              ? 400
              : 502,
        }
      )
    }

    const providerRefundId =
      cleanText(
        providerRefund?.id,
        120
      )

    const providerStatus =
      cleanText(
        providerRefund?.status,
        60
      ).toLowerCase()

    const mappedStatus =
      mapProviderStatus(
        providerStatus
      )

    if (!providerRefundId) {
      await admin
        .from(
          'delivery_refund_attempts'
        )
        .update({
          status:
            'uncertain',

          provider_status:
            providerStatus,

          provider_response:
            providerRefund || {},

          error_message:
            'Razorpay response did not contain a refund ID.',
        })
        .eq(
          'id',
          attempt.id
        )

      return NextResponse.json(
        {
          success: false,
          uncertain: true,
          message:
            'Razorpay returned an unexpected refund response. Do not create another refund until the payment is checked in Razorpay Dashboard.',
        },
        { status: 502 }
      )
    }

    if (
      mappedStatus ===
      'completed'
    ) {
      const recorder =
        await recordProviderRefund({
          admin,
          caseId:
            caseRow.id,
          amount:
            remainingAmount,
          refundId:
            providerRefundId,
          status:
            'completed',
          note:
            'Razorpay refund processed.',
        })

      await admin
        .from(
          'delivery_refund_attempts'
        )
        .update({
          status:
            'completed',

          provider_refund_id:
            providerRefundId,

          provider_status:
            providerStatus ||
            'processed',

          provider_response:
            providerRefund || {},

          error_message:
            '',

          completed_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          attempt.id
        )

      return NextResponse.json({
        success: true,
        completed: true,
        message:
          `Razorpay refund of ₹${remainingAmount.toLocaleString(
            'en-IN',
            {
              maximumFractionDigits: 2,
            }
          )} was processed.`,
        refundId:
          providerRefundId,
        refund:
          providerRefund,
        case:
          recorder,
      })
    }

    if (
      mappedStatus === 'failed'
    ) {
      await recordProviderRefund({
        admin,
        caseId:
          caseRow.id,
        amount: 0,
        refundId:
          providerRefundId,
        status: 'failed',
        note:
          'Razorpay reported that the refund failed.',
      })

      await admin
        .from(
          'delivery_refund_attempts'
        )
        .update({
          status:
            'failed',

          provider_refund_id:
            providerRefundId,

          provider_status:
            providerStatus ||
            'failed',

          provider_response:
            providerRefund || {},

          error_message:
            'Razorpay refund failed.',
        })
        .eq(
          'id',
          attempt.id
        )

      return NextResponse.json(
        {
          success: false,
          message:
            'Razorpay created the refund request but reported it as failed. Review it in Razorpay before retrying.',
          refundId:
            providerRefundId,
        },
        { status: 409 }
      )
    }

    await recordProviderRefund({
      admin,
      caseId:
        caseRow.id,
      amount: 0,
      refundId:
        providerRefundId,
      status:
        'processing',
      note:
        'Razorpay refund created and is processing.',
    })

    await admin
      .from(
        'delivery_refund_attempts'
      )
      .update({
        status:
          'processing',

        provider_refund_id:
          providerRefundId,

        provider_status:
          providerStatus ||
          'pending',

        provider_response:
          providerRefund || {},

        error_message:
          '',
      })
      .eq(
        'id',
        attempt.id
      )

    return NextResponse.json({
      success: true,
      completed: false,
      processing: true,
      message:
        'Razorpay accepted the refund. It is still processing.',
      refundId:
        providerRefundId,
      refund:
        providerRefund,
    })
  } catch (error) {
    console.error(
      'Delivery Razorpay refund error:',
      error
    )

    if (
      admin &&
      attemptId
    ) {
      try {
        await admin
          .from(
            'delivery_refund_attempts'
          )
          .update({
            status:
              'uncertain',

            error_message:
              cleanText(
                error?.message,
                1000
              ),
          })
          .eq(
            'id',
            attemptId
          )
      } catch (attemptUpdateError) {
        console.error(
          'Unable to mark Delivery refund attempt uncertain:',
          attemptUpdateError
        )
      }
    }

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          'Unable to process Delivery refund.',
      },
      {
        status:
          Number(
            error?.statusCode ||
              500
          ),
      }
    )
  }
}