import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const root = fileURLToPath(new URL('../', import.meta.url))
const ownerId = '11111111-1111-4111-8111-111111111111'
const websiteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherWebsiteId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function fixture(t, overrides = {}) {
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'development-anon-key', COMMERCE_CUSTOM_DOMAINS_ENABLED: '', COMMERCE_DOMAIN_PROVISIONING_ENABLED: '', COMMERCE_VERCEL_PROJECT_ID: '', COMMERCE_VERCEL_TEAM_ID: '', COMMERCE_VERCEL_API_TOKEN: '', COMMERCE_DOMAIN_BASE_HOSTNAME: '' })) {
    const previous = process.env[key]
    process.env[key] = value
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
  const state = {
    user: { id: ownerId, email: 'owner@example.test', email_confirmed_at: '2026-10-22T00:00:00Z' },
    calls: [], clients: [], adminClients: 0, queryError: null, rpcError: null,
    tables: {
      commerce_websites: [{ id: websiteId, name: 'First Store', slug: 'first-store', status: 'active', business_type: 'general', owner_permissions: { products: true, categories: true, inventory: true, orders: true, branding: true, customers: false }, features: { catalog: true, inventory: true, cod: true } }],
      commerce_memberships: [{ website_id: websiteId, user_id: ownerId, role: 'owner', active: true }],
      commerce_products: [], commerce_categories: [], commerce_orders: [], commerce_order_items: [], commerce_customers: [], commerce_applications: [], commerce_audit_logs: [],
    },
    rpcResults: {},
    ...overrides,
  }
  const client = {
    auth: { async getUser(token) { state.calls.push({ auth: token }); return token === 'valid-test-token' ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: 'expired' } } } },
    from(table) {
      const record = { table, filters: [] }; state.calls.push(record)
      let single = false
      const query = {
        select(fields) { record.select = fields; return query },
        eq(key, value) { record.filters.push([key, value]); return query },
        in(key, values) { record.filters.push([key, values]); return query },
        order() { return query },
        limit(maximum) { record.limit = maximum; return query },
        maybeSingle() { single = true; return query },
        then(resolve, reject) {
          let rows = state.tables[table] || []
          rows = rows.filter(row => record.filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value))
          return Promise.resolve({ data: single ? rows[0] || null : rows, error: state.queryError }).then(resolve, reject)
        },
      }
      return query
    },
    async rpc(name, args) {
      state.calls.push({ rpc: name, args })
      const result = state.rpcResults[name]
      return { data: typeof result === 'function' ? result(args) : result ?? {}, error: state.rpcError, status: state.rpcStatus }
    },
  }
  const cache = new Map()
  function load(relative) {
    let filename = path.resolve(root, relative)
    if (!path.extname(filename)) filename += existsSync(filename + '.js') ? '.js' : '.ts'
    if (cache.has(filename)) return cache.get(filename).exports
    const loaded = new Module(filename)
    cache.set(filename, loaded)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    const nativeRequire = createRequire(filename)
    loaded.require = specifier => {
      if (specifier === './lib/server/maintenanceSettings') return { maintenanceEnabled: async () => state.maintenance === true }
      if (specifier === '@supabase/supabase-js') return { createClient: (url, key, options) => { state.clients.push({ url, key, options }); assert.equal(key, 'development-anon-key'); return client } }
      if (specifier === '@/lib/server/adminSession') return { requireAdmin: request => request.headers.get('x-test-admin') === 'yes' ? { email: 'admin@example.test' } : null }
      if (specifier === '@/lib/server/adminSupabase') return { getAdminSupabase: () => { state.adminClients++; return client } }
      if (specifier.startsWith('@/lib/server/commerce/') || specifier === '@/lib/server/adminRequestOrigin') return load(specifier.slice(2))
      if (specifier.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
      return nativeRequire(specifier)
    }
    loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
    return loaded.exports
  }
  return { state, load, context: { params: Promise.resolve({ websiteId }) } }
}

function request(pathname = '/api/commerce/applications', { method = 'GET', payload, body, token = 'valid-test-token', origin = 'https://dining.example', admin = false, contentType = 'application/json' } = {}) {
  const headers = { 'content-type': contentType }
  if (token) headers.authorization = `Bearer ${token}`
  if (origin !== null) headers.origin = origin
  if (admin) headers['x-test-admin'] = 'yes'
  if (origin) headers['sec-fetch-site'] = origin === 'https://dining.example' ? 'same-origin' : 'cross-site'
  return new NextRequest('https://dining.example' + pathname, { method, headers, ...(method === 'GET' ? {} : { body: body ?? JSON.stringify(payload ?? {}) }) })
}

const domainId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const hostname = 'shop.business.com'
const configuration = { enabled: true, configured: true, provisioningEnabled: true, projectId: 'prj_Development', teamId: 'team_Development', token: 'stub-development-token', baseHostname: 'stores.business.com' }
const row = { id: domainId, website_id: websiteId, hostname, ownership_verified: false, deployment_verified: false, tls_verified: false, active: false, released_at: null, verification: [{ type: 'TXT', domain: `_vercel.${hostname}`, value: 'private-development-proof' }], provider_project_id: configuration.projectId, claimed_by: ownerId }

function enableProvider(t, provisioning = false) {
  const env = { COMMERCE_CUSTOM_DOMAINS_ENABLED: 'true', COMMERCE_VERCEL_PROJECT_ID: configuration.projectId, COMMERCE_VERCEL_TEAM_ID: configuration.teamId, COMMERCE_VERCEL_API_TOKEN: configuration.token, COMMERCE_DOMAIN_PROVISIONING_ENABLED: provisioning ? 'true' : '' }
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key]; process.env[key] = value
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
}

function providerStub(overrides = {}) {
  const calls = []
  const responses = {
    domain: { name: hostname, projectId: configuration.projectId, verified: true, verification: row.verification },
    dns: { configuredBy: 'CNAME', misconfigured: false },
    alias: { alias: hostname, projectId: configuration.projectId, deploymentId: 'dpl_Development' },
    deployment: { id: 'dpl_Development', projectId: configuration.projectId, readyState: 'READY', target: 'production', aliasAssigned: true },
    certificates: { certs: [{ cns: [hostname], expiresAt: Date.now() + 86400000 }] },
    ...overrides,
  }
  return { calls, responses, fetchImpl: async (input, init) => {
    const url = new URL(input); calls.push({ url, init })
    assert.equal(url.origin, 'https://api.vercel.com')
    assert.equal(url.searchParams.get('teamId'), configuration.teamId)
    assert.equal(init.headers.Authorization, `Bearer ${configuration.token}`)
    assert.equal(init.redirect, 'error')
    let data
    if (url.pathname.includes('/domains/') && !url.pathname.endsWith('/config')) data = responses.domain
    else if (url.pathname.endsWith('/config')) data = responses.dns
    else if (url.pathname.startsWith('/v4/aliases/')) data = responses.alias
    else if (url.pathname.startsWith('/v13/deployments/')) data = responses.deployment
    else if (url.pathname === '/v8/certs') data = responses.certificates
    else if (url.pathname.endsWith('/domains') && init.method === 'POST') data = responses.domain
    else assert.fail(`Unexpected provider contract: ${url.pathname}`)
    return { ok: true, status: 200, json: async () => data }
  } }
}

test('domain names normalize safely and reject platform, local, IP and URL inputs', t => {
  const { load } = fixture(t)
  const { commerceHostnameSchema, commercePrimaryHosts } = load('lib/server/commerce/domains.js')
  assert.equal(commerceHostnameSchema.parse(' Shop.Business.COM '), hostname)
  assert.equal(commercePrimaryHosts.size, 6)
  for (const value of [...commercePrimaryHosts, 'x.digitaldine-in.online', 'foo.vercel.app', 'localhost', '127.0.0.1', '10.0.0.1', '[::1]', 'shop.local', 'x.internal', 'x.arpa', 'x.onion', 'admin.business.com', 'metadata.business.com', 'https://business.com', 'shop.business.com:443', 'shop.business.com/path', 'a..com', '-a.com', 'a-.com', '*.business.com', 'business.com.', 'x.c', '1.2.3', 'www.business.com\r\nHost:evil.com']) assert.equal(commerceHostnameSchema.safeParse(value).success, false, value)
})

test('domain configuration and provisioning flags are explicit and server-only', t => {
  const { load } = fixture(t)
  const { domainConfiguration } = load('lib/server/commerce/domains.js')
  assert.equal(domainConfiguration({}).enabled, false)
  assert.equal(domainConfiguration({ COMMERCE_CUSTOM_DOMAINS_ENABLED: 'TRUE' }).enabled, false)
  const env = { COMMERCE_CUSTOM_DOMAINS_ENABLED: 'true', COMMERCE_VERCEL_PROJECT_ID: configuration.projectId, COMMERCE_VERCEL_TEAM_ID: configuration.teamId, COMMERCE_VERCEL_API_TOKEN: configuration.token }
  assert.equal(domainConfiguration(env).configured, true)
  assert.equal(domainConfiguration(env).provisioningEnabled, false)
  for (const key of ['COMMERCE_VERCEL_PROJECT_ID', 'COMMERCE_VERCEL_TEAM_ID', 'COMMERCE_VERCEL_API_TOKEN']) assert.equal(domainConfiguration({ ...env, [key]: '' }).configured, false)
})

test('disabled domain adapters make no provider calls', async t => {
  const { load } = fixture(t)
  const { inspectCommerceDomain, provisionCommerceDomain, verifyCommerceDomain, verifiedCommerceDomainBase } = load('lib/server/commerce/domains.js')
  let calls = 0
  const opts = { configuration: { ...configuration, enabled: false }, fetchImpl: () => { calls++; throw Error('must not call') } }
  await assert.rejects(inspectCommerceDomain(hostname, opts), /disabled/)
  await assert.rejects(provisionCommerceDomain(hostname, opts), /disabled/)
  await assert.rejects(verifyCommerceDomain(hostname, opts), /disabled/)
  assert.equal(await verifiedCommerceDomainBase(opts), null)
  assert.equal(calls, 0)
})

test('provider inspection uses official scoped GET contracts and requires every check', async t => {
  const { load } = fixture(t)
  const { inspectCommerceDomain } = load('lib/server/commerce/domains.js')
  const stub = providerStub()
  const result = await inspectCommerceDomain(hostname, { configuration, fetchImpl: stub.fetchImpl })
  assert.equal(result.ownership_verified, true)
  assert.equal(result.deployment_verified, true)
  assert.equal(result.tls_verified, true)
  assert.deepEqual(result.verification, row.verification)
  assert.equal(stub.calls.length, 5)
  assert.ok(stub.calls.every(call => call.init.method === 'GET' && call.init.body === undefined))
  assert.equal(stub.calls.find(call => call.url.pathname.endsWith('/config')).url.searchParams.get('projectIdOrName'), configuration.projectId)
  assert.equal(stub.calls.find(call => call.url.pathname.startsWith('/v4/aliases/')).url.searchParams.get('projectId'), configuration.projectId)
  assert.equal(JSON.stringify(result).includes(configuration.token), false)
})

test('provider ownership cannot be inferred from a mismatched or redirected project domain', async t => {
  const { load } = fixture(t)
  const { inspectCommerceDomain } = load('lib/server/commerce/domains.js')
  for (const change of [{ projectId: 'prj_Other' }, { name: 'other.business.com' }, { verified: false }, { redirect: 'https://other.business.com' }, { gitBranch: 'feature' }, { customEnvironmentId: 'env_preview' }]) {
    const stub = providerStub(); Object.assign(stub.responses.domain, change)
    const result = await inspectCommerceDomain(hostname, { configuration, fetchImpl: stub.fetchImpl })
    assert.equal(result.ownership_verified, false)
    assert.equal(result.deployment_verified, false)
  }
})

test('misconfigured DNS, wrong alias and Preview deployments cannot activate', async t => {
  const { load } = fixture(t)
  const { inspectCommerceDomain } = load('lib/server/commerce/domains.js')
  for (const [part, change] of [['dns', { misconfigured: true }], ['dns', { configuredBy: null }], ['dns', { configuredBy: 'dns-01' }], ['alias', { projectId: 'prj_Other' }], ['alias', { alias: 'other.business.com' }], ['alias', { redirect: 'other.business.com' }], ['deployment', { target: 'preview' }], ['deployment', { readyState: 'BUILDING' }], ['deployment', { projectId: 'prj_Other' }], ['deployment', { aliasError: { code: 'error' } }]]) {
    const stub = providerStub(); Object.assign(stub.responses[part], change)
    assert.equal((await inspectCommerceDomain(hostname, { configuration, fetchImpl: stub.fetchImpl })).deployment_verified, false, `${part} ${JSON.stringify(change)}`)
  }
})

test('certificates must be current and match exactly or one wildcard label', async t => {
  const { load } = fixture(t)
  const { inspectCommerceDomain } = load('lib/server/commerce/domains.js')
  for (const [names, expiration, expected] of [[[hostname], Date.now() + 60000, true], [['*.business.com'], Date.now() + 60000, true], [['*.com'], Date.now() + 60000, false], [[hostname], 1, false], [['other.business.com'], Date.now() + 60000, false]]) {
    const stub = providerStub({ certificates: { certs: [{ cns: names, expiresAt: expiration }] } })
    assert.equal((await inspectCommerceDomain(hostname, { configuration, fetchImpl: stub.fetchImpl })).tls_verified, expected)
  }
})

test('provider DNS instructions discard foreign and unsafe values', async t => {
  const { load } = fixture(t)
  const stub = providerStub(); stub.responses.domain.verification = [...row.verification, { type: 'TXT', domain: 'other.business.com', value: 'foreign' }, { type: 'TXT', domain: hostname, value: 'bad\r\nvalue' }, { type: 'CNAME', domain: hostname, value: 'unused' }]
  assert.deepEqual((await load('lib/server/commerce/domains.js').inspectCommerceDomain(hostname, { configuration, fetchImpl: stub.fetchImpl })).verification, row.verification)
})

test('provision and verify POST only the saved name to the configured project under a separate flag', async t => {
  const { load } = fixture(t)
  const { provisionCommerceDomain, verifyCommerceDomain } = load('lib/server/commerce/domains.js')
  const stub = providerStub()
  await assert.rejects(provisionCommerceDomain(hostname, { configuration: { ...configuration, provisioningEnabled: false }, fetchImpl: stub.fetchImpl }), /disabled/)
  assert.equal(stub.calls.length, 0)
  await provisionCommerceDomain(hostname, { configuration, fetchImpl: stub.fetchImpl })
  await verifyCommerceDomain(hostname, { configuration, fetchImpl: stub.fetchImpl })
  assert.equal(stub.calls[0].url.pathname, `/v10/projects/${configuration.projectId}/domains`)
  assert.deepEqual(JSON.parse(stub.calls[0].init.body), { name: hostname })
  assert.equal(stub.calls[1].url.pathname, `/v9/projects/${configuration.projectId}/domains/${hostname}/verify`)
  assert.equal(stub.calls[1].init.body, undefined)
  assert.ok(stub.calls.every(call => call.init.method === 'POST'))
})

test('generated domains require verified wildcard ownership, DNS and certificate metadata', async t => {
  const { load } = fixture(t)
  const { verifiedCommerceDomainBase } = load('lib/server/commerce/domains.js')
  const stub = providerStub({ domain: { name: `*.${configuration.baseHostname}`, projectId: configuration.projectId, verified: true }, certificates: { certs: [{ cns: [`*.${configuration.baseHostname}`], expiresAt: Date.now() + 86400000 }] } })
  assert.equal(await verifiedCommerceDomainBase({ configuration, fetchImpl: stub.fetchImpl }), configuration.baseHostname)
  stub.responses.dns.misconfigured = true
  assert.equal(await verifiedCommerceDomainBase({ configuration, fetchImpl: stub.fetchImpl }), null)
  stub.responses.dns.misconfigured = false
  stub.responses.certificates.certs[0].cns = [`tenant.${configuration.baseHostname}`]
  assert.equal(await verifiedCommerceDomainBase({ configuration, fetchImpl: stub.fetchImpl }), null)
  assert.equal(await verifiedCommerceDomainBase({ configuration: { ...configuration, baseHostname: null }, fetchImpl: stub.fetchImpl }), null)
})

test('owner domain workspace requires verified identity, current membership and branding permission', async t => {
  const { load, state, context } = fixture(t)
  const route = load('app/api/commerce/workspace/[websiteId]/domains/route.js')
  assert.equal((await route.GET(request(undefined, { token: null }), context)).status, 401)
  assert.equal((await route.GET(request(), { params: Promise.resolve({ websiteId: otherWebsiteId }) })).status, 403)
  state.user.email_confirmed_at = null
  assert.equal((await route.GET(request(), context)).status, 403)
  state.user.email_confirmed_at = '2026-10-22T00:00:00Z'; state.tables.commerce_websites[0].owner_permissions.branding = false
  assert.equal((await route.GET(request(), context)).status, 403)
  assert.equal(state.calls.filter(call => call.rpc).length, 0)
})

test('authorized workspace exposes only domain status and its own private proof, never service credentials', async t => {
  const { load, state, context } = fixture(t)
  state.rpcResults.commerce_domain_workspace = { domains: [row] }
  const response = await load('app/api/commerce/workspace/[websiteId]/domains/route.js').GET(request(), context)
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.enabled, false)
  assert.equal(body.domains[0].status, 'pending')
  assert.deepEqual(body.domains[0].verification, row.verification)
  assert.equal(body.domains[0].provider_project_id, undefined)
  assert.equal(body.domains[0].claimed_by, undefined)
  assert.equal(state.adminClients, 0)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(state.calls.find(call => call.rpc).args, { p_website_id: websiteId })
})

test('owner mutations reject disabled claims, cross-origin, suspended and forged activation', async t => {
  const { load, state, context } = fixture(t)
  const route = load('app/api/commerce/workspace/[websiteId]/domains/route.js')
  const post = (payload = { action: 'claim', payload: { hostname } }, opts = {}) => route.POST(request(undefined, { method: 'POST', payload, ...opts }), context)
  assert.equal((await post()).status, 503)
  enableProvider(t)
  assert.equal((await post(undefined, { origin: 'https://foreign.example' })).status, 403)
  state.tables.commerce_websites[0].status = 'suspended'
  assert.equal((await post()).status, 403)
  state.tables.commerce_websites[0].status = 'active'
  assert.equal((await post({ action: 'activate', payload: { id: domainId } })).status, 400)
  assert.equal((await post({ action: 'claim', payload: { hostname, ownership_verified: true } })).status, 400)
  assert.equal((await post({ action: 'claim', payload: { hostname: 'api.business.com' } })).status, 400)
  assert.equal(state.calls.filter(call => call.rpc).length, 0)
})

test('owner claims use normalized canonical name and release stays possible with routing disabled', async t => {
  const { load, state, context } = fixture(t)
  enableProvider(t)
  const route = load('app/api/commerce/workspace/[websiteId]/domains/route.js')
  assert.equal((await route.POST(request(undefined, { method: 'POST', payload: { action: 'claim', payload: { hostname: ' Shop.Business.COM ' } } }), context)).status, 200)
  assert.deepEqual(state.calls.find(call => call.rpc === 'commerce_domain_owner_action').args, { p_website_id: websiteId, p_action: 'claim', p_payload: { hostname } })
  process.env.COMMERCE_CUSTOM_DOMAINS_ENABLED = ''
  assert.equal((await route.POST(request(undefined, { method: 'POST', payload: { action: 'remove', payload: { id: domainId } } }), context)).status, 200)
  state.rpcError = { code: 'PGRST202', message: 'missing domain function' }
  assert.equal((await route.POST(request(undefined, { method: 'POST', payload: { action: 'remove', payload: { id: domainId } } }), context)).status, 503)
  assert.equal(state.adminClients, 0)
})

test('generated owner claim refuses missing wildcard configuration without inventing success', async t => {
  const { load, state, context } = fixture(t)
  enableProvider(t)
  const response = await load('app/api/commerce/workspace/[websiteId]/domains/route.js').POST(request(undefined, { method: 'POST', payload: { action: 'claim_generated', payload: { label: 'new-store' } } }), context)
  assert.equal(response.status, 503)
  assert.equal(state.calls.filter(call => call.rpc).length, 0)
})

test('generated owner claim stores only its verified canonical single-label hostname', async t => {
  const { load, state, context } = fixture(t)
  enableProvider(t)
  process.env.COMMERCE_DOMAIN_BASE_HOSTNAME = configuration.baseHostname
  const stub = providerStub({ domain: { name: `*.${configuration.baseHostname}`, projectId: configuration.projectId, verified: true }, certificates: { certs: [{ cns: [`*.${configuration.baseHostname}`], expiresAt: Date.now() + 86400000 }] } })
  const previous = global.fetch; global.fetch = stub.fetchImpl; t.after(() => { global.fetch = previous })
  const route = load('app/api/commerce/workspace/[websiteId]/domains/route.js')
  const response = await route.POST(request(undefined, { method: 'POST', payload: { action: 'claim_generated', payload: { label: 'New-Store' } } }), context)
  assert.equal(response.status, 200)
  assert.deepEqual(state.calls.find(call => call.rpc === 'commerce_domain_owner_action').args, { p_website_id: websiteId, p_action: 'claim', p_payload: { hostname: `new-store.${configuration.baseHostname}` } })
  assert.equal(stub.calls.length, 3)
})

test('Admin domain APIs require signed Admin, same origin and strict server-owned payloads', async t => {
  const { load, state } = fixture(t)
  const route = load('app/api/commerce/admin/domains/route.js')
  assert.equal((await route.GET(request(`/api/commerce/admin/domains?website_id=${websiteId}`))).status, 401)
  const body = { website_id: websiteId, action: 'activate', payload: { id: domainId } }
  assert.equal((await route.POST(request(undefined, { method: 'POST', admin: true, origin: 'https://foreign.example', payload: body }))).status, 403)
  assert.equal((await route.POST(request(undefined, { method: 'POST', admin: true, payload: { ...body, payload: { id: domainId, ownership_verified: true } } }))).status, 400)
  assert.equal((await route.POST(request(undefined, { method: 'POST', admin: true, payload: body }))).status, 503)
  assert.equal(state.calls.filter(call => call.rpc).length, 0)
})

test('Admin domain readiness returns only safe flags and current checks through signed-cookie access', async t => {
  const { load, state } = fixture(t)
  enableProvider(t, true)
  state.rpcResults.commerce_domain_admin_action = { domains: [{ ...row, ownership_verified: true, tls_verified: true }] }
  const response = await load('app/api/commerce/admin/domains/route.js').GET(request(`/api/commerce/admin/domains?website_id=${websiteId}`, { admin: true, token: null }))
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.enabled, true)
  assert.equal(body.provider_configured, true)
  assert.equal(body.provisioning_enabled, true)
  assert.equal(body.domains[0].ownership_verified, true)
  assert.equal(body.domains[0].deployment_verified, false)
  assert.equal(body.domains[0].tls_verified, true)
  assert.equal(body.domains[0].provider_project_id, undefined)
  assert.equal(body.domains[0].claimed_by, undefined)
  assert.equal(JSON.stringify(body).includes(configuration.token), false)
  assert.equal(state.calls.some(call => call.auth), false)
  assert.equal(state.adminClients, 1)
})

test('Admin activation derives all verification from the saved claim and provider, then activates', async t => {
  const { load, state } = fixture(t)
  enableProvider(t)
  state.rpcResults.commerce_domain_admin_action = args => args.p_action === 'status' ? { domains: [row] } : row
  const stub = providerStub(); const previous = global.fetch; global.fetch = stub.fetchImpl; t.after(() => { global.fetch = previous })
  const response = await load('app/api/commerce/admin/domains/route.js').POST(request(undefined, { method: 'POST', admin: true, payload: { website_id: websiteId, action: 'activate', payload: { id: domainId } } }))
  assert.equal(response.status, 200)
  const rpcs = state.calls.filter(call => call.rpc)
  assert.deepEqual(rpcs.map(call => call.args.p_action), ['status', 'record_verification', 'activate', 'status'])
  assert.equal(rpcs[1].args.p_payload.tls_verified, true)
  assert.equal(rpcs[1].args.p_payload.provider_project_id, configuration.projectId)
  assert.equal(stub.calls.length, 5)
})

test('failed current verification is saved and cannot leave a stale activation in place', async t => {
  const { load, state } = fixture(t)
  enableProvider(t)
  state.rpcResults.commerce_domain_admin_action = { domains: [row] }
  const stub = providerStub({ dns: { configuredBy: null, misconfigured: true } }); const previous = global.fetch; global.fetch = stub.fetchImpl; t.after(() => { global.fetch = previous })
  const route = load('app/api/commerce/admin/domains/route.js')
  const response = await route.POST(request(undefined, { method: 'POST', admin: true, payload: { website_id: websiteId, action: 'activate', payload: { id: domainId } } }))
  assert.equal(response.status, 409)
  assert.equal(state.calls.find(call => call.rpc && call.args.p_action === 'record_verification').args.p_payload.deployment_verified, false)
  assert.equal(state.calls.some(call => call.rpc && call.args.p_action === 'activate'), false)
  global.fetch = async () => { throw Error('sensitive provider error') }
  const unavailable = await route.POST(request(undefined, { method: 'POST', admin: true, payload: { website_id: websiteId, action: 'check', payload: { id: domainId } } }))
  assert.equal(unavailable.status, 503)
  assert.equal(JSON.stringify(await unavailable.json()).includes('sensitive'), false)
  assert.equal(state.calls.filter(call => call.rpc && call.args.p_action === 'record_verification').at(-1).args.p_payload.ownership_verified, false)
})

test('Admin provisioning is independently disabled and never accepts a submitted hostname', async t => {
  const { load, state } = fixture(t)
  enableProvider(t)
  state.rpcResults.commerce_domain_admin_action = { domains: [row] }
  const stub = providerStub(); const previous = global.fetch; global.fetch = stub.fetchImpl; t.after(() => { global.fetch = previous })
  const route = load('app/api/commerce/admin/domains/route.js')
  const response = await route.POST(request(undefined, { method: 'POST', admin: true, payload: { website_id: websiteId, action: 'provision', payload: { id: domainId } } }))
  assert.equal(response.status, 503)
  assert.equal(stub.calls.length, 0)
  process.env.COMMERCE_DOMAIN_PROVISIONING_ENABLED = 'true'
  assert.equal((await route.POST(request(undefined, { method: 'POST', admin: true, payload: { website_id: websiteId, action: 'provision', payload: { id: domainId } } }))).status, 200)
  assert.equal(stub.calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(stub.calls[0].init.body), { name: hostname })
  assert.equal(state.calls.some(call => call.rpc && call.args.p_action === 'activate'), false)
})

test('Admin rejects foreign or released saved-claim IDs before provider access', async t => {
  const { load, state } = fixture(t)
  enableProvider(t, true)
  const stub = providerStub(); const previous = global.fetch; global.fetch = stub.fetchImpl; t.after(() => { global.fetch = previous })
  const route = load('app/api/commerce/admin/domains/route.js')
  for (const domains of [[], [{ ...row, released_at: '2026-11-03T01:00:00Z' }]]) {
    state.rpcResults.commerce_domain_admin_action = { domains }
    const response = await route.POST(request(undefined, { method: 'POST', admin: true, payload: { website_id: websiteId, action: 'provision', payload: { id: domainId } } }))
    assert.equal(response.status, 404)
  }
  assert.equal(stub.calls.length, 0)
})

test('ambiguous provider provision and verify failures clear stale active verification', async t => {
  const { load, state } = fixture(t)
  enableProvider(t, true)
  state.rpcResults.commerce_domain_admin_action = { domains: [{ ...row, active: true, ownership_verified: true, deployment_verified: true, tls_verified: true }] }
  const previous = global.fetch; global.fetch = async () => { throw Error('ambiguous provider timeout') }; t.after(() => { global.fetch = previous })
  const route = load('app/api/commerce/admin/domains/route.js')
  for (const action of ['provision', 'verify']) {
    const response = await route.POST(request(undefined, { method: 'POST', admin: true, payload: { website_id: websiteId, action, payload: { id: domainId } } }))
    assert.equal(response.status, 503)
    const saved = state.calls.filter(call => call.rpc && call.args.p_action === 'record_verification').at(-1)
    assert.equal(saved.args.p_payload.ownership_verified, false)
    assert.equal(saved.args.p_payload.deployment_verified, false)
    assert.equal(saved.args.p_payload.tls_verified, false)
  }
})

test('public host resolution ignores forwarded-host spoofing and uses only the public slug RPC', async t => {
  const { load } = fixture(t)
  const { resolveCommerceDomain } = load('lib/server/commerce/domains.js')
  const calls = []
  const clientFactory = () => ({ rpc: async (rpc, args) => { calls.push({ rpc, args }); return { data: 'first-store', error: null } } })
  const headers = new Headers({ host: hostname, 'x-forwarded-host': 'evil.business.com', forwarded: 'host=evil.business.com' })
  assert.equal(await resolveCommerceDomain({ headers }, { configuration, clientFactory }), 'first-store')
  assert.deepEqual(calls, [{ rpc: 'commerce_resolve_domain', args: { p_hostname: hostname } }])
  for (const host of ['www.digitaldine-in.online', 'digitaldine-in.online', 'digital-dining-alpha.vercel.app', '127.0.0.1', 'localhost', 'api.business.com']) {
    assert.equal(await resolveCommerceDomain({ headers: new Headers({ host, 'x-forwarded-host': hostname }) }, { configuration, clientFactory }), null)
  }
  assert.equal(await resolveCommerceDomain({ headers }, { configuration: { enabled: false }, clientFactory }), null)
  assert.equal(calls.length, 1)
})

test('public resolver fails closed on missing schema, outages and non-slug data', async t => {
  const { load } = fixture(t)
  const { resolveCommerceDomain } = load('lib/server/commerce/domains.js')
  for (const result of [{ data: null, error: { code: 'PGRST202' } }, { data: '../admin', error: null }, { data: { slug: 'first-store', verification: 'private' }, error: null }]) {
    assert.equal(await resolveCommerceDomain({ headers: new Headers({ host: hostname }) }, { configuration, clientFactory: () => ({ rpc: async () => result }) }), null)
  }
})

test('public resolver preserves the existing 80-character store slug contract', async t => {
  const { load } = fixture(t)
  const { resolveCommerceDomain } = load('lib/server/commerce/domains.js')
  for (const size of [64, 80, 81]) {
    const value = 'a'.repeat(size)
    const resolved = await resolveCommerceDomain({ headers: new Headers({ host: hostname }) }, { configuration, clientFactory: () => ({ rpc: async () => ({ data: value, error: null }) }) })
    assert.equal(resolved, size <= 80 ? value : null)
  }
})

test('custom proxy rewrites storefront entries while preserving maintenance, primary and service paths', async t => {
  const { load, state } = fixture(t)
  enableProvider(t)
  state.rpcResults.commerce_resolve_domain = 'first-store'
  const { proxy, config } = load('proxy.ts')
  const req = pathname => new NextRequest(`https://${hostname}${pathname}`, { headers: { host: hostname, 'x-forwarded-host': 'evil.business.com' } })
  const rootResponse = await proxy(req('/?campaign=test'))
  assert.equal(rootResponse.headers.get('x-middleware-rewrite'), `https://${hostname}/shops/first-store?campaign=test`)
  assert.equal(rootResponse.headers.get('cache-control'), 'private, no-store')
  assert.equal((await proxy(req('/account'))).headers.get('x-middleware-rewrite'), `https://${hostname}/shops/first-store/account`)
  assert.equal((await proxy(req('/shops/first-store?campaign=test'))).headers.get('location'), `https://${hostname}/?campaign=test`)
  assert.equal((await proxy(req('/shops/first-store/account'))).headers.get('location'), `https://${hostname}/account`)
  assert.equal((await proxy(req('/shops/another-store'))).status, 404)
  for (const pathname of ['/admin', '/auth/callback', '/auth/login', '/favicon.ico']) assert.equal((await proxy(req(pathname))).headers.get('x-middleware-rewrite'), null)
  assert.match(config.matcher[0], /api/)
  state.maintenance = true
  assert.equal((await proxy(req('/'))).status, 503)
  assert.equal((await proxy(req('/admin'))).status, 200)
  state.maintenance = false
  assert.equal((await proxy(new NextRequest('https://www.digitaldine-in.online/', { headers: { host: 'www.digitaldine-in.online', 'x-forwarded-host': hostname } }))).headers.get('x-middleware-rewrite'), null)
})
