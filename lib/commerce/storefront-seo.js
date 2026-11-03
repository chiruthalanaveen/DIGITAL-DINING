// Matches metadataBase in app/layout.jsx and app/layout.tsx. Request Host and
// tenant-supplied URLs must never select the canonical platform origin.
export const STOREFRONT_PUBLIC_ORIGIN = 'https://digitaldine-in.online'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const text = (value, maximum) => typeof value === 'string' ? value.trim().slice(0, maximum) : ''
const price = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000000 ? `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}` : null

function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(value)) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url : null
  } catch { return null }
}

function offerFor(row, url, trackInventory) {
  const amount = price(row.price_paise)
  if (amount === null) return null
  const stockKnown = trackInventory && Number.isSafeInteger(row.stock_quantity) && row.stock_quantity >= 0
  return {
    '@type': 'Offer', url, priceCurrency: 'INR', price: amount,
    ...(stockKnown ? { availability: `https://schema.org/${row.stock_quantity > 0 ? 'InStock' : 'OutOfStock'}` } : {}),
  }
}

function offersFor(product, url, trackInventory) {
  const variants = (Array.isArray(product.variants) ? product.variants : []).filter(row => row && uuid.test(row.id || '') && row.product_id === product.id && row.active === true)
  const rows = [...(product.variants_required ? [] : [product]), ...variants]
  const offers = rows.map(row => offerFor(row, url, trackInventory)).filter(Boolean)
  if (!offers.length) return null
  if (offers.length === 1) return offers[0]
  const amounts = offers.map(offer => Number(offer.price))
  const availability = offers.some(offer => offer.availability === 'https://schema.org/InStock') ? 'https://schema.org/InStock'
    : offers.every(offer => offer.availability === 'https://schema.org/OutOfStock') ? 'https://schema.org/OutOfStock' : null
  return {
    '@type': 'AggregateOffer', url, priceCurrency: 'INR',
    lowPrice: amounts.reduce((minimum, amount) => Math.min(minimum, amount)).toFixed(2),
    highPrice: amounts.reduce((maximum, amount) => Math.max(maximum, amount)).toFixed(2),
    offerCount: offers.length, offers, ...(availability ? { availability } : {}),
  }
}

/** Select only visible catalog facts; do not copy private rows into JSON-LD. */
export function buildStorefrontJsonLd(catalog, baseUrl = STOREFRONT_PUBLIC_ORIGIN) {
  const website = catalog?.website
  const base = httpsUrl(baseUrl)
  const slug = text(website?.slug, 81)
  const name = text(website?.name, 180)
  if (!base || base.pathname !== '/' || base.search || base.hash || !website || website.status !== 'active' || !name || slug.length < 2 || slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
  const storeUrl = new URL(`/shops/${encodeURIComponent(slug)}`, base.origin).href
  const title = text(website.settings?.seo?.title, 180) || name
  const description = text(website.settings?.seo?.description, 500) || text(website.branding?.description, 2000)
  const categoryNames = new Map((Array.isArray(catalog.categories) ? catalog.categories : []).filter(row => row && row.active !== false && uuid.test(row.id || '')).map(row => [row.id, text(row.name, 180)]))
  const seen = new Set()
  const products = website.features?.catalog === true ? (Array.isArray(catalog.products) ? catalog.products : []).flatMap(product => {
    if (!product || product.active === false || !uuid.test(product.id || '') || seen.has(product.id) || !text(product.name, 180)) return []
    seen.add(product.id)
    const url = `${storeUrl}?product=${encodeURIComponent(product.id)}`
    const images = [...(Array.isArray(product.images) ? product.images.map(image => image?.url) : []), product.image_url].map(value => httpsUrl(value)?.href).filter(Boolean)
    const offers = offersFor(product, url, website.features?.inventory === true)
    const category = categoryNames.get(product.category_id)
    return [{
      '@type': 'Product', '@id': `${url}#product`, url, name: text(product.name, 180),
      ...(text(product.description, 3000) ? { description: text(product.description, 3000) } : {}),
      ...(images.length ? { image: [...new Set(images)] } : {}),
      ...(category ? { category } : {}), ...(offers ? { offers } : {}),
    }]
  }) : []
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', '@id': `${storeUrl}#webpage`, url: storeUrl, name: title, ...(description ? { description } : {}), mainEntity: { '@id': `${storeUrl}#catalog` }, isPartOf: { '@type': 'WebSite', name, url: storeUrl } },
      { '@type': 'ItemList', '@id': `${storeUrl}#catalog`, numberOfItems: products.length, itemListElement: products.map((product, index) => ({ '@type': 'ListItem', position: index + 1, url: product.url, item: { '@id': product['@id'] } })) },
      ...products,
    ],
  }
}

/** Prevent a catalog string from closing the native application/ld+json tag. */
export function serializeStorefrontJsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}
