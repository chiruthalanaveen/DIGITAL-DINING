import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// STEP 3: safety PRE-FLIGHT ONLY. This endpoint never deletes or disables accounts.
// A preflight result is a point-in-time assessment, NOT execution authorization.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_REQUEST_STATUSES = new Set(['in_review', 'approved'])
const MAX_RESTAURANTS = 100

function respond(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function sessionOrNull(request) {
  try {
    const session = requireAdmin(request)
    return typeof session?.email === 'string' && session.email.trim() ? session : null
  } catch {
    return null
  }
}

function mutationOriginAllowed(request) {
  const origin = request.headers.get('origin')
  const target = new URL(request.url).origin
  const site = request.headers.get('sec-fetch-site')
  return Boolean(origin && origin === target && (!site || site === 'same-origin'))
}

function makeFinding(code, severity, explanation) {
  return { code, severity, explanation }
}

function uuidArray(items) {
  if (!Array.isArray(items) || items.length > MAX_RESTAURANTS) return null
  const ids = items.map(String)
  return ids.every(id => UUID_RE.test(id)) ? [...new Set(ids)].sort() : null
}

// bigint is required: wallet figures are stored in bigint columns and may exceed
// Number.MAX_SAFE_INTEGER; never silently round money or convert to float.
function nonnegativePaise(value) {
  try {
    if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null
    if (typeof value === 'number' && !Number.isSafeInteger(value)) return null
    const text = String(value)
    if (!/^\d+$/.test(text)) return null
    const parsed = BigInt(text)
    return parsed >= 0n ? parsed : null
  } catch {
    return null
  }
}

function summarize(run) {
  return {
    id: run.id,
    requestId: run.request_id,
    checkedAt: run.checked_at,
    checkedBy: run.checked_by_email,
    outcome: run.outcome,
    findings: Array.isArray(run.findings) ? run.findings : [],
    restaurantCount: run.restaurant_count,
    walletCount: run.wallet_count,
    walletsWithBalance: run.wallets_with_balance,
    walletsWithPendingFees: run.wallets_with_pending_fees,
  }
}

// Returns only a server-authenticated Super Admin's latest saved preflight.
export async function GET(request) {
  if (!sessionOrNull(request)) {
    return respond({ success: false, message: 'Super Admin sign-in required.' }, 401)
  }

  const requestId = new URL(request.url).searchParams.get('requestId') || ''
  if (!UUID_RE.test(requestId)) {
    return respond({ success: false, message: 'A valid deletion request ID is required.' }, 400)
  }

  try {
    const admin = getAdminSupabase()
    const { data: requestRow, error: requestError } = await admin
      .from('privacy_deletion_requests')
      .select('id,request_role')
      .eq('id', requestId)
      .maybeSingle()
    if (requestError) throw requestError
    if (!requestRow || requestRow.request_role !== 'restaurant_owner') {
      return respond({ success: false, message: 'Owner deletion request not found.' }, 404)
    }

    const { data, error } = await admin
      .from('privacy_deletion_preflight_runs')
      .select('id,request_id,checked_at,checked_by_email,outcome,findings,restaurant_count,wallet_count,wallets_with_balance,wallets_with_pending_fees')
      .eq('request_id', requestId)
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return respond({ success: true, run: data ? summarize(data) : null })
  } catch (error) {
    console.error('[PRIVACY PREFLIGHT GET]', error)
    return respond({ success: false, message: 'Unable to read preflight results. Verify that Step 3 SQL is installed.' }, 500)
  }
}

// Runs non-destructive checks and saves the result to the audit table.
// It does NOT modify approval status, Supabase Auth, staff, orders or wallets.
export async function POST(request) {
  const session = sessionOrNull(request)
  if (!session) return respond({ success: false, message: 'Super Admin sign-in required.' }, 401)
  if (!mutationOriginAllowed(request)) {
    return respond({ success: false, message: 'Cross-origin changes are not permitted.' }, 403)
  }
  if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    return respond({ success: false, message: 'JSON body required.' }, 415)
  }

  const body = await request.json().catch(() => null)
  if (!body || Array.isArray(body) || typeof body !== 'object' ||
      !UUID_RE.test(String(body.requestId || '')) || body.confirmationText !== 'RUN SAFETY CHECK') {
    return respond({ success: false, message: 'Choose a valid request and confirm RUN SAFETY CHECK.' }, 400)
  }

  try {
    const admin = getAdminSupabase()
    const { data: requestRow, error: requestError } = await admin
      .from('privacy_deletion_requests')
      .select('id,auth_user_id,request_role,restaurant_ids,status')
      .eq('id', body.requestId)
      .maybeSingle()
    if (requestError) throw requestError
    if (!requestRow || requestRow.request_role !== 'restaurant_owner') {
      return respond({ success: false, message: 'Owner deletion request not found.' }, 404)
    }
    if (!ALLOWED_REQUEST_STATUSES.has(requestRow.status)) {
      return respond({ success: false, message: 'Start review first. This check applies to in-review or approved owner requests.' }, 409)
    }

    const findings = []
    const blocker = (code, explanation) => findings.push(makeFinding(code, 'blocker', explanation))
    const review = (code, explanation) => findings.push(makeFinding(code, 'manual_review', explanation))
    const requested = uuidArray(requestRow.restaurant_ids)
    const userId = String(requestRow.auth_user_id || '')

    if (!UUID_RE.test(userId)) blocker('INVALID_AUTH_USER', 'Stored authentication user ID is invalid.')
    if (!requested?.length) blocker('INVALID_OR_EMPTY_RESTAURANTS', 'The saved restaurant ownership snapshot is empty or invalid.')

    let actual = []
    if (UUID_RE.test(userId)) {
      // Verify ownership independently of anything in the request body.
      // An explicit owner_id always wins over the legacy restaurant.id match.
      const { data: directOwned, error: directError } = await admin
        .from('restaurants')
        .select('id,owner_id')
        .eq('owner_id', userId)
        .limit(MAX_RESTAURANTS + 1)
      if (directError) throw directError

      const { data: legacyOwned, error: legacyError } = await admin
        .from('restaurants')
        .select('id,owner_id')
        .is('owner_id', null)
        .eq('id', userId)
        .limit(2)
      if (legacyError) throw legacyError

      const linked = [...(directOwned || []), ...(legacyOwned || [])]
      actual = [...new Set(linked.map(row => row.id))].sort()
      if (actual.length > MAX_RESTAURANTS || (directOwned || []).length > MAX_RESTAURANTS) {
        blocker('TOO_MANY_RESTAURANTS', 'Unusually large number of linked restaurants; manual ownership investigation required.')
      }
      if (!actual.length) blocker('OWNER_NO_LONGER_FOUND', 'No currently owned restaurant could be verified.')
      if (!requested || requested.join(',') !== actual.join(',')) {
        blocker('OWNERSHIP_CHANGED', 'Current restaurant ownership differs from the deletion request snapshot.')
      }

      // We verify the Auth record exists; we do not delete or revoke it.
      const { data: account, error: accountError } = await admin.auth.admin.getUserById(userId)
      if (accountError || !account?.user?.id) {
        blocker('AUTH_ACCOUNT_NOT_VERIFIED', 'The Supabase Auth account could not be verified. Investigate the identity before taking any action.')
      }
    }

    let walletCount = 0
    let walletsWithBalance = 0
    let walletsWithPendingFees = 0
    if (actual.length && actual.length <= MAX_RESTAURANTS) {
      const { data: wallets, error } = await admin
        .from('delivery_store_wallets')
        .select('restaurant_id,balance_paise,pending_fee_paise')
        .in('restaurant_id', actual)
      if (error) throw error
      walletCount = (wallets || []).length
      const walletIds = new Set()
      for (const wallet of wallets || []) {
        if (walletIds.has(wallet.restaurant_id)) {
          blocker('DUPLICATE_WALLETS', 'Duplicate wallet rows found for a restaurant.')
        }
        walletIds.add(wallet.restaurant_id)
        const balance = nonnegativePaise(wallet.balance_paise)
        const pending = nonnegativePaise(wallet.pending_fee_paise)
        if (balance === null || pending === null) {
          blocker('INVALID_WALLET_AMOUNTS', 'A wallet has missing or invalid monetary values.')
          continue
        }
        if (balance > 0n) walletsWithBalance += 1
        if (pending > 0n) walletsWithPendingFees += 1
      }
      if (walletIds.size !== actual.length) {
        blocker('MISSING_WALLETS', 'At least one linked restaurant does not have a wallet record.')
      }
      if (walletsWithBalance) {
        blocker('UNSETTLED_WALLET_BALANCE', 'At least one restaurant wallet retains a positive balance. A no-withdrawal policy does not authorize forfeiture on account deletion.')
      }
      if (walletsWithPendingFees) {
        blocker('PENDING_PLATFORM_FEES', 'At least one restaurant wallet has pending platform fees.')
      }
    }

    // These obligations cannot be verified from the current supplied schema.
    // Intentionally NEVER return execution-ready until each is audited.
    review('ACTIVE_ORDERS_AND_BOOKINGS_UNMAPPED', 'Verify open QR/DD MART orders, refunds, disputes and resort bookings against the actual database schema.')
    review('STAFF_AND_OTHER_ROLES_UNMAPPED', 'Confirm staff roles, active sessions, and whether this Supabase user has access to another business.')
    review('PAYOUTS_AND_RETENTION_UNMAPPED', 'Reconcile Razorpay payouts, wallet history, statutory accounting/tax records, and applicable retention requirements.')
    review('STORAGE_LOGS_AND_PROCESSORS_UNMAPPED', 'Inventory Supabase Storage, third-party providers, logs, caches, backup expiry and recipient notifications.')
    review('OWNERSHIP_SUCCESSION_UNCONFIRMED', 'Confirm whether the owner must transfer operations or close each restaurant before removing their identity.')

    const outcome = findings.some(f => f.severity === 'blocker') ? 'blocked' : 'manual_review_required'

    // Server-generated report only; nothing from the browser is used as evidence.
    // Audit write is required. It MUST NOT be interpreted as authorizing deletion.
    const { data: saved, error: saveError } = await admin
      .from('privacy_deletion_preflight_runs')
      .insert({
        request_id: requestRow.id,
        checked_by_email: session.email.trim().toLowerCase(),
        outcome,
        findings,
        restaurant_count: actual.length,
        wallet_count: walletCount,
        wallets_with_balance: walletsWithBalance,
        wallets_with_pending_fees: walletsWithPendingFees,
      })
      .select('id,request_id,checked_at,checked_by_email,outcome,findings,restaurant_count,wallet_count,wallets_with_balance,wallets_with_pending_fees')
      .single()
    if (saveError) throw saveError

    return respond({
      success: true,
      run: summarize(saved),
      message: 'Safety preflight saved. No user, restaurant, wallet, order, or staff data has been changed.',
    }, 201)
  } catch (error) {
    console.error('[PRIVACY PREFLIGHT POST]', error)
    return respond({ success: false, message: 'Unable to complete preflight. Check server logs and the Step 3 database setup. No deletion was performed.' }, 500)
  }
}