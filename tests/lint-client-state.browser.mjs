import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, open, readFile, readdir, writeFile } from 'node:fs/promises'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { developmentEnvironment, LOCAL_PASSWORD } from './helpers/commerce-fixture.mjs'
import { BUSINESS_ID, OWNER, createOwnerAccountFixture } from './helpers/owner-account-fixture.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
// Already present through the repository's locked Prisma toolchain. No test
// route, production import or dependency/package change is installed by this test.
const { build } = require('esbuild')
const artifacts = process.env.LINT_CLIENT_BROWSER_ARTIFACTS || '/tmp/digital-dining-lint-client-state-browser'
const componentsOnly = process.argv.includes('--components-only')
const base = 'http://127.0.0.1:4320'
const env = developmentEnvironment()
assert.equal((await readdir(root)).some(name => /^\.env(?:\.|$)/.test(name)), false)
await mkdir(artifacts, { recursive: true })
const checks = [], screenshots = [], pageErrors = [], hydrationErrors = [], blockedExternal = [], blockedMutations = []
let fixture, server, browser

// Render the actual small components in an intercepted browser document. This
// makes all three install variants reachable without adding a product route.
// It verifies React SSR/hydration and event behavior, not Next's CSS compiler.
// Owner controls below run through the real Next.js pages and local SDK session.
async function componentHarness() {
  const component = `
    import React, { useEffect, useState } from 'react';
    import ThemeToggle from '@/app/components/ThemeToggle.jsx';
    import MainInstall from '@/app/components/InstallAppButton.jsx';
    import NativeInstall from '@/app/app/components/InstallAppButton.jsx';
    import DDInstall from '@/app/components/DDAppInstall.jsx';
    import SeasonalAds from '@/app/components/DeliverySeasonalAds.jsx';
    export default function Harness() {
      const [store, setStore] = useState('saree');
      useEffect(() => { document.documentElement.dataset.harnessReady = 'true'; }, []);
      return <main>
        <section data-testid="theme"><ThemeToggle /></section>
        <section data-testid="main-install"><MainInstall /></section>
        <section data-testid="native-install"><NativeInstall /></section>
        <section data-testid="dd-install"><DDInstall /></section>
        <button onClick={() => setStore('grocery')}>Use grocery store</button>
        <button onClick={() => setStore('saree')}>Use saree store</button>
        <section data-testid="ads"><SeasonalAds restaurantCode={store} /></section>
      </main>;
    }
  `
  const plugin = {
    name: 'isolated-client-components',
    setup(buildContext) {
      buildContext.onResolve({ filter: /^@\// }, args => ({ path: require.resolve(path.join(root, args.path.slice(2))) }))
      buildContext.onLoad({ filter: /\/lib\/appDialog(?:\.js)?$/ }, () => ({
        contents: 'export async function appNotice(message) { window.__testNotices = [...(window.__testNotices || []), message]; }',
        loader: 'js',
      }))
      buildContext.onLoad({ filter: /\.jsx$/ }, async args => ({
        // Next normally removes these styled-jsx marker props. Keep the same
        // CSS text as an ordinary global style for this component-only harness.
        contents: (await readFile(args.path, 'utf8')).replaceAll('<style jsx global>', '<style>'),
        loader: 'jsx',
      }))
      buildContext.onResolve({ filter: /^harness-component$/ }, () => ({ path: 'harness-component', namespace: 'memory' }))
      buildContext.onLoad({ filter: /.*/, namespace: 'memory' }, () => ({ contents: component, loader: 'jsx', resolveDir: root }))
    },
  }
  const common = { bundle: true, write: false, plugins: [plugin], loader: { '.css': 'empty' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' }
  const ssr = await build({ ...common, platform: 'node', format: 'cjs', external: ['react', 'react/*', 'react-dom/*'], stdin: { contents: 'import React from "react"; import { renderToString } from "react-dom/server"; import Harness from "harness-component"; export const html = renderToString(<Harness />);', resolveDir: root, loader: 'jsx' } })
  const compiled = new Module(path.join(root, 'tests/lint-client-component-harness.cjs'))
  compiled.filename = path.join(root, 'tests/lint-client-component-harness.cjs')
  compiled.paths = Module._nodeModulePaths(root)
  compiled._compile(ssr.outputFiles[0].text, compiled.filename)
  const client = await build({ ...common, platform: 'browser', format: 'iife', stdin: { contents: 'import React from "react"; import { hydrateRoot } from "react-dom/client"; import Harness from "harness-component"; hydrateRoot(document.getElementById("root"), <Harness />);', resolveDir: root, loader: 'jsx' } })
  return { html: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root">' + compiled.exports.html + '</div><script src="/__lint-client-harness/client.js"></script></body></html>', js: client.outputFiles[0].text }
}

async function command(name, args, filename) {
  const log = await open(path.join(artifacts, filename), 'w')
  try {
    const child = spawn(name, args, { cwd: root, env, stdio: ['ignore', log.fd, log.fd] })
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${name} ${args.join(' ')} failed (${code})`))) })
  } finally { await log.close() }
}

async function contextFor({ standalone = false, harness = null, ads = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await context.addInitScript(({ standalone, origin }) => {
    if (location.origin !== origin) return
    if (!localStorage.getItem('digitaldining-theme')) localStorage.setItem('digitaldining-theme', 'light')
    if (!localStorage.getItem('digital-dine-mobile-experience-v1')) localStorage.setItem('digital-dine-mobile-experience-v1', JSON.stringify({ darkMode: false, theme: 'ocean', textSize: 'normal' }))
    const original = window.matchMedia.bind(window), listeners = new Set()
    let installed = standalone
    const media = { media: '(display-mode: standalone)', get matches() { return installed }, addEventListener(type, listener) { if (type === 'change') listeners.add(listener) }, removeEventListener(type, listener) { if (type === 'change') listeners.delete(listener) } }
    window.matchMedia = query => query === media.media ? media : original(query)
    window.__setTestStandalone = value => { installed = value; for (const listener of listeners) listener({ matches: value, media: media.media }) }
    window.__dispatchTestPrompt = (outcome = 'dismissed') => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      event.prompt = async () => { window.__promptCalls = (window.__promptCalls || 0) + 1 }
      event.userChoice = Promise.resolve({ outcome })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
  }, { standalone, origin: base })
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (![base, 'http://127.0.0.1:4319'].includes(url.origin)) { blockedExternal.push(url.hostname); return route.abort('blockedbyclient') }
    if (harness && url.pathname === '/__lint-client-harness') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: harness.html })
    if (harness && url.pathname === '/__lint-client-harness/client.js') return route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: harness.js })
    if (url.pathname === '/api/delivery/seasonal-ads' && ads) return ads(route, url)
    // Components-only mode serves a virtual document through interception. No
    // fixture, HTTP listener or real request to the application is permitted.
    if (componentsOnly) return route.abort('blockedbyclient')
    if (url.pathname === '/api/payment-gateways/config') return route.fulfill({ json: { success: true, keyId: '', hasSecret: false, offlinePaymentEnabled: true } })
    if (url.origin === base && !['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
      blockedMutations.push({ method: route.request().method(), path: url.pathname })
      return route.fulfill({ status: 403, json: { message: 'Mutations outside this read-only browser regression are forbidden.' } })
    }
    return route.continue()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', event => { if (event.type() === 'error' && /hydration|hydrating|did not match|server rendered|minified react error #(418|423|425)/i.test(event.text())) hydrationErrors.push(event.text()) })
  return { context, page }
}

async function screenshot(page, name) {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => document.fonts.ready)
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
    assert.ok(dimensions.scroll <= dimensions.client + 1, `${name} overflow: ${JSON.stringify(dimensions)}`)
    await page.screenshot({ path: path.join(artifacts, `${name}-${width}.png`), fullPage: true })
    screenshots.push({ name, width, noHorizontalDocumentOverflow: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
}

if (process.argv.includes('--check-harness')) {
  const harness = await componentHarness()
  assert.ok(harness.html.includes('data-testid="main-install"'))
  assert.ok(harness.js.length > 1000)
  console.log('PASS: component SSR and browser bundles compile; no server or network started.')
  process.exit(0)
}

try {
  const harness = await componentHarness()
  if (!componentsOnly) {
    fixture = await createOwnerAccountFixture()
    if (process.env.COMMERCE_BROWSER_SKIP_BUILD !== '1') await command('npm', ['run', 'build'], 'build.log')
    const log = await open(path.join(artifacts, 'next.log'), 'w')
    server = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', '4320'], { cwd: root, env, detached: true, stdio: ['ignore', log.fd, log.fd] })
    await log.close()
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error('Next.js exited before readiness')
      try { if ((await fetch(base + '/login')).status === 200) { ready = true; break } } catch { /* Retry local startup only. */ }
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    assert.ok(ready, 'Next.js readiness timeout')
  }
  browser = await chromium.launch({ executablePath: process.env.COMMERCE_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] })

  // A deferred old-store request completes after a different store renders.
  // That stale result must not replace the active campaign; retry remounts only ads.
  {
    let oldRoute, groceryCalls = 0
    const ads = async (route, url) => {
      const code = url.searchParams.get('restaurantCode')
      if (code === 'saree' && !oldRoute) { oldRoute = route; return }
      if (code === 'grocery' && ++groceryCalls === 1) return route.fulfill({ status: 503, json: { success: false } })
      return route.fulfill({ json: { success: true, campaigns: [{ id: code, headline: code === 'grocery' ? 'Grocery fixture offer' : 'Saree stale offer', button_label: 'Browse fixture', button_action: 'browse' }] } })
    }
    const { context, page } = await contextFor({ harness, ads })
    await page.goto(base + '/__lint-client-harness')
    await page.waitForFunction(() => document.documentElement.dataset.harnessReady === 'true')
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
    await page.getByRole('button', { name: 'Switch to night mode' }).click()
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark' && localStorage.getItem('digitaldining-theme') === 'dark')
    checks.push({ name: 'saved light theme hydrates, toggles visually and persists', scope: 'component SSR/hydration', result: 'PASS' })
    await page.getByRole('button', { name: 'Use grocery store' }).click()
    await page.getByRole('button', { name: 'Retry ads' }).waitFor()
    await page.getByRole('button', { name: 'Retry ads' }).click()
    await page.getByRole('heading', { name: 'Grocery fixture offer' }).waitFor()
    assert.ok(oldRoute, 'Old store request must have started')
    await oldRoute.fulfill({ json: { success: true, campaigns: [{ id: 'old', headline: 'Saree stale offer' }] } }).catch(() => {})
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.getByRole('heading', { name: 'Saree stale offer' }).count(), 0)
    assert.equal(await page.getByRole('heading', { name: 'Grocery fixture offer' }).count(), 1)
    checks.push({ name: 'store-key change and retry reject an old-store campaign response', scope: 'actual component with browser HTTP stubs', result: 'PASS' })
    await page.getByTestId('main-install').getByRole('button', { name: 'Install app', exact: true }).click()
    await page.getByRole('heading', { name: 'Add this site as an app' }).waitFor()
    await page.getByRole('button', { name: 'Got it', exact: true }).click()
    assert.equal(await page.evaluate(() => window.__dispatchTestPrompt('accepted')), true)
    await page.getByTestId('main-install').getByRole('button', { name: 'Install app', exact: true }).click()
    assert.equal(await page.getByTestId('main-install').getByRole('button', { name: 'App installed', exact: true }).count(), 0, 'Global install waits for the authoritative event')
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
    await page.getByTestId('main-install').getByRole('button', { name: 'App installed', exact: true }).waitFor()
    assert.equal(await page.getByTestId('main-install').getByRole('button').isDisabled(), true)
    await page.getByTestId('native-install').getByText('App Installed', { exact: false }).waitFor()
    assert.equal(await page.getByTestId('dd-install').getByRole('button').count(), 0)
    checks.push({ name: 'manual installation help, accepted prompt and installation event preserve all three variant contracts', scope: 'synthetic browser installation events; no actual install', result: 'PASS' })
    await page.reload()
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
    await context.close()
  }
  {
    const { context, page } = await contextFor({ standalone: true, harness, ads: route => route.fulfill({ json: { success: true, campaigns: [] } }) })
    await page.goto(base + '/__lint-client-harness')
    await page.getByTestId('main-install').getByRole('button', { name: 'App installed', exact: true }).waitFor()
    assert.equal(await page.getByTestId('main-install').getByRole('button').isDisabled(), true)
    await page.getByTestId('native-install').getByText('App Installed', { exact: false }).waitFor()
    assert.equal(await page.getByTestId('dd-install').getByRole('button').count(), 0)
    await page.evaluate(() => window.__setTestStandalone(false))
    await page.getByTestId('main-install').getByRole('button', { name: 'Install app', exact: true }).waitFor()
    await page.getByTestId('native-install').getByRole('button', { name: 'Add App', exact: false }).waitFor()
    await page.getByTestId('dd-install').getByRole('button', { name: 'Install app', exact: true }).waitFor()
    await page.evaluate(() => window.__setTestStandalone(true))
    await page.getByTestId('main-install').getByRole('button', { name: 'App installed', exact: true }).waitFor()
    checks.push({ name: 'standalone display mode hydrates and responds to display-mode changes', scope: 'mocked display-mode media query', result: 'PASS' })
    await context.close()
  }

  // Real Next pages, real SDK session, synthetic local Auth/REST only.
  if (!componentsOnly) {
    fixture.setCase('approved')
    const { context, page } = await contextFor()
    await page.goto(base + '/login')
    await page.getByLabel('Email address', { exact: true }).fill(OWNER.email)
    await page.getByLabel('Password', { exact: true }).fill(LOCAL_PASSWORD)
    await page.getByRole('button', { name: 'Log in to dashboard', exact: true }).click()
    await page.waitForURL(base + '/dashboard/' + BUSINESS_ID)
    await page.locator('.dd-owner-dashboard').waitFor()
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
    await screenshot(page, 'web-owner-hydrated')
    await page.goto(base + '/app/owner/' + BUSINESS_ID)
    await page.locator('.dd-owner-dashboard').waitFor()
    await page.getByRole('button', { name: 'More owner tools', exact: true }).click()
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
    await page.getByRole('heading', { name: 'App settings', exact: true }).waitFor()
    const dark = page.getByRole('switch', { name: 'Dark mode', exact: true })
    assert.equal(await dark.getAttribute('aria-checked'), 'false')
    await dark.click()
    await page.waitForFunction(() => document.documentElement.dataset.ddDarkMode === 'true')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.waitForFunction(() => document.documentElement.dataset.ddDarkMode === 'false')
    await page.getByRole('button', { name: 'More owner tools', exact: true }).click()
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
    assert.equal(await dark.getAttribute('aria-checked'), 'false')
    await dark.click()
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('digital-dine-mobile-experience-v1')).darkMode), true)
    await page.getByRole('button', { name: 'More owner tools', exact: true }).click()
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
    assert.equal(await dark.getAttribute('aria-checked'), 'true')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.reload()
    await page.locator('.dd-owner-dashboard').waitFor()
    await page.waitForFunction(() => document.documentElement.dataset.ddDarkMode === 'true')
    await screenshot(page, 'native-owner-preferences-saved')
    assert.equal(fixture.mutations.length, 0)
    checks.push({ name: 'web/native owner hydration and preference cancel/save/reopen/reload', scope: 'real Next.js pages and local SDK; device storage only', result: 'PASS' })
    await context.close()
  }
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(hydrationErrors, [])
  assert.deepEqual(blockedMutations, [])
  console.log(componentsOnly
    ? `PASS (component coverage only): ${checks.length} SSR/hydration/event groups; real Next.js owner checks and layout screenshots were skipped. No HTTP listeners or hosted credentials used.`
    : `PASS: ${checks.length} client-state regression groups; ${screenshots.length} mobile/desktop screenshots; no hosted credentials or business mutations.`)
} catch (error) {
  await writeFile(path.join(artifacts, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, checks, pageErrors, hydrationErrors }, null, 2) + '\n')
  throw error
} finally {
  if (browser) await browser.close()
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM') } catch { /* Already stopped. */ } }
  if (fixture) await fixture.close()
  await writeFile(path.join(artifacts, 'summary.json'), JSON.stringify({ mode: componentsOnly ? 'components-only' : 'components-and-next-owner-pages', ownerPageChecksRun: !componentsOnly, localServerStarted: Boolean(server), localFixtureStarted: Boolean(fixture), checks, screenshots, pageErrors, hydrationErrors, blockedExternal, blockedMutations, businessMutations: fixture?.mutations || [], hostedCredentialsUsed: false, limitations: ['Component harness uses real source with CSS imports omitted and styled-jsx markers removed; it is not Next compiler/layout verification.', ...(componentsOnly ? ['Real Next.js owner-page workflows and mobile/desktop layout checks were skipped; no HTTP server or Auth fixture was started.'] : []), 'Synthetic PWA media/events do not perform an actual browser installation.', 'Memory-only Auth/REST does not verify hosted Supabase Auth, RLS, payment or financial RPC behavior.'] }, null, 2) + '\n')
}
