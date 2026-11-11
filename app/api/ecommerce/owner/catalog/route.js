
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

const uid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const fail = (message, status = 400) =>
  json({ success: false, message }, status)

async function authorize(request, storeId) {
  if (!uid.test(storeId || '')) {
    return { error: fail('Invalid store ID.') }
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(
    request.headers.get('authorization') || ''
  )

  if (!match) {
    return {
      error: fail('Sign in to your E-Commerce owner account.', 401),
    }
  }

  const admin = getAdminSupabase()

  const { data: auth, error: authError } =
    await admin.auth.getUser(match[1])

  if (authError || !auth?.user?.id) {
    return {
      error: fail('Session expired. Sign in again.', 401),
    }
  }

  const { data: member, error: memberError } = await admin
    .from('ecommerce_store_members')
    .select('store_id')
    .eq('store_id', storeId)
    .eq('user_id', auth.user.id)
    .eq('role', 'owner')
    .maybeSingle()

  if (memberError) throw memberError

  if (!member) {
    return {
      error: fail('You do not own this website.', 403),
    }
  }

  const { data: store, error: storeError } = await admin
    .from('ecommerce_stores')
    .select('id,approval_status,is_active')
    .eq('id', storeId)
    .maybeSingle()

  if (storeError) throw storeError

  if (!store) {
    return {
      error: fail('Website not found.', 404),
    }
  }

  return { admin, store }
}

function readableError(error) {
  if (error?.code === '23505') {
    return fail(
      'A category slug, product slug, or SKU already exists in this website.',
      409
    )
  }

  if (error?.code === '23503') {
    return fail(
      'Selected category or product is not valid for this website.',
      400
    )
  }

  if (error?.code === '23514') {
    return fail('Invalid product data or stock quantity.', 400)
  }

  console.error('[OWNER CATALOG]', error)
  return fail('Catalog request failed.', 500)
}

const validateName = (name, max) =>
  typeof name === 'string' &&
  name.trim().length >= 1 &&
  name.trim().length <= max

const validAmount = n =>
  Number.isSafeInteger(n) && n >= 0

const validStock = validAmount

async function checkCategory(admin, storeId, categoryId) {
  if (categoryId == null || categoryId === '') {
    return true
  }

  if (!uid.test(categoryId)) return false

  const { data, error } = await admin
    .from('ecommerce_categories')
    .select('id')
    .eq('store_id', storeId)
    .eq('id', categoryId)
    .maybeSingle()

  if (error) throw error

  return Boolean(data)
}

function checkOptions(options) {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    return false
  }

  if (JSON.stringify(options).length > 2000) {
    return false
  }

  return Object.entries(options).every(
    ([key, value]) =>
      /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) &&
      typeof value === 'string' &&
      value.trim().length <= 150
  )
}

export async function GET(request) {
  try {
    const storeId =
      new URL(request.url).searchParams.get('storeId')

    const access = await authorize(request, storeId)

    if (access.error) return access.error

    const { admin } = access

    const [categories, products, variants] =
      await Promise.all([
        admin
          .from('ecommerce_categories')
          .select('*')
          .eq('store_id', storeId)
          .order('sort_order')
          .limit(500),

        admin
          .from('ecommerce_products')
          .select('*')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false })
          .limit(500),

        admin
          .from('ecommerce_product_variants')
          .select('*')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false })
          .limit(1500),
      ])

    for (const result of [categories, products, variants]) {
      if (result.error) throw result.error
    }

    return json({
      success: true,
      categories: categories.data,
      products: products.data,
      variants: variants.data,
      limits: {
        categories: 500,
        products: 500,
        variants: 1500,
      },
    })
  } catch (error) {
    return readableError(error)
  }
}

export async function POST(request) {
  return mutate(request, 'POST')
}

export async function PATCH(request) {
  return mutate(request, 'PATCH')
}

async function mutate(request, method) {
  try {
    const body = await request.json().catch(() => null)

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return fail('Invalid JSON body.')
    }

    const { storeId, entity } = body

    const access = await authorize(request, storeId)

    if (access.error) return access.error

    const { admin, store } = access

    if (
      store.approval_status !== 'approved' ||
      !store.is_active
    ) {
      return fail(
        'Website must be approved and active to edit its catalog.',
        403
      )
    }

    let query

    if (entity === 'category' && method === 'POST') {
      if (
        !validateName(body.name, 100) ||
        !slug.test(body.slug || '')
      ) {
        return fail('Enter a valid category name and slug.')
      }

      query = admin
        .from('ecommerce_categories')
        .insert({
          store_id: storeId,
          name: body.name.trim(),
          slug: body.slug,
        })
        .select('id')
        .single()

    } else if (entity === 'product' && method === 'POST') {
      if (
        !validateName(body.name, 200) ||
        !slug.test(body.slug || '') ||
        typeof body.description !== 'string' ||
        body.description.length > 10000
      ) {
        return fail('Invalid product name, slug or description.')
      }

      if (!(await checkCategory(admin, storeId, body.categoryId))) {
        return fail('Category does not belong to this website.')
      }

      query = admin
        .from('ecommerce_products')
        .insert({
          store_id: storeId,
          name: body.name.trim(),
          slug: body.slug,
          description: body.description,
          category_id: body.categoryId || null,
          status: 'draft',
        })
        .select('id')
        .single()

    } else if (entity === 'product' && method === 'PATCH') {
      if (!uid.test(body.productId || '')) {
        return fail('Invalid product ID.')
      }

      const updates = {}

      if ('name' in body) {
        if (!validateName(body.name, 200)) {
          return fail('Invalid product name.')
        }
        updates.name = body.name.trim()
      }

      if ('slug' in body) {
        if (!slug.test(body.slug || '')) {
          return fail('Invalid product slug.')
        }
        updates.slug = body.slug
      }

      if ('description' in body) {
        if (
          typeof body.description !== 'string' ||
          body.description.length > 10000
        ) {
          return fail('Invalid description.')
        }
        updates.description = body.description
      }

      if ('categoryId' in body) {
        if (!(await checkCategory(admin, storeId, body.categoryId))) {
          return fail('Category does not belong to this website.')
        }
        updates.category_id = body.categoryId || null
      }

      if ('status' in body) {
        if (
          !['draft', 'active', 'archived'].includes(body.status)
        ) {
          return fail('Invalid product status.')
        }
        updates.status = body.status
      }

      if (!Object.keys(updates).length) {
        return fail('No valid changes provided.')
      }

      query = admin
        .from('ecommerce_products')
        .update(updates)
        .eq('store_id', storeId)
        .eq('id', body.productId)
        .select('id')
        .maybeSingle()

    } else if (entity === 'variant' && method === 'POST') {
      if (
        !uid.test(body.productId || '') ||
        !validateName(body.sku, 100) ||
        !validAmount(body.pricePaise) ||
        !validStock(body.stockQuantity) ||
        (
          body.compareAtPaise != null &&
          !validAmount(body.compareAtPaise)
        )
      ) {
        return fail('Invalid SKU, product, price or stock.')
      }

      if (
        body.compareAtPaise != null &&
        body.compareAtPaise < body.pricePaise
      ) {
        return fail('MRP cannot be lower than selling price.')
      }

      const { data: product, error } = await admin
        .from('ecommerce_products')
        .select('id')
        .eq('store_id', storeId)
        .eq('id', body.productId)
        .maybeSingle()

      if (error) throw error

      if (!product) {
        return fail('Product does not belong to this website.')
      }

      const options = body.options ?? {}

      if (!checkOptions(options)) {
        return fail('Invalid variant options.')
      }

      query = admin
        .from('ecommerce_product_variants')
        .insert({
          store_id: storeId,
          product_id: body.productId,
          sku: body.sku.trim(),
          options,
          price_paise: body.pricePaise,
          compare_at_paise: body.compareAtPaise ?? null,
          stock_quantity: body.stockQuantity,
        })
        .select('id')
        .single()

    } else if (entity === 'variant' && method === 'PATCH') {
      if (!uid.test(body.variantId || '')) {
        return fail('Invalid variant ID.')
      }

      const updates = {}

      if ('sku' in body) {
        if (!validateName(body.sku, 100)) {
          return fail('Invalid SKU.')
        }
        updates.sku = body.sku.trim()
      }

      if ('options' in body) {
        if (!checkOptions(body.options)) {
          return fail('Invalid variant options.')
        }
        updates.options = body.options
      }

      if ('stockQuantity' in body) {
        if (!validStock(body.stockQuantity)) {
          return fail('Invalid stock quantity.')
        }
        updates.stock_quantity = body.stockQuantity
      }

      if ('pricePaise' in body) {
        if (!validAmount(body.pricePaise)) {
          return fail('Invalid price.')
        }
        updates.price_paise = body.pricePaise
      }

      if ('compareAtPaise' in body) {
        if (
          body.compareAtPaise !== null &&
          !validAmount(body.compareAtPaise)
        ) {
          return fail('Invalid MRP.')
        }
        updates.compare_at_paise = body.compareAtPaise
      }

      if ('isActive' in body) {
        if (typeof body.isActive !== 'boolean') {
          return fail('Invalid variant availability.')
        }
        updates.is_active = body.isActive
      }

      if (!Object.keys(updates).length) {
        return fail('No valid changes provided.')
      }

      if (
        'price_paise' in updates ||
        'compare_at_paise' in updates
      ) {
        const { data: existing, error } = await admin
          .from('ecommerce_product_variants')
          .select('price_paise,compare_at_paise')
          .eq('store_id', storeId)
          .eq('id', body.variantId)
          .maybeSingle()

        if (error) throw error

        if (!existing) {
          return fail('Record not found in your website.', 404)
        }

        const price =
          updates.price_paise ?? existing.price_paise

        const mrp =
          'compare_at_paise' in updates
            ? updates.compare_at_paise
            : existing.compare_at_paise

        if (mrp != null && mrp < price) {
          return fail('MRP cannot be lower than selling price.')
        }
      }

      query = admin
        .from('ecommerce_product_variants')
        .update(updates)
        .eq('store_id', storeId)
        .eq('id', body.variantId)
        .select('id')
        .maybeSingle()

    } else {
      return fail('Unsupported catalog action.')
    }

    const result = await query

    if (result.error) {
      return readableError(result.error)
    }

    if (!result.data) {
      return fail('Record not found in your website.', 404)
    }

    return json({
      success: true,
      id: result.data.id,
    })
  } catch (error) {
    return readableError(error)
  }
}
