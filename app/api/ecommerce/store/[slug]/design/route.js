
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const respond = (body, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

export async function GET(request, context) {
  try {
    const params = await context.params
    const slug = String(params?.slug || '').trim()

    if (!/^[a-z0-9-]{1,150}$/i.test(slug)) {
      return respond(
        { success: false, message: 'Invalid store.' },
        400
      )
    }

    const admin = getAdminSupabase()

    const { data: store, error: storeError } = await admin
      .from('ecommerce_stores')
      .select('id,slug,approval_status,is_active')
      .eq('slug', slug)
      .maybeSingle()

    if (storeError) throw storeError

    if (
      !store ||
      store.approval_status !== 'approved' ||
      store.is_active !== true
    ) {
      return respond(
        { success: false, message: 'Store unavailable.' },
        404
      )
    }

    const [designResult, promotionResult] = await Promise.all([
      admin
        .from('ecommerce_storefront_designs')
        .select('template_key,accent_key,mobile_theme_key,updated_at')
        .eq('store_id', store.id)
        .maybeSingle(),

      admin
        .from('ecommerce_storefront_promotions')
        .select(
          'id,title,subtitle,badge_text,image_url,button_text,destination_path,sort_order,starts_at,ends_at'
        )
        .eq('store_id', store.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(20),
    ])

    if (designResult.error) throw designResult.error
    if (promotionResult.error) throw promotionResult.error

    const now = Date.now()
    const storePrefix = `/shop/${store.slug}`

    const promotions = (promotionResult.data || [])
      .filter(
        p =>
          (!p.starts_at || Date.parse(p.starts_at) <= now) &&
          (!p.ends_at || Date.parse(p.ends_at) > now)
      )
      .map(p => ({
        ...p,
        destination_path:
          p.destination_path === storePrefix ||
          p.destination_path?.startsWith(`${storePrefix}/`)
            ? p.destination_path
            : '',
      }))

    return respond({
      success: true,
      design: designResult.data || null,
      promotions,
    })
  } catch (error) {
    console.error('[PUBLIC STOREFRONT DESIGN]', error)

    return respond(
      {
        success: false,
        message: 'Unable to load storefront design.',
      },
      500
    )
  }
}
