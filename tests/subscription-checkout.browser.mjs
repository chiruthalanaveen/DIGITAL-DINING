import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, open, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { developmentEnvironment } from './helpers/commerce-fixture.mjs'
import { BUSINESS_ID, OWNER, createOwnerAccountFixture } from './helpers/owner-account-fixture.mjs'

// This tests the real Next.js subscription UI, with a deliberately simulated
// widget and payment HTTP responses. It never calls a payment provider and does
// not claim to test the actual payment handler, hosted Auth or database RLS.
const root = fileURLToPath(new URL('../', import.meta.url))
assert.equal((await readdir(root)).some(name => /^\.env(?:\.|$)/.test(name)), false,
  'Hosted .env configuration is prohibited in this isolated browser build')
const artifacts = process.env.SUBSCRIPTION_BROWSER_ARTIFACTS || '/tmp/digital-dining-subscription-browser'
const base = 'http://127.0.0.1:4320'
const fixtureOrigin = 'http://127.0.0.1:4319'
const env = developmentEnvironment()
const widths = [360, 390, 768, 1440]
const cases = [], screenshots = [], pageErrors = [], consoleErrors = [], externalRequestsBlocked = []
const commands = []
let fixture, browser, server, failed = false
await mkdir(artifacts, { recursive: true })

async function command(executable, args, filename) {
  const log = await open(path.join(artifacts, filename), 'w')
  try {
    const child = spawn(executable, args, { cwd: root, env, stdio: ['ignore', log.fd, log.fd] })
    const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    commands.push({ executable, args, exitCode, log: filename })
    assert.equal(exitCode, 0, `${executable} ${args.join(' ')} failed; see ${filename}`)
  } finally { await log.close() }
}

const orderId = 'order_subscription_browser_only'
const paymentId = 'pay_subscription_browser_only'
const checkoutId = '83000000-0000-4000-8000-000000000001'
const signature = 'simulated_signature_not_a_real_payment'
const originalRestaurant = {
  id: BUSINESS_ID, name: 'Development Owner Restaurant', plan: 'Pro',
  plan_code: 'restaurant_pro', billing_cycle: '1month', subscription_status: 'active',
  subscription_expires_at: '2026-12-01T00:00:00.000Z', business_type: 'restaurant',
  resort_enabled: false, delivery_enabled: false,
}
const receipt = {
  checkout_id: checkoutId, provider_order_id: orderId, provider_payment_id: paymentId,
  amount_paise: 149900, currency: 'INR', activated_at: '2026-11-01T00:00:00.000Z',
  subscription_expires_at: originalRestaurant.subscription_expires_at,
}
const pendingMessage = 'Payment is authorized but has not been captured. The subscription has not been activated. Retry verification shortly; do not pay again.'
const disabledMessage = 'Paid subscription checkout is temporarily unavailable. If you already paid, do not pay again; contact support or retry verification after service is restored.'

async function scenario(name, width) {
  fixture.setCase('approved')
  const session = fixture.session()
  const calls = [], dialogs = []
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' })
  await context.addInitScript(({ localSession, simulatedOrder, simulatedPayment, simulatedSignature }) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify(localSession))
    window.__subscriptionWidget = { constructed: 0, opened: 0, completed: false, failure: null, events: [] }
    window.Razorpay = class SimulatedRazorpay {
      constructor(options) {
        this.options = options
        window.__subscriptionWidget.constructed += 1
        window.__subscriptionWidget.events.push('constructed')
      }
      on() {}
      open() {
        window.__subscriptionWidget.opened += 1
        window.__subscriptionWidget.events.push('opened')
        Promise.resolve(this.options.handler({
          razorpay_order_id: simulatedOrder, razorpay_payment_id: simulatedPayment,
          razorpay_signature: simulatedSignature,
        })).then(() => {
          window.__subscriptionWidget.completed = true
          window.__subscriptionWidget.events.push('handler-completed')
        }, error => {
          window.__subscriptionWidget.failure = String(error?.message || error)
          window.__subscriptionWidget.completed = true
        })
      }
    }
  }, { localSession: session, simulatedOrder: orderId, simulatedPayment: paymentId, simulatedSignature: signature })
  await context.route('**/*', async route => {
    const request = route.request()
    const address = new URL(request.url())
    if (![base, fixtureOrigin].includes(address.origin)) {
      externalRequestsBlocked.push(address.hostname)
      return route.abort('blockedbyclient')
    }
    if (address.origin === base && ['/api/create-order', '/api/verify-subscription'].includes(address.pathname)) {
      assert.equal(request.method(), 'POST')
      assert.equal(request.headers().authorization, `Bearer ${session.access_token}`)
      const body = request.postDataJSON()
      assert.equal(body.restaurantId, BUSINESS_ID)
      calls.push({ path: address.pathname, body, authenticated: true, simulated: true })
      if (address.pathname === '/api/create-order') {
        assert.equal(body.plan, 'restaurant_pro')
        assert.equal(body.billingCycle, '1month')
        if (name === 'disabled') return route.fulfill({ status: 503, json: {
          success: false, code: 'SUBSCRIPTION_PAYMENTS_DISABLED', message: disabledMessage,
        } })
        return route.fulfill({ json: {
          success: true, checkoutId, keyId: 'rzp_test_ui_simulation_only',
          orderId, amount: 149900, currency: 'INR',
          order: { id: orderId, amount: 149900, currency: 'INR', notes: { checkout_id: checkoutId } },
          planCode: 'restaurant_pro', billingCycle: '1month', planName: 'Restaurant',
        } })
      }
      assert.notEqual(name, 'disabled', 'Disabled checkout must never invoke verification')
      assert.equal(body.mode, 'payment')
      assert.equal(body.planCode, 'restaurant_pro')
      assert.equal(body.billingCycle, '1month')
      assert.equal(body.razorpay_order_id, orderId)
      assert.equal(body.razorpay_payment_id, paymentId)
      assert.equal(body.razorpay_signature, signature)
      if (name === 'authorized') return route.fulfill({ status: 202, json: {
        success: false, pending: true, code: 'PAYMENT_NOT_CAPTURED', message: pendingMessage,
      } })
      return route.fulfill({ json: {
        success: true, replayed: name === 'replay', receipt,
        restaurant: originalRestaurant,
        message: name === 'replay'
          ? 'This payment was already verified. No subscription changes were made.'
          : 'Restaurant subscription activated successfully.',
      } })
    }
    if (name === 'replay' && address.origin === fixtureOrigin && address.pathname === '/rest/v1/restaurants') {
      // The historical receipt is intentionally a different plan from this
      // synthetic current-business response. This remains a UI protocol model;
      // actual later-plan persistence is tested by the separate SQL harness.
      const current = { ...originalRestaurant, owner_id: OWNER.id, approval_status: 'approved',
        plan: 'Pro+', plan_code: 'restaurant_resort_delivery', business_type: 'restaurant_resort_delivery',
        resort_enabled: true, delivery_enabled: true }
      return route.fulfill({ json: String(request.headers().accept || '').includes('vnd.pgrst.object+json') ? current : [current] })
    }
    return route.continue()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', error => pageErrors.push({ scenario: name, width, message: error.message }))
  page.on('console', event => { if (event.type() === 'error') consoleErrors.push({ scenario: name, width, message: event.text() }) })
  page.on('dialog', async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss() })
  try {
    await page.goto(`${base}/subscribe/${BUSINESS_ID}?plan=restaurant_pro`)
    const pay = page.getByRole('button', { name: 'Continue to Razorpay', exact: true })
    await pay.waitFor()
    await pay.click()
    if (name === 'disabled') {
      await page.waitForFunction(() => window.__subscriptionWidget.constructed === 0)
      // The dialog is asynchronous; wait for the actual error event rather than
      // assuming a visible button means the server response has rendered.
      for (let attempt = 0; dialogs.length === 0 && attempt < 100; attempt++) await page.waitForTimeout(20)
      assert.equal(dialogs.length, 1)
      assert.ok(dialogs[0].message.includes(disabledMessage))
      await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button =>
        button.textContent.trim() === 'Continue to Razorpay' && !button.disabled))
      assert.equal(await page.getByRole('heading', { name: 'Subscription activated', exact: true }).count(), 0)
      assert.equal(await page.getByRole('heading', { name: 'Payment already verified', exact: true }).count(), 0)
      assert.deepEqual(calls.map(call => call.path), ['/api/create-order'])
      assert.equal((await page.evaluate(() => window.__subscriptionWidget)).opened, 0)
      assert.equal(await pay.isEnabled(), true)
    } else {
      await page.waitForFunction(() => window.__subscriptionWidget.completed)
      const widget = await page.evaluate(() => window.__subscriptionWidget)
      assert.equal(widget.failure, null)
      assert.equal(widget.constructed, 1)
      assert.equal(widget.opened, 1)
      assert.deepEqual(widget.events, ['constructed', 'opened', 'handler-completed'])
      assert.deepEqual(calls.map(call => call.path), ['/api/create-order', '/api/verify-subscription'])
      if (name === 'authorized') {
        assert.equal(dialogs.length, 1)
        assert.ok(dialogs[0].message.includes(pendingMessage))
        await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button =>
          button.textContent.trim() === 'Continue to Razorpay' && !button.disabled))
        assert.equal(await page.getByRole('heading', { name: 'Subscription activated', exact: true }).count(), 0)
        assert.equal(await page.getByRole('heading', { name: 'Payment already verified', exact: true }).count(), 0)
        assert.equal(await pay.isEnabled(), true)
      } else if (name === 'replay') {
        await page.getByRole('heading', { name: 'Payment already verified', exact: true }).waitFor()
        await page.getByText('Originally verified plan', { exact: true }).waitFor()
        await page.getByText('No subscription changes were made. Open your dashboard to view your current subscription status.', { exact: true }).waitFor()
        assert.equal(await page.getByText('Active plan', { exact: true }).count(), 0)
        assert.equal(await page.getByText('Your Digital Dining workspace has been updated successfully.', { exact: true }).count(), 0)
        assert.equal(await page.getByRole('heading', { name: 'Subscription activated', exact: true }).count(), 0)
        await page.getByRole('button', { name: 'Go to Dashboard', exact: true }).waitFor()
      } else {
        await page.getByRole('heading', { name: 'Subscription activated', exact: true }).waitFor()
        await page.getByText('Active plan', { exact: true }).waitFor()
        await page.getByText('Your Digital Dining workspace has been updated successfully.', { exact: true }).waitFor()
        assert.equal(await page.getByRole('heading', { name: 'Payment already verified', exact: true }).count(), 0)
      }
    }
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
    assert.ok(dimensions.scroll <= dimensions.client + 1, `${name} has horizontal overflow at ${width}: ${JSON.stringify(dimensions)}`)
    const screenshot = `${name}-${width}.png`
    await page.screenshot({ path: path.join(artifacts, screenshot), fullPage: true })
    screenshots.push({ scenario: name, width, file: screenshot, noHorizontalDocumentOverflow: true })
    assert.equal(fixture.mutations.length, 0, 'UI simulations must not write any business records')
    cases.push({ scenario: name, width, result: 'PASS', calls, dialogs,
      ...(name === 'replay' ? { historicalPlan: 'restaurant_pro', simulatedCurrentPlan: 'restaurant_resort_delivery' } : {}) })
  } finally { await context.close() }
}

try {
  fixture = await createOwnerAccountFixture()
  fixture.setCase('approved')
  if (process.env.COMMERCE_BROWSER_SKIP_BUILD !== '1') await command('npm', ['run', 'build'], 'build.log')
  const log = await open(path.join(artifacts, 'next.log'), 'w')
  server = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', '4320'], {
    cwd: root, env, detached: true, stdio: ['ignore', log.fd, log.fd],
  })
  await log.close()
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Next.js exited before subscription browser readiness')
    try { if ((await fetch(base + '/login')).status === 200) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.ok(ready, 'Subscription browser Next.js readiness timeout')
  browser = await chromium.launch({ executablePath: process.env.COMMERCE_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })
  for (const name of ['fresh', 'replay', 'authorized', 'disabled']) {
    for (const width of widths) await scenario(name, width)
  }
  assert.deepEqual(pageErrors, [])
  assert.equal(cases.length, 16)
  console.log('PASS: 16 simulated subscription UI cases and 16 screenshots across four widths; zero provider calls or business writes.')
} catch (error) {
  failed = true
  await writeFile(path.join(artifacts, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, cases, pageErrors, consoleErrors }, null, 2) + '\n')
  throw error
} finally {
  if (browser) await browser.close()
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM') } catch {}
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('exit', resolve); setTimeout(resolve, 3000) } })
  }
  if (fixture) await fixture.close()
  await writeFile(path.join(artifacts, 'subscription-browser-summary.json'), JSON.stringify({
    result: !failed && cases.length === 16 && pageErrors.length === 0 ? 'PASS' : 'FAIL',
    cases, widths, screenshotCount: screenshots.length, screenshots, pageErrors, consoleErrors,
    ordinaryConsoleErrorsMonitored: true, externalRequestsBlocked: [...new Set(externalRequestsBlocked)],
    commands, fixtureScope: 'Actual Next.js UI with memory-only Auth/REST fixture and fully simulated payment widget/API responses',
    paymentAPIHandlersTestedByThisScript: false, databaseRLSOrAtomicityTestedByThisScript: false,
    realProviderTested: false, hostedConnections: 0, productionWrites: false,
  }, null, 2) + '\n')
}
