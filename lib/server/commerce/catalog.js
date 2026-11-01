import { CommerceError, dataResult, parse, publicClient } from './core'
import { brandingSchema, slug as slugSchema } from './validation'

const text = (value, max = 3000) => String(value || '').slice(0, max)
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : 0

export async function getPublicCatalog(slug) {
  if (!slugSchema.safeParse(slug).success) return null
  const raw = await dataResult(publicClient().rpc('commerce_public_catalog', { p_slug: slug }))
  if (!raw?.website || raw.website.business_type === 'pharmacy' || raw.website.status !== 'active') return null
  const website = raw.website
  if (website.slug !== slug) throw new CommerceError('Unable to verify website.', 503)
  const branding = brandingSchema.safeParse(website.branding || {})
  const features = Object.fromEntries(['catalog', 'inventory', 'cod'].map(key => [key, website.features?.[key] === true]))
  const categories = features.catalog ? (Array.isArray(raw.categories) ? raw.categories : []).filter(row => row.active !== false).map(row => ({ id: text(row.id, 50), name: text(row.name, 180), slug: text(row.slug, 80) })) : []
  const categoryIds = new Set(categories.map(row => row.id))
  const products = features.catalog ? (Array.isArray(raw.products) ? raw.products : []).filter(row => row.active !== false && (!row.category_id || categoryIds.has(row.category_id))).map(row => {
    let imageUrl = ''
    try { const url = new URL(row.image_url); if (!url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) imageUrl = url.href } catch {}
    return { id: text(row.id, 50), category_id: row.category_id || null, name: text(row.name, 180), slug: text(row.slug, 80), description: text(row.description), price_paise: integer(row.price_paise), stock_quantity: integer(row.stock_quantity), image_url: imageUrl, attributes: row.attributes && typeof row.attributes === 'object' && !Array.isArray(row.attributes) ? row.attributes : {} }
  }) : []
  return {
    website: {
      id: text(website.id, 50), slug: text(website.slug, 80), name: text(website.name, 180), business_type: text(website.business_type, 40), template: 'general',
      status: 'active', branding: branding.success ? branding.data : {}, features,
      fulfillment: { pickup: website.fulfillment?.pickup === true, delivery: website.fulfillment?.delivery === true, delivery_fee_paise: integer(website.fulfillment?.delivery_fee_paise), minimum_order_paise: integer(website.fulfillment?.minimum_order_paise), pickup_address: text(website.fulfillment?.pickup_address, 1000) },
    }, categories, products,
  }
}

export function validateCatalogSlug(value) { return parse(slugSchema, value) }
