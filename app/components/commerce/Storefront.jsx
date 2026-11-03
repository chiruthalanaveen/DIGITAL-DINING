'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commerceFetch, getCommerceClient } from '@/lib/commerce/client'
import { editorialTheme, filterCatalogProducts } from '@/lib/commerce/storefront'
import ProductGallery from './ProductGallery'
import StorefrontBag from './StorefrontBag'
import StorefrontSections, { StorefrontFAQ, StorefrontPolicies, TEMPLATE_COPY } from './StorefrontSections'
import CustomerProductActions from './CustomerProductActions'
import CommercePaymentCheckout from './CommercePaymentCheckout'
import { addressAutofill, cartLineKey, cartLines, lineStock, normalizeCart, productImages, productPrice, productStock, productVariants, storefrontTemplate, variantLabel } from '@/lib/commerce/catalog-options'

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
  const [failedLogo, setFailedLogo] = useState(null)
  return <Link className="cs-brand" href={`/shops/${encodeURIComponent(website.slug)}`}>
    {branding.logo_url && failedLogo !== branding.logo_url ? <Image src={branding.logo_url} alt="" width={42} height={42} unoptimized decoding="async" onError={() => setFailedLogo(branding.logo_url)} /> : <span className="cs-brand-mark" aria-hidden="true">{website.name.slice(0, 1).toUpperCase()}</span>}
    <span>{website.name}</span>
  </Link>
}

function BagIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7h14l1 14H4L5 7Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></svg>
}

function ProductImage({ product, large = false }) {
  const [failedUrl, setFailedUrl] = useState(null)
  const source = productImages(product)[0]?.url
  return source && failedUrl !== source ? <Image src={source} alt={product.name} width={640} height={800} unoptimized loading={large ? 'eager' : 'lazy'} decoding="async" onError={() => setFailedUrl(source)} /> : <span className="cs-product-placeholder" role="img" aria-label={`Image unavailable for ${product.name}`}><BagIcon size={large ? 70 : 42} /></span>
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
  const storefrontStyle = useMemo(() => {
    const palette = website.branding || {}
    return { ...storeStyle(palette), ...editorialTheme(palette) }
  }, [website.branding])
  const pickup = fulfillment.pickup !== false
  const delivery = fulfillment.delivery === true
  const trackInventory = website.features?.inventory !== false
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('name')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [availability, setAvailability] = useState('all')
  const searchRef = useRef(null)
  const [cart, setCart] = useState({})
  const [cartReady, setCartReady] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '', pincode: '', saved_address_id: '' })
  const [addresses, setAddresses] = useState([])
  const [couponInput, setCouponInput] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [quoteState, setQuoteState] = useState(null)
  const touchedRef = useRef({})
  const [method, setMethod] = useState(pickup ? 'pickup' : 'delivery')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [checkoutPending, setCheckoutPending] = useState(false)
  const [onlinePending, setOnlinePending] = useState(false)
  const [paymentKey, setPaymentKey] = useState(null)
  const clientRef = useRef(null)
  const attemptRef = useRef(null)
  const restoredAttemptRef = useRef(null)
  const accountIdRef = useRef(null)
  const accountVersionRef = useRef(0)
  const cartKey = `dd-commerce-cart:${website.id}`
  const accountPath = `/shops/${encodeURIComponent(website.slug)}/account`
  const template = storefrontTemplate(website)
  const templateCopy = TEMPLATE_COPY[template]
  const zonesEnabled = website.settings?.delivery_zones_enabled === true
  const [client, setClient] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => {
      let saved = {}
      try { saved = JSON.parse(localStorage.getItem(cartKey) || '{}') } catch {}
      const normalized = normalizeCart(saved, products, { trackInventory })
      if (alive) {
        setCart(normalized); setCartReady(true)
        const productId = new URLSearchParams(window.location.search).get('product')
        const linkedProduct = products.find(product => product.id === productId)
        if (linkedProduct) { setSelected(linkedProduct); setSelectedVariantId('') }
      }
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
        let pending = null
        try { pending = nextId ? JSON.parse(sessionStorage.getItem(`dd-commerce-checkout:${website.id}:${nextId}`) || 'null') : null } catch {}
        const pendingKey = typeof pending?.key === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pending.key) ? pending.key : null
        restoredAttemptRef.current = pendingKey
        setCheckoutPending(Boolean(pendingKey))
        let online = null
        try { online = nextId ? JSON.parse(localStorage.getItem(`commerce-payment-attempt:${website.id}:${nextId}`) || 'null') : null } catch {}
        const onlineKey = typeof online?.cart_key === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(online.cart_key) ? online.cart_key : null
        setOnlinePending(Boolean(onlineKey))
        setPaymentKey(nextId ? onlineKey || pendingKey || crypto.randomUUID() : null)
        touchedRef.current = {}
        setCustomer({ name: '', phone: '', address: '', pincode: '', saved_address_id: '' })
        setAddresses([])
        setQuoteState(null)
        setCouponCode('')
        setCouponInput('')
        setError('')
      }
      setClient(client)
      setSession(nextSession)
      setAuthReady(true)
    }
    client.auth.getSession().then(({ data }) => { if (!authVersion) acceptSession(data.session) }).catch(() => { if (alive) setAuthReady(true) })
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      authVersion += 1
      acceptSession(nextSession)
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [website.slug, website.id])

  const effectiveAvailability = !trackInventory && availability === 'sold-out' ? 'all' : availability
  const inventoryProducts = useMemo(() => products.map(product => ({ ...product, stock_quantity: productStock(product, { trackInventory }), price_paise: productPrice(product) })), [products, trackInventory])
  const results = useMemo(() => filterCatalogProducts(inventoryProducts, { search, category, sort, minPrice, maxPrice, availability: effectiveAvailability }, { trackInventory }), [inventoryProducts, search, category, sort, minPrice, maxPrice, effectiveAvailability, trackInventory])
  const visible = results.products.map(product => products.find(row => row.id === product.id))
  const filtersActive = Boolean(search.trim() || category !== 'all' || minPrice.trim() || maxPrice.trim() || effectiveAvailability !== 'all')
  const lines = useMemo(() => cartLines(cart, products, { trackInventory }), [cart, products, trackInventory])
  const count = lines.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  const fee = method === 'delivery' ? Number(fulfillment.delivery_fee_paise || 0) : 0
  const minimum = Number(fulfillment.minimum_order_paise || 0)
  const selectedVariant = selected ? productVariants(selected).find(variant => variant.id === selectedVariantId) : null
  const selectedKey = selected ? cartLineKey(selected.id, selectedVariant?.id) : ''
  const quoteRequired = Boolean(website.settings || couponCode || lines.some(line => line.variant || line.product.variants_required))
  const quoteBody = useMemo(() => ({
    items: lines.map(({ product, variant, quantity: amount }) => ({ product_id: product.id, quantity: amount, ...(variant ? { variant_id: variant.id } : {}) })).sort((a, b) => `${a.product_id}:${a.variant_id || ''}`.localeCompare(`${b.product_id}:${b.variant_id || ''}`)),
    customer: { name: customer.name.trim(), phone: customer.phone.trim(), address: method === 'delivery' ? customer.address.trim() : '', ...(method === 'delivery' && customer.pincode.trim() ? { pincode: customer.pincode.trim() } : {}), ...(method === 'delivery' && customer.saved_address_id ? { saved_address_id: customer.saved_address_id } : {}) },
    fulfillment_method: method,
    ...(couponCode ? { coupon_code: couponCode } : {}),
  }), [lines, customer, method, couponCode])
  const quoteFingerprint = JSON.stringify(quoteBody)
  const currentQuote = quoteState?.fingerprint === quoteFingerprint && quoteState.accountId === session?.user?.id ? quoteState : null
  const quote = currentQuote?.quote || null
  const quoteBlocked = quoteRequired && (!quote || Boolean(currentQuote?.error))
  const verified = Boolean(session?.user?.email_confirmed_at)
  const currentBuyerId = session?.user?.id || null
  const canCOD = website.features?.cod === true && (pickup || delivery)
  const quoteOnline = !canCOD && initialCatalog.payments?.available === true
  const canOrder = canCOD || initialCatalog.payments?.available === true && (pickup || delivery)

  useEffect(() => {
    const key = restoredAttemptRef.current
    if (!key || !verified || !client || !session?.user?.id) return
    let alive = true
    const accountId = session.user.id
    const version = accountVersionRef.current
    // A lost response can consume the last stock before a reload imports the
    // cart. Reconcile the saved key with this buyer's history independently of
    // current catalog availability, rather than requiring an orderable cart.
    commerceFetch(`/api/commerce/customer/orders?website_id=${website.id}`, { client }).then(result => {
      if (!alive || accountIdRef.current !== accountId || version !== accountVersionRef.current || restoredAttemptRef.current !== key) return
      const existing = result.orders?.find(order => order.idempotency_key === key)
      if (!existing) return
      restoredAttemptRef.current = null
      attemptRef.current = null
      setConfirmation(existing)
      setCheckoutPending(false)
      setCart({})
      try { sessionStorage.removeItem(`dd-commerce-checkout:${website.id}:${accountId}`) } catch {}
    }).catch(() => { /* Keep the key available for an explicit retry or order history. */ })
    return () => { alive = false }
  }, [client, session?.user?.id, verified, website.id])

  useEffect(() => {
    if (!session?.user?.id || !client) return
    let alive = true
    const accountId = session.user.id
    const version = accountVersionRef.current
    commerceFetch(`/api/commerce/customer/experience?website_id=${website.id}`, { client }).then(result => {
      if (!alive || accountIdRef.current !== accountId || version !== accountVersionRef.current) return
      const saved = Array.isArray(result.addresses) ? result.addresses : []
      setAddresses(saved)
      const preferred = saved.find(address => address.is_default)
      if (preferred) setCustomer(current => addressAutofill(current, preferred, touchedRef.current))
    }).catch(() => { /* Manual checkout remains available when saved addresses cannot load. */ })
    return () => { alive = false }
  }, [client, session?.user?.id, website.id])

  useEffect(() => {
    if (!cartOpen || !quoteRequired || !verified || !client || !lines.length || customer.name.trim().length < 2 || customer.phone.trim().length < 7 || method === 'delivery' && (customer.address.trim().length < 8 || zonesEnabled && !/^\d{6}$/.test(customer.pincode.trim()))) return
    let alive = true
    const accountId = session.user.id
    const version = accountVersionRef.current
    const timer = window.setTimeout(() => {
      commerceFetch(quoteOnline ? '/api/commerce/payments/quote' : `/api/commerce/quote/${website.id}`, { client, method: 'POST', body: quoteOnline ? { website_id: website.id, checkout: quoteBody } : quoteBody }).then(result => {
        if (!alive || accountIdRef.current !== accountId || accountVersionRef.current !== version) return
        if (!result.quote || !Number.isSafeInteger(result.quote.total_paise)) throw new Error('The store could not verify this total. Please try again.')
        setQuoteState({ fingerprint: quoteFingerprint, accountId, quote: result.quote })
      }).catch(requestError => {
        if (alive && accountIdRef.current === accountId && accountVersionRef.current === version) setQuoteState({ fingerprint: quoteFingerprint, accountId, error: requestError.message || 'We could not check this order.' })
      })
    }, 300)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [cartOpen, quoteRequired, quoteOnline, verified, client, lines.length, customer.name, customer.phone, customer.address, customer.pincode, method, zonesEnabled, quoteBody, quoteFingerprint, session?.user?.id, website.id])

  function editCustomer(field, value) {
    touchedRef.current[field] = true
    setCustomer(current => ({ ...current, [field]: value, ...(['address', 'pincode'].includes(field) ? { saved_address_id: '' } : {}) }))
  }

  function chooseAddress(id) {
    const address = addresses.find(row => row.id === id)
    touchedRef.current = { name: true, phone: true, address: true, pincode: true }
    setCustomer(current => address ? { ...current, name: address.name, phone: address.phone, address: address.address, pincode: address.pincode || '', saved_address_id: address.id } : { ...current, saved_address_id: '' })
  }

  function openProduct(product) { setSelected(product); setSelectedVariantId('') }

  function clearFilters() { setSearch(''); setCategory('all'); setMinPrice(''); setMaxPrice(''); setAvailability('all') }

  function quantity(product, next, variant = null) {
    if (busy || onlinePending || product.variants_required && !variant) return
    setError('')
    setConfirmation(null)
    setCart(current => {
      const changed = { ...current }
      const available = lineStock(product, variant, { trackInventory })
      const key = cartLineKey(product.id, variant?.id)
      const amount = Math.max(0, Math.min(Math.floor(Number(next)) || 0, available, 999))
      if (amount) changed[key] = amount
      else delete changed[key]
      return changed
    })
  }

  async function checkout(event) {
    event.preventDefault()
    if (busy || onlinePending || !canCOD || !lines.length) return
    setError('')
    if (!verified || !clientRef.current) { setError('Sign in with a verified account before placing your order.'); return }
    const verifiedSubtotal = quote?.subtotal_paise ?? subtotal
    const verifiedMinimum = quote?.minimum_order_paise ?? minimum
    if (!canOrder || verifiedSubtotal < verifiedMinimum) { setError(verifiedSubtotal < verifiedMinimum ? `The minimum order is ${money(verifiedMinimum)}.` : 'Checkout is not available for this store.'); return }
    if (quoteBlocked && !checkoutPending) { setError(currentQuote?.error || 'Complete your details and wait for the store to verify your order total.'); return }
    const body = { ...quoteBody, payment_method: 'cod' }
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
    setCheckoutPending(true)
    try { sessionStorage.setItem(attemptKey, JSON.stringify(attempt)) } catch {}
    setBusy(true)
    try {
      const result = await commerceFetch(`/api/commerce/checkout/${website.id}`, { client: clientRef.current, method: 'POST', body: { ...body, idempotency_key: attempt.key } })
      if (!sameBuyer()) return
      if (!result.order?.id) throw new Error('The order confirmation was incomplete. Retry with the same details or check your order history.')
      setConfirmation(result.order)
      setCart({})
      attemptRef.current = null
      setCheckoutPending(false)
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
            setCheckoutPending(false)
            try { sessionStorage.removeItem(attemptKey) } catch {}
            return
          }
        } catch { /* Keep the pending key until an order can be confirmed. */ }
      }
      if (!sameBuyer()) return
      setError(requestError.message || 'We could not confirm your order. Retry with the same details or check your order history.')
    } finally { setBusy(false) }
  }

  const onlineStateChanged = useCallback(pending => {
    setOnlinePending(pending)
    if (pending && paymentKey && currentBuyerId) {
      attemptRef.current = { key: paymentKey }
      try { sessionStorage.setItem(`dd-commerce-checkout:${website.id}:${currentBuyerId}`, JSON.stringify({ key: paymentKey })) } catch {}
    }
  }, [paymentKey, currentBuyerId, website.id])

  const onlineComplete = useCallback(result => {
    if (accountIdRef.current !== currentBuyerId || result?.order?.website_id !== website.id || result?.receipt?.order_id !== result?.order?.id) return
    setConfirmation(result.order); setCart({}); setOnlinePending(false); setCheckoutPending(false)
    setPaymentKey(crypto.randomUUID())
    attemptRef.current = null; restoredAttemptRef.current = null
    try { sessionStorage.removeItem(`dd-commerce-checkout:${website.id}:${currentBuyerId}`) } catch {}
  }, [currentBuyerId, website.id])

  const onlinePayment = verified && client && paymentKey && (initialCatalog.payments?.available === true || onlinePending) ? <CommercePaymentCheckout key={`${website.id}:${session.user.id}`} websiteId={website.id} userId={session.user.id} client={client} checkout={{ ...quoteBody, idempotency_key: paymentKey }} disabled={busy || !canOrder || !lines.length || quoteBlocked || checkoutPending && !onlinePending || (quote?.subtotal_paise ?? subtotal) < (quote?.minimum_order_paise ?? minimum)} onStateChange={onlineStateChanged} onComplete={onlineComplete} /> : null

  function renderProduct(product) {
    const options = productVariants(product)
    const requiresSelection = product.variants_required || options.length > 0
    const stock = productStock(product, { trackInventory })
    const key = cartLineKey(product.id)
    const inBag = lines.filter(line => line.product.id === product.id).reduce((sum, line) => sum + line.quantity, 0)
    return <article className="cs-product" key={product.id}>
      <button className="cs-product-photo" type="button" onClick={() => openProduct(product)} aria-label={`View ${product.name}`}><ProductImage product={product} />{stock <= 0 && <span className="cs-stock-badge">Sold out</span>}</button>
      <div className="cs-product-meta"><p>{categories.find(item => item.id === product.category_id)?.name || templateCopy.collection}</p><button type="button" className="cs-product-name" onClick={() => openProduct(product)}>{product.name}</button>{template === 'food' && product.description && <p className="cs-menu-description">{product.description}</p>}<div className="cs-product-bottom"><strong>{requiresSelection && options.length > 0 ? 'From ' : ''}{money(productPrice(product))}</strong><button type="button" className="cs-add" disabled={busy || onlinePending || !cartReady || stock <= 0 || !requiresSelection && stock <= (cart[key] || 0)} aria-label={requiresSelection ? `Choose options for ${product.name}` : `Add ${product.name} to bag`} onClick={() => requiresSelection ? openProduct(product) : quantity(product, (cart[key] || 0) + 1)}>{requiresSelection ? 'Choose' : inBag ? `In bag: ${inBag} +` : '+'}</button></div></div>
    </article>
  }

  return (
    <main className={`commerce-store cs-editorial cs-template-${template}`} data-template={template} style={storefrontStyle}>
      <div className="cs-topline">{pickup && delivery ? 'Local delivery & store pickup' : delivery ? 'Local delivery available' : pickup ? 'Collect from our store' : 'Explore our collection'}</div>
      <header className="cs-header cs-container">
        <StoreBrand website={website} />
        <nav aria-label="Store navigation"><a href="#collection">Collection</a><button className="cs-nav-search" type="button" onClick={() => searchRef.current?.focus()}>Search</button><a href="#store-contact">Contact</a><Link href={accountPath}>My account</Link></nav>
        <button className="cs-bag" type="button" onClick={() => { setCartOpen(true); setError('') }} aria-label={`Open shopping bag, ${count} items`} disabled={!cartReady}><BagIcon /><span>Bag</span><strong>{count}</strong></button>
      </header>
      <nav className="cs-mobile-nav cs-container" aria-label="Mobile store navigation"><a href="#collection">Collection</a><button type="button" onClick={() => searchRef.current?.focus()}>Search</button><Link href={accountPath}>Account</Link><a href="#store-contact">Contact</a></nav>

      <StorefrontSections website={website} categories={categories} products={products} template={template} onCategory={setCategory} renderProduct={renderProduct} />

      <section id="collection" className="cs-collection cs-container" aria-labelledby="collection-title">
        <div className="cs-section-heading"><div><p className="cs-eyebrow">{website.name}</p><h2 id="collection-title">{templateCopy.collection}</h2></div><p>{products.length} {products.length === 1 ? 'product' : 'products'}</p></div>
        <div className="cs-collection-toolbar"><label className="cs-search"><span className="cs-sr-only">Search products</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input ref={searchRef} type="search" placeholder={template === 'food' ? 'Search the menu' : 'Search the collection'} value={search} onChange={event => setSearch(event.target.value)} /></label><label className="cs-sort"><span>Sort by</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="name">Name</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label></div>
        <div className="cs-category-tabs" role="group" aria-label="Filter products by category"><button className={category === 'all' ? 'is-active' : ''} type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All products</button>{categories.map(item => <button type="button" key={item.id} className={category === item.id ? 'is-active' : ''} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.name}</button>)}</div>
        <div className="cs-advanced-filters" role="group" aria-label="Refine the collection">
          <label><span>Minimum price (₹)</span><input type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={minPrice} aria-invalid={Boolean(results.error)} aria-describedby={results.error ? 'cs-price-error' : undefined} onChange={event => setMinPrice(event.target.value)} /></label>
          <label><span>Maximum price (₹)</span><input type="text" inputMode="decimal" autoComplete="off" placeholder="Any price" value={maxPrice} aria-invalid={Boolean(results.error)} aria-describedby={results.error ? 'cs-price-error' : undefined} onChange={event => setMaxPrice(event.target.value)} /></label>
          <label><span>Availability</span><select value={effectiveAvailability} onChange={event => setAvailability(event.target.value)}><option value="all">All availability</option><option value="in-stock">Available to order</option>{trackInventory && <option value="sold-out">Sold out</option>}</select></label>
          <button type="button" className="cs-secondary" onClick={clearFilters} disabled={!filtersActive}>Clear filters</button>
        </div>
        {results.error && <p className="cs-filter-error" id="cs-price-error" role="alert">{results.error}</p>}
        <p className="cs-results" role="status" aria-live="polite" aria-atomic="true">Showing {visible.length} of {products.length} {products.length === 1 ? 'product' : 'products'}{category !== 'all' ? ` in ${categories.find(item => item.id === category)?.name || 'this category'}` : ''}.</p>
        {visible.length ? template === 'food' ? <div className="cs-menu-groups">{[...categories, { id: null, name: 'Other products' }].map(group => {
          const items = visible.filter(product => group.id ? product.category_id === group.id : !categories.some(row => row.id === product.category_id))
          return items.length > 0 && <section key={group.id || 'other'} className="cs-menu-group"><h3>{group.name}</h3><div className="cs-product-grid">{items.map(renderProduct)}</div></section>
        })}</div> : <div className="cs-product-grid">{visible.map(renderProduct)}</div> : <div className="cs-empty"><BagIcon size={36} /><h3>{results.error ? 'Check your price range.' : products.length ? 'No products match your search.' : 'The collection is coming soon.'}</h3><p>{products.length ? 'Try a different search, category, price or availability.' : 'Please check back with the store for new arrivals.'}</p>{products.length > 0 && <button className="cs-secondary" type="button" onClick={clearFilters}>Reset collection</button>}</div>}
      </section>

      {!website.settings?.sections?.some(section => section.type === 'faq' && section.enabled !== false) && <StorefrontFAQ faq={website.settings?.faq} />}
      <StorefrontPolicies settings={website.settings} />
      <footer className="cs-footer" id="store-contact"><div className="cs-container cs-footer-inner"><div><StoreBrand website={website} /><p>{branding.description || `Shop directly with ${website.name}.`}</p></div><div><h2>Get in touch</h2>{branding.contact_email && <a href={`mailto:${branding.contact_email}`}>{branding.contact_email}</a>}{branding.contact_phone && <a href={`tel:${branding.contact_phone}`}>{branding.contact_phone}</a>}{fulfillment.pickup_address && <p>{fulfillment.pickup_address}</p>}{!branding.contact_email && !branding.contact_phone && !fulfillment.pickup_address && <p>Contact details will be added by the store.</p>}</div><div><h2>Your account</h2><Link href={accountPath}>Sign in & order history</Link><a href="#collection">Browse all products</a></div></div><div className="cs-container cs-footer-bottom"><span>{website.name}</span><Link href="/commerce">Website powered by Digital Dine-In</Link></div></footer>

      <Modal open={Boolean(selected)} titleId="cs-product-title" onClose={() => setSelected(null)} className="cs-product-dialog">
        {selected && <><button className="cs-modal-close" type="button" onClick={() => setSelected(null)} aria-label="Close product details">×</button><div className="cs-detail-image"><ProductGallery key={selected.id} product={selected} /></div><div className="cs-detail-copy"><p className="cs-eyebrow">{categories.find(item => item.id === selected.category_id)?.name || templateCopy.collection}</p><h2 id="cs-product-title">{selected.name}</h2><p className="cs-detail-price">{selectedVariant ? money(selectedVariant.price_paise) : selected.variants_required ? productVariants(selected).length ? `From ${money(productPrice(selected))}` : "Options unavailable" : money(selected.price_paise)}</p>{selected.description && <p className="cs-description">{selected.description}</p>}
          {Object.entries(selected.attributes || {}).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).length > 0 && <dl className="cs-attributes">{Object.entries(selected.attributes || {}).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{String(value)}</dd></div>)}</dl>}
          {productVariants(selected).length > 0 && <label className="cs-variant-picker">Choose an option{selected.variants_required && ' (required)'}<select name="variant" aria-label={selected.variants_required ? "Choose an option (required)" : "Choose an option"} value={selectedVariantId} onChange={event => setSelectedVariantId(event.target.value)}><option value="">{selected.variants_required ? 'Select an option' : 'Standard product'}</option>{productVariants(selected).map(variant => <option key={variant.id} value={variant.id} disabled={lineStock(selected, variant, { trackInventory }) === 0}>{variantLabel(variant)} · {money(variant.price_paise)}{lineStock(selected, variant, { trackInventory }) === 0 ? ' · Sold out' : ''}</option>)}</select></label>}
          {selectedVariant?.sku && <p className="cs-small">SKU: {selectedVariant.sku}</p>}
          <p className="cs-availability">{selected.variants_required && !selectedVariant ? 'Choose an option to see availability.' : lineStock(selected, selectedVariant, { trackInventory }) > 0 ? 'Available to order' : 'Currently sold out'}</p>
          <button className="cs-primary" type="button" disabled={selected.variants_required && !selectedVariant || lineStock(selected, selectedVariant, { trackInventory }) <= (cart[selectedKey] || 0) || busy || onlinePending || !cartReady} onClick={() => quantity(selected, (cart[selectedKey] || 0) + 1, selectedVariant)}>{cart[selectedKey] ? `Add another · ${cart[selectedKey]} in bag` : 'Add to bag'}</button>
          <CustomerProductActions website={website} client={client} session={session} product={selected} />
        </div></>}

      </Modal>

      <Modal open={cartOpen} titleId="cs-cart-title" onClose={() => { if (!busy) setCartOpen(false) }} className="cs-cart-dialog">
        <StorefrontBag website={website} accountPath={accountPath} lines={lines} count={count} subtotal={subtotal} fee={fee} minimum={minimum} method={method} setMethod={setMethod} customer={customer} onCustomerChange={editCustomer} addresses={addresses} onAddressChange={chooseAddress} zonesEnabled={zonesEnabled} couponInput={couponInput} onCouponInput={setCouponInput} couponCode={couponCode} onApplyCoupon={() => { setCouponCode(couponInput.trim().toUpperCase()); setQuoteState(null) }} onRemoveCoupon={() => { setCouponInput(''); setCouponCode(''); setQuoteState(null) }} quote={quote} quoteRequired={quoteRequired} quoteError={currentQuote?.error} quoteBlocked={quoteBlocked && !checkoutPending} session={session} authReady={authReady} verified={verified} canOrder={canOrder} canCOD={canCOD} busy={busy} locked={onlinePending} onlinePayment={onlinePayment} error={error} confirmation={confirmation} onQuantity={quantity} onClose={() => { if (!busy) setCartOpen(false) }} onCheckout={checkout} renderProductImage={product => <ProductImage product={product} />} />
      </Modal>
    </main>
  )
}
