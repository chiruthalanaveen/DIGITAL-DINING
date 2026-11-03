import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/commerce/catalog-options.js', import.meta.url), 'utf8')
const { addressAutofill, cartLines, normalizeCart, productImages, productPrice, productStock, storefrontTemplate, variantLabel } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const simple = { id: 'simple', name: 'Rice', price_paise: 9900, stock_quantity: 3 }
const sized = { id: 'sized', price_paise: 20000, stock_quantity: 0, variants_required: true, variants: [{ id: 'small', sku: 'S', options: { size: 'Small' }, price_paise: 22000, stock_quantity: 2 }, { id: 'large', price_paise: 25000, stock_quantity: 0 }, { id: 'archived', active: false, stock_quantity: 9 }] }

test('old simple carts import and composite variants retain separate prices and stock', () => {
  assert.deepEqual(normalizeCart({ simple: 5, sized: 2, 'sized:small': 3, 'sized:large': 1, 'sized:archived': 1, unknown: 3 }, [simple, sized]), { simple: 3, 'sized:small': 2 })
  const lines = cartLines({ 'sized:small': 1 }, [sized])
  assert.equal(lines[0].unitPrice, 22000)
  assert.equal(lines[0].variant.id, 'small')
  assert.equal(productStock(sized), 2)
  assert.equal(productPrice(sized), 22000)
  assert.equal(productStock({ ...sized, variants_required: false, stock_quantity: 3 }), 5)
  assert.equal(variantLabel(sized.variants[0]), 'size: Small')
})

test('malformed carts cannot invent options, quantities or untracked limits', () => {
  assert.deepEqual(normalizeCart({ simple: '2', 'sized:unknown': 2, 'sized:small:extra': 2 }, [simple, sized]), {})
  assert.deepEqual(normalizeCart({ simple: 1200, 'sized:small': 8 }, [simple, sized], { trackInventory: false }), { simple: 999, 'sized:small': 8 })
  assert.deepEqual(normalizeCart([], [simple]), {})
})

test('real gallery images deduplicate and reject executable URLs', () => {
  assert.deepEqual(productImages({ name: 'Sari', image_url: 'https://images.test/a.jpg', images: [{ url: 'https://images.test/a.jpg' }, { url: '/b.jpg', alt: 'Back' }, { image_url: 'javascript:alert(1)' }, { image_url: '//other.test/img' }] }), [{ url: 'https://images.test/a.jpg', alt: 'Sari' }, { url: '/b.jpg', alt: 'Back' }])
})

test('late saved-address autofill preserves manual fields and selected address association', () => {
  assert.deepEqual(addressAutofill({ name: 'Typed', phone: '', address: 'Manual address', pincode: '' }, { id: 'saved', name: 'Saved', phone: '9000000000', address: 'Saved address', pincode: '600001' }, { name: true, address: true }), { name: 'Typed', phone: '9000000000', address: 'Manual address', pincode: '600001' })
  assert.equal(addressAutofill({}, { id: 'saved', address: 'Saved', pincode: '600001' }).saved_address_id, 'saved')
})

test('only assigned templates are displayed', () => {
  assert.equal(storefrontTemplate({ template: 'food' }), 'food')
  assert.equal(storefrontTemplate({ template: 'unknown', business_type: 'sarees' }), 'general')
})
