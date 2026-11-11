
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import {
  encryptRazorpaySecret,
} from '@/lib/server/razorpayCrypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const KEY_ID =
  /^rzp_(test|live)_[A-Za-z0-9]+$/

function reply(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

function bearerToken(request) {
  const authorization =
    request.headers.get('authorization') || ''

  return authorization.match(
    /^Bearer\s+(.+)$/i
  )?.[1] || ''
}

export async function POST(request) {
  try {
    const token = bearerToken(request)

    if (!token) {
      return reply({
        success: false,
        message: 'Owner login required.',
      }, 401)
    }

    const db = getAdminSupabase()

    // Verify the token with Supabase Auth.
    // Never trust a user ID supplied by the browser.
    const {
      data: { user } = {},
      error: authError,
    } = await db.auth.getUser(token)

    if (authError || !user) {
      return reply({
        success: false,
        message: 'Invalid or expired login session.',
      }, 401)
    }

    const contentType =
      request.headers.get('content-type') || ''

    if (!contentType
      .toLowerCase()
      .startsWith('application/json')) {
      return reply({
        success: false,
        message: 'JSON request required.',
      }, 415)
    }

    // Reject excessively large request bodies.
    const rawBody = await request.text()

    if (Buffer.byteLength(rawBody, 'utf8') > 8192) {
      return reply({
        success: false,
        message: 'Request body is too large.',
      }, 413)
    }

    let body

    try {
      body = JSON.parse(rawBody)
    } catch {
      return reply({
        success: false,
        message: 'Invalid JSON request.',
      }, 400)
    }

    const storeId = body?.storeId
    const requestId = body?.requestId
    const keyId = body?.keyId
    const keySecret = body?.keySecret

    if (
      typeof storeId !== 'string' ||
      !UUID.test(storeId) ||
      typeof requestId !== 'string' ||
      !UUID.test(requestId)
    ) {
      return reply({
        success: false,
        message: 'Invalid store or approval request.',
      }, 400)
    }

    if (
      typeof keyId !== 'string' ||
      !KEY_ID.test(keyId) ||
      keyId.length > 200 ||
      typeof keySecret !== 'string' ||
      keySecret.length < 8 ||
      keySecret.length > 1024 ||
      keySecret.trim() !== keySecret
    ) {
      return reply({
        success: false,
        message: 'Invalid Razorpay credentials.',
      }, 400)
    }

    // Verify the user is an owner of this store.
    const {
      data: member,
      error: memberError,
    } = await db
      .from('ecommerce_store_members')
      .select('user_id')
      .eq('store_id', storeId)
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .maybeSingle()

    if (memberError) {
      throw memberError
    }

    if (!member) {
      return reply({
        success: false,
        message: 'Store owner permission required.',
      }, 403)
    }

    // Only approved and active stores may configure
    // their own Razorpay credentials.
    const {
      data: store,
      error: storeError,
    } = await db
      .from('ecommerce_stores')
      .select('id')
      .eq('id', storeId)
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .maybeSingle()

    if (storeError) {
      throw storeError
    }

    if (!store) {
      return reply({
        success: false,
        message: 'Store is not approved or active.',
      }, 403)
    }

    // Preliminary approval check.
    // The database function repeats this check
    // under a row lock to prevent race conditions.
    const {
      data: approval,
      error: approvalError,
    } = await db
      .from('ecommerce_razorpay_edit_requests')
      .select(
        'id,store_id,requester_user_id,status,expires_at,consumed_at'
      )
      .eq('id', requestId)
      .eq('store_id', storeId)
      .eq('requester_user_id', user.id)
      .maybeSingle()

    if (approvalError) {
      throw approvalError
    }

    if (
      !approval ||
      approval.status !== 'approved' ||
      approval.consumed_at !== null ||
      !approval.expires_at ||
      Date.parse(approval.expires_at) <= Date.now()
    ) {
      return reply({
        success: false,
        message:
          'Approval is missing, expired, or already used.',
      }, 409)
    }

    // Encrypt before sending data to PostgreSQL.
    // Never store or log the plaintext secret.
    const encryptedSecret =
      encryptRazorpaySecret(keySecret, storeId)

    if (
      encryptedSecret.length < 40 ||
      encryptedSecret.length > 4096
    ) {
      return reply({
        success: false,
        message: 'Unable to prepare encrypted credentials.',
      }, 400)
    }

    // The installed SQL function:
    // 1. Locks the approval request.
    // 2. Revalidates ownership and expiry.
    // 3. Saves encrypted credentials.
    // 4. Marks approval consumed.
    // 5. Writes the audit record.
    // All in one database transaction.
    const {
      data: saved,
      error: saveError,
    } = await db.rpc(
      'ecommerce_save_razorpay_credentials',
      {
        p_store_id: storeId,
        p_request_id: requestId,
        p_actor_user_id: user.id,
        p_key_id: keyId,
        p_encrypted_secret: encryptedSecret,
      }
    )

    if (saveError) {
      if (
        ['P0001', 'P0002'].includes(saveError.code)
      ) {
        return reply({
          success: false,
          message:
            'Approval is invalid, expired, or already used.',
        }, 409)
      }

      if (saveError.code === '42501') {
        return reply({
          success: false,
          message: 'Store permission denied.',
        }, 403)
      }

      console.error(
        '[ECOMMERCE RAZORPAY CREDENTIAL SAVE]',
        saveError.code || 'DATABASE_ERROR'
      )

      return reply({
        success: false,
        message: 'Unable to save Razorpay credentials.',
      }, 500)
    }

    if (saved !== true) {
      return reply({
        success: false,
        message: 'Credential save was not confirmed.',
      }, 500)
    }

    return reply({
      success: true,
      message:
        'Razorpay credentials saved securely. Your one-time permission has been used.',
      requestStatus: 'consumed',
    })
  } catch (error) {
    // Do not log request bodies, credentials,
    // authorization headers, or encryption keys.
    console.error(
      '[ECOMMERCE RAZORPAY SAVE ERROR]',
      error?.name || 'UNEXPECTED_ERROR'
    )

    return reply({
      success: false,
      message: 'Unable to save Razorpay credentials.',
    }, 500)
  }
}
