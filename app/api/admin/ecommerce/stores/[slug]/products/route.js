
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'ecommerce-product-images'
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function imagesFromAttributes(attributes, storeId, productId) {
  if (!attributes || typeof attributes !== 'object' ||
      !Array.isArray(attributes.images)) {
    return []
  }

  const prefix = `${storeId}/${productId}/`

  return attributes.images.filter(image =>
    image &&
    typeof image.id === 'string' &&
    typeof image.path === 'string' &&
    image.path.startsWith(prefix)
  ).slice(0, 8)
}

export async function GET(request, context) {
  try {
    const { slug: rawSlug } = await context.params
    const slug = typeof rawSlug === 'string'
      ? rawSlug.toLowerCase()
      : ''

    if (!SLUG.test(slug) || slug.length > 63) {
      return respond({
        success: false,
        message: 'Invalid store.',
      }, 400)
    }

    const db = getAdminSupabase()

    const { data: store, error: storeError } = await db
      .from('ecommerce_stores')
      .select('id,name,slug,category,theme,currency')
      .eq('slug', slug)
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .maybeSingle()

    if (storeError) throw storeError

    if (!store) {
      return respond({
        success: false,
        message: 'Store not available.',
      }, 404)
    }

    const { data: products, error: productError } = await db
      .from('ecommerce_products')
      .select('id,category_id,name,slug,description,attributes')
      .eq('store_id', store.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(200)

    if (productError) throw productError

    const { data: variants, error: variantError } = await db
      .from('ecommerce_product_variants')
      .select('id,product_id,sku,options,price_paise,compare_at_paise,stock_quantity')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .limit(1000)

    if (variantError) throw variantError

    const { data: categories, error: categoryError } = await db
      .from('ecommerce_categories')
      .select('id,name,slug,sort_order')
      .eq('store_id', store.id)
      .order('sort_order')
      .limit(500)

    if (categoryError) throw categoryError

    const variantsByProduct = new Map()

    for (const variant of variants || []) {
      const existing = variantsByProduct.get(variant.product_id) || []
      existing.push(variant)
      variantsByProduct.set(variant.product_id, existing)
    }

    const visibleProducts = (products || []).filter(product =>
      (variantsByProduct.get(product.id) || []).length > 0
    )

    const output = await Promise.all(
      visibleProducts.map(async product => {
        const imageRecords = imagesFromAttributes(
          product.attributes,
          store.id,
          product.id
        )

        const images = await Promise.all(
          imageRecords.map(async image => {
            const { data, error } = await db.storage
              .from(BUCKET)
              .createSignedUrl(image.path, 600)

            if (error || !data?.signedUrl) return null

            return {
              id: image.id,
              alt: image.alt || product.name,
              url: data.signedUrl,
            }
          })
        )

        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          categoryId: product.category_id,
          variants: variantsByProduct.get(product.id) || [],
          images: images.filter(Boolean),
        }
      })
    )

    return respond({
      success: true,
      store,
      categories: categories || [],
      products: output,
    })
  } catch (error) {
    console.error('[ECOMMERCE PUBLIC CATALOG]', {
      code: error?.code,
      message: error?.message,
    })

    return respond({
      success: false,
      message: 'Product catalog is temporarily unavailable.',
    }, 500)
  }
}
