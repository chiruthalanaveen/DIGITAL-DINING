import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const ownerId = '10000000-0000-4000-8000-000000000001'
const otherOwnerId = '10000000-0000-4000-8000-000000000002'
const restaurantId = '20000000-0000-4000-8000-000000000001'
const otherRestaurantId = '20000000-0000-4000-8000-000000000002'
const validToken = 'synthetic-owner-account-session'

// Execute the actual modules with explicit synthetic dependencies. These are
// handler/contract regressions, not proof of deployed Supabase Auth or RLS.
function load(relative, dependencies = {}) {
  const filename = path.resolve(root, relative)
  const loaded = new Module(filename)
  loaded.filename = filename
  loaded.require = specifier => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected dependency: ${specifier}`)
    return dependencies[specifier]
  }
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename)
  return loaded.exports
}

function business(overrides = {}) {
  return {
    id: restaurantId, owner_id: ownerId, name: 'Synthetic Owner Restaurant',
    approval_status: 'approved', approval_note: 'Private administrative note',
    dob: '1990-01-01', email: 'owner@owner-account.example.test',
    razorpay_key_secret: 'synthetic-restaurant-secret-never-return',
    ...overrides,
  }
}

function fixture(t, overrides = {}) {
  const configuration = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-owner-account-service-key',
  }
  for (const [key, value] of Object.entries(configuration)) {
    const before = process.env[key]
    process.env[key] = value
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before })
  }
  const state = {
    user: { id: ownerId, email: 'owner@owner-account.example.test', user_metadata: {} },
    rows: [business()], queries: [], authTokens: [], writes: [], queryError: null,
    ...overrides,
  }
  const admin = {
    auth: {
      async getUser(token) {
        state.authTokens.push(token)
        return token === validToken
          ? { data: { user: state.user }, error: null }
          : { data: { user: null }, error: { message: 'Synthetic expired session' } }
      },
    },
    from(table) {
      assert.equal(table, 'restaurants')
      const record = { table, columns: [], filters: [] }
      state.queries.push(record)
      const matching = () => state.rows.filter(row => record.filters.every(([key, value]) => row[key] === value))
      const project = row => row && Object.fromEntries(record.columns.map(key => [key, row[key]]))
      const result = () => ({ data: matching().map(project), error: state.queryError })
      const query = {
        select(columns) {
          assert.notEqual(columns, '*', 'Owner identity/approval lookups must use a limited DTO')
          record.columns = columns.split(',').map(value => value.trim())
          return query
        },
        eq(key, value) { record.filters.push([key, value]); return query },
        is(key, value) { assert.equal(value, null); record.filters.push([key, value]); return query },
        async limit(limit) { record.limit = limit; const value = result(); return { ...value, data: value.data.slice(0, limit) } },
        async maybeSingle() { const value = result(); assert.ok(value.data.length <= 1); return { ...value, data: value.data[0] || null } },
      }
      for (const method of ['insert', 'update', 'upsert', 'delete']) {
        query[method] = () => { state.writes.push(method); throw new Error('Owner account resolution must never mutate mappings') }
      }
      return query
    },
  }
  t.after(() => assert.deepEqual(state.writes, []))
  const approval = load('lib/server/ownerApproval.js', { '@/lib/server/adminSupabase': { getAdminSupabase: () => admin } })
  const identityRoute = load('app/api/auth/owner-restaurant/route.js', {
    'next/server': require('next/server'),
    '@supabase/supabase-js': { createClient(url, key, options) {
      assert.equal(url, configuration.NEXT_PUBLIC_SUPABASE_URL)
      assert.equal(key, configuration.SUPABASE_SERVICE_ROLE_KEY)
      assert.deepEqual(options, { auth: { persistSession: false, autoRefreshToken: false } })
      return admin
    } },
  })
  const approvalRoute = load('app/api/owner/approval-status/route.js', {
    'next/server': require('next/server'), '@/lib/server/ownerApproval': approval,
  })
  return { state, approval, identityRoute, approvalRoute }
}

function request(target = '/api/auth/owner-restaurant', token = validToken) {
  return new Request(`http://127.0.0.1:4320${target}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
}

test('owner identity resolves the saved owner_id when the generated restaurant ID differs from the Auth user ID', async t => {
  const { identityRoute, state } = fixture(t)
  assert.notEqual(restaurantId, ownerId)
  const response = await identityRoute.GET(request())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0')
  assert.deepEqual(await response.json(), { success: true, restaurant: { id: restaurantId, name: 'Synthetic Owner Restaurant' } })
  assert.deepEqual(state.authTokens, [validToken])
  assert.deepEqual(state.queries.map(row => row.filters), [[['owner_id', ownerId]]])
  assert.equal(state.queries[0].limit, 2)
})

test('explicit owner assignment wins over a legacy primary-key match and never matches another assigned owner', async t => {
  const { identityRoute, approvalRoute, state } = fixture(t, {
    rows: [business(), business({ id: ownerId, owner_id: otherOwnerId, name: 'Different owner business' })],
  })
  const identity = await identityRoute.GET(request())
  assert.equal((await identity.json()).restaurant.id, restaurantId)
  const collision = await approvalRoute.GET(request(`/api/owner/approval-status?restaurantId=${ownerId}`))
  assert.equal(collision.status, 403)
  assert.equal((await collision.json()).code, 'NOT_RESTAURANT_OWNER')
  state.rows = [state.rows[1]]
  const unresolved = await identityRoute.GET(request())
  assert.equal(unresolved.status, 404)
  assert.deepEqual(state.queries.at(-1).filters, [['id', ownerId], ['owner_id', null]])
})

test('existing null-owner legacy accounts resolve and pass approved-owner verification without a mapping write', async t => {
  const { identityRoute, approval } = fixture(t, { rows: [business({ id: ownerId, owner_id: null })] })
  const response = await identityRoute.GET(request())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).restaurant.id, ownerId)
  const access = await approval.requireApprovedOwner(request(), ownerId)
  assert.equal(access.ok, true)
  assert.equal(access.restaurantId, ownerId)
})

test('pending, rejected, suspended and missing approval remain non-operational while legitimate owners can check status', async t => {
  const { approvalRoute, approval, state } = fixture(t)
  for (const status of ['pending', 'rejected', 'suspended', null, 'APPROVED']) {
    state.rows[0].approval_status = status
    const normalized = String(status || 'pending').toLowerCase()
    const response = await approvalRoute.GET(request(`/api/owner/approval-status?restaurantId=${restaurantId}`))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), {
      success: true, restaurantId, restaurantName: 'Synthetic Owner Restaurant', approvalStatus: normalized,
      canAccessPortal: normalized === 'approved', approvalNote: normalized === 'rejected' ? 'Private administrative note' : '',
    })
    const protectedAccess = await approval.requireApprovedOwner(request(), restaurantId)
    assert.equal(protectedAccess.ok, normalized === 'approved')
    assert.equal(protectedAccess.status, normalized === 'approved' ? 200 : 403)
  }
})

test('orphaned accounts fail closed and user metadata, email or phone cannot claim a restaurant', async t => {
  const { identityRoute, approvalRoute, state } = fixture(t, {
    rows: [business({ id: otherRestaurantId, owner_id: otherOwnerId })],
    user: { id: ownerId, email: 'owner@owner-account.example.test', phone: '9000000000', user_metadata: { owner_id: otherOwnerId, restaurant_id: otherRestaurantId } },
  })
  assert.equal((await identityRoute.GET(request())).status, 404)
  assert.equal((await approvalRoute.GET(request(`/api/owner/approval-status?restaurantId=${otherRestaurantId}`))).status, 403)
  assert.ok(state.queries.every(query => query.filters.every(([key]) => ['id', 'owner_id'].includes(key))))
})

test('multiple owned restaurants are not selected arbitrarily but each explicit owned route can check approval', async t => {
  const { identityRoute, approvalRoute, state } = fixture(t, { rows: [business(), business({ id: otherRestaurantId, name: 'Second authorized business' })] })
  const ambiguous = await identityRoute.GET(request())
  assert.equal(ambiguous.status, 409)
  const body = await ambiguous.json()
  assert.equal(body.success, false)
  assert.match(body.message, /multiple restaurants/i)
  assert.equal(body.restaurant, undefined)
  for (const row of state.rows) {
    const explicit = await approvalRoute.GET(request(`/api/owner/approval-status?restaurantId=${row.id}`))
    assert.equal(explicit.status, 200)
    assert.equal((await explicit.json()).restaurantId, row.id)
  }
})

test('missing and expired sessions are rejected before any business lookup', async t => {
  const { identityRoute, approvalRoute, state } = fixture(t)
  for (const token of [null, 'synthetic-expired-token']) {
    assert.equal((await identityRoute.GET(request(undefined, token))).status, 401)
    assert.equal((await approvalRoute.GET(request(`/api/owner/approval-status?restaurantId=${restaurantId}`, token))).status, 401)
  }
  assert.deepEqual(state.queries, [])
})

test('tampered, nonexistent and invalid tenant IDs cannot acquire owner approval', async t => {
  const { approvalRoute, state } = fixture(t)
  for (const id of [otherRestaurantId, otherOwnerId]) {
    const response = await approvalRoute.GET(request(`/api/owner/approval-status?restaurantId=${id}`))
    assert.equal(response.status, 403)
    assert.equal((await response.json()).code, 'NOT_RESTAURANT_OWNER')
  }
  const count = state.queries.length
  const malformed = await approvalRoute.GET(request('/api/owner/approval-status?restaurantId=not-a-uuid'))
  assert.equal(malformed.status, 400)
  assert.equal(state.queries.length, count)
})

test('database lookup errors fail closed without returning provider details or sensitive restaurant fields', async t => {
  t.mock.method(console, 'error', () => {})
  const { identityRoute, approvalRoute } = fixture(t, { queryError: { message: 'synthetic private database detail' } })
  const identity = await identityRoute.GET(request())
  const approval = await approvalRoute.GET(request(`/api/owner/approval-status?restaurantId=${restaurantId}`))
  assert.equal(identity.status, 500)
  assert.equal(approval.status, 503)
  for (const response of [identity, approval]) {
    const body = await response.text()
    assert.doesNotMatch(body, /private database detail|razorpay|dob|1990/)
    assert.match(response.headers.get('cache-control'), /no-store/)
  }
})

function browserClient(t, response, session = { access_token: validToken, user: { id: ownerId } }) {
  const state = { requests: [], sessionReads: 0 }
  const client = {
    auth: { async getSession() { state.sessionReads++; return { data: { session }, error: null } } },
    from() { assert.fail('Browser owner lookup must use the verified API, not an ID/email database guess') },
  }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    state.requests.push({ url, options })
    return typeof response === 'function' ? response(url, options) : response
  })
  return { state, client, helper: load('lib/ownerAccount.js') }
}

test('browser owner lookup uses its bearer session and uncached verified identity endpoint without inferring a primary key', async t => {
  const row = { id: restaurantId, name: 'Synthetic Owner Restaurant' }
  const { state, client, helper } = browserClient(t, Response.json({ success: true, restaurant: row }))
  const controller = new AbortController()
  assert.deepEqual(await helper.findOwnerRestaurant(client, { signal: controller.signal }), row)
  assert.equal(state.sessionReads, 1)
  assert.deepEqual(state.requests, [{
    url: '/api/auth/owner-restaurant',
    options: { method: 'GET', headers: { Authorization: `Bearer ${validToken}` }, cache: 'no-store', signal: controller.signal },
  }])
})

test('browser approval requests bind the requested tenant and preserve approved and non-approved statuses', async t => {
  let status = 'pending'
  const { state, client, helper } = browserClient(t, () => Response.json({
    success: true, restaurantId, restaurantName: 'Synthetic Owner Restaurant', approvalStatus: status,
    canAccessPortal: status === 'approved', approvalNote: '',
  }))
  for (status of ['pending', 'approved', 'rejected', 'suspended']) {
    const result = await helper.getOwnerApprovalStatus(client, restaurantId)
    assert.equal(result.approvalStatus, status)
    assert.equal(result.canAccessPortal, status === 'approved')
  }
  assert.ok(state.requests.every(({ url, options }) =>
    url === `/api/owner/approval-status?restaurantId=${restaurantId}` &&
    options.headers.Authorization === `Bearer ${validToken}` && options.cache === 'no-store'))
})

test('browser owner helpers never issue a business request when their session is missing or invalid', async t => {
  const { state, client, helper } = browserClient(t, () => assert.fail('No fetch permitted'), null)
  await assert.rejects(helper.findOwnerRestaurant(client), /session.*expired/i)
  await assert.rejects(helper.getOwnerApprovalStatus(client, restaurantId), /session.*expired/i)
  client.auth.getSession = async () => ({ data: { session: { access_token: validToken } }, error: new Error('Synthetic expired session') })
  await assert.rejects(helper.findOwnerRestaurant(client), /session.*expired/i)
  assert.deepEqual(state.requests, [])
})

test('browser owner lookup reports ambiguous/orphaned server failures without remapping or falling back to public queries', async t => {
  let code = 409
  const { client, helper, state } = browserClient(t, () => Response.json({
    success: false,
    message: code === 409 ? 'Multiple restaurants found. Contact support to select an account.' : 'No restaurant is connected to this owner account.',
  }, { status: code }))
  await assert.rejects(helper.findOwnerRestaurant(client), /multiple restaurants/i)
  code = 404
  await assert.rejects(helper.findOwnerRestaurant(client), /no restaurant.*connected/i)
  assert.equal(state.requests.length, 2)
})

test('browser approval refuses mismatched IDs, missing status and contradictory portal permission', async t => {
  let payload
  const { client, helper } = browserClient(t, () => Response.json({ success: true, ...payload }))
  for (payload of [
    { restaurantId: otherRestaurantId, approvalStatus: 'approved', canAccessPortal: true },
    { restaurantId, canAccessPortal: true },
    { restaurantId, approvalStatus: 'pending', canAccessPortal: true },
    { restaurantId, approvalStatus: 'approved', canAccessPortal: false },
  ]) await assert.rejects(helper.getOwnerApprovalStatus(client, restaurantId), /unable to verify/i)
})

test('malformed identity and unreadable failure responses cannot be treated as successful login', async t => {
  let response = Response.json({ success: true, restaurant: {} })
  const { client, helper } = browserClient(t, () => response)
  await assert.rejects(helper.findOwnerRestaurant(client), /no restaurant.*connected/i)
  response = new Response('synthetic unreadable upstream response', { status: 503 })
  await assert.rejects(helper.findOwnerRestaurant(client), /unable to verify/i)
})
