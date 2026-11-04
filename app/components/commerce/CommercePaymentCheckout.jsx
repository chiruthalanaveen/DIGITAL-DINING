'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'
import { formatCommerceMoney } from '@/lib/commerce/config'
import { checkedPaymentAttemptControl, checkedStorePayment, checkedStorePaymentCheckout, checkedUnstartedCancellation } from '@/lib/commerce/payment-state'
import { mutatePaymentPointer } from '@/lib/commerce/payment-pointer'
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
function PaymentCheckout({ websiteId, userId, client, checkout, onComplete, onCancelled, onStateChange, disabled = false }) {
  const storageKey = `commerce-payment-attempt:${websiteId}:${userId || 'signed-out'}`
  const [payment, setPayment] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [control, setControl] = useState(null)
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(() => typeof window === 'undefined' ? null : savedAttempt(storageKey))
  const hasAttempt = Boolean(attempt)
  const active = useRef(false)
  const attemptRef = useRef(attempt)
  const mounted = useRef(true)
  const popupRef = useRef(null)
  const popupOpen = useRef(false)
  const scopeVersion = useRef(0)
  const controlSequence = useRef(0)
  useEffect(() => {
    mounted.current = true
    scopeVersion.current += 1
    return () => { mounted.current = false; scopeVersion.current += 1; controlSequence.current += 1; popupOpen.current = false; try { popupRef.current?.close() } catch {} }
  }, [])
  useEffect(() => {
    // Changing a callback, inspecting again or unmounting is not authority to
    // release a saved attempt. Parent account switches own their next scope.
    if (hasAttempt) onStateChange?.(true)
  }, [hasAttempt, onStateChange])
  useEffect(() => {
    function changed(event) {
      if (event.key !== storageKey && event.key !== null) return
      const saved = savedAttempt(storageKey), current = attemptRef.current
      if ((!current && !saved) || current && saved && current.cart_key === saved.cart_key && (!current.intent_id || !saved.intent_id || current.intent_id === saved.intent_id)) return
      // A different tab changing the shared pointer invalidates all old work.
      // Refresh adopts that pointer through the parent account initialization;
      // a storage event alone never releases the current bag.
      scopeVersion.current += 1; controlSequence.current += 1
      active.current = false; popupOpen.current = false; setBusy(false); setControl(null)
      try { popupRef.current?.close() } catch {}
      setError('The saved checkout changed in another tab. Refresh to open the current checkout before paying again.')
      onStateChange?.(true)
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [onStateChange, storageKey])
  const currentRequest = useCallback((version, cartKey = null) => mounted.current && scopeVersion.current === version && (!cartKey || attemptRef.current?.cart_key === cartKey), [])
  const acceptPayment = useCallback(async (value, cartKey, expectedIntentId = null) => {
    if (!mounted.current || attemptRef.current?.cart_key !== cartKey) return true
    const version = scopeVersion.current
    checkedStorePayment(value, websiteId, expectedIntentId || attemptRef.current?.intent_id)
    setPayment(value)
    if (value.state === 'fulfilled' && value.order && value.receipt?.order_id === value.order.id) {
      const result = await mutatePaymentPointer({ storageKey, cartKey, intentId: value.id, operation: 'remove', isCurrent: () => currentRequest(version, cartKey) })
      if (!result.applied || !currentRequest(version, cartKey)) return true
      attemptRef.current = null; setAttempt(null); setPayment(value); setControl(null)
      active.current = false; popupOpen.current = false; setBusy(false)
      try { popupRef.current?.close() } catch {}
      onComplete?.({ order: value.order, items: value.items, receipt: value.receipt, payment: value }); onStateChange?.(false)
      return true
    }
    const next = { intent_id: value.id, cart_key: cartKey }
    // Persist the pointer before opening any potentially chargeable checkout.
    const result = await mutatePaymentPointer({ storageKey, cartKey, intentId: value.id, operation: 'write', next, isCurrent: () => currentRequest(version, cartKey) })
    if (!result.applied || !currentRequest(version, cartKey)) return true
    attemptRef.current = result.pointer; setAttempt(result.pointer); onStateChange?.(true)
    return false
  }, [currentRequest, onComplete, onStateChange, storageKey, websiteId])
  const acceptControl = useCallback(async (value, cartKey, expectedIntentId = null) => {
    if (!mounted.current || attemptRef.current?.cart_key !== cartKey) return true
    const version = scopeVersion.current
    checkedPaymentAttemptControl(value, websiteId, cartKey, expectedIntentId)
    setControl(value)
    if (value.cancellation) {
      checkedUnstartedCancellation(value, websiteId, cartKey, expectedIntentId)
      // A terminal state alone is not release authority. Keep the pointer if
      // removal fails; the same immutable proof can be checked again later.
      setPayment(value.payment)
      const result = await mutatePaymentPointer({ storageKey, cartKey, intentId: value.intent_id, operation: 'remove', isCurrent: () => currentRequest(version, cartKey) })
      if (!result.applied || !currentRequest(version, cartKey)) return true
      attemptRef.current = null; setAttempt(null); setPayment(value.payment)
      active.current = false; popupOpen.current = false; setBusy(false)
      setNotice('The unstarted payment request was stopped. Your bag is unchanged.')
      onCancelled?.(value); onStateChange?.(false)
      return true
    }
    if (value.payment) return acceptPayment(value.payment, cartKey, expectedIntentId)
    if (value.available && !value.found) setPayment(null)
    return false
  }, [acceptPayment, currentRequest, onCancelled, onStateChange, storageKey, websiteId])
  const inspect = useCallback((current, action = 'inspect', signal) => commerceFetch('/api/commerce/payments/attempt', {
    client, method: 'POST', signal,
    body: { website_id: websiteId, cart_key: current.cart_key, action, ...(current.intent_id ? { intent_id: current.intent_id } : {}) },
  }), [client, websiteId])
  const cartKey = attempt?.cart_key || null
  const intentId = attempt?.intent_id || null
  useEffect(() => {
    if (!cartKey || !client || !userId) return
    const controller = new AbortController()
    const version = scopeVersion.current
    const sequence = ++controlSequence.current
    inspect({ cart_key: cartKey, intent_id: intentId }, 'inspect', controller.signal).then(result => {
      if (!controller.signal.aborted && sequence === controlSequence.current && currentRequest(version, cartKey)) return acceptControl(result, cartKey, intentId)
    }).catch(failure => {
      if (!controller.signal.aborted && sequence === controlSequence.current && currentRequest(version, cartKey)) setError(failure.message || 'This saved request could not be inspected. Keep its reference and try again.')
    })
    return () => controller.abort()
  }, [acceptControl, cartKey, client, currentRequest, inspect, intentId, userId])
  async function check() {
    const current = attemptRef.current || savedAttempt(storageKey)
    if (!current || active.current) return
    const version = scopeVersion.current
    controlSequence.current += 1
    active.current = true; setBusy(true); setError('')
    try {
      const inspection = await inspect(current)
      if (!currentRequest(version, current.cart_key)) return
      if (await acceptControl(inspection, current.cart_key, current.intent_id)) return
      if (inspection.available && !inspection.found) { setError('The original request is not confirmed yet. Keep this checkout reference; absence is not proof that it can be stopped.'); return }
      const recovered = attemptRef.current
      if (!recovered?.intent_id) { setError('The original request is not confirmed yet. Keep this checkout reference; absence is not proof that it can be stopped.'); return }
      if (inspection.available && inspection.payment?.state === 'new') return
      if (!inspection.available) {
        // Older installed contracts can still confirm an own payment. Check
        // its tenant binding before invoking any provider reconciliation.
        const saved = await commerceFetch(`/api/commerce/payments/status?intent_id=${encodeURIComponent(recovered.intent_id)}`, { client })
        if (!currentRequest(version, current.cart_key)) return
        checkedStorePayment(saved.payment, websiteId, recovered.intent_id)
        if (await acceptPayment(saved.payment, current.cart_key, recovered.intent_id)) return
        if (saved.payment.state === 'cancelled_unstarted') throw new Error('The original cancellation proof is unavailable. Keep this attempt and contact the store.')
        if (!saved.payment.provider_order_id) return
      }
      const result = await commerceFetch('/api/commerce/payments/status', { client, method: 'POST', body: { intent_id: recovered.intent_id } })
      if (!currentRequest(version, current.cart_key)) return
      if (result.payment?.state === 'cancelled_unstarted') await acceptControl(await inspect(recovered), current.cart_key, recovered.intent_id)
      else await acceptPayment(result.payment, current.cart_key, recovered.intent_id)
    } catch (failure) { if (currentRequest(version, current.cart_key)) setError(failure.message) } finally { if (currentRequest(version) && (!attemptRef.current || attemptRef.current.cart_key === current.cart_key)) { active.current = false; setBusy(false) } }
  }
  async function stopUnstarted() {
    const current = attemptRef.current
    if (!current || active.current || popupOpen.current) return
    const version = scopeVersion.current
    controlSequence.current += 1
    active.current = true; setBusy(true); setError('')
    try {
      const stored = await mutatePaymentPointer({ storageKey, cartKey: current.cart_key, intentId: current.intent_id || null, operation: 'read', isCurrent: () => currentRequest(version, current.cart_key) })
      if (!stored.applied || !currentRequest(version, current.cart_key)) return
      const result = await inspect(current, 'cancel_unstarted')
      if (!currentRequest(version, current.cart_key)) return
      checkedUnstartedCancellation(result, websiteId, current.cart_key, current.intent_id)
      await acceptControl(result, current.cart_key, current.intent_id)
    } catch (failure) { if (currentRequest(version, current.cart_key)) { setControl(null); setError(`${failure.message} Keep this attempt and check its status before trying another payment method.`) } }
    finally { if (currentRequest(version) && (!attemptRef.current || attemptRef.current.cart_key === current.cart_key)) { active.current = false; setBusy(false) } }
  }
  async function pay() {
    if (active.current || popupOpen.current || !userId) return
    const version = scopeVersion.current
    const current = attemptRef.current || savedAttempt(storageKey)
    const requestedCartKey = current?.cart_key || checkout.idempotency_key
    controlSequence.current += 1
    active.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const stored = await mutatePaymentPointer({ storageKey, cartKey: requestedCartKey, intentId: current?.intent_id || null, operation: current ? 'read' : 'create', next: current ? null : { cart_key: requestedCartKey, intent_id: null }, isCurrent: () => currentRequest(version) && (!attemptRef.current || attemptRef.current.cart_key === requestedCartKey) })
      if (!stored.applied || !currentRequest(version)) return
      const saved = stored.pointer
      attemptRef.current = saved; setAttempt(saved); onStateChange?.(true)
      if (saved.intent_id) {
        // Resume only the saved cart's own intent. Knowing another intent ID
        // from this account is not enough to bind its payment to this bag.
        const inspection = await inspect(saved)
        if (!currentRequest(version, requestedCartKey)) return
        if (await acceptControl(inspection, requestedCartKey, saved.intent_id)) return
        if (!inspection.available || !inspection.found) throw new Error('The saved checkout could not be confirmed for this bag. Keep its reference and use Check payment before continuing.')
        if (inspection.payment?.state === 'new') return
      }
      const result = saved.intent_id
        ? await commerceFetch('/api/commerce/payments/status', { client, method: 'POST', body: { intent_id: saved.intent_id, resume: true } })
        : await commerceFetch('/api/commerce/payments/create', { client, method: 'POST', body: { ...checkout, idempotency_key: saved.cart_key, website_id: websiteId, payment_method: 'razorpay' } })
      if (!currentRequest(version, requestedCartKey)) return
      controlSequence.current += 1
      if (result.attempt_control) {
        if (result.payment?.id !== result.attempt_control.intent_id || result.payment?.state !== result.attempt_control.payment?.state) throw new Error('The payment response did not match its original request. Keep this attempt and check again.')
        if (await acceptControl(result.attempt_control, requestedCartKey, saved.intent_id)) return
      } else if (result.payment?.state === 'cancelled_unstarted') {
        const resultControl = await inspect({ cart_key: requestedCartKey, intent_id: result.payment.id })
        if (!currentRequest(version, requestedCartKey)) return
        checkedUnstartedCancellation(resultControl, websiteId, requestedCartKey, result.payment.id)
        await acceptControl(resultControl, requestedCartKey, result.payment.id)
        return
      } else if (await acceptPayment(result.payment, requestedCartKey, saved.intent_id)) return
      if (!result.checkout) return
      const details = checkedStorePaymentCheckout(result.checkout, result.payment)
      await loadCheckout()
      if (!currentRequest(version, requestedCartKey)) return
      const popup = new window.Razorpay({
        key: details.key_id, order_id: details.provider_order_id, amount: details.amount_paise, currency: details.currency,
        name: 'Store checkout', retry: { enabled: false },
        handler: async response => {
          if (!currentRequest(version, requestedCartKey)) return
          setBusy(true); setError('')
          try {
            const verified = await commerceFetch('/api/commerce/payments/verify', { client, method: 'POST', body: { intent_id: details.intent_id, razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature } })
            if (currentRequest(version, requestedCartKey)) await acceptPayment(verified.payment, requestedCartKey, details.intent_id)
          } catch (failure) { if (currentRequest(version, requestedCartKey)) setError(`${failure.message} Use Check payment before taking any further payment action.`) } finally { if (currentRequest(version) && (!attemptRef.current || attemptRef.current.cart_key === requestedCartKey)) { popupOpen.current = false; active.current = false; setBusy(false) } }
        },
        modal: { ondismiss: () => { if (currentRequest(version, requestedCartKey)) { popupOpen.current = false; active.current = false; setBusy(false); setError('Checkout closed. Use Check payment if you attempted a payment. This attempt is saved.') } } },
      })
      popup.on('payment.failed', () => { if (currentRequest(version, requestedCartKey)) setError('The provider did not confirm payment. Use Check payment before continuing.') })
      popupRef.current = popup
      popupOpen.current = true
      popup.open()
    } catch (failure) { if (currentRequest(version)) { if (failure.code === 'COMMERCE_ATTEMPT_CHANGED') onStateChange?.(true); if (!attemptRef.current || attemptRef.current.cart_key === requestedCartKey) { popupOpen.current = false; setError(failure.message) } } } finally { if (currentRequest(version) && (!attemptRef.current || attemptRef.current.cart_key === requestedCartKey)) { if (!popupOpen.current) { active.current = false; setBusy(false) } } }
  }
  const captured = payment?.receipt && payment.receipt.state === 'captured_unfulfilled'
  const unresolved = ['creating','provider_unknown'].includes(payment?.state)
  const unstarted = Boolean(attempt?.intent_id && payment?.state === 'new')
  const canStop = Boolean(attempt && control?.available && control.cart_key === attempt.cart_key && control.intent_id === attempt.intent_id && control.can_cancel_unstarted && !control.cancellation && payment?.state === 'new')
  return <section className="commerce-payment-checkout" aria-label="Online store payment">
    <div className="commerce-payment-actions">
      <button type="button" disabled={!userId || disabled && !attempt?.intent_id || busy || Boolean(captured) || unresolved || unstarted} onClick={() => void pay()}>{busy ? 'Checking payment…' : unstarted ? 'Stop this request to restart checkout' : attempt ? 'Continue saved payment' : 'Pay online'}</button>
      {attempt && <button type="button" disabled={busy} onClick={() => void check()}>Check payment</button>}
      {canStop && <button type="button" disabled={busy} onClick={() => void stopUnstarted()}>Stop unstarted checkout</button>}
    </div>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {canStop && <p>Payment processing has not started. Stop this request to keep your bag and begin a fresh checkout. The store checks again before stopping it.</p>}
    {attempt && <p className="commerce-payment-reference">{attempt.intent_id ? 'Payment reference' : 'Checkout reference'}: <code>{attempt.intent_id || attempt.cart_key}</code>. Share this reference with the store if you need help. Keep the same attempt.</p>}
    {captured && <p className="commerce-payment-receipt" role="status">Payment of {formatCommerceMoney(payment.receipt.amount_paise)} is captured. Your order needs the store’s attention. Keep receipt {payment.receipt.id}. Do not pay again. A refund has not been confirmed.</p>}
    {unresolved && <p role="status">This payment attempt needs confirmation. Keep this checkout and contact the store if Check payment remains pending. Do not start another payment.</p>}
    {payment?.state === 'ready' && <p role="status">Your saved checkout is ready. Check payment if you have already attempted to pay.</p>}
    <p className="commerce-payment-note">Final prices and availability are checked by the store. Payment confirmation can take a moment.</p>
  </section>
}

export function CommercePaymentCheckout(props) {
  // A different account/store must never reuse the previous pointer or let a
  // delayed response reach the next account, even outside the main storefront.
  return <PaymentCheckout key={`${props.websiteId}:${props.userId || 'signed-out'}`} {...props} />
}
export default CommercePaymentCheckout
