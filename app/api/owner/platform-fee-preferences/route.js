// Next.js App Router: app/api/owner/platform-fee-preferences/route.js
// Security: only approved authenticated restaurant owner; amount changes
// are forbidden. The Super Admin/ERP remains the only fee-rate editor.
import { NextResponse } from 'next/server'
import { requireApprovedOwner } from '@/lib/server/ownerApproval'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function respond(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Vary': 'Authorization',
    },
  })
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return respond({ success: false, message: 'A JSON request body is required.' }, 400)
    }

    const restaurantId = String(payload.restaurantId || '').trim()
    if (!UUID_RE.test(restaurantId)) {
      return respond({ success: false, message: 'A valid restaurant ID is required.' }, 400)
    }

    // The owner can ONLY choose who bears the ERP-set fee.
    // Do not accept arbitrary wallet fields, numeric fee overrides, etc.
    const allowed = new Set(['restaurantId', 'restaurantChargeCustomer', 'deliveryChargeCustomer'])
    if (Object.keys(payload).some((key) => !allowed.has(key)) ||
        typeof payload.restaurantChargeCustomer !== 'boolean' ||
        typeof payload.deliveryChargeCustomer !== 'boolean') {
      return respond({
        success: false,
        message: 'Only the two customer-fee preferences may be changed. Platform fee amounts are ERP-controlled.',
      }, 400)
    }

    const access = await requireApprovedOwner(request, restaurantId)
    if (!access.ok) {
      return respond({ success: false, code: access.code, message: access.message }, access.status)
    }

    const admin = getAdminSupabase()
    const { data, error } = await admin
      .from('delivery_store_wallets')
      .update({
        restaurant_fee_charge_customer: payload.restaurantChargeCustomer,
        delivery_fee_charge_customer: payload.deliveryChargeCustomer,
        updated_at: new Date().toISOString(),
      })
      .eq('restaurant_id', access.restaurantId)
      .select('restaurant_id,restaurant_fee_charge_customer,delivery_fee_charge_customer,restaurant_platform_fee_paise,platform_fee_paise')
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return respond({ success: false, message: 'Restaurant wallet was not found.' }, 404)
    }

    return respond({
      success: true,
      message: 'Preferences saved. Customer billing activation is pending the checkout update.',
      preferences: {
        restaurantChargeCustomer: data.restaurant_fee_charge_customer === true,
        deliveryChargeCustomer: data.delivery_fee_charge_customer === true,
      },
      rates: {
        restaurantPlatformFeePaise: Number(data.restaurant_platform_fee_paise),
        deliveryPlatformFeePaise: Number(data.platform_fee_paise),
      },
    })
  } catch (error) {
    console.error('[OWNER FEE PREFERENCES]', error)
    return respond({ success: false, message: 'Unable to update platform fee preferences.' }, 500)
  }
}
