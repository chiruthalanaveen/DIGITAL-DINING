// Exact destination: app/api/delivery/login-advertisements/route.js
// Public marketing-only endpoint. Server filters by store, enabled flag, login placement, and dates.
import 'server-only'
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const VALID_CODE = /^[A-Za-z0-9_-]{1,80}$/
const DELIVERY_PLANS = ['delivery', 'restaurant_delivery', 'restaurant_resort_delivery']
const respond = (data, status = 200) => NextResponse.json(data, {
  status,
  headers: {
    'Cache-Control': 'public, max-age=30, s-maxage=60',
    'X-Content-Type-Options': 'nosniff',
  },
})

export async function GET(request) {
  const code = String(new URL(request.url).searchParams.get('restaurantCode') || '').trim()
  if (!VALID_CODE.test(code)) return respond({ success: false, advertisements: [] }, 400)
  try {
    const admin = getAdminSupabase()
    const { data: store, error: storeError } = await admin.from('restaurants')
      .select('id,plan_code')
      .eq('restaurant_code', code)
      .maybeSingle()
    if (storeError) throw storeError
    if (!store || !DELIVERY_PLANS.includes(store.plan_code)) return respond({ success: true, advertisements: [] })

    const now = new Date().toISOString()
    const { data, error } = await admin.from('delivery_seasonal_campaigns')
      .select('id,eyebrow,headline,description,image_url')
      .eq('restaurant_id', store.id)
      .eq('is_enabled', true)
      .eq('show_on_login', true)
      .lte('starts_at', now)
      .gt('ends_at', now)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(6)
    if (error) throw error
    return respond({ success: true, advertisements: (data || []).map(ad => ({
      id: ad.id,
      eyebrow: ad.eyebrow,
      headline: ad.headline,
      description: ad.description,
      image_url: /^https:\/\//i.test(String(ad.image_url || '')) ? ad.image_url : null,
    })) })
  } catch (error) {
    console.error('[DELIVERY LOGIN ADVERTISEMENTS]', error?.code || error?.message)
    // Ads must not prevent a customer from logging in.
    return respond({ success: true, advertisements: [] })
  }
}
