import assert from 'node:assert/strict'
import test from 'node:test'
import { checkedPaymentAttemptControl, checkedStorePayment, checkedStorePaymentCheckout, checkedUnstartedCancellation } from '../lib/commerce/payment-state.js'

const website = '72000000-0000-4000-8000-000000000001'
const intent = '78000000-0000-4000-8000-000000000001'
const foreign = '72000000-0000-4000-8000-000000000002'
const payment = { id: intent, website_id: website, amount_paise: 502, currency: 'INR', state: 'ready', provider_order_id: 'order_fixture001', receipt: null }
const checkout = { intent_id: intent, key_id: 'rzp_test_fixture001', provider_order_id: 'order_fixture001', amount_paise: 502, currency: 'INR' }
const cart = '76000000-0000-4000-8000-000000000001'
const unstarted = { ...payment, state: 'new', provider_order_id: null, order: null, items: [] }
const control = { available: true, website_id: website, cart_key: cart, intent_id: intent, payment: unstarted, cancellation: null, can_cancel_unstarted: true, found: true }
const proof = { id: '7b000000-0000-4000-8000-000000000001', intent_id: intent, cancelled_at: '2026-11-04T12:00:00.123456+00:00', reason: 'never_dispatched' }
const cancelled = { ...control, payment: { ...unstarted, state: 'cancelled_unstarted' }, cancellation: proof, can_cancel_unstarted: false }

test('copied storage intents and malformed payment views cannot cross store or attempt boundaries', () => {
  assert.equal(checkedStorePayment(payment, website, intent), payment)
  for (const [value, store, expected] of [[payment, foreign, intent], [{ ...payment, id: foreign }, website, intent], [{ ...payment, currency: 'USD' }, website, intent], [{ ...payment, amount_paise: 0 }, website, intent], [{ ...payment, state: 'paid' }, website, intent]]) assert.throws(() => checkedStorePayment(value, store, expected), /could not be verified/)
})
test('payment popups require the bound intent, provider order, exact amount, currency and public key', () => {
  assert.equal(checkedStorePaymentCheckout(checkout, payment), checkout)
  for (const change of [{ intent_id: foreign }, { provider_order_id: 'order_other001' }, { amount_paise: 1 }, { currency: 'USD' }, { key_id: 'secret-key' }]) assert.throws(() => checkedStorePaymentCheckout({ ...checkout, ...change }, payment))
  assert.throws(() => checkedStorePaymentCheckout(checkout, { ...payment, state: 'captured_unfulfilled' }))
})
test('only a matching fulfilled paid order and immutable receipt can release a saved attempt', () => {
  const order = { id: '7a000000-0000-4000-8000-000000000001', website_id: website, payment_method: 'razorpay', payment_status: 'paid', total_paise: 502 }
  const receipt = { id: '79000000-0000-4000-8000-000000000001', state: 'fulfilled', amount_paise: 502, currency: 'INR', order_id: order.id }
  const fulfilled = { ...payment, state: 'fulfilled', order, receipt, items: [] }
  assert.equal(checkedStorePayment(fulfilled, website, intent), fulfilled)
  for (const value of [{ ...fulfilled, order: { ...order, website_id: foreign } }, { ...fulfilled, order: { ...order, total_paise: 1 } }, { ...fulfilled, receipt: { ...receipt, order_id: foreign } }, { ...fulfilled, receipt: null }]) assert.throws(() => checkedStorePayment(value, website, intent))
  const held = { ...payment, state: 'captured_unfulfilled', receipt: { ...receipt, state: 'captured_unfulfilled', order_id: null } }
  assert.equal(checkedStorePayment(held, website, intent), held)
})

test('cart-key inspection recovers an unknown intent ID without inferring cancellation', () => {
  assert.equal(checkedPaymentAttemptControl(control, website, cart), control)
  assert.equal(checkedPaymentAttemptControl(control, website, cart, intent), control)
  assert.throws(() => checkedUnstartedCancellation(control, website, cart, intent))
})

test('missing records and unavailable optional capability are never cancellation proof', () => {
  const missing = { ...control, intent_id: null, payment: null, cancellation: null, can_cancel_unstarted: false, found: false }
  for (const available of [true, false]) {
    const result = { ...missing, available }
    assert.equal(checkedPaymentAttemptControl(result, website, cart), result)
    assert.throws(() => checkedUnstartedCancellation(result, website, cart))
  }
  for (const change of [{ can_cancel_unstarted: true }, { cancellation: proof }, { payment: unstarted }, { intent_id: intent }, { found: true }]) assert.throws(() => checkedPaymentAttemptControl({ ...missing, ...change }, website, cart))
})

test('only exact store, cart and original intent bindings can authorize stopping an unstarted request', () => {
  assert.equal(checkedUnstartedCancellation(cancelled, website, cart, intent), cancelled)
  for (const [value, store, key, expectedIntent] of [
    [cancelled, foreign, cart, intent], [cancelled, website, foreign, intent], [cancelled, website, cart, foreign],
    [{ ...cancelled, website_id: foreign }, website, cart, intent],
    [{ ...cancelled, cart_key: foreign }, website, cart, intent],
    [{ ...cancelled, intent_id: foreign }, website, cart, intent],
    [{ ...cancelled, payment: { ...cancelled.payment, website_id: foreign } }, website, cart, intent],
    [{ ...cancelled, cancellation: { ...proof, intent_id: foreign } }, website, cart, intent],
  ]) assert.throws(() => checkedUnstartedCancellation(value, store, key, expectedIntent))
})

test('a terminal-looking status without durable cancellation proof cannot release a pointer', () => {
  assert.equal(checkedStorePayment(cancelled.payment, website, intent), cancelled.payment)
  for (const cancellation of [null, undefined, {}, { ...proof, id: 'invalid' }, { ...proof, reason: 'payment_failed' }, { ...proof, cancelled_at: 'not-a-date' }, { ...proof, cancelled_at: '2026-11-04T12:00:00' }]) assert.throws(() => checkedUnstartedCancellation({ ...cancelled, cancellation }, website, cart, intent))
  assert.throws(() => checkedUnstartedCancellation({ ...cancelled, can_cancel_unstarted: true }, website, cart, intent))
})

test('provider-dispatched and captured states cannot be advertised as safely cancellable', () => {
  for (const state of ['creating', 'provider_unknown', 'ready']) {
    const started = { ...control, payment: { ...unstarted, state }, can_cancel_unstarted: false }
    assert.equal(checkedPaymentAttemptControl(started, website, cart, intent), started)
    assert.throws(() => checkedPaymentAttemptControl({ ...started, can_cancel_unstarted: true }, website, cart, intent))
    assert.throws(() => checkedUnstartedCancellation(started, website, cart, intent))
  }
  for (const change of [{ provider_order_id: 'order_fixture001' }, { receipt: {} }, { order: {} }, { items: [{}] }]) assert.throws(() => checkedPaymentAttemptControl({ ...control, payment: { ...unstarted, ...change } }, website, cart, intent))
})

test('unstarted cancellation cannot include provider, receipt, order or inventory consumption evidence', () => {
  for (const change of [{ provider_order_id: 'order_fixture001' }, { receipt: {} }, { order: {} }, { items: [{}] }]) assert.throws(() => checkedUnstartedCancellation({ ...cancelled, payment: { ...cancelled.payment, ...change } }, website, cart, intent))
  assert.throws(() => checkedStorePaymentCheckout(checkout, cancelled.payment))
})

test('attempt eligibility and availability booleans reject string or missing-value coercion', () => {
  for (const change of [{ available: 'true' }, { found: 'true' }, { can_cancel_unstarted: 'true' }, { available: undefined }, { found: undefined }, { can_cancel_unstarted: undefined }]) assert.throws(() => checkedPaymentAttemptControl({ ...control, ...change }, website, cart, intent))
})
