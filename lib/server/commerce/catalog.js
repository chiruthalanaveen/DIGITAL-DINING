import { CommerceError, dataResult, parse, publicClient } from './core'
import { brandingSchema, slug as slugSchema } from './validation'
import { commerceImageUrl, optionalCommerceRpc, publicStoreSettings } from './expansion'
import { uuid } from './validation'

const text = (value, max = 3000) => String(value || '').slice(0, max)
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : 0
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const invalidCatalog = () => { throw new CommerceError('The store catalog could not be verified.', 503) }
const checkedInteger = value => Number.isSafeInteger(value) && value >= 0 ? value : invalidCatalog()
const checkedId = value => uuid.safeParse(value).success ? value : invalidCatalog()
const image = value => commerceImageUrl.safeParse(value || '').success ? value || '' : ''

function productOptions(row) {
  if (typeof row.variants_required !== 'boolean' || !Array.isArray(row.images) || !Array.isArray(row.variants) || row.images.length > 12) invalidCatalog()
  const images = row.images.map(item => {
    if (!object(item) || !Number.isInteger(item.sort_order) || item.sort_order < 0 || item.sort_order > 11) invalidCatalog()
    return { id: checkedId(item.id), url: image(item.url), alt: text(item.alt, 300), sort_order: item.sort_order }
  }).filter(item => item.url).sort((a, b) => a.sort_order - b.sort_order)
  const variants = row.variants.filter(item => item.active === true).map(item => {
    if (item.product_id !== row.id || !object(item.options) || Object.keys(item.options).length > 8 || Object.entries(item.options).some(([key, value]) => !key || key.length > 40 || typeof value !== 'string' || !value || value.length > 100)) invalidCatalog()
    return { id: checkedId(item.id), product_id: checkedId(item.product_id), sku: text(item.sku, 80), name: text(item.name, 180), options: item.options, price_paise: checkedInteger(item.price_paise), stock_quantity: checkedInteger(item.stock_quantity), active: true }
  })
  if (new Set(variants.map(item => item.id)).size !== variants.length) invalidCatalog()
  return { variants_required: row.variants_required, images, variants }
}

function deliveryZones(rows) {
  if (!Array.isArray(rows)) invalidCatalog()
  return rows.map(row => {
    if (!object(row) || !Array.isArray(row.pincodes) || row.pincodes.length > 500 || row.pincodes.some(pin => typeof pin !== 'string' || !/^\d{6}$/.test(pin))) invalidCatalog()
    return { id: checkedId(row.id), name: text(row.name, 120), pincodes: row.pincodes, delivery_fee_paise: checkedInteger(row.delivery_fee_paise), minimum_order_paise: checkedInteger(row.minimum_order_paise) }
  })
}

export async function getPublicCatalog(slug) {
  if (!slugSchema.safeParse(slug).success) return null
  const client = publicClient()
  const expanded = await optionalCommerceRpc(client, 'commerce_public_catalog_v2', { p_slug: slug })
  const raw = expanded.available ? expanded.data : await dataResult(client.rpc('commerce_public_catalog', { p_slug: slug }))
  if (raw === null) return null
  if (expanded.available && (!object(raw) || !object(raw.website) || !Array.isArray(raw.categories) || !Array.isArray(raw.products))) invalidCatalog()
  if (!raw?.website || raw.website.business_type === 'pharmacy' || raw.website.status !== 'active') return null
  const website = raw.website
  if (website.slug !== slug) throw new CommerceError('Unable to verify website.', 503)
  const branding = brandingSchema.safeParse(website.branding || {})
  const settings = expanded.available ? publicStoreSettings(website.settings) : null
  if (expanded.available && (website.template !== settings.template || !uuid.safeParse(website.id).success)) invalidCatalog()
  const features = Object.fromEntries(['catalog', 'inventory', 'cod'].map(key => [key, website.features?.[key] === true]))
  const categories = features.catalog ? (Array.isArray(raw.categories) ? raw.categories : []).filter(row => row.active !== false).map(row => ({ id: text(row.id, 50), name: text(row.name, 180), slug: text(row.slug, 80) })) : []
  const categoryIds = new Set(categories.map(row => row.id))
  const products = features.catalog ? (Array.isArray(raw.products) ? raw.products : []).filter(row => row.active !== false && (!row.category_id || categoryIds.has(row.category_id))).map(row => {
    let imageUrl = ''
    try { const url = new URL(row.image_url); if (!url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) imageUrl = url.href } catch {}
    return { id: text(row.id, 50), category_id: row.category_id || null, name: text(row.name, 180), slug: text(row.slug, 80), description: text(row.description), price_paise: expanded.available ? checkedInteger(row.price_paise) : integer(row.price_paise), stock_quantity: expanded.available ? checkedInteger(row.stock_quantity) : integer(row.stock_quantity), image_url: imageUrl, attributes: row.attributes && typeof row.attributes === 'object' && !Array.isArray(row.attributes) ? row.attributes : {}, ...(expanded.available ? productOptions(row) : {}) }
  }) : []
  let payments = { available: false }
  if (process.env.COMMERCE_ONLINE_PAYMENTS_ENABLED === 'true') {
    const readiness = await optionalCommerceRpc(client, 'commerce_payment_availability', { p_website_id: website.id })
    const value = readiness.data
    if (value?.available === true && value.provider === 'razorpay' && (value.mode === 'test' || value.mode === 'live' && process.env.COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE === 'true')) payments = { available: true, provider: 'razorpay', mode: value.mode }
  }
  return {
    website: {
      id: text(website.id, 50), slug: text(website.slug, 80), name: text(website.name, 180), business_type: text(website.business_type, 40), template: settings?.template || 'general',
      status: 'active', branding: branding.success ? branding.data : {}, features,
      ...(settings ? { settings } : {}),
      fulfillment: { pickup: website.fulfillment?.pickup === true, delivery: website.fulfillment?.delivery === true, delivery_fee_paise: integer(website.fulfillment?.delivery_fee_paise), minimum_order_paise: integer(website.fulfillment?.minimum_order_paise), pickup_address: text(website.fulfillment?.pickup_address, 1000) },
    }, categories, products, ...(expanded.available ? { delivery_zones: deliveryZones(raw.delivery_zones), expansion_available: true } : {}), payments,
  }
}

export function validateCatalogSlug(value) { return parse(slugSchema, value) }
