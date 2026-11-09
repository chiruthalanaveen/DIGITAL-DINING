
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function reply(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function fail(error) {
  console.error('[ECOMMERCE CATEGORIES]', error)
  const code = error?.code || 'SERVER_ERROR'
  const message =
    code === '23505' ? 'Category slug already exists in this store.' :
    code === '23503' ? 'Invalid store reference.' :
    code === '42501' ? 'Database permission denied.' :
    'Category operation failed.'
  return reply({ success: false, message, errorCode: code }, code === '23505' ? 409 : 500)
}

async function authorize(request) {
  try {
    const session = await requireAdmin(request)
    return session
  } catch (error) {
    console.error('[ECOMMERCE CATEGORY AUTH]', error)
    return null
  }
}

async function storeExists(db, storeId) {
  const { data, error } = await db
    .from('ecommerce_stores')
    .select('id')
    .eq('id', storeId)
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
      .from('ecommerce_categories')
      .select('id,store_id,name,slug,sort_order,created_at')
      .eq('store_id', storeId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .limit(500)

    if (error) return fail(error)
    return reply({ success: true, categories: data || [] })
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

  const storeId = body?.storeId
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const sortOrder = body?.sortOrder ?? 0

  if (
    !UUID.test(storeId || '') ||
    name.length < 1 ||
    name.length > 100 ||
    slug.length > 100 ||
    !SLUG.test(slug) ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 1000000
  ) {
    return reply({ success: false, message: 'Invalid category details.' }, 400)
  }

  try {
    const db = getAdminSupabase()
    if (!await storeExists(db, storeId)) {
      return reply({ success: false, message: 'Store not found.' }, 404)
    }

    const { data, error } = await db
      .from('ecommerce_categories')
      .insert({
        store_id: storeId,
        name,
        slug,
        sort_order: sortOrder,
      })
      .select('id,store_id,name,slug,sort_order,created_at')
      .single()

    if (error) return fail(error)
    return reply({ success: true, category: data }, 201)
  } catch (error) {
    return fail(error)
  }
}
