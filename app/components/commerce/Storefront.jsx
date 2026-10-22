'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { commerceFetch, getCommerceClient } from '@/lib/commerce/client'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0) / 100)
const color = (value, fallback) => {
  const input = String(value || '')
  if (/^#[\da-f]{6}$/i.test(input)) return input
  if (/^#[\da-f]{3}$/i.test(input)) return `#${input.slice(1).split('').map(part => part + part).join('')}`
  return fallback
}

export function storeStyle(branding = {}) {
  const primary = color(branding.primary_color, '#254d40')
  const rgb = [1, 3, 5].map(index => parseInt(primary.slice(index, index + 2), 16))
  const bright = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 150
  return {
    '--cs-accent': primary,
    '--cs-accent-ink': bright ? '#14201a' : '#ffffff',
    '--cs-bg': color(branding.background_color, '#f8f7f2'),
    '--cs-text': color(branding.text_color, '#202e28'),
    '--card': '#ffffff',
    '--text': color(branding.text_color, '#202e28'),
    '--sub': '#63736b',
    '--border': '#dfe5df',
  }
}

export function StoreBrand({ website }) {
  const branding = website.branding || {}
  return <Link className="cs-brand" href={`/shops/${encodeURIComponent(website.slug)}`}>
    {branding.logo_url ? <img src={branding.logo_url} alt="" width="42" height="42" /> : <span className="cs-brand-mark" aria-hidden="true">{website.name.slice(0, 1).toUpperCase()}</span>}
    <span>{website.name}</span>
  </Link>
}

function BagIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7h14l1 14H4L5 7Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></svg>
}

function ProductImage({ product, large = false }) {
  return product.image_url ? <img src={product.image_url} alt={product.name} loading={large ? 'eager' : 'lazy'} /> : <span className="cs-product-placeholder" aria-label="Product image not supplied"><BagIcon size={large ? 70 : 42} /></span>
}

function Modal({ open, titleId, onClose, children, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return <dialog ref={ref} className={`cs-dialog ${className}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    {children}
  </dialog>
}

export default function Storefront({ initialCatalog }) {
  const { website, categories = [], products = [] } = initialCatalog
  const branding = website.branding || {}
  const fulfillment = website.fulfillment || {}
  const pickup = fulfillment.pickup !== false
  const delivery = fulfillment.delivery === true
  const trackInventory = website.features?.inventory !== false
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('name')
  const [cart, setCart] = useState({})
  const [cartReady, setCartReady] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' })
  const [method, setMethod] = useState(pickup ? 'pickup' : 'delivery')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const clientRef = useRef(null)
  const attemptRef = useRef(null)
  const accountIdRef = useRef(null)
  const accountVersionRef = useRef(0)
  const cartKey = `dd-commerce-cart:${website.id}`
  const accountPath = `/shops/${encodeURIComponent(website.slug)}/account`

  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => {
      let saved = {}
      try { saved = JSON.parse(localStorage.getItem(cartKey) || '{}') } catch {}
      const normalized = {}
      for (const product of products) {
        const quantity = Number(saved?.[product.id])
        if (Number.isInteger(quantity) && quantity > 0 && (!trackInventory || product.stock_quantity > 0)) normalized[product.id] = Math.min(quantity, trackInventory ? product.stock_quantity : 999, 999)
      }
      if (alive) { setCart(normalized); setCartReady(true) }
    })
    return () => { alive = false }
  }, [cartKey, products, trackInventory])

  useEffect(() => {
    if (!cartReady) return
    try { localStorage.setItem(cartKey, JSON.stringify(cart)) } catch {}
  }, [cart, cartKey, cartReady])

  useEffect(() => {
    let alive = true
    let authVersion = 0
    const client = getCommerceClient(`customer:${website.slug}`)
    clientRef.current = client
    function acceptSession(nextSession) {
      if (!alive) return
      const nextId = nextSession?.user?.id || null
      if (accountIdRef.current !== nextId) {
        accountIdRef.current = nextId
        accountVersionRef.current += 1
        attemptRef.current = null
        setConfirmation(null)
        setCustomer({ name: '', phone: '', address: '' })
        setError('')
      }
      setSession(nextSession)
      setAuthReady(true)
    }
    client.auth.getSession().then(({ data }) => { if (!authVersion) acceptSession(data.session) }).catch(() => { if (alive) setAuthReady(true) })
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      authVersion += 1
      acceptSession(nextSession)
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [website.slug])

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return products.filter(product => (category === 'all' || product.category_id === category) && (!query || `${product.name} ${product.description || ''}`.toLocaleLowerCase().includes(query))).sort((first, second) => sort === 'price-low' ? first.price_paise - second.price_paise : sort === 'price-high' ? second.price_paise - first.price_paise : first.name.localeCompare(second.name))
  }, [products, category, search, sort])
  const lines = products.filter(product => cart[product.id]).map(product => ({ product, quantity: cart[product.id] }))
  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.product.price_paise, 0)
  const fee = method === 'delivery' ? Number(fulfillment.delivery_fee_paise || 0) : 0
  const minimum = Number(fulfillment.minimum_order_paise || 0)
  const verified = Boolean(session?.user?.email_confirmed_at)
  const canOrder = website.features?.cod !== false && (pickup || delivery)

  function quantity(product, next) {
    if (busy) return
    setError('')
    setConfirmation(null)
    setCart(current => {
      const changed = { ...current }
      const available = trackInventory ? Number(product.stock_quantity) || 0 : 999
      const amount = Math.max(0, Math.min(Math.floor(Number(next)) || 0, available, 999))
      if (amount) changed[product.id] = amount
      else delete changed[product.id]
      return changed
    })
  }

  async function checkout(event) {
    event.preventDefault()
    if (busy || !lines.length) return
    setError('')
    if (!verified || !clientRef.current) { setError('Sign in with a verified account before placing your order.'); return }
    if (!canOrder || subtotal < minimum) { setError(subtotal < minimum ? `The minimum order is ${money(minimum)}.` : 'Checkout is not available for this store.'); return }
    const body = {
      items: lines.map(({ product, quantity: amount }) => ({ product_id: product.id, quantity: amount })).sort((first, second) => first.product_id.localeCompare(second.product_id)),
      customer: { name: customer.name.trim(), phone: customer.phone.trim(), address: method === 'delivery' ? customer.address.trim() : '' },
      fulfillment_method: method,
      payment_method: 'cod',
    }
    const buyerId = session.user.id
    const buyerVersion = accountVersionRef.current
    const sameBuyer = () => accountIdRef.current === buyerId && accountVersionRef.current === buyerVersion
    const attemptKey = `dd-commerce-checkout:${website.id}:${session.user.id}`
    let attempt = attemptRef.current
    if (!attempt) {
      try { attempt = JSON.parse(sessionStorage.getItem(attemptKey) || 'null') } catch {}
    }
    if (!attempt || typeof attempt !== 'object' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attempt.key || '')) attempt = null
    // Retain the key when details change: the server can safely accept changes only
    // if no order exists yet, or reject a changed replay without creating a duplicate.
    attempt = { key: attempt?.key || crypto.randomUUID() }
    attemptRef.current = attempt
    try { sessionStorage.setItem(attemptKey, JSON.stringify(attempt)) } catch {}
    setBusy(true)
    try {
      const result = await commerceFetch(`/api/commerce/checkout/${website.id}`, { client: clientRef.current, method: 'POST', body: { ...body, idempotency_key: attempt.key } })
      if (!sameBuyer()) return
      if (!result.order?.id) throw new Error('The order confirmation was incomplete. Retry with the same details or check your order history.')
      setConfirmation(result.order)
      setCart({})
      attemptRef.current = null
      try { sessionStorage.removeItem(attemptKey) } catch {}
    } catch (requestError) {
      if (!sameBuyer()) return
      if (requestError.status === 409) {
        // A changed replay may refer to an already-created order. Reconcile with
        // this customer's own history before releasing the pending checkout key.
        try {
          const history = await commerceFetch(`/api/commerce/customer/orders?website_id=${website.id}`, { client: clientRef.current })
          if (!sameBuyer()) return
          const existing = history.orders?.find(order => order.idempotency_key === attempt.key)
          if (existing) {
            setConfirmation(existing)
            setCart({})
            attemptRef.current = null
            try { sessionStorage.removeItem(attemptKey) } catch {}
            return
          }
        } catch { /* Keep the pending key until an order can be confirmed. */ }
      }
      if (!sameBuyer()) return
      setError(requestError.message || 'We could not confirm your order. Retry with the same details or check your order history.')
    } finally { setBusy(false) }
  }

  return (
    <main className="commerce-store" style={storeStyle(branding)}>
      <div className="cs-topline">{pickup && delivery ? 'Local delivery & store pickup' : delivery ? 'Local delivery available' : pickup ? 'Collect from our store' : 'Explore our collection'}</div>
      <header className="cs-header cs-container">
        <StoreBrand website={website} />
        <nav aria-label="Store navigation"><a href="#collection">Collection</a><a href="#store-contact">Contact</a><Link href={accountPath}>My account</Link></nav>
        <button className="cs-bag" type="button" onClick={() => { setCartOpen(true); setError('') }} aria-label={`Open shopping bag, ${count} items`} disabled={!cartReady}><BagIcon /><span>Bag</span><strong>{count}</strong></button>
      </header>

      <section className={`cs-hero cs-container ${branding.banner_url ? 'cs-hero-with-image' : ''}`} aria-labelledby="store-title">
        <div className="cs-hero-copy">
          <p className="cs-eyebrow">The {website.name} collection</p>
          <h1 id="store-title">{branding.headline || 'Find something you’ll love.'}</h1>
          <p className="cs-hero-description">{branding.description || `Discover products selected by ${website.name}. Browse the collection and shop directly with our store.`}</p>
          <a className="cs-primary" href="#collection">Explore the collection <span aria-hidden="true">↗</span></a>
          <div className="cs-hero-notes">{pickup && <span>Store pickup</span>}{delivery && <span>Local delivery</span>}{website.features?.cod !== false && <span>{pickup && !delivery ? 'Pay at pickup' : 'Cash on delivery'}</span>}</div>
        </div>
        <div className="cs-hero-art" aria-hidden="true">{branding.banner_url ? <img src={branding.banner_url} alt="" /> : <><span className="cs-hero-orbit" /><span className="cs-hero-initial">{website.name.slice(0, 1).toUpperCase()}</span><span className="cs-hero-tag">Made for your everyday.</span></>}</div>
      </section>

      <section id="collection" className="cs-collection cs-container" aria-labelledby="collection-title">
        <div className="cs-section-heading"><div><p className="cs-eyebrow">Discover your next favourite</p><h2 id="collection-title">The collection</h2></div><p>{products.length} {products.length === 1 ? 'product' : 'products'}</p></div>
        <div className="cs-collection-toolbar"><label className="cs-search"><span className="cs-sr-only">Search products</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" placeholder="Search the collection" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="cs-sort"><span>Sort by</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label></div>
        <div className="cs-category-tabs" role="group" aria-label="Filter products by category"><button className={category === 'all' ? 'is-active' : ''} type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All products</button>{categories.map(item => <button type="button" key={item.id} className={category === item.id ? 'is-active' : ''} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.name}</button>)}</div>
        {visible.length ? <div className="cs-product-grid">{visible.map(product => <article className="cs-product" key={product.id}>
          <button className="cs-product-photo" type="button" onClick={() => setSelected(product)} aria-label={`View ${product.name}`}><ProductImage product={product} />{trackInventory && product.stock_quantity <= 0 && <span className="cs-stock-badge">Sold out</span>}</button>
          <div className="cs-product-meta"><p>{categories.find(item => item.id === product.category_id)?.name || 'Collection'}</p><button type="button" className="cs-product-name" onClick={() => setSelected(product)}>{product.name}</button><div className="cs-product-bottom"><strong>{money(product.price_paise)}</strong><button type="button" className="cs-add" disabled={(trackInventory ? Math.min(product.stock_quantity, 999) : 999) <= (cart[product.id] || 0) || busy || !cartReady} aria-label={`Add ${product.name} to bag`} onClick={() => quantity(product, (cart[product.id] || 0) + 1)}>{cart[product.id] ? `In bag: ${cart[product.id]} +` : '+'}</button></div></div>
        </article>)}</div> : <div className="cs-empty"><BagIcon size={36} /><h3>{products.length ? 'No products match your search.' : 'The collection is coming soon.'}</h3><p>{products.length ? 'Try a different search or category.' : 'Please check back with the store for new arrivals.'}</p>{products.length > 0 && <button className="cs-secondary" type="button" onClick={() => { setSearch(''); setCategory('all') }}>Clear filters</button>}</div>}
      </section>

      <footer className="cs-footer" id="store-contact"><div className="cs-container cs-footer-inner"><div><StoreBrand website={website} /><p>{branding.description || `Shop directly with ${website.name}.`}</p></div><div><h2>Get in touch</h2>{branding.contact_email && <a href={`mailto:${branding.contact_email}`}>{branding.contact_email}</a>}{branding.contact_phone && <a href={`tel:${branding.contact_phone}`}>{branding.contact_phone}</a>}{fulfillment.pickup_address && <p>{fulfillment.pickup_address}</p>}{!branding.contact_email && !branding.contact_phone && !fulfillment.pickup_address && <p>Contact details will be added by the store.</p>}</div><div><h2>Your account</h2><Link href={accountPath}>Sign in & order history</Link><a href="#collection">Browse all products</a></div></div><div className="cs-container cs-footer-bottom"><span>{website.name}</span><Link href="/commerce">Website powered by Digital Dine-In</Link></div></footer>

      <Modal open={Boolean(selected)} titleId="cs-product-title" onClose={() => setSelected(null)} className="cs-product-dialog">
        {selected && <><button className="cs-modal-close" type="button" onClick={() => setSelected(null)} aria-label="Close product details">×</button><div className="cs-detail-image"><ProductImage product={selected} large /></div><div className="cs-detail-copy"><p className="cs-eyebrow">{categories.find(item => item.id === selected.category_id)?.name || 'The collection'}</p><h2 id="cs-product-title">{selected.name}</h2><p className="cs-detail-price">{money(selected.price_paise)}</p><p className="cs-description">{selected.description || 'Contact the store if you would like more information about this product.'}</p>{Object.entries(selected.attributes || {}).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).length > 0 && <dl className="cs-attributes">{Object.entries(selected.attributes || {}).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{String(value)}</dd></div>)}</dl>}<p className="cs-availability">{!trackInventory || selected.stock_quantity > 0 ? 'Available to order' : 'Currently sold out'}</p><button className="cs-primary" type="button" disabled={(trackInventory ? Math.min(selected.stock_quantity, 999) : 999) <= (cart[selected.id] || 0) || busy || !cartReady} onClick={() => quantity(selected, (cart[selected.id] || 0) + 1)}>{cart[selected.id] ? `Add another · ${cart[selected.id]} in bag` : 'Add to bag'}</button></div></>}
      </Modal>

      <Modal open={cartOpen} titleId="cs-cart-title" onClose={() => { if (!busy) setCartOpen(false) }} className="cs-cart-dialog">
        <div className="cs-cart-heading"><div><p className="cs-eyebrow">Your selection</p><h2 id="cs-cart-title">Shopping bag <span>{count}</span></h2></div><button className="cs-modal-close" type="button" disabled={busy} onClick={() => setCartOpen(false)} aria-label="Close shopping bag">×</button></div>
        {confirmation ? <div className="cs-order-confirmed" role="status"><span aria-hidden="true">✓</span><h3>Your order is confirmed.</h3><p>Order reference <strong>{confirmation.id}</strong></p><p>Total: {money(confirmation.total_paise)}. {confirmation.fulfillment_method === 'pickup' ? 'Pay when you collect your order.' : 'Pay cash when your order arrives.'}</p><Link className="cs-primary" href={accountPath}>View order history</Link><button className="cs-secondary" type="button" onClick={() => window.location.reload()}>Continue shopping</button></div> : !lines.length ? <div className="cs-empty"><BagIcon size={40} /><h3>Your bag is waiting.</h3><p>Add something from the collection to get started.</p><button className="cs-primary" type="button" onClick={() => setCartOpen(false)}>Continue browsing</button></div> : <>
          <div className="cs-cart-lines">{lines.map(({ product, quantity: amount }) => <div className="cs-cart-line" key={product.id}><div className="cs-cart-image"><ProductImage product={product} /></div><div className="cs-cart-line-info"><h3>{product.name}</h3><p>{money(product.price_paise)} each</p><div className="cs-quantity"><button type="button" disabled={busy} onClick={() => quantity(product, amount - 1)} aria-label={`Remove one ${product.name}`}>−</button><span aria-label={`${amount} in bag`}>{amount}</span><button type="button" disabled={busy || amount >= (trackInventory ? Math.min(product.stock_quantity, 999) : 999)} onClick={() => quantity(product, amount + 1)} aria-label={`Add one ${product.name}`}>+</button></div></div><strong>{money(product.price_paise * amount)}</strong></div>)}</div>
          <form className="cs-checkout" onSubmit={checkout}>
            <div className="cs-totals"><p><span>Subtotal</span><strong>{money(subtotal)}</strong></p><p><span>{method === 'delivery' ? 'Delivery' : 'Store pickup'}</span><span>{fee ? money(fee) : 'No additional fee'}</span></p><p className="cs-total"><span>Estimated total</span><strong>{money(subtotal + fee)}</strong></p></div>
            <p className="cs-small">Final availability and totals are checked by the store before the order is confirmed.</p>
            {minimum > 0 && subtotal < minimum && <p className="cs-notice">Minimum order: {money(minimum)}.</p>}
            {!authReady ? <p className="cs-notice">Checking your account…</p> : !verified ? <div className="cs-notice"><p>{session ? 'Please verify your email before placing an order.' : 'Sign in or create an account to place your order securely.'}</p><Link href={accountPath} className="cs-text-link">{session ? 'Open account & verification' : 'Sign in / Create account'} →</Link></div> : <p className="cs-small">Signed in as {session.user.email}</p>}
            <fieldset disabled={busy || !verified || !canOrder}>
              <legend>Checkout details</legend>
              <div className="cs-field-grid"><label>Your name<input required minLength={2} maxLength={100} autoComplete="name" value={customer.name} onChange={event => setCustomer({ ...customer, name: event.target.value })} /></label><label>Phone number<input required type="tel" minLength={7} maxLength={20} autoComplete="tel" value={customer.phone} onChange={event => setCustomer({ ...customer, phone: event.target.value })} /></label></div>
              <label>How would you like your order?<select value={method} onChange={event => setMethod(event.target.value)}>{pickup && <option value="pickup">Store pickup</option>}{delivery && <option value="delivery">Local delivery</option>}</select></label>
              {method === 'delivery' && <label>Delivery address<textarea required minLength={8} maxLength={500} autoComplete="street-address" value={customer.address} onChange={event => setCustomer({ ...customer, address: event.target.value })} /></label>}
              {method === 'pickup' && fulfillment.pickup_address && <p className="cs-small">Pickup from: {fulfillment.pickup_address}</p>}
              <p className="cs-payment-note"><strong>{method === 'pickup' ? 'Pay at pickup' : 'Cash on delivery'}</strong><span>No online payment is collected at checkout.</span></p>
              <button className="cs-primary cs-full-width" type="submit" disabled={busy || !lines.length || subtotal < minimum}>{busy ? 'Confirming your order…' : 'Place order'}</button>
            </fieldset>
            {!canOrder && <p className="cs-notice">Checkout is not currently enabled for this store.</p>}
            {error && <p role="alert" className="cs-error">{error} <Link href={accountPath}>View your orders</Link></p>}
          </form>
        </>}
      </Modal>
    </main>
  )
}
