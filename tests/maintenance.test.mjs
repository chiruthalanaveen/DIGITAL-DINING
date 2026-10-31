import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')

// Compile the existing modules in memory and replace only their dependencies.
// These tests never connect to Supabase or read an actual admin credential.
function loadModule(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath)
  const loaded = new Module(filename)
  const nativeRequire = createRequire(filename)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded.require = (specifier) => Object.hasOwn(mocks, specifier)
    ? mocks[specifier]
    : nativeRequire(specifier)
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename)
  return loaded.exports
}

function setFallback(t, value) {
  const previous = process.env.MAINTENANCE_MODE
  if (value === undefined) delete process.env.MAINTENANCE_MODE
  else process.env.MAINTENANCE_MODE = value
  t.after(() => {
    if (previous === undefined) delete process.env.MAINTENANCE_MODE
    else process.env.MAINTENANCE_MODE = previous
  })
}

function fixture(overrides = {}) {
  const state = {
    row: null,
    readError: null,
    writeError: null,
    auditError: null,
    reads: 0,
    writes: 0,
    audits: [],
    ...overrides,
  }
  const admin = {
    from(table) {
      if (table === 'admin_audit_logs') {
        return {
          insert(entry) {
            return {
              async abortSignal(signal) {
                assert.ok(signal instanceof AbortSignal)
                if (!state.auditError) state.audits.push(entry)
                return { error: state.auditError }
              },
            }
          },
        }
      }
      assert.equal(table, 'platform_settings')
      let update = null
      const query = {
        select(columns) { assert.equal(columns, 'status,updated_at'); return query },
        eq(column, value) {
          assert.equal(column, 'key')
          assert.equal(value, 'website_status')
          return query
        },
        maybeSingle() { return query },
        single() { return query },
        upsert(value, options) {
          assert.equal(options.onConflict, 'key')
          assert.equal(value.key, 'website_status')
          update = value
          return query
        },
        async abortSignal(signal) {
          assert.ok(signal instanceof AbortSignal)
          if (update) {
            state.writes += 1
            if (state.writeError) return { data: null, error: state.writeError }
            state.row = { ...update }
          } else {
            state.reads += 1
            if (state.readError) return { data: null, error: state.readError }
          }
          return { data: state.row && { ...state.row }, error: null }
        },
      }
      return query
    },
  }
  const adminModule = { getAdminSupabase: () => admin }
  const createReader = () => loadModule('lib/server/maintenanceSettings.js', {
    './adminSupabase': adminModule,
  })
  const settings = createReader()
  const api = loadModule('app/api/admin/maintenance/route.js', {
    '@/lib/server/adminSupabase': adminModule,
    '@/lib/server/adminRequestOrigin': loadModule('lib/server/adminRequestOrigin.js'),
    '@/lib/server/maintenanceSettings': settings,
    '@/lib/server/adminSession': {
      requireAdmin: (request) => request.headers.get('x-test-admin') === 'yes'
        ? { email: 'admin@example.test' }
        : null,
    },
  })
  const { proxy } = loadModule('proxy.ts', {
    './lib/server/maintenanceSettings': settings,
    './lib/maintenance-page': { maintenancePage: '<!doctype html><title>Maintenance</title>' },
  })
  return { state, admin, settings, createReader, api, proxy }
}

function request({ enabled, body, authenticated = true, origin = 'https://dining.example', fetchSite = 'same-origin' } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (authenticated) headers['x-test-admin'] = 'yes'
  if (origin !== null) headers.origin = origin
  if (fetchSite !== null) headers['sec-fetch-site'] = fetchSite
  return new NextRequest('https://dining.example/api/admin/maintenance', {
    method: 'POST',
    headers,
    body: body === undefined ? JSON.stringify({ enabled }) : body,
  })
}

test('existing website status maps Working to off and Not Working to on', async () => {
  const { state, settings } = fixture()
  for (const [status, enabled] of [['Working', false], ['Not Working', true]]) {
    state.row = { status, updated_at: '2026-10-22T12:00:00.000Z' }
    assert.deepEqual(await settings.getMaintenanceSettings(), {
      enabled, updatedAt: state.row.updated_at,
    })
  }
})

test('same-origin checks use the browser destination when Next.js normalizes the hostname', async () => {
  const { api, state } = fixture()
  const headers = {
    host: '127.0.0.1:4320',
    origin: 'http://127.0.0.1:4320',
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json',
    'x-test-admin': 'yes',
  }
  const makeRequest = (origin) => new NextRequest('http://localhost:4320/api/admin/maintenance', {
    method: 'POST',
    headers: { ...headers, origin },
    body: JSON.stringify({ enabled: false }),
  })
  assert.equal((await api.POST(makeRequest(headers.origin))).status, 200)
  assert.equal(state.row.status, 'Working')
  assert.equal((await api.POST(makeRequest('http://localhost:4320'))).status, 403)
  assert.equal((await api.POST(makeRequest('https://untrusted.example.test'))).status, 403)
  assert.equal(state.writes, 1)
})

test('a missing setting uses the environment fallback, defaulting to on', async (t) => {
  setFallback(t, undefined)
  const { settings } = fixture()
  assert.deepEqual(await settings.getMaintenanceSettings(), { enabled: true, updatedAt: null })
  process.env.MAINTENANCE_MODE = 'false'
  assert.equal((await settings.getMaintenanceSettings()).enabled, false)
  process.env.MAINTENANCE_MODE = 'true'
  assert.equal((await settings.getMaintenanceSettings()).enabled, true)
})

test('saved state takes precedence over the environment fallback in both directions', async (t) => {
  setFallback(t, 'false')
  const { state, settings } = fixture({ row: { status: 'Not Working' } })
  assert.equal(await settings.maintenanceEnabled(), true)
  process.env.MAINTENANCE_MODE = 'true'
  state.row.status = 'Working'
  assert.equal(await settings.maintenanceEnabled(), false)
})

test('read failures reject admin reads but public checks use the fallback', async (t) => {
  setFallback(t, 'true')
  const { settings } = fixture({ readError: { message: 'database unavailable' } })
  await assert.rejects(settings.getMaintenanceSettings(), /Unable to load/)
  assert.equal(await settings.maintenanceEnabled(), true)
  process.env.MAINTENANCE_MODE = 'false'
  assert.equal(await settings.maintenanceEnabled(), false)
})

test('two independent readers immediately observe the same persisted on/off setting', async () => {
  const { state, settings: first, createReader } = fixture()
  const second = createReader()
  await first.setMaintenanceSettings(true)
  assert.equal(state.row.status, 'Not Working')
  assert.equal((await second.getMaintenanceSettings()).enabled, true)
  await second.setMaintenanceSettings(false)
  assert.equal(state.row.status, 'Working')
  assert.equal((await first.getMaintenanceSettings()).enabled, false)
  assert.equal(state.writes, 2)
})

test('unauthenticated GET and POST return 401 without accessing storage', async () => {
  const { state, api } = fixture()
  const get = await api.GET(new NextRequest('https://dining.example/api/admin/maintenance'))
  const post = await api.POST(request({ enabled: false, authenticated: false }))
  assert.equal(get.status, 401)
  assert.equal(post.status, 401)
  assert.equal(state.reads + state.writes + state.audits.length, 0)
})

test('admin writes require a same-origin request', async () => {
  const { state, api } = fixture()
  for (const options of [{ origin: null }, { origin: 'https://other.example' }, { fetchSite: 'cross-site' }]) {
    assert.equal((await api.POST(request({ enabled: false, ...options }))).status, 403)
  }
  assert.equal(state.reads + state.writes + state.audits.length, 0)
})

test('invalid enabled values and malformed JSON return 400 without writes', async () => {
  const { state, api } = fixture()
  for (const body of ['{}', 'null', '[]', '{"enabled":"false"}', '{"enabled":0}', 'broken-json']) {
    assert.equal((await api.POST(request({ body }))).status, 400)
  }
  assert.equal(state.reads + state.writes + state.audits.length, 0)
})

test('authenticated on/off writes return saved state and create audit entries', async () => {
  const { state, api } = fixture({ row: { status: 'Working', updated_at: null } })
  for (const enabled of [true, false]) {
    const response = await api.POST(request({ enabled }))
    const result = await response.json()
    assert.equal(response.status, 200)
    assert.equal(result.success, true)
    assert.equal(result.enabled, enabled)
    assert.equal(result.auditLogged, true)
    assert.ok(Number.isFinite(Date.parse(result.updatedAt)))
    assert.match(response.headers.get('cache-control'), /private.*no-store/)
    const audit = state.audits.at(-1)
    assert.equal(audit.actor_email, 'admin@example.test')
    assert.equal(audit.action, 'set_maintenance_mode')
    assert.equal(audit.entity_id, 'website_status')
    assert.equal(audit.before_data.enabled, !enabled)
    assert.equal(audit.after_data.enabled, enabled)
  }
  const response = await api.GET(new NextRequest('https://dining.example/api/admin/maintenance', {
    headers: { 'x-test-admin': 'yes' },
  }))
  assert.equal((await response.json()).enabled, false)
  assert.equal(state.writes, 2)
})

test('database read and write failures return 503 rather than reporting saved state', async () => {
  const { state, api } = fixture({ readError: { message: 'read failed' } })
  const get = new NextRequest('https://dining.example/api/admin/maintenance', {
    headers: { 'x-test-admin': 'yes' },
  })
  assert.equal((await api.GET(get)).status, 503)
  assert.equal((await api.POST(request({ enabled: true }))).status, 503)
  assert.equal(state.writes, 0)
  state.readError = null
  state.writeError = { message: 'write failed' }
  const response = await api.POST(request({ enabled: true }))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).success, false)
  assert.equal(state.audits.length, 0)
})

test('an audit failure keeps a successful setting write and reports the warning', async () => {
  const { state, api } = fixture({ auditError: { message: 'audit failed' } })
  const response = await api.POST(request({ enabled: false }))
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(result.success, true)
  assert.equal(result.enabled, false)
  assert.equal(result.auditLogged, false)
  assert.equal(state.row.status, 'Working')
})

test('admin pages bypass maintenance checks even when shared storage is unavailable', async () => {
  const { state, proxy } = fixture({ readError: { message: 'unavailable' } })
  for (const pathname of ['/admin', '/admin/dashboard', '/admin/delivery-advertisements']) {
    const response = await proxy(new NextRequest(`https://dining.example${pathname}`))
    assert.equal(response.headers.get('x-middleware-next'), '1')
  }
  assert.equal(state.reads, 0)
})

test('proxy reflects persisted changes and does not bypass similarly named public routes', async () => {
  const { state, proxy } = fixture({ row: { status: 'Not Working' } })
  const response = await proxy(new NextRequest('https://dining.example/administrator'))
  assert.equal(response.status, 503)
  assert.match(response.headers.get('cache-control'), /no-store/)
  assert.equal(response.headers.get('retry-after'), '300')
  state.row.status = 'Working'
  const restored = await proxy(new NextRequest('https://dining.example/login'))
  assert.equal(restored.headers.get('x-middleware-next'), '1')
  state.row.status = 'Not Working'
  const head = await proxy(new NextRequest('https://dining.example/login', { method: 'HEAD' }))
  assert.equal(head.status, 503)
  assert.equal(await head.text(), '')
})
