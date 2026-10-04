import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import {
  decryptCodRefundAccountNumber,
  encryptCodRefundAccountNumber,
} from '@/lib/server/codRefundCrypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(
  body,
  status = 200
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        'Cache-Control':
          'no-store, max-age=0',
      },
    }
  )
}

function serverConfig() {
  const url =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL

  const anonKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY

  const serviceKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY

  if (
    !url ||
    !anonKey ||
    !serviceKey
  ) {
    throw new Error(
      'COD refund server configuration is incomplete.'
    )
  }

  return {
    url,
    anonKey,
    serviceKey,
  }
}

function adminClient() {
  const {
    url,
    serviceKey,
  } =
    serverConfig()

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

function ownerClient(
  accessToken
) {
  const {
    url,
    anonKey,
  } =
    serverConfig()

  return createClient(
    url,
    anonKey,
    {
      global: {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },

      auth: {
        persistSession:
          false,

        autoRefreshToken:
          false,
      },
    }
  )
}

function cleanText(
  value,
  max = 500
) {
  return String(
    value || ''
  )
    .trim()
    .slice(0, max)
}

function digits(
  value,
  max = 30
) {
  return String(
    value || ''
  )
    .replace(/\D/g, '')
    .slice(0, max)
}

function normalizeMobile(
  value
) {
  return digits(
    value,
    15
  )
}

function normalizeAccount(
  value
) {
  return digits(
    value,
    20
  )
}

function normalizeIfsc(
  value
) {
  return cleanText(
    value,
    11
  ).toUpperCase()
}

function remainingRefund(
  caseRow
) {
  return Math.max(
    0,
    Math.round(
      (
        Number(
          caseRow?.refund_amount ||
            0
        ) -
        Number(
          caseRow
            ?.refund_completed_amount ||
            0
        )
      ) *
        100
    ) / 100
  )
}

function publicEligibility(
  caseRow,
  order
) {
  const paymentMethod =
    cleanText(
      order?.payment_method,
      30
    ).toLowerCase()

  const caseStatus =
    cleanText(
      caseRow?.status,
      50
    ).toLowerCase()

  const caseType =
    cleanText(
      caseRow?.case_type,
      50
    ).toLowerCase()

  const remaining =
    remainingRefund(
      caseRow
    )

  if (
    paymentMethod !== 'cod'
  ) {
    return {
      eligible: false,
      reason:
        'Bank details are required only for COD refunds.',
    }
  }

  if (
    caseRow?.refund_required !==
    true
  ) {
    return {
      eligible: false,
      reason:
        'This case does not require a refund.',
    }
  }

  if (remaining <= 0) {
    return {
      eligible: false,
      reason:
        'This refund is already complete.',
    }
  }

  if (
    caseStatus !==
    'refund_pending'
  ) {
    return {
      eligible: false,
      reason:
        'The refund is not ready for bank details yet.',
    }
  }

  if (
    caseType ===
      'return_refund' &&
    !caseRow?.return_received_at
  ) {
    return {
      eligible: false,
      reason:
        'The returned item must be received and verified by the store first.',
    }
  }

  return {
    eligible: true,
    reason: '',
  }
}

async function loadPublicContext({
  admin,
  restaurantCode,
  caseCode,
  orderCode,
  customerMobile,
}) {
  const code = cleanText(restaurantCode, 120)
  const afterSalesCode = cleanText(caseCode, 120)
  const deliveryOrderCode = cleanText(orderCode, 120)
  const mobile = normalizeMobile(customerMobile)

  if (!code || !deliveryOrderCode || mobile.length < 10) {
    const error = new Error(
      'Restaurant code, Delivery order and customer mobile are required.'
    )
    error.statusCode = 400
    throw error
  }

  const { data: restaurant, error: restaurantError } =
    await admin
      .from('restaurants')
      .select('id, restaurant_code')
      .ilike('restaurant_code', code)
      .maybeSingle()

  if (restaurantError) throw restaurantError
  if (!restaurant) {
    const error = new Error('Restaurant was not found.')
    error.statusCode = 404
    throw error
  }

  const { data: order, error: orderError } =
    await admin
      .from('delivery_orders')
      .select(`
        id,
        restaurant_id,
        order_code,
        customer_name,
        customer_mobile,
        payment_method,
        payment_status,
        total_amount
      `)
      .eq('restaurant_id', restaurant.id)
      .ilike('order_code', deliveryOrderCode)
      .maybeSingle()

  if (orderError) throw orderError
  if (!order) {
    const error = new Error('Delivery order was not found.')
    error.statusCode = 404
    throw error
  }

  if (normalizeMobile(order.customer_mobile) !== mobile) {
    const error = new Error('Customer mobile verification failed.')
    error.statusCode = 403
    throw error
  }

  let caseQuery =
    admin
      .from('delivery_after_sales_cases')
      .select(`
        id,
        case_code,
        restaurant_id,
        original_order_id,
        case_type,
        status,
        customer_name,
        customer_mobile,
        refund_required,
        refund_amount,
        refund_completed_amount,
        refund_status,
        refund_method,
        return_received_at,
        resolved_at,
        created_at,
        updated_at
      `)
      .eq('restaurant_id', restaurant.id)
      .eq('original_order_id', order.id)

  if (afterSalesCode) {
    caseQuery = caseQuery.ilike('case_code', afterSalesCode)
  } else {
    caseQuery = caseQuery
      .eq('refund_required', true)
      .in('status', ['refund_pending', 'resolved'])
      .order('created_at', { ascending: false })
      .limit(1)
  }

  const { data: caseRow, error: caseError } =
    await caseQuery.maybeSingle()

  if (caseError) throw caseError
  if (!caseRow) {
    const error = new Error(
      afterSalesCode
        ? 'Refund case was not found.'
        : 'No approved COD refund is ready for this Delivery order yet.'
    )
    error.statusCode = 404
    throw error
  }

  if (normalizeMobile(caseRow.customer_mobile) !== mobile) {
    const error = new Error('Customer mobile verification failed.')
    error.statusCode = 403
    throw error
  }

  return { restaurant, caseRow, order, mobile }
}

async function loadSafeBankStatus({
  admin,
  caseId,
}) {
  const {
    data: bank,
    error: bankError,
  } =
    await admin
      .from(
        'delivery_cod_refund_bank_details'
      )
      .select(
        `
          account_holder_name,
          bank_name,
          ifsc_code,
          account_number_last4,
          submitted_at,
          updated_at
        `
      )
      .eq(
        'case_id',
        caseId
      )
      .maybeSingle()

  if (bankError) {
    throw bankError
  }

  const {
    data: payment,
    error: paymentError,
  } =
    await admin
      .from(
        'delivery_cod_refund_payments'
      )
      .select(
        `
          amount,
          transaction_reference,
          paid_by_role,
          paid_by_name,
          paid_at
        `
      )
      .eq(
        'case_id',
        caseId
      )
      .maybeSingle()

  if (paymentError) {
    throw paymentError
  }

  return {
    bank:
      bank
        ? {
            accountHolderName:
              bank.account_holder_name,

            bankName:
              bank.bank_name,

            ifscCode:
              bank.ifsc_code,

            maskedAccountNumber:
              `••••${bank.account_number_last4}`,

            accountLast4:
              bank.account_number_last4,

            submittedAt:
              bank.submitted_at,

            updatedAt:
              bank.updated_at,
          }
        : null,

    payment:
      payment
        ? {
            amount:
              Number(
                payment.amount ||
                  0
              ),

            transactionReference:
              payment.transaction_reference,

            paidByRole:
              payment.paid_by_role,

            paidByName:
              payment.paid_by_name,

            paidAt:
              payment.paid_at,
          }
        : null,
  }
}

async function authenticateActor({
  admin,
  body,
  authorization,
}) {
  const actorType =
    cleanText(
      body?.actorType,
      20
    ).toLowerCase()

  if (
    actorType ===
    'manager'
  ) {
    const sessionToken =
      cleanText(
        body?.sessionToken,
        500
      )

    let authResult

    if (sessionToken) {
      const {
        data,
        error,
      } =
        await admin.rpc(
          'manager_delivery_auth_session',
          {
            p_session_token:
              sessionToken,
          }
        )

      if (error) {
        throw error
      }

      authResult = data
    } else {
      const {
        data,
        error,
      } =
        await admin.rpc(
          'manager_delivery_auth',
          {
            p_restaurant_id:
              cleanText(
                body
                  ?.restaurantId,
                80
              ),

            p_restaurant_code:
              cleanText(
                body
                  ?.restaurantCode,
                120
              ),

            p_user_id:
              cleanText(
                body?.userId,
                120
              ).toLowerCase(),

            p_password:
              String(
                body?.password ||
                  ''
              ),
          }
        )

      if (error) {
        throw error
      }

      authResult = data
    }

    if (
      !authResult?.success
    ) {
      const error =
        new Error(
          authResult?.message ||
            'Manager authentication failed.'
        )

      error.statusCode = 401
      throw error
    }

    return {
      actorType:
        'manager',

      restaurantId:
        cleanText(
          authResult
            ?.restaurantId,
          80
        ),

      actorName:
        cleanText(
          authResult
            ?.managerName ||
            'Manager',
          120
        ) ||
        'Manager',
    }
  }

  if (
    actorType ===
    'owner'
  ) {
    const restaurantId =
      cleanText(
        body?.restaurantId,
        80
      )

    const caseId =
      cleanText(
        body?.caseId,
        80
      )

    const accessToken =
      String(
        authorization || ''
      )
        .replace(
          /^Bearer\s+/i,
          ''
        )
        .trim()

    if (
      !restaurantId ||
      !caseId ||
      !accessToken
    ) {
      const error =
        new Error(
          'Owner authentication details are missing.'
        )

      error.statusCode = 401
      throw error
    }

    const client =
      ownerClient(
        accessToken
      )

    const {
      data,
      error,
    } =
      await client.rpc(
        'owner_delivery_get_after_sales',
        {
          p_restaurant_id:
            restaurantId,

          p_case_id:
            caseId,
        }
      )

    if (error) {
      throw error
    }

    if (!data?.success) {
      const authError =
        new Error(
          data?.message ||
            'Owner is not authorized for this COD refund.'
        )

      authError.statusCode =
        401

      throw authError
    }

    return {
      actorType:
        'owner',

      restaurantId,

      actorName:
        'Owner',
    }
  }

  const error =
    new Error(
      'Refund actor must be manager or owner.'
    )

  error.statusCode = 401
  throw error
}

async function loadManagerCaseContext({
  admin,
  actor,
  caseId,
}) {
  const {
    data: caseRow,
    error: caseError,
  } =
    await admin
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
          customer_name,
          customer_mobile,
          refund_required,
          refund_amount,
          refund_completed_amount,
          refund_status,
          refund_method,
          return_received_at,
          resolved_at
        `
      )
      .eq(
        'id',
        caseId
      )
      .eq(
        'restaurant_id',
        actor.restaurantId
      )
      .maybeSingle()

  if (caseError) {
    throw caseError
  }

  if (!caseRow) {
    const error =
      new Error(
        'COD refund case was not found.'
      )

    error.statusCode = 404
    throw error
  }

  const {
    data: order,
    error: orderError,
  } =
    await admin
      .from(
        'delivery_orders'
      )
      .select(
        `
          id,
          order_code,
          restaurant_id,
          customer_name,
          customer_mobile,
          payment_method,
          payment_status,
          total_amount
        `
      )
      .eq(
        'id',
        caseRow.original_order_id
      )
      .eq(
        'restaurant_id',
        actor.restaurantId
      )
      .maybeSingle()

  if (orderError) {
    throw orderError
  }

  if (!order) {
    const error =
      new Error(
        'Original Delivery order was not found.'
      )

    error.statusCode = 404
    throw error
  }

  if (
    cleanText(
      order.payment_method,
      30
    ).toLowerCase() !==
    'cod'
  ) {
    const error =
      new Error(
        'This bank-transfer flow is only for COD orders.'
      )

    error.statusCode = 409
    throw error
  }

  return {
    caseRow,
    order,
  }
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

    const action =
      cleanText(
        body?.action,
        50
      ).toLowerCase()

    const admin =
      adminClient()

    /*
     * ---------------------------------------------------------
     * CUSTOMER: SAFE COD REFUND STATUS
     * ---------------------------------------------------------
     */
    if (
      action ===
      'status'
    ) {
      const context =
        await loadPublicContext(
          {
            admin,

            restaurantCode:
              body
                ?.restaurantCode,

            caseCode:
              body?.caseCode,

            orderCode:
              body?.orderCode,

            customerMobile:
              body
                ?.customerMobile,
          }
        )

      const eligibility =
        publicEligibility(
          context.caseRow,
          context.order
        )

      const safeStatus =
        await loadSafeBankStatus(
          {
            admin,

            caseId:
              context
                .caseRow
                .id,
          }
        )

      return json({
        success: true,

        case: {
          id:
            context
              .caseRow
              .id,

          caseCode:
            context
              .caseRow
              .case_code,

          caseType:
            context
              .caseRow
              .case_type,

          status:
            context
              .caseRow
              .status,

          orderCode:
            context
              .order
              .order_code,

          paymentMethod:
            context
              .order
              .payment_method,

          refundRequired:
            context
              .caseRow
              .refund_required,

          refundAmount:
            Number(
              context
                .caseRow
                .refund_amount ||
                0
            ),

          refundCompletedAmount:
            Number(
              context
                .caseRow
                .refund_completed_amount ||
                0
            ),

          remainingAmount:
            remainingRefund(
              context.caseRow
            ),

          refundStatus:
            context
              .caseRow
              .refund_status,

          refundMethod:
            context
              .caseRow
              .refund_method,
        },

        eligibleForBankDetails:
          eligibility
            .eligible,

        bankDetailsReason:
          eligibility.reason,

        bankDetailsSubmitted:
          Boolean(
            safeStatus.bank
          ),

        bank:
          safeStatus.bank,

        refundPayment:
          safeStatus.payment,
      })
    }

    /*
     * ---------------------------------------------------------
     * CUSTOMER: SUBMIT/REPLACE BANK DETAILS
     * ---------------------------------------------------------
     */
    if (
      action ===
      'submit_bank_details'
    ) {
      const context =
        await loadPublicContext(
          {
            admin,

            restaurantCode:
              body
                ?.restaurantCode,

            caseCode:
              body?.caseCode,

            orderCode:
              body?.orderCode,

            customerMobile:
              body
                ?.customerMobile,
          }
        )

      const eligibility =
        publicEligibility(
          context.caseRow,
          context.order
        )

      if (
        !eligibility.eligible
      ) {
        return json(
          {
            success:
              false,

            message:
              eligibility.reason,
          },
          409
        )
      }

      const accountHolderName =
        cleanText(
          body
            ?.accountHolderName,
          120
        )

      const bankName =
        cleanText(
          body?.bankName,
          120
        )

      const ifscCode =
        normalizeIfsc(
          body?.ifscCode
        )

      const accountNumber =
        normalizeAccount(
          body
            ?.accountNumber
        )

      const confirmAccountNumber =
        normalizeAccount(
          body
            ?.confirmAccountNumber
        )

      if (
        accountHolderName
          .length < 2
      ) {
        return json(
          {
            success:
              false,

            message:
              'Enter the account holder name.',
          },
          400
        )
      }

      if (
        bankName.length < 2
      ) {
        return json(
          {
            success:
              false,

            message:
              'Enter the bank name.',
          },
          400
        )
      }

      if (
        !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(
          ifscCode
        )
      ) {
        return json(
          {
            success:
              false,

            message:
              'Enter a valid 11-character IFSC code.',
          },
          400
        )
      }

      if (
        !/^[0-9]{6,20}$/.test(
          accountNumber
        )
      ) {
        return json(
          {
            success:
              false,

            message:
              'Enter a valid bank account number containing 6 to 20 digits.',
          },
          400
        )
      }

      if (
        accountNumber !==
        confirmAccountNumber
      ) {
        return json(
          {
            success:
              false,

            message:
              'Account numbers do not match.',
          },
          400
        )
      }

      const encrypted =
        encryptCodRefundAccountNumber(
          accountNumber
        )

      const {
        data,
        error,
      } =
        await admin.rpc(
          'delivery_cod_refund_save_bank_details',
          {
            p_case_id:
              context
                .caseRow
                .id,

            p_restaurant_id:
              context
                .restaurant
                .id,

            p_order_id:
              context
                .order
                .id,

            p_customer_mobile:
              context.mobile,

            p_account_holder_name:
              accountHolderName,

            p_bank_name:
              bankName,

            p_ifsc_code:
              ifscCode,

            p_account_number_ciphertext:
              encrypted
                .ciphertext,

            p_account_number_iv:
              encrypted.iv,

            p_account_number_tag:
              encrypted.tag,

            p_account_number_last4:
              encrypted.last4,
          }
        )

      if (error) {
        throw error
      }

      if (!data?.success) {
        return json(
          {
            success:
              false,

            message:
              data?.message ||
              'Unable to save COD refund bank details.',
          },
          409
        )
      }

      return json({
        success: true,

        message:
          'Bank details submitted securely for the COD refund.',

        bank: {
          accountHolderName,
          bankName,
          ifscCode,

          maskedAccountNumber:
            `••••${encrypted.last4}`,

          accountLast4:
            encrypted.last4,
        },

        refund: data,
      })
    }

    /*
     * ---------------------------------------------------------
     * MANAGER / OWNER AUTHENTICATED ACTIONS
     * ---------------------------------------------------------
     */
    if (
      action ===
        'manager_details' ||
      action ===
        'mark_paid'
    ) {
      const caseId =
        cleanText(
          body?.caseId,
          80
        )

      if (!caseId) {
        return json(
          {
            success:
              false,

            message:
              'After-sales case ID is required.',
          },
          400
        )
      }

      const actor =
        await authenticateActor(
          {
            admin,
            body,

            authorization:
              request
                .headers
                .get(
                  'authorization'
                ),
          }
        )

      const context =
        await loadManagerCaseContext(
          {
            admin,
            actor,
            caseId,
          }
        )

      if (
        action ===
        'manager_details'
      ) {
        const {
          data: bank,
          error: bankError,
        } =
          await admin
            .from(
              'delivery_cod_refund_bank_details'
            )
            .select(
              `
                account_holder_name,
                bank_name,
                ifsc_code,
                account_number_ciphertext,
                account_number_iv,
                account_number_tag,
                account_number_last4,
                submitted_at,
                updated_at
              `
            )
            .eq(
              'case_id',
              caseId
            )
            .maybeSingle()

        if (bankError) {
          throw bankError
        }

        const {
          data: payment,
          error:
            paymentError,
        } =
          await admin
            .from(
              'delivery_cod_refund_payments'
            )
            .select(
              `
                amount,
                transaction_reference,
                paid_by_role,
                paid_by_name,
                paid_at
              `
            )
            .eq(
              'case_id',
              caseId
            )
            .maybeSingle()

        if (paymentError) {
          throw paymentError
        }

        let bankDetails =
          null

        if (bank) {
          const accountNumber =
            decryptCodRefundAccountNumber(
              {
                ciphertext:
                  bank
                    .account_number_ciphertext,

                iv:
                  bank
                    .account_number_iv,

                tag:
                  bank
                    .account_number_tag,
              }
            )

          bankDetails = {
            accountHolderName:
              bank
                .account_holder_name,

            bankName:
              bank.bank_name,

            ifscCode:
              bank.ifsc_code,

            accountNumber,

            maskedAccountNumber:
              `••••${bank.account_number_last4}`,

            accountLast4:
              bank
                .account_number_last4,

            submittedAt:
              bank.submitted_at,

            updatedAt:
              bank.updated_at,
          }
        }

        return json({
          success: true,

          case: {
            id:
              context
                .caseRow.id,

            caseCode:
              context
                .caseRow
                .case_code,

            caseType:
              context
                .caseRow
                .case_type,

            status:
              context
                .caseRow
                .status,

            orderCode:
              context
                .order
                .order_code,

            customerName:
              context
                .caseRow
                .customer_name ||
              context
                .order
                .customer_name,

            customerMobile:
              context
                .caseRow
                .customer_mobile ||
              context
                .order
                .customer_mobile,

            refundAmount:
              Number(
                context
                  .caseRow
                  .refund_amount ||
                  0
              ),

            refundCompletedAmount:
              Number(
                context
                  .caseRow
                  .refund_completed_amount ||
                  0
              ),

            remainingAmount:
              remainingRefund(
                context
                  .caseRow
              ),

            refundStatus:
              context
                .caseRow
                .refund_status,

            refundMethod:
              context
                .caseRow
                .refund_method,
          },

          bankDetailsSubmitted:
            Boolean(
              bankDetails
            ),

          bank:
            bankDetails,

          payment:
            payment
              ? {
                  amount:
                    Number(
                      payment.amount ||
                        0
                    ),

                  transactionReference:
                    payment
                      .transaction_reference,

                  paidByRole:
                    payment
                      .paid_by_role,

                  paidByName:
                    payment
                      .paid_by_name,

                  paidAt:
                    payment
                      .paid_at,
                }
              : null,
        })
      }

      const transactionReference =
        cleanText(
          body
            ?.transactionReference,
          120
        )

      if (
        transactionReference
          .length < 4
      ) {
        return json(
          {
            success:
              false,

            message:
              'Enter the bank transaction / UTR reference.',
          },
          400
        )
      }

      const remaining =
        remainingRefund(
          context.caseRow
        )

      const requestedAmount =
        body?.amount == null ||
        String(
          body.amount
        ).trim() === ''
          ? remaining
          : Number(
              body.amount
            )

      if (
        !Number.isFinite(
          requestedAmount
        ) ||
        requestedAmount <= 0
      ) {
        return json(
          {
            success:
              false,

            message:
              'Enter a valid refund amount.',
          },
          400
        )
      }

      const {
        data,
        error,
      } =
        await admin.rpc(
          'delivery_cod_refund_record_payment',
          {
            p_case_id:
              context
                .caseRow.id,

            p_amount:
              requestedAmount,

            p_transaction_reference:
              transactionReference,

            p_paid_by_role:
              actor.actorType,

            p_paid_by_name:
              actor.actorName,

            p_note:
              cleanText(
                body?.note,
                1000
              ),
          }
        )

      if (error) {
        throw error
      }

      if (!data?.success) {
        return json(
          {
            success:
              false,

            message:
              data?.message ||
              'Unable to record COD bank refund.',
          },
          409
        )
      }

      return json({
        success: true,
        ...data,
      })
    }

    return json(
      {
        success: false,

        message:
          'Unsupported COD refund action.',
      },
      400
    )
  } catch (error) {
    /*
     * Do not log request bodies or bank account data.
     */
    console.error(
      'COD bank refund API error:',
      error?.message ||
        'Unknown error'
    )

    return json(
      {
        success: false,

        message:
          error?.message ||
          'Unable to process COD bank refund.',
      },
      Number(
        error?.statusCode ||
        500
      )
    )
  }
}