// Destination: app/api/ecommerce/store/[slug]/route.js
// Public read-only storefront endpoint. Never exposes owner, wallet, or private data.
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

export async function GET(_request, context) {
  try {
    const { slug } = await context.params
    if (typeof slug !== 'string' || slug.length > 63 || !validSlug.test(slug)) {
      return json({ success: false, message: 'Invalid storefront address.' }, 400)
    }

    // The service-role client is server-only. Every query below is explicitly
    // scoped to an approved, active store, and only public fields are selected.
    const admin = getAdminSupabase()
    const { data: store, error: storeError } = await admin
      .from('ecommerce_stores')
      .select('id,name,slug,category,theme,currency,fulfillment_mode')
      .eq('slug', slug)
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .maybeSingle()

    if (storeError) throw storeError
    if (!store) return json({ success: false, message: 'Store unavailable.' }, 404)

    const [categoriesResult, productsResult, themesResult] = await Promise.all([
      admin.from('ecommerce_categories')
        .select('id,name,slug,sort_order')
        .eq('store_id', store.id).order('sort_order').limit(500),
      admin.from('ecommerce_products')
        .select('id,category_id,name,slug,description,attributes')
        .eq('store_id', store.id).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(500),
      admin.from('ecommerce_store_themes')
        .select('theme_key,logo_url,primary_color,configuration')
        .eq('store_id', store.id).maybeSingle(),
    ])
    if (categoriesResult.error) throw categoriesResult.error
    if (productsResult.error) throw productsResult.error
    if (themesResult.error) throw themesResult.error

    const products = productsResult.data || []
    let variants = []
    if (products.length) {
      const result = await admin.from('ecommerce_product_variants')
        .select('id,product_id,options,price_paise,compare_at_paise,stock_quantity')
        .eq('store_id', store.id)
        .eq('is_active', true)
        .in('product_id', products.map(product => product.id))
        .limit(1500)
      if (result.error) throw result.error
      variants = result.data || []
    }

    // Signed image URLs are created only for approved, active store products.
    let images = []
    if (products.length) {
      const result = await admin.from('ecommerce_product_images')
        .select('id,product_id,storage_path,alt_text,sort_order')
        .eq('store_id', store.id)
        .in('product_id', products.map(p => p.id))
        .order('sort_order').limit(5000)
      if (result.error) throw result.error
      images = await Promise.all((result.data || []).map(async item => {
        const { data: signed, error: signError } = await admin.storage.from('ecommerce-product-images').createSignedUrl(item.storage_path, 3600)
        if (signError) throw signError
        return { id: item.id, product_id: item.product_id, url: signed.signedUrl, alt: item.alt_text, sort_order: item.sort_order }
      }))
    }

    return json({
      success: true,
      store,
      theme: themesResult.data || null,
      categories: categoriesResult.data || [],
      products,
      variants,
      images,
    })
  } catch (error) {
    console.error('[ECOMMERCE PUBLIC STOREFRONT]', error)
    return json({ success: false, message: 'Unable to load the store.' }, 500)
  }
}