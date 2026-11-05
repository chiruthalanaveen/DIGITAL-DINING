import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { developmentEnvironment, developmentUsers, LOCAL_PASSWORD } from './helpers/commerce-fixture.mjs'

/** Full Next HTTP and PostgreSQL/RLS checks; only Auth/Storage protocols are synthetic. */
export async function runWishlistBrowserChecks({ base, fixture, browser, artifacts, store, otherStore }) {
  assert.equal(new URL(base).hostname, '127.0.0.1')
  const fixtureOrigin = new URL(developmentEnvironment({ fixturePort: fixture.port || 4319 }).SUPABASE_URL).origin
  assert.equal(new URL(fixtureOrigin).hostname, '127.0.0.1')
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  const checks = [], screenshots = [], blocked = new Set(), errors = [], releases = new Set()
  const [owner, , buyer, otherBuyer] = developmentUsers
  const { website, product, simple } = store
  const home = `/shops/${website.slug}`, wishlist = `${home}/wishlist`
  const experiencePath = '/api/commerce/customer/experience'
  const pattern = '**/api/commerce/customer/experience**'
  const token = user => fixture.session(fixture.users.get(user.id)).access_token
  const saved = () => page.getByRole('list', { name: 'Saved products', exact: true })
  const card = name => page.getByRole('listitem', { name, exact: true })
  const remove = name => page.getByRole('button', { name: `Remove ${name} from wishlist`, exact: true })
  let privateReads = 0
  context.on('page', tab => tab.on('pageerror', error => errors.push(error.message)))
  page.on('pageerror', error => errors.push(error.message))
  context.on('request', request => {
    const url = new URL(request.url())
    if (url.origin === base && url.pathname === experiencePath && request.method() === 'GET' && !url.searchParams.has('product_id')) privateReads += 1
  })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if ([base, fixtureOrigin].includes(url.origin)) return route.continue()
    blocked.add(url.hostname)
    return route.abort()
  })
  await mkdir(artifacts, { recursive: true })

  async function api(site, user, action, productId, expected = 200) {
    const body = action ? { website_id: site.id, action, payload: { product_id: productId } } : undefined
    const url = action ? experiencePath : `${experiencePath}?website_id=${site.id}`
    const response = await fetch(base + url, {
      method: action ? 'POST' : 'GET', headers: { Origin: base, Authorization: `Bearer ${token(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const result = await response.json()
    assert.equal(response.status, expected, `${url}: ${JSON.stringify(result)}`)
    if (expected === 200) assert.equal(result.success, true)
    return result
  }
  async function seed(user, site, ids) {
    const current = await api(site, user)
    for (const id of current.wishlist || []) if (!ids.includes(id)) await api(site, user, 'wishlist_remove', id)
    for (const id of ids) await api(site, user, 'wishlist_add', id)
  }
  async function signIn(tab, user, site = website) {
    await tab.goto(`${base}/shops/${site.slug}/account`)
    const signOut = tab.getByRole('button', { name: 'Sign out', exact: true })
    // Wait for the real SDK's initial session decision before choosing an action.
    await tab.getByRole('region', { name: 'Customer account', exact: true }).waitFor()
    await tab.getByText('Checking your account…', { exact: true }).waitFor({ state: 'hidden' })
    if (await signOut.count()) await signOut.click()
    await tab.getByLabel('Email address', { exact: true }).fill(user.email)
    await tab.getByLabel(/^Password/).fill(LOCAL_PASSWORD)
    await tab.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()
    await signOut.waitFor()
  }
  async function openWishlist(site = website) {
    await page.goto(`${base}/shops/${site.slug}/wishlist`)
    await page.getByRole('heading', { name: 'Your wishlist', exact: true }).waitFor()
  }
  async function snapshot(name, focus = null) {
    for (const width of [1440, 768, 390, 360]) {
      const height = width < 768 ? 844 : 1000
      await page.setViewportSize({ width, height })
      if (focus) {
        await focus.scrollIntoViewIfNeeded()
        const box = await focus.boundingBox()
        assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1 && box.y >= -1 && box.y + box.height <= height + 1, `${name} clips a control at ${width}px.`)
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflows at ${width}px.`)
      const filename = `wishlist-${name}-${width}.png`
      await page.screenshot({ path: path.join(artifacts, filename), fullPage: true })
      screenshots.push(filename)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  async function signal(promise, label) {
    let timer
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out.`)), 20000) })]) }
    finally { clearTimeout(timer) }
  }
  async function holdResponse(method, action) {
    let release, ready, finished, caught = false
    const held = new Promise(resolve => { release = resolve })
    const readyPromise = new Promise(resolve => { ready = resolve })
    const finishedPromise = new Promise(resolve => { finished = resolve })
    releases.add(release)
    const handle = async route => {
      const request = route.request()
      const url = new URL(request.url())
      const body = request.method() === 'POST' ? request.postDataJSON() : null
      // Classify the already-issued fixture token by subject, not by generating
      // another timestamped token. The real API still verifies its signature.
      let subject = null
      try { subject = JSON.parse(Buffer.from(request.headers().authorization.split(' ')[1].split('.')[1], 'base64url').toString()).sub } catch {}
      if (caught || url.pathname !== experiencePath || request.method() !== method || subject !== buyer.id || (action && (body?.action !== action || body.payload?.product_id !== product.id))) return route.continue()
      caught = true
      const response = await route.fetch()
      ready(response.status())
      await held
      try { await route.fulfill({ response }) } catch { /* Account changes abort the original browser request. */ }
      finally { finished(); releases.delete(release) }
    }
    await page.route(pattern, handle)
    return { release, ready: readyPromise, finished: finishedPromise, handle }
  }

  try {
    await seed(buyer, website, [product.id, simple.id])
    await seed(otherBuyer, website, [simple.id])
    await seed(buyer, otherStore.website, [otherStore.product.id])

    await openWishlist()
    await page.getByRole('heading', { name: 'Sign in to view your wishlist', exact: true }).waitFor()
    await page.waitForLoadState('networkidle')
    assert.equal(privateReads, 0, 'A signed-out wishlist must not request private account data.')
    const robots = await page.locator('meta[name="robots"]').getAttribute('content')
    assert.match(robots, /noindex/)
    assert.equal(new URL(await page.locator('link[rel="canonical"]').getAttribute('href')).pathname, wishlist)
    assert.equal(await page.getByRole('listitem').count(), 0)
    assert.equal(await page.locator(`a[href="${home}/account"]`).count() > 0, true)
    await snapshot('signed-out', page.getByRole('heading', { name: 'Sign in to view your wishlist', exact: true }))
    checks.push('dedicated tenant wishlist is private/noindex with its own canonical; signed-out customers make no private experience request')

    await signIn(page, buyer)
    await page.locator(`a[href="${wishlist}"]`).first().click()
    await remove(product.name).waitFor()
    await remove(simple.name).waitFor()
    await page.getByText(`Signed in as ${buyer.email}`, { exact: true }).waitFor()
    assert.equal(await saved().getByRole('listitem').count(), 2)
    assert.equal(await card(product.name).locator(`a[href="${home}?product=${product.id}"]`).count() > 0, true)
    const imageLink = card(product.name).getByRole('link', { name: `View ${product.name}`, exact: true })
    await imageLink.focus()
    assert.equal(await imageLink.evaluate(element => document.activeElement === element), true)
    await snapshot('saved-products', remove(product.name))
    await card(product.name).locator(`a[href="${home}?product=${product.id}"]`).first().click()
    await page.getByRole('dialog').getByRole('heading', { name: product.name, exact: true }).waitFor()
    await page.getByRole('button', { name: 'Close product details', exact: true }).click()
    await page.locator(`a[href="${wishlist}"]`).first().click()
    await remove(product.name).waitFor()
    checks.push('verified buyer sees only own saved public products; account/storefront wishlist navigation and product deep link use the real app')

    const rejectRemoval = route => route.request().method() === 'POST' ? route.abort('failed') : route.continue()
    await page.route(pattern, rejectRemoval)
    await remove(product.name).click()
    await page.getByRole('alert').waitFor()
    assert.equal(await remove(product.name).count(), 1)
    assert.equal((await api(website, buyer)).wishlist.includes(product.id), true)
    await snapshot('remove-failure', remove(product.name))
    await page.unroute(pattern, rejectRemoval)
    await remove(product.name).click()
    await remove(product.name).waitFor({ state: 'hidden' })
    await remove(simple.name).waitFor({ state: 'visible' })
    assert.equal(await remove(simple.name).evaluate(element => document.activeElement === element), true, 'Successful removal must move focus to the next remaining removal control.')
    assert.equal((await api(website, buyer)).wishlist.includes(product.id), false)
    await page.reload()
    await remove(simple.name).waitFor()
    assert.equal(await remove(product.name).count(), 0)
    await remove(simple.name).click()
    await page.getByRole('heading', { name: 'No saved products yet.', exact: true }).waitFor()
    assert.deepEqual((await api(website, buyer)).wishlist, [])
    await snapshot('empty', page.getByRole('heading', { name: 'Your wishlist', exact: true }))
    checks.push('failed removal preserves saved data; successful removal persists after reload and recovers keyboard focus; last removal produces the genuine empty state')

    await seed(buyer, website, [product.id, simple.id])
    const rejectRead = route => route.request().method() === 'GET' ? route.abort('failed') : route.continue()
    await page.route(pattern, rejectRead)
    await page.reload()
    await page.getByRole('button', { name: 'Retry wishlist', exact: true }).waitFor()
    assert.equal(await saved().getByRole('listitem').count(), 0, 'A failed read must not render an empty success or invented products.')
    await page.unroute(pattern, rejectRead)
    await page.getByRole('button', { name: 'Retry wishlist', exact: true }).click()
    await remove(product.name).waitFor()
    await remove(simple.name).waitFor()
    checks.push('a failed private wishlist load presents retry and recovers actual saved products without inventing a successful empty list')

    await signIn(page, buyer, otherStore.website)
    await openWishlist(otherStore.website)
    await remove(otherStore.product.name).waitFor()
    assert.equal(await saved().getByRole('listitem').count(), 1)
    assert.equal(await page.locator(`a[href="/shops/${otherStore.website.slug}?product=${otherStore.product.id}"]`).count() > 0, true)
    assert.equal(await page.locator(`a[href*="product=${product.id}"]`).count(), 0)
    assert.equal((await api(website, buyer)).wishlist.includes(product.id), true)
    checks.push('saree and grocery routes use separate tenant customer sessions and product links; changing stores never reads another tenant’s saved list')

    await openWishlist()
    await remove(product.name).waitFor()
    const peer = await context.newPage()
    peer.setDefaultTimeout(20000)
    const oldRead = await holdResponse('GET')
    await page.getByRole('button', { name: 'Refresh wishlist', exact: true }).click()
    assert.equal(await signal(oldRead.ready, 'Original buyer private read'), 200)
    await signIn(peer, otherBuyer)
    await page.getByText(`Signed in as ${otherBuyer.email}`, { exact: true }).waitFor()
    await remove(simple.name).waitFor()
    oldRead.release()
    await signal(oldRead.finished, 'Released original buyer read')
    await page.unroute(pattern, oldRead.handle)
    assert.equal(await remove(product.name).count(), 0)
    assert.equal(await saved().getByRole('listitem').count(), 1)
    assert.equal(await remove(simple.name).isEnabled(), true)
    checks.push('actual SDK sign-out/sign-in in another tab discards a delayed previous-buyer GET and reveals only the newly verified buyer’s wishlist')

    await signIn(peer, buyer)
    await page.getByText(`Signed in as ${buyer.email}`, { exact: true }).waitFor()
    await remove(product.name).waitFor()
    const oldRemove = await holdResponse('POST', 'wishlist_remove')
    await remove(product.name).click()
    assert.equal(await signal(oldRemove.ready, 'Committed original buyer removal'), 200)
    assert.equal((await api(website, buyer)).wishlist.includes(product.id), false)
    await signIn(peer, otherBuyer)
    await page.getByText(`Signed in as ${otherBuyer.email}`, { exact: true }).waitFor()
    await remove(simple.name).waitFor()
    oldRemove.release()
    await signal(oldRemove.finished, 'Released original buyer removal')
    await page.unroute(pattern, oldRemove.handle)
    assert.equal(await remove(product.name).count(), 0)
    assert.equal(await saved().getByRole('listitem').count(), 1)
    assert.equal(await page.getByRole('status').filter({ hasText: /removed/i }).count(), 0, 'An old successful mutation must not announce success in the new account.')
    assert.deepEqual((await api(website, otherBuyer)).wishlist, [simple.id])
    await peer.close()
    checks.push('a real committed removal response arriving after a cross-tab account switch cannot replace the new buyer’s list or announce the old buyer’s success')

    const unverifiedId = randomUUID()
    const unverified = { ...fixture.users.get(buyer.id), id: unverifiedId, email: `wishlist-unverified-${unverifiedId}@commerce.example.test`, email_confirmed_at: null, confirmed_at: null, user_metadata: { full_name: 'Synthetic unverified wishlist customer' } }
    await fixture.pool.query('INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES ($1,$2,NULL,$3)', [unverified.id, unverified.email, JSON.stringify(unverified.user_metadata)])
    fixture.users.set(unverified.id, unverified)
    await page.goto(base + '/commerce')
    await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `digital-dine-commerce:customer:${website.slug}`, session: fixture.session(unverified) })
    const readsBeforeUnverified = privateReads
    await openWishlist()
    await page.getByText(/Verify your email/i).first().waitFor()
    await page.waitForLoadState('networkidle')
    assert.equal(privateReads, readsBeforeUnverified, 'An unverified session must not load private wishlist data.')
    assert.equal(await saved().getByRole('listitem').count(), 0)
    await api(website, unverified, undefined, undefined, 403)
    await snapshot('unverified-email', page.getByText(/Verify your email/i).first())
    checks.push('unverified synthetic Auth identity is blocked both before browser private fetching and by the actual authenticated server boundary')

    await signIn(page, buyer)
    await seed(buyer, website, [product.id, simple.id])
    const response = await fetch(`${base}/api/commerce/workspace/${website.id}`, { method: 'POST', headers: { Origin: base, Authorization: `Bearer ${token(owner)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'archive_product', payload: { id: product.id } }) })
    assert.equal(response.status, 200)
    await openWishlist()
    await page.getByRole('listitem', { name: /^Unavailable product/ }).waitFor()
    assert.equal(await page.getByText(product.name, { exact: true }).count(), 0)
    const unavailable = page.getByRole('listitem', { name: /^Unavailable product/ })
    assert.equal(await unavailable.getByRole('link').count(), 0)
    assert.equal(await unavailable.locator('img').count(), 0)
    assert.doesNotMatch(await unavailable.innerText(), /₹|Rs\.?\s*[0-9]/)
    assert.equal(await page.locator(`a[href*="product=${product.id}"]`).count(), 0)
    await snapshot('unavailable-product', unavailable.getByRole('button'))
    await unavailable.getByRole('button').click()
    await unavailable.waitFor({ state: 'hidden' })
    assert.equal((await api(website, buyer)).wishlist.includes(product.id), false)
    assert.equal((await api(website, buyer)).wishlist.includes(simple.id), true)
    checks.push('an archived saved product has only a generic unavailable entry with removal, no stale name/price/image/product link; active saved products remain intact')

    assert.deepEqual(errors, [], `Wishlist page errors: ${errors.join('; ')}`)
    const result = { result: 'PASS', checks, screenshots, blockedExternalHosts: [...blocked], scope: 'Actual local Next.js HTTP routes and PostgreSQL/RLS, with synthetic Auth/Storage only. Response delays execute the real request before holding delivery.', hostedAuthTested: false, hostedRlsTested: false, productionWrites: false, livePayments: false }
    await writeFile(path.join(artifacts, 'wishlist-browser-results.json'), JSON.stringify(result, null, 2) + '\n')
    return result
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, 'wishlist-failure.png'), fullPage: true }).catch(() => {})
    await writeFile(path.join(artifacts, 'wishlist-browser-failure.json'), JSON.stringify({ error: error.message, checks, screenshots, errors, url: page.url() }, null, 2) + '\n')
    throw error
  } finally {
    for (const release of releases) release()
    await context.close()
  }
}
