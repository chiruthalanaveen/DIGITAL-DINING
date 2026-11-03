import { z } from 'zod'
import { uuid } from './validation'
import { CommerceError, dataResult } from './core'

const money = z.number().int().min(0).max(100000000)
const text = max => z.string().trim().max(max)
export const commerceImageUrl = text(2048).refine(value => {
  if (!value) return true
  try {
    const url = new URL(value)
    return !url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  } catch { return false }
}, 'Use an HTTPS image URL.')
export const templates = z.enum(['general', 'sarees', 'grocery', 'fashion', 'food'])
export const policiesSchema = z.object({
  shipping: text(10000).optional(), returns: text(10000).optional(), privacy: text(10000).optional(), terms: text(10000).optional(),
  returns_enabled: z.boolean().optional(), return_days: z.number().int().min(0).max(365).optional(),
}).strict().superRefine((value, context) => {
  if (value.returns_enabled && (!value.returns?.trim() || !value.return_days)) context.addIssue({ code: 'custom', message: 'Set a returns policy and a window of 1–365 days before enabling returns.' })
})
export const sectionsSchema = z.array(z.object({
  id: text(80).min(1).regex(/^[A-Za-z0-9_-]+$/), type: z.enum(['hero', 'categories', 'featured_products', 'banner', 'text', 'faq']), enabled: z.boolean(),
  title: text(180).optional(), body: text(3000).optional(), image_url: commerceImageUrl.optional(), category_id: uuid.nullable().optional(),
  product_ids: z.array(uuid).max(50).optional(),
}).strict()).max(20).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, 'Section IDs must be unique.')
export const settingsSchema = z.object({
  policies: policiesSchema.optional(), faq: z.array(z.object({ question: text(300).min(1), answer: text(3000).min(1) }).strict()).max(30).optional(),
  sections: sectionsSchema.optional(), seo: z.object({ title: text(180).optional(), description: text(500).optional(), image_url: commerceImageUrl.optional() }).strict().optional(),
  delivery_zones_enabled: z.boolean().optional(),
}).strict()
const images = z.array(z.object({ url: commerceImageUrl.refine(Boolean, 'Choose an image URL.'), alt: text(300).optional(), sort_order: z.number().int().min(0).max(11).optional() }).strict()).max(12).refine(rows => rows.every((row, index) => row.sort_order === undefined || row.sort_order === index), 'Image order must match its position.')
const options = z.record(text(40).min(1), text(100).min(1)).refine(value => Object.keys(value).length <= 8, 'Use at most eight variant options.')
export const catalogActions = {
  save_product_options: z.object({ product_id: uuid, variants_required: z.boolean(), images }).strict(),
  save_variant: z.object({ id: uuid.optional(), product_id: uuid, sku: text(80).min(1), name: text(180).min(1), options, price_paise: money, active: z.boolean().optional() }).strict(),
  archive_variant: z.object({ id: uuid }).strict(),
  adjust_variant_stock: z.object({ variant_id: uuid, delta: z.number().int().min(-1000000).max(1000000).refine(value => value !== 0) }).strict(),
  save_delivery_zone: z.object({ id: uuid.optional(), name: text(120).min(1), pincodes: z.array(z.string().regex(/^[0-9]{6}$/)).min(1).max(500).refine(rows => new Set(rows).size === rows.length, 'PIN codes must be unique.'), delivery_fee_paise: money, minimum_order_paise: money, active: z.boolean().optional() }).strict(),
  archive_delivery_zone: z.object({ id: uuid }).strict(), save_settings: settingsSchema,
}
export const catalogPermission = action => ({ save_product_options: 'products', save_variant: 'products', archive_variant: 'products', adjust_variant_stock: 'inventory', save_delivery_zone: 'branding', archive_delivery_zone: 'branding', save_settings: 'branding' })[action]
const customer = z.object({
  name: text(180).min(2), phone: text(30).min(7).regex(/^\+?[0-9][0-9 ()-]+$/), address: text(1000).optional(),
  pincode: z.union([z.literal(''), z.string().regex(/^[0-9]{6}$/, 'Enter a six-digit delivery PIN code.')]).optional(), saved_address_id: uuid.optional(),
}).strict()
const items = z.array(z.object({ product_id: uuid, quantity: z.number().int().min(1).max(999), variant_id: uuid.optional() }).strict()).min(1).max(50)
const couponCode = z.union([z.literal(''), text(32).toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, 'Enter a valid promotion code.')]).optional()
const checkoutFields = { items, customer, fulfillment_method: z.enum(['pickup', 'delivery']), coupon_code: couponCode, payment_method: z.literal('cod') }
const deliveryAddress = value => value.fulfillment_method !== 'delivery' || Boolean(value.customer.saved_address_id) || (value.customer.address || '').length >= 5
export const expandedCheckoutSchema = z.object({ ...checkoutFields, idempotency_key: uuid }).strict().refine(deliveryAddress, 'Enter a delivery address.')
export const quoteSchema = z.object({ ...checkoutFields, payment_method: z.literal('cod').optional() }).strict().refine(deliveryAddress, 'Enter a delivery address.')
export const onlineQuoteSchema = z.object({ ...checkoutFields, payment_method: z.literal('razorpay').optional() }).strict().refine(deliveryAddress, 'Enter a delivery address.')

export function checkedCheckoutQuote(quote) {
  if (!quote || !['subtotal_paise', 'delivery_fee_paise', 'discount_paise', 'total_paise'].every(key => Number.isSafeInteger(quote[key]) && quote[key] >= 0) || quote.total_paise !== quote.subtotal_paise + quote.delivery_fee_paise - quote.discount_paise) throw new CommerceError('Checkout totals could not be verified. Please retry.', 503)
  return quote
}

export function missingCommerceExtension(error) { return ['PGRST202', 'PGRST205', '42P01', '42883'].includes(String(error?.code || '')) }

/** Missing optional schema is distinct from denial, a timeout or malformed data. */
export async function optionalCommerceRpc(client, name, args) {
  const query = client.rpc(name, args)
  return optionalCommerceQuery(query)
}

export async function optionalCommerceQuery(query) {
  const result = await (typeof query?.abortSignal === 'function' ? query.abortSignal(AbortSignal.timeout(10000)) : query)
  if (result.error && missingCommerceExtension(result.error)) return { available: false, data: null }
  return { available: true, data: await dataResult(Promise.resolve(result)) }
}

export function publicStoreSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CommerceError('Store options could not be verified.', 503)
  const selected = Object.fromEntries(['policies', 'faq', 'sections', 'seo', 'delivery_zones_enabled'].filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]))
  const result = settingsSchema.safeParse(selected)
  const template = templates.safeParse(raw.template || 'general')
  if (!result.success || !template.success) throw new CommerceError('Store options could not be verified.', 503)
  return { ...result.data, template: template.data }
}

export function catalogWorkspace(raw, websiteId) {
  const collections = ['product_profiles', 'images', 'variants', 'delivery_zones']
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !templates.safeParse(raw.settings?.template).success || raw.settings.website_id && raw.settings.website_id !== websiteId || collections.some(key => !Array.isArray(raw[key]) || raw[key].some(row => !row || typeof row !== 'object' || Array.isArray(row) || row.website_id && row.website_id !== websiteId))) throw new CommerceError('Store options could not be verified.', 503)
  return { settings: publicStoreSettings(raw.settings), ...Object.fromEntries(collections.map(key => [key, raw[key]])) }
}

export function hasExpandedCheckout(payload) {
  return Boolean(payload.coupon_code || payload.customer.saved_address_id || payload.customer.pincode || payload.items.some(item => item.variant_id))
}

export async function checkoutRpc(client, websiteId, payload) {
  const basic = { p_website_id: websiteId, p_items: payload.items, p_customer: payload.customer, p_fulfillment: payload.fulfillment_method, p_idempotency_key: payload.idempotency_key }
  const enhanced = await optionalCommerceRpc(client, 'commerce_create_cod_order_v2', { ...basic, p_coupon_code: payload.coupon_code || '' })
  if (enhanced.available) return enhanced.data
  if (hasExpandedCheckout(payload)) throw new CommerceError('These checkout options are not available yet. Contact the store or try its standard checkout.', 503)
  // Only unextended requests can use the original installed contract. Once the
  // migration is installed, the original RPC also enforces new store rules.
  return dataResult(client.rpc('commerce_create_cod_order', basic))
}
