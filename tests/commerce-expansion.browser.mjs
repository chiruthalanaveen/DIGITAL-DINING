import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, open, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { createCommerceFixture, developmentEnvironment, developmentUsers, LOCAL_ANON_KEY, LOCAL_PASSWORD, LOCAL_SERVICE_KEY } from './helpers/commerce-fixture.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const templates = ['general', 'sarees', 'grocery', 'fashion', 'food']

/** Real Next HTTP routes + local PostgreSQL/RLS; only Auth/Storage protocols are simulated. */
export async function runExpansionBrowserChecks({ base, fixture, browser, artifacts }) {
  const fixtureOrigin = new URL(developmentEnvironment({ fixturePort: fixture.port || 4319 }).SUPABASE_URL).origin
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const errors = [], blocked = new Set(), screenshots = [], checks = [], checkoutRequests = []
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', error => errors.push(error.message))
  await context.route('**/*', route => {
    if ([base, fixtureOrigin].includes(new URL(route.request().url()).origin)) return route.continue()
    blocked.add(new URL(route.request().url()).hostname)
    return route.abort()
  })
  const [owner, , buyer, otherBuyer] = developmentUsers
  let cookie = ''
  let releaseHeldStop = () => {}
  async function signal(promise, label) {
    let timer
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out.`)), 20000) })]) }
    finally { clearTimeout(timer) }
  }
  async function api(url, { user, admin = false, method = 'GET', body, expected = 200 } = {}) {
    const headers = { Origin: base }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (user) headers.Authorization = `Bearer ${fixture.session(fixture.users.get(user.id)).access_token}`
    if (admin) headers.Cookie = cookie
    const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const result = await response.json().catch(() => ({}))
    assert.equal(response.status, expected, `${method} ${url}: ${JSON.stringify(result)}`)
    assert.equal(result.success, true, `${method} ${url} did not confirm success.`)
    return result
  }
  const ownerAction = (website, action, payload) => api(`/api/commerce/workspace/${website.id}`, { user: owner, method: 'POST', body: { action, payload } })
  const catalogAction = (website, action, payload) => api(`/api/commerce/workspace/${website.id}/catalog`, { user: owner, method: 'POST', body: { action, payload } })
  const customerAction = (website, action, payload, user = buyer) => api('/api/commerce/customer/experience', { user, method: 'POST', body: { website_id: website.id, action, payload } })
  const engagementAction = (website, action, payload) => api(`/api/commerce/workspace/${website.id}/engagement`, { user: owner, method: 'POST', body: { action, payload } })

  async function fixtureRpc(name, args, { service = false } = {}) {
    // Direct local RPC fixtures exercise real roles without calling the app's
    // provider adapter. This helper never accepts a hosted origin or real key.
    assert.equal(new URL(fixtureOrigin).hostname, '127.0.0.1')
    const token = service ? LOCAL_SERVICE_KEY : fixture.session(fixture.users.get(buyer.id)).access_token
    const response = await fetch(`${fixtureOrigin}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: service ? LOCAL_SERVICE_KEY : LOCAL_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
    const result = await response.json()
    assert.equal(response.status, 200, JSON.stringify(result))
    return result
  }

  async function snapshot(name, focus = null) {
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 })
      if (focus) {
        await focus.scrollIntoViewIfNeeded()
        const box = await focus.boundingBox()
        assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= (width < 768 ? 844 : 1000) + 1, `${name} recovery control must be visible at ${width}px.`)
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} has horizontal overflow at ${width}px.`)
      for (const dialog of await page.locator('dialog[open]').all()) {
        const box = await dialog.boundingBox()
        assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1, `${name} clips an open dialog at ${width}px.`)
      }
      const filename = `${name}-${width}.png`
      await page.screenshot({ path: path.join(artifacts, filename), fullPage: await page.locator('dialog[open]').count() === 0 })
      screenshots.push(filename)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }

  async function upload(websiteId, label, background) {
    const bytes = await page.evaluate(({ label, background }) => {
      const canvas = document.createElement('canvas')
      canvas.width = 720; canvas.height = 900
      const drawing = canvas.getContext('2d')
      drawing.fillStyle = background; drawing.fillRect(0, 0, 720, 900)
      drawing.fillStyle = '#ffffff'; drawing.fillRect(40, 40, 640, 820)
      drawing.fillStyle = '#173a31'; drawing.font = 'bold 30px sans-serif'
      drawing.fillText('SYNTHETIC LOCAL FIXTURE', 76, 150)
      drawing.font = '24px sans-serif'; drawing.fillText(label, 76, 240)
      drawing.fillText('Development upload only', 76, 750)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { label, background })
    const objectName = `${websiteId}/${randomUUID()}.png`
    const response = await fetch(`${fixtureOrigin}/storage/v1/object/commerce-media/${objectName}`, { method: 'POST', headers: { apikey: LOCAL_ANON_KEY, Authorization: `Bearer ${fixture.session(fixture.users.get(owner.id)).access_token}`, 'Content-Type': 'image/png' }, body: Buffer.from(bytes, 'base64') })
    assert.equal(response.status, 200, await response.text())
    return `${fixtureOrigin}/storage/v1/object/public/commerce-media/${objectName}`
  }

  async function signIn(user, website) {
    await page.goto(`${base}/shops/${website.slug}/account`)
    await page.getByLabel('Email address', { exact: true }).fill(user.email)
    await page.getByLabel(/^Password/).fill(LOCAL_PASSWORD)
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor()
  }

  try {
    const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@commerce.example.test', password: LOCAL_PASSWORD }) })
    assert.equal(login.status, 200)
    cookie = login.headers.get('set-cookie').split(';')[0]
    const suffix = randomUUID().slice(0, 8)
    const stores = []
    await page.goto(`${base}/commerce`)
    for (const template of templates) {
      const website = (await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'create_website', payload: {
        name: `Development ${template} store`, slug: `qa-exp-${template}-${suffix}`, business_type: template,
        template: 'general', status: 'setup', owner_user_id: owner.id,
        branding: { primary_color: '#245843', background_color: '#f7f8f4', text_color: '#172e24', headline: `Development ${template} collection`, description: 'Synthetic catalog for isolated local browser validation.' },
        features: { catalog: true, inventory: true, cod: true }, owner_permissions: { products: true, categories: true, inventory: true, orders: true, branding: true, customers: true },
        fulfillment: { pickup: true, delivery: true, delivery_fee_paise: 9000, minimum_order_paise: 0, pickup_address: 'Development pickup address' },
        subscription_plan: 'basic', subscription_status: 'trial', monthly_price_paise: 0,
      } } })).website
      await api('/api/commerce/admin/catalog', { admin: true, method: 'POST', body: { website_id: website.id, action: 'save_template', payload: { template } } })
      const category = (await ownerAction(website, 'save_category', { name: 'Development category', slug: 'development-category', active: true })).result
      const simple = (await ownerAction(website, 'save_product', { category_id: category.id, name: 'Development simple item', slug: 'simple-item', description: 'Synthetic local product.', price_paise: 10000, image_url: '', attributes: {}, active: true })).result
      await ownerAction(website, 'adjust_stock', { product_id: simple.id, delta: 8, reason: 'Synthetic local stock.' })
      const product = (await ownerAction(website, 'save_product', { category_id: category.id, name: 'Development variant item', slug: 'variant-item', description: 'Synthetic local product with explicit options.', price_paise: 10000, image_url: '', attributes: { material: 'Development sample' }, active: true })).result
      const front = await upload(website.id, `${template}: front`, '#285d4c')
      const back = await upload(website.id, `${template}: back`, '#74394f')
      await catalogAction(website, 'save_product_options', { product_id: product.id, variants_required: true, images: [{ url: front, alt: 'Development front image' }, { url: back, alt: 'Development back image' }] })
      const variant = (await catalogAction(website, 'save_variant', { product_id: product.id, sku: `LOCAL-${template.toUpperCase()}-M`, name: 'Medium', options: { size: 'Medium', color: 'Development green' }, price_paise: 12000, active: true })).result
      await catalogAction(website, 'adjust_variant_stock', { variant_id: variant.id, delta: 2 })
      const soldOut = (await catalogAction(website, 'save_variant', { product_id: product.id, sku: `LOCAL-${template.toUpperCase()}-L`, name: 'Large', options: { size: 'Large' }, price_paise: 15000, active: true })).result
      await catalogAction(website, 'save_settings', { delivery_zones_enabled: true, policies: { shipping: 'Local development delivery policy.', returns: 'Development return requests require store review.', returns_enabled: true, return_days: 7 }, faq: [{ question: 'Is this a live store?', answer: 'No. This is an isolated development fixture.' }], sections: [
        { id: 'hero', type: 'hero', enabled: true, title: `Development ${template} collection`, body: 'Synthetic catalog for local validation.', image_url: front },
        { id: 'copy', type: 'text', enabled: true, title: 'Development information', body: 'Only configured plain text appears here.' },
        { id: 'categories', type: 'categories', enabled: true },
        { id: 'featured', type: 'featured_products', enabled: true, title: 'Development featured products', product_ids: [product.id] },
        { id: 'faq', type: 'faq', enabled: true },
      ] })
      await catalogAction(website, 'save_delivery_zone', { name: 'Local development zone', pincodes: ['600001', '600002'], delivery_fee_paise: 2500, minimum_order_paise: 10000, active: true })
      await api(`/api/commerce/workspace/${website.id}/growth`, { user: owner, method: 'POST', body: { action: 'save_coupon', payload: { code: 'LOCAL10', kind: 'percentage', discount_value: 1000, minimum_subtotal_paise: 0, usage_limit: 10, per_customer_limit: 5, active: true } } })
      await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'save_website', payload: { id: website.id, status: 'active' } } })
      const catalog = await api(`/api/commerce/catalog/${website.slug}`)
      assert.equal(catalog.website.template, template)
      assert.equal(catalog.website.settings.delivery_zones_enabled, true)
      assert.equal(catalog.products.find(row => row.id === product.id).images.length, 2)
      assert.equal(catalog.products.find(row => row.id === product.id).variants.length, 2)
      assert.equal('owner_permissions' in catalog.website, false)
      assert.equal('coupons' in catalog, false)
      stores.push({ website, product, simple, variant, soldOut })
      await page.goto(`${base}/shops/${website.slug}`)
      await page.locator(`main[data-template="${template}"]`).waitFor()
      await page.getByRole('heading', { name: `Development ${template} collection`, exact: true }).waitFor()
      const schema = await page.locator('script[type="application/ld+json"]').first().textContent()
      assert.equal(JSON.parse(schema)['@graph'].filter(item => item['@type'] === 'Product').length, 2)
      assert.deepEqual(await page.locator('.cs-home-sections > section h2, .cs-home-sections > section h1').allTextContents(), [`Development ${template} collection`, 'Development information', template === 'sarees' ? 'Explore the collections' : template === 'fashion' ? 'Find your style' : template === 'grocery' ? 'Browse the aisles' : template === 'food' ? 'Menu categories' : 'Shop by category', 'Development featured products', 'Frequently asked questions'])
      await snapshot(`template-${template}`)
    }
    checks.push('five Admin-assigned templates, ordered configured sections and real uploaded media at desktop/mobile widths')
    const { website, product, simple, variant, soldOut } = stores[1]
    const saved = await customerAction(website, 'address_save', { label: 'Development default', name: 'Saved Recipient', phone: '9000000011', address: 'Saved development street address', pincode: '600001', is_default: true })
    const savedAddress = saved.addresses.find(row => row.is_default)
    await customerAction(website, 'address_save', { label: 'Other customer private', name: 'Other Buyer', phone: '9000000022', address: 'Other buyer private address', pincode: '600002', is_default: true }, otherBuyer)
    assert.equal((await api(`/api/commerce/customer/experience?website_id=${website.id}`, { user: otherBuyer })).addresses.some(row => row.id === savedAddress.id), false)
    await signIn(buyer, website)
    // Existing scope and legacy cart keys must survive expansion checkout.
    const otherScope = JSON.stringify(fixture.session(fixture.users.get(otherBuyer.id)))
    await page.evaluate(({ website, simple, otherScope }) => {
      localStorage.setItem(`dd-commerce-cart:${website.id}`, JSON.stringify({ [simple.id]: 2 }))
      localStorage.setItem('digital-dine-commerce:owner', 'unrelated-owner-sentinel')
      localStorage.setItem('digital-dine-commerce:customer:unrelated-store', otherScope)
    }, { website, simple, otherScope })
    let releaseAddress
    const delayedAddress = new Promise(resolve => { releaseAddress = resolve })
    let addressRequestSeen
    const addressSeen = new Promise(resolve => { addressRequestSeen = resolve })
    const privateExperiencePattern = `**/api/commerce/customer/experience?website_id=${website.id}`
    await page.route(privateExperiencePattern, async route => {
      const response = await route.fetch()
      addressRequestSeen()
      await delayedAddress
      await route.fulfill({ response })
    })
    await page.goto(`${base}/shops/${website.slug}`)
    await page.getByRole('button', { name: 'Open shopping bag, 2 items', exact: true }).click()
    await page.locator('input[name="customerName"]').fill('Manual Recipient')
    await page.locator('select[name="fulfillmentMethod"]').selectOption('delivery')
    await page.locator('textarea[name="deliveryAddress"]').fill('Manually entered development address')
    await addressSeen
    releaseAddress()
    await page.locator('select[name="savedAddress"]').waitFor()
    assert.equal(await page.locator('input[name="customerName"]').inputValue(), 'Manual Recipient')
    assert.equal(await page.locator('textarea[name="deliveryAddress"]').inputValue(), 'Manually entered development address')
    assert.equal(await page.locator('input[name="customerPhone"]').inputValue(), '9000000011')
    assert.equal(await page.locator('select[name="savedAddress"]').inputValue(), '')
    await page.unroute(privateExperiencePattern)
    await page.locator('select[name="savedAddress"]').selectOption(savedAddress.id)
    assert.equal(await page.locator('textarea[name="deliveryAddress"]').inputValue(), savedAddress.address)
    await page.locator('textarea[name="deliveryAddress"]').fill('Final manually entered local address')
    assert.equal(await page.locator('select[name="savedAddress"]').inputValue(), '')
    await page.getByRole('button', { name: `Remove ${simple.name} from bag`, exact: true }).click()
    await page.getByRole('button', { name: 'Close shopping bag', exact: true }).click()
    checks.push('legacy product-id cart import; website/customer-scoped saved addresses; delayed defaults preserve manual edits and clear changed address associations')

    await page.locator('#collection').getByRole('button', { name: `Choose options for ${product.name}`, exact: true }).click()
    const productDialog = page.locator('.cs-product-dialog')
    await productDialog.getByRole('button', { name: 'Add to bag', exact: true }).waitFor()
    assert.equal(await productDialog.getByRole('button', { name: 'Add to bag', exact: true }).isDisabled(), true)
    const thumbnails = productDialog.getByRole('group', { name: `Images of ${product.name}`, exact: true })
    await thumbnails.getByRole('button').first().focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await thumbnails.getByRole('button').nth(1).getAttribute('aria-pressed'), 'true')
    await productDialog.getByRole('button', { name: `Zoom image of ${product.name}`, exact: true }).click()
    const zoom = page.locator('.cs-gallery-dialog[open]')
    await zoom.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await zoom.getByText('150%', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await productDialog.evaluate(node => node.open), true)
    assert.equal(await productDialog.getByRole('button', { name: `Zoom image of ${product.name}`, exact: true }).evaluate(node => node === document.activeElement), true)
    const optionPicker = productDialog.getByLabel('Choose an option (required)', { exact: true })
    // Chromium exposes the correct native disabled state; this Playwright
    // version's isDisabled() reports false for native option elements.
    assert.equal(await optionPicker.locator(`option[value="${soldOut.id}"]`).evaluate(option => option.disabled), true)
    await optionPicker.selectOption(variant.id)
    await productDialog.getByRole('button', { name: 'Add to bag', exact: true }).click()
    await productDialog.getByRole('button', { name: 'Add another · 1 in bag', exact: true }).click()
    assert.equal(await productDialog.getByRole('button', { name: 'Add another · 2 in bag', exact: true }).isDisabled(), true)
    await snapshot('variant-gallery')
    await productDialog.getByRole('button', { name: 'Close product details', exact: true }).click()
    await page.getByRole('button', { name: 'Open shopping bag, 2 items', exact: true }).click()
    await page.locator('input[name="deliveryPincode"]').fill('999999')
    await page.getByRole('alert').filter({ hasText: 'This request is not permitted by the website configuration.' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Place order', exact: true }).isDisabled(), true)
    await page.locator('input[name="deliveryPincode"]').fill('600001')
    await page.getByLabel('Coupon code', { exact: true }).fill('INVALID')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.getByRole('alert').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Place order', exact: true }).isDisabled(), true)
    await page.getByLabel('Coupon code', { exact: true }).fill('LOCAL10')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.locator('.cs-total').getByText('₹241.00', { exact: true }).waitFor()
    await page.getByText('Delivery zone: Local development zone', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Place order', exact: true }).isEnabled(), true)
    assert.equal((await api(`/api/commerce/workspace/${website.id}/growth`, { user: owner })).coupons.find(row => row.code === 'LOCAL10').redemption_count, 0, 'Quotes must not redeem coupons.')
    await snapshot('variant-zone-coupon-checkout')
    checks.push('required variant, sold-out option, SKU/stock cap, multi-image keyboard/zoom focus; unsupported PIN and invalid coupon block checkout; server zone fee/discount total')

    // Only the response is lost: the request runs through Next and PostgreSQL.
    let loseNextResponse = true
    const checkoutPattern = `**/api/commerce/checkout/${website.id}`
    await page.route(checkoutPattern, async route => {
      checkoutRequests.push(route.request().postDataJSON())
      if (loseNextResponse) {
        loseNextResponse = false
        const response = await route.fetch()
        assert.equal(response.status(), 201)
        await route.abort('failed')
      } else await route.continue()
    })
    await page.getByRole('button', { name: 'Place order', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'fetch' }).waitFor()
    const firstKey = checkoutRequests[0].idempotency_key
    await page.locator('input[name="customerName"]').fill('Changed retry recipient')
    await page.getByRole('button', { name: 'Place order', exact: true }).click()
    await page.getByRole('heading', { name: 'Your order is confirmed.', exact: true }).waitFor()
    assert.equal(checkoutRequests[1].idempotency_key, firstKey)
    let orders = (await api(`/api/commerce/customer/orders?website_id=${website.id}`, { user: buyer })).orders
    assert.equal(orders.length, 1)
    const order = orders[0]
    assert.equal(order.total_paise, 24100)
    assert.equal(order.customer_details.name, 'Saved Recipient')
    assert.equal(order.customer_details.address, 'Final manually entered local address')
    assert.equal(order.customer_details.saved_address_id, undefined)
    assert.equal(order.discount_paise, 2400)
    assert.equal((await api(`/api/commerce/customer/orders?website_id=${website.id}`, { user: otherBuyer })).orders.length, 0)
    const workspace = await api(`/api/commerce/workspace/${website.id}`, { user: owner })
    const item = workspace.order_items.find(row => row.order_id === order.id)
    assert.equal(item.variant_id, variant.id)
    assert.equal(item.sku, variant.sku)
    assert.equal(item.unit_price_paise, 12000)
    assert.equal(item.option_snapshot.size, 'Medium')
    await snapshot('changed-retry-confirmation')
    checks.push('real committed COD response loss; changed retry retains key, reconciles buyer history and creates one order with immutable variant/price/address snapshots')

    // Reproduce a response loss followed by reload after the final unit sells.
    await catalogAction(website, 'save_variant', { id: variant.id, product_id: product.id, sku: `${variant.sku}-EDITED`, name: 'Updated Medium', options: { size: 'Updated' }, price_paise: 20000, active: true })
    await catalogAction(website, 'adjust_variant_stock', { variant_id: variant.id, delta: 1 })
    await page.unroute(checkoutPattern)
    await page.reload()
    await page.locator('#collection').getByRole('button', { name: `Choose options for ${product.name}`, exact: true }).click()
    await productDialog.getByLabel('Choose an option (required)', { exact: true }).selectOption(variant.id)
    await productDialog.getByRole('button', { name: 'Add to bag', exact: true }).click()
    await productDialog.getByRole('button', { name: 'Close product details', exact: true }).click()
    await page.getByRole('button', { name: 'Open shopping bag, 1 items', exact: true }).click()
    await page.getByRole('button', { name: 'Place order', exact: true }).waitFor({ state: 'visible' })
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled)
    await page.route(checkoutPattern, async route => {
      checkoutRequests.push(route.request().postDataJSON())
      const response = await route.fetch()
      assert.equal(response.status(), 201)
      await route.abort('failed')
    })
    await page.getByRole('button', { name: 'Place order', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'fetch' }).waitFor()
    await page.unroute(checkoutPattern)
    await page.reload()
    await page.getByRole('button', { name: /^Open shopping bag/ }).click()
    await page.getByRole('heading', { name: 'Your order is confirmed.', exact: true }).waitFor()
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), `dd-commerce-checkout:${website.id}:${buyer.id}`), null)
    orders = (await api(`/api/commerce/customer/orders?website_id=${website.id}`, { user: buyer })).orders
    assert.equal(orders.length, 2)
    const firstItems = (await api(`/api/commerce/customer/orders?website_id=${website.id}`, { user: buyer })).order_items.filter(row => row.order_id === order.id)
    assert.equal(firstItems[0].unit_price_paise, 12000)
    assert.equal(firstItems[0].sku, variant.sku)
    assert.equal(await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner')), 'unrelated-owner-sentinel')
    assert.equal(await page.evaluate(() => localStorage.getItem('digital-dine-commerce:customer:unrelated-store')), otherScope)
    checks.push('reload recovers committed pending checkout after stock exhaustion; edited SKU/price preserves original order snapshots and unrelated Auth storage')

    for (const status of ['confirmed', 'preparing', 'ready', 'completed']) await ownerAction(website, 'update_order_status', { order_id: order.id, status })
    await page.goto(`${base}/shops/${website.slug}/account`)
    await page.getByRole('button', { name: 'Write a review', exact: true }).first().click()
    await page.getByLabel('Title', { exact: true }).fill('Synthetic verified purchase review')
    await page.getByLabel('Your review', { exact: true }).fill('Development-only review submitted through the real account interface.')
    await page.getByRole('button', { name: 'Submit review', exact: true }).click()
    await page.getByText('Review submitted for store moderation.', { exact: true }).waitFor()
    let experience = await api(`/api/commerce/customer/experience?website_id=${website.id}`, { user: buyer })
    assert.equal(experience.reviews[0].status, 'pending')
    assert.equal((await api(`/api/commerce/customer/experience?website_id=${website.id}&product_id=${product.id}`)).rating_count, 0)
    await engagementAction(website, 'review_moderate', { review_id: experience.reviews[0].id, status: 'approved' })
    assert.equal((await api(`/api/commerce/customer/experience?website_id=${website.id}&product_id=${product.id}`)).rating_count, 1)
    await page.getByRole('button', { name: 'Request a return', exact: true }).click()
    await page.getByLabel('Reason', { exact: true }).fill('Development return request to test review state.')
    await page.getByRole('button', { name: 'Send request', exact: true }).click()
    await page.getByText('Your request was sent to the store. A request does not confirm a refund.', { exact: true }).waitFor()
    experience = await api(`/api/commerce/customer/experience?website_id=${website.id}`, { user: buyer })
    const request = experience.requests.find(row => row.order_id === order.id && row.type === 'return')
    assert.equal(request.status, 'pending')
    await engagementAction(website, 'request_decide', { request_id: request.id, decision: 'approved', note: 'Development return approved for review; no refund processed.' })
    await page.getByRole('button', { name: 'Refresh account tools', exact: true }).click()
    await page.getByText('return request · approved', { exact: true }).waitFor()
    assert.equal((await api(`/api/commerce/customer/orders?website_id=${website.id}`, { user: buyer })).orders.find(row => row.id === order.id).payment_status, 'unpaid')
    await snapshot('customer-review-return')
    await page.route(privateExperiencePattern, route => route.abort('failed'))
    await page.goto(`${base}/shops/${website.slug}?product=${product.id}`)
    await productDialog.getByRole('button', { name: 'Retry saved status', exact: true }).waitFor()
    assert.equal(await productDialog.getByRole('button', { name: '♡ Save', exact: true }).count(), 0, 'A failed read cannot claim that a product is unsaved.')
    await page.unroute(privateExperiencePattern)
    await productDialog.getByRole('button', { name: 'Retry saved status', exact: true }).click()
    await productDialog.getByRole('button', { name: '♡ Save', exact: true }).click()
    await productDialog.getByRole('button', { name: '♥ Saved', exact: true }).waitFor()
    await productDialog.getByRole('button', { name: 'Customer reviews', exact: true }).click()
    await productDialog.getByText('Synthetic verified purchase review', { exact: false }).waitFor()
    assert.equal((await api(`/api/commerce/customer/experience?website_id=${website.id}`, { user: otherBuyer })).wishlist.includes(product.id), false)
    await productDialog.getByRole('button', { name: 'Close product details', exact: true }).click()
    await page.goto(`${base}/shops/${website.slug}/account`)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByLabel('Email address', { exact: true }).fill(otherBuyer.email)
    await page.getByLabel(/^Password/).fill(LOCAL_PASSWORD)
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByText('No orders yet.', { exact: true }).waitFor()
    await page.getByText('Other buyer private address · 600002', { exact: true }).waitFor()
    assert.equal(await page.getByText('Final manually entered local address', { exact: true }).count(), 0)
    await snapshot('customer-identity-isolation')
    checks.push('verified purchase review submission/moderation/public display; eligible return request and decision without refund claim; failed wishlist load retries honestly; wishlist and identity-switch isolation')
    await page.evaluate(session => localStorage.setItem('digital-dine-commerce:owner', JSON.stringify(session)), fixture.session(fixture.users.get(owner.id)))
    await page.goto(`${base}/commerce/dashboard`)
    await page.locator('#co-website-selector').selectOption(website.id)
    const workspaceNavigation = page.getByRole('navigation', { name: 'Owner workspace sections' })
    await workspaceNavigation.getByRole('button', { name: 'Photos & variants', exact: true }).click()
    await page.locator('.ce-product-selector select').selectOption(product.id)
    await page.getByLabel('Image description').first().fill('Updated local gallery description')
    await page.getByRole('button', { name: 'Save product options', exact: true }).click()
    await page.getByText('Your changes were saved for this website.', { exact: true }).waitFor()
    assert.equal((await api(`/api/commerce/catalog/${website.slug}`)).products.find(row => row.id === product.id).images[0].alt, 'Updated local gallery description')
    await snapshot('owner-gallery-variants')
    for (const [tab, heading] of [['Variant inventory', 'Variant inventory'], ['Delivery coverage', 'Delivery coverage'], ['Policies, FAQ & sections', 'Policies, FAQ & sections'], ['Reviews & requests', 'Customer reviews and requests'], ['Coupons & activity', 'Coupons and store activity'], ['Store domains', 'Store domains'], ['Store & subscription', 'Store & subscription']]) {
      await workspaceNavigation.getByRole('button', { name: tab, exact: true }).click()
      await page.getByRole('heading', { name: heading, exact: true }).waitFor()
      if (tab === 'Coupons & activity') {
        await page.getByRole('combobox', { name: /^Activity period/ }).selectOption('7')
        await page.getByText('Orders placed · last 7 days', { exact: true }).waitFor()
      }
      if (tab === 'Store & subscription') {
        await page.getByRole('heading', { name: 'Online payment configuration', exact: true }).waitFor()
        await page.getByRole('status').filter({ hasText: 'A commerce merchant account has not been configured for this website.' }).waitFor()
      }
      await snapshot(`owner-${tab.toLowerCase().replaceAll(/[^a-z]+/g, '-')}`)
    }
    checks.push('real owner gallery save; variant inventory, coverage, policy builder, reviews, bounded analytics and disabled domain panels at four widths')
    const cookieSeparator = cookie.indexOf('=')
    await context.addCookies([{ name: cookie.slice(0, cookieSeparator), value: cookie.slice(cookieSeparator + 1), url: base, httpOnly: true, sameSite: 'Lax' }])
    await page.goto(`${base}/admin/dashboard`)
    await page.getByRole('button', { name: 'E-Commerce Website Management', exact: true }).click()
    await page.locator('.ac-website').filter({ has: page.getByText(`/shops/${website.slug}`, { exact: true }) }).getByRole('button', { name: 'Manage website', exact: true }).click()
    await page.getByRole('heading', { name: 'Store online payments', exact: true }).waitFor()
    await page.getByText('View catalog options and content', { exact: true }).click()
    await page.locator('.co-expansion .ce-product-selector select').selectOption(product.id)
    assert.equal(await page.getByRole('button', { name: 'Save product options', exact: true }).isDisabled(), true)
    await snapshot('admin-expansion-controls')
    checks.push('signed Super Admin read-only catalog inspection and disabled provider/domain controls at four widths without owner impersonation')
    const { rows: [recoveryFixture] } = await fixture.pool.query("SELECT id,website_id FROM commerce_private.payment_intents WHERE state='captured_unfulfilled' ORDER BY created_at,id LIMIT 1")
    assert.ok(recoveryFixture, 'Run the full expansion database fixture to include a retained captured payment needing reconciliation.')
    const queue = (await api(`/api/commerce/payments/admin?website_id=${recoveryFixture.website_id}`, { admin: true })).recovery
    assert.equal(queue.available, true)
    assert.ok(queue.intents.some(intent => intent.id === recoveryFixture.id))
    const recoveryWebsite = (await api('/api/commerce/admin', { admin: true })).websites.find(store => store.id === recoveryFixture.website_id)
    await page.locator('.ac-website').filter({ has: page.getByText(`/shops/${recoveryWebsite.slug}`, { exact: true }) }).getByRole('button', { name: 'Manage website', exact: true }).click()
    const recoveryItem = page.locator('.commerce-payment-queue-item').filter({ hasText: recoveryFixture.id })
    await recoveryItem.getByRole('button', { name: 'Select for reconciliation', exact: true }).click()
    assert.equal(await page.getByLabel('Payment intent ID', { exact: true }).inputValue(), recoveryFixture.id)
    assert.equal(await page.getByRole('button', { name: 'Check existing provider payment', exact: true }).isEnabled(), true)
    // Selecting/reading an attempt is local. Do not submit provider reconciliation.
    await snapshot('admin-retained-payment-recovery')
    checks.push('owner payment status uses current scoped configuration; signed Admin finds a retained captured receipt and selects its original reference without provider calls or payment mutations')
    await fixtureRpc('commerce_payment_admin', { p_website_id: website.id, p_action: 'configure', p_payload: { version_id: randomUUID(), mode: 'test', ciphertext: 'unopened-synthetic-local-credential-envelope-'.repeat(4), enabled: true, actor_email: 'admin@commerce.example.test' } }, { service: true })
    const originalCartKey = randomUUID()
    const startUnstarted = key => fixtureRpc('commerce_payment_start', { p_website_id: website.id, p_items: [{ product_id: simple.id, quantity: 1 }], p_customer: { name: 'Local recovery buyer', phone: '9000000033', address: '' }, p_fulfillment: 'pickup', p_cart_key: key, p_coupon_code: '' })
    const unstarted = await startUnstarted(originalCartKey)
    assert.equal(unstarted.state, 'new')
    async function paymentBusinessSnapshot() {
      return (await fixture.pool.query("SELECT (SELECT stock_quantity FROM public.commerce_products WHERE id=$1) AS stock,(SELECT count(*) FROM public.commerce_orders WHERE website_id=$2) AS orders,(SELECT count(*) FROM commerce_private.payment_receipts WHERE website_id=$2) AS receipts,(SELECT count(*) FROM public.commerce_coupon_redemptions WHERE website_id=$2) AS redemptions", [simple.id, website.id])).rows[0]
    }
    async function restorePaymentPointer(key, knownIntent = null) {
      await page.evaluate(({ website, simple, session, key, knownIntent }) => {
        localStorage.setItem(`digital-dine-commerce:customer:${website.slug}`, JSON.stringify(session))
        localStorage.setItem(`dd-commerce-cart:${website.id}`, JSON.stringify({ [simple.id]: 1 }))
        localStorage.setItem(`commerce-payment-attempt:${website.id}:${session.user.id}`, JSON.stringify({ cart_key: key, intent_id: knownIntent }))
        sessionStorage.setItem(`dd-commerce-checkout:${website.id}:${session.user.id}`, JSON.stringify({ key }))
      }, { website, simple, session: fixture.session(fixture.users.get(buyer.id)), key, knownIntent })
      await page.goto(`${base}/shops/${website.slug}`)
      await page.getByRole('button', { name: 'Open shopping bag, 1 items', exact: true }).click()
    }
    const beforeStop = await paymentBusinessSnapshot()
    await restorePaymentPointer(originalCartKey)
    await page.getByRole('button', { name: 'Stop unstarted checkout', exact: true }).waitFor()
    await page.getByText(unstarted.id, { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Place order', exact: true }).isDisabled(), true)
    await snapshot('unstarted-payment-inspected', page.getByRole('button', { name: 'Stop unstarted checkout', exact: true }))
    await page.getByRole('button', { name: 'Stop unstarted checkout', exact: true }).click()
    await page.getByText('Payment processing had not started, so this checkout request was stopped. Your bag is unchanged.', { exact: true }).waitFor()
    assert.equal(await page.evaluate(({ website, buyer }) => localStorage.getItem(`commerce-payment-attempt:${website.id}:${buyer.id}`), { website, buyer }), null)
    assert.equal(await page.evaluate(({ website, simple }) => JSON.parse(localStorage.getItem(`dd-commerce-cart:${website.id}`))[simple.id], { website, simple }), 1)
    assert.deepEqual(await paymentBusinessSnapshot(), beforeStop)
    const stopped = await api('/api/commerce/payments/attempt', { user: buyer, method: 'POST', body: { website_id: website.id, cart_key: originalCartKey, action: 'inspect' } })
    assert.equal(stopped.payment.state, 'cancelled_unstarted')
    assert.equal(stopped.cancellation.reason, 'never_dispatched')
    await snapshot('unstarted-payment-stopped-bag-kept', page.getByText('Payment processing had not started, so this checkout request was stopped. Your bag is unchanged.', { exact: true }))
    await page.locator('input[name="customerName"]').fill('Fresh local COD buyer')
    await page.locator('input[name="customerPhone"]').fill('9000000033')
    const freshRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === `/api/commerce/checkout/${website.id}`)
    await page.getByRole('button', { name: 'Place order', exact: true }).click()
    const successfulCodKey = (await freshRequest).postDataJSON().idempotency_key
    assert.notEqual(successfulCodKey, originalCartKey)
    await page.getByRole('heading', { name: 'Your order is confirmed.', exact: true }).waitFor()
    await snapshot('stopped-payment-fresh-cod-checkout')
    checks.push('cart-key inspection recovers a lost intent reference; verified never-dispatched cancellation preserves bag/stock/orders/receipts/coupon usage; next COD uses a fresh key')
    const missingCartKey = randomUUID()
    await restorePaymentPointer(missingCartKey)
    await page.getByRole('button', { name: 'Check payment', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'absence is not proof' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Stop unstarted checkout', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Place order', exact: true }).isDisabled(), true)
    assert.notEqual(await page.evaluate(({ website, buyer }) => localStorage.getItem(`commerce-payment-attempt:${website.id}:${buyer.id}`), { website, buyer }), null)
    await snapshot('missing-payment-attempt-remains-locked', page.getByRole('alert').filter({ hasText: 'absence is not proof' }))
    const claimedKey = randomUUID(), toClaim = await startUnstarted(claimedKey)
    await restorePaymentPointer(claimedKey, toClaim.id)
    await page.getByRole('button', { name: 'Stop unstarted checkout', exact: true }).waitFor()
    const claim = await fixtureRpc('commerce_payment_service', { p_action: 'claim_create', p_payload: { intent_id: toClaim.id, buyer_id: buyer.id } }, { service: true })
    assert.equal(claim.claimed, true)
    const beforeRejectedStop = await paymentBusinessSnapshot()
    await page.getByRole('button', { name: 'Stop unstarted checkout', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Keep this attempt and check its status' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Place order', exact: true }).isDisabled(), true)
    assert.notEqual(await page.evaluate(({ website, buyer }) => localStorage.getItem(`commerce-payment-attempt:${website.id}:${buyer.id}`), { website, buyer }), null)
    assert.deepEqual(await paymentBusinessSnapshot(), beforeRejectedStop)
    await snapshot('claimed-payment-cannot-be-stopped', page.getByRole('alert').filter({ hasText: 'Keep this attempt and check its status' }))
    checks.push('missing intent is not cancellation proof; stale eligibility loses to creation claim and keeps the payment pointer/cart lock without provider calls')
    const delayedKey = randomUUID(), delayedIntent = await startUnstarted(delayedKey)
    await restorePaymentPointer(delayedKey, delayedIntent.id)
    await page.getByRole('button', { name: 'Stop unstarted checkout', exact: true }).waitFor()
    let releaseStop, stopCommitted, stopFinished
    const heldStop = new Promise(resolve => { releaseStop = resolve })
    releaseHeldStop = releaseStop
    const committedStop = new Promise(resolve => { stopCommitted = resolve })
    const finishedStop = new Promise(resolve => { stopFinished = resolve })
    await page.route('**/api/commerce/payments/attempt', async route => {
      if (route.request().postDataJSON()?.action !== 'cancel_unstarted') return route.continue()
      const response = await route.fetch()
      stopCommitted(response.status())
      await heldStop
      try { await route.fulfill({ response }) } catch { /* The old document may have discarded its request. */ }
      finally { stopFinished() }
    })
    await page.getByRole('button', { name: 'Stop unstarted checkout', exact: true }).click()
    assert.equal(await signal(committedStop, 'Committed stop response'), 200)
    await page.goto(`${base}/shops/${website.slug}/account`)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByLabel('Email address', { exact: true }).fill(otherBuyer.email)
    await page.getByLabel(/^Password/).fill(LOCAL_PASSWORD)
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor()
    const otherPendingKey = randomUUID()
    await page.evaluate(({ website, otherBuyer, key }) => localStorage.setItem(`commerce-payment-attempt:${website.id}:${otherBuyer.id}`, JSON.stringify({ cart_key: key, intent_id: null })), { website, otherBuyer, key: otherPendingKey })
    releaseStop()
    await signal(finishedStop, 'Released stop response')
    await page.unroute('**/api/commerce/payments/attempt')
    await page.goto(`${base}/shops/${website.slug}`)
    await page.getByRole('button', { name: 'Open shopping bag, 1 items', exact: true }).click()
    assert.equal(await page.evaluate(({ website }) => JSON.parse(localStorage.getItem(`digital-dine-commerce:customer:${website.slug}`)).user.id, { website }), otherBuyer.id)
    assert.equal(await page.evaluate(({ website, otherBuyer }) => JSON.parse(localStorage.getItem(`commerce-payment-attempt:${website.id}:${otherBuyer.id}`)).cart_key, { website, otherBuyer }), otherPendingKey)
    assert.equal(await page.evaluate(({ website, buyer }) => JSON.parse(localStorage.getItem(`commerce-payment-attempt:${website.id}:${buyer.id}`)).cart_key, { website, buyer }), delayedKey)
    assert.equal(await page.getByRole('button', { name: 'Place order', exact: true }).isDisabled(), true)
    assert.equal(await page.getByText('Payment processing had not started, so this checkout request was stopped. Your bag is unchanged.', { exact: true }).count(), 0)
    await snapshot('late-stop-response-account-isolation', page.getByRole('button', { name: 'Check payment', exact: true }))
    checks.push('a committed but delayed stop response cannot clear another buyer’s pending pointer, unlock their bag, or publish the previous account’s success state')
    const peer = await context.newPage()
    await peer.goto(`${base}/commerce`)
    for (const phase of ['cancel_unstarted', 'inspect']) {
      const staleKey = randomUUID(), staleIntent = await startUnstarted(staleKey)
      await restorePaymentPointer(staleKey, staleIntent.id)
      await page.getByRole('button', { name: 'Stop unstarted checkout', exact: true }).waitFor()
      let releaseResponse, responseReady, responseFinished
      const heldResponse = new Promise(resolve => { releaseResponse = resolve })
      const readyResponse = new Promise(resolve => { responseReady = resolve })
      const finishedResponse = new Promise(resolve => { responseFinished = resolve })
      releaseHeldStop = releaseResponse
      await page.route('**/api/commerce/payments/attempt', async route => {
        const body = route.request().postDataJSON()
        if (body?.action !== phase || body.cart_key !== staleKey) return route.continue()
        const response = await route.fetch()
        responseReady(response.status())
        await heldResponse
        try { await route.fulfill({ response }) } catch { /* A guarded stale document may discard it. */ }
        finally { responseFinished() }
      })
      await page.getByRole('button', { name: phase === 'inspect' ? 'Check payment' : 'Stop unstarted checkout', exact: true }).click()
      assert.equal(await signal(readyResponse, `Shared-storage ${phase} response`), 200)
      const replacementKey = randomUUID(), replacement = await startUnstarted(replacementKey)
      const beforeStaleReply = await paymentBusinessSnapshot()
      await peer.evaluate(({ website, buyer, key, id }) => localStorage.setItem(`commerce-payment-attempt:${website.id}:${buyer.id}`, JSON.stringify({ cart_key: key, intent_id: id })), { website, buyer, key: replacementKey, id: replacement.id })
      releaseResponse()
      await signal(finishedResponse, `Released shared-storage ${phase} response`)
      await page.unroute('**/api/commerce/payments/attempt')
      assert.equal(await page.evaluate(({ website, buyer }) => JSON.parse(localStorage.getItem(`commerce-payment-attempt:${website.id}:${buyer.id}`)).cart_key, { website, buyer }), replacementKey)
      assert.equal(await page.getByRole('button', { name: 'Place order', exact: true }).isDisabled(), true)
      assert.deepEqual(await paymentBusinessSnapshot(), beforeStaleReply)
      await snapshot(`shared-payment-pointer-${phase}`, page.getByRole('button', { name: 'Check payment', exact: true }))
      await page.evaluate(({ website, buyer, key }) => sessionStorage.setItem(`dd-commerce-checkout:${website.id}:${buyer.id}`, JSON.stringify({ key })), { website, buyer, key: successfulCodKey })
      await page.reload()
      await page.getByRole('button', { name: 'Open shopping bag, 1 items', exact: true }).click()
      await page.getByRole('button', { name: 'Stop unstarted checkout', exact: true }).waitFor()
      await page.getByText(replacement.id, { exact: true }).waitFor()
    }
    await peer.close()
    checks.push('a delayed cancellation proof cannot delete another tab’s replacement pointer; a delayed nonterminal inspection cannot overwrite it, and reload recovers the replacement intent')
    assert.deepEqual(errors, [], `Browser page errors: ${errors.join('; ')}`)
    const result = { result: 'PASS', scope: 'Real local Next.js HTTP routes and PostgreSQL/RLS with simulated Auth/Storage protocols; browser delays and response loss preserve real API execution.', templates, screenshots, checks, checkoutRequests, blockedExternalHosts: [...blocked], hostedAuthTested: false, hostedRlsTested: false, livePayments: false, productionWrites: false }
    await writeFile(path.join(artifacts, 'expansion-browser-results.json'), JSON.stringify(result, null, 2) + '\n')
    return result
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, 'expansion-failure.png'), fullPage: true }).catch(() => {})
    await writeFile(path.join(artifacts, 'expansion-browser-failure.json'), JSON.stringify({ error: error.message, errors, checks, screenshots, url: page.url() }, null, 2) + '\n')
    throw error
  } finally { releaseHeldStop(); await context.close() }
}

async function main() {
  const databaseUrl = process.env.COMMERCE_TEST_DATABASE_URL
  assert.ok(databaseUrl, 'Set COMMERCE_TEST_DATABASE_URL explicitly to isolated loopback commerce_test.')
  const target = new URL(databaseUrl)
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))
  assert.equal(target.pathname, '/commerce_test')
  assert.ok(!target.searchParams.has('host') && !target.searchParams.has('hostaddr'))
  const fixturePort = Number(process.env.COMMERCE_FIXTURE_PORT || 4339)
  const appPort = Number(process.env.COMMERCE_APP_PORT || 4331)
  const base = `http://127.0.0.1:${appPort}`
  const artifacts = process.env.COMMERCE_BROWSER_ARTIFACTS || '/tmp/digital-dining-commerce-expansion-browser'
  await mkdir(artifacts, { recursive: true })
  const env = developmentEnvironment({ fixturePort })
  let fixture, server, browser
  async function command(name, args, filename) {
    const log = await open(path.join(artifacts, filename), 'w')
    try {
      const child = spawn(name, args, { cwd: root, env: { ...env, COMMERCE_TEST_DATABASE_URL: databaseUrl }, stdio: ['ignore', log.fd, log.fd] })
      await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${name} ${args.join(' ')} failed (${code}); see ${filename}.`))) })
    } finally { await log.close() }
  }
  try {
    if (process.env.COMMERCE_BROWSER_SKIP_DB !== '1') await command('node', ['scripts/test-commerce-expansion-db.mjs'], 'expansion-database.log')
    fixture = await createCommerceFixture({ databaseUrl, port: fixturePort, appOrigin: base })
    fixture.port = fixturePort
    if (process.env.COMMERCE_BROWSER_SKIP_BUILD !== '1') await command('npm', ['run', 'build'], 'build.log')
    if (process.env.COMMERCE_BROWSER_EXTERNAL_SERVER !== '1') {
      const log = await open(path.join(artifacts, 'next.log'), 'w')
      server = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(appPort)], { cwd: root, env, detached: true, stdio: ['ignore', log.fd, log.fd] })
      await log.close()
    }
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server && server.exitCode !== null) throw new Error('Next.js exited before readiness; inspect next.log.')
      try { if ((await fetch(`${base}/commerce`)).status === 200) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    assert.ok(ready, 'Next.js readiness timeout.')
    browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_CHROMIUM_PATH || '/usr/bin/chromium' })
    const result = await runExpansionBrowserChecks({ base, fixture, browser, artifacts })
    console.log(`PASS: ${result.checks.length} expansion browser groups, ${result.screenshots.length} desktop/mobile screenshots. Evidence: ${artifacts}`)
  } finally {
    if (browser) await browser.close()
    if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM') } catch {} }
    if (fixture) await fixture.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main()
