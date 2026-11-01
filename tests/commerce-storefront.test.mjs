import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../lib/commerce/storefront.js', import.meta.url), 'utf8')
const { parsePriceBound, filterCatalogProducts, editorialTheme, contrastRatio } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const products = [
  { id: 'one', name: 'Silk shawl', description: 'Hand-finished', category_id: 'silk', price_paise: 100050, stock_quantity: 2, attributes: { colour: 'Rose', material: 'Silk' } },
  { id: 'two', name: 'Cotton wrap', description: '', category_id: 'cotton', price_paise: 50000, stock_quantity: 0, attributes: {} },
  { id: 'three', name: 'Silk scarf', description: '', category_id: 'silk', price_paise: 100000, stock_quantity: 4, attributes: {} },
]

test('decimal rupee bounds preserve exact paise including zero and inclusive fractions', () => {
  for (const [input, value] of [['', null], ['0', 0], ['.50', 50], ['1000.50', 100050], ['0010.5', 1050], ['1.', 100]]) {
    assert.deepEqual(parsePriceBound(input), { value, valid: true })
  }
  for (const invalid of ['-1', '1.005', '1e3', 'Infinity', 'NaN', '1,000', '1,2', '9007199254740992', '<script>']) {
    assert.equal(parsePriceBound(invalid).valid, false, invalid)
  }
})

test('search, category, decimal price, availability and sorting compose without changing products', () => {
  const before = structuredClone(products)
  const result = filterCatalogProducts(products, { search: 'silk', category: 'silk', minPrice: '1000', maxPrice: '1000.50', availability: 'in-stock', sort: 'price-high' })
  assert.deepEqual(result.products.map(product => product.id), ['one', 'three'])
  assert.equal(result.error, '')
  assert.deepEqual(products, before)
})

test('real scalar product attributes are searchable and price bounds include their endpoints', () => {
  assert.deepEqual(filterCatalogProducts(products, { search: 'rose', minPrice: '1000.50', maxPrice: '1000.50' }).products.map(product => product.id), ['one'])
  assert.deepEqual(filterCatalogProducts(products, { maxPrice: '500' }).products.map(product => product.id), ['two'])
})

test('tracked availability shows sold-out items while untracked catalogs do not invent a stock outage', () => {
  assert.deepEqual(filterCatalogProducts(products, { availability: 'sold-out' }).products.map(product => product.id), ['two'])
  assert.equal(filterCatalogProducts(products, { availability: 'in-stock' }, { trackInventory: false }).products.length, 3)
  assert.equal(filterCatalogProducts(products, { availability: 'sold-out' }, { trackInventory: false }).products.length, 0)
})

test('invalid/reversed bounds produce an explicit error rather than misleading unfiltered results', () => {
  for (const filters of [{ minPrice: 'oops' }, { maxPrice: '-1' }, { minPrice: '1000', maxPrice: '500' }]) {
    const result = filterCatalogProducts(products, filters)
    assert.equal(result.products.length, 0)
    assert.ok(result.error)
  }
  assert.equal(filterCatalogProducts(products, {}).products.length, 3)
})

test('all controls can reset without losing catalog entries and sorting is deterministic', () => {
  assert.deepEqual(filterCatalogProducts(products, { search: 'missing' }).products, [])
  assert.deepEqual(filterCatalogProducts(products, {}).products.map(product => product.id), ['two', 'three', 'one'])
  assert.deepEqual(filterCatalogProducts(products, { sort: 'price-low' }).products.map(product => product.id), ['two', 'three', 'one'])
  assert.deepEqual(filterCatalogProducts([], {}).products, [])
})

test('editorial colors respect tenant accents and choose legible foregrounds for light/dark palettes', () => {
  for (const branding of [{}, { primary_color: '#fff', background_color: '#111111', text_color: '#eeeeee' }, { primary_color: '#777777', background_color: '#eeeeee', text_color: '#cccccc' }, { primary_color: '#ffcc00', background_color: '#abcdef', text_color: '#123456' }, { background_color: '#747474', text_color: '#747474' }, { background_color: '#777777', primary_color: '#777777' }]) {
    const theme = editorialTheme(branding)
    for (const surface of [theme['--cs-bg'], theme['--cs-surface']]) {
      assert.ok(contrastRatio(theme['--cs-text'], surface) >= 4.5)
      assert.ok(contrastRatio(theme['--cs-muted'], surface) >= 4.5)
      assert.ok(contrastRatio(theme['--cs-control-line'], surface) >= 3)
    }
    assert.ok(contrastRatio(theme['--cs-accent-ink'], theme['--cs-accent']) >= 4.5)
  }
  assert.equal(editorialTheme({ primary_color: '#c30' })['--cs-accent'], '#cc3300')
})

test('invalid tenant CSS values fall back to safe hexadecimal tokens without CSS injection', () => {
  const theme = editorialTheme({ primary_color: 'url(https://outside.invalid)', background_color: 'red;display:none', text_color: '</style>' })
  for (const value of Object.values(theme)) assert.match(value, /^#[a-f\d]{6}$/i)
})
