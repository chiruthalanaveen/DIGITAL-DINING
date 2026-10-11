import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function respond(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store, private', Vary: 'Authorization' },
  })
}

function istDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  // IST always has a UTC offset of +05:30 and no daylight-saving time.
  // Unlike locale formatting, this guarantees YYYY-MM-DD on every Node runtime.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

// Fetch today's settled PLATFORM FEE debit total independently of the 100-row
// history preview. All transaction amounts in our schema are >= 0; debit
// transaction types carry the direction. Boundaries use IST (UTC+05:30).
async function getTodaysDebits(admin, restaurantId, dayIST) {
  const start = new Date(`${dayIST}T00:00:00+05:30`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  let total = 0
  const pageSize = 1000

  for (let offset = 0; offset < 100000; offset += pageSize) {
    const { data, error } = await admin
      .from('delivery_wallet_transactions')
      .select('amount_paise')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      // Schema stores both credit and debit amounts as POSITIVE paise.
      // The transaction_type, not the sign, identifies daily platform fees.
      .eq('transaction_type', 'platform_fee_debit')
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    const rows = data || []
    for (const row of rows) {
      total += Number(row.amount_paise || 0)
    }
    if (rows.length < pageSize) return total
  }

  throw new Error('Daily wallet debit total exceeded the safe query limit.')
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const restaurantId = String(searchParams.get('restaurantId') || '').trim()
    if (!UUID_RE.test(restaurantId)) {
      return respond({ success: false, code: 'INVALID_RESTAURANT_ID', message: 'A valid restaurant ID is required.' }, 400)
    }

    // Manager sessions are separate from Supabase Auth owner sessions.
    // The token is created by create_staff_app_session and verified by
    // validate_staff_app_session with p_required_role='manager'.
    const authorization = String(request.headers.get('authorization') || '')
    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization)
    const managerToken = match?.[1] || ''
    if (!managerToken || managerToken.length > 2048) {
      return respond({ success: false, code: 'MANAGER_LOGIN_REQUIRED', message: 'Please sign in as a manager again.' }, 401)
    }

    const admin = getAdminSupabase()
    const { data: session, error: sessionError } = await admin.rpc(
      'validate_staff_app_session',
      { p_session_token: managerToken, p_required_role: 'manager' }
    )

    if (sessionError) {
      console.error('[MANAGER WALLET SESSION VALIDATION]', sessionError.message)
      return respond({ success: false, code: 'SESSION_CHECK_FAILED', message: 'Unable to verify the manager session.' }, 503)
    }
    if (session?.success !== true || String(session.restaurantId || '') !== restaurantId) {
      return respond({ success: false, code: 'MANAGER_ACCESS_DENIED', message: 'Manager session expired or does not belong to this business.' }, 403)
    }

    const { data: restaurant, error: restaurantError } = await admin
      .from('restaurants')
      .select('id,name,approval_status')
      .eq('id', restaurantId)
      .maybeSingle()
    if (restaurantError) throw restaurantError
    if (!restaurant || String(restaurant.approval_status || 'pending').toLowerCase() !== 'approved') {
      return respond({ success: false, code: 'STORE_NOT_APPROVED', message: 'This business is awaiting Super Admin approval.' }, 403)
    }

    const [walletQuery, transactionQuery] = await Promise.all([
      admin
        .from('delivery_store_wallets')
        .select('balance_paise,pending_fee_paise,platform_fee_paise,order_block_threshold_paise,updated_at')
        .eq('restaurant_id', restaurantId)
        .maybeSingle(),
      admin
        .from('delivery_wallet_transactions')
        .select('id,transaction_type,amount_paise,balance_after_paise,description,created_at')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    if (walletQuery.error) throw walletQuery.error
    if (transactionQuery.error) throw transactionQuery.error
    if (!walletQuery.data) {
      return respond({ success: false, code: 'WALLET_NOT_FOUND', message: 'Wallet has not been configured for this business.' }, 404)
    }

    const w = walletQuery.data
    const balancePaise = Number(w.balance_paise || 0)
    const pendingFeesPaise = Number(w.pending_fee_paise || 0)
    const spendablePaise = balancePaise - pendingFeesPaise
    const thresholdPaise = Number(w.order_block_threshold_paise || 0)
    const todayIST = istDate(new Date())
    const transactions = (transactionQuery.data || []).map((item) => ({
      id: item.id,
      type: String(item.transaction_type || ''),
      isDebit: ['platform_fee_debit', 'admin_debit'].includes(String(item.transaction_type || '')),
      amountPaise: Number(item.amount_paise || 0),
      balanceAfterPaise: Number(item.balance_after_paise || 0),
      description: String(item.description || ''),
      createdAt: item.created_at,
    }))

    // Includes all today's recorded debits, even if history preview shows 100 rows.
    const todayDebitsPaise = await getTodaysDebits(admin, restaurantId, todayIST)

    return respond({
      success: true,
      restaurantId,
      restaurantName: restaurant.name || '',
      wallet: {
        balancePaise,
        pendingFeesPaise,
        spendablePaise,
        platformFeePaise: Number(w.platform_fee_paise || 0),
        thresholdPaise,
        lowBalance: spendablePaise <= thresholdPaise,
        todayDebitsPaise,
        updatedAt: w.updated_at,
      },
      transactions,
      todayIST,
      readOnly: true,
    })
  } catch (error) {
    console.error('[MANAGER WALLET GET]', error)
    return respond({ success: false, message: 'Unable to load the manager wallet. Please try again.' }, 500)
  }
}
