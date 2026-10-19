import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const AMOUNT_RE = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/
const WALLET_COLUMNS = 'restaurant_id, platform_fee_paise, restaurant_platform_fee_paise, updated_at'

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function parseRupees(value) {
  if (typeof value !== 'string' || !AMOUNT_RE.test(value.trim())) return null
  const result = Math.round(Number(value) * 100)
  return Number.isSafeInteger(result) && result >= 0 && result <= 999999
    ? result
    : null
}

function parseStoredPaise(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}

function sanitizedWallet(row) {
  return {
    restaurant_id: row.restaurant_id,
    platform_fee_paise: parseStoredPaise(row.platform_fee_paise),
    restaurant_platform_fee_paise: parseStoredPaise(row.restaurant_platform_fee_paise),
    updated_at: row.updated_at || null,
  }
}

function adminOrError(request) {
  try {
    return { session: requireAdmin(request) }
  } catch (error) {
    console.error('[ADMIN RESTAURANT FEES] Session check failed:', error)
    return { session: null }
  }
}

export async function GET(request) {
  const { session } = adminOrError(request)
  if (!session) return json({ success: false, message: 'Admin authentication required.' }, 401)

  const restaurantId = new URL(request.url).searchParams.get('restaurantId') || ''
  if (!UUID_RE.test(restaurantId)) {
    return json({ success: false, message: 'A valid restaurant ID is required.' }, 400)
  }

  try {
    const admin = getAdminSupabase()
    const { data: restaurant, error: restaurantError } = await admin
      .from('restaurants').select('id').eq('id', restaurantId).maybeSingle()
    if (restaurantError) throw restaurantError
    if (!restaurant) return json({ success: false, message: 'Restaurant not found.' }, 404)

    const { data: wallet, error } = await admin
      .from('delivery_store_wallets')
      .select(WALLET_COLUMNS)
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    if (error) throw error

    return json({ success: true, routeVersion: 'restaurant-fees-get-post-v2', wallet: wallet ? sanitizedWallet(wallet) : null })
  } catch (error) {
    console.error('[ADMIN RESTAURANT FEES GET]', error)
    return json({ success: false, message: 'Unable to load restaurant fee settings.' }, 500)
  }
}

export async function POST(request) {
  const { session } = adminOrError(request)
  if (!session) return json({ success: false, message: 'Admin authentication required.' }, 401)

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ success: false, message: 'Invalid request.' }, 400)
  }
  const restaurantId = body.restaurantId
  const qrFeePaise = parseRupees(body.qrFeeRupees)
  const deliveryFeePaise = parseRupees(body.deliveryFeeRupees)
  const expectedQrFeePaise = parseStoredPaise(body.expectedQrFeePaise)
  const expectedDeliveryFeePaise = parseStoredPaise(body.expectedDeliveryFeePaise)

  if (
    typeof restaurantId !== 'string' || !UUID_RE.test(restaurantId) ||
    qrFeePaise === null || deliveryFeePaise === null ||
    expectedQrFeePaise === null || expectedDeliveryFeePaise === null
  ) {
    return json({
      success: false,
      message: 'Valid restaurant ID and platform fees of ₹0–₹9,999.99 are required.',
    }, 400)
  }

  try {
    const admin = getAdminSupabase()
    const { data: current, error: readError } = await admin
      .from('delivery_store_wallets')
      .select(WALLET_COLUMNS)
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    if (readError) throw readError
    if (!current) return json({ success: false, message: 'This restaurant does not have a wallet yet.' }, 404)

    const currentQr = parseStoredPaise(current.restaurant_platform_fee_paise)
    const currentDelivery = parseStoredPaise(current.platform_fee_paise)
    if (currentQr === null || currentDelivery === null) {
      return json({ success: false, message: 'Existing wallet rates are invalid; investigate before editing.' }, 409)
    }
    if (currentQr !== expectedQrFeePaise || currentDelivery !== expectedDeliveryFeePaise) {
      return json({ success: false, message: 'Fee settings changed since you opened this editor. Refresh fees before saving.' }, 409)
    }
    if (currentQr === qrFeePaise && currentDelivery === deliveryFeePaise) {
      return json({ success: true, wallet: sanitizedWallet(current), changed: false })
    }

    // Optimistic concurrency checks prevent overwriting another admin's pricing edit.
    // No balance, pending fees, minimum top-up, or fee-payer fields are written here.
    const { data: updated, error: updateError } = await admin
      .from('delivery_store_wallets')
      .update({
        restaurant_platform_fee_paise: qrFeePaise,
        platform_fee_paise: deliveryFeePaise,
        updated_at: new Date().toISOString(),
      })
      .eq('restaurant_id', restaurantId)
      .eq('restaurant_platform_fee_paise', currentQr)
      .eq('platform_fee_paise', currentDelivery)
      .select(WALLET_COLUMNS)
      .maybeSingle()
    if (updateError) throw updateError
    if (!updated) {
      return json({ success: false, message: 'Fees were edited concurrently. Refresh fees and try again.' }, 409)
    }

    // Follow the project's existing admin_audit_logs structure.
    const before = sanitizedWallet(current)
    const after = sanitizedWallet(updated)
    const { error: auditError } = await admin.from('admin_audit_logs').insert({
      actor_email: session.email || '',
      action: 'update_restaurant_platform_fees',
      entity_type: 'delivery_store_wallets',
      entity_id: restaurantId,
      before_data: before,
      after_data: after,
      metadata: {
        ip: (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '').slice(0, 300),
        user_agent: (request.headers.get('user-agent') || '').slice(0, 500),
      },
    })
    if (auditError) console.error('[ADMIN RESTAURANT FEES] Audit insert failed:', auditError)

    return json({
      success: true,
      changed: true,
      wallet: after,
      auditWarning: Boolean(auditError),
    })
  } catch (error) {
    console.error('[ADMIN RESTAURANT FEES POST]', error)
    return json({ success: false, message: 'Unable to save restaurant fee settings.' }, 500)
  }
}