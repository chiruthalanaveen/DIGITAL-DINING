/** Public-catalog presentation helpers. Checkout always verifies these values again. */
export const STOREFRONT_TEMPLATES = ['general', 'sarees', 'grocery', 'fashion', 'food']

export function storefrontTemplate(website = {}) {
  const template = website.template || website.settings?.template
  return STOREFRONT_TEMPLATES.includes(template) ? template : 'general'
}

export function productImages(product = {}) {
  const images = Array.isArray(product.images) ? product.images : []
  const rows = images.map(image => typeof image === 'string' ? { image_url: image } : image)
  if (product.image_url) rows.push({ image_url: product.image_url, alt_text: product.name })
  const seen = new Set()
  return rows.flatMap(image => {
    const url = String(image?.image_url || image?.url || '').trim()
    if (!url || !/^https?:\/\//i.test(url) && !url.startsWith('/') || url.startsWith('//') || url.includes('\\') || seen.has(url)) return []
    seen.add(url)
    return [{ url, alt: String(image.alt_text || image.alt || product.name || 'Product') }]
  })
}

export function productVariants(product = {}) {
  return (Array.isArray(product.variants) ? product.variants : []).filter(variant => variant && typeof variant.id === 'string' && variant.active !== false && variant.is_active !== false)
}

export function variantLabel(variant) {
  if (!variant) return ''
  const options = Object.entries(variant.options || {}).filter(([, value]) => ['string', 'number'].includes(typeof value)).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`)
  return options.join(' / ') || String(variant.name || variant.label || variant.sku || 'Option')
}

export function productPrice(product = {}) {
  const variants = productVariants(product)
  const prices = [...variants.map(variant => Number(variant.price_paise)), ...(product.variants_required ? [] : [Number(product.price_paise)])].filter(price => Number.isSafeInteger(price) && price >= 0)
  return prices.length ? Math.min(...prices) : Number(product.price_paise) || 0
}

export function cartLineKey(productId, variantId) {
  return variantId ? `${productId}:${variantId}` : productId
}

export function lineStock(product, variant, { trackInventory = true } = {}) {
  if (!trackInventory) return 999
  const value = Number(variant ? variant.stock_quantity : product.stock_quantity)
  return Number.isInteger(value) && value > 0 ? Math.min(value, 999) : 0
}

export function productStock(product, options = {}) {
  const variants = productVariants(product)
  if (product.variants_required && !variants.length) return 0
  if (options.trackInventory === false) return 999
  return variants.length || product.variants_required ? variants.reduce((sum, variant) => sum + lineStock(product, variant, options), product.variants_required ? 0 : lineStock(product, null, options)) : lineStock(product, null, options)
}

export function cartLines(cart, products, options = {}) {
  if (!cart || typeof cart !== 'object' || Array.isArray(cart)) return []
  const byId = new Map(products.map(product => [product.id, product]))
  return Object.entries(cart).flatMap(([key, value]) => {
    const [productId, variantId, extra] = key.split(':')
    const product = byId.get(productId)
    if (!product || extra !== undefined) return []
    const variant = variantId ? productVariants(product).find(row => row.id === variantId) : null
    if (variantId && !variant || product.variants_required && !variant) return []
    const price = Number(variant?.price_paise ?? product.price_paise)
    if (!Number.isSafeInteger(price) || price < 0 || !Number.isInteger(value) || value <= 0) return []
    const quantity = Math.min(value, lineStock(product, variant, options), 999)
    return quantity ? [{ key: cartLineKey(productId, variantId), product, variant, quantity, unitPrice: price, stock: lineStock(product, variant, options) }] : []
  })
}

export function normalizeCart(saved, products, options = {}) {
  return Object.fromEntries(cartLines(saved, products, options).map(line => [line.key, line.quantity]))
}

/** Fill untouched fields only, so a late address request cannot overwrite typing. */
export function addressAutofill(customer, address, touched = {}) {
  const next = { ...customer }
  for (const field of ['name', 'phone', 'address', 'pincode']) {
    if (!touched[field] && typeof address?.[field] === 'string') next[field] = address[field]
  }
  if (!touched.address && !touched.pincode && address?.id) next.saved_address_id = address.id
  return next
}
