// Destination: app/api/delivery/seasonal-ads/route.js
import 'server-only'
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const CODE = /^[A-Za-z0-9_-]{1,80}$/
const DELIVERY_PLANS = ['delivery', 'restaurant_delivery', 'restaurant_resort_delivery']
const reply = (body, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
})
export async function GET(request) {
  const code = String(new URL(request.url).searchParams.get('restaurantCode') || '').trim()
  if (!CODE.test(code)) return reply({ success: false, message: 'Invalid store code.' }, 400)
  try {
    const admin = getAdminSupabase()
    const { data: store, error: storeError } = await admin.from('restaurants')
      .select('id,plan_code').eq('restaurant_code', code).maybeSingle()
    if (storeError) throw storeError
    if (!store || !DELIVERY_PLANS.includes(store.plan_code)) return reply({ success: true, campaigns: [] })
    const now = new Date().toISOString()
    const { data, error } = await admin.from('delivery_seasonal_campaigns')
      .select('id,eyebrow,headline,description,image_url,button_label,button_action,category_name')
      .eq('restaurant_id', store.id).eq('is_enabled', true)
      .lte('starts_at', now).gt('ends_at', now)
      .order('priority', { ascending: false }).order('created_at', { ascending: false }).limit(5)
    if (error) throw error
    return reply({ success: true, campaigns: data || [] })
  } catch (error) {
    console.error('[SEASONAL ADS PUBLIC GET]', error.code || error.message)
    return reply({ success: false, message: 'Advertisements temporarily unavailable.', campaigns: [] }, 503)
  }
}