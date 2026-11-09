
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FIELDS = 'id,store_id,product_id,sku,options,price_paise,compare_at_paise,stock_quantity,is_active,created_at'

function reply(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function fail(error) {
  console.error('[ECOMMERCE VARIANTS]', error)
  const code = error?.code || 'SERVER_ERROR'
  const message =
    code === '23505' ? 'This SKU already exists in the store.' :
    code === '23503' ? 'Product does not belong to the selected store.' :
    code === '42501' ? 'Database permission denied.' :
    'Variant operation failed.'
  return reply({ success: false, message, errorCode: code }, code === '23505' ? 409 : 500)
}

async function authorize(request) {
  try {
    return await requireAdmin(request)
  } catch (error) {
    console.error('[ECOMMERCE VARIANT AUTH]', error)
    return null
  }
}

function rupeesToPaise(value, optional = false) {
  if (optional && (value === '' || value === null || value === undefined)) {
    return null
  }

  const raw = String(value)
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(raw)) return undefined

  const [rupees, decimals = ''] = raw.split('.')
  const paise = Number(rupees) * 100 + Number(decimals.padEnd(2, '0'))

  return Number.isSafeInteger(paise) ? paise : undefined
}

function parseVariant(body) {
  const storeId = body?.storeId
  const productId = body?.productId
  const sku = typeof body?.sku === 'string' ? body.sku.trim() : ''
  const optionName = typeof body?.optionName === 'string' ? body.optionName.trim() : ''
  const optionValue = typeof body?.optionValue === 'string' ? body.optionValue.trim() : ''
  const price = rupeesToPaise(body?.price)
  const mrp = rupeesToPaise(body?.mrp, true)
  const stock = Number(body?.stockQuantity)
  const active = body?.isActive ?? true

  if (
    !UUID.test(storeId || '') ||
    !UUID.test(productId || '') ||
    !sku || sku.length > 100 ||
    optionName.length > 60 ||
    optionValue.length > 120 ||
    price === undefined ||
    mrp === undefined ||
    !Number.isSafeInteger(stock) ||
    stock < 0 ||
    stock > 100000000 ||
    typeof active !== 'boolean' ||
    (mrp !== null && mrp < price)
  ) return null

  return {
    store_id: storeId,
    product_id: productId,
    sku,
    options: optionName && optionValue
      ? { [optionName]: optionValue }
      : {},
    price_paise: price,
    compare_at_paise: mrp,
    stock_quantity: stock,
    is_active: active,
  }
}

async function productExists(db, storeId, productId) {
  const { data, error } = await db
    .from('ecommerce_products')
    .select('id')
    .eq('store_id', storeId)
    .eq('id', productId)
    .maybeSingle()

  if (error) throw error
  return !!data
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
      .from('ecommerce_product_variants')
      .select(FIELDS)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error) return fail(error)
    return reply({ success: true, variants: data || [] })
  } catch (error) {
    return fail(error)
  }
}

async function save(request, editing) {
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

  const variant = parseVariant(body)
  if (!variant || (editing && !UUID.test(body?.variantId || ''))) {
    return reply({ success: false, message: 'Invalid variant details.' }, 400)
  }

  try {
    const db = getAdminSupabase()

    if (!await productExists(db, variant.store_id, variant.product_id)) {
      return reply({
        success: false,
        message: 'Product not found in this store.',
      }, 404)
    }

    let query

    if (editing) {
      query = db
        .from('ecommerce_product_variants')
        .update(variant)
        .eq('id', body.variantId)
        .eq('store_id', variant.store_id)
        .eq('product_id', variant.product_id)
    } else {
      query = db
        .from('ecommerce_product_variants')
        .insert(variant)
    }

    const { data, error } = await query
      .select(FIELDS)
      .maybeSingle()

    if (error) return fail(error)
    if (!data) {
      return reply({ success: false, message: 'Variant not found.' }, 404)
    }

    return reply({
      success: true,
      variant: data,
    }, editing ? 200 : 201)
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request) {
  return save(request, false)
}

export async function PATCH(request) {
  return save(request, true)
}
