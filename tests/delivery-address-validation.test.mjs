import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const routePath = 'app/api/delivery/customer/addresses/route.js'
const googleId = '10000000-0000-4000-8000-000000000001'
const otherId = '10000000-0000-4000-8000-000000000002'
const customerId = '20000000-0000-4000-8000-000000000001'
const restaurantId = '30000000-0000-4000-8000-000000000001'
const addressId = '40000000-0000-4000-8000-000000000001'
const nextId = '40000000-0000-4000-8000-000000000002'
const foreignId = '40000000-0000-4000-8000-000000000003'
const cookieName = 'delivery-address-test-session'
const localCookie = 'a'.repeat(64)
const googleTable = 'delivery_customer_saved_addresses'
const mobileTable = 'delivery_customer_mobile_saved_addresses'
const validAddress = {
  label: 'Home', recipient_name: 'Synthetic Customer', recipient_mobile: '9000000000',
  address_line1: 'Development address', address_line2: '', landmark: '',
  city: 'Hyderabad', state: 'Telangana', pincode: '500001',
  latitude: 17.385, longitude: 78.4867, gps_accuracy_m: null,
}

function saved(id = addressId, owner = googleId, overrides = {}) {
  return { id, ...validAddress, user_id: owner, is_default: false,
    created_at: '2026-11-02T00:00:00Z', ...overrides }
}

// Run the actual route with strictly injected Auth/database effects. These
// protocol fixtures use no environment credentials, network, SQL or provider.
function fixture(overrides = {}) {
  const state = {
    signedIn: true, mobileSignedIn: true, queries: [], writes: [], rpcs: [], authCalls: [], mobileReads: [], adminCalls: 0,
    tables: {
      [googleTable]: [saved()],
      [mobileTable]: [{ ...saved(), customer_id: customerId, restaurant_id: restaurantId }],
      delivery_customer_sessions: [{ restaurant_id: restaurantId,
        token_hash: createHash('sha256').update(localCookie).digest('hex'), expires_at: '2099-01-01T00:00:00Z' }],
      restaurants: [{ id: restaurantId, restaurant_code: 'TESTSTORE' }],
    }, ...overrides,
  }
  const admin = {
    auth: { async getUser(token) {
      state.authCalls.push(token)
      return state.signedIn && token === 'local-google-token'
        ? { data: { user: { id: googleId, user_metadata: { full_name: 'Synthetic Customer' } } }, error: null }
        : { data: { user: null }, error: { code: 'invalid_session' } }
    } },
    from(table) {
      assert.ok(Object.hasOwn(state.tables, table), `Unexpected table: ${table}`)
      const entry = { table, filters: [], operation: 'read', columns: '*', order: [], limit: null }
      state.queries.push(entry)
      const matches = row => entry.filters.every(({ key, value, kind }) => kind === 'gt'
        ? row[key] > value : kind === 'ilike'
          ? String(row[key]).toLowerCase() === String(value).toLowerCase() : row[key] === value)
      const project = row => row && (entry.columns === '*' ? { ...row }
        : Object.fromEntries(entry.columns.split(',').map(key => [key.trim(), row[key.trim()]])))
      async function execute(single) {
        let rows = state.tables[table].filter(matches)
        if (entry.operation === 'insert') {
          const row = { id: nextId, created_at: '2026-11-02T00:00:01Z', ...entry.payload }
          state.tables[table].push(row); state.writes.push({ ...entry }); rows = [row]
        } else if (entry.operation === 'update' && rows.length) {
          for (const row of rows) Object.assign(row, entry.payload)
          state.writes.push({ ...entry })
        } else if (entry.operation === 'delete' && rows.length) {
          state.tables[table] = state.tables[table].filter(row => !matches(row))
          state.writes.push({ ...entry })
        }
        for (const [key, ascending] of [...entry.order].reverse()) rows.sort((a, b) => a[key] === b[key] ? 0 : (a[key] > b[key] ? 1 : -1) * (ascending ? 1 : -1))
        if (entry.limit !== null) rows = rows.slice(0, entry.limit)
        return { data: single ? project(rows[0] || null) : rows.map(project), error: null }
      }
      const query = {
        select(columns) { entry.columns = columns; return query },
        eq(key, value) { entry.filters.push({ key, value, kind: 'eq' }); return query },
        gt(key, value) { entry.filters.push({ key, value, kind: 'gt' }); return query },
        ilike(key, value) { entry.filters.push({ key, value, kind: 'ilike' }); return query },
        order(key, options) { entry.order.push([key, options.ascending]); return query },
        limit(value) { entry.limit = value; return query },
        insert(payload) { entry.operation = 'insert'; entry.payload = payload; return query },
        update(payload) { entry.operation = 'update'; entry.payload = payload; return query },
        delete() { entry.operation = 'delete'; return query },
        single() { return execute(true) }, maybeSingle() { return execute(true) },
        then(resolve, reject) { return execute(false).then(resolve, reject) },
      }
      return query
    },
    async rpc(name, args) {
      assert.equal(name, 'dd_delivery_select_default_address')
      state.rpcs.push({ name, args })
      return { data: null, error: null }
    },
  }
  const filename = path.join(root, routePath)
  const loaded = new Module(filename)
  loaded.filename = filename
  const dependencies = {
    'server-only': {}, 'node:crypto': { createHash }, 'next/server': require('next/server'),
    '@/lib/server/adminSupabase': { getAdminSupabase() { state.adminCalls += 1; return admin } },
    '@/lib/server/deliveryCustomerMobileSession': {
      DELIVERY_MOBILE_SESSION_COOKIE: cookieName,
      async readDeliveryMobileSession(client, request, storeId) {
        assert.equal(client, admin); assert.equal(storeId, restaurantId)
        assert.ok(request.cookies.get(cookieName)?.value)
        state.mobileReads.push(storeId)
        return state.mobileSignedIn ? { id: customerId, name: 'Synthetic Mobile Customer', mobile: '9000000000' } : null
      },
    },
  }
  loaded.require = name => { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name] }
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename)
  return { route: loaded.exports, state }
}

function request(method, body = {}, { token = 'local-google-token', mobile = false } = {}) {
  return new NextRequest('https://delivery.example.test/api/delivery/customer/addresses?accountType=google', {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(mobile ? { cookie: `${cookieName}=${localCookie}` } : {}) },
    ...(method !== 'GET' ? { body: JSON.stringify({ accountType: mobile ? 'mobile' : 'google', addressId, address: validAddress, ...body }) } : {}),
  })
}

function noEffects(state) {
  assert.deepEqual(state.writes, []); assert.deepEqual(state.rpcs, [])
  assert.equal(state.queries.some(query => query.operation !== 'read'), false)
}

test('POST and PATCH reject missing, blank and coercible coordinate values before any address write', async () => {
  const invalid = [undefined, null, '', '   ', false, true, [], [0], [1], {}, { value: 17 }, '0x10', '0b10', '17 degrees', 'NaN', 'Infinity', '1e400']
  for (const method of ['POST', 'PATCH']) for (const key of ['latitude', 'longitude']) for (const value of invalid) {
    const { route, state } = fixture()
    const response = await route[method](request(method, { address: { ...validAddress, [key]: value } }))
    assert.equal(response.status, 400, `${method} ${key}: ${JSON.stringify(value)}`)
    assert.match((await response.json()).message, /valid GPS pin/)
    noEffects(state)
  }
})

test('POST and PATCH retain real zero, negative, decimal string, scientific and WGS84 edge coordinates', async () => {
  const pairs = [[0, 0], ['0', '0'], [-90, -180], [90, 180], [' -.5 ', ' +78.25 '], ['1.7385e1', '7.84867E1'], [17.385, 78.4867]]
  for (const method of ['POST', 'PATCH']) for (const [latitude, longitude] of pairs) {
    const { route, state } = fixture()
    const response = await route[method](request(method, { address: { ...validAddress, latitude, longitude } }))
    assert.equal(response.status, method === 'POST' ? 201 : 200)
    assert.equal(state.writes.length, 1)
    assert.equal(state.writes[0].payload.latitude, Number(latitude))
    assert.equal(state.writes[0].payload.longitude, Number(longitude))
  }
})

test('POST and PATCH reject out-of-range coordinates and an incomplete pin', async () => {
  for (const method of ['POST', 'PATCH']) for (const coordinates of [
    { latitude: -90.00001 }, { latitude: 90.00001 }, { longitude: -180.00001 }, { longitude: 180.00001 },
    { latitude: null, longitude: 0 }, { latitude: 0, longitude: undefined },
  ]) {
    const { route, state } = fixture()
    assert.equal((await route[method](request(method, { address: { ...validAddress, ...coordinates } }))).status, 400)
    noEffects(state)
  }
})

test('optional GPS accuracy preserves missing/null/blank and numeric zero but rejects malformed present values', async () => {
  for (const method of ['POST', 'PATCH']) {
    for (const value of [undefined, null, '', '   ', 0, '0', '12.5', '1e2', 999999]) {
      const { route, state } = fixture()
      assert.equal((await route[method](request(method, { address: { ...validAddress, gps_accuracy_m: value } }))).status, method === 'POST' ? 201 : 200)
      assert.equal(state.writes[0].payload.gps_accuracy_m, value == null || (typeof value === 'string' && !value.trim()) ? null : Number(value))
    }
    for (const value of [false, true, [], [0], {}, '0x10', 'Infinity', '1e400', -1, 1000000]) {
      const { route, state } = fixture()
      assert.equal((await route[method](request(method, { address: { ...validAddress, gps_accuracy_m: value } }))).status, 400)
      noEffects(state)
    }
  }
})

test('Google address creation derives ownership and keeps existing normalization and non-overwriting field selection', async () => {
  const { route, state } = fixture()
  const response = await route.POST(request('POST', { address: { ...validAddress, label: '   ', recipient_name: ' Synthetic Customer ',
    recipient_mobile: '(900) 000-0000', address_line1: ' Development address ', user_id: otherId, restaurant_id: 'tampered' } }))
  assert.equal(response.status, 201)
  const payload = state.writes[0].payload
  assert.equal(payload.user_id, googleId); assert.equal(payload.restaurant_id, undefined)
  assert.equal(payload.label, 'Home'); assert.equal(payload.recipient_name, 'Synthetic Customer')
  assert.equal(payload.recipient_mobile, '9000000000'); assert.equal(payload.address_line1, 'Development address')
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(response.headers.get('Vary'), 'Cookie, Authorization')
})

test('missing and expired authentication still deny every address method without saved-address effects', async () => {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    for (const token of [null, 'expired-local-token']) {
      const { route, state } = fixture()
      assert.equal((await route[method](request(method, {}, { token }))).status, 401)
      noEffects(state)
      assert.equal(state.queries.some(query => [googleTable, mobileTable].includes(query.table)), false)
    }
  }
})

test('Google update and delete remain scoped to both address and verified owner', async () => {
  for (const method of ['PATCH', 'DELETE']) {
    const { route, state } = fixture()
    state.tables[googleTable] = [saved(addressId, otherId)]
    assert.equal((await route[method](request(method))).status, 404)
    assert.deepEqual(state.writes, []); assert.deepEqual(state.rpcs, [])
    const query = state.queries.find(entry => entry.table === googleTable)
    assert.ok(query.filters.some(filter => filter.key === 'id' && filter.value === addressId))
    assert.ok(query.filters.some(filter => filter.key === 'user_id' && filter.value === googleId))
  }
})

test('Mobile/PIN save preserves verified customer/store identity and store mismatch denial', async () => {
  const { route, state } = fixture()
  const response = await route.POST(request('POST', { restaurantCode: 'teststore', address: { ...validAddress, customer_id: otherId, restaurant_id: 'tampered' } }, { mobile: true, token: null }))
  assert.equal(response.status, 201)
  assert.equal(state.writes[0].table, mobileTable)
  assert.equal(state.writes[0].payload.customer_id, customerId)
  assert.equal(state.writes[0].payload.restaurant_id, restaurantId)
  assert.equal(state.authCalls.length, 0)
  const mismatch = fixture()
  assert.equal((await mismatch.route.POST(request('POST', { restaurantCode: 'OTHERSTORE' }, { mobile: true, token: null }))).status, 401)
  noEffects(mismatch.state); assert.equal(mismatch.state.mobileReads.length, 0)
  const expired = fixture({ mobileSignedIn: false })
  assert.equal((await expired.route.POST(request('POST', {}, { mobile: true, token: null }))).status, 401)
  noEffects(expired.state)
})

test('GET lists only owned addresses and POST retains the thirty-address limit', async () => {
  const { route, state } = fixture()
  state.tables[googleTable] = [saved(), saved(foreignId, otherId)]
  const response = await route.GET(request('GET'))
  const body = await response.json()
  assert.equal(response.status, 200); assert.deepEqual(body.addresses.map(row => row.id), [addressId])
  assert.equal(body.userId, googleId)
  state.tables[googleTable] = Array.from({ length: 30 }, (_, index) => saved(String(index)))
  assert.equal((await route.POST(request('POST'))).status, 400)
  noEffects(state)
})

test('first-address default selection and explicit default-only PATCH preserve the existing RPC contract', async () => {
  const { route, state } = fixture()
  state.tables[googleTable] = []
  const created = await route.POST(request('POST', { makeDefault: false }))
  assert.equal(created.status, 201)
  assert.equal((await created.json()).isDefault, true)
  assert.deepEqual(state.rpcs[0], { name: 'dd_delivery_select_default_address', args: { p_account_type: 'google', p_owner_id: googleId, p_address_id: nextId } })
  state.rpcs.length = 0; state.writes.length = 0
  assert.equal((await route.PATCH(request('PATCH', { address: null, setDefault: true }))).status, 200)
  assert.deepEqual(state.writes, [])
  assert.deepEqual(state.rpcs[0].args, { p_account_type: 'google', p_owner_id: googleId, p_address_id: addressId })
})

test('deleting a default address retains owner scoping and promotes only another owned address', async () => {
  const { route, state } = fixture()
  state.tables[googleTable] = [saved(addressId, googleId, { is_default: true }), saved(nextId), saved(foreignId, otherId)]
  assert.equal((await route.DELETE(request('DELETE'))).status, 200)
  assert.deepEqual(state.tables[googleTable].map(row => row.id), [nextId, foreignId])
  assert.deepEqual(state.rpcs[0].args, { p_account_type: 'google', p_owner_id: googleId, p_address_id: nextId })
})

test('invalid address IDs and account types retain their existing early denials', async () => {
  for (const method of ['PATCH', 'DELETE']) for (const invalidId of ['../foreign', '40000000-0000-4000-8000000000000']) {
    const { route, state } = fixture()
    assert.equal((await route[method](request(method, { addressId: invalidId }))).status, 400)
    assert.equal(state.adminCalls, 0); noEffects(state)
  }
  const { route, state } = fixture()
  assert.equal((await route.POST(request('POST', { accountType: 'admin' }))).status, 400)
  assert.deepEqual(state.authCalls, []); noEffects(state)
})
