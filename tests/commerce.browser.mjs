import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, open, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createCommerceFixture, developmentEnvironment, developmentUsers, LOCAL_PASSWORD } from './helpers/commerce-fixture.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const databaseUrl = process.env.COMMERCE_TEST_DATABASE_URL
assert.ok(databaseUrl, 'Set COMMERCE_TEST_DATABASE_URL explicitly to an isolated loopback commerce_test database.')
const base = 'http://127.0.0.1:4320'
const artifacts = process.env.COMMERCE_BROWSER_ARTIFACTS || '/tmp/digital-dining-commerce-browser'
const env = developmentEnvironment()
let fixture, browser, server
await mkdir(artifacts, { recursive: true })

async function command(name, args, filename, options = {}) {
  const log = await open(path.join(artifacts, filename), 'w')
  try {
    const process = spawn(name, args, { cwd: root, env: options.env || env, stdio: ['ignore', log.fd, log.fd] })
    await new Promise((resolve, reject) => {
      process.once('error', reject)
      process.once('exit', code => code === 0 ? resolve() : reject(new Error(`${name} ${args.join(' ')} failed (${code}); see ${path.join(artifacts, filename)}`)))
    })
  } finally { await log.close() }
}

let adminCookie = ''
async function api(url, { user, admin = false, method = 'GET', body, expected = 200 } = {}) {
  const headers = { Origin: base }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (user) headers.Authorization = `Bearer ${fixture.session(fixture.users.get(user.id)).access_token}`
  if (admin) headers.Cookie = adminCookie
  const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const result = await response.json().catch(() => ({}))
  assert.equal(response.status, expected, `${method} ${url}: ${JSON.stringify(result)}`)
  return result
}

const ownerA = developmentUsers[0], ownerB = developmentUsers[1], buyerA = developmentUsers[2], buyerB = developmentUsers[3]
let storeA, storeB, productA

async function createWebsite(owner, slug, name, applicationId, businessType) {
  return (await api('/api/commerce/admin', { admin: true, method: 'POST', body: {
    action: 'create_website', payload: {
      name, slug, business_type: businessType, template: 'general', status: 'setup',
      owner_user_id: owner.id, ...(applicationId ? { application_id: applicationId } : {}),
      branding: { primary_color: '#155e46', background_color: '#f8faf8', text_color: '#17231e', headline: `${name}, made for you.`, description: 'An isolated development storefront.', contact_email: 'store@commerce.example.test' },
      features: { catalog: true, inventory: true, cod: true },
      owner_permissions: { products: true, categories: true, inventory: true, orders: true, branding: true, customers: true },
      fulfillment: { pickup: true, delivery: true, delivery_fee_paise: 5000, minimum_order_paise: 0, pickup_address: 'Development test address' },
      subscription_plan: 'basic', subscription_status: 'trial', monthly_price_paise: 0,
    },
  } })).website
}

async function httpChecks() {
  await api('/api/commerce/admin', { expected: 401 })
  const response = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) })
  assert.equal(response.status, 200)
  adminCookie = response.headers.get('set-cookie').split(';')[0]
  await api('/api/commerce/admin', { admin: true })

  const application = (await api('/api/commerce/applications', { user: ownerA, method: 'POST', expected: 201, body: {
    owner_name: ownerA.name, business_name: 'Saree Store', business_type: 'sarees', phone: '9000000000', address: 'Development test address', preferred_slug: 'qa-saree-store', description: 'A local development application.', required_features: ['catalog', 'cod'], product_categories: ['Sarees'], fulfillment: { pickup: true, delivery: true }, branding_preferences: 'Forest green', payment_requirements: 'COD only',
  } })).application
  assert.equal(application.applicant_user_id, ownerA.id)
  assert.equal(application.email, ownerA.email)
  for (const status of ['under_review', 'approved']) await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'review_application', payload: { application_id: application.id, status, review_note: 'Development fixture review.' } } })
  storeA = await createWebsite(ownerA, 'qa-saree-store', 'Saree Store', application.id, 'sarees')
  storeB = await createWebsite(ownerB, 'qa-grocery-store', 'Grocery Store', undefined, 'grocery')
  assert.ok(storeA.id && storeB.id)
  await api(`/api/commerce/workspace/${storeA.id}`, { user: ownerB, expected: 403 })

  const ownerAction = (website, owner, action, payload, expected = 200) => api(`/api/commerce/workspace/${website.id}`, { user: owner, method: 'POST', body: { action, payload }, expected })
  const category = (await ownerAction(storeA, ownerA, 'save_category', { name: 'Sarees', slug: 'sarees', active: true })).result
  productA = (await ownerAction(storeA, ownerA, 'save_product', { category_id: category.id, name: 'Silk Saree', slug: 'silk-saree', description: 'A development-only sample for checkout validation.', price_paise: 129900, image_url: '', attributes: { fabric: 'Silk', color: 'Rose' }, active: true })).result
  await ownerAction(storeA, ownerA, 'adjust_stock', { product_id: productA.id, delta: 5, reason: 'Development fixture stock.' })
  const groceryCategory = (await ownerAction(storeB, ownerB, 'save_category', { name: 'Fresh Produce', slug: 'fresh-produce', active: true })).result
  const productB = (await ownerAction(storeB, ownerB, 'save_product', { category_id: groceryCategory.id, name: 'Grocery Basket', slug: 'grocery-basket', description: 'A development grocery basket from an isolated second tenant.', price_paise: 9900, image_url: '', attributes: {}, active: true })).result
  await ownerAction(storeB, ownerB, 'adjust_stock', { product_id: productB.id, delta: 3, reason: 'Development fixture stock.' })
  await ownerAction(storeA, ownerB, 'adjust_stock', { product_id: productA.id, delta: 5 }, 403)
  for (const website of [storeA, storeB]) await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'save_website', payload: { id: website.id, status: 'active' } } })
  const catalogA = await api('/api/commerce/catalog/qa-saree-store')
  const catalogB = await api('/api/commerce/catalog/qa-grocery-store')
  assert.deepEqual(catalogA.products.map(row => row.id), [productA.id])
  assert.deepEqual(catalogB.products.map(row => row.id), [productB.id])
  assert.equal(catalogA.website.business_type, 'sarees')
  assert.equal(catalogB.website.business_type, 'grocery')
  assert.equal(catalogA.website.template, 'general')
  assert.equal(catalogB.website.template, 'general')
  assert.ok(!('owner_permissions' in catalogA.website), 'Public DTO exposed private owner configuration.')

  const checkout = { items: [{ product_id: productA.id, quantity: 2 }], customer: { name: buyerA.name, phone: '9000000001', address: 'Development customer address' }, fulfillment_method: 'pickup', payment_method: 'cod', idempotency_key: randomUUID() }
  const first = await api(`/api/commerce/checkout/${storeA.id}`, { user: buyerA, method: 'POST', expected: 201, body: checkout })
  const replay = await api(`/api/commerce/checkout/${storeA.id}`, { user: buyerA, method: 'POST', expected: 201, body: checkout })
  assert.equal(first.order.id, replay.order.id)
  assert.equal(first.order.total_paise, 259800)
  assert.equal((await api('/api/commerce/catalog/qa-saree-store')).products[0].stock_quantity, 3)
  await api(`/api/commerce/checkout/${storeA.id}`, { user: buyerA, method: 'POST', expected: 409, body: { ...checkout, items: [{ product_id: productA.id, quantity: 1 }] } })
  await api(`/api/commerce/checkout/${storeA.id}`, { user: buyerA, method: 'POST', expected: 409, body: { ...checkout, idempotency_key: randomUUID(), items: [{ product_id: productA.id, quantity: 999 }] } })
  await api(`/api/commerce/checkout/${storeA.id}`, { user: buyerA, method: 'POST', expected: 403, body: { ...checkout, idempotency_key: randomUUID(), items: [{ product_id: productB.id, quantity: 1 }] } })
  assert.equal((await api(`/api/commerce/customer/orders?website_id=${storeA.id}`, { user: buyerA })).orders.length, 1)
  assert.equal((await api(`/api/commerce/customer/orders?website_id=${storeA.id}`, { user: buyerB })).orders.length, 0)
  await ownerAction(storeA, ownerA, 'update_order_status', { order_id: first.order.id, status: 'cancelled' })
  await ownerAction(storeA, ownerA, 'update_order_status', { order_id: first.order.id, status: 'cancelled' })
  assert.equal((await api('/api/commerce/catalog/qa-saree-store')).products[0].stock_quantity, 5)
  const view = await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'open_management_view', payload: { website_id: storeA.id } } })
  assert.equal(view.website.id, storeA.id)
  const admin = await api('/api/commerce/admin', { admin: true })
  assert.ok(admin.audit_logs.some(row => row.action === 'open_management_view'), 'Admin management view was not audited.')
  await ownerAction(storeB, ownerB, 'adjust_stock', { product_id: productB.id, delta: -3, reason: 'Test untracked inventory.' })
  await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'save_website', payload: { id: storeB.id, features: { catalog: true, inventory: false, cod: true } } } })
  await api(`/api/commerce/checkout/${storeB.id}`, { user: buyerB, method: 'POST', expected: 201, body: { ...checkout, idempotency_key: randomUUID(), items: [{ product_id: productB.id, quantity: 1 }] } })
  assert.equal((await api('/api/commerce/catalog/qa-grocery-store')).products[0].stock_quantity, 0, 'Untracked inventory must remain unchanged.')
  for (const status of ['suspended', 'archived']) {
    await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'save_website', payload: { id: storeB.id, status } } })
    await api('/api/commerce/catalog/qa-grocery-store', { expected: 404 })
    await api('/api/commerce/catalog/qa-saree-store')
  }
  await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'save_website', payload: { id: storeB.id, status: 'active' } } })
  await api('/api/commerce/catalog/unknown-development-store', { expected: 404 })
  fixture.state.unavailable = true
  try { await api('/api/commerce/catalog/qa-saree-store', { expected: 503 }) }
  finally { fixture.state.unavailable = false }
  await api('/api/commerce/catalog/qa-saree-store')
  await api('/api/delivery/customer/returns', { expected: 400 })
  await api('/api/delivery/customer/return', { expected: 400 })
  await api('/api/delivery/customer/returns', { method: 'POST', body: {}, expected: 400 })
  await api('/api/delivery/customer/return', { method: 'POST', body: {}, expected: 400 })
  await api('/api/delivery/customer/forgot-pin', { expected: 400 })
  const recovery = await api('/api/delivery/customer/forgot-pin?store=TESTSTORE&mobile=9000000000', { expected: 503 })
  assert.equal(recovery.code, 'PIN_RECOVERY_UNAVAILABLE')
  assert.equal((await api('/api/delivery/customer/forgot-pin', { method: 'POST', body: { store: 'TESTSTORE', mobile: '9000000000', newPin: '1234' }, expected: 503 })).code, recovery.code)
  const retired = await api('/api/create-subscription-order', { method: 'POST', body: {}, expected: 410 })
  assert.equal(retired.code, 'SUBSCRIPTION_ENDPOINT_RETIRED')
  const billingId = '11111111-1111-4111-8111-111111111111'
  const billing = await fetch(`${base}/dashboard/${billingId}/billing?plan=delivery&amount=1`, { redirect: 'manual' })
  assert.equal(billing.status, 307)
  assert.equal(new URL(billing.headers.get('location'), base).href, `${base}/subscribe/${billingId}?plan=delivery`)
  console.log('LEGACY CHECKS: return/returns invalid input HTTP400; PIN recovery validates HTTP400 and reports explicit unavailable HTTP503; retired subscription API HTTP410; bookmarked billing HTTP307 to current subscription checkout. Successful PIN reset and provider payment remain unverified.')
  console.log('PASS: real APIs + PostgreSQL application approval, website setup, tenant isolation, catalog, COD totals, replay, stock failure, cancellation restock and admin audit.')
}

async function browserChecks() {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_CHROMIUM_PATH || '/usr/bin/chromium' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const errors = [], blocked = new Set()
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if ([base, 'http://127.0.0.1:4319'].includes(url.origin)) return route.continue()
    blocked.add(url.hostname)
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  async function snapshot(name, target = page) {
    await target.setViewportSize({ width: 1440, height: 1000 })
    await target.screenshot({ path: path.join(artifacts, `${name}-desktop.png`), fullPage: true })
    await target.setViewportSize({ width: 375, height: 812 })
    await target.screenshot({ path: path.join(artifacts, `${name}-mobile.png`), fullPage: true })
    assert.equal(await target.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} has horizontal mobile overflow.`)
    await target.setViewportSize({ width: 1440, height: 1000 })
  }
  const storefrontWidths = [360, 390, 768, 1440]
  const storefrontCheckpoints = []
  const contrastSamples = []
  let nativeBrowserChromeVisits = 0
  async function assertButtonContrast(target, name) {
    const ratio = await target.evaluate(element => {
      const style = getComputedStyle(element)
      // Tailwind can resolve to CSS Color 4 syntax (for example oklch), not
      // numeric rgb(). Convert the actual painted color to sRGB before WCAG.
      const canvas = document.createElement('canvas')
      canvas.width = 2; canvas.height = 1
      const drawing = canvas.getContext('2d', { willReadFrequently: true })
      const parse = (value, x) => {
        if (!CSS.supports('color', value)) return null
        drawing.fillStyle = value; drawing.fillRect(x, 0, 1, 1)
        const pixel = [...drawing.getImageData(x, 0, 1, 1).data]
        return [...pixel.slice(0, 3), pixel[3] / 255]
      }
      const foreground = parse(style.color, 0), background = parse(style.backgroundColor, 1)
      if (!foreground || !background || (foreground[3] ?? 1) !== 1 || (background[3] ?? 1) !== 1) return null
      const luminance = channels => channels.slice(0, 3).map(value => {
        const part = value / 255
        return part <= .04045 ? part / 12.92 : ((part + .055) / 1.055) ** 2.4
      }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
      return (values[0] + .05) / (values[1] + .05)
    })
    assert.ok(ratio !== null && ratio >= 4.5, `${name} has insufficient computed text/background contrast (${ratio}).`)
    contrastSamples.push({ name, ratio })
  }
  async function snapshotWidths(name, target = page) {
    for (const width of storefrontWidths) {
      await target.setViewportSize({ width, height: width < 768 ? 812 : width < 1440 ? 1024 : 1000 })
      const modalOpen = await target.locator('dialog[open]').count() > 0
      // Capture modal UI in its actual viewport. Whole-document captures of
      // fixed dialogs/sticky headers can misleadingly place them mid-page.
      if (!modalOpen) await target.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
      assert.equal(await target.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflows at ${width}px.`)
      const bagButton = target.locator('.cs-header .cs-bag')
      if (await bagButton.count()) {
        const box = await bagButton.boundingBox()
        assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1 && box.width >= 44 && box.height >= 44, `${name} has clipped or undersized persistent bag access at ${width}px.`)
      }
      for (const dialog of await target.locator('dialog[open]').all()) {
        const box = await dialog.boundingBox()
        assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1, `${name} has a clipped dialog at ${width}px.`)
      }
      await target.screenshot({ path: path.join(artifacts, `${name}-${width}.png`), fullPage: !modalOpen })
      storefrontCheckpoints.push({ name, width, noHorizontalDocumentOverflow: true })
    }
    await target.setViewportSize({ width: 1440, height: 1000 })
  }
  async function focusRemainsIn(selector) {
    const inspect = () => page.evaluate(value => {
      const dialog = document.querySelector(value)
      return {
        inside: Boolean(dialog?.open && dialog.contains(document.activeElement)),
        modal: Boolean(dialog?.matches(':modal')),
        documentFocused: document.hasFocus(),
        activeTag: document.activeElement?.tagName,
      }
    }, selector)
    let focus = await inspect()
    // Chromium's native dialog tab order includes browser chrome after the
    // final in-page control (BODY + document.hasFocus=false). That is not a
    // focusable background page element. Verify its next Tab returns inside.
    if (!focus.inside && focus.modal && !focus.documentFocused && focus.activeTag === 'BODY') {
      nativeBrowserChromeVisits += 1
      await page.keyboard.press('Tab')
      focus = await inspect()
    }
    assert.equal(focus.inside && focus.modal && focus.documentFocused, true, `Keyboard focus escaped the active modal: ${JSON.stringify(focus)}.`)
  }
  async function signInOwner(target, email, destination = '/commerce/dashboard') {
    await target.goto(`${base}/commerce/auth${destination === '/commerce/apply' ? '?next=/commerce/apply' : ''}`)
    await target.getByLabel('Email address', { exact: true }).fill(email)
    await target.getByLabel('Password', { exact: true }).fill(LOCAL_PASSWORD)
    await target.getByRole('button', { name: /^Sign in/ }).click()
    await target.waitForURL(`${base}${destination}`)
  }

  async function callbackFailure(link, checkpoint) {
    await page.goto(link)
    await page.getByRole('heading', { name: 'We could not complete sign-in.', exact: true }).waitFor()
    await page.getByRole('alert').filter({ hasText: 'This link is invalid or expired' }).waitFor()
    assert.equal(new URL(page.url()).origin, base, 'An invalid callback left the application origin.')
    assert.equal(new URL(page.url()).pathname, '/auth/callback/commerce')
    await assertButtonContrast(page.getByRole('link', { name: 'Back to sign in', exact: true }), 'Callback back-to-sign-in link')
    if (checkpoint) await snapshot(checkpoint)
  }

  async function storedScopes(keys) {
    return page.evaluate(names => Object.fromEntries(names.map(key => [key, localStorage.getItem(key)])), keys)
  }

  async function passwordStatus(email, password) {
    const response = await fetch('http://127.0.0.1:4319/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    })
    return response.status
  }

  function emailLink(email, type, audience, store) {
    const link = fixture.getEmailLink(email, type)
    assert.ok(link, 'The isolated Auth provider did not issue an email link.')
    const url = new URL(link)
    assert.equal(url.origin, base)
    assert.equal(url.pathname, '/auth/callback/commerce', 'Email redirected outside the configured callback prefix.')
    assert.equal(url.searchParams.get('audience'), audience)
    assert.equal(url.searchParams.get('store'), store || null)
    assert.equal(url.searchParams.get('recovery'), type === 'recovery' ? '1' : null)
    assert.ok(url.searchParams.get('code'))
    return link
  }

  async function storefrontIncrementChecks(imageUrl) {
    const viewProduct = page.getByRole('button', { name: 'View Silk Saree', exact: true })
    // A missing tenant photo must remain an honest, non-zoomable fallback.
    await viewProduct.focus()
    await page.keyboard.press('Enter')
    await page.locator('.cs-product-dialog[open]').waitFor()
    await page.locator('.cs-product-dialog[open] .cs-gallery > .cs-gallery-missing').getByText('Product image unavailable', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Zoom image of Silk Saree', exact: true }).count(), 0)
    await snapshotWidths('editorial-product-missing-image')
    await page.keyboard.press('Escape')
    await page.locator('.cs-product-dialog[open]').waitFor({ state: 'hidden' })
    assert.equal(await viewProduct.evaluate(element => document.activeElement === element), true, 'Closing product details did not restore the invoking control.')

    const workspacePath = `/api/commerce/workspace/${storeA.id}`
    const action = (name, payload) => api(workspacePath, { user: ownerA, method: 'POST', body: { action: name, payload } })
    // Reuse the photo actually uploaded through the owner UI earlier in this
    // isolated run. The shared storefront never receives a hardcoded demo image.
    await action('save_product', {
      id: productA.id, category_id: productA.category_id, name: productA.name,
      slug: productA.slug, description: productA.description, price_paise: productA.price_paise,
      image_url: imageUrl, attributes: productA.attributes, active: true,
    })
    const accessory = (await action('save_category', { name: 'QA Accessories', slug: 'qa-accessories', active: true })).result
    const cotton = (await action('save_product', {
      name: 'QA Cotton Scarf', slug: 'qa-cotton-scarf', category_id: productA.category_id,
      description: 'Isolated price-filter regression product.', price_paise: 5995,
      image_url: `http://127.0.0.1:4319/storage/v1/object/public/commerce-media/${storeA.id}/missing-regression-photo.png`, attributes: { material: 'organic' }, active: true,
    })).result
    const soldOut = (await action('save_product', {
      name: 'QA Sold Out Accessory', slug: 'qa-sold-out-accessory', category_id: accessory.id,
      description: 'Isolated availability-filter regression product.', price_paise: 3499,
      image_url: '', attributes: {}, active: true,
    })).result
    await action('adjust_stock', { product_id: cotton.id, delta: 3, reason: 'Local filter regression inventory.' })
    await page.reload()
    await page.getByRole('button', { name: 'View QA Cotton Scarf', exact: true }).waitFor()
    await assertButtonContrast(page.locator('.cs-hero .cs-primary'), 'Storefront primary shopping action')
    await snapshotWidths('editorial-storefront')
    const minimumPrice = page.getByLabel('Minimum price (₹)', { exact: true })
    const maximumPrice = page.getByLabel('Maximum price (₹)', { exact: true })
    const availability = page.getByLabel(/^Availability/)
    const clearFilters = page.getByRole('group', { name: 'Refine the collection' }).getByRole('button', { name: 'Clear filters', exact: true })
    const resultCount = page.locator('.cs-results')
    assert.match(await resultCount.textContent(), /Showing 3 of 3 products/)
    await page.getByRole('button', { name: 'Sarees', exact: true }).click()
    await availability.selectOption('in-stock')
    await page.getByLabel(/^Sort by/).selectOption('price-low')
    assert.deepEqual(await page.locator('.cs-product-name').allTextContents(), ['QA Cotton Scarf', 'Silk Saree'])
    await page.getByRole('searchbox', { name: 'Search products' }).fill('organic')
    await minimumPrice.fill('59.95')
    await maximumPrice.fill('59.95')
    assert.deepEqual(await page.locator('.cs-product-name').allTextContents(), ['QA Cotton Scarf'], 'Search/category/price/availability/sort did not compose.')
    assert.match(await resultCount.textContent(), /Showing 1 of 3 products in Sarees/)
    await snapshotWidths('editorial-filters-applied')
    await minimumPrice.fill('59.96')
    await page.getByRole('alert').filter({ hasText: 'Minimum price must not exceed maximum price.' }).waitFor()
    assert.equal(await page.locator('.cs-product').count(), 0)
    await maximumPrice.fill('60.00')
    await page.getByRole('heading', { name: 'No products match your search.', exact: true }).waitFor()
    assert.equal(await page.locator('.cs-product').count(), 0, 'A one-paise price boundary included a cheaper product.')
    await minimumPrice.fill('0')
    await maximumPrice.fill('59.95')
    assert.deepEqual(await page.locator('.cs-product-name').allTextContents(), ['QA Cotton Scarf'])
    await maximumPrice.fill('1.001')
    await page.getByRole('alert').filter({ hasText: 'up to two decimal places' }).waitFor()
    assert.equal(await maximumPrice.getAttribute('aria-invalid'), 'true')
    await snapshotWidths('editorial-filters-invalid-range')
    await clearFilters.click()
    assert.equal(await minimumPrice.inputValue(), '')
    assert.equal(await maximumPrice.inputValue(), '')
    assert.equal(await page.getByRole('searchbox', { name: 'Search products' }).inputValue(), '')
    assert.equal(await availability.inputValue(), 'all')
    assert.equal(await page.getByRole('button', { name: 'All products', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.match(await resultCount.textContent(), /Showing 3 of 3 products/)
    await availability.selectOption('sold-out')
    assert.deepEqual(await page.locator('.cs-product-name').allTextContents(), ['QA Sold Out Accessory'])
    assert.equal(await page.getByRole('button', { name: 'Add QA Sold Out Accessory to bag', exact: true }).isDisabled(), true)
    await page.getByRole('button', { name: 'Sarees', exact: true }).click()
    assert.equal(await page.locator('.cs-product').count(), 0, 'A sold-out product crossed the selected category.')
    await clearFilters.click()
    await page.getByLabel(/^Sort by/).selectOption('name')
    await page.getByRole('button', { name: 'View QA Cotton Scarf', exact: true }).click()
    await page.locator('.cs-product-dialog[open] .cs-gallery > .cs-gallery-missing').getByText('Product image unavailable', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Zoom image of QA Cotton Scarf', exact: true }).count(), 0, 'A failed tenant image left a broken zoom action.')
    await page.keyboard.press('Escape')
    await page.locator('.cs-product-dialog[open]').waitFor({ state: 'hidden' })

    await viewProduct.focus()
    await page.keyboard.press('Enter')
    await page.locator('.cs-product-dialog[open]').waitFor()
    const zoomTrigger = page.getByRole('button', { name: 'Zoom image of Silk Saree', exact: true })
    await zoomTrigger.waitFor()
    await zoomTrigger.locator('img').evaluate(image => image.decode())
    assert.equal(await zoomTrigger.locator('img').evaluate(image => image.complete && image.naturalWidth > 0), true)
    assert.equal(await zoomTrigger.locator('img').getAttribute('src'), imageUrl)
    assert.equal(await zoomTrigger.locator('img').count(), 1, 'A one-image product acquired invented gallery images.')
    await snapshotWidths('editorial-product-image')
    await zoomTrigger.focus()
    await page.keyboard.press('Enter')
    await page.locator('.cs-gallery-dialog[open]').waitFor()
    assert.equal(await page.locator('.cs-product-dialog[open]').count(), 1)
    const zoomLevel = page.getByLabel('Image zoom level', { exact: true })
    assert.equal(await zoomLevel.textContent(), '100%')
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    assert.equal(await zoomLevel.textContent(), '150%')
    for (let index = 0; index < 3; index++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    assert.equal(await zoomLevel.textContent(), '300%')
    assert.equal(await page.getByRole('button', { name: 'Zoom in', exact: true }).isDisabled(), true)
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
    assert.equal(await zoomLevel.textContent(), '250%')
    await page.getByRole('button', { name: 'Reset zoom', exact: true }).click()
    assert.equal(await zoomLevel.textContent(), '100%')
    for (const name of ['Close image zoom', 'Zoom in', 'Zoom out']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox()
      assert.ok(box && box.width >= 44 && box.height >= 44, `${name} is not touch-friendly.`)
    }
    for (let index = 0; index < 8; index++) { await page.keyboard.press('Tab'); await focusRemainsIn('.cs-gallery-dialog') }
    await snapshotWidths('editorial-product-image-zoom')
    await page.keyboard.press('Escape')
    await page.locator('.cs-gallery-dialog[open]').waitFor({ state: 'hidden' })
    assert.equal(await page.locator('.cs-product-dialog[open]').count(), 1, 'Escape from image zoom also closed product details.')
    assert.equal(await zoomTrigger.evaluate(element => document.activeElement === element), true, 'Image zoom did not return focus to its trigger.')
    await zoomTrigger.click()
    await page.locator('.cs-gallery-dialog[open]').waitFor()
    await page.mouse.click(2, 2)
    await page.locator('.cs-gallery-dialog[open]').waitFor({ state: 'hidden' })
    assert.equal(await page.locator('.cs-product-dialog[open]').count(), 1, 'Image backdrop also closed product details.')
    assert.equal(await zoomTrigger.evaluate(element => document.activeElement === element), true)
    await page.keyboard.press('Escape')
    await page.locator('.cs-product-dialog[open]').waitFor({ state: 'hidden' })
    assert.equal(await viewProduct.evaluate(element => document.activeElement === element), true)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.equal(await page.locator('.cs-product-photo img').first().evaluate(image => getComputedStyle(image).transitionDuration), '0s', 'Reduced motion left product-image animation enabled.')
    await page.emulateMedia({ reducedMotion: 'no-preference' })

    // Restore the original active catalog before the existing order/retry cases.
    await action('archive_product', { id: cotton.id })
    await action('archive_product', { id: soldOut.id })
    await action('archive_category', { id: accessory.id })
    await page.reload()
    assert.deepEqual((await api('/api/commerce/catalog/qa-saree-store')).products.map(product => product.id), [productA.id])
  }

  async function storefrontLabMeasurements() {
    const samples = []
    for (const width of storefrontWidths) {
      const target = await context.newPage()
      target.on('pageerror', error => errors.push(error.message))
      await target.setViewportSize({ width, height: width < 768 ? 812 : width < 1440 ? 1024 : 1000 })
      await target.addInitScript(() => {
        const metrics = { lcpMs: null, cls: 0, lcpSupported: false, clsSupported: false }
        window.__commerceLabMetrics = metrics
        try {
          new PerformanceObserver(list => { for (const entry of list.getEntries()) metrics.lcpMs = entry.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
          metrics.lcpSupported = true
        } catch {}
        try {
          new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) metrics.cls += entry.value }).observe({ type: 'layout-shift', buffered: true })
          metrics.clsSupported = true
        } catch {}
      })
      await target.goto(`${base}/shops/qa-saree-store`)
      await target.getByRole('heading', { name: 'Saree Store, made for you.', exact: true }).waitFor()
      await target.evaluate(async () => {
        await document.fonts.ready
        await Promise.all([...document.images].map(image => image.decode().catch(() => {})))
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      })
      assert.equal(await target.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      samples.push({ width, ...await target.evaluate(() => ({ ...window.__commerceLabMetrics, observedAtMs: performance.now() })) })
      await target.close()
    }
    await writeFile(path.join(artifacts, 'storefront-lab-performance.json'), JSON.stringify({
      scope: 'One unthrottled loopback navigation per viewport; local browser lab only',
      observationWindow: 'Initial load through font/image readiness and two animation frames; not the full page lifespan.',
      samples, inpMeasured: false, field75thPercentileMeasured: false,
      targetsAreNotClaims: { lcpMs: 2500, inpMs: 200, cls: .1 },
    }, null, 2) + '\n')
  }

  // The app's real HMAC cookie is Secure in production mode. Adapt only the local
  // browser cookie transport; production cookie code is not changed for this test.
  const [name, value] = adminCookie.split('=')
  await context.addCookies([{ name, value, url: base, httpOnly: true, secure: false, sameSite: 'Lax' }])

  await page.goto(`${base}/delivery/forgot-pin?store=TESTSTORE`)
  await page.getByRole('heading', { name: 'Forgot your PIN?', exact: true }).waitFor()
  await snapshot('legacy-pin-recovery-form')
  await page.getByLabel('Mobile number (+91)', { exact: true }).fill('9000000000')
  const unavailable = page.waitForResponse(response => response.url().includes('/api/delivery/customer/forgot-pin?') && response.status() === 503)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await unavailable
  await page.getByRole('alert').filter({ hasText: 'Your PIN has not changed.' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Reset PIN', exact: true }).count(), 0)
  await snapshot('legacy-pin-recovery-unavailable')

  const separateKeys = ['sb-127-auth-token', 'digital-dine-commerce:customer:qa-grocery-store']
  await page.evaluate(({ legacy, grocery, owner }) => {
    localStorage.setItem('sb-127-auth-token', legacy)
    localStorage.setItem('digital-dine-commerce:customer:qa-grocery-store', grocery)
    localStorage.setItem('digital-dine-commerce:owner', owner)
  }, {
    legacy: JSON.stringify(fixture.session(fixture.users.get(ownerB.id))),
    grocery: JSON.stringify(fixture.session(fixture.users.get(buyerB.id))),
    owner: JSON.stringify(fixture.session(fixture.users.get(ownerA.id))),
  })
  const separateSessions = await storedScopes(separateKeys)
  const initialOwner = await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner'))
  await callbackFailure(`${base}/auth/callback/commerce?audience=owner`, 'commerce-callback-invalid')
  assert.equal(await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner')), initialOwner, 'A missing-code callback changed the existing owner session.')
  await callbackFailure(`${base}/auth/callback/commerce?audience=owner&code=unused&next=https%3A%2F%2Foutside.example.test`)
  assert.deepEqual(await storedScopes(separateKeys), separateSessions)

  // The fixture models a provider email, one-use authorization code and S256
  // verifier check. The real browser SDK must exchange its own stored verifier;
  // the browser test no longer directly confirms SQL rows or signs in manually.
  const signupEmail = 'new-owner@commerce.example.test'
  await page.goto(`${base}/commerce/auth?mode=signup&next=/commerce/apply`)
  await page.getByRole('heading', { name: 'Create your owner account', exact: true }).waitFor()
  await snapshot('owner-registration')
  await page.getByLabel('Your name', { exact: true }).fill('Nila New Owner')
  await page.getByLabel('Email address', { exact: true }).fill(signupEmail)
  await page.getByLabel('Password', { exact: true }).fill(LOCAL_PASSWORD)
  await page.getByRole('button', { name: /^Create owner account/ }).click()
  await page.getByRole('status').filter({ hasText: 'Check your email for a verification link.' }).waitFor()
  await snapshot('owner-registration-verification-pending')
  const signupOwner = [...fixture.users.values()].find(user => user.email === signupEmail)
  assert.ok(signupOwner && !signupOwner.email_confirmed_at)
  await api('/api/commerce/applications', { user: signupOwner, expected: 403 })
  const ownerVerification = emailLink(signupEmail, 'signup', 'owner')
  const unsafeOwnerReturn = new URL(ownerVerification)
  unsafeOwnerReturn.searchParams.set('next', 'https://outside.example.test')
  await callbackFailure(unsafeOwnerReturn.href)
  assert.equal(await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner')), initialOwner, 'An unsafe callback consumed the existing owner session or PKCE code.')
  const wrongOwnerScope = new URL(ownerVerification)
  wrongOwnerScope.searchParams.set('audience', 'customer')
  wrongOwnerScope.searchParams.set('store', 'qa-grocery-store')
  await callbackFailure(wrongOwnerScope.href, 'commerce-callback-wrong-scope')
  assert.equal(await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner')), initialOwner, 'A wrong-scope callback consumed the owner session or verifier.')
  assert.deepEqual(await storedScopes(separateKeys), separateSessions)
  await page.goto(ownerVerification)
  await page.waitForURL(`${base}/commerce/apply`)
  await page.getByLabel('Owner name', { exact: true }).waitFor()
  assert.ok(signupOwner.email_confirmed_at, 'The authorization-code exchange did not confirm the signup.')
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('digital-dine-commerce:owner')).user.id), signupOwner.id)
  assert.deepEqual(await storedScopes(separateKeys), separateSessions, 'Owner confirmation overwrote another authentication scope.')
  await callbackFailure(ownerVerification, 'commerce-callback-replayed')
  await page.goto(`${base}/commerce/apply`)
  await page.getByLabel('Owner name', { exact: true }).fill('Nila New Owner')
  await page.getByLabel('Business / store name', { exact: true }).fill('Nila Sarees Application')
  await page.getByLabel(/^Business category/).selectOption('sarees')
  await page.getByLabel('Mobile number', { exact: true }).fill('9000000008')
  await page.locator('input[name="preferred_slug"]').fill('nila-sarees-application')
  await page.getByLabel('Business address', { exact: true }).fill('Development-only application address')
  await page.getByLabel('Describe your business', { exact: true }).fill('A simulated owner applying for a saree storefront in the isolated test environment.')
  await page.getByLabel(/^Product categories/).fill('Silk Sarees, Cotton Sarees')
  await snapshot('owner-onboarding-form')
  await page.getByRole('button', { name: /^Submit application/ }).click()
  await page.getByRole('heading', { name: 'Thank you, Nila New Owner.', exact: true }).waitFor()
  await snapshot('owner-onboarding-submitted')
  const signupApplication = (await api('/api/commerce/applications', { user: signupOwner })).applications.find(application => application.business_name === 'Nila Sarees Application')
  assert.equal(signupApplication.status, 'submitted')

  async function requestOwnerRecovery(email) {
    await page.goto(`${base}/commerce/auth`)
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click()
    await page.getByLabel('Email address', { exact: true }).fill(email)
    await page.getByRole('button', { name: /^Send recovery link/ }).click()
    await page.getByRole('status').filter({ hasText: 'If an account exists for this address' }).waitFor()
  }
  await requestOwnerRecovery(signupEmail)
  const expiredOwnerRecovery = emailLink(signupEmail, 'recovery', 'owner')
  fixture.expireEmailLink(expiredOwnerRecovery)
  const ownerBeforeExpired = await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner'))
  await callbackFailure(expiredOwnerRecovery, 'commerce-callback-expired')
  assert.equal(await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner')), ownerBeforeExpired, 'An expired callback cleared a valid owner session.')
  await requestOwnerRecovery(signupEmail)
  const ownerRecovery = emailLink(signupEmail, 'recovery', 'owner')
  await page.goto(ownerRecovery)
  await page.waitForURL(`${base}/commerce/auth?recovery=1`)
  await page.getByRole('heading', { name: 'Choose a new password', exact: true }).waitFor()
  await snapshot('owner-password-recovery-update')
  const recoveredOwnerPassword = 'new-owner-recovered-password'
  await page.getByLabel('New password', { exact: true }).fill(recoveredOwnerPassword)
  await page.getByRole('button', { name: /^Update password/ }).click()
  await page.getByRole('status').filter({ hasText: 'Your password has been updated.' }).waitFor()
  assert.equal(await passwordStatus(signupEmail, LOCAL_PASSWORD), 400, 'The old owner password still signs in after recovery.')
  assert.equal(await passwordStatus(signupEmail, recoveredOwnerPassword), 200)
  const ownerBeforeReplay = await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner'))
  await callbackFailure(ownerRecovery)
  assert.equal(await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner')), ownerBeforeReplay, 'A replayed recovery link changed the valid owner session.')
  assert.deepEqual(await storedScopes(separateKeys), separateSessions)
  const beforeUnknownRecovery = fixture.users.size
  await requestOwnerRecovery('unregistered-owner@commerce.example.test')
  assert.equal(fixture.getEmailLink('unregistered-owner@commerce.example.test', 'recovery'), null)
  assert.equal(fixture.users.size, beforeUnknownRecovery, 'A generic recovery request created an account.')

  await page.goto(`${base}/admin/dashboard`)
  await page.getByRole('button', { name: 'E-Commerce Website Management', exact: true }).click()
  await page.getByRole('heading', { name: 'E-Commerce Website Management', exact: true }).waitFor()
  await page.getByText('Saree Store', { exact: true }).first().waitFor()
  await snapshot('admin-client-websites')
  await page.getByRole('tab', { name: 'Owner applications', exact: true }).click()
  const rejectedApplication = page.locator('.ac-application').filter({ has: page.getByRole('heading', { name: 'Nila Sarees Application', exact: true }) })
  await rejectedApplication.getByLabel('Review note for Nila Sarees Application', { exact: true }).fill('Development-only rejection workflow test.')
  await rejectedApplication.getByRole('button', { name: 'Reject application', exact: true }).click()
  await rejectedApplication.locator('.ac-status-rejected').waitFor()
  await snapshot('admin-application-rejection')
  assert.equal((await api('/api/commerce/applications', { user: signupOwner })).applications.find(application => application.id === signupApplication.id).status, 'rejected')
  assert.deepEqual((await api('/api/commerce/workspace', { user: signupOwner })).websites, [])
  await api(`/api/commerce/workspace/${storeA.id}`, { user: signupOwner, expected: 403 })

  await signInOwner(page, ownerA.email)
  await page.getByRole('heading', { name: 'Saree Store', exact: true }).waitFor()
  await snapshot('owner-workspace')
  const ownerNavigation = page.getByRole('navigation', { name: 'Owner workspace sections' })
  await ownerNavigation.getByRole('button', { name: 'Products', exact: true }).click()
  await page.getByRole('button', { name: 'Add product', exact: true }).click()
  await page.getByLabel('Product name', { exact: true }).fill('QA Draft Item')
  await page.getByLabel('Product slug', { exact: true }).fill('qa-draft-item')
  await page.getByLabel('Price (₹)', { exact: true }).fill('49.95')
  await page.getByLabel('Published in your catalog', { exact: true }).uncheck()
  const developmentPhoto = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640; canvas.height = 800
    const drawing = canvas.getContext('2d')
    drawing.fillStyle = '#e6d6c3'; drawing.fillRect(0, 0, 640, 800)
    drawing.fillStyle = '#7b3150'; drawing.fillRect(80, 60, 480, 680)
    drawing.strokeStyle = '#d8b980'; drawing.lineWidth = 5
    for (let position = 105; position < 550; position += 35) { drawing.beginPath(); drawing.moveTo(position, 60); drawing.lineTo(position, 740); drawing.stroke() }
    drawing.fillStyle = '#fffaf0'; drawing.fillRect(105, 615, 430, 88)
    drawing.fillStyle = '#362831'; drawing.font = 'bold 25px sans-serif'; drawing.fillText('DEVELOPMENT PHOTO', 121, 651)
    drawing.font = '18px sans-serif'; drawing.fillText('Synthetic tenant-upload fixture', 121, 681)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.getByLabel('Product image', { exact: true }).setInputFiles({ name: 'local-test.png', mimeType: 'image/png', buffer: Buffer.from(developmentPhoto, 'base64') })
  await page.getByRole('img', { name: 'Product image preview', exact: true }).waitFor()
  await snapshot('owner-product-form')
  await page.getByRole('button', { name: 'Save product', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'QA Draft Item' }).waitFor()
  await snapshot('owner-products')
  const draft = (await api(`/api/commerce/workspace/${storeA.id}`, { user: ownerA })).products.find(item => item.name === 'QA Draft Item')
  assert.equal(draft.price_paise, 4995)
  assert.ok(draft.image_url.startsWith('http://127.0.0.1:4319/storage/v1/object/public/commerce-media/'))
  await ownerNavigation.getByRole('button', { name: 'Inventory', exact: true }).click()
  await page.locator('select[name="product_id"]').selectOption(draft.id)
  await page.getByLabel('Quantity change', { exact: true }).fill('4')
  await page.getByLabel('Reason', { exact: true }).fill('Browser development stock check.')
  await page.getByRole('button', { name: 'Update inventory', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'QA Draft Item' }).getByRole('cell', { name: '4', exact: true }).waitFor()
  await snapshot('owner-inventory')
  await ownerNavigation.getByRole('button', { name: 'Products', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'QA Draft Item' }).getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Price (₹)', { exact: true }).fill('59.95')
  await page.getByLabel('Description', { exact: true }).fill('Edited through the isolated owner product form.')
  await page.getByLabel(/^Category/).selectOption(productA.category_id)
  await page.getByLabel('Published in your catalog', { exact: true }).check()
  await page.getByRole('button', { name: 'Save product', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'QA Draft Item' }).getByText('active', { exact: true }).waitFor()
  const edited = (await api(`/api/commerce/workspace/${storeA.id}`, { user: ownerA })).products.find(item => item.id === draft.id)
  assert.equal(edited.price_paise, 5995)
  assert.equal(edited.stock_quantity, 4, 'Editing a product must not overwrite separately adjusted stock.')
  assert.equal(edited.image_url, draft.image_url)
  assert.ok((await api('/api/commerce/catalog/qa-saree-store')).products.some(item => item.id === draft.id))
  await snapshot('owner-product-edited')
  await page.getByRole('row').filter({ hasText: 'QA Draft Item' }).getByRole('button', { name: 'Archive', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'QA Draft Item' }).getByText('archived', { exact: true }).waitFor()
  assert.equal((await api(`/api/commerce/workspace/${storeA.id}`, { user: ownerA })).products.find(item => item.id === draft.id).active, false)
  assert.equal((await api('/api/commerce/catalog/qa-saree-store')).products.some(item => item.id === draft.id), false)
  await snapshot('owner-product-archived')

  const groceryBefore = (await api('/api/commerce/admin', { admin: true })).websites.find(website => website.id === storeB.id)
  const adminTab = await context.newPage()
  adminTab.on('pageerror', error => errors.push(error.message))
  await adminTab.goto(`${base}/admin/dashboard`)
  await adminTab.getByRole('button', { name: 'E-Commerce Website Management', exact: true }).click()
  await adminTab.locator('.ac-website').filter({ has: adminTab.getByRole('heading', { name: 'Saree Store', exact: true }) }).getByRole('button', { name: 'Manage website', exact: true }).click()
  await adminTab.getByLabel('Primary color', { exact: true }).fill('#7b3150')
  await adminTab.getByLabel('Banner URL', { exact: true }).fill(draft.image_url)
  await adminTab.getByLabel('Inventory controls', { exact: true }).uncheck()
  await adminTab.getByRole('button', { name: 'Save website configuration', exact: true }).click()
  await adminTab.getByRole('status').filter({ hasText: 'Website configuration saved' }).waitFor()
  const configured = await api('/api/commerce/catalog/qa-saree-store')
  assert.equal(configured.website.branding.primary_color, '#7b3150')
  assert.equal(configured.website.branding.banner_url, draft.image_url)
  assert.equal(configured.website.features.inventory, false)
  assert.deepEqual((await api('/api/commerce/admin', { admin: true })).websites.find(website => website.id === storeB.id), groceryBefore, 'Saree configuration changed the grocery website.')
  await snapshot('admin-website-configuration', adminTab)
  // Restore tracked inventory for checkout tests and the monogram hero for a
  // readable fixture screenshot; the banner URL save was asserted above.
  await adminTab.getByLabel('Inventory controls', { exact: true }).check()
  await adminTab.getByLabel('Banner URL', { exact: true }).fill('')
  await adminTab.getByRole('button', { name: 'Save website configuration', exact: true }).click()
  await adminTab.getByRole('status').filter({ hasText: 'Website configuration saved' }).waitFor()
  assert.equal((await api('/api/commerce/catalog/qa-saree-store')).website.features.inventory, true)
  await adminTab.close()
  const preserved = await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner'))
  assert.ok(preserved, 'Owner session was not stored independently.')

  const customerProtectedKeys = ['digital-dine-commerce:owner', ...separateKeys]
  const beforeCustomerCallbacks = await storedScopes(customerProtectedKeys)
  const signupCustomerEmail = 'pkce-customer@commerce.example.test'
  await page.goto(`${base}/shops/qa-saree-store/account`)
  await page.getByRole('button', { name: 'Create account', exact: true }).first().click()
  await page.getByLabel('Your name', { exact: true }).fill('PKCE Customer')
  await page.getByLabel('Email address', { exact: true }).fill(signupCustomerEmail)
  await page.getByLabel(/^Password/).fill(LOCAL_PASSWORD)
  await page.locator('form').getByRole('button', { name: 'Create account', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Check your email to verify your account.' }).waitFor()
  const originalCustomerVerification = emailLink(signupCustomerEmail, 'signup', 'customer', 'qa-saree-store')
  await page.getByRole('button', { name: 'Resend verification email', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'A verification email has been requested.' }).waitFor()
  const customerVerification = emailLink(signupCustomerEmail, 'signup', 'customer', 'qa-saree-store')
  assert.notEqual(customerVerification, originalCustomerVerification, 'Resend did not issue a new PKCE email link.')
  const wrongStore = new URL(customerVerification)
  wrongStore.searchParams.set('store', 'qa-grocery-store')
  await callbackFailure(wrongStore.href)
  assert.deepEqual(await storedScopes(customerProtectedKeys), beforeCustomerCallbacks, 'A wrong-store callback changed another stored session.')
  await page.goto(customerVerification)
  await page.waitForURL(`${base}/shops/qa-saree-store/account`)
  await page.getByText(signupCustomerEmail, { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('digital-dine-commerce:customer:qa-saree-store')).user.email), signupCustomerEmail)
  assert.deepEqual(await storedScopes(customerProtectedKeys), beforeCustomerCallbacks)
  await snapshot('customer-email-confirmed')
  const customerBeforeExpired = await page.evaluate(() => localStorage.getItem('digital-dine-commerce:customer:qa-saree-store'))
  await callbackFailure(originalCustomerVerification)
  assert.equal(await page.evaluate(() => localStorage.getItem('digital-dine-commerce:customer:qa-saree-store')), customerBeforeExpired, 'An expired customer link changed the valid customer session.')
  await page.goto(`${base}/shops/qa-saree-store/account`)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('button', { name: 'Forgot your password?', exact: true }).click()
  const beforeUnknownCustomerRecovery = fixture.users.size
  await page.getByLabel('Email address', { exact: true }).fill('unregistered-customer@commerce.example.test')
  await page.getByRole('button', { name: 'Send recovery link', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'If this email has an account' }).waitFor()
  assert.equal(fixture.getEmailLink('unregistered-customer@commerce.example.test', 'recovery'), null)
  assert.equal(fixture.users.size, beforeUnknownCustomerRecovery)
  await page.getByLabel('Email address', { exact: true }).fill(signupCustomerEmail)
  await page.getByRole('button', { name: 'Send recovery link', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'If this email has an account' }).waitFor()
  const customerRecovery = emailLink(signupCustomerEmail, 'recovery', 'customer', 'qa-saree-store')
  await page.goto(customerRecovery)
  await page.waitForURL(`${base}/shops/qa-saree-store/account?recovery=1`)
  await page.getByRole('heading', { name: 'Choose a new password', exact: true }).waitFor()
  await snapshot('customer-password-recovery-update')
  const recoveredCustomerPassword = 'customer-recovered-password'
  await page.getByLabel(/^New password/).fill(recoveredCustomerPassword)
  await page.getByRole('button', { name: 'Update password', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Your password has been updated.' }).waitFor()
  assert.equal(await passwordStatus(signupCustomerEmail, LOCAL_PASSWORD), 400)
  assert.equal(await passwordStatus(signupCustomerEmail, recoveredCustomerPassword), 200)
  assert.deepEqual(await storedScopes(customerProtectedKeys), beforeCustomerCallbacks, 'Customer recovery changed owner, legacy or another storefront session.')
  const customerBeforeReplay = await page.evaluate(() => localStorage.getItem('digital-dine-commerce:customer:qa-saree-store'))
  await callbackFailure(customerRecovery)
  assert.equal(await page.evaluate(() => localStorage.getItem('digital-dine-commerce:customer:qa-saree-store')), customerBeforeReplay, 'A replayed customer recovery link changed the valid session.')
  await page.goto(`${base}/shops/qa-saree-store/account`)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  // A click does not await the async SDK logout. Let its storage cleanup finish
  // before seeding the next isolated actor, or it can delete that new session.
  await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor()
  await page.waitForFunction(() => localStorage.getItem('digital-dine-commerce:customer:qa-saree-store') === null)
  assert.deepEqual(await storedScopes(customerProtectedKeys), beforeCustomerCallbacks)

  const buyerSession = fixture.session(fixture.users.get(buyerA.id))
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: 'digital-dine-commerce:customer:qa-saree-store', value: JSON.stringify(buyerSession) })
  await page.goto(`${base}/shops/qa-saree-store`)
  await page.getByRole('heading', { name: 'Saree Store, made for you.' }).waitFor()
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('digital-dine-commerce:customer:qa-saree-store') || 'null')?.user?.id), buyerA.id, 'The previous logout removed the newly seeded customer session.')
  await storefrontIncrementChecks(draft.image_url)
  await storefrontLabMeasurements()
  await snapshot('saree-homepage')
  await snapshot('saree-product-listing')
  await page.getByRole('searchbox', { name: 'Search products' }).fill('no development match')
  await page.getByRole('heading', { name: 'No products match your search.' }).waitFor()
  await page.getByRole('group', { name: 'Refine the collection' }).getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.getByRole('button', { name: 'Sarees', exact: true }).click()
  await page.getByRole('button', { name: 'View Silk Saree', exact: true }).click()
  await page.getByRole('heading', { name: 'Silk Saree', exact: true }).waitFor()
  await snapshot('product-details')
  await page.getByRole('button', { name: 'Close product details', exact: true }).click()
  await page.getByRole('button', { name: 'Add Silk Saree to bag', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Open shopping bag, 1 items', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('digital-dine-commerce:customer:qa-saree-store') || 'null')?.user?.id), buyerA.id, 'Cart persistence reload lost the customer session.')
  await page.getByRole('button', { name: /Open shopping bag/ }).click()
  const cartDialog = page.locator('.cs-cart-dialog[open]')
  assert.equal(await page.getByRole('navigation', { name: 'Checkout steps', exact: true }).getByRole('button').count(), 3)
  assert.equal(await page.getByLabel('Your name', { exact: true }).getAttribute('autocomplete'), 'name')
  assert.equal(await page.getByLabel('Phone number', { exact: true }).getAttribute('autocomplete'), 'tel')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await snapshotWidths('editorial-bag-selection')
  await page.getByRole('button', { name: /^Continue to checkout/ }).click()
  assert.equal(await page.locator('.cs-checkout-step').filter({ has: page.getByRole('heading', { name: 'Make it yours', exact: true }) }).evaluate(element => document.activeElement === element), true)
  await snapshotWidths('editorial-bag-fulfilment')
  await page.getByRole('button', { name: /^Review order/ }).click()
  assert.equal(await page.locator('.cs-review').evaluate(element => document.activeElement === element), true)
  await snapshotWidths('editorial-bag-review')
  await page.getByRole('navigation', { name: 'Checkout steps' }).getByRole('button', { name: /Your bag/ }).click()
  await page.getByRole('button', { name: 'Close shopping bag', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await focusRemainsIn('.cs-cart-dialog')
  await page.keyboard.press('Tab')
  await focusRemainsIn('.cs-cart-dialog')
  await page.keyboard.press('Escape')
  await cartDialog.waitFor({ state: 'hidden' })
  assert.equal(await page.getByRole('button', { name: /Open shopping bag/ }).evaluate(element => document.activeElement === element), true, 'Closing the bag did not return focus to its trigger.')
  await page.getByRole('button', { name: /Open shopping bag/ }).click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Add one Silk Saree', exact: true }).click()
  assert.equal(await page.locator('.cs-quantity span').textContent(), '2')
  await page.getByRole('button', { name: 'Remove one Silk Saree', exact: true }).click()
  assert.equal(await page.locator('.cs-quantity span').textContent(), '1')
  for (let index = 0; index < 4; index++) await page.getByRole('button', { name: 'Add one Silk Saree', exact: true }).click()
  assert.equal(await page.locator('.cs-quantity span').textContent(), '5')
  assert.equal(await page.getByRole('button', { name: 'Add one Silk Saree', exact: true }).isDisabled(), true, 'Bag quantity exceeded tracked stock.')
  await page.getByRole('button', { name: 'Remove Silk Saree from bag', exact: true }).click()
  await page.getByRole('heading', { name: 'Your bag is waiting.', exact: true }).waitFor()
  await snapshot('cart-empty-after-removal')
  await page.getByRole('button', { name: 'Continue browsing', exact: true }).click()
  await page.getByRole('button', { name: 'Add Silk Saree to bag', exact: true }).click()
  await page.getByRole('button', { name: /Open shopping bag/ }).click()
  await snapshot('cart')
  await page.getByLabel('Your name', { exact: true }).fill(buyerA.name)
  await page.getByLabel('Phone number', { exact: true }).fill('9000000001')
  await snapshot('checkout')
  await page.setViewportSize({ width: 375, height: 812 })
  const checkoutPattern = `**/api/commerce/checkout/${storeA.id}`
  const attempts = []
  const loseConfirmation = async route => {
    try {
      attempts.push(route.request().postDataJSON())
      const committed = await route.fetch()
      assert.equal(committed.status(), 201)
      // The transaction commits, but a simulated gateway loses its successful
      // response. Retry safety must not depend on receiving that confirmation.
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Development gateway lost the order confirmation. Please retry.' }) })
    } catch (error) { errors.push(`Confirmation-loss simulation: ${error.message}`) }
  }
  await page.route(checkoutPattern, loseConfirmation)
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await page.locator('.cs-checkout [role="alert"]').waitFor()
  await page.unroute(checkoutPattern, loseConfirmation)
  await page.route(checkoutPattern, async route => { attempts.push(route.request().postDataJSON()); await route.continue() })
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await page.getByRole('heading', { name: 'Your order is confirmed.' }).waitFor()
  assert.equal(attempts.length, 2)
  assert.equal(attempts[0].idempotency_key, attempts[1].idempotency_key, 'A disconnected response must retain its checkout UUID.')
  await snapshot('order-confirmation')
  await page.unroute(checkoutPattern)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${base}/shops/qa-saree-store`)
  await page.getByRole('button', { name: 'Add Silk Saree to bag', exact: true }).click()
  await page.getByRole('button', { name: /Open shopping bag/ }).click()
  await page.getByLabel('Your name', { exact: true }).fill(buyerA.name)
  await page.getByLabel('Phone number', { exact: true }).fill('9000000001')
  await page.route(checkoutPattern, loseConfirmation)
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await page.locator('.cs-checkout [role="alert"]').waitFor()
  await page.unroute(checkoutPattern, loseConfirmation)
  await page.getByLabel('Phone number', { exact: true }).fill('9000000002')
  await page.route(checkoutPattern, async route => { attempts.push(route.request().postDataJSON()); await route.continue() })
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await page.getByRole('heading', { name: 'Your order is confirmed.' }).waitFor()
  assert.equal(attempts.length, 4)
  assert.equal(attempts[2].idempotency_key, attempts[3].idempotency_key, 'A changed retry must retain its checkout UUID for safe reconciliation.')
  await page.unroute(checkoutPattern)
  assert.equal((await api(`/api/commerce/customer/orders?website_id=${storeA.id}`, { user: buyerA })).orders.length, 3, 'Disconnected and changed retries created a duplicate order.')
  const confirmedOrderId = await page.locator('.cs-order-confirmed p strong').textContent()
  const ownerTab = await context.newPage()
  ownerTab.on('pageerror', error => errors.push(error.message))
  await ownerTab.goto(`${base}/commerce/dashboard`)
  await ownerTab.getByRole('heading', { name: 'Saree Store', exact: true }).waitFor()
  await ownerTab.getByRole('navigation', { name: 'Owner workspace sections' }).getByRole('button', { name: 'Orders', exact: true }).click()
  const receivedOrder = ownerTab.locator('.co-order').filter({ hasText: `Order ${confirmedOrderId.slice(0, 8).toUpperCase()}` })
  await receivedOrder.getByText(buyerA.name, { exact: true }).waitFor()
  await receivedOrder.getByText('1 × Silk Saree', { exact: false }).waitFor()
  await receivedOrder.locator('select[name="status"]').selectOption('confirmed')
  await receivedOrder.getByRole('button', { name: 'Update order', exact: true }).click()
  await receivedOrder.locator('.co-badge-confirmed').waitFor()
  await snapshot('owner-order-management', ownerTab)
  assert.equal((await api(`/api/commerce/workspace/${storeB.id}`, { user: ownerB })).orders.some(order => order.id === confirmedOrderId), false, 'The grocery owner received the saree order.')
  await ownerTab.close()
  await page.getByRole('link', { name: 'View order history', exact: true }).click()
  await page.getByRole('heading', { name: 'Order history', exact: true }).waitFor()
  await page.getByText('Silk Saree', { exact: false }).first().waitFor()
  await page.locator('.cs-history-order').filter({ hasText: confirmedOrderId }).getByText(/^confirmed$/i).waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner')), preserved, 'Customer sign-in overwrote the owner session.')
  await snapshot('customer-account')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Order history', exact: true }).count(), 0)
  assert.equal(await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner')), preserved, 'Customer local sign-out cleared the owner session.')
  await page.getByLabel('Email address', { exact: true }).fill(buyerB.email)
  await page.getByLabel('Password', { exact: true }).fill(LOCAL_PASSWORD)
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('heading', { name: 'No orders yet.', exact: true }).waitFor()
  assert.equal(await page.getByText('Silk Saree', { exact: false }).count(), 0, 'Another customer saw the first customer\'s order history.')
  await page.goto(`${base}/shops/qa-saree-store`)
  await snapshot('storefront')
  await page.getByRole('button', { name: 'Add Silk Saree to bag', exact: true }).click()
  await page.getByRole('button', { name: /Open shopping bag/ }).click()
  await page.getByText(`Signed in as ${buyerB.email}`, { exact: true }).waitFor()
  await page.getByLabel('Your name', { exact: true }).fill('Private previous customer')
  await page.getByLabel('Phone number', { exact: true }).fill('9000000099')
  const accountTab = await context.newPage()
  accountTab.on('pageerror', error => errors.push(error.message))
  await accountTab.goto(`${base}/shops/qa-saree-store/account`)
  await accountTab.getByRole('button', { name: 'Sign out', exact: true }).click()
  await accountTab.getByLabel('Email address', { exact: true }).fill(buyerA.email)
  await accountTab.getByLabel('Password', { exact: true }).fill(LOCAL_PASSWORD)
  await accountTab.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByText(`Signed in as ${buyerA.email}`, { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Your name', { exact: true }).inputValue(), '', 'An account switch retained the previous checkout name.')
  assert.equal(await page.getByLabel('Phone number', { exact: true }).inputValue(), '', 'An account switch retained the previous checkout phone.')
  await accountTab.close()
  await page.getByRole('button', { name: 'Close shopping bag', exact: true }).click()
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: 'digital-dine-commerce:customer:qa-grocery-store', value: JSON.stringify(fixture.session(fixture.users.get(buyerB.id))) })
  await page.goto(`${base}/shops/qa-grocery-store`)
  await page.getByRole('heading', { name: 'Grocery Store, made for you.', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Fresh Produce', exact: true }).waitFor()
  const groceryAvailability = page.getByLabel(/^Availability/)
  await groceryAvailability.selectOption('in-stock')
  await page.getByLabel('Minimum price (₹)', { exact: true }).fill('99.00')
  await page.getByLabel('Maximum price (₹)', { exact: true }).fill('99.00')
  assert.deepEqual(await page.locator('.cs-product-name').allTextContents(), ['Grocery Basket'], 'Untracked zero stock was incorrectly unavailable.')
  assert.equal(await groceryAvailability.locator('option[value="sold-out"]').count(), 0)
  assert.match(await page.locator('.cs-results').textContent(), /Showing 1 of 1 product/)
  await page.getByRole('group', { name: 'Refine the collection' }).getByRole('button', { name: 'Clear filters', exact: true }).click()
  await snapshot('grocery-homepage')
  await page.getByRole('button', { name: 'View Grocery Basket', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'View Silk Saree', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Add Grocery Basket to bag', exact: true }).click()
  await page.getByRole('button', { name: 'Open shopping bag, 1 items', exact: true }).waitFor()
  assert.equal(await page.getByText('Sold out', { exact: true }).count(), 0, 'Untracked inventory should allow ordering at zero stored stock.')
  await snapshot('second-storefront')
  await page.getByRole('button', { name: /Open shopping bag/ }).click()
  await snapshot('grocery-cart')
  await page.getByLabel('Your name', { exact: true }).fill(buyerB.name)
  await page.getByLabel('Phone number', { exact: true }).fill('9000000002')
  await page.getByLabel(/^How would you like your order/).selectOption('delivery')
  await page.getByLabel('Delivery address', { exact: true }).fill('Development-only grocery delivery address')
  // A controlled textarea can contribute its value to label text in the
  // browser locator model. Select the same named control after filling it.
  const deliveryAddress = page.locator('.cs-checkout textarea[name="deliveryAddress"]')
  assert.equal(await deliveryAddress.inputValue(), 'Development-only grocery delivery address')
  assert.equal(await deliveryAddress.getAttribute('autocomplete'), 'street-address')
  await page.locator('.cs-totals > p').filter({ hasText: 'Delivery' }).getByText('₹50.00', { exact: true }).waitFor()
  await page.locator('.cs-totals .cs-total').getByText('₹149.00', { exact: true }).waitFor()
  await snapshot('grocery-checkout')
  await page.getByRole('button', { name: 'Place order', exact: true }).click()
  await page.getByRole('heading', { name: 'Your order is confirmed.', exact: true }).waitFor()
  const groceryOrderId = await page.locator('.cs-order-confirmed p strong').textContent()
  const groceryOrder = (await api(`/api/commerce/workspace/${storeB.id}`, { user: ownerB })).orders.find(order => order.id === groceryOrderId)
  assert.equal(groceryOrder.total_paise, 14900, 'Grocery delivery total must include the server-configured delivery fee.')
  assert.equal(groceryOrder.customer_user_id, buyerB.id)
  assert.equal((await api(`/api/commerce/workspace/${storeA.id}`, { user: ownerA })).orders.some(order => order.id === groceryOrderId), false)
  await snapshot('grocery-order-confirmation')
  const groceryOwnerTab = await context.newPage()
  groceryOwnerTab.on('pageerror', error => errors.push(error.message))
  await signInOwner(groceryOwnerTab, ownerB.email)
  await groceryOwnerTab.getByRole('heading', { name: 'Grocery Store', exact: true }).waitFor()
  await groceryOwnerTab.getByRole('navigation', { name: 'Owner workspace sections' }).getByRole('button', { name: 'Orders', exact: true }).click()
  const groceryReceived = groceryOwnerTab.locator('.co-order').filter({ hasText: `Order ${groceryOrderId.slice(0, 8).toUpperCase()}` })
  await groceryReceived.getByText(buyerB.name, { exact: true }).waitFor()
  await groceryReceived.locator('select[name="status"]').selectOption('confirmed')
  await groceryReceived.getByRole('button', { name: 'Update order', exact: true }).click()
  await groceryReceived.locator('.co-badge-confirmed').waitFor()
  await snapshot('grocery-owner-order-management', groceryOwnerTab)
  await groceryOwnerTab.close()
  await page.getByRole('link', { name: 'View order history', exact: true }).click()
  await page.locator('.cs-history-order').filter({ hasText: groceryOrderId }).getByText(/^confirmed$/i).waitFor()
  await snapshot('grocery-customer-history')
  await snapshotWidths('editorial-customer-history')
  assert.deepEqual(errors, [], `Browser page errors: ${errors.join('; ')}`)
  await writeFile(path.join(artifacts, 'storefront-increment-checks.json'), JSON.stringify({
    result: 'PASS', widths: storefrontWidths, checkpoints: storefrontCheckpoints,
    contrastSamples,
    nativeBrowserChromeVisits,
    scope: 'Actual isolated Next.js shopper UI using synthetic tenant data and a labelled development upload',
    filterCompositionAndPaiseBounds: true, missingAndSingleImageFallback: true, brokenImageFallback: true,
    nestedZoomKeyboardFocusAndEscape: true, reducedMotionChecked: true,
    bagStepsAndAutofill: true, stockAwareQuantitiesAndRemove: true,
    untrackedInventoryAvailable: true, actualServerFeeAndCODRetryRetained: true,
    realHostedAuthTested: false, productionWrites: false, field75thPercentileMeasured: false,
  }, null, 2) + '\n')
  console.log(`PASS: owner/customer PKCE email confirmation and recovery via the real SDK with a simulated provider, resend, password replacement, expired/replayed/wrong-scope callback rejection, legacy/owner/store session isolation, browser onboarding/admin rejection, admin branding/features isolation, product create/edit/archive/media/inventory, Saree Store and Grocery Store general-template storefronts, cart quantity/removal/persistence, both COD checkout/confirmation/owner receipt/status/history flows, lost/changed retry reconciliation, account privacy/isolation and desktop/mobile layouts. External requests blocked: ${[...blocked].join(', ') || 'none'}.`)
}

try {
  await command('node', ['scripts/test-commerce-db.mjs'], 'database.log', { env: { ...env, COMMERCE_TEST_DATABASE_URL: databaseUrl } })
  fixture = await createCommerceFixture({ databaseUrl })
  if (process.env.COMMERCE_BROWSER_SKIP_BUILD !== '1') {
    await command('npm', ['run', 'build'], 'build.log')
    console.log('PASS: npm run build with synthetic development credentials.')
  }
  const log = await open(path.join(artifacts, 'next.log'), 'w')
  server = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', '4320'], { cwd: root, env, detached: true, stdio: ['ignore', log.fd, log.fd] })
  await log.close()
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Next.js exited before readiness; inspect next.log.')
    try { if ((await fetch(base + '/commerce')).status === 200) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  assert.ok(ready, 'Next.js readiness timeout.')
  await httpChecks()
  try { await browserChecks() }
  catch (error) {
    const page = browser?.contexts()[0]?.pages()[0]
    if (page) await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => {})
    throw error
  }
  console.log(`All commerce browser/API integration checks passed. Screenshots and logs: ${artifacts}`)
} finally {
  if (browser) await browser.close()
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM') } catch {} }
  if (fixture) await fixture.close()
}
