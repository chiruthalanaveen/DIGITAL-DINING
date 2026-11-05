import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { developmentEnvironment, developmentUsers, LOCAL_ANON_KEY, LOCAL_PASSWORD, LOCAL_SERVICE_KEY } from './helpers/commerce-fixture.mjs'

/** Actual Next.js HTTP and local PostgreSQL; Auth/Storage remain synthetic. */
export async function runFeatureRequestsBrowserChecks({ base, fixture, browser, artifacts, store }) {
  assert.equal(new URL(base).hostname, '127.0.0.1')
  const fixtureOrigin = new URL(developmentEnvironment({ fixturePort: fixture.port || 4319 }).SUPABASE_URL).origin
  assert.equal(new URL(fixtureOrigin).hostname, '127.0.0.1')
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const ownerPage = await context.newPage()
  ownerPage.setDefaultTimeout(20000)
  const [owner, foreignOwner] = developmentUsers
  const { website } = store
  const ownerPath = `/api/commerce/workspace/${website.id}/feature-requests`
  const adminPath = '/api/commerce/admin/feature-requests'
  const suffix = randomUUID().slice(0, 8)
  const title = `Local commerce request ${suffix}`
  const description = `Synthetic owner request ${suffix}: support a separately reviewed catalog convenience feature. This does not authorize activation.`
  const workReference = `LOCAL-COMMERCE-WORK-${suffix}`
  const notes = {
    under_review: 'The platform team is reviewing the synthetic business requirement.',
    approved: 'The synthetic requirement is approved for separately controlled planning.',
    assigned: 'Assigned to a local review task; implementation and release are not confirmed.',
  }
  const checks = [], screenshots = [], blocked = new Set(), errors = [], releases = new Set(), reviewBodies = []
  let cookie = '', adminPage, ownerSubmissions = 0
  ownerPage.on('pageerror', error => errors.push(error.message))
  ownerPage.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === ownerPath) ownerSubmissions += 1 })
  context.on('page', page => { page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message)) })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if ([base, fixtureOrigin].includes(url.origin)) return route.continue()
    blocked.add(url.hostname)
    return route.abort()
  })
  await mkdir(artifacts, { recursive: true })

  async function api(url, { user, admin = false, method = 'GET', body, expected = 200 } = {}) {
    const headers = { Origin: base }
    if (user) headers.Authorization = `Bearer ${fixture.session(fixture.users.get(user.id)).access_token}`
    if (admin) headers.Cookie = cookie
    if (body) headers['Content-Type'] = 'application/json'
    const response = await fetch(base + url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
    const result = await response.json().catch(() => ({}))
    assert.equal(response.status, expected, `${method} ${url}: ${JSON.stringify(result)}`)
    if (expected === 200) assert.equal(result.success, true)
    return result
  }
  async function snapshot(page, name, focus) {
    for (const width of [1440, 768, 390, 360]) {
      const height = width < 768 ? 844 : 1000
      await page.setViewportSize({ width, height })
      await focus.scrollIntoViewIfNeeded()
      const box = await focus.boundingBox()
      assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1 && box.y >= -1 && box.y + box.height <= height + 1, `${name} clips its control at ${width}px.`)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} has horizontal overflow at ${width}px.`)
      const filename = `feature-requests-${name}-${width}.png`
      await page.screenshot({ path: path.join(artifacts, filename), fullPage: false })
      screenshots.push(filename)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  async function signal(promise, label) {
    let timer
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out.`)), 20000) })]) }
    finally { clearTimeout(timer) }
  }
  async function selectOwnerStore(id, name) {
    await ownerPage.locator('#co-website-selector').selectOption(id)
    if (name) await ownerPage.getByRole('heading', { name, exact: true }).waitFor()
    await ownerPage.getByRole('navigation', { name: 'Owner workspace sections' }).getByRole('button', { name: 'Feature requests', exact: true }).click()
    await ownerPage.getByRole('region', { name: 'Website feature requests', exact: true }).waitFor()
    await ownerPage.getByRole('button', { name: 'Send feature request', exact: true }).waitFor({ state: 'visible' })
  }
  async function businessSnapshot() {
    const { rows: [row] } = await fixture.pool.query("SELECT w.features,w.owner_permissions,w.fulfillment,w.status,w.subscription_plan,w.subscription_status,w.monthly_price_paise,(SELECT count(*) FROM public.commerce_orders o WHERE o.website_id=w.id) AS orders,(SELECT count(*) FROM commerce_private.payment_receipts r WHERE r.website_id=w.id) AS receipts FROM public.commerce_websites w WHERE w.id=$1", [website.id])
    assert.ok(row)
    return row
  }
  async function findAdminRequest() {
    const button = adminPage.getByRole('button', { name: `Review request ${title}`, exact: true })
    await adminPage.getByRole('heading', { name: 'Owner feature requests', exact: true }).waitFor()
    await adminPage.getByText('Loading owner feature requests…', { exact: true }).waitFor({ state: 'hidden' })
    for (let attempt = 0; attempt < 10 && await button.count() === 0; attempt++) {
      const more = adminPage.getByRole('button', { name: 'Load more feature requests', exact: true })
      assert.equal(await more.count(), 1, 'The owner request must appear in the global Admin queue.')
      const before = await adminPage.getByRole('list', { name: 'Owner feature request queue', exact: true }).getByRole('listitem').count()
      await more.click()
      await adminPage.waitForFunction(count => document.querySelectorAll('ul[aria-label="Owner feature request queue"] > li').length > count, before)
    }
    await button.waitFor()
    return button
  }

  try {
    const beforeBusiness = await businessSnapshot()
    await ownerPage.goto(base + '/commerce/auth')
    await ownerPage.getByLabel('Email address', { exact: true }).fill(owner.email)
    await ownerPage.getByLabel('Password', { exact: true }).fill(LOCAL_PASSWORD)
    await ownerPage.getByRole('button', { name: /^Sign in/ }).click()
    await ownerPage.waitForURL(base + '/commerce/dashboard')
    await selectOwnerStore(website.id)
    const ownerPanel = ownerPage.getByRole('region', { name: 'Website feature requests', exact: true })
    const ownerDetail = ownerPage.getByRole('region', { name: 'Feature request details', exact: true })
    await ownerPage.getByLabel('Request title', { exact: true }).fill('🧵'.repeat(3))
    await ownerPage.getByLabel('Describe the change', { exact: true }).fill('📦'.repeat(5))
    await ownerPage.getByRole('button', { name: 'Send feature request', exact: true }).click()
    await ownerPanel.getByRole('alert').filter({ hasText: 'Use 5–180 characters' }).waitFor()
    assert.equal(ownerSubmissions, 0, 'A Unicode draft below the database character limits must not be submitted.')
    assert.equal(await ownerPage.evaluate(key => sessionStorage.getItem(key), `commerce-feature-request:${website.id}:${owner.id}`), null)
    await ownerPage.getByLabel('Request title', { exact: true }).fill(title)
    await ownerPage.getByLabel('Describe the change', { exact: true }).fill(description)

    let originalBody, committed
    const committedResult = new Promise(resolve => { committed = resolve })
    const loseSubmission = async route => {
      if (route.request().method() !== 'POST') return route.continue()
      originalBody = route.request().postDataJSON()
      const response = await route.fetch()
      committed({ status: response.status(), data: await response.json() })
      // The real API transaction commits; only delivery to the browser is lost.
      await route.abort('failed')
    }
    await ownerPage.route(`**${ownerPath}`, loseSubmission)
    await ownerPage.getByRole('button', { name: 'Send feature request', exact: true }).click()
    const original = await signal(committedResult, 'Committed original submission')
    assert.equal(original.status, 200)
    assert.equal(original.data.request.title, title)
    await ownerPanel.getByRole('alert').filter({ hasText: 'Retry this saved request' }).waitFor()
    await ownerPage.unroute(`**${ownerPath}`, loseSubmission)
    const storageKey = `commerce-feature-request:${website.id}:${owner.id}`
    assert.deepEqual(await ownerPage.evaluate(key => JSON.parse(sessionStorage.getItem(key)), storageKey), originalBody.payload)
    await ownerPage.reload()
    // Reload resets the selected tab/store, then recovers only this scope's key.
    await ownerPage.locator('#co-website-selector').selectOption(website.id)
    await ownerPage.getByRole('navigation', { name: 'Owner workspace sections' }).getByRole('button', { name: 'Feature requests', exact: true }).click()
    const retry = ownerPage.getByRole('button', { name: 'Retry this request', exact: true })
    await retry.waitFor()
    assert.equal(await ownerPage.getByLabel('Request title', { exact: true }).inputValue(), title)
    assert.equal(await ownerPage.getByLabel('Describe the change', { exact: true }).inputValue(), description)
    assert.equal(await ownerPage.getByLabel('Request title', { exact: true }).evaluate(input => input.readOnly), true)
    await snapshot(ownerPage, 'saved-submission-recovery', retry)
    const retryRequest = ownerPage.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === ownerPath)
    await retry.click()
    assert.deepEqual((await retryRequest).postDataJSON(), originalBody, 'A lost submission must retry exactly the same UUID and content.')
    await ownerPage.getByText('Your original feature request is confirmed.', { exact: true }).waitFor()
    await ownerDetail.getByRole('heading', { name: title, exact: true }).waitFor()
    assert.equal(await ownerPage.evaluate(key => sessionStorage.getItem(key), storageKey), null)
    const requestId = original.data.request.id
    let detail = await api(`${ownerPath}?request_id=${requestId}`, { user: owner })
    assert.equal(detail.request.status, 'submitted')
    assert.equal(detail.events.length, 1)
    const { rows: [count] } = await fixture.pool.query('SELECT count(*) AS total FROM public.commerce_feature_requests WHERE website_id=$1 AND submitted_by=$2 AND title=$3', [website.id, owner.id, title])
    assert.equal(Number(count.total), 1)
    await snapshot(ownerPage, 'owner-submitted-history', ownerDetail.getByRole('heading', { name: title, exact: true }))
    checks.push('real owner SDK login and selected-store request submission survive a committed lost response and reload; exact saved UUID/content retry confirms one request and one initial event')

    await api(ownerPath, { expected: 401 })
    await api(ownerPath, { user: foreignOwner, expected: 403 })
    await api(ownerPath, { user: foreignOwner, method: 'POST', body: { action: 'submit', payload: { submission_key: randomUUID(), title: 'Foreign owner attempt', description: 'This synthetic attempt must never create a request in another owner’s store.' } }, expected: 403 })
    await api(adminPath, { user: owner, expected: 401 })
    await api(adminPath, { user: owner, method: 'POST', body: { website_id: website.id, action: 'review', payload: { request_id: requestId, expected_status: 'submitted', expected_revision: 1, status: 'approved', note: 'Owner must not approve a platform request.', assignment_reference: '', action_key: randomUUID() } }, expected: 401 })
    checks.push('missing owner authentication, foreign owner reads/submissions and owner attempts to use the signed Admin review endpoint are rejected by actual HTTP authorization')

    const login = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@commerce.example.test', password: LOCAL_PASSWORD }) })
    assert.equal(login.status, 200)
    cookie = login.headers.get('set-cookie').split(';')[0]
    const separator = cookie.indexOf('=')
    await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: base, httpOnly: true, sameSite: 'Lax' }])
    adminPage = await context.newPage()
    adminPage.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === adminPath) reviewBodies.push(request.postDataJSON()) })
    await adminPage.goto(base + '/admin/dashboard')
    await adminPage.getByRole('button', { name: 'E-Commerce Website Management', exact: true }).click()
    await adminPage.locator('summary').filter({ hasText: /^Owner feature requests$/ }).click()
    await (await findAdminRequest()).click()
    const adminDetail = adminPage.locator('.cfr-admin-panel .cfr-detail')
    await adminDetail.getByRole('heading', { name: title, exact: true }).waitFor()
    async function review(status, revision) {
      await adminDetail.getByLabel('Decision', { exact: true }).selectOption(status)
      await adminDetail.getByLabel('Review note', { exact: true }).fill(notes[status])
      if (status === 'assigned') await adminDetail.getByLabel('Development work reference', { exact: true }).fill(workReference)
      const response = adminPage.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === adminPath)
      await adminDetail.getByRole('button', { name: 'Save review decision', exact: true }).click()
      const result = await response
      assert.equal(result.status(), 200)
      const body = await result.json()
      assert.equal(body.request.status, status)
      assert.equal(body.request.revision, revision)
      await adminPage.waitForFunction(expected => document.querySelectorAll('.cfr-admin-panel .cfr-detail .cfr-timeline > li').length === expected, revision)
      await adminPage.getByText('Request review recorded. Features and permissions are unchanged.', { exact: true }).waitFor()
      return body
    }
    await review('under_review', 2)
    await snapshot(adminPage, 'admin-review-decision', adminDetail.getByRole('button', { name: 'Save review decision', exact: true }))
    const stale = { website_id: website.id, action: 'review', payload: { request_id: requestId, expected_status: 'submitted', expected_revision: 1, status: 'rejected', note: 'A stale synthetic review must conflict.', assignment_reference: '', action_key: randomUUID() } }
    await api(adminPath, { admin: true, method: 'POST', body: stale, expected: 409 })
    detail = await api(`${adminPath}?website_id=${website.id}&request_id=${requestId}`, { admin: true })
    assert.equal(detail.request.status, 'under_review')
    assert.equal(detail.events.length, 2)
    await review('approved', 3)
    await review('assigned', 4)
    assert.equal(await adminDetail.getByRole('button', { name: 'Save review decision', exact: true }).count(), 0)
    checks.push('signed Super Admin discovers the owner request in the global queue and records under-review, approval and separate development assignment through the actual UI and API')

    const replay = await api(adminPath, { admin: true, method: 'POST', body: reviewBodies[0] })
    assert.equal(replay.replayed, true)
    assert.equal(replay.request.status, 'assigned')
    assert.equal(replay.events.length, 4)
    assert.equal(replay.action_event.revision, 2)
    assert.equal(replay.action_event.to_status, 'under_review')
    checks.push('a fresh stale Admin CAS returns HTTP409 without history mutation; identical earlier action replay returns its original event and current assigned state without duplicate events or rewind')

    await ownerDetail.getByRole('button', { name: 'Refresh request', exact: true }).click()
    await ownerDetail.getByText('Assigned for development', { exact: true }).first().waitFor()
    const currentListRow = ownerPanel.getByRole('listitem').filter({ has: ownerPage.getByRole('button', { name: `View request ${title}`, exact: true }) })
    await currentListRow.getByText(/^Assigned for development/).waitFor()
    const timeline = ownerDetail.getByRole('list', { name: 'Feature request timeline', exact: true })
    assert.equal(await timeline.getByRole('listitem').count(), 4)
    for (const note of Object.values(notes)) assert.equal(await timeline.getByText(note, { exact: true }).count(), 1)
    await ownerDetail.getByText(workReference, { exact: true }).waitFor()
    await snapshot(ownerPage, 'owner-assigned-timeline', ownerDetail.getByRole('heading', { name: title, exact: true }))
    checks.push('owner detail refresh synchronizes the request list and displays all four immutable status events, platform notes and development reference without claiming feature activation or release')

    const sites = (await api('/api/commerce/workspace', { user: owner })).websites
    const other = sites.find(site => site.id !== website.id && site.slug?.startsWith('qa-exp-') && ['setup', 'active'].includes(site.status))
    assert.ok(other, 'Another assigned local store is required for the stale-scope browser check.')
    const otherTitle = `Local other-store request ${suffix}`
    await api(`/api/commerce/workspace/${other.id}/feature-requests`, { user: owner, method: 'POST', body: { action: 'submit', payload: { submission_key: randomUUID(), title: otherTitle, description: 'Synthetic request belonging only to the second assigned development website.' } } })
    let release, ready, finished, caught = false
    const held = new Promise(resolve => { release = resolve })
    const readyPromise = new Promise(resolve => { ready = resolve })
    const finishedPromise = new Promise(resolve => { finished = resolve })
    releases.add(release)
    const holdList = async route => {
      const request = route.request(), url = new URL(request.url())
      if (caught || request.method() !== 'GET' || url.pathname !== ownerPath || url.search) return route.continue()
      caught = true
      const response = await route.fetch()
      ready(response.status())
      await held
      try { await route.fulfill({ response }) } catch { /* Changing stores aborts the old component's request. */ }
      finally { finished(); releases.delete(release) }
    }
    await ownerPage.route(`**${ownerPath}**`, holdList)
    await ownerPanel.getByRole('button', { name: 'Refresh feature requests', exact: true }).click()
    assert.equal(await signal(readyPromise, 'Original website feature-request list'), 200)
    await selectOwnerStore(other.id, other.name)
    await ownerPage.getByRole('button', { name: `View request ${otherTitle}`, exact: true }).waitFor()
    release()
    await signal(finishedPromise, 'Released original website list')
    await ownerPage.unroute(`**${ownerPath}**`, holdList)
    assert.equal(await ownerPage.getByRole('button', { name: `View request ${title}`, exact: true }).count(), 0)
    assert.equal(await ownerPage.getByRole('heading', { name: title, exact: true }).count(), 0)
    assert.equal(await ownerPage.getByRole('button', { name: `View request ${otherTitle}`, exact: true }).count(), 1)
    checks.push('switching assigned stores while the original real list response is delayed cannot populate the new store with the previous store’s request or detail')

    // A direct authenticated RPC can legitimately use the database's full
    // Unicode character limits. Such rows must not break either HTTP queue.
    const unicodeTitle = `\u00a0${'🧵'.repeat(178)}\u00a0`, unicodeDescription = `\u00a0${'📦'.repeat(5998)}\u00a0`
    const unicodeResponse = await fetch(`${fixtureOrigin}/rest/v1/rpc/commerce_feature_requests_owner`, {
      method: 'POST', headers: { apikey: LOCAL_ANON_KEY, Authorization: `Bearer ${fixture.session(fixture.users.get(owner.id)).access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_website_id: website.id, p_action: 'submit', p_payload: { submission_key: randomUUID(), title: unicodeTitle, description: unicodeDescription } }),
    })
    assert.equal(unicodeResponse.status, 200)
    const unicodeRequest = (await unicodeResponse.json()).request
    const exactAuditNote = '\u00a0SQL-retained review note\u00a0'
    const unicodeReview = await fetch(`${fixtureOrigin}/rest/v1/rpc/commerce_feature_requests_admin`, {
      method: 'POST', headers: { apikey: LOCAL_SERVICE_KEY, Authorization: `Bearer ${LOCAL_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_website_id: website.id, p_action: 'review', p_actor_email: 'admin@commerce.example.test', p_payload: { request_id: unicodeRequest.id, expected_status: 'submitted', expected_revision: 1, status: 'under_review', note: exactAuditNote, assignment_reference: '', action_key: randomUUID() } }),
    })
    assert.equal(unicodeReview.status, 200)
    const unicodeDetail = await api(`${ownerPath}?request_id=${unicodeRequest.id}`, { user: owner })
    assert.equal(unicodeDetail.request.title, unicodeTitle)
    assert.equal(unicodeDetail.request.description, unicodeDescription)
    assert.equal(unicodeDetail.request.review_note, exactAuditNote)
    assert.equal(unicodeDetail.events.at(-1).note, exactAuditNote)
    const adminQueue = await api(adminPath, { admin: true })
    assert.equal(adminQueue.requests.find(row => row.id === unicodeRequest.id)?.title, unicodeTitle)
    await selectOwnerStore(website.id)
    await ownerPage.getByText(unicodeTitle.trim(), { exact: true }).waitFor()
    checks.push('SQL-valid full-length Unicode requests stay readable in both HTTP queues and owner UI, while SQL-retained nonbreaking request and immutable review text is preserved exactly')

    assert.deepEqual(await businessSnapshot(), beforeBusiness)
    assert.deepEqual(errors, [], `Feature-request page errors: ${errors.join('; ')}`)
    checks.push('submitting and reviewing requests leaves website features, owner permissions, fulfillment, subscription configuration, order count and captured-receipt count unchanged')
    const result = { result: 'PASS', checks, screenshots, blockedExternalHosts: [...blocked], scope: 'Real local Next.js HTTP routes and PostgreSQL/RLS; synthetic Auth/Storage only. Response-loss and delay tests execute actual server transactions.', hostedAuthTested: false, hostedRlsTested: false, productionWrites: false, livePayments: false }
    await writeFile(path.join(artifacts, 'feature-requests-browser-results.json'), JSON.stringify(result, null, 2) + '\n')
    return result
  } catch (error) {
    await ownerPage.screenshot({ path: path.join(artifacts, 'feature-requests-owner-failure.png'), fullPage: true }).catch(() => {})
    if (adminPage) await adminPage.screenshot({ path: path.join(artifacts, 'feature-requests-admin-failure.png'), fullPage: true }).catch(() => {})
    await writeFile(path.join(artifacts, 'feature-requests-browser-failure.json'), JSON.stringify({ error: error.message, checks, screenshots, errors, url: ownerPage.url() }, null, 2) + '\n')
    throw error
  } finally {
    for (const release of releases) release()
    await context.close()
  }
}
