
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const reply = (body, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  })

export async function POST(request, { params }) {
  const session = requireAdmin(request)

  if (!session?.email) {
    return reply({
      success: false,
      message: 'Admin authentication required.',
    }, 401)
  }

  const actorEmail = String(session.email)
    .trim()
    .toLowerCase()

  const { id } = await params

  if (!UUID.test(id || '')) {
    return reply({
      success: false,
      message: 'Invalid request ID.',
    }, 400)
  }

  const body = await request.json().catch(() => ({}))

  const decision = String(
    body?.decision || ''
  ).toLowerCase()

  const note = String(body?.note || '').trim()

  if (
    !['approved', 'rejected', 'revoked'].includes(decision) ||
    note.length > 1000 ||
    (decision === 'rejected' && !note)
  ) {
    return reply({
      success: false,
      message: 'Invalid decision or note.',
    }, 400)
  }

  try {
    const db = getAdminSupabase()

    const {
      data: previous,
      error: readError,
    } = await db
      .from('ecommerce_razorpay_edit_requests')
      .select('id,requester_user_id')
      .eq('id', id)
      .maybeSingle()

    if (readError) {
      throw readError
    }

    if (!previous) {
      return reply({
        success: false,
        message: 'Request not found.',
      }, 404)
    }

    // Super Admin uses email/cookie authentication,
    // not a Supabase administrator UUID.

    const {
      data: requester,
      error: requesterError,
    } = await db.auth.admin.getUserById(
      previous.requester_user_id
    )

    if (
      requesterError ||
      !requester?.user?.email
    ) {
      return reply({
        success: false,
        message: 'Unable to verify request owner.',
      }, 403)
    }

    // Do not allow the administrator to decide
    // their own store-owner request.
    if (
      requester.user.email.trim().toLowerCase() ===
      actorEmail
    ) {
      return reply({
        success: false,
        message: 'Cannot decide your own request.',
      }, 403)
    }

    // PostgreSQL handles the approval, expiry,
    // and audit insert in a single transaction.

    const {
      data,
      error,
    } = await db.rpc(
      'ecommerce_decide_razorpay_edit_request',
      {
        p_request_id: id,
        p_decision: decision,
        p_admin_email: actorEmail,
        p_note: note,
      }
    )

    if (error) {
      if (
        ['P0001', 'P0002'].includes(error.code)
      ) {
        return reply({
          success: false,
          message:
            'Request is no longer eligible for this decision.',
        }, 409)
      }

      console.error(
        '[ECOMMERCE RAZORPAY ADMIN DECISION]',
        error.code
      )

      return reply({
        success: false,
        message: 'Unable to process decision.',
      }, 500)
    }

    const updated = Array.isArray(data)
      ? data[0]
      : null

    if (!updated) {
      return reply({
        success: false,
        message: 'No decision returned.',
      }, 500)
    }

    return reply({
      success: true,
      message:
        decision === 'approved'
          ? 'Access approved for 30 minutes.'
          : decision === 'rejected'
            ? 'Request rejected.'
            : 'Access revoked.',
      request: {
        id: updated.request_id,
        store_id: updated.store_id,
        status: updated.status,
        expires_at: updated.expires_at,
      },
    })
  } catch {
    return reply({
      success: false,
      message: 'Unable to process request.',
    }, 500)
  }
}
