import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, open, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { developmentEnvironment } from './helpers/commerce-fixture.mjs'

// These are simulated staff RPC contracts, not hosted Auth/RLS/provider tests.
const root = fileURLToPath(new URL('../', import.meta.url))
const base = 'http://127.0.0.1:4320'
const provider = 'http://127.0.0.1:4319'
const artifacts = process.env.COMMERCE_BROWSER_ARTIFACTS || '/tmp/digital-dining-lint-staff'
const env = developmentEnvironment()
const restaurantId = '11111111-1111-4111-8111-111111111111'
const restaurant = { id: restaurantId, name: 'Development Staff Store', restaurant_code: '12345', plan_code: 'restaurant_resort_delivery', status: 'approved', is_open: true }
const requests = [], checkpoints = [], blocked = new Set(), pageErrors = []
let orders = [], readyOrders = [], fixture, server, browser, lastFailure = null
await mkdir(artifacts, { recursive: true })

function sampleOrder(id) {
  return { id, order_code: `DEV-${id}`, order_status: 'out_for_delivery', customer_name: 'Development Customer', customer_mobile: '9000000000', customer_address: 'Development address', payment_method: 'cod', payment_status: 'pending', total_amount: 100, items: [], created_at: '2026-11-02T00:00:00Z' }
}

function rpc(name, payload) {
  if (name === 'get_delivery_driver_portal_data') {
    if (payload.p_session_token === 'expired-development-session') return { success: false, message: 'Development session expired.' }
    return { success: true, driver: { name: 'Development Driver', status: 'available' }, restaurant, orders }
  }
  if (name === 'get_delivery_packer_portal_data') return { success: true, packer: { name: 'Development Packer' }, restaurant, orders: [] }
  if (name === 'delivery_driver_get_cod_summary') return { success: true, summary: {}, settlements: [] }
  if (name === 'delivery_driver_update_live_location') return { success: true, location: { captured_at: '2026-11-02T00:01:00Z' } }
  if (name === 'delivery_driver_stop_live_location') return { success: true }
  if (name === 'validate_staff_app_session') return { success: true, restaurantId, restaurantCode: '12345', userId: 'development-manager' }
  if (name === 'get_manager_dashboard_data_session') return { success: true, restaurantId, restaurant, menuItems: [], dailyOffers: [], orders: [], staffList: [] }
  if (name === 'get_manager_delivery_data_session') return { success: true, restaurantId, restaurant, orders: [], menuItems: [], drivers: [], offers: [] }
  if (name === 'get_manager_table_inventory_session') return { success: true, tables: [] }
  if (name === 'get_waiter_portal_data_session') return { success: true, restaurantId, restaurantCode: '12345', userId: 'development-waiter', menuItems: [], readyOrders }
  return null
}

async function build() {
  const log = await open(path.join(artifacts, 'build.log'), 'w')
  try {
    const child = spawn('npm', ['run', 'build'], { cwd: root, env, stdio: ['ignore', log.fd, log.fd] })
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    assert.equal(code, 0, 'Development build failed; inspect build.log.')
  } finally { await log.close() }
}

async function contextWithStorage(storage = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if ([base, provider].includes(url.origin) || ['blob:', 'data:'].includes(url.protocol)) return route.continue()
    blocked.add(url.hostname)
    return route.abort()
  })
  await context.addInitScript(({ storage }) => {
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value)
    window.staffFixture = { created: [], revoked: [], watches: [], cleared: [], callbacks: {}, audioPlays: 0, audioPauses: 0 }
    // Simulate playback only: no physical sound, real media download or device API.
    const playback = new WeakMap()
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return playback.get(this)?.paused ?? true } })
    HTMLMediaElement.prototype.play = async function () {
      playback.set(this, { paused: false })
      window.staffFixture.audioPlays++
      this.dispatchEvent(new Event('play'))
    }
    HTMLMediaElement.prototype.pause = function () {
      playback.set(this, { paused: true })
      window.staffFixture.audioPauses++
      this.dispatchEvent(new Event('pause'))
    }
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = file => {
      const url = create(file)
      window.staffFixture.created.push(url)
      return url
    }
    URL.revokeObjectURL = url => { window.staffFixture.revoked.push(url); return revoke(url) }
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(success) {
        const id = window.staffFixture.watches.length + 1
        window.staffFixture.watches.push(id)
        window.staffFixture.callbacks[id] = success
        return id
      },
      clearWatch(id) { window.staffFixture.cleared.push(id); delete window.staffFixture.callbacks[id] },
    } })
  }, { storage })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && /hydration|hydrated|rendered (?:more|fewer) hooks|maximum update depth/i.test(message.text())) pageErrors.push(message.text())
  })
  return { context, page }
}

async function snapshot(page, name) {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflows at ${width}px.`)
    await page.screenshot({ path: path.join(artifacts, `${name}-${width}.png`), fullPage: true })
  }
  checkpoints.push(name)
}

async function recordFailure(error, page, checkpoint) {
  const evidence = {
    checkpoint, name: error.name, message: error.message,
    url: page.url(), completedCheckpoints: [...checkpoints], pageErrors: [...pageErrors],
    observedRpcNames: [...new Set(requests.map(row => row.rpc).filter(Boolean))],
  }
  evidence.headings = await page.locator('h1,h2,h3').allTextContents().catch(() => [])
  evidence.fixtureCounters = await page.evaluate(() => {
    const fixture = window.staffFixture
    return fixture ? { created: fixture.created.length, revoked: fixture.revoked.length, watches: fixture.watches, cleared: fixture.cleared, audioPlays: fixture.audioPlays, audioPauses: fixture.audioPauses } : null
  }).catch(() => null)
  await page.screenshot({ path: path.join(artifacts, `failure-${checkpoint}.png`), fullPage: true }).catch(() => {})
  await writeFile(path.join(artifacts, 'failure.json'), JSON.stringify(evidence, null, 2) + '\n')
  lastFailure = evidence
}

async function driverChecks(route, name) {
  const key = 'digitaldining_delivery_driver_session_12345'
  const token = `development-${name}-session`
  const appVariant = route.startsWith('/app/')
  orders = [sampleOrder('ORDER-A')]
  const { context, page } = await contextWithStorage({ [key]: token })
  try {
    await page.goto(base + route)
    await page.getByText(/^#?\s*DEV-ORDER-A$/).first().waitFor()
    await page.locator('input[type=file]').first().waitFor()
    await page.waitForFunction(() => window.staffFixture.watches.length > 0)
    assert.ok(requests.some(row => row.rpc === 'get_delivery_driver_portal_data' && row.payload.p_session_token === token), 'Saved session was not restored through the RPC.')
    await page.evaluate(() => {
      const id = window.staffFixture.watches.at(-1)
      window.staffFixture.callbacks[id]({ coords: { latitude: 17.4, longitude: 78.5, accuracy: 5, heading: null, speed: null } })
    })
    if (appVariant) await page.getByRole('button', { name: /Dashboard/ }).click()
    await page.getByText(/Live location is being shared/).first().waitFor()
    if (appVariant) await page.getByRole('button', { name: /Tracking/ }).click()
    const png = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 2; canvas.height = 2
      const drawing = canvas.getContext('2d')
      drawing.fillStyle = '#155e46'; drawing.fillRect(0, 0, 2, 2)
      return canvas.toDataURL('image/png').split(',')[1]
    }), 'base64')
    await page.locator('input[type=file]').first().setInputFiles([{ name: 'first.png', mimeType: 'image/png', buffer: png }, { name: 'second.png', mimeType: 'image/png', buffer: png }])
    await page.getByAltText('first.png', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.staffFixture.created.length), 2)
    await page.locator('input[type=file]').first().setInputFiles([{ name: 'replacement.png', mimeType: 'image/png', buffer: png }])
    await page.getByAltText('replacement.png', { exact: true }).waitFor()
    assert.deepEqual(await page.evaluate(() => [window.staffFixture.created.length, window.staffFixture.revoked.length]), [3, 2])
    await snapshot(page, `${name}-restored-live-preview`)
    orders = []
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.waitForFunction(() => !document.querySelector('input[type=file]'))
    assert.equal(await page.evaluate(() => window.staffFixture.revoked.length), 3, 'Unmount must revoke the last preview URL.')
    assert.ok(await page.evaluate(() => window.staffFixture.cleared.length > 0), 'Completed context must stop its GPS watch.')
    orders = [sampleOrder('ORDER-B')]
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.getByText(/^#?\s*DEV-ORDER-B$/).first().waitFor()
    if (appVariant) await page.getByRole('button', { name: /Dashboard/ }).click()
    await page.getByText('Allow precise location access to share your live delivery position.', { exact: true }).first().waitFor()
    assert.ok(await page.evaluate(() => window.staffFixture.watches.length >= 2), 'A new order context needs a new GPS watch.')
    checkpoints.push(`${name}-preview-resource-cleanup-and-gps-context-reset`)
  } catch (error) { await recordFailure(error, page, name); throw error }
  finally { await context.close() }
  const expired = await contextWithStorage({ [key]: 'expired-development-session' })
  try {
    await expired.page.goto(base + route)
    const heading = route.startsWith('/app/') ? 'Delivery Driver Login' : 'Driver sign in'
    await expired.page.getByRole('heading', { name: heading, exact: true }).waitFor()
    assert.equal(await expired.page.evaluate(key => localStorage.getItem(key), key), null)
    checkpoints.push(`${name}-expired-session-cleared`)
  } catch (error) { await recordFailure(error, expired.page, `${name}-expired-session`); throw error }
  finally { await expired.context.close() }
}

async function packerChecks(route, name) {
  const key = 'digitaldining_delivery_packer_session_12345'
  const empty = await contextWithStorage()
  try {
    const before = requests.filter(row => row.rpc === 'get_delivery_packer_portal_data').length
    await empty.page.goto(base + route)
    await empty.page.getByRole('heading', { name: /Delivery Packer Login/ }).waitFor()
    assert.equal(requests.filter(row => row.rpc === 'get_delivery_packer_portal_data').length, before, 'Logged-out portal must not fetch private data.')
    checkpoints.push(`${name}-logged-out-without-private-rpc`)
  } catch (error) { await recordFailure(error, empty.page, `${name}-logged-out`); throw error }
  finally { await empty.context.close() }
  const valid = await contextWithStorage({ [key]: `development-${name}-session` })
  try {
    await valid.page.goto(base + route)
    await valid.page.getByText(restaurant.name, { exact: true }).first().waitFor()
    assert.equal(await valid.page.getByRole('heading', { name: /Delivery Packer Login/ }).count(), 0)
    await snapshot(valid.page, `${name}-restored-session`)
  } catch (error) { await recordFailure(error, valid.page, `${name}-restored-session`); throw error }
  finally { await valid.context.close() }
}

async function managerChecks(route, name) {
  const saved = { sessionToken: 'development-manager-session', role: 'manager', restaurantId, restaurantCode: '12345', userId: 'development-manager', staff: { name: 'Development Manager', role: 'manager' } }
  const { context, page } = await contextWithStorage({ 'digital-dine-staff-session': JSON.stringify(saved) })
  try {
    await page.goto(`${base}${route}?module=delivery`)
    const switcher = route.startsWith('/app/') ? page.locator('.dd-mobile-module-switch') : page
    const delivery = switcher.getByRole('button', { name: /Delivery(?: Dashboard)?$/ })
    await delivery.waitFor()
    assert.match(await delivery.getAttribute('class'), /bg-emerald-600/, 'Allowed notification deep link should select Delivery.')
    const restaurantTab = switcher.getByRole('button', { name: /Restaurant(?: Dashboard)?$/ })
    await restaurantTab.click()
    assert.match(await restaurantTab.getAttribute('class'), /bg-orange-500/, 'Manual module selection must remain available.')
    await snapshot(page, `${name}-restored-module-selection`)
  } catch (error) { await recordFailure(error, page, name); throw error }
  finally { await context.close() }
  const wrong = await contextWithStorage({ 'digital-dine-staff-session': JSON.stringify({ ...saved, restaurantId: '22222222-2222-4222-8222-222222222222' }) })
  try {
    const before = requests.filter(row => row.rpc === 'validate_staff_app_session').length
    await wrong.page.goto(base + route)
    const heading = route.startsWith('/app/') ? 'Manager sign in' : 'Restaurant Manager'
    await wrong.page.getByRole('heading', { name: heading, exact: true }).waitFor()
    assert.equal(requests.filter(row => row.rpc === 'validate_staff_app_session').length, before, 'Another restaurant session must not be consumed.')
    checkpoints.push(`${name}-wrong-restaurant-session-rejected`)
  } catch (error) { await recordFailure(error, wrong.page, `${name}-wrong-restaurant`); throw error }
  finally { await wrong.context.close() }
}

async function waiterChecks(route, name) {
  readyOrders = []
  const saved = { sessionToken: 'development-waiter-session', role: 'waiter', restaurantId, restaurantCode: '12345', userId: 'development-waiter', staff: { name: 'Development Waiter', role: 'waiter' } }
  const { context, page } = await contextWithStorage({ 'digital-dine-staff-session': JSON.stringify(saved) })
  try {
    await page.goto(base + route)
    await page.getByRole('button', { name: /ENABLE ALARM SOUND/ }).click()
    await page.getByText('🔊 SOUND ENABLED', { exact: true }).waitFor()
    // Wait for the existing 150ms user-gesture audio-unlock callback to pause.
    await page.waitForFunction(() => window.staffFixture.audioPauses > 0)
    readyOrders = [{ id: 'WAITER-READY-1', order_number: 'DEV-READY-1', table_number: '1', items: [], total: 100, status: 'ready' }]
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.getByText('🚨 ALARM ACTIVE', { exact: true }).waitFor()
    const pauses = await page.evaluate(() => window.staffFixture.audioPauses)
    readyOrders = []
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.getByText('🔊 SOUND ENABLED', { exact: true }).waitFor()
    assert.ok(await page.evaluate(previous => window.staffFixture.audioPauses > previous, pauses), 'Clearing ready orders should pause the real audio owner.')
    assert.equal(await page.getByText('🚨 ALARM ACTIVE', { exact: true }).count(), 0)
    checkpoints.push(`${name}-audio-playback-and-pause-event-status`)
  } catch (error) { await recordFailure(error, page, name); throw error }
  finally { await context.close() }
}

try {
  if (process.env.COMMERCE_BROWSER_SKIP_BUILD !== '1') await build()
  fixture = http.createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', base)
    response.setHeader('Access-Control-Allow-Headers', request.headers['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info')
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    response.setHeader('Content-Type', 'application/json')
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
    const url = new URL(request.url, provider)
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString()
    const payload = raw ? JSON.parse(raw) : {}
    const name = url.pathname.startsWith('/rest/v1/rpc/') ? url.pathname.split('/').at(-1) : null
    requests.push({ method: request.method, path: url.pathname, rpc: name, payload })
    if (url.pathname === '/rest/v1/platform_settings') { response.end(JSON.stringify({ status: 'Working', updated_at: null })); return }
    const data = name ? rpc(name, payload) : null
    if (data !== null) { response.end(JSON.stringify(data)); return }
    response.writeHead(400)
    response.end(JSON.stringify({ message: 'Unsupported development-only contract.' }))
  })
  await new Promise((resolve, reject) => { fixture.once('error', reject); fixture.listen(4319, '127.0.0.1', resolve) })
  if (process.env.COMMERCE_BROWSER_BIND_PROBE_ONLY === '1') {
    console.log('Loopback fixture bound; browser checks not started (diagnostic probe only).')
  } else {
  const log = await open(path.join(artifacts, 'next.log'), 'w')
  server = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', '4320'], { cwd: root, env, detached: true, stdio: ['ignore', log.fd, log.fd] })
  await log.close()
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Development Next.js exited before readiness.')
    try { if ((await fetch(base + '/app')).status === 200) { ready = true; break } } catch { /* Wait for the local server. */ }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  assert.ok(ready, 'Development readiness timeout; inspect next.log.')
  browser = await chromium.launch({ headless: true, executablePath: process.env.COMMERCE_CHROMIUM_PATH || '/usr/bin/chromium', env })
  await driverChecks('/delivery-driver/12345', 'public-driver')
  await driverChecks('/app/driver/12345', 'app-driver')
  await packerChecks('/delivery-packer/12345', 'public-packer')
  await packerChecks('/app/packer/12345', 'app-packer')
  await managerChecks(`/manager/${restaurantId}`, 'public-manager')
  await managerChecks(`/app/manager/${restaurantId}`, 'app-manager')
  await waiterChecks(`/waiter/${restaurantId}`, 'public-waiter')
  await waiterChecks(`/app/waiter/${restaurantId}`, 'app-waiter')
  assert.deepEqual(pageErrors, [], `Browser runtime errors: ${pageErrors.join('; ')}`)
  await writeFile(path.join(artifacts, 'summary.json'), JSON.stringify({ result: 'PASS', checkpoints, widths: [1440, 375], pageErrors, blockedExternalHosts: [...blocked], rpcCount: requests.filter(row => row.rpc).length, realHostedAuthTested: false, realRlsTested: false, productionWrites: false, paymentsProcessed: false, fixture: 'Loopback simulated RPC responses; GPS callbacks and photo uploads are synthetic.' }, null, 2) + '\n')
  console.log(`PASS: ${checkpoints.length} staff hydration/session/preview/GPS/module checkpoints. Evidence: ${artifacts}`)
  }
} catch (error) {
  await writeFile(path.join(artifacts, 'summary.json'), JSON.stringify({ result: 'FAIL', completedCheckpoints: checkpoints, failure: lastFailure || { name: error.name, message: error.message }, pageErrors, realHostedAuthTested: false, realRlsTested: false, productionWrites: false, paymentsProcessed: false }, null, 2) + '\n')
  throw error
} finally {
  if (browser) await browser.close()
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM') } catch { /* Already exited. */ } }
  if (fixture) await new Promise(resolve => fixture.close(resolve))
}
