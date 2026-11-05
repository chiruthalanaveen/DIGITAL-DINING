'use client'

import './delivery-checkout-premium.css'

function formatMoney(value, currencySymbol = '₹') {
  const amount = Number(value || 0)
  return `${currencySymbol}${amount.toFixed(0)}`
}

function QuantityStepper({ value = 1, onDecrease, onIncrease, disabled = false }) {
  return (
    <div className="dd-checkout-stepper" role="group" aria-label="Change quantity">
      <button
        type="button"
        className="dd-checkout-stepper-btn"
        onClick={onDecrease}
        disabled={disabled}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="dd-checkout-stepper-value">{value}</span>
      <button
        type="button"
        className="dd-checkout-stepper-btn"
        onClick={onIncrease}
        disabled={disabled}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  )
}

function PaymentOption({ id, title, description, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`dd-checkout-payment ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(id)}
      aria-pressed={selected}
    >
      <div className="dd-checkout-payment-radio" aria-hidden="true">
        <span />
      </div>
      <div className="dd-checkout-payment-copy">
        <div className="dd-checkout-payment-title">{title}</div>
        <div className="dd-checkout-payment-desc">{description}</div>
      </div>
    </button>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="dd-checkout-empty">
      <div className="dd-checkout-empty-icon">🛒</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

export default function DeliveryCheckoutSheet({
  open = false,
  onClose,
  items = [],
  bill = {},
  selectedAddress = null,
  addresses = [],
  onSelectAddress,
  onChangeAddress,
  paymentMethod = 'cod',
  onPaymentMethodChange,
  notes = '',
  onNotesChange,
  onQuantityChange,
  onPlaceOrder,
  placingOrder = false,
  storeName = 'Your store',
  etaText = '30-40 min',
  currencySymbol = '₹',
  coverageNote = 'Delivery coverage is checked before ordering.',
  accountLabel = 'Saved to your account',
}) {
  if (!open) return null

  const hasItems = Array.isArray(items) && items.length > 0
  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const subtotal = Number(bill.subtotal || 0)
  const deliveryFee = Number(bill.deliveryFee || 0)
  const handlingCharge = Number(bill.handlingCharge || 0)
  const packingCharge = Number(bill.packingCharge || 0)
  const sgst = Number(bill.sgst || 0)
  const cgst = Number(bill.cgst || 0)
  const discount = Number(bill.discount || 0)
  const total = Number(
    bill.total || subtotal + deliveryFee + handlingCharge + packingCharge + sgst + cgst - discount
  )

  const selectedAddressId = selectedAddress?.id || ''

  return (
    <div className="dd-checkout-overlay" role="dialog" aria-modal="true" aria-label="Delivery checkout">
      <div className="dd-checkout-sheet">
        <div className="dd-checkout-header">
          <div>
            <div className="dd-checkout-eyebrow">Checkout</div>
            <h2 className="dd-checkout-title">Review and place order</h2>
            <div className="dd-checkout-subtitle">
              {storeName} • ETA {etaText}
            </div>
          </div>
          <button type="button" className="dd-checkout-close" onClick={onClose} aria-label="Close checkout">
            ×
          </button>
        </div>

        <div className="dd-checkout-body">
          {!hasItems ? (
            <EmptyState
              title="Your cart is empty"
              description="Add a few items to continue with checkout."
            />
          ) : (
            <>
              <section className="dd-checkout-section">
                <div className="dd-checkout-section-head">
                  <div>
                    <h3>Items in your order</h3>
                    <p>{itemCount} item{itemCount === 1 ? '' : 's'} ready for checkout</p>
                  </div>
                </div>
                <div className="dd-checkout-list">
                  {items.map((item) => (
                    <article className="dd-checkout-item" key={item.id || item.name}>
                      <div className="dd-checkout-item-main">
                        <div className="dd-checkout-item-topline">
                          <span className={`dd-checkout-food-dot ${item.isVeg ? 'is-veg' : 'is-nonveg'}`} />
                          <span className="dd-checkout-item-category">{item.category || 'Item'}</span>
                        </div>
                        <h4>{item.name}</h4>
                        {item.description ? <p>{item.description}</p> : null}
                        <div className="dd-checkout-item-meta">
                          <strong>{formatMoney(item.price, currencySymbol)}</strong>
                          {item.originalPrice && Number(item.originalPrice) > Number(item.price) ? (
                            <span>{formatMoney(item.originalPrice, currencySymbol)}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="dd-checkout-item-actions">
                        {typeof onQuantityChange === 'function' ? (
                          <QuantityStepper
                            value={item.quantity || 1}
                            onDecrease={() => onQuantityChange(item, -1)}
                            onIncrease={() => onQuantityChange(item, 1)}
                            disabled={placingOrder}
                          />
                        ) : (
                          <div className="dd-checkout-qty-readonly">Qty {item.quantity || 1}</div>
                        )}
                        <div className="dd-checkout-item-total">
                          {formatMoney((item.price || 0) * (item.quantity || 0), currencySymbol)}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="dd-checkout-grid">
                <div className="dd-checkout-col">
                  <section className="dd-checkout-section">
                    <div className="dd-checkout-section-head compact">
                      <div>
                        <h3>Delivery address</h3>
                        <p>{accountLabel}</p>
                      </div>
                      {typeof onChangeAddress === 'function' ? (
                        <button type="button" className="dd-checkout-link-btn" onClick={onChangeAddress}>
                          Change
                        </button>
                      ) : null}
                    </div>

                    {selectedAddress ? (
                      <div className="dd-checkout-address-card">
                        <div className="dd-checkout-address-icon">📍</div>
                        <div className="dd-checkout-address-copy">
                          <div className="dd-checkout-address-badge">Deliver to</div>
                          <h4>{selectedAddress.label || selectedAddress.type || 'Saved address'}</h4>
                          <p>
                            {selectedAddress.addressLine || selectedAddress.address || ''}
                            {selectedAddress.landmark ? `, ${selectedAddress.landmark}` : ''}
                            {selectedAddress.city ? `, ${selectedAddress.city}` : ''}
                            {selectedAddress.state ? `, ${selectedAddress.state}` : ''}
                            {selectedAddress.pincode ? `, ${selectedAddress.pincode}` : ''}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="dd-checkout-address-empty">
                        No address selected. Choose a delivery address to continue.
                      </div>
                    )}

                    {Array.isArray(addresses) && addresses.length > 1 && typeof onSelectAddress === 'function' ? (
                      <div className="dd-checkout-address-picker">
                        {addresses.map((address) => (
                          <label
                            className={`dd-checkout-address-option ${selectedAddressId === address.id ? 'is-selected' : ''}`}
                            key={address.id || `${address.label}-${address.addressLine}`}
                          >
                            <input
                              type="radio"
                              name="selectedDeliveryAddress"
                              value={address.id || ''}
                              checked={selectedAddressId === address.id}
                              onChange={() => onSelectAddress(address)}
                            />
                            <div>
                              <strong>{address.label || address.type || 'Saved address'}</strong>
                              <span>
                                {address.addressLine || address.address || ''}
                                {address.landmark ? `, ${address.landmark}` : ''}
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                    ) : null}

                    <div className="dd-checkout-note muted">{coverageNote}</div>
                  </section>

                  <section className="dd-checkout-section">
                    <div className="dd-checkout-section-head compact">
                      <div>
                        <h3>Payment method</h3>
                        <p>Choose how you want to pay</p>
                      </div>
                    </div>

                    <div className="dd-checkout-payment-list">
                      <PaymentOption
                        id="cod"
                        title="Cash on Delivery"
                        description="Pay when your order arrives."
                        selected={paymentMethod === 'cod'}
                        onSelect={onPaymentMethodChange}
                      />
                      <PaymentOption
                        id="online"
                        title="Pay Online"
                        description="Use Razorpay or your preferred UPI / card."
                        selected={paymentMethod === 'online'}
                        onSelect={onPaymentMethodChange}
                      />
                    </div>
                  </section>
                </div>

                <div className="dd-checkout-col">
                  <section className="dd-checkout-section">
                    <div className="dd-checkout-section-head compact">
                      <div>
                        <h3>Bill details</h3>
                        <p>Taxes and fees are calculated securely</p>
                      </div>
                    </div>

                    <div className="dd-checkout-bill">
                      <div className="dd-checkout-bill-row"><span>Item subtotal</span><strong>{formatMoney(subtotal, currencySymbol)}</strong></div>
                      <div className="dd-checkout-bill-row"><span>Delivery fee</span><strong>{deliveryFee <= 0 ? 'FREE' : formatMoney(deliveryFee, currencySymbol)}</strong></div>
                      <div className="dd-checkout-bill-row"><span>Handling charge</span><strong>{formatMoney(handlingCharge, currencySymbol)}</strong></div>
                      <div className="dd-checkout-bill-row"><span>Packing charge</span><strong>{formatMoney(packingCharge, currencySymbol)}</strong></div>
                      <div className="dd-checkout-bill-row"><span>SGST</span><strong>{formatMoney(sgst, currencySymbol)}</strong></div>
                      <div className="dd-checkout-bill-row"><span>CGST</span><strong>{formatMoney(cgst, currencySymbol)}</strong></div>
                      {discount > 0 ? (
                        <div className="dd-checkout-bill-row is-discount"><span>Discount</span><strong>-{formatMoney(discount, currencySymbol)}</strong></div>
                      ) : null}
                      <div className="dd-checkout-divider" />
                      <div className="dd-checkout-bill-row is-total"><span>Estimated total</span><strong>{formatMoney(total, currencySymbol)}</strong></div>
                    </div>
                  </section>

                  <section className="dd-checkout-section">
                    <div className="dd-checkout-section-head compact">
                      <div>
                        <h3>Delivery instructions</h3>
                        <p>Optional note for the store or delivery partner</p>
                      </div>
                    </div>
                    <textarea
                      className="dd-checkout-notes"
                      placeholder="Example: Call when you arrive, leave near gate, less spicy..."
                      value={notes || ''}
                      onChange={(event) => onNotesChange?.(event.target.value)}
                      rows={4}
                    />
                  </section>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="dd-checkout-footer">
          <div>
            <div className="dd-checkout-footer-label">To pay</div>
            <div className="dd-checkout-footer-price">{formatMoney(total, currencySymbol)}</div>
          </div>
          <button
            type="button"
            className="dd-checkout-place-btn"
            onClick={onPlaceOrder}
            disabled={!hasItems || !selectedAddress || placingOrder}
          >
            {placingOrder ? 'Placing order…' : paymentMethod === 'online' ? 'Proceed to pay' : 'Place order'}
          </button>
        </div>
      </div>
    </div>
  )
}