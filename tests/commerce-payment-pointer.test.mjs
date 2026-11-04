import assert from 'node:assert/strict'
import test from 'node:test'
import { mutatePaymentPointer } from '../lib/commerce/payment-pointer.js'

const storageKey = 'commerce-payment-attempt:72000000-0000-4000-8000-000000000001:71000000-0000-4000-8000-000000000001'
const cartA = '76000000-0000-4000-8000-000000000001'
const cartB = '76000000-0000-4000-8000-000000000002'
const intentA = '78000000-0000-4000-8000-000000000001'
const intentB = '78000000-0000-4000-8000-000000000002'
const pointerA = { cart_key: cartA, intent_id: intentA }
const pointerB = { cart_key: cartB, intent_id: intentB }
const changed = /The saved checkout changed in another tab\. Refresh to open the current checkout before paying again\./

function fixture(initial = null) {
  const values = new Map(initial === null ? [] : [[storageKey, JSON.stringify(initial)]])
  const calls = []
  const storage = {
    getItem(key) { calls.push(['get', key]); return values.get(key) ?? null },
    setItem(key, value) { calls.push(['set', key, value]); values.set(key, value) },
    removeItem(key) { calls.push(['remove', key]); values.delete(key) },
  }
  const queue = new Map()
  const locks = {
    request(name, options, callback) {
      assert.equal(options.mode, 'exclusive')
      const pending = (queue.get(name) || Promise.resolve()).then(() => callback())
      queue.set(name, pending.catch(() => {}))
      return pending
    },
  }
  const run = options => mutatePaymentPointer({ storageKey, cartKey: cartA, intentId: intentA, isCurrent: () => true, storage, locks, ...options })
  return { values, calls, storage, locks, run, pointer: () => JSON.parse(values.get(storageKey) || 'null') }
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('creation persists a pending cart under its account/store exclusive lock', async () => {
  const f = fixture()
  assert.deepEqual(await f.run({ operation: 'create', intentId: null }), { applied: true, pointer: { cart_key: cartA, intent_id: null } })
  assert.deepEqual(f.pointer(), { cart_key: cartA, intent_id: null })
})

test('read returns the persisted pointer without rewriting storage', async () => {
  const f = fixture(pointerA)
  assert.deepEqual(await f.run({ operation: 'read' }), { applied: true, pointer: pointerA })
  assert.deepEqual(f.calls.map(call => call[0]), ['get'])
})

test('matching proof can remove the current cart and original intent', async () => {
  const f = fixture(pointerA)
  assert.deepEqual(await f.run({ operation: 'remove' }), { applied: true, pointer: null })
  assert.equal(f.pointer(), null)
})

test('old-cart proof cannot remove a fresh pointer created in another tab', async () => {
  const f = fixture(pointerA)
  await f.run({ operation: 'remove' })
  await f.run({ operation: 'create', cartKey: cartB, intentId: intentB, next: pointerB })
  await assert.rejects(f.run({ operation: 'remove' }), changed)
  assert.deepEqual(f.pointer(), pointerB)
})

test('a delayed old-cart payment cannot overwrite a fresh pointer', async () => {
  const f = fixture(pointerA)
  await f.run({ operation: 'remove' })
  await f.run({ operation: 'create', cartKey: cartB, intentId: intentB, next: pointerB })
  await assert.rejects(f.run({ operation: 'write', next: pointerA }), changed)
  assert.deepEqual(f.pointer(), pointerB)
})

test('known intent mismatches fail closed for every operation', async () => {
  for (const operation of ['create', 'write', 'remove', 'read']) {
    const f = fixture(pointerA)
    await assert.rejects(f.run({ operation, intentId: intentB, next: { cart_key: cartA, intent_id: intentB } }), changed)
    assert.deepEqual(f.pointer(), pointerA)
    assert.equal(f.calls.some(call => call[0] !== 'get'), false)
  }
})

test('write and read cannot resurrect a pointer that another tab already cleared', async () => {
  for (const operation of ['write', 'read']) {
    const f = fixture()
    await assert.rejects(f.run({ operation, next: pointerA }), changed)
    assert.equal(f.pointer(), null)
    assert.equal(f.calls.some(call => call[0] === 'set'), false)
  }
})

test('a verified removal remains idempotent when the pointer is already absent', async () => {
  const f = fixture()
  assert.deepEqual(await f.run({ operation: 'remove' }), { applied: true, pointer: null })
  assert.deepEqual(f.calls.map(call => call[0]), ['get'])
})

test('replayed pending creation or write never downgrades a known intent', async () => {
  for (const operation of ['create', 'write']) {
    const f = fixture(pointerA)
    assert.deepEqual(await f.run({ operation, intentId: null, next: { cart_key: cartA, intent_id: null } }), { applied: true, pointer: pointerA })
    assert.deepEqual(f.pointer(), pointerA)
    assert.equal(f.calls.some(call => call[0] === 'set'), false)
  }
})

test('a matching write upgrades a pending pointer with its recovered intent', async () => {
  const f = fixture({ cart_key: cartA, intent_id: null })
  assert.deepEqual(await f.run({ operation: 'write', next: pointerA }), { applied: true, pointer: pointerA })
  assert.deepEqual(f.pointer(), pointerA)
})

test('malformed stored pointers remain preserved and block all changes', async () => {
  for (const value of ['broken JSON', 'null', '[]', JSON.stringify({ cart_key: cartA }), JSON.stringify({ cart_key: 'wrong', intent_id: intentA }), JSON.stringify({ cart_key: cartA, intent_id: false })]) {
    const f = fixture()
    f.values.set(storageKey, value)
    await assert.rejects(f.run({ operation: 'remove' }), changed)
    assert.equal(f.values.get(storageKey), value)
  }
})

test('new pointers must match the requested cart and known original intent', async () => {
  for (const next of [pointerB, { cart_key: cartA, intent_id: intentB }, { cart_key: cartA, intent_id: '' }, { cart_key: cartA }, []]) {
    const f = fixture(pointerA)
    await assert.rejects(f.run({ operation: 'write', next }), changed)
    assert.deepEqual(f.pointer(), pointerA)
  }
})

test('unsupported locking fails closed without touching storage', async () => {
  const f = fixture()
  await assert.rejects(f.run({ operation: 'create', locks: null }), /requires a secure browser with checkout locking/)
  assert.deepEqual(f.calls, [])
  assert.equal(f.pointer(), null)
})

test('storage read, write and removal failures reject instead of reporting an applied change', async () => {
  for (const [method, initial, operation, next] of [
    ['getItem', pointerA, 'read', null],
    ['setItem', null, 'create', pointerA],
    ['removeItem', pointerA, 'remove', null],
  ]) {
    const f = fixture(initial)
    f.storage[method] = () => { throw new Error('storage denied') }
    await assert.rejects(f.run({ operation, next }), /storage denied/)
    assert.deepEqual(f.pointer(), initial)
  }
})

test('stale operations do not read or mutate storage', async () => {
  const f = fixture(pointerA)
  assert.deepEqual(await f.run({ operation: 'remove', isCurrent: () => false }), { applied: false, pointer: null })
  assert.deepEqual(f.calls, [])
  assert.deepEqual(f.pointer(), pointerA)
})

test('a queued old-cart removal rechecks the pointer only after acquiring the lock', async () => {
  const f = fixture(pointerA)
  const gate = deferred()
  const acquired = deferred()
  const holder = f.locks.request(`commerce-payment-pointer:${storageKey}`, { mode: 'exclusive' }, async () => { acquired.resolve(); await gate.promise })
  await acquired.promise
  const removeA = f.run({ operation: 'remove' })
  const createB = f.run({ operation: 'create', cartKey: cartB, intentId: intentB, next: pointerB })
  const lateRemoveA = f.run({ operation: 'remove' })
  gate.resolve()
  await holder
  await removeA
  await createB
  await assert.rejects(lateRemoveA, changed)
  assert.deepEqual(f.pointer(), pointerB)
})

test('an operation invalidated while waiting for the lock leaves the fresh pointer untouched', async () => {
  const f = fixture(pointerA)
  const gate = deferred()
  const acquired = deferred()
  let current = true
  const holder = f.locks.request(`commerce-payment-pointer:${storageKey}`, { mode: 'exclusive' }, async () => { acquired.resolve(); await gate.promise })
  await acquired.promise
  const pending = f.run({ operation: 'remove', isCurrent: () => current })
  current = false
  f.values.set(storageKey, JSON.stringify(pointerB))
  gate.resolve()
  await holder
  assert.deepEqual(await pending, { applied: false, pointer: null })
  assert.deepEqual(f.calls, [])
  assert.deepEqual(f.pointer(), pointerB)
})

test('scope invalidation during a storage read is checked again before mutation', async () => {
  const f = fixture(pointerA)
  let current = true
  const getItem = f.storage.getItem
  f.storage.getItem = key => { const value = getItem(key); current = false; return value }
  assert.deepEqual(await f.run({ operation: 'remove', isCurrent: () => current }), { applied: false, pointer: null })
  assert.deepEqual(f.pointer(), pointerA)
  assert.equal(f.calls.some(call => call[0] === 'remove'), false)
})
