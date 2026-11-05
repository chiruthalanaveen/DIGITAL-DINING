import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const root = fileURLToPath(new URL('../', import.meta.url))
const websiteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherWebsiteId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const userId = '11111111-1111-4111-8111-111111111111'
const requestId = '22222222-2222-4222-8222-222222222222'
const eventId = '33333333-3333-4333-8333-333333333333'
const actionId = '44444444-4444-4444-8444-444444444444'
const submissionId = '55555555-5555-4555-8555-555555555555'
const reviewEventId = '66666666-6666-4666-8666-666666666666'
const instant = '2026-11-04T10:00:00.000Z'
const later = '2026-11-04T10:01:00.000Z'
const ownerRoute = 'app/api/commerce/workspace/[websiteId]/feature-requests/route.js'
const adminRoute = 'app/api/commerce/admin/feature-requests/route.js'
const base = 'https://commerce.example.test'

function row(extra = {}) {
  return { id: requestId, website_id: websiteId, title: 'Scheduled delivery', description: 'Please support scheduled grocery delivery.', status: 'submitted', revision: 1, review_note: '', assignment_reference: '', created_at: instant, updated_at: instant, ...extra }
}
function event(extra = {}) {
  return { id: eventId, request_id: requestId, revision: 1, from_status: null, to_status: 'submitted', note: '', assignment_reference: '', actor_kind: 'owner', created_at: instant, ...extra }
}
function detail(extra = {}) { return { website_id: websiteId, request: row(), events: [event()], ...extra } }
function listing(rows = [], site = websiteId, extra = {}) { return { website_id: site, requests: rows, has_more: false, next_cursor: null, ...extra } }
function submit(extra = {}) { return { action: 'submit', payload: { submission_key: submissionId, title: 'Scheduled delivery', description: 'Please support scheduled grocery delivery.', ...extra } } }
function review(extra = {}) { return { website_id: websiteId, action: 'review', payload: { request_id: requestId, expected_status: 'submitted', expected_revision: 1, status: 'under_review', note: 'The platform team is reviewing this request.', assignment_reference: '', action_key: actionId, ...extra } } }
function reviewed(extra = {}) {
  const currentEvent = event({ id: reviewEventId, revision: 2, from_status: 'submitted', to_status: 'under_review', note: review().payload.note, actor_kind: 'admin', created_at: later })
  return detail({ request: row({ status: 'under_review', revision: 2, review_note: currentEvent.note, updated_at: later }), events: [event(), currentEvent], replayed: false, action_event: currentEvent, ...extra })
}
function assigned(extra = {}) {
  const initial = reviewed()
  const approved = event({ id: '77777777-7777-4777-8777-777777777777', revision: 3, from_status: 'under_review', to_status: 'approved', note: 'Approved for controlled planning.', actor_kind: 'admin', created_at: '2026-11-04T10:02:00.000Z' })
  const last = event({ id: '88888888-8888-4888-8888-888888888888', revision: 4, from_status: 'approved', to_status: 'assigned', note: 'Assigned for separately reviewed development.', assignment_reference: 'LOCAL-WORK-42', actor_kind: 'admin', created_at: '2026-11-04T10:03:00.000Z' })
  return detail({ request: row({ status: 'assigned', revision: 4, review_note: last.note, assignment_reference: last.assignment_reference, updated_at: last.created_at }), events: [...initial.events, approved, last], ...extra })
}
function req({ admin = false, method = 'GET', query = '', payload, token = 'valid', origin = base, rawBody, headers: extra = {} } = {}) {
  const target = admin ? '/api/commerce/admin/feature-requests' : `/api/commerce/workspace/${websiteId}/feature-requests`
  const headers = { ...extra }
  if (token) headers.authorization = `Bearer ${token}`
  if (admin) headers['x-test-admin'] = 'valid'
  if (method !== 'GET') {
    headers['content-type'] = 'application/json'
    if (origin) { headers.origin = origin; headers['sec-fetch-site'] = origin === base ? 'same-origin' : 'cross-site' }
  }
  return new NextRequest(base + target + query, { method, headers, ...(method === 'GET' ? {} : { body: rawBody ?? JSON.stringify(payload ?? {}) }) })
}
function fixture(t) {
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'development-anon-key' })) {
    const old = process.env[key]; process.env[key] = value
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old })
  }
  const state = {
    calls: [], clients: [], adminClients: 0, error: null, result: undefined,
    user: { id: userId, email: 'owner@commerce.example.test', email_confirmed_at: instant },
    membership: { website_id: websiteId, user_id: userId, role: 'owner', active: true },
    website: { id: websiteId, status: 'active', owner_user_id: userId, owner_permissions: {}, features: {} },
  }
  const rpc = role => async (name, args) => {
    assert.equal(name, role === 'owner' ? 'commerce_feature_requests_owner' : 'commerce_feature_requests_admin', 'Feature requests must never invoke configuration, payments or provider RPCs.')
    state.calls.push({ role, rpc: name, args })
    const data = state.result !== undefined ? state.result : args.p_action === 'list' ? listing([], args.p_website_id) : args.p_action === 'submit' ? detail({ replayed: false }) : args.p_action === 'review' ? reviewed() : detail()
    return { data, error: state.error }
  }
  const ownerClient = {
    auth: { async getUser(token) { state.calls.push({ auth: token }); return token === 'valid' ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: 'expired' } } } },
    from(table) {
      const call = { table, filters: [] }; state.calls.push(call)
      const query = { select() { return query }, eq(key, value) { call.filters.push([key, value]); return query }, maybeSingle() { return query }, then(resolve, reject) {
        const candidate = table === 'commerce_memberships' ? state.membership : state.website
        return Promise.resolve({ data: candidate && call.filters.every(([key, value]) => candidate[key] === value) ? candidate : null, error: null }).then(resolve, reject)
      } }
      return query
    },
    rpc: rpc('owner'),
  }
  const serviceClient = { rpc: rpc('admin') }
  const cache = new Map()
  function load(relative) {
    let filename = path.resolve(root, relative)
    if (!path.extname(filename)) filename += '.js'
    if (cache.has(filename)) return cache.get(filename).exports
    const mod = new Module(filename); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, mod)
    const nativeRequire = createRequire(filename)
    mod.require = specifier => {
      if (specifier === '@supabase/supabase-js') return { createClient(url, key, options) { assert.equal(url, 'http://127.0.0.1:54321'); assert.equal(key, 'development-anon-key'); state.clients.push({ url, key, options }); return ownerClient } }
      if (specifier === '@/lib/server/adminSession') return { requireAdmin(request) { return request.headers.get('x-test-admin') === 'valid' ? { email: 'admin@commerce.example.test' } : null } }
      if (specifier === '@/lib/server/adminSupabase') return { getAdminSupabase() { state.adminClients += 1; return serviceClient } }
      if (specifier.startsWith('@/lib/server/') || specifier.startsWith('@/lib/commerce/')) return load(specifier.slice(2))
      if (specifier.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), specifier)))
      return nativeRequire(specifier)
    }
    mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
    return mod.exports
  }
  return { load, state, context: { params: Promise.resolve({ websiteId }) } }
}

// These fixtures exercise the actual BFF authorization/validation/projection code.
// Real database locking, RLS and replay behavior have separate SQL integration tests.
test('feature-request owner reads require a verified JWT before membership or RPC access', async t => {
  const { load, state, context } = fixture(t); const { GET } = load(ownerRoute)
  assert.equal((await GET(req({ token: null }), context)).status, 401)
  assert.equal((await GET(req({ token: 'expired' }), context)).status, 401)
  state.user.email_confirmed_at = null; state.user.user_metadata = { email_confirmed: true }
  assert.equal((await GET(req(), context)).status, 403)
  assert.equal(state.calls.some(call => call.table || call.rpc), false)
  assert.equal(state.adminClients, 0)
})

test('foreign, inactive and non-owner memberships cannot read or submit feature requests', async t => {
  const { load, state, context } = fixture(t); const { GET, POST } = load(ownerRoute)
  assert.equal((await GET(req(), { params: Promise.resolve({ websiteId: otherWebsiteId }) })).status, 403)
  state.membership.active = false
  assert.equal((await GET(req(), context)).status, 403)
  assert.equal((await POST(req({ method: 'POST', payload: submit() }), context)).status, 403)
  state.membership.active = true; state.membership.role = 'staff'
  assert.equal((await GET(req(), context)).status, 403)
  assert.equal(state.calls.some(call => call.rpc), false)
})

test('an active owner needs no product/order privileges and uses only the caller JWT', async t => {
  const { load, state, context } = fixture(t)
  const response = await load(ownerRoute).GET(req(), context)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, available: true, ...listing() })
  assert.equal(state.adminClients, 0)
  assert.equal(state.clients[0].options.global.headers.Authorization, 'Bearer valid')
  assert.deepEqual(state.calls.filter(call => call.rpc), [{ role: 'owner', rpc: 'commerce_feature_requests_owner', args: { p_website_id: websiteId, p_action: 'list', p_payload: {} } }])
  assert.match(response.headers.get('cache-control'), /private.*no-store/)
})

test('owner submission keeps origin protection and honors the SQL gate for new requests in read-only stores', async t => {
  const { load, state, context } = fixture(t); const { POST } = load(ownerRoute)
  for (const origin of [null, 'https://foreign.example.test']) assert.equal((await POST(req({ method: 'POST', origin, payload: submit() }), context)).status, 403)
  assert.equal(state.calls.some(call => call.rpc), false)
  for (const status of ['suspended', 'archived']) {
    state.website.status = status
    state.error = { code: '42501', message: 'New requests are not allowed for a read-only website.' }
    assert.equal((await POST(req({ method: 'POST', payload: submit() }), context)).status, 403)
  }
  assert.equal(state.calls.filter(call => call.rpc).length, 2, 'The SQL transaction must distinguish a new request from known recovery.')
  state.website.status = 'setup'; state.error = null
  const response = await POST(req({ method: 'POST', payload: submit({ title: '  Scheduled delivery  ', description: '  Please support scheduled grocery delivery.  ' }) }), context)
  assert.equal(response.status, 200)
  assert.deepEqual(state.calls.filter(call => call.rpc).at(-1).args.p_payload, submit().payload)
})

test('an authenticated owner can recover a known submission after the website becomes read-only', async t => {
  const { load, state, context } = fixture(t); const { POST } = load(ownerRoute)
  state.result = detail({ replayed: true })
  for (const status of ['suspended', 'archived']) {
    state.website.status = status
    const response = await POST(req({ method: 'POST', payload: submit() }), context)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { success: true, available: true, ...detail({ replayed: true }) })
  }
  assert.equal(state.adminClients, 0)
  assert.equal(state.calls.filter(call => call.rpc).length, 2)
})

test('owner submission rejects unknown fields, forged identities and malformed required content', async t => {
  const { load, state, context } = fixture(t); const { POST } = load(ownerRoute)
  const invalid = [
    { ...submit(), website_id: websiteId }, { ...submit(), owner_id: userId }, { ...submit(), action: 'review' },
    submit({ title: 'tiny' }), submit({ title: 'x'.repeat(181) }), submit({ description: 'short' }), submit({ description: 'x'.repeat(6001) }),
    submit({ submission_key: 'bad' }), submit({ user_id: userId }), submit({ title: false }),
  ]
  for (const payload of invalid) assert.equal((await POST(req({ method: 'POST', payload }), context)).status, 400)
  assert.equal(state.calls.some(call => call.rpc), false)
})

test('Unicode submission minimums match SQL code points before RPC, while Tamil and emoji requests remain valid', async t => {
  const { load, state, context } = fixture(t); const { POST } = load(ownerRoute)
  for (const payload of [submit({ title: '😀😀😀' }), submit({ description: '😀😀😀😀😀' })]) {
    assert.equal((await POST(req({ method: 'POST', payload }), context)).status, 400)
  }
  assert.equal(state.calls.some(call => call.rpc), false, 'Short surrogate-pair text must fail before freezing a database submission.')
  for (const [title, description] of [['😀😀😀😀😀', '😀'.repeat(10)], ['விநியோக வசதி', 'கூடுதல் விநியோக நேர வசதி தேவை.']]) {
    state.result = detail({ request: row({ title, description }), replayed: false })
    const response = await POST(req({ method: 'POST', payload: submit({ title, description }) }), context)
    assert.equal(response.status, 200)
    assert.deepEqual(state.calls.filter(call => call.rpc).at(-1).args.p_payload, submit({ title, description }).payload)
  }
})

test('owner query validates canonical UUIDs, paired cursor fields, duplicate fields and ambiguous detail requests', async t => {
  const { load, state, context } = fixture(t); const { GET } = load(ownerRoute)
  for (const query of ['?unknown=1', '?request_id=bad', `?before_id=${requestId}`, `?before_created_at=${encodeURIComponent(instant)}`, `?request_id=${requestId}&request_id=${requestId}`, `?request_id=${requestId}&before_id=${requestId}&before_created_at=${encodeURIComponent(instant)}`]) {
    assert.equal((await GET(req({ query }), context)).status, 400, query)
  }
  assert.equal(state.calls.some(call => call.rpc), false)
  const upper = websiteId.toUpperCase()
  const response = await GET(req(), { params: Promise.resolve({ websiteId: upper }) })
  assert.equal(response.status, 200)
  assert.equal(state.calls.filter(call => call.rpc).at(-1).args.p_website_id, websiteId)
})

test('missing optional request capability is explicit for reads and refuses writes', async t => {
  const { load, state, context } = fixture(t); const owner = load(ownerRoute); const admin = load(adminRoute)
  for (const code of ['PGRST202', 'PGRST205', '42883', '42P01']) {
    state.error = { code, message: 'Development capability is not installed.' }
    let response = await owner.GET(req(), context)
    assert.equal(response.status, 200); assert.equal((await response.json()).available, false)
    response = await owner.GET(req({ query: `?request_id=${requestId}` }), context)
    assert.equal(response.status, 200); assert.equal((await response.json()).available, false)
    assert.equal((await owner.POST(req({ method: 'POST', payload: submit() }), context)).status, 503)
    response = await admin.GET(req({ admin: true }))
    assert.equal(response.status, 200); assert.equal((await response.json()).available, false)
    assert.equal((await admin.POST(req({ admin: true, method: 'POST', payload: review() }))).status, 503)
  }
})

test('permission failures, outages and saved-state conflicts are never relabelled as a missing feature', async t => {
  const { load, state, context } = fixture(t); const owner = load(ownerRoute); const admin = load(adminRoute)
  for (const [code, status] of [['42501', 403], ['08006', 503], ['57014', 503], ['23505', 409]]) {
    state.error = { code, message: 'fixture-secret must not be disclosed' }
    const response = await owner.GET(req(), context)
    assert.equal(response.status, status); assert.doesNotMatch(JSON.stringify(await response.json()), /fixture-secret/)
    assert.equal((await owner.POST(req({ method: 'POST', payload: submit() }), context)).status, status)
    assert.equal((await admin.GET(req({ admin: true }))).status, status)
    assert.equal((await admin.POST(req({ admin: true, method: 'POST', payload: review() }))).status, status)
  }
})

test('request DTOs strip internal submission, identity and Admin audit fields', async t => {
  const { load, state, context } = fixture(t)
  state.result = detail({ request: row({ submitted_by: userId, submission_key: submissionId, last_action_key: actionId, ciphertext: 'fixture-secret' }), events: [event({ actor_email: 'fixture-secret@example.test', operation_key: submissionId, submitted_by: userId })], admin_token: 'fixture-secret' })
  const response = await load(ownerRoute).GET(req({ query: `?request_id=${requestId}` }), context)
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.deepEqual(result, { success: true, available: true, ...detail() })
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret|submitted_by|submission_key|last_action_key|actor_email|operation_key|ciphertext/)
})

test('owner list/detail reject a copied tenant, wrong request reference or malformed history', async t => {
  const { load, state, context } = fixture(t); const { GET } = load(ownerRoute)
  for (const result of [null, [], {}, listing([row({ website_id: otherWebsiteId })]), listing([row()], otherWebsiteId), listing([row(), row()]), listing([row({ revision: 0 })]), listing([row({ status: 'enabled' })])]) {
    state.result = result; assert.equal((await GET(req(), context)).status, 503)
  }
  for (const result of [detail({ website_id: otherWebsiteId }), detail({ request: row({ id: actionId }) }), detail({ events: [] }), detail({ events: [event({ request_id: actionId })] }), detail({ events: [event({ revision: 2 })] }), detail({ events: [event({ to_status: 'approved' })] })]) {
    state.result = result; assert.equal((await GET(req({ query: `?request_id=${requestId}` }), context)).status, 503)
  }
})

test('list paging is bounded and tied to the last ordered row, with no duplicate or invented rows', async t => {
  const { load, state, context } = fixture(t); const { GET } = load(ownerRoute)
  const rows = Array.from({ length: 50 }, (_, index) => row({ id: `70000000-0000-4000-8000-${(50 - index).toString(16).padStart(12, '0')}` }))
  const last = rows.at(-1); const cursor = { created_at: last.created_at, id: last.id }
  state.result = listing(rows, websiteId, { has_more: true, next_cursor: cursor })
  let response = await GET(req(), context); assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).next_cursor, cursor)
  for (const result of [listing([], websiteId, { has_more: true, next_cursor: cursor }), listing(rows, websiteId, { has_more: true, next_cursor: { ...cursor, id: requestId } }), listing(rows.toReversed()), listing([...rows, row({ id: actionId })]), listing([], websiteId, { next_cursor: cursor })]) {
    state.result = result; assert.equal((await GET(req(), context)).status, 503)
  }
  state.result = listing()
  response = await GET(req({ query: `?before_created_at=${encodeURIComponent(instant)}&before_id=${requestId}` }), context)
  assert.equal(response.status, 200)
  assert.deepEqual(state.calls.filter(call => call.rpc).at(-1).args.p_payload, { before_created_at: instant, before_id: requestId })
})

test('Admin list/detail/review require a signed Admin session and mutation origin', async t => {
  const { load, state } = fixture(t); const { GET, POST } = load(adminRoute)
  assert.equal((await GET(req())).status, 401)
  assert.equal((await POST(req({ method: 'POST', payload: review() }))).status, 401)
  for (const origin of [null, 'https://foreign.example.test']) assert.equal((await POST(req({ admin: true, method: 'POST', payload: review(), origin }))).status, 403)
  assert.equal(state.adminClients, 0)
  assert.equal(state.calls.some(call => call.rpc), false)
})

test('keyset paging preserves PostgreSQL microseconds and rejects rows at or after the supplied cursor', async t => {
  const { load, state, context } = fixture(t); const { GET } = load(ownerRoute)
  const before = '2026-11-04T10:00:00.000003Z'
  const newer = '2026-11-04T10:00:00.000002+00:00', older = '2026-11-04T10:00:00.000001+00:00'
  state.result = listing([row({ id: requestId, created_at: newer, updated_at: newer }), row({ id: actionId, created_at: older, updated_at: older })])
  let response = await GET(req({ query: `?before_created_at=${encodeURIComponent(before)}&before_id=${requestId}` }), context)
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).requests.map(item => item.id), [requestId, actionId])
  response = await GET(req({ query: `?before_created_at=${encodeURIComponent(newer)}&before_id=${requestId}` }), context)
  assert.equal(response.status, 503, 'Returning the cursor row itself would repeat the page.')
  state.result = listing([row({ id: actionId, created_at: older, updated_at: older })])
  response = await GET(req({ query: `?before_created_at=${encodeURIComponent(newer)}&before_id=${requestId}` }), context)
  assert.equal(response.status, 200, 'An older microsecond remains before the cursor even when its UUID is larger.')
})

test('only signed Admin may list requests globally and return multiple tenant references', async t => {
  const { load, state } = fixture(t)
  state.result = listing([row(), row({ id: actionId, website_id: otherWebsiteId, created_at: '2026-11-03T00:00:00.000Z', updated_at: '2026-11-03T00:00:00.000Z' })], null)
  const response = await load(adminRoute).GET(req({ admin: true }))
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).requests.map(item => item.website_id), [websiteId, otherWebsiteId])
  assert.deepEqual(state.calls.filter(call => call.rpc)[0], { role: 'admin', rpc: 'commerce_feature_requests_admin', args: { p_website_id: null, p_action: 'list', p_payload: {}, p_actor_email: 'admin@commerce.example.test' } })
})

test('Admin queries never allow unbound detail lookups, arbitrary query fields or duplicate tenant scopes', async t => {
  const { load, state } = fixture(t); const { GET } = load(adminRoute)
  for (const query of [`?request_id=${requestId}`, `?website_id=${websiteId}&website_id=${otherWebsiteId}`, '?website_id=bad', '?unknown=1', `?website_id=${websiteId}&request_id=${requestId}&before_id=${requestId}&before_created_at=${encodeURIComponent(instant)}`]) {
    assert.equal((await GET(req({ admin: true, query }))).status, 400)
  }
  assert.equal(state.calls.some(call => call.rpc), false)
  state.result = listing()
  const response = await GET(req({ admin: true, query: `?website_id=${websiteId.toUpperCase()}` }))
  assert.equal(response.status, 200)
  assert.equal(state.calls.filter(call => call.rpc).at(-1).args.p_website_id, websiteId)
})

test('Admin review is strict, records only the session actor and never changes feature permissions', async t => {
  const { load, state } = fixture(t); const { POST } = load(adminRoute)
  const invalid = [review({ note: '' }), review({ note: 'x'.repeat(2001) }), review({ expected_revision: 0 }), review({ expected_revision: true }), review({ status: 'enabled' }), review({ action_key: 'bad' }), review({ status: 'assigned', assignment_reference: '' }), review({ assignment_reference: 'unexpected' }), review({ actor_email: 'forged@example.test' }), { ...review(), actor_email: 'forged@example.test' }, { ...review(), website_id: null }, { ...review(), action: 'enable_feature' }]
  for (const payload of invalid) assert.equal((await POST(req({ admin: true, method: 'POST', payload }))).status, 400)
  assert.equal(state.calls.some(call => call.rpc), false)
  state.result = reviewed()
  const response = await POST(req({ admin: true, method: 'POST', payload: review({ note: '  The platform team is reviewing this request.  ' }) }))
  assert.equal(response.status, 200)
  assert.deepEqual(state.calls.filter(call => call.rpc).at(-1), { role: 'admin', rpc: 'commerce_feature_requests_admin', args: { p_website_id: websiteId, p_action: 'review', p_payload: review().payload, p_actor_email: 'admin@commerce.example.test' } })
})

test('submission and review replay results preserve explicit status and the original action event', async t => {
  const { load, state, context } = fixture(t)
  state.result = detail({ replayed: true })
  let response = await load(ownerRoute).POST(req({ method: 'POST', payload: submit() }), context)
  assert.equal(response.status, 200); assert.equal((await response.json()).replayed, true)
  state.result = reviewed({ replayed: true })
  response = await load(adminRoute).POST(req({ admin: true, method: 'POST', payload: review() }))
  assert.equal(response.status, 200)
  const result = await response.json(); assert.equal(result.replayed, true); assert.equal(result.action_event.id, reviewEventId)
  state.error = { code: '23505', message: 'CAS stale or operation key changed' }
  assert.equal((await load(adminRoute).POST(req({ admin: true, method: 'POST', payload: review() }))).status, 409)
})

test('a replay may return later progress while retaining the original reviewed action', async t => {
  const { load, state, context } = fixture(t)
  const prior = reviewed()
  const approved = event({ id: '77777777-7777-4777-8777-777777777777', revision: 3, from_status: 'under_review', to_status: 'approved', note: 'Approved for separate controlled configuration.', actor_kind: 'admin', created_at: '2026-11-04T10:02:00.000Z' })
  state.result = detail({ request: row({ status: 'approved', revision: 3, review_note: approved.note, updated_at: approved.created_at }), events: [...prior.events, approved], replayed: true })
  let response = await load(ownerRoute).POST(req({ method: 'POST', payload: submit() }), context)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).request.status, 'approved')
  state.result = { ...state.result, action_event: prior.action_event }
  response = await load(adminRoute).POST(req({ admin: true, method: 'POST', payload: review() }))
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.request.revision, 3)
  assert.equal(result.action_event.revision, 2)
})

test('malformed successful mutations cannot claim acceptance or replay without matching durable history', async t => {
  const { load, state, context } = fixture(t); const owner = load(ownerRoute); const admin = load(adminRoute)
  for (const result of [detail(), detail({ replayed: 'true' }), detail({ replayed: false, request: row({ title: 'A different original title' }) })]) {
    state.result = result; assert.equal((await owner.POST(req({ method: 'POST', payload: submit() }), context)).status, 503)
  }
  for (const result of [detail({ replayed: false }), reviewed({ replayed: 'true' }), reviewed({ action_event: event() }), reviewed({ request: row({ status: 'approved', revision: 2, review_note: review().payload.note, updated_at: later }) }), reviewed({ events: [event(), event({ id: reviewEventId, revision: 2, from_status: 'submitted', to_status: 'under_review', actor_kind: 'owner', note: review().payload.note, created_at: later })] })]) {
    state.result = result; assert.equal((await admin.POST(req({ admin: true, method: 'POST', payload: review() }))).status, 503)
  }
})

test('SQL-valid non-BMP request text remains readable in owner and global Admin lists and details', async t => {
  const { load, state, context } = fixture(t)
  const text = { title: '🧵'.repeat(180), description: '📦'.repeat(6000) }
  state.result = listing([row(text)])
  let response = await load(ownerRoute).GET(req(), context)
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).requests[0], row(text))
  state.result = listing([row(text)], null)
  response = await load(adminRoute).GET(req({ admin: true }))
  assert.equal(response.status, 200, 'A valid SQL row must not make the entire global queue unavailable.')
  assert.deepEqual((await response.json()).requests[0], row(text))
  state.result = detail({ request: row(text) })
  response = await load(ownerRoute).GET(req({ query: `?request_id=${requestId}` }), context)
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).request, row(text))
  response = await load(adminRoute).GET(req({ admin: true, query: `?website_id=${websiteId}&request_id=${requestId}` }))
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).request, row(text))
})

test('mutation input retains SQL code-point maxima, rejects oversized Unicode before RPC and accepts valid boundaries', async t => {
  const { load, state, context } = fixture(t)
  for (const payload of [submit({ title: '🧵'.repeat(181) }), submit({ description: '📦'.repeat(6001) })]) {
    assert.equal((await load(ownerRoute).POST(req({ method: 'POST', payload }), context)).status, 400)
  }
  for (const payload of [review({ note: '📦'.repeat(2001) }), review({ expected_status: 'approved', expected_revision: 3, status: 'assigned', assignment_reference: '🧵'.repeat(161) })]) {
    assert.equal((await load(adminRoute).POST(req({ admin: true, method: 'POST', payload }))).status, 400)
  }
  assert.equal(state.calls.some(call => call.rpc), false)
  const text = { title: '🧵'.repeat(180), description: '📦'.repeat(6000) }
  state.result = detail({ request: row(text), replayed: false })
  assert.equal((await load(ownerRoute).POST(req({ method: 'POST', payload: submit(text) }), context)).status, 200)
  const current = assigned()
  current.events[3].note = '📋'.repeat(2000)
  current.events[3].assignment_reference = '🧵'.repeat(160)
  current.request.review_note = current.events[3].note
  current.request.assignment_reference = current.events[3].assignment_reference
  state.result = { ...current, replayed: false, action_event: current.events[3] }
  const payload = review({ expected_status: 'approved', expected_revision: 3, status: 'assigned', note: current.request.review_note, assignment_reference: current.request.assignment_reference })
  assert.equal((await load(adminRoute).POST(req({ admin: true, method: 'POST', payload }))).status, 200)
})

test('SQL-valid Unicode review notes and assignment references survive history and an earlier review replay', async t => {
  const { load, state, context } = fixture(t)
  const current = assigned()
  current.events[2].note = '📝'.repeat(2000)
  current.events[3].note = '📋'.repeat(2000)
  current.events[3].assignment_reference = '🧵'.repeat(160)
  current.request.review_note = current.events[3].note
  current.request.assignment_reference = current.events[3].assignment_reference
  state.result = current
  let response = await load(ownerRoute).GET(req({ query: `?request_id=${requestId}` }), context)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, available: true, ...current })
  state.result = { ...current, replayed: true, action_event: current.events[1] }
  response = await load(adminRoute).POST(req({ admin: true, method: 'POST', payload: review() }))
  assert.equal(response.status, 200)
  const replay = await response.json()
  assert.equal(replay.request.status, 'assigned')
  assert.equal(replay.request.review_note, current.request.review_note)
  assert.equal(replay.request.assignment_reference, current.request.assignment_reference)
  assert.deepEqual(replay.action_event, current.events[1])
  assert.deepEqual(replay.events, current.events)
})

test('stored request and immutable event text preserve SQL-retained nonbreaking whitespace exactly', async t => {
  const { load, state, context } = fixture(t)
  const current = assigned()
  current.request.title = '\u00a0Original request title\u00a0'
  current.request.description = '\u00a0Original business requirement text\u00a0'
  current.events[2].note = '\u00a0Approved for separately reviewed planning.\u00a0'
  current.events[3].note = '\u00a0Assigned for separately controlled development.\u00a0'
  current.events[3].assignment_reference = '\u00a0LOCAL-WORK-42\u00a0'
  current.request.review_note = current.events[3].note
  current.request.assignment_reference = current.events[3].assignment_reference
  state.result = current
  let response = await load(ownerRoute).GET(req({ query: `?request_id=${requestId}` }), context)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, available: true, ...current })
  state.result = listing([current.request], null)
  response = await load(adminRoute).GET(req({ admin: true }))
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).requests[0], current.request)
})

test('stored text outside SQL code-point limits fails closed instead of being truncated or normalized', async t => {
  const { load, state, context } = fixture(t)
  for (const extra of [{ title: '🧵'.repeat(181) }, { title: '🧵'.repeat(4) }, { description: '📦'.repeat(6001) }, { description: '📦'.repeat(9) }]) {
    state.result = listing([row(extra)])
    assert.equal((await load(ownerRoute).GET(req(), context)).status, 503)
    state.result = listing([row(extra)], null)
    assert.equal((await load(adminRoute).GET(req({ admin: true }))).status, 503)
  }
  for (const extra of [{ note: '📝'.repeat(2001) }, { assignment_reference: '🧵'.repeat(161) }]) {
    const current = assigned()
    Object.assign(current.events[3], extra)
    current.request.review_note = current.events[3].note
    current.request.assignment_reference = current.events[3].assignment_reference
    state.result = current
    assert.equal((await load(ownerRoute).GET(req({ query: `?request_id=${requestId}` }), context)).status, 503)
  }
  const current = assigned()
  current.events[2].note = '📝'.repeat(2001)
  state.result = current
  assert.equal((await load(ownerRoute).GET(req({ query: `?request_id=${requestId}` }), context)).status, 503, 'An older oversized event is invalid even when the current request is valid.')
})

test('stored text preservation does not permit blank required request or review fields', async t => {
  const { load, state, context } = fixture(t)
  for (const extra of [{ title: '     ' }, { description: '\t'.repeat(10) }]) {
    state.result = listing([row(extra)])
    assert.equal((await load(ownerRoute).GET(req(), context)).status, 503)
  }
  for (const extra of [{ note: ' \t\n' }, { assignment_reference: ' \t\n' }]) {
    const current = assigned()
    Object.assign(current.events[3], extra)
    current.request.review_note = current.events[3].note
    current.request.assignment_reference = current.events[3].assignment_reference
    state.result = current
    assert.equal((await load(ownerRoute).GET(req({ query: `?request_id=${requestId}` }), context)).status, 503)
  }
})

test('malformed success cannot include NUL or unpaired surrogate text that PostgreSQL cannot store', async t => {
  const { load, state, context } = fixture(t)
  for (const title of ['Valid\u0000 title', 'Valid\uD800 title', 'Valid\uDC00 title']) {
    state.result = listing([row({ title })])
    assert.equal((await load(ownerRoute).GET(req(), context)).status, 503)
  }
})
