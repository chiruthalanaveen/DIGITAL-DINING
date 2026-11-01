import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../lib/commerce/authRedirect.js', import.meta.url), 'utf8')
const { commerceEmailRedirect, parseCommerceCallback } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const origin = 'https://dining.example.test'

test('owner verification uses the allowed commerce callback and fixed application destination', () => {
  const redirect = commerceEmailRedirect(origin, { audience: 'owner' })
  assert.equal(redirect, `${origin}/auth/callback/commerce?audience=owner`)
  assert.deepEqual(parseCommerceCallback(new URL(redirect).searchParams), {
    scope: 'owner', destination: '/commerce/apply', signInPath: '/commerce/auth',
  })
})

test('owner recovery is explicitly marked and returns to the password-update form', () => {
  const redirect = commerceEmailRedirect(origin, { audience: 'owner', recovery: true })
  assert.equal(redirect, `${origin}/auth/callback/commerce?audience=owner&recovery=1`)
  assert.deepEqual(parseCommerceCallback(new URL(redirect).searchParams), {
    scope: 'owner', destination: '/commerce/auth?recovery=1', signInPath: '/commerce/auth',
  })
  assert.equal(new URL(commerceEmailRedirect(origin, { audience: 'owner', recovery: false })).searchParams.has('recovery'), false)
})

test('customer verification and recovery preserve each storefront session scope', () => {
  for (const slug of ['saree-store', 'grocery-store']) {
    const redirect = commerceEmailRedirect(origin, { audience: 'customer', slug })
    assert.equal(redirect, `${origin}/auth/callback/commerce?audience=customer&store=${slug}`)
    assert.deepEqual(parseCommerceCallback(new URL(redirect).searchParams), {
      scope: `customer:${slug}`, destination: `/shops/${slug}/account`, signInPath: `/shops/${slug}/account`,
    })
    const recovery = commerceEmailRedirect(origin, { audience: 'customer', slug, recovery: true })
    assert.deepEqual(parseCommerceCallback(new URL(recovery).searchParams), {
      scope: `customer:${slug}`, destination: `/shops/${slug}/account?recovery=1`, signInPath: `/shops/${slug}/account`,
    })
  }
})

test('callback origins allow HTTP development and HTTPS while rejecting credentials and non-origins', () => {
  assert.equal(commerceEmailRedirect('http://127.0.0.1:4320', { audience: 'owner' }), 'http://127.0.0.1:4320/auth/callback/commerce?audience=owner')
  assert.equal(commerceEmailRedirect(`${origin}/`, { audience: 'owner' }), `${origin}/auth/callback/commerce?audience=owner`)
  for (const invalid of ['javascript:alert(1)', 'ftp://dining.example.test', '//evil.example.test', 'https://user:secret@dining.example.test', `${origin}/path`, `${origin}?next=evil`, `${origin}#token`, 'https:\\evil.example.test', ' https://dining.example.test', null]) {
    assert.throws(() => commerceEmailRedirect(invalid, { audience: 'owner' }))
  }
})

test('builders reject arbitrary audiences, owner storefronts and non-boolean recovery options', () => {
  for (const options of [null, [], {}, { audience: 'admin' }, { audience: 'OWNER' }, { audience: 'customer' }, { audience: 'owner', slug: 'sarees' }, { audience: 'owner', recovery: '1' }, { audience: 'customer', slug: 'sarees', recovery: 1 }]) {
    assert.throws(() => commerceEmailRedirect(origin, options))
  }
})

test('storefront slug bounds match the installed SQL without allowing path or scope input', () => {
  for (const slug of ['ab', 'a--b', 'a'.repeat(80)]) {
    assert.equal(parseCommerceCallback(`audience=customer&store=${slug}`).scope, `customer:${slug}`)
  }
  for (const slug of ['', 'a', 'a'.repeat(81), '-sarees', 'sarees-', 'Sarees', '../sarees', 'sarees/account', 'sarees\\account', 'customer:sarees', 'sarees%2faccount', 'sarees store', 'sarees?next=//evil', 'sarees#token', 'sarees\n', '商店']) {
    assert.throws(() => commerceEmailRedirect(origin, { audience: 'customer', slug }))
    assert.equal(parseCommerceCallback(new URLSearchParams({ audience: 'customer', store: slug })), null)
  }
})

test('callback context rejects missing, malformed and duplicated critical routing parameters', () => {
  for (const query of ['', 'audience=', 'audience=admin', 'audience=owner&store=', 'audience=owner&store=sarees', 'audience=customer', 'audience=owner&audience=owner', 'audience=owner&%61udience=customer', 'audience=customer&store=sarees&store=grocery', 'audience=owner&recovery=1&recovery=1', 'audience=owner&recovery=', 'audience=owner&recovery=0', 'audience=owner&recovery=true']) {
    assert.equal(parseCommerceCallback(query), null, query)
  }
})

test('encoded path traversal, separators and double-encoded storefronts cannot select a callback scope', () => {
  for (const query of ['audience=customer&store=..%2Fsarees', 'audience=customer&store=sarees%2Faccount', 'audience=customer&store=sarees%252Faccount', 'audience=customer&store=%2F%2Fevil.example.test', 'audience=customer&store=sarees%5Caccount', 'audience=customer&store=sarees%00', 'audience=owner%20', 'audience=customer&store=sarees%0d%0a']) {
    assert.equal(parseCommerceCallback(query), null, query)
  }
})

test('provider errors and caller-chosen redirects or scopes never become successful contexts', () => {
  for (const extra of ['error=expired', 'error=', 'error_code=otp_expired', 'error_description=private-token', 'next=https%3A%2F%2Fevil.example.test', 'next=%2Fadmin%2Fdashboard', 'scope=customer%3Agrocery', 'redirect_to=%2F%2Fevil.example.test', 'redirectTo=%2Fcommerce%2Fdashboard']) {
    assert.equal(parseCommerceCallback(`audience=owner&${extra}`), null, extra)
  }
})

test('opaque SDK code and flow metadata are preserved without changing fixed context or mutating parameters', () => {
  const params = new URLSearchParams('audience=customer&store=sarees&recovery=1&code=opaque-pkce-code&sb_flow_id=flow-id')
  const before = params.toString()
  assert.deepEqual(parseCommerceCallback(params), {
    scope: 'customer:sarees', destination: '/shops/sarees/account?recovery=1', signInPath: '/shops/sarees/account',
  })
  assert.equal(params.toString(), before)
})

test('invalid parameter objects fail gracefully without trusting caller-defined path fields', () => {
  for (const value of [null, undefined, {}, { audience: 'owner', destination: '//evil.example.test' }, { getAll() { throw new Error('invalid') } }]) {
    assert.equal(parseCommerceCallback(value), null)
  }
})
