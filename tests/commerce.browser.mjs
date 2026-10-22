import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
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

async function createWebsite(owner, slug, name, applicationId) {
  return (await api('/api/commerce/admin', { admin: true, method: 'POST', body: {
    action: 'create_website', payload: {
      name, slug, business_type: 'general', template: 'general', status: 'setup',
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
    owner_name: ownerA.name, business_name: 'QA Atelier', business_type: 'general', phone: '9000000000', address: 'Development test address', preferred_slug: 'qa-atelier', description: 'A local development application.', required_features: ['catalog', 'cod'], product_categories: ['Everyday'], fulfillment: { pickup: true, delivery: true }, branding_preferences: 'Forest green', payment_requirements: 'COD only',
  } })).application
  assert.equal(application.applicant_user_id, ownerA.id)
  assert.equal(application.email, ownerA.email)
  for (const status of ['under_review', 'approved']) await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'review_application', payload: { application_id: application.id, status, review_note: 'Development fixture review.' } } })
  storeA = await createWebsite(ownerA, 'qa-atelier', 'QA Atelier', application.id)
  storeB = await createWebsite(ownerB, 'qa-market', 'QA Market')
  assert.ok(storeA.id && storeB.id)
  await api(`/api/commerce/workspace/${storeA.id}`, { user: ownerB, expected: 403 })

  const ownerAction = (website, owner, action, payload, expected = 200) => api(`/api/commerce/workspace/${website.id}`, { user: owner, method: 'POST', body: { action, payload }, expected })
  const category = (await ownerAction(storeA, ownerA, 'save_category', { name: 'Everyday', slug: 'everyday', active: true })).result
  productA = (await ownerAction(storeA, ownerA, 'save_product', { category_id: category.id, name: 'Everyday Canvas Bag', slug: 'canvas-bag', description: 'A development-only sample for checkout validation.', price_paise: 129900, image_url: '', attributes: { fabric: 'Cotton', color: 'Natural' }, active: true })).result
  await ownerAction(storeA, ownerA, 'adjust_stock', { product_id: productA.id, delta: 5, reason: 'Development fixture stock.' })
  const productB = (await ownerAction(storeB, ownerB, 'save_product', { name: 'Market Basket', slug: 'market-basket', description: 'Another isolated tenant product.', price_paise: 9900, image_url: '', attributes: {}, active: true })).result
  await ownerAction(storeB, ownerB, 'adjust_stock', { product_id: productB.id, delta: 3, reason: 'Development fixture stock.' })
  await ownerAction(storeA, ownerB, 'adjust_stock', { product_id: productA.id, delta: 5 }, 403)
  for (const website of [storeA, storeB]) await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'save_website', payload: { id: website.id, status: 'active' } } })
  const catalogA = await api('/api/commerce/catalog/qa-atelier')
  const catalogB = await api('/api/commerce/catalog/qa-market')
  assert.deepEqual(catalogA.products.map(row => row.id), [productA.id])
  assert.deepEqual(catalogB.products.map(row => row.id), [productB.id])
  assert.ok(!('owner_permissions' in catalogA.website), 'Public DTO exposed private owner configuration.')

  const checkout = { items: [{ product_id: productA.id, quantity: 2 }], customer: { name: buyerA.name, phone: '9000000001', address: 'Development customer address' }, fulfillment_method: 'pickup', payment_method: 'cod', idempotency_key: randomUUID() }
  const first = await api(`/api/commerce/checkout/${storeA.id}`, { user: buyerA, method: 'POST', expected: 201, body: checkout })
  const replay = await api(`/api/commerce/checkout/${storeA.id}`, { user: buyerA, method: 'POST', expected: 201, body: checkout })
  assert.equal(first.order.id, replay.order.id)
  assert.equal(first.order.total_paise, 259800)
  assert.equal((await api('/api/commerce/catalog/qa-atelier')).products[0].stock_quantity, 3)
  await api(`/api/commerce/checkout/${storeA.id}`, { user: buyerA, method: 'POST', expected: 409, body: { ...checkout, items: [{ product_id: productA.id, quantity: 1 }] } })
  await api(`/api/commerce/checkout/${storeA.id}`, { user: buyerA, method: 'POST', expected: 409, body: { ...checkout, idempotency_key: randomUUID(), items: [{ product_id: productA.id, quantity: 999 }] } })
  await api(`/api/commerce/checkout/${storeA.id}`, { user: buyerA, method: 'POST', expected: 403, body: { ...checkout, idempotency_key: randomUUID(), items: [{ product_id: productB.id, quantity: 1 }] } })
  assert.equal((await api(`/api/commerce/customer/orders?website_id=${storeA.id}`, { user: buyerA })).orders.length, 1)
  assert.equal((await api(`/api/commerce/customer/orders?website_id=${storeA.id}`, { user: buyerB })).orders.length, 0)
  await ownerAction(storeA, ownerA, 'update_order_status', { order_id: first.order.id, status: 'cancelled' })
  await ownerAction(storeA, ownerA, 'update_order_status', { order_id: first.order.id, status: 'cancelled' })
  assert.equal((await api('/api/commerce/catalog/qa-atelier')).products[0].stock_quantity, 5)
  const view = await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'open_management_view', payload: { website_id: storeA.id } } })
  assert.equal(view.website.id, storeA.id)
  const admin = await api('/api/commerce/admin', { admin: true })
  assert.ok(admin.audit_logs.some(row => row.action === 'open_management_view'), 'Admin management view was not audited.')
  await ownerAction(storeB, ownerB, 'adjust_stock', { product_id: productB.id, delta: -3, reason: 'Test untracked inventory.' })
  await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'save_website', payload: { id: storeB.id, features: { catalog: true, inventory: false, cod: true } } } })
  await api(`/api/commerce/checkout/${storeB.id}`, { user: buyerB, method: 'POST', expected: 201, body: { ...checkout, idempotency_key: randomUUID(), items: [{ product_id: productB.id, quantity: 1 }] } })
  assert.equal((await api('/api/commerce/catalog/qa-market')).products[0].stock_quantity, 0, 'Untracked inventory must remain unchanged.')
  await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'save_website', payload: { id: storeB.id, status: 'suspended' } } })
  await api('/api/commerce/catalog/qa-market', { expected: 404 })
  await api('/api/commerce/admin', { admin: true, method: 'POST', body: { action: 'save_website', payload: { id: storeB.id, status: 'active' } } })
  await api('/api/commerce/catalog/unknown-development-store', { expected: 404 })
  fixture.state.unavailable = true
  try { await api('/api/commerce/catalog/qa-atelier', { expected: 503 }) }
  finally { fixture.state.unavailable = false }
  await api('/api/commerce/catalog/qa-atelier')
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
  async function snapshot(name) {
    await page.screenshot({ path: path.join(artifacts, `${name}-desktop.png`), fullPage: true })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({ path: path.join(artifacts, `${name}-mobile.png`), fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} has horizontal mobile overflow.`)
    await page.setViewportSize({ width: 1440, height: 1000 })
  }

  // The app's real HMAC cookie is Secure in production mode. Adapt only the local
  // browser cookie transport; production cookie code is not changed for this test.
  const [name, value] = adminCookie.split('=')
  await context.addCookies([{ name, value, url: base, httpOnly: true, secure: false, sameSite: 'Lax' }])
  await page.goto(`${base}/admin/dashboard`)
  await page.getByRole('button', { name: 'E-Commerce Website Management', exact: true }).click()
  await page.getByRole('heading', { name: 'E-Commerce Website Management', exact: true }).waitFor()
  await page.getByText('QA Atelier', { exact: true }).first().waitFor()
  await snapshot('admin-client-websites')

  await page.goto(`${base}/commerce/auth`)
  await page.getByLabel('Email address', { exact: true }).fill(ownerA.email)
  await page.getByLabel('Password', { exact: true }).fill(LOCAL_PASSWORD)
  await page.getByRole('button', { name: /^Sign in/ }).click()
  await page.waitForURL(`${base}/commerce/dashboard`)
  await page.getByRole('heading', { name: 'QA Atelier', exact: true }).waitFor()
  await snapshot('owner-workspace')
  const ownerNavigation = page.getByRole('navigation', { name: 'Owner workspace sections' })
  await ownerNavigation.getByRole('button', { name: 'Products', exact: true }).click()
  await page.getByRole('button', { name: 'Add product', exact: true }).click()
  await page.getByLabel('Product name', { exact: true }).fill('QA Draft Item')
  await page.getByLabel('Product slug', { exact: true }).fill('qa-draft-item')
  await page.getByLabel('Price (₹)', { exact: true }).fill('49.95')
  await page.getByLabel('Published in your catalog', { exact: true }).uncheck()
  await page.getByLabel('Product image', { exact: true }).setInputFiles({ name: 'local-test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1WQAAAAASUVORK5CYII=', 'base64') })
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
  const preserved = await page.evaluate(() => localStorage.getItem('digital-dine-commerce:owner'))
  assert.ok(preserved, 'Owner session was not stored independently.')

  const buyerSession = fixture.session(fixture.users.get(buyerA.id))
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: 'digital-dine-commerce:customer:qa-atelier', value: JSON.stringify(buyerSession) })
  await page.goto(`${base}/shops/qa-atelier`)
  await page.getByRole('heading', { name: 'QA Atelier, made for you.' }).waitFor()
  await page.getByRole('searchbox', { name: 'Search products' }).fill('no development match')
  await page.getByRole('heading', { name: 'No products match your search.' }).waitFor()
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.getByRole('button', { name: 'Everyday', exact: true }).click()
  await page.getByRole('button', { name: 'View Everyday Canvas Bag', exact: true }).click()
  await page.getByRole('heading', { name: 'Everyday Canvas Bag', exact: true }).waitFor()
  await snapshot('product-details')
  await page.getByRole('button', { name: 'Close product details', exact: true }).click()
  await page.getByRole('button', { name: 'Add Everyday Canvas Bag to bag', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Open shopping bag, 1 items', exact: true }).waitFor()
  await page.getByRole('button', { name: /Open shopping bag/ }).click()
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
  await page.unroute(checkoutPattern)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${base}/shops/qa-atelier`)
  await page.getByRole('button', { name: 'Add Everyday Canvas Bag to bag', exact: true }).click()
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
  await page.getByRole('link', { name: 'View order history', exact: true }).click()
  await page.getByRole('heading', { name: 'Order history', exact: true }).waitFor()
  await page.getByText('Everyday Canvas Bag', { exact: false }).first().waitFor()
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
  assert.equal(await page.getByText('Everyday Canvas Bag', { exact: false }).count(), 0, 'Another customer saw the first customer\'s order history.')
  await page.goto(`${base}/shops/qa-atelier`)
  await snapshot('storefront')
  await page.getByRole('button', { name: 'Add Everyday Canvas Bag to bag', exact: true }).click()
  await page.getByRole('button', { name: /Open shopping bag/ }).click()
  await page.getByText(`Signed in as ${buyerB.email}`, { exact: true }).waitFor()
  await page.getByLabel('Your name', { exact: true }).fill('Private previous customer')
  await page.getByLabel('Phone number', { exact: true }).fill('9000000099')
  const accountTab = await context.newPage()
  accountTab.on('pageerror', error => errors.push(error.message))
  await accountTab.goto(`${base}/shops/qa-atelier/account`)
  await accountTab.getByRole('button', { name: 'Sign out', exact: true }).click()
  await accountTab.getByLabel('Email address', { exact: true }).fill(buyerA.email)
  await accountTab.getByLabel('Password', { exact: true }).fill(LOCAL_PASSWORD)
  await accountTab.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByText(`Signed in as ${buyerA.email}`, { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Your name', { exact: true }).inputValue(), '', 'An account switch retained the previous checkout name.')
  assert.equal(await page.getByLabel('Phone number', { exact: true }).inputValue(), '', 'An account switch retained the previous checkout phone.')
  await accountTab.close()
  await page.getByRole('button', { name: 'Close shopping bag', exact: true }).click()
  await page.goto(`${base}/shops/qa-market`)
  await page.getByRole('button', { name: 'View Market Basket', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'View Everyday Canvas Bag', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Add Market Basket to bag', exact: true }).click()
  await page.getByRole('button', { name: 'Open shopping bag, 1 items', exact: true }).waitFor()
  assert.equal(await page.getByText('Sold out', { exact: true }).count(), 0, 'Untracked inventory should allow ordering at zero stored stock.')
  await snapshot('second-storefront')
  assert.deepEqual(errors, [], `Browser page errors: ${errors.join('; ')}`)
  console.log(`PASS: admin module, owner login/product/media/inventory workspace, catalog filters/details/cart persistence, real COD checkout/history, lost/changed retry reconciliation, account privacy/isolation and desktop/mobile layouts. External requests blocked: ${[...blocked].join(', ') || 'none'}.`)
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
