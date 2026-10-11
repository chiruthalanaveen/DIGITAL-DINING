import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function reply(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function parseRupeesToPaise(value, maximumRupees) {
  // Do not convert monetary strings through floating-point arithmetic.
  const text = String(value ?? '').trim()
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(paise) && paise <= maximumRupees * 100
    ? paise
    : null
}

function normalizeWallet(restaurant, wallet) {
  const balancePaise = Number(wallet?.balance_paise || 0)
  const pendingFeesPaise = Number(wallet?.pending_fee_paise || 0)
  const thresholdPaise = Number(wallet?.order_block_threshold_paise ?? 50000)
  const spendablePaise = balancePaise - pendingFeesPaise
  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name || 'Restaurant',
    restaurantCode: restaurant.restaurant_code || '',
    approvalStatus: restaurant.approval_status || 'pending',
    walletExists: Boolean(wallet),
    balancePaise,
    pendingFeesPaise,
    spendablePaise,
    platformFeePaise: Number(wallet?.platform_fee_paise ?? 500),
    thresholdPaise,
    minimumTopupPaise: Number(wallet?.min_topup_paise ?? 200000),
    lowBalance: spendablePaise <= thresholdPaise,
    updatedAt: wallet?.updated_at || null,
  }
}

export async function GET(request) {
  const session = requireAdmin(request)
  if (!session) return reply({ success: false, message: 'Super Admin login required.' }, 401)

  try {
    const url = new URL(request.url)
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '20', 10) || 20))
    const search = String(url.searchParams.get('search') || '').trim().slice(0, 100)

    const admin = getAdminSupabase()
    let query = admin
      .from('restaurants')
      .select('id,name,restaurant_code,approval_status,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (search) query = query.ilike('name', `%${search}%`)

    const { data: restaurants, count, error: restaurantError } = await query.range(
      (page - 1) * pageSize,
      page * pageSize - 1
    )
    if (restaurantError) throw restaurantError

    const ids = (restaurants || []).map((restaurant) => restaurant.id)
    let wallets = []
    if (ids.length) {
      const { data, error } = await admin
        .from('delivery_store_wallets')
        .select('restaurant_id,balance_paise,pending_fee_paise,platform_fee_paise,order_block_threshold_paise,min_topup_paise,updated_at')
        .in('restaurant_id', ids)
      if (error) throw error
      wallets = data || []
    }

    const byId = new Map(wallets.map((wallet) => [wallet.restaurant_id, wallet]))
    return reply({
      success: true,
      page,
      pageSize,
      totalCount: count || 0,
      stores: (restaurants || []).map((restaurant) => normalizeWallet(restaurant, byId.get(restaurant.id))),
    })
  } catch (error) {
    console.error('[ADMIN WALLET SETTINGS GET]', error)
    return reply({ success: false, message: 'Unable to load wallet settings. Check server logs.' }, 500)
  }
}

export async function POST(request) {
  const session = requireAdmin(request)
  if (!session) return reply({ success: false, message: 'Super Admin login required.' }, 401)

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply({ success: false, message: 'A JSON request body is required.' }, 400)
    }

    const restaurantId = String(body.restaurantId || '').trim()
    if (!UUID_RE.test(restaurantId)) {
      return reply({ success: false, message: 'A valid restaurant ID is required.' }, 400)
    }

    // Explicit keys are required. This route never accepts balance edits,
    // pending-fee changes, top-ups or settlement operations.
    if (!Object.prototype.hasOwnProperty.call(body, 'platformFeeRupees') ||
        !Object.prototype.hasOwnProperty.call(body, 'thresholdRupees')) {
      return reply({ success: false, message: 'Both platformFeeRupees and thresholdRupees are required.' }, 400)
    }

    const platformFeePaise = parseRupeesToPaise(body.platformFeeRupees, 1000)
    const thresholdPaise = parseRupeesToPaise(body.thresholdRupees, 1000000)

    if (platformFeePaise === null) {
      return reply({ success: false, message: 'Platform fee must be between ₹0.00 and ₹1,000.00, with at most two decimals.' }, 400)
    }
    if (thresholdPaise === null) {
      return reply({ success: false, message: 'Minimum wallet balance threshold must be between ₹0.00 and ₹10,00,000.00.' }, 400)
    }

    const admin = getAdminSupabase()
    const { data: restaurant, error: restaurantError } = await admin
      .from('restaurants')
      .select('id,name,restaurant_code,approval_status')
      .eq('id', restaurantId)
      .maybeSingle()
    if (restaurantError) throw restaurantError
    if (!restaurant) return reply({ success: false, message: 'Restaurant not found.' }, 404)

    const { data: previous, error: previousError } = await admin
      .from('delivery_store_wallets')
      .select('restaurant_id,balance_paise,pending_fee_paise,platform_fee_paise,order_block_threshold_paise,min_topup_paise,updated_at')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    if (previousError) throw previousError
    if (!previous) {
      return reply({ success: false, message: 'No wallet exists for this restaurant. Check the wallet creation trigger before changing settings.' }, 409)
    }

    const { data: updated, error: updateError } = await admin
      .from('delivery_store_wallets')
      .update({
        platform_fee_paise: platformFeePaise,
        order_block_threshold_paise: thresholdPaise,
        updated_at: new Date().toISOString(),
      })
      .eq('restaurant_id', restaurantId)
      .select('restaurant_id,balance_paise,pending_fee_paise,platform_fee_paise,order_block_threshold_paise,min_topup_paise,updated_at')
      .single()
    if (updateError) throw updateError

    // Audit best-effort, with an explicit warning if it cannot be written.
    const { error: auditError } = await admin.from('admin_audit_logs').insert({
      actor_email: String(session.email || ''),
      action: 'update_delivery_wallet_settings',
      entity_type: 'delivery_store_wallets',
      entity_id: restaurantId,
      before_data: {
        platform_fee_paise: previous.platform_fee_paise,
        order_block_threshold_paise: previous.order_block_threshold_paise,
      },
      after_data: {
        platform_fee_paise: updated.platform_fee_paise,
        order_block_threshold_paise: updated.order_block_threshold_paise,
      },
    })
    if (auditError) console.error('[ADMIN WALLET AUDIT]', auditError)

    return reply({
      success: true,
      message: auditError
        ? 'Wallet settings saved, but audit logging failed. Check server logs.'
        : 'Wallet platform fee and low-balance threshold saved.',
      auditLogged: !auditError,
      store: normalizeWallet(restaurant, updated),
    })
  } catch (error) {
    console.error('[ADMIN WALLET SETTINGS POST]', error)
    return reply({ success: false, message: 'Unable to save wallet settings. Check server logs.' }, 500)
  }
}