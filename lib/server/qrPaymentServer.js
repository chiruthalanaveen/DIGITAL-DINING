import Razorpay from 'razorpay'
import { createClient } from '@supabase/supabase-js'
import { decryptGatewaySecret } from '@/lib/server/paymentGatewayCrypto'

export const QR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function qrRespond(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export function qrError(message, status = 400, code = 'QR_PAYMENT_ERROR') {
  return qrRespond({ success: false, code, message }, status)
}

export function qrAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing QR payment server Supabase configuration.')
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function qrRupees(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

export function qrIstDate() {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
}

export function qrAssert(condition, code, message) {
  if (!condition) {
    const error = new Error(message)
    error.code = code
    error.httpStatus = 400
    throw error
  }
}

export async function qrGateway(admin, restaurant) {
  const { data: configured, error: cfgError } = await admin
    .from('payment_gateway_configs')
    .select('key_id,secret_ciphertext,secret_iv,secret_tag,is_enabled')
    .eq('restaurant_id', restaurant.id)
    .eq('module', 'restaurant')
    .eq('provider', 'razorpay')
    .maybeSingle()

  if (cfgError) throw cfgError
  if (configured) {
    qrAssert(configured.is_enabled === true, 'GATEWAY_DISABLED',
      'Restaurant online payments are disabled.')
    qrAssert(Boolean(configured.key_id && configured.secret_ciphertext &&
      configured.secret_iv && configured.secret_tag), 'GATEWAY_NOT_READY',
      'Restaurant online payments are not configured.')
    const keySecret = decryptGatewaySecret({
      ciphertext: configured.secret_ciphertext,
      iv: configured.secret_iv,
      tag: configured.secret_tag,
    })
    return {
      keyId: configured.key_id,
      razorpay: new Razorpay({ key_id: configured.key_id, key_secret: keySecret }),
      keySecret,
    }
  }

  // Legacy fallback for restaurants not yet migrated to the encrypted gateway
  // table. This preserves previous restaurant QR Razorpay functionality.
  // A deliberately disabled gateway row never falls back to legacy keys.
  const { data: legacy, error: legacyError } = await admin
    .from('restaurants')
    .select('razorpay_key_id,razorpay_key_secret,razorpay_secret')
    .eq('id', restaurant.id)
    .single()
  if (legacyError) throw legacyError
  const keyId = String(legacy?.razorpay_key_id || '').trim()
  const keySecret = String(legacy?.razorpay_key_secret || legacy?.razorpay_secret || '').trim()
  qrAssert(Boolean(keyId && keySecret), 'GATEWAY_NOT_READY',
    'Restaurant Razorpay credentials are not configured.')
  return { keyId, keySecret, razorpay: new Razorpay({ key_id: keyId, key_secret: keySecret }) }
}

export async function qrEligible(admin, restaurantId) {
  const { data, error } = await admin.rpc('digital_dine_wallet_is_orderable', {
    p_restaurant_id: restaurantId,
  })
  if (error) throw error
  return data === true
}

export async function qrBuildVerifiedCart(admin, restaurantId, submittedItems) {
  qrAssert(Array.isArray(submittedItems) && submittedItems.length > 0 &&
    submittedItems.length <= 80, 'INVALID_CART', 'The cart must have 1–80 items.')

  const itemIds = submittedItems.map((entry) => String(entry?.id || entry?.menu_item_id || ''))
  qrAssert(itemIds.every((id) => QR_ID_RE.test(id)) &&
    new Set(itemIds).size === itemIds.length, 'INVALID_CART',
  'Cart contains an invalid or repeated menu item.')

  const { data: menuRows, error: menuError } = await admin
    .from('menu_items')
    .select('id,name,price,category,is_available,food_type,is_veg,description,image_url')
    .eq('restaurant_id', restaurantId)
    .in('id', itemIds)
  if (menuError) throw menuError
  const byId = new Map((menuRows || []).map((row) => [String(row.id), row]))

  const { data: offerRows, error: offerError } = await admin
    .from('daily_offers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .eq('offer_date', qrIstDate())
  if (offerError) throw offerError
  const offersByItem = new Map()
  for (const offer of offerRows || []) {
    // Existing QR menu permits an offer linked by item ID OR matching its title
    // to a menu item name. Preserve that behavior during server verification.
    let id = String(offer.menu_item_id || offer.item_id || '')
    if (!byId.has(id)) {
      const title = String(offer.title || '').trim().toLowerCase()
      id = String(menuRows.find((row) =>
        String(row.name || '').trim().toLowerCase() === title)?.id || '')
    }
    if (!id || !byId.has(id)) continue
    // An active offer without offer_price is still valid at regular menu price,
    // matching the existing customer-side addOfferToCart behavior.
    const candidate = offer.offer_price != null &&
      Number.isFinite(Number(offer.offer_price)) && Number(offer.offer_price) >= 0
        ? qrRupees(offer.offer_price) : null
    if (!offersByItem.has(id) ||
        (candidate != null && (offersByItem.get(id) == null || candidate < offersByItem.get(id)))) {
      offersByItem.set(id, candidate)
    }
  }

  let subtotalPaise = 0
  const snapshot = submittedItems.map((entry, index) => {
    const id = itemIds[index]
    const menu = byId.get(id)
    qrAssert(Boolean(menu?.is_available), 'ITEM_UNAVAILABLE',
      'One or more menu items are no longer available. Please refresh your menu.')
    const quantity = Number(entry.quantity ?? entry.qty)
    qrAssert(Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 50,
      'INVALID_QUANTITY', 'Item quantities must be between 1 and 50.')
    const standardPrice = qrRupees(menu.price)
    qrAssert(Number.isFinite(standardPrice) && standardPrice >= 0,
      'INVALID_ITEM_PRICE', 'A menu item has an invalid price.')

    const isDailyOffer = entry.is_daily_offer === true
    const offerPrice = offersByItem.get(id)
    if (isDailyOffer) {
      qrAssert(offersByItem.has(id), 'OFFER_EXPIRED',
        'A daily offer has expired. Please refresh your cart.')
    }
    const price = isDailyOffer && offerPrice != null ? offerPrice : standardPrice
    const paise = Math.round(price * 100)
    qrAssert(Number.isSafeInteger(paise) && paise >= 0,
      'INVALID_ITEM_PRICE', 'Invalid amount for a menu item.')
    subtotalPaise += paise * quantity

    return {
      id,
      menu_item_id: id,
      name: menu.name,
      price,
      quantity,
      qty: quantity,
      food_type: menu.food_type || (menu.is_veg ? 'veg' : 'non-veg'),
      description: menu.description || '',
      image_url: menu.image_url || '',
      ...(isDailyOffer ? { is_daily_offer: true, offer_title: String(entry.offer_title || menu.name).slice(0, 150) } : {}),
    }
  })
  qrAssert(Number.isSafeInteger(subtotalPaise) && subtotalPaise <= 100_000_000,
    'ORDER_TOO_LARGE', 'Order amount is too large.')
  return { snapshot, subtotalPaise }
}

export function qrSafeError(error) {
  const code = String(error?.code || 'QR_PAYMENT_ERROR')
  const allowed = new Set([
    'INVALID_CART','INVALID_QUANTITY','INVALID_ITEM_PRICE','ITEM_UNAVAILABLE',
    'OFFER_EXPIRED','ORDER_TOO_LARGE','GATEWAY_NOT_READY','GATEWAY_DISABLED',
    'RESTAURANT_UNAVAILABLE','WALLET_LOW_BALANCE','FEATURE_DISABLED',
    'PRICE_CHANGED','INVALID_RESTAURANT','INVALID_CUSTOMER','INVALID_TABLE',
  ])
  if (allowed.has(code)) {
    return qrError(error.message, Number(error.httpStatus || 400), code)
  }
  console.error('[QR PAYMENT] Request failed:', error?.code || error?.message || 'unknown')
  return qrError('Payment service is temporarily unavailable. Please try again.', 503, 'QR_PAYMENT_SERVICE_ERROR')
}