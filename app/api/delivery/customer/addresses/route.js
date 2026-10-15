// VS Code: app/api/delivery/customer/addresses/route.js
import 'server-only'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import { DELIVERY_MOBILE_SESSION_COOKIE, readDeliveryMobileSession } from '@/lib/server/deliveryCustomerMobileSession'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const CODE = /^[a-zA-Z0-9_-]{1,80}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i
const HASH = /^[0-9a-f]{64}$/i
const GOOGLE = 'delivery_customer_saved_addresses'
const MOBILE = 'delivery_customer_mobile_saved_addresses'
const respond = (data, status = 200) => NextResponse.json(data, {
  status,
  headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie, Authorization' },
})
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status } }

async function identity(request, admin, mode, restaurantCode) {
  if (!['auto', 'mobile', 'google'].includes(mode)) throw new ApiError('Invalid account type.')
  if (restaurantCode && !CODE.test(restaurantCode)) throw new ApiError('Invalid restaurant code.')
  const raw = request.cookies.get(DELIVERY_MOBILE_SESSION_COOKIE)?.value || ''
  if (mode !== 'google' && HASH.test(raw)) {
    const hash = createHash('sha256').update(raw).digest('hex')
    const { data: session, error } = await admin.from('delivery_customer_sessions')
      .select('restaurant_id').eq('token_hash', hash).gt('expires_at', new Date().toISOString()).maybeSingle()
    if (error) throw error
    if (session?.restaurant_id) {
      if (restaurantCode) {
        const { data: store, error: storeError } = await admin.from('restaurants')
          .select('id').ilike('restaurant_code', restaurantCode).maybeSingle()
        if (storeError) throw storeError
        if (!store?.id || store.id !== session.restaurant_id) {
          throw new ApiError('Your Mobile/PIN session belongs to another store. Sign in to this store.', 401)
        }
      }
      const customer = await readDeliveryMobileSession(admin, request, session.restaurant_id)
      if (customer) return {
        type: 'mobile', ownerId: customer.id, restaurantId: session.restaurant_id,
        defaultName: customer.name, defaultMobile: customer.mobile,
      }
    }
  }
  if (mode === 'mobile') throw new ApiError('Mobile/PIN session expired. Sign in again.', 401)
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1]
  if (!token) throw new ApiError('Sign in to save or select delivery addresses.', 401)
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user?.id) throw new ApiError('Google account session expired. Sign in again.', 401)
  return { type: 'google', ownerId: data.user.id, restaurantId: null,
    defaultName: String(data.user.user_metadata?.full_name || ''),
    defaultMobile: String(data.user.phone || data.user.user_metadata?.phone || '').replace(/\D/g, '').slice(-10) }
}
const tableOf = auth => auth.type === 'mobile' ? MOBILE : GOOGLE
const ownerCol = auth => auth.type === 'mobile' ? 'customer_id' : 'user_id'
const selectCols = 'id,label,recipient_name,recipient_mobile,address_line1,address_line2,landmark,city,state,pincode,latitude,longitude,gps_accuracy_m,is_default,created_at'
const getArgs = (request, body = {}) => {
  const url = new URL(request.url)
  return { mode: String(body.accountType || url.searchParams.get('accountType') || 'auto'),
    restaurantCode: String(body.restaurantCode || url.searchParams.get('restaurantCode') || '').trim() }
}
async function list(admin, auth) {
  const { data, error } = await admin.from(tableOf(auth)).select(selectCols)
    .eq(ownerCol(auth), auth.ownerId).order('is_default', { ascending: false }).order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  return data || []
}
function clean(raw) {
  const string = (key, max) => String(raw?.[key] ?? '').trim().slice(0, max)
  const mobile = string('recipient_mobile', 30).replace(/\D/g, '')
  const lat = Number(raw?.latitude), lng = Number(raw?.longitude)
  const accuracy = raw?.gps_accuracy_m === '' || raw?.gps_accuracy_m == null ? null : Number(raw.gps_accuracy_m)
  const payload = {
    label: string('label', 40) || 'Home', recipient_name: string('recipient_name', 120),
    recipient_mobile: mobile, address_line1: string('address_line1', 240),
    address_line2: string('address_line2', 240), landmark: string('landmark', 240),
    city: string('city', 120), state: string('state', 120), pincode: string('pincode', 6),
    latitude: lat, longitude: lng, gps_accuracy_m: accuracy,
  }
  if (payload.recipient_name.length < 2 || !/^[0-9]{10}$/.test(mobile) ||
      payload.address_line1.length < 2 || payload.city.length < 2 || payload.state.length < 2 ||
      !/^[0-9]{6}$/.test(payload.pincode) || !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180 ||
      (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 999999))) {
    throw new ApiError('Enter recipient name, 10-digit phone, complete address, pincode and a valid GPS pin.')
  }
  return payload
}
async function setDefault(admin, auth, id) {
  const { error } = await admin.rpc('dd_delivery_select_default_address', {
    p_account_type: auth.type, p_owner_id: auth.ownerId, p_address_id: id,
  })
  if (error) throw error
}
function logError(error) {
  if (!(error instanceof ApiError)) console.error('[DELIVERY SAVED ADDRESSES]', error?.code || 'ERROR', error?.message)
  return respond({ success: false, message: error instanceof ApiError ? error.message : 'Unable to manage saved addresses right now.' }, error instanceof ApiError ? error.status : 503)
}
export async function GET(request) {
  try {
    const admin = getAdminSupabase()
    const { mode, restaurantCode } = getArgs(request)
    const auth = await identity(request, admin, mode, restaurantCode)
    const addresses = await list(admin, auth)
    return respond({ success: true, accountType: auth.type, addresses,
      account: { name: auth.defaultName, mobile: auth.defaultMobile },
      userId: auth.type === 'google' ? auth.ownerId : null })
  } catch (error) { return logError(error) }
}
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const admin = getAdminSupabase()
    const { mode, restaurantCode } = getArgs(request, body)
    const auth = await identity(request, admin, mode, restaurantCode)
    const payload = clean(body.address)
    const existing = await list(admin, auth)
    if (existing.length >= 30) throw new ApiError('Maximum 30 saved addresses per account.')
    const record = { ...payload, [ownerCol(auth)]: auth.ownerId, is_default: false }
    if (auth.type === 'mobile') record.restaurant_id = auth.restaurantId
    const { data, error } = await admin.from(tableOf(auth)).insert(record).select('id').single()
    if (error) throw error
    // A new account's first address is always default; later addresses can opt in.
    const makeDefault = existing.length === 0 || body.makeDefault === true
    if (makeDefault) await setDefault(admin, auth, data.id)
    return respond({ success: true, addressId: data.id, isDefault: makeDefault }, 201)
  } catch (error) { return logError(error) }
}
export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}))
    if (!UUID.test(String(body.addressId || ''))) throw new ApiError('Invalid address ID.')
    const admin = getAdminSupabase()
    const { mode, restaurantCode } = getArgs(request, body)
    const auth = await identity(request, admin, mode, restaurantCode)
    if (body.setDefault === true) {
      await setDefault(admin, auth, body.addressId)
    } else {
      const payload = clean(body.address)
      const { data, error } = await admin.from(tableOf(auth)).update(payload)
        .eq('id', body.addressId).eq(ownerCol(auth), auth.ownerId).select('id').maybeSingle()
      if (error) throw error
      if (!data) throw new ApiError('Address not found.', 404)
      if (body.makeDefault === true) await setDefault(admin, auth, body.addressId)
    }
    return respond({ success: true })
  } catch (error) { return logError(error) }
}
export async function DELETE(request) {
  try {
    const body = await request.json().catch(() => ({}))
    if (!UUID.test(String(body.addressId || ''))) throw new ApiError('Invalid address ID.')
    const admin = getAdminSupabase()
    const { mode, restaurantCode } = getArgs(request, body)
    const auth = await identity(request, admin, mode, restaurantCode)
    const { data: found, error: findError } = await admin.from(tableOf(auth)).select('id,is_default')
      .eq('id', body.addressId).eq(ownerCol(auth), auth.ownerId).maybeSingle()
    if (findError) throw findError
    if (!found) throw new ApiError('Address not found.', 404)
    const { error } = await admin.from(tableOf(auth)).delete().eq('id', body.addressId).eq(ownerCol(auth), auth.ownerId)
    if (error) throw error
    if (found.is_default) {
      const remaining = await list(admin, auth)
      if (remaining.length) await setDefault(admin, auth, remaining[0].id)
    }
    return respond({ success: true })
  } catch (error) { return logError(error) }
}