'use client'

import { useEffect, useRef, useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'
import { formatCommerceMoney } from '@/lib/commerce/config'
import { checkedStorePayment, checkedStorePaymentCheckout } from '@/lib/commerce/payment-state'
import './commerce-payments.css'

let checkoutScript
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve()
  if (!checkoutScript) checkoutScript = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => window.Razorpay ? resolve() : reject(new Error('Payment checkout did not load. Your attempt is saved; use Check payment.'))
    script.onerror = () => { checkoutScript = null; script.remove(); reject(new Error('Payment checkout could not load. Your attempt is saved; use Check payment.')) }
    document.head.appendChild(script)
  })
  return checkoutScript
}
function savedAttempt(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    return typeof value?.cart_key === 'string' ? value : null
  } catch { return null }
}

// The parent supplies its existing stable cart key and clears the cart only on
// onComplete({order,items,receipt,payment}). A receipt awaiting fulfillment stays visible.
export function CommercePaymentCheckout({ websiteId, userId, client, checkout, onComplete, onStateChange, disabled = false }) {
  const storageKey = `commerce-payment-attempt:${websiteId}:${userId || 'signed-out'}`
  const [payment, setPayment] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(() => typeof window === 'undefined' ? null : savedAttempt(storageKey))
  const active = useRef(false)
  const attemptRef = useRef(attempt)
  const mounted = useRef(true)
  const popupRef = useRef(null)
  const popupOpen = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; popupOpen.current = false; popupRef.current?.close() }
  }, [])
  useEffect(() => {
    onStateChange?.(Boolean(attempt))
    return () => onStateChange?.(false)
  }, [attempt, onStateChange])
  function retain(value) {
    if (!mounted.current) return
    checkedStorePayment(value, websiteId, attemptRef.current?.intent_id)
    const next = { intent_id: value.id, cart_key: attemptRef.current?.cart_key || checkout?.idempotency_key }
    // Saving the attempt must succeed before opening a potentially chargeable UI.
    attemptRef.current = next; setAttempt(next); setPayment(value); onStateChange?.(true)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }
  function show(value) {
    if (!mounted.current) return
    checkedStorePayment(value, websiteId, attemptRef.current?.intent_id)
    setPayment(value)
    if (value.state === 'fulfilled' && value.order && value.receipt?.order_id === value.order.id) {
      onComplete?.({ order: value.order, items: value.items, receipt: value.receipt, payment: value })
      localStorage.removeItem(storageKey); attemptRef.current = null; setAttempt(null); onStateChange?.(false)
    }
  }
  async function check() {
    const current = attempt || savedAttempt(storageKey)
    if (!current || active.current) return
    if (!current.intent_id) { setError('Continue the saved checkout to recover its payment status. Keep the same cart.'); return }
    active.current = true; setBusy(true); setError('')
    try {
      const result = await commerceFetch('/api/commerce/payments/status', { client, method: 'POST', body: { intent_id: current.intent_id } })
      show(result.payment)
    } catch (failure) { setError(failure.message) } finally { active.current = false; setBusy(false) }
  }
  async function pay() {
    if (active.current || popupOpen.current || !userId) return
    active.current = true; setBusy(true); setError(''); onStateChange?.(true)
    try {
      const current = attempt || savedAttempt(storageKey)
      if (!current) {
        const pending = { cart_key: checkout.idempotency_key, intent_id: null }
        localStorage.setItem(storageKey, JSON.stringify(pending))
        attemptRef.current = pending; setAttempt(pending)
      }
      const result = current?.intent_id
        ? await commerceFetch('/api/commerce/payments/status', { client, method: 'POST', body: { intent_id: current.intent_id, resume: true } })
        : await commerceFetch('/api/commerce/payments/create', { client, method: 'POST', body: { ...checkout, idempotency_key: current?.cart_key || checkout.idempotency_key, website_id: websiteId, payment_method: 'razorpay' } })
      if (!mounted.current) return
      retain(result.payment); show(result.payment)
      if (!result.checkout) return
      const details = checkedStorePaymentCheckout(result.checkout, result.payment)
      await loadCheckout()
      if (!mounted.current) return
      const popup = new window.Razorpay({
        key: details.key_id, order_id: details.provider_order_id, amount: details.amount_paise, currency: details.currency,
        name: 'Store checkout', retry: { enabled: false },
        handler: async response => {
          if (!mounted.current) return
          setBusy(true); setError('')
          try {
            const verified = await commerceFetch('/api/commerce/payments/verify', { client, method: 'POST', body: { intent_id: details.intent_id, razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature } })
            show(verified.payment)
          } catch (failure) { setError(`${failure.message} Use Check payment before taking any further payment action.`) } finally { popupOpen.current = false; active.current = false; setBusy(false) }
        },
        modal: { ondismiss: () => { popupOpen.current = false; active.current = false; if (mounted.current) { setBusy(false); setError('Checkout closed. Use Check payment if you attempted a payment. This attempt is saved.') } } },
      })
      popup.on('payment.failed', () => setError('The provider did not confirm payment. Use Check payment before continuing.'))
      popupRef.current = popup
      popupOpen.current = true
      popup.open()
    } catch (failure) { popupOpen.current = false; setError(failure.message) } finally { if (!popupOpen.current) { active.current = false; setBusy(false) } if (!attemptRef.current) onStateChange?.(false) }
  }
  const captured = payment?.receipt && payment.receipt.state === 'captured_unfulfilled'
  const unresolved = ['creating','provider_unknown'].includes(payment?.state)
  return <section className="commerce-payment-checkout" aria-label="Online store payment">
    <div className="commerce-payment-actions">
      <button type="button" disabled={!userId || disabled && !attempt?.intent_id || busy || Boolean(captured) || unresolved} onClick={() => void pay()}>{busy ? 'Checking payment…' : attempt ? 'Continue saved payment' : 'Pay online'}</button>
      {attempt && <button type="button" disabled={busy} onClick={() => void check()}>Check payment</button>}
    </div>
    {error && <p role="alert">{error}</p>}
    {captured && <p className="commerce-payment-receipt" role="status">Payment of {formatCommerceMoney(payment.receipt.amount_paise)} is captured. Your order needs the store’s attention. Keep receipt {payment.receipt.id}. Do not pay again. A refund has not been confirmed.</p>}
    {unresolved && <p role="status">This payment attempt needs confirmation. Keep this checkout and contact the store if Check payment remains pending. Do not start another payment.</p>}
    {payment?.state === 'ready' && <p role="status">Your saved checkout is ready. Check payment if you have already attempted to pay.</p>}
    <p className="commerce-payment-note">Final prices and availability are checked by the store. Payment confirmation can take a moment.</p>
  </section>
}
export default CommercePaymentCheckout
