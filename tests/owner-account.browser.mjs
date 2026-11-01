import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, open, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { developmentEnvironment, LOCAL_PASSWORD } from './helpers/commerce-fixture.mjs'
import { BUSINESS_ID, OTHER_BUSINESS_ID, OWNER, createOwnerAccountFixture } from './helpers/owner-account-fixture.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
assert.equal((await readdir(root)).some(name => /^\.env(?:\.|$)/.test(name)), false, 'Do not load hosted .env configuration into isolated owner tests')
const artifacts = process.env.OWNER_BROWSER_ARTIFACTS || '/tmp/digital-dining-owner-account-browser'
const base = 'http://127.0.0.1:4320'
const env = developmentEnvironment()
let fixture, browser, server
const pageErrors = [], consoleErrors = [], externalRequestsBlocked = [], checkpoints = [], checks = []
await mkdir(artifacts, { recursive: true })

async function command(name, args, filename) {
  const log = await open(path.join(artifacts, filename), 'w')
  try {
    const child = spawn(name, args, { cwd: root, env, stdio: ['ignore', log.fd, log.fd] })
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${name} ${args.join(' ')} failed (${code}); see ${filename}`))) })
  } finally { await log.close() }
}

async function contextFor(caseName) {
  fixture.setCase(caseName)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (!['http://127.0.0.1:4319', base].includes(url.origin)) {
      externalRequestsBlocked.push(url.hostname)
      return route.abort('blockedbyclient')
    }
    // Gateway settings are irrelevant to admission. Do not contact a provider or
    // pretend an empty test settings response verifies payment configuration.
    if (url.origin === base && url.pathname === '/api/payment-gateways/config') return route.fulfill({ json: { success: true, keyId: '', hasSecret: false, offlinePaymentEnabled: true } })
    return route.continue()
  })
  const page = await context.newPage()
  page.on('pageerror', error => pageErrors.push({ case: caseName, message: error.message }))
  page.on('console', event => { if (event.type() === 'error') consoleErrors.push({ case: caseName, message: event.text() }) })
  page.setDefaultTimeout(20000)
  return { context, page }
}

async function login(page) {
  await page.goto(base + '/login')
  await page.getByLabel('Email address', { exact: true }).fill(OWNER.email)
  await page.getByLabel('Password', { exact: true }).fill(LOCAL_PASSWORD)
  await page.getByRole('button', { name: 'Log in to dashboard', exact: true }).click()
}

async function loginError(page, expected) {
  // The root layout also contains an empty ARIA alert live region. Wait for
  // the actual asynchronous login error, not merely an existing alert element.
  const alert = page.getByRole('alert').filter({ hasText: expected })
  await alert.waitFor({ state: 'visible' })
  return alert.innerText()
}

async function screenshotWidths(page, name) {
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
    assert.ok(dimensions.scroll <= dimensions.client + 1, `${name} overflow at ${width}: ${JSON.stringify(dimensions)}`)
    await page.screenshot({ path: path.join(artifacts, `${name}-${width}.png`), fullPage: true })
    checkpoints.push({ name, width, noHorizontalDocumentOverflow: true })
  }
}

async function hasFullRead() {
  return fixture.requests.some(item => item.path === '/rest/v1/restaurants' && item.query.select === '*')
}

try {
  fixture = await createOwnerAccountFixture()
  if (process.env.COMMERCE_BROWSER_SKIP_BUILD !== '1') await command('npm', ['run', 'build'], 'build.log')
  const log = await open(path.join(artifacts, 'next.log'), 'w')
  server = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', '4320'], { cwd: root, env, detached: true, stdio: ['ignore', log.fd, log.fd] })
  await log.close()
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Next.js exited before readiness')
    try { if ((await fetch(base + '/login')).status === 200) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.ok(ready, 'Owner browser Next.js readiness timeout')
  browser = await chromium.launch({ executablePath: process.env.COMMERCE_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })

  for (const status of ['pending', 'rejected', 'suspended']) {
    const { context, page } = await contextFor(status)
    await login(page)
    await page.waitForURL(base + '/dashboard/' + BUSINESS_ID)
    await page.getByRole('button', { name: 'Check Approval Again', exact: true }).waitFor()
    assert.equal(await hasFullRead(), false, `${status} must not read the full business dashboard`)
    assert.equal(fixture.requests.some(item => item.path === '/rest/v1/rpc/owner_get_restaurant_orders_secure'), false)
    assert.equal(fixture.mutations.length, 0)
    await screenshotWidths(page, 'owner-' + status)
    checks.push({ name: `${status} generated business ID resolves but dashboard remains locked`, result: 'PASS' })
    await context.close()
  }

  for (const name of ['approved', 'legacy']) {
    const { context, page } = await contextFor(name)
    await login(page)
    const id = name === 'legacy' ? OWNER.id : BUSINESS_ID
    await page.waitForURL(base + '/dashboard/' + id)
    await page.locator('.dd-owner-dashboard').waitFor()
    assert.equal(await hasFullRead(), true)
    assert.equal(fixture.mutations.length, 0)
    await screenshotWidths(page, 'owner-' + name)
    checks.push({ name: `${name} owner opens only their authorized dashboard`, result: 'PASS' })
    await context.close()
  }

  for (const name of ['orphan', 'multiple', 'collision']) {
    const { context, page } = await contextFor(name)
    await login(page)
    const expected = name === 'multiple' ? /multiple|select|support/i : /no restaurant|not connected|not linked|support/i
    const message = await loginError(page, expected)
    assert.match(message, expected)
    assert.equal(new URL(page.url()).pathname, '/login')
    assert.equal(await hasFullRead(), false)
    assert.equal(fixture.mutations.length, 0)
    await screenshotWidths(page, 'owner-' + name)
    checks.push({ name: `${name} identity cannot silently attach or select a business`, result: 'PASS' })
    await context.close()
  }

  // Establish a genuine local SDK session through the login form, then request
  // an explicit URL. The real Next handler validates the verified identity.
  for (const name of ['foreign', 'collision']) {
    const { context, page } = await contextFor(name)
    await login(page)
    await loginError(page, /no restaurant|not connected|not linked|support/i)
    const id = name === 'collision' ? OWNER.id : BUSINESS_ID
    const api = await page.evaluate(async id => {
      const state = JSON.parse(localStorage.getItem('sb-127-auth-token'))
      const response = await fetch('/api/owner/approval-status?restaurantId=' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + state.access_token } })
      return { status: response.status, body: await response.json() }
    }, id)
    assert.equal(api.status, 403)
    assert.equal(api.body.canAccessPortal, undefined)
    await page.goto(base + '/dashboard/' + id)
    await page.waitForURL(base + '/login')
    assert.equal(await hasFullRead(), false)
    checks.push({ name: `${name} explicit route rejected by server identity and dashboard`, result: 'PASS' })
    await context.close()
  }

  // Ambiguous generic login remains fail-closed, but a known explicitly owned
  // business is allowed through the same server approval endpoint.
  {
    const { context, page } = await contextFor('multiple')
    await login(page)
    await loginError(page, /multiple|select|support/i)
    await page.goto(base + '/dashboard/' + OTHER_BUSINESS_ID)
    await page.locator('.dd-owner-dashboard').waitFor()
    assert.ok(fixture.requests.some(item => item.path === '/rest/v1/restaurants' && item.query.id === 'eq.' + OTHER_BUSINESS_ID && item.query.select === '*'))
    checks.push({ name: 'multi-business owner can open an explicitly authorized business without arbitrary selection', result: 'PASS' })
    await context.close()
  }

  {
    const { context, page } = await contextFor('approved')
    await page.goto(base + '/dashboard/' + BUSINESS_ID)
    await page.waitForURL(base + '/login')
    await screenshotWidths(page, 'owner-login')
    assert.equal(await hasFullRead(), false)
    checks.push({ name: 'missing browser session denied without business reads', result: 'PASS' })
    await context.close()
  }
  assert.deepEqual(pageErrors, [])
  console.log(`PASS: ${checks.length} owner identity/admission cases; ${checkpoints.length} four-width screenshots; real Next.js and browser SDK with memory-only local Auth/REST fixture.`)
} catch (error) {
  await writeFile(path.join(artifacts, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, pageErrors, consoleErrors }, null, 2) + '\n')
  throw error
} finally {
  if (browser) await browser.close()
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM') } catch {}
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('exit', resolve); setTimeout(resolve, 3000) } })
  }
  if (fixture) await fixture.close()
  await writeFile(path.join(artifacts, 'owner-browser-summary.json'), JSON.stringify({
    result: checks.length === 12 && pageErrors.length === 0 ? 'PASS' : 'FAIL',
    cases: checks, screenshotCount: checkpoints.length, checkpoints, pageErrors, consoleErrors,
    ordinaryConsoleErrorsMonitored: true, externalRequestsBlocked: [...new Set(externalRequestsBlocked)],
    fixtureScope: 'Memory-only synthetic Auth/REST protocol fixture, not real hosted Auth/RLS or legacy financial workflows',
    hostedConnections: 0, productionWrites: false, realPasskeyDeviceTested: false,
  }, null, 2) + '\n')
}
