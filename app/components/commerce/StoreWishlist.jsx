'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commerceFetch, getCommerceClient } from '@/lib/commerce/client'
import { productImages, productPrice, productStock, productVariants } from '@/lib/commerce/catalog-options'
import { StoreBrand, storeStyle } from './Storefront'
import './store-wishlist.css'

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value / 100)
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function wishlistSnapshot(result) {
  if (!Array.isArray(result?.wishlist) || !result.wishlist.every(id => typeof id === 'string' && uuid.test(id)) || !Array.isArray(result.wishlist_products) || !result.wishlist_products.every(product => product && typeof product.id === 'string' && uuid.test(product.id))) throw new Error('Your wishlist could not be checked. Please retry.')
  return { ids: [...new Set(result.wishlist)], publicIds: result.wishlist_products.map(product => product.id) }
}

function WishlistImage({ product }) {
  const source = productImages(product)[0]
  const [failed, setFailed] = useState(null)
  return source && source.url !== failed ? <Image src={source.url} alt={source.alt || product.name} width={640} height={800} unoptimized loading="lazy" decoding="async" onError={() => setFailed(source.url)} /> : <span className="cw-image-fallback" role="img" aria-label={`Image unavailable for ${product.name}`}>Image unavailable</span>
}

function SavedProducts({ website, products, client, user, version, isCurrent }) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const alive = useRef(false)
  const request = useRef(0)
  const busy = useRef(true)
  const controllerRef = useRef(null)
  const focusAfter = useRef(null)
  const buttons = useRef(new Map())
  const heading = useRef(null)
  const home = `/shops/${encodeURIComponent(website.slug)}`
  const current = useCallback(sequence => alive.current && request.current === sequence && isCurrent(version), [isCurrent, version])
  // Bind token lookup and response to this account: an old action must never
  // dispatch with a different buyer's JWT after a delayed SDK lookup.
  const wishlistClient = useMemo(() => ({ auth: { getSession: async () => {
    const result = await client.auth.getSession()
    if (!alive.current || !isCurrent(version) || result.data?.session?.user?.id !== user.id || !result.data.session.user.email_confirmed_at) throw new Error('Your account changed. Refresh your wishlist before continuing.')
    return result
  } } }), [client, isCurrent, user.id, version])

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; request.current += 1; controllerRef.current?.abort() }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    const sequence = ++request.current
    busy.current = true
    Promise.resolve().then(async () => {
      if (!current(sequence) || controller.signal.aborted) return
      setLoading(true); setSnapshot(null); setError(''); setNotice('')
      try {
        const result = await commerceFetch(`/api/commerce/customer/experience?website_id=${encodeURIComponent(website.id)}`, { client: wishlistClient, signal: controller.signal })
        if (current(sequence) && !controller.signal.aborted) setSnapshot(wishlistSnapshot(result))
      } catch (failure) {
        if (current(sequence) && !controller.signal.aborted) setError(failure.message || 'Your wishlist could not be loaded. Please retry.')
      } finally {
        if (current(sequence) && !controller.signal.aborted) { busy.current = false; setLoading(false) }
      }
    })
    return () => controller.abort()
  }, [current, refresh, website.id, wishlistClient])

  useEffect(() => {
    if (focusAfter.current === null) return
    const target = focusAfter.current
    focusAfter.current = null
    ;(buttons.current.get(target) || heading.current)?.focus({ preventScroll: true })
  }, [snapshot])

  function reload() {
    if (busy.current) return
    busy.current = true
    setRefresh(value => value + 1)
  }

  async function remove(productId) {
    if (busy.current || !snapshot?.ids.includes(productId)) return
    busy.current = true
    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller
    const sequence = ++request.current
    setBusyId(productId); setError(''); setNotice('')
    try {
      const result = await commerceFetch('/api/commerce/customer/experience', { client: wishlistClient, method: 'POST', body: { website_id: website.id, action: 'wishlist_remove', payload: { product_id: productId } }, signal: controller.signal })
      if (!current(sequence) || controller.signal.aborted) return
      const next = wishlistSnapshot(result)
      if (next.ids.includes(productId)) throw new Error('This product is still saved. Refresh your wishlist before trying again.')
      const index = snapshot.ids.indexOf(productId)
      focusAfter.current = next.ids[Math.min(index, next.ids.length - 1)] || 'heading'
      setSnapshot(next); setNotice('Product removed from your wishlist.')
    } catch (failure) {
      if (current(sequence) && !controller.signal.aborted) setError(failure.message || 'The product could not be removed. Please retry.')
    } finally {
      if (current(sequence) && !controller.signal.aborted) { busy.current = false; setBusyId(null) }
    }
  }

  const byId = new Map(products.filter(product => product.active !== false && (!product.website_id || product.website_id === website.id)).map(product => [product.id, product]))
  const publicIds = new Set(snapshot?.publicIds || [])
  const count = snapshot?.ids.length
  return <section className="cw-content cs-container" aria-labelledby="cw-title">
    <div className="cw-heading"><div><p className="cs-eyebrow">Saved for later</p><h1 id="cw-title" tabIndex={-1} ref={heading}>Your wishlist</h1><p className="cw-account">Signed in as {user.email}</p><p role="status" aria-live="polite" aria-atomic="true">{snapshot ? `${count} saved product${count === 1 ? '' : 's'} in this store.` : loading ? 'Loading your wishlist…' : 'Your saved products could not be checked.'}</p></div><button className="cs-secondary" type="button" disabled={loading || Boolean(busyId)} onClick={reload}>Refresh wishlist</button></div>
    {error && <div className="cw-feedback"><p className="cs-error" role="alert">{error}</p>{!loading && <button className="cs-secondary" type="button" disabled={Boolean(busyId)} onClick={reload}>Retry wishlist</button>}</div>}
    {notice && <p className="cs-notice" role="status">{notice}</p>}
    {snapshot && (count ? <ul className="cw-grid" aria-label="Saved products">{snapshot.ids.map((id, index) => {
      const product = publicIds.has(id) ? byId.get(id) : null
      const variants = product ? productVariants(product) : []
      const optionsUnavailable = product?.variants_required && variants.length === 0
      const soldOut = product && productStock(product, { trackInventory: website.features?.inventory !== false }) === 0
      return <li className="cw-card" key={id} aria-label={product ? product.name : `Unavailable product ${index + 1}`}>
        {product ? <><Link className="cw-image" href={`${home}?product=${encodeURIComponent(id)}`} aria-label={`View ${product.name}`}><WishlistImage product={product} /></Link><div className="cw-card-copy"><h2><Link href={`${home}?product=${encodeURIComponent(id)}`}>{product.name}</Link></h2><p className="cw-price">{optionsUnavailable ? 'Options unavailable' : `${variants.length ? 'From ' : ''}${money(productPrice(product))}`}</p>{!optionsUnavailable && soldOut && <p className="cw-availability">Currently sold out</p>}<Link className="cs-text-link" href={`${home}?product=${encodeURIComponent(id)}`}>View product</Link></div></> : <div className="cw-unavailable"><span className="cw-image-fallback" aria-hidden="true">Unavailable</span><h2>Unavailable product</h2><p>This product is no longer available in this store. You can remove it from your wishlist.</p></div>}
        <button ref={node => { if (node) buttons.current.set(id, node); else buttons.current.delete(id) }} className="cs-secondary cw-remove" type="button" disabled={Boolean(busyId) || loading} aria-label={product ? `Remove ${product.name} from wishlist` : `Remove unavailable product ${index + 1} from wishlist`} onClick={() => void remove(id)}>{busyId === id ? 'Removing…' : 'Remove'}</button>
      </li>
    })}</ul> : <div className="cs-empty cw-empty"><h2>No saved products yet.</h2><p>Save products while browsing to find them here later.</p><Link className="cs-primary" href={home}>Browse this store</Link></div>)}
    <p className="cw-footnote">Saved products belong to your account in this store. Prices and availability are checked again at checkout.</p>
  </section>
}

function WishlistScope({ initialCatalog }) {
  const { website, products = [] } = initialCatalog
  const [auth, setAuth] = useState({ ready: false, client: null, session: null, version: 0, error: '' })
  const [retry, setRetry] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const mounted = useRef(false)
  const scope = useRef({ version: 0, id: null, verified: false })
  const signOutBusy = useRef(false)
  const home = `/shops/${encodeURIComponent(website.slug)}`
  const account = `${home}/account`
  const isCurrent = useCallback(version => mounted.current && scope.current.version === version, [])
  const acceptSession = useCallback((session, client) => {
    if (!mounted.current) return
    const id = session?.user?.id || null, verified = Boolean(session?.user?.email_confirmed_at)
    if (scope.current.id !== id || scope.current.verified !== verified) scope.current = { version: scope.current.version + 1, id, verified }
    setAuth({ ready: true, client, session, version: scope.current.version, error: '' })
    signOutBusy.current = false; setSigningOut(false); setSignOutError('')
  }, [])

  useEffect(() => {
    mounted.current = true
    let alive = true, authEvents = 0, subscription
    try {
      const client = getCommerceClient(`customer:${website.slug}`)
      client.auth.getSession().then(({ data, error }) => {
        if (!alive || authEvents) return
        if (error) throw error
        acceptSession(data.session, client)
      }).catch(() => {
        if (!alive || authEvents) return
        scope.current = { version: scope.current.version + 1, id: null, verified: false }
        setAuth({ ready: true, client, session: null, version: scope.current.version, error: 'Your account could not be checked. Please retry or sign in again.' })
      })
      subscription = client.auth.onAuthStateChange((_event, session) => { if (alive) { authEvents += 1; acceptSession(session, client) } }).data.subscription
    } catch {
      Promise.resolve().then(() => { if (alive) setAuth({ ready: true, client: null, session: null, version: scope.current.version, error: 'Your account could not be checked. Please retry or sign in again.' }) })
    }
    return () => { alive = false; mounted.current = false; scope.current = { version: scope.current.version + 1, id: null, verified: false }; subscription?.unsubscribe() }
  }, [acceptSession, retry, website.slug])

  async function signOut() {
    if (!auth.client || signOutBusy.current) return
    signOutBusy.current = true
    scope.current = { ...scope.current, version: scope.current.version + 1 }
    const version = scope.current.version
    setAuth(current => ({ ...current, version })); setSigningOut(true); setSignOutError('')
    try {
      const { error } = await auth.client.auth.signOut({ scope: 'local' })
      if (error) throw error
      if (isCurrent(version)) acceptSession(null, auth.client)
    } catch {
      if (isCurrent(version)) { setSignOutError('We could not sign out. Please try again.'); setSigningOut(false); signOutBusy.current = false }
    }
  }

  const verified = Boolean(auth.session?.user?.email_confirmed_at)
  return <main className="commerce-store cw-page" style={storeStyle(website.branding)}>
    <header className="cs-header cs-container cw-header"><StoreBrand website={website} /><nav aria-label="Wishlist navigation"><Link href={home}>Back to the store</Link><Link href={account}>My account</Link>{auth.session && <button className="cs-text-button" type="button" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? 'Signing out…' : 'Sign out'}</button>}</nav></header>
    {!auth.ready || signingOut ? <section className="cs-container cw-gate"><h1>Your wishlist</h1><p role="status">{signingOut ? 'Signing out…' : 'Checking your account…'}</p></section> : verified ? <SavedProducts key={`${website.id}:${auth.session.user.id}:${auth.version}`} website={website} products={products} client={auth.client} user={auth.session.user} version={auth.version} isCurrent={isCurrent} /> : <section className="cs-container cw-gate"><p className="cs-eyebrow">Saved for later</p><h1>Your wishlist</h1><h2>{auth.session ? 'Verify your email to view your wishlist.' : 'Sign in to view your wishlist'}</h2><p>{auth.session ? 'Open your account to request a verification email, then return to your saved products.' : 'Your saved products stay private to your account in this store.'}</p><Link className="cs-primary" href={account}>{auth.session ? 'Open my account' : 'Sign in'}</Link>{auth.error && <><p className="cs-error" role="alert">{auth.error}</p><button className="cs-secondary" type="button" onClick={() => setRetry(value => value + 1)}>Retry account check</button></>}</section>}
    {signOutError && <div className="cs-container"><p className="cs-error" role="alert">{signOutError}</p></div>}
    <footer className="cs-container cw-footer"><span>{website.name}</span><Link className="cs-text-link" href={home}>Continue shopping</Link></footer>
  </main>
}

export default function StoreWishlist(props) {
  return <WishlistScope key={props.initialCatalog.website.id} {...props} />
}
