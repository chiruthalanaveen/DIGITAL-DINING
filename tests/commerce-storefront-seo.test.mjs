import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/commerce/storefront-seo.js', import.meta.url), 'utf8')
const { buildStorefrontJsonLd, serializeStorefrontJsonLd, STOREFRONT_PUBLIC_ORIGIN } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const productId = '11111111-1111-4111-8111-111111111111'
const otherProductId = '11111111-1111-4111-8111-111111111112'
const categoryId = '22222222-2222-4222-8222-222222222222'
const variantId = '33333333-3333-4333-8333-333333333333'
const otherVariantId = '33333333-3333-4333-8333-333333333334'
const products = data => data['@graph'].filter(row => row['@type'] === 'Product')

function catalog() {
  return {
    website: { slug: 'asha-sarees', name: 'Asha Sarees', status: 'active', features: { catalog: true, inventory: true }, branding: { description: 'Handwoven sarees.' }, settings: { seo: { title: 'Shop Asha Sarees', description: 'Explore our handwoven collection.' } } },
    categories: [{ id: categoryId, name: 'Cotton sarees', active: true }],
    products: [{ id: productId, name: 'Blue cotton saree', description: 'A handwoven cotton saree.', category_id: categoryId, price_paise: 125099, stock_quantity: 3, image_url: 'https://images.example.test/blue.jpg', variants_required: false }],
  }
}

test('store JSON-LD describes the actual collection, ordered catalog and product with exact INR price', () => {
  const data = buildStorefrontJsonLd(catalog())
  assert.equal(data['@context'], 'https://schema.org')
  const [page, list, product] = data['@graph']
  assert.equal(page['@type'], 'CollectionPage')
  assert.equal(page.name, 'Shop Asha Sarees')
  assert.equal(page.description, 'Explore our handwoven collection.')
  assert.equal(page.url, `${STOREFRONT_PUBLIC_ORIGIN}/shops/asha-sarees`)
  assert.equal(list['@type'], 'ItemList')
  assert.equal(list.numberOfItems, 1)
  assert.deepEqual(list.itemListElement, [{ '@type': 'ListItem', position: 1, url: product.url, item: { '@id': product['@id'] } }])
  assert.equal(product.url, `${page.url}?product=${productId}`)
  assert.equal(product.name, 'Blue cotton saree')
  assert.equal(product.category, 'Cotton sarees')
  assert.deepEqual(product.image, ['https://images.example.test/blue.jpg'])
  assert.deepEqual(product.offers, { '@type': 'Offer', url: product.url, priceCurrency: 'INR', price: '1250.99', availability: 'https://schema.org/InStock' })
})

test('required variants use actual active variant price range rather than an unavailable base price', () => {
  const input = catalog()
  input.products[0] = { ...input.products[0], variants_required: true, price_paise: 1, variants: [
    { id: variantId, product_id: productId, name: 'Red', price_paise: 150001, stock_quantity: 0, active: true },
    { id: otherVariantId, product_id: productId, name: 'Blue', price_paise: 175050, stock_quantity: 2, active: true },
    { id: '33333333-3333-4333-8333-333333333335', product_id: productId, price_paise: 1, stock_quantity: 100, active: false },
    { id: '33333333-3333-4333-8333-333333333336', product_id: otherProductId, price_paise: 1, stock_quantity: 100, active: true },
  ] }
  const offer = products(buildStorefrontJsonLd(input))[0].offers
  assert.equal(offer['@type'], 'AggregateOffer')
  assert.equal(offer.lowPrice, '1500.01')
  assert.equal(offer.highPrice, '1750.50')
  assert.equal(offer.offerCount, 2)
  assert.equal(offer.availability, 'https://schema.org/InStock')
  assert.deepEqual(offer.offers.map(row => row.price), ['1500.01', '1750.50'])
  assert.deepEqual(offer.offers.map(row => row.availability), ['https://schema.org/OutOfStock', 'https://schema.org/InStock'])
})

test('optional variants include the purchasable standard product and one required variant uses a single Offer', () => {
  const input = catalog()
  input.products[0].variants = [{ id: variantId, product_id: productId, price_paise: 150000, stock_quantity: 0, active: true }]
  let offer = products(buildStorefrontJsonLd(input))[0].offers
  assert.equal(offer['@type'], 'AggregateOffer')
  assert.equal(offer.lowPrice, '1250.99')
  assert.equal(offer.offerCount, 2)
  input.products[0].variants_required = true
  offer = products(buildStorefrontJsonLd(input))[0].offers
  assert.equal(offer['@type'], 'Offer')
  assert.equal(offer.price, '1500.00')
  assert.equal(offer.availability, 'https://schema.org/OutOfStock')
})

test('untracked or malformed inventory never fabricates stock claims and required products without options have no offers', () => {
  const input = catalog()
  input.website.features.inventory = false
  input.products[0].stock_quantity = 0
  assert.equal(Object.hasOwn(products(buildStorefrontJsonLd(input))[0].offers, 'availability'), false)
  input.products[0].variants = [{ id: variantId, product_id: productId, price_paise: 150000, stock_quantity: 0, active: true }]
  const aggregate = products(buildStorefrontJsonLd(input))[0].offers
  assert.equal(Object.hasOwn(aggregate, 'availability'), false)
  assert.ok(aggregate.offers.every(row => !Object.hasOwn(row, 'availability')))
  input.website.features.inventory = true
  delete input.products[0].variants
  input.products[0].stock_quantity = '3'
  assert.equal(Object.hasOwn(products(buildStorefrontJsonLd(input))[0].offers, 'availability'), false)
  input.products[0].variants_required = true
  assert.equal(Object.hasOwn(products(buildStorefrontJsonLd(input))[0], 'offers'), false)
})

test('invalid prices cannot become free offers while a real zero price remains exact', () => {
  const input = catalog()
  for (const invalid of [null, undefined, '125099', -1, NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER]) {
    input.products[0].price_paise = invalid
    assert.equal(Object.hasOwn(products(buildStorefrontJsonLd(input))[0], 'offers'), false)
  }
  input.products[0].price_paise = 0
  assert.equal(products(buildStorefrontJsonLd(input))[0].offers.price, '0.00')
})

test('invalid and credential-bearing image URLs are omitted while real gallery URLs deduplicate', () => {
  const input = catalog()
  input.products[0].images = [
    { url: 'https://images.example.test/back.jpg' },
    { url: 'https://images.example.test/blue.jpg' },
    { url: 'javascript:alert(1)' },
    { url: 'data:image/svg+xml,<svg />' },
    { url: '//images.example.test/protocol-relative.jpg' },
    { url: 'https://user:password@images.example.test/private.jpg' },
    { url: 'http://127.0.0.1/local-only.jpg' },
    { url: 'https://images.example.test/line\nbreak.jpg' },
    { url: 'https:\\images.example.test\\backslash.jpg' },
  ]
  assert.deepEqual(products(buildStorefrontJsonLd(input))[0].image, ['https://images.example.test/back.jpg', 'https://images.example.test/blue.jpg'])
})

test('only visible actual products appear and disabled catalog has an honest empty ItemList', () => {
  const input = catalog()
  input.products.push({ ...input.products[0] }, { ...input.products[0], id: otherProductId, active: false }, { ...input.products[0], id: 'invalid-id' }, { ...input.products[0], id: '11111111-1111-4111-8111-111111111113', name: '' })
  assert.equal(products(buildStorefrontJsonLd(input)).length, 1)
  input.website.features.catalog = false
  const data = buildStorefrontJsonLd(input)
  assert.equal(data['@graph'][1].numberOfItems, 0)
  assert.equal(products(data).length, 0)
})

test('canonical URLs come from trusted platform configuration and reject invalid base, slug or inactive store', () => {
  const input = catalog()
  input.website.url = 'https://untrusted-tenant-url.example/steal'
  input.website.host = 'untrusted-request-host.example'
  assert.equal(buildStorefrontJsonLd(input)['@graph'][0].url, 'https://digitaldine-in.online/shops/asha-sarees')
  for (const base of ['javascript:alert(1)', 'http://example.test', '//example.test', 'https://user:password@example.test', 'https://example.test/path', 'https://example.test/?secret=value', 'https://example.test/#fragment']) assert.equal(buildStorefrontJsonLd(input, base), null)
  input.website.slug = '../../other-tenant'
  assert.equal(buildStorefrontJsonLd(input), null)
  input.website.slug = 'asha-sarees'
  input.website.status = 'suspended'
  assert.equal(buildStorefrontJsonLd(input), null)
  assert.equal(buildStorefrontJsonLd(null), null)
})

test('JSON-LD serializes hostile catalog text without executable HTML or Unicode line separators and preserves text facts', () => {
  const input = catalog()
  const hostile = '</script><script>alert("xss")</script>\u2028\u2029after'
  input.products[0].description = hostile
  input.products[0].owner_id = 'private-owner-id'
  input.products[0].supplier_email = 'private-supplier@example.test'
  input.products[0].aggregateRating = { ratingValue: 5, reviewCount: 100 }
  input.products[0].shippingDetails = { deliveryTime: 'invented-two-hours' }
  input.website.owner_id = 'private-owner-id'
  input.website.monthly_price_paise = 999999
  input.customer_details = { name: 'private-buyer-name' }
  const data = buildStorefrontJsonLd(input)
  const serialized = serializeStorefrontJsonLd(data)
  assert.equal(serialized.includes('<'), false)
  assert.equal(serialized.includes('\u2028'), false)
  assert.equal(serialized.includes('\u2029'), false)
  assert.match(serialized, /\\u003c\/script>/)
  assert.match(serialized, /\\u2028\\u2029/)
  assert.equal(products(JSON.parse(serialized))[0].description, hostile)
  assert.doesNotMatch(serialized, /private-owner|private-supplier|private-buyer|monthly_price|aggregateRating|reviewCount|ratingValue|shippingDetails|invented-two-hours/)
})
