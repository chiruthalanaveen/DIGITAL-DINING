'use client'

import Link from 'next/link'
import { useId, useRef, useState } from 'react'
import { variantLabel } from '@/lib/commerce/catalog-options'

const money = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(Number(value || 0) / 100)

function EmptyBagIcon() {
  return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7h14l1 14H4L5 7Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></svg>
}

/** Presentation only. Cart, authentication, totals and checkout remain parent-owned. */
export default function StorefrontBag({
  website, accountPath, lines, count, subtotal, fee, minimum,
  method, setMethod, customer, onCustomerChange, addresses = [], onAddressChange, zonesEnabled, session, authReady,
  couponInput, onCouponInput, couponCode, onApplyCoupon, onRemoveCoupon, quote, quoteRequired, quoteError, quoteBlocked,
  verified, canOrder, canCOD = canOrder, busy, locked = false, onlinePayment, paymentNotice = '', error, confirmation,
  onQuantity, onClose, onCheckout, renderProductImage,
}) {
  const id = useId()
  const bagRef = useRef(null)
  const detailsRef = useRef(null)
  const reviewRef = useRef(null)
  const [currentStep, setCurrentStep] = useState(0)
  const fulfillment = website.fulfillment || {}
  const pickup = fulfillment.pickup !== false
  const delivery = fulfillment.delivery === true
  const disabled = busy || locked || !verified || !canOrder
  const reviewedSubtotal = quote?.subtotal_paise ?? subtotal
  const reviewedMinimum = quote?.minimum_order_paise ?? minimum
  const steps = [
    { label: 'Your bag', id: `${id}-bag` },
    { label: 'Fulfilment', id: `${id}-details` },
    { label: 'Review', id: `${id}-review` },
  ]

  function goToStep(index) {
    const target = [bagRef, detailsRef, reviewRef][index]?.current
    if (busy || !target) return
    setCurrentStep(index)
    target.focus({ preventScroll: true })
    target.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }

  return <>
    <div className="cs-cart-heading">
      <div><p className="cs-eyebrow">Your selection</p><h2 id="cs-cart-title">Shopping bag <span>{count}</span></h2></div>
      <button className="cs-modal-close" type="button" disabled={busy} onClick={onClose} aria-label="Close shopping bag">×</button>
    </div>

    {paymentNotice && <p className="cs-notice" role="status">{paymentNotice}</p>}

    {confirmation ? <div className="cs-order-confirmed" role="status">
      <span aria-hidden="true">✓</span>
      <h3>Your order is confirmed.</h3>
      <p>Order reference <strong>{confirmation.id}</strong></p>
      <p>Total: {money(confirmation.total_paise)}. {confirmation.payment_method === 'razorpay' && confirmation.payment_status === 'paid' ? 'Online payment confirmed.' : confirmation.fulfillment_method === 'pickup' ? 'Pay when you collect your order.' : 'Pay cash when your order arrives.'}</p>
      <Link className="cs-primary" href={accountPath}>View order history</Link>
      <button className="cs-secondary" type="button" disabled={busy} onClick={() => window.location.reload()}>Continue shopping</button>
    </div> : !lines.length ? <div className="cs-empty">
      <EmptyBagIcon />
      <h3>Your bag is waiting.</h3>
      <p>Add something from the collection to get started.</p>
      <button className="cs-primary" type="button" disabled={busy} onClick={onClose}>Continue browsing</button>
    </div> : <>
      <nav className="cs-step-nav" aria-label="Checkout steps">
        <ol>{steps.map((step, index) => <li key={step.id}>
          <button type="button" aria-current={currentStep === index ? 'step' : undefined} aria-controls={step.id} disabled={busy} onClick={() => goToStep(index)}>
            <span aria-hidden="true">0{index + 1}</span><span>{step.label}</span>
          </button>
        </li>)}</ol>
      </nav>

      <form className="cs-checkout" onSubmit={onCheckout}>
        <section className="cs-checkout-step cs-bag-step" id={steps[0].id} ref={bagRef} tabIndex={-1} aria-labelledby={`${id}-bag-heading`} onFocusCapture={() => setCurrentStep(0)}>
          <div className="cs-checkout-step-heading"><span aria-hidden="true">01</span><h3 id={`${id}-bag-heading`}>The pieces you chose</h3></div>
          <div className="cs-cart-lines">{lines.map(({ key, product, variant, quantity: amount, unitPrice, stock }) => <div className="cs-cart-line" key={key}>
            <div className="cs-cart-image">{renderProductImage(product)}</div>
            <div className="cs-cart-line-info">
              <h3>{product.name}</h3>{variant && <p className="cs-cart-variant">{variantLabel(variant)}{variant.sku ? ` · SKU ${variant.sku}` : ''}</p>}<p>{money(unitPrice)} each</p>
              <div className="cs-quantity">
                <button type="button" disabled={busy || locked} onClick={() => onQuantity(product, amount - 1, variant)} aria-label={`Remove one ${product.name}`}>−</button>
                <span aria-label={`${amount} in bag`}>{amount}</span>
                <button type="button" disabled={busy || locked || amount >= stock} onClick={() => onQuantity(product, amount + 1, variant)} aria-label={`Add one ${product.name}`}>+</button>
              </div>
              <button className="cs-remove-item" type="button" disabled={busy || locked} aria-label={`Remove ${product.name} from bag`} onClick={() => onQuantity(product, 0, variant)}>Remove</button>
            </div>
            <strong>{money(unitPrice * amount)}</strong>
          </div>)}</div>
          <div className="cs-step-actions"><button className="cs-secondary" type="button" disabled={busy} onClick={() => goToStep(1)}>Continue to checkout <span aria-hidden="true">→</span></button></div>
        </section>

        <section className="cs-checkout-step" id={steps[1].id} ref={detailsRef} tabIndex={-1} aria-labelledby={`${id}-details-heading`} onFocusCapture={() => setCurrentStep(1)}>
          <div className="cs-checkout-step-heading"><span aria-hidden="true">02</span><h3 id={`${id}-details-heading`}>Make it yours</h3></div>
          {!authReady ? <p className="cs-notice">Checking your account…</p> : !verified ? <div className="cs-notice">
            <p>{session ? 'Please verify your email before placing an order.' : 'Sign in or create an account to place your order securely.'}</p>
            <Link href={accountPath} className="cs-text-link">{session ? 'Open account & verification' : 'Sign in / Create account'} →</Link>
          </div> : <p className="cs-small">Signed in as {session.user.email}</p>}
          <fieldset disabled={disabled}>
            <legend>Checkout details</legend>
            {addresses.length > 0 && <label>Saved address<select name="savedAddress" value={customer.saved_address_id || ''} onChange={event => onAddressChange(event.target.value)}><option value="">Enter details manually</option>{addresses.map(address => <option key={address.id} value={address.id}>{address.label || address.address}{address.is_default ? ' (default)' : ''}</option>)}</select></label>}
            <div className="cs-field-grid">
              <label>Your name<input name="customerName" required minLength={2} maxLength={100} autoComplete="name" value={customer.name} onChange={event => onCustomerChange('name', event.target.value)} /></label>
              <label>Phone number<input name="customerPhone" required type="tel" inputMode="tel" minLength={7} maxLength={20} autoComplete="tel" value={customer.phone} onChange={event => onCustomerChange('phone', event.target.value)} /></label>
            </div>
            <label>How would you like your order?<select name="fulfillmentMethod" value={method} onChange={event => setMethod(event.target.value)}>
              {pickup && <option value="pickup">Store pickup</option>}{delivery && <option value="delivery">Local delivery</option>}
            </select></label>
            {method === 'delivery' && <label>Delivery address<textarea name="deliveryAddress" required minLength={8} maxLength={500} autoComplete="street-address" value={customer.address} onChange={event => onCustomerChange('address', event.target.value)} /></label>}
            {method === 'delivery' && <label>Delivery PIN code{!zonesEnabled && ' (optional)'}<input name="deliveryPincode" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" maxLength={6} required={zonesEnabled} value={customer.pincode || ''} onChange={event => onCustomerChange('pincode', event.target.value)} /></label>}
            {method === 'delivery' && zonesEnabled && <p className="cs-small">Enter your PIN code to check the store’s delivery coverage and fee.</p>}
            {method === 'pickup' && fulfillment.pickup_address && <p className="cs-small">Pickup from: {fulfillment.pickup_address}</p>}
          </fieldset>
          <div className="cs-step-actions"><button className="cs-secondary" type="button" disabled={busy} onClick={() => goToStep(2)}>Review order <span aria-hidden="true">→</span></button></div>
        </section>

        <section className="cs-checkout-step cs-review" id={steps[2].id} ref={reviewRef} tabIndex={-1} aria-labelledby={`${id}-review-heading`} onFocusCapture={() => setCurrentStep(2)}>
          <div className="cs-checkout-step-heading"><span aria-hidden="true">03</span><h3 id={`${id}-review-heading`}>One last look</h3></div>
          {quoteRequired && <fieldset className="cs-coupon-field" disabled={disabled}><legend>Coupon code</legend><div><input aria-label="Coupon code" name="couponCode" maxLength={32} autoComplete="off" value={couponInput} onChange={event => onCouponInput(event.target.value)} /><button className="cs-secondary" type="button" onClick={onApplyCoupon} disabled={busy || !couponInput?.trim()}>Apply</button>{couponCode && <button className="cs-secondary" type="button" onClick={onRemoveCoupon}>Remove coupon</button>}</div>{couponCode && <p className="cs-small">Checking code: {couponCode}</p>}</fieldset>}
          <div className="cs-totals" aria-live="polite" aria-atomic="true">
            <p><span>Subtotal</span><strong>{money(quote?.subtotal_paise ?? subtotal)}</strong></p>
            <p><span>{method === 'delivery' ? 'Delivery' : 'Store pickup'}</span><span>{(quote?.delivery_fee_paise ?? fee) ? money(quote?.delivery_fee_paise ?? fee) : quoteRequired && !quote ? 'To be checked' : 'No additional fee'}</span></p>
            {quote?.discount_paise > 0 && <p><span>Coupon discount</span><strong>−{money(quote.discount_paise)}</strong></p>}
            <p className="cs-total"><span>{quote ? 'Verified total' : 'Estimated total'}</span><strong>{money(quote?.total_paise ?? subtotal + fee)}</strong></p>
          </div>
          <p className="cs-small">Availability and totals are verified when you place your order.</p>
          {quoteRequired && !quote && !quoteError && <p className="cs-notice" role="status">Complete your checkout details to check coverage, discounts and your order total.</p>}
          {quoteError && <p className="cs-error" role="alert">{quoteError}</p>}
          {quote?.delivery_zone?.name && <p className="cs-small">Delivery zone: {quote.delivery_zone.name}</p>}
          {reviewedMinimum > 0 && reviewedSubtotal < reviewedMinimum && <p className="cs-notice">Minimum order: {money(reviewedMinimum)}.</p>}
          <fieldset className="cs-order-action" disabled={disabled || !canCOD}>
            <legend className="cs-sr-only">Confirm your order</legend>
            <p className="cs-payment-note"><strong>{canCOD ? method === 'pickup' ? 'Pay at pickup' : 'Cash on delivery' : 'Cash payment unavailable'}</strong><span>{canCOD ? 'No online payment is collected when you place this cash order.' : 'Use the store’s available online checkout below.'}</span></p>
            <button className="cs-primary cs-full-width" type="submit" disabled={busy || !lines.length || reviewedSubtotal < reviewedMinimum || quoteBlocked}>{busy ? 'Confirming your order…' : 'Place order'}</button>
          </fieldset>
          {!canOrder && <p className="cs-notice">Checkout is not currently enabled for this store.</p>}
          {error && <p role="alert" className="cs-error">{error} <Link href={accountPath}>View your orders</Link></p>}
        </section>
      </form>
    </>}
    {locked && <p className="cs-notice" role="status">An online payment attempt is saved. Check its payment status before changing this bag or using cash on delivery.</p>}
    {onlinePayment}
  </>
}
