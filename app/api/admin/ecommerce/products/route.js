
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const STATUSES = ['draft', 'active', 'archived']

const FIELDS = 'id,store_id,category_id,name,slug,description,attributes,status,created_at,updated_at'

function reply(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function fail(error) {
  console.error('[ECOMMERCE PRODUCTS]', error)
  const code = error?.code || 'SERVER_ERROR'
  const message =
    code === '23505' ? 'Product slug already exists in this store.' :
    code === '23503' ? 'The category must belong to this store.' :
    code === '42501' ? 'Database permission denied.' :
    'Product operation failed.'
  return reply({ success: false, message, errorCode: code }, code === '23505' ? 409 : 500)
}

async function authorize(request) {
  try {
    return await requireAdmin(request)
  } catch (error) {
    console.error('[ECOMMERCE PRODUCT AUTH]', error)
    return null
  }
}

function validProduct(body) {
  const storeId = body?.storeId
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const categoryId = body?.categoryId || null
  const status = body?.status ?? 'draft'
  const attributes = body?.attributes ?? {}

  if (
    !UUID.test(storeId || '') ||
    !name || name.length > 200 ||
    !SLUG.test(slug) || slug.length > 120 ||
    description.length > 10000 ||
    (categoryId !== null && !UUID.test(categoryId)) ||
    !STATUSES.includes(status) ||
    !attributes || typeof attributes !== 'object' ||
    Array.isArray(attributes)
  ) return null

  return {
    store_id: storeId,
    category_id: categoryId,
    name,
    slug,
    description,
    attributes,
    status,
  }
}

async function verifyStoreAndCategory(db, product) {
  const { data: store, error: storeError } = await db
    .from('ecommerce_stores')
    .select('id')
    .eq('id', product.store_id)
    .maybeSingle()

  if (storeError) throw storeError
  if (!store) return 'Store not found.'

  if (product.category_id) {
    const { data: category, error } = await db
      .from('ecommerce_categories')
      .select('id')
      .eq('id', product.category_id)
      .eq('store_id', product.store_id)
      .maybeSingle()

    if (error) throw error
    if (!category) return 'Category does not belong to this store.'
  }

  return null
}

export async function GET(request) {
  if (!await authorize(request)) {
    return reply({ success: false, message: 'Super Admin login required.' }, 401)
  }

  const storeId = new URL(request.url).searchParams.get('storeId')
  if (!UUID.test(storeId || '')) {
    return reply({ success: false, message: 'Valid storeId required.' }, 400)
  }

  try {
    const db = getAdminSupabase()
    const { data, error } = await db
      .from('ecommerce_products')
      .select(FIELDS)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) return fail(error)
    return reply({ success: true, products: data || [] })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request) {
  if (!await authorize(request)) {
    return reply({ success: false, message: 'Super Admin login required.' }, 401)
  }

  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) {
    return reply({ success: false, message: 'Invalid request origin.' }, 403)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return reply({ success: false, message: 'Invalid JSON.' }, 400)
  }

  const product = validProduct(body)
  if (!product) {
    return reply({ success: false, message: 'Invalid product details.' }, 400)
  }

  try {
    const db = getAdminSupabase()
    const validationError = await verifyStoreAndCategory(db, product)
    if (validationError) {
      return reply({ success: false, message: validationError }, 400)
    }

    const { data, error } = await db
      .from('ecommerce_products')
      .insert(product)
      .select(FIELDS)
      .single()

    if (error) return fail(error)
    return reply({ success: true, product: data }, 201)
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(request) {
  if (!await authorize(request)) {
    return reply({ success: false, message: 'Super Admin login required.' }, 401)
  }

  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) {
    return reply({ success: false, message: 'Invalid request origin.' }, 403)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return reply({ success: false, message: 'Invalid JSON.' }, 400)
  }

  if (!UUID.test(body?.productId || '')) {
    return reply({ success: false, message: 'Invalid product ID.' }, 400)
  }

  const product = validProduct(body)
  if (!product) {
    return reply({ success: false, message: 'Invalid product details.' }, 400)
  }

  try {
    const db = getAdminSupabase()
    const validationError = await verifyStoreAndCategory(db, product)
    if (validationError) {
      return reply({ success: false, message: validationError }, 400)
    }

    const { data, error } = await db
      .from('ecommerce_products')
      .update({
        ...product,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.productId)
      .eq('store_id', product.store_id)
      .select(FIELDS)
      .maybeSingle()

    if (error) return fail(error)
    if (!data) {
      return reply({ success: false, message: 'Product not found.' }, 404)
    }

    return reply({ success: true, product: data })
  } catch (error) {
    return fail(error)
  }
}
