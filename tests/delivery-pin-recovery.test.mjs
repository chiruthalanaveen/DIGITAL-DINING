import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// This endpoint is intentionally unavailable until a verified, atomic recovery
// database contract exists. Load its actual source without credentials, Supabase
// or provider fixtures; these tests must not be counted as successful resets.
const source = readFileSync(new URL('../app/api/delivery/customer/forgot-pin/route.js', import.meta.url), 'utf8')
const route = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const origin = 'https://dining.example.test/api/delivery/customer/forgot-pin'
const account = { store: 'TESTSTORE', mobile: '9000000000' }
const details = { ...account, securityQuestionKey: 'private_phrase', securityAnswer: 'development answer', recoveryCode: 'DD-TESTCODE1234', newPin: '1234' }

function post(body = details) {
  return new Request(origin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

test('PIN recovery has explicit GET and POST handlers with dynamic Node routing', () => {
  assert.equal(typeof route.GET, 'function')
  assert.equal(typeof route.POST, 'function')
  assert.equal(route.runtime, 'nodejs')
  assert.equal(route.dynamic, 'force-dynamic')
})

test('PIN recovery rejects missing and malformed account identifiers', async () => {
  const cases = [{}, { ...account, store: '../TESTSTORE' }, { ...account, mobile: '123' }, { ...account, mobile: 9000000000 }]
  for (const body of cases) {
    const response = await route.POST(post(body))
    assert.equal(response.status, 400)
    assert.equal((await response.json()).code, 'INVALID_RECOVERY_DETAILS')
  }
  for (const query of ['', '?store=TESTSTORE', '?store=../TESTSTORE&mobile=9000000000', '?store=TESTSTORE&mobile=123']) {
    assert.equal((await route.GET(new Request(origin + query))).status, 400)
  }
})

test('PIN recovery rejects malformed JSON and non-object request bodies', async () => {
  for (const body of [null, [], 'invalid']) assert.equal((await route.POST(post(body))).status, 400)
  const malformed = new Request(origin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
  assert.equal((await route.POST(malformed)).status, 400)
})

test('PIN recovery fails closed with the same unavailable response for every valid account', async () => {
  const responses = [
    await route.GET(new Request(origin + '?store=TESTSTORE&mobile=9000000000')),
    await route.GET(new Request(origin + '?store=OTHERSTORE&mobile=9888888888')),
    await route.POST(post()),
    await route.POST(post({ ...details, store: 'OTHERSTORE', mobile: '9888888888', securityAnswer: 'wrong answer' })),
  ]
  const results = []
  for (const response of responses) {
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(response.headers.get('pragma'), 'no-cache')
    assert.equal(response.headers.get('set-cookie'), null)
    results.push(await response.json())
  }
  assert.ok(results.every(result => result.success === false && result.code === 'PIN_RECOVERY_UNAVAILABLE'))
  assert.ok(results.every(result => JSON.stringify(result) === JSON.stringify(results[0])))
  assert.match(results[0].message, /Your PIN has not changed/)
})

test('unavailable PIN recovery never echoes secrets or issues a replacement recovery code', async () => {
  const response = await route.POST(post())
  const result = await response.json()
  const text = JSON.stringify(result)
  for (const secret of [details.mobile, details.newPin, details.securityAnswer, details.recoveryCode]) assert.ok(!text.includes(secret))
  assert.equal(Object.hasOwn(result, 'recoveryCode'), false)
  assert.equal(Object.hasOwn(result, 'session_token'), false)
  assert.equal(Object.hasOwn(result, 'questionKey'), false)
})
