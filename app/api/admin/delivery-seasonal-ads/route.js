// Destination: app/api/admin/delivery-seasonal-ads/route.js
import 'server-only'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DELIVERY_PLANS = ['delivery', 'restaurant_delivery', 'restaurant_resort_delivery']
const reply = (body, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
})
const tidy = (value, length) => String(value ?? '').trim().slice(0, length)

async function validateStore(admin, restaurantId) {
  if (!UUID.test(restaurantId)) return null
  const { data, error } = await admin.from('restaurants')
    .select('id,name,restaurant_code,plan_code').eq('id', restaurantId).maybeSingle()
  if (error) throw error
  return data && DELIVERY_PLANS.includes(data.plan_code) ? data : null
}
function validateAd(input) {
  const headline = tidy(input.headline, 91)
  const eyebrow = tidy(input.eyebrow || 'SEASONAL SPECIAL', 49)
  const description = tidy(input.description, 241)
  const button_label = tidy(input.buttonLabel || 'Shop now', 33)
  const button_action = tidy(input.buttonAction || 'browse', 20)
  const category_name = tidy(input.categoryName, 81) || null
  const image_url = tidy(input.imageUrl, 2048) || null
  const priority = Number(input.priority ?? 10)
  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  if (headline.length < 3 || headline.length > 90 || eyebrow.length > 48 || description.length > 240 ||
    button_label.length < 1 || button_label.length > 32 || !['browse', 'category'].includes(button_action) ||
    (button_action === 'category' && (!category_name || category_name.length > 80)) ||
    !Number.isSafeInteger(priority) || priority < 0 || priority > 100 ||
    !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    return { error: 'Check your campaign title, date range, button action, category and priority.' }
  }
  if (image_url) {
    try {
      const url = new URL(image_url)
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('image url')
    } catch { return { error: 'Banner image must be a valid HTTPS URL.' } }
  }
  return { fields: {
    headline, eyebrow, description, image_url,
    button_label, button_action, category_name: button_action === 'category' ? category_name : null,
    starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
    priority,
  } }
}
async function recordAudit(admin, { before, after, action, storeId, campaignId, actor }) {
  const { error } = await admin.from('delivery_seasonal_campaign_audit').insert({
    restaurant_id: storeId, campaign_id: campaignId, action,
    actor_email: String(actor || 'Super Admin').slice(0, 200),
    before_data: before, after_data: after,
  })
  if (error) console.error('[SEASONAL ADS AUDIT]', error.code || error.message)
}

export async function GET(request) {
  const session = requireAdmin(request)
  if (!session) return reply({ success: false, message: 'Super Admin login required.' }, 401)
  try {
    const admin = getAdminSupabase()
    const [{ data: restaurants, error: storesError }, { data: campaigns, error: adsError }] = await Promise.all([
      admin.from('restaurants').select('id,name,restaurant_code,plan_code').in('plan_code', DELIVERY_PLANS).order('name').limit(2000),
      admin.from('delivery_seasonal_campaigns').select('*').order('created_at', { ascending: false }).limit(1000),
    ])
    if (storesError || adsError) throw storesError || adsError
    const allowed = new Set((restaurants || []).map(item => item.id))
    return reply({ success: true, stores: restaurants || [], campaigns: (campaigns || []).filter(row => allowed.has(row.restaurant_id)) })
  } catch (error) {
    console.error('[SEASONAL ADS ADMIN GET]', error.code || error.message)
    return reply({ success: false, message: 'Unable to load seasonal advertisements. Check the migration.' }, 503)
  }
}

export async function POST(request) {
  const session = requireAdmin(request)
  if (!session) return reply({ success: false, message: 'Super Admin login required.' }, 401)
  const input = await request.json().catch(() => null)
  if (!input || typeof input !== 'object') return reply({ success: false, message: 'Invalid JSON.' }, 400)
  const operation = tidy(input.operation, 16)
  if (!['create', 'update', 'toggle', 'delete'].includes(operation)) return reply({ success: false, message: 'Unknown action.' }, 400)
  try {
    const admin = getAdminSupabase()
    const actor = tidy(session.email || session.username || 'Super Admin', 200)
    let old = null
    if (operation !== 'create') {
      if (!UUID.test(String(input.id || ''))) return reply({ success: false, message: 'Invalid campaign ID.' }, 400)
      const { data, error } = await admin.from('delivery_seasonal_campaigns').select('*').eq('id', input.id).maybeSingle()
      if (error) throw error
      if (!data) return reply({ success: false, message: 'Campaign not found.' }, 404)
      old = data
    }
    const restaurantId = operation === 'create' ? String(input.restaurantId || '') : old.restaurant_id
    const store = await validateStore(admin, restaurantId)
    if (!store) return reply({ success: false, message: 'Choose an eligible Delivery plan store.' }, 400)
    if (operation === 'delete') {
      const { error } = await admin.from('delivery_seasonal_campaigns').delete().eq('id', old.id)
      if (error) throw error
      await recordAudit(admin, { before: old, after: null, action: 'delete', storeId: restaurantId, campaignId: old.id, actor })
      return reply({ success: true, message: 'Campaign deleted.' })
    }
    if (operation === 'toggle') {
      if (typeof input.enabled !== 'boolean') return reply({ success: false, message: 'Enabled must be true or false.' }, 400)
      const { data, error } = await admin.from('delivery_seasonal_campaigns')
        .update({ is_enabled: input.enabled, updated_at: new Date().toISOString() }).eq('id', old.id).select('*').single()
      if (error) throw error
      await recordAudit(admin, { before: old, after: data, action: input.enabled ? 'enable' : 'disable', storeId: restaurantId, campaignId: old.id, actor })
      return reply({ success: true, campaign: data, message: 'Campaign visibility updated.' })
    }
    const validated = validateAd(input)
    if (validated.error) return reply({ success: false, message: validated.error }, 400)
    const payload = { ...validated.fields, updated_at: new Date().toISOString() }
    if (operation === 'create') {
      // Explicit publish control: all newly created campaigns start disabled.
      const { data, error } = await admin.from('delivery_seasonal_campaigns')
        .insert({ ...payload, restaurant_id: restaurantId, is_enabled: false, created_by: actor }).select('*').single()
      if (error) throw error
      await recordAudit(admin, { before: null, after: data, action: 'create', storeId: restaurantId, campaignId: data.id, actor })
      return reply({ success: true, campaign: data, message: 'Draft campaign created. Enable it when ready.' })
    }
    const { data, error } = await admin.from('delivery_seasonal_campaigns')
      .update(payload).eq('id', old.id).select('*').single()
    if (error) throw error
    await recordAudit(admin, { before: old, after: data, action: 'update', storeId: restaurantId, campaignId: old.id, actor })
    return reply({ success: true, campaign: data, message: 'Campaign updated.' })
  } catch (error) {
    console.error('[SEASONAL ADS ADMIN POST]', error.code || error.message)
    return reply({ success: false, message: 'Unable to save the campaign. Check server logs.' }, 503)
  }
}