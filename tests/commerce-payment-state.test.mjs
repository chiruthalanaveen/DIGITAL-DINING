import assert from 'node:assert/strict'
import test from 'node:test'
import { checkedStorePayment, checkedStorePaymentCheckout } from '../lib/commerce/payment-state.js'

const website = '72000000-0000-4000-8000-000000000001'
const intent = '78000000-0000-4000-8000-000000000001'
const foreign = '72000000-0000-4000-8000-000000000002'
const payment = { id: intent, website_id: website, amount_paise: 502, currency: 'INR', state: 'ready', provider_order_id: 'order_fixture001', receipt: null }
const checkout = { intent_id: intent, key_id: 'rzp_test_fixture001', provider_order_id: 'order_fixture001', amount_paise: 502, currency: 'INR' }

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
