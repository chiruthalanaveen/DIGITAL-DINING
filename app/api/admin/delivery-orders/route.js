import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SIMPLE_FILTER_PATTERN = /^[a-z0-9_]{1,60}$/

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function readDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (!DATE_PATTERN.test(text)) return false
  const check = new Date(`${text}T00:00:00+05:30`)
  if (Number.isNaN(check.getTime())) return false
  // Reject rolled-over dates such as February 30.
  if (new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(check) !== text) return false
  return check
}

export async function GET(request) {
  const session = await requireAdmin(request)
  if (!session) {
    return respond({ success: false, message: 'Admin authentication required.' }, 401)
  }

  try {
    const params = new URL(request.url).searchParams
    const rawPage = Number(params.get('page') || 1)
    const rawPageSize = Number(params.get('pageSize') || PAGE_SIZE)
    if (!Number.isSafeInteger(rawPage) || rawPage < 1 || rawPage > 100000 ||
        !Number.isSafeInteger(rawPageSize) || rawPageSize < 1 || rawPageSize > MAX_PAGE_SIZE) {
      return respond({ success: false, message: 'Invalid page or page size.' }, 400)
    }

    const storeId = String(params.get('storeId') || '').trim()
    const status = String(params.get('status') || '').trim().toLowerCase()
    const paymentStatus = String(params.get('paymentStatus') || '').trim().toLowerCase()
    const paymentMethod = String(params.get('paymentMethod') || '').trim().toLowerCase()
    const search = String(params.get('search') || '').trim()
    const from = readDate(params.get('fromDate'))
    const to = readDate(params.get('toDate'))

    if ((storeId && !UUID_PATTERN.test(storeId)) ||
        (status && !SIMPLE_FILTER_PATTERN.test(status)) ||
        (paymentStatus && !SIMPLE_FILTER_PATTERN.test(paymentStatus)) ||
        (paymentMethod && !SIMPLE_FILTER_PATTERN.test(paymentMethod)) ||
        search.length > 80 ||
        (search && !/^[a-zA-Z0-9 _-]+$/.test(search)) ||
        from === false || to === false ||
        (from && to && from.getTime() > to.getTime())) {
      return respond({ success: false, message: 'Invalid delivery order filters.' }, 400)
    }

    const admin = getAdminSupabase()

    // Store names are resolved server-side; a browser-supplied name is never trusted.
    const [restaurantsResult, settingsResult] = await Promise.all([
      admin.from('restaurants').select('id,name').order('name', { ascending: true }).limit(5000),
      admin.from('delivery_settings').select('restaurant_id,store_name').limit(5000),
    ])

    if (restaurantsResult.error) throw restaurantsResult.error
    // Existing stores might not have a delivery_settings row; do not fail the report.
    if (settingsResult.error) {
      console.warn('[ADMIN DELIVERY ORDERS] Store settings lookup:', settingsResult.error.message)
    }

    const shopNames = new Map()
    for (const row of settingsResult.data || []) {
      if (row.restaurant_id && row.store_name?.trim()) {
        shopNames.set(String(row.restaurant_id), row.store_name.trim())
      }
    }
    const storeNames = new Map()
    const stores = (restaurantsResult.data || []).map((row) => {
      const name = shopNames.get(String(row.id)) || row.name || 'Unnamed store'
      storeNames.set(String(row.id), name)
      return { id: row.id, name }
    }).sort((a, b) => a.name.localeCompare(b.name))

    let query = admin
      .from('delivery_orders')
      .select(
        'id,restaurant_id,order_code,customer_name,customer_mobile,total_amount,order_status,payment_method,payment_status,created_at',
        { count: 'exact' }
      )

    if (storeId) query = query.eq('restaurant_id', storeId)
    if (status) query = query.eq('order_status', status)
    if (paymentStatus) query = query.eq('payment_status', paymentStatus)
    if (paymentMethod) query = query.eq('payment_method', paymentMethod)
    if (from) query = query.gte('created_at', from.toISOString())
    if (to) {
      const nextDay = new Date(to.getTime() + 24 * 60 * 60 * 1000)
      query = query.lt('created_at', nextDay.toISOString())
    }
    if (search) {
      // Sanitized above: characters that could alter PostgREST filter syntax are rejected.
      query = query.or(
        `order_code.ilike.%${search}%,customer_name.ilike.%${search}%,customer_mobile.ilike.%${search}%`
      )
    }

    const offset = (rawPage - 1) * rawPageSize
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + rawPageSize - 1)

    if (error) throw error

    const orders = (data || []).map((row) => ({
      ...row,
      store_name: storeNames.get(String(row.restaurant_id)) || 'Unknown store',
    }))

    return respond({
      success: true,
      orders,
      stores,
      page: rawPage,
      pageSize: rawPageSize,
      totalCount: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / rawPageSize),
      // Values are scoped to the returned page, not claimed to be all-time revenue.
      pageOrderValue: orders.reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0),
    })
  } catch (error) {
    console.error('[ADMIN DELIVERY ORDERS GET]', error)
    return respond({ success: false, message: 'Unable to load delivery orders.' }, 500)
  }
}
