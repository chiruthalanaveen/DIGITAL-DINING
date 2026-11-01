const DEFAULT_BACKGROUND = '#f8f7f2'
const DEFAULT_TEXT = '#202e28'

function hex(value, fallback) {
  const input = String(value || '')
  if (/^#[\da-f]{6}$/i.test(input)) return input.toLowerCase()
  if (/^#[\da-f]{3}$/i.test(input)) return `#${input.slice(1).split('').map(part => part + part).join('')}`.toLowerCase()
  return fallback
}

function channels(value) {
  return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16))
}

function luminance(value) {
  const linear = channels(value).map(part => {
    const channel = part / 255
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
  })
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
}

export function contrastRatio(first, second) {
  const values = [luminance(hex(first, '#000000')), luminance(hex(second, '#ffffff'))].sort((a, b) => b - a)
  return (values[0] + .05) / (values[1] + .05)
}

function readableInk(background) {
  return contrastRatio('#000000', background) >= contrastRatio('#ffffff', background) ? '#000000' : '#ffffff'
}

function mix(first, second, weight) {
  const a = channels(first), b = channels(second)
  return `#${a.map((part, index) => Math.round(part * weight + b[index] * (1 - weight)).toString(16).padStart(2, '0')).join('')}`
}

function contrastingBlend(foreground, background, surface, target, start) {
  for (let step = Math.round(start * 100); step <= 100; step += 1) {
    const candidate = mix(foreground, background, step / 100)
    if (contrastRatio(candidate, background) >= target && contrastRatio(candidate, surface) >= target) return candidate
  }
  return foreground
}

/** Optional visual layer; legacy account styles keep their existing theme. */
export function editorialTheme(branding = {}) {
  const background = hex(branding.background_color, DEFAULT_BACKGROUND)
  const requested = hex(branding.text_color, DEFAULT_TEXT)
  const ink = readableInk(background)
  const surface = mix(ink === '#000000' ? '#ffffff' : '#000000', background, .025)
  const text = contrastRatio(requested, background) >= 4.5 && contrastRatio(requested, surface) >= 4.5 ? requested : ink
  const accent = hex(branding.primary_color, '#254d40')
  const muted = contrastingBlend(text, background, surface, 4.5, .72)
  const control = contrastingBlend(text, background, surface, 3, .45)
  return {
    '--cs-bg': background, '--cs-text': text,
    '--cs-accent': accent, '--cs-accent-ink': readableInk(accent),
    '--cs-muted': muted, '--cs-surface': surface,
    '--cs-focus': contrastingBlend(ink, background, surface, 3, .65),
    '--cs-line': mix(text, background, .18), '--cs-control-line': control,
    '--card': surface, '--text': text, '--sub': muted, '--border': mix(text, background, .18),
  }
}

/** Parse decimal rupees without rounding fractional paise or losing precision. */
export function parsePriceBound(value) {
  const input = String(value ?? '').trim()
  if (!input) return { value: null, valid: true }
  if (input.length > 32 || !/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(input)) return { value: null, valid: false }
  const [whole, fraction = ''] = input.split('.')
  const paise = BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0'))
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) return { value: null, valid: false }
  return { value: Number(paise), valid: true }
}

/** All catalog controls compose; input arrays and server prices stay untouched. */
export function filterCatalogProducts(products, filters = {}, { trackInventory = true } = {}) {
  const minimum = parsePriceBound(filters.minPrice)
  const maximum = parsePriceBound(filters.maxPrice)
  if (!minimum.valid || !maximum.valid) return { products: [], error: 'Use a price of zero or more with up to two decimal places, such as 1000.50.' }
  if (minimum.value !== null && maximum.value !== null && minimum.value > maximum.value) return { products: [], error: 'Minimum price must not exceed maximum price.' }
  const query = String(filters.search || '').trim().toLocaleLowerCase()
  const category = filters.category || 'all'
  const availability = filters.availability || 'all'
  const visible = products.filter(product => {
    const price = Number(product.price_paise)
    const available = !trackInventory || Number(product.stock_quantity) > 0
    const attributes = Object.values(product.attributes || {}).filter(value => ['string', 'number'].includes(typeof value)).join(' ')
    return (category === 'all' || product.category_id === category) &&
      (!query || `${product.name} ${product.description || ''} ${attributes}`.toLocaleLowerCase().includes(query)) &&
      (minimum.value === null || price >= minimum.value) && (maximum.value === null || price <= maximum.value) &&
      (availability === 'all' || (availability === 'in-stock' && available) || (availability === 'sold-out' && !available))
  })
  visible.sort((first, second) => {
    const difference = filters.sort === 'price-low' ? first.price_paise - second.price_paise : filters.sort === 'price-high' ? second.price_paise - first.price_paise : 0
    return difference || first.name.localeCompare(second.name)
  })
  return { products: visible, error: '' }
}
