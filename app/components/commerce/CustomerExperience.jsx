'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'
import './customer-experience.css'

const emptyAddress = { label: '', name: '', phone: '', address: '', pincode: '', is_default: false }
const readable = value => String(value || '').replaceAll('_', ' ')
const date = value => new Date(value).toLocaleString('en-IN')

function Experience({ website, client, session, orders = [], items = [], onOrdersChange }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [address, setAddress] = useState(null)
  const [review, setReview] = useState(null)
  const [request, setRequest] = useState(null)
  const home = `/shops/${encodeURIComponent(website.slug)}`
  const orderVersion = orders.map(order => `${order.id}:${order.status}:${order.payment_status}`).join('|')

  useEffect(() => {
    if (!client || !session?.user?.email_confirmed_at) return
    const controller = new AbortController()
    commerceFetch(`/api/commerce/customer/experience?website_id=${encodeURIComponent(website.id)}`, { client, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setData(result); setError('') } })
      .catch(requestError => { if (!controller.signal.aborted) setError(requestError.message || 'Unable to load account tools.') })
    return () => controller.abort()
  }, [website.id, client, session?.user?.email_confirmed_at, refresh, orderVersion])

  async function action(name, payload, message) {
    if (busy) return false
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await commerceFetch('/api/commerce/customer/experience', { client, method: 'POST', body: { website_id: website.id, action: name, payload } })
      setData(result); setNotice(message)
      if (name === 'request_create') onOrdersChange?.()
      return true
    } catch (requestError) { setError(requestError.message || 'Unable to save your changes.'); return false }
    finally { setBusy(false) }
  }

  async function saveAddress(event) {
    event.preventDefault()
    if (await action('address_save', address, 'Address saved for this store.')) setAddress(null)
  }
  async function saveReview(event) {
    event.preventDefault()
    if (await action('review_save', review, 'Review submitted for store moderation.')) setReview(null)
  }
  async function createRequest(event) {
    event.preventDefault()
    if (await action('request_create', request, 'Your request was sent to the store. A request does not confirm a refund.')) setRequest(null)
  }
  const productName = (orderId, productId) => items.find(item => item.order_id === orderId && item.product_id === productId)?.product_name || `Product ${productId.slice(0, 8)}`

  return <section className="cs-container ce-account" aria-label="Your shopping preferences and requests">
    <div className="cs-section-heading"><h2>Your shopping tools</h2><button className="cs-secondary" type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh account tools</button></div>
    {error && <p className="cs-error" role="alert">{error}</p>}{notice && <p className="cs-notice" role="status">{notice}</p>}
    {!data ? !error && <p role="status">Loading your shopping tools…</p> : <>
      <div className="ce-grid"><section className="ce-card"><div className="ce-heading"><h3>Saved addresses</h3><button className="cs-secondary" type="button" disabled={busy} onClick={() => setAddress({ ...emptyAddress, name: session.user.user_metadata?.full_name || '' })}>Add address</button></div>
        {!data.addresses?.length && <p>No addresses saved for this store.</p>}
        {data.addresses?.map(row => <article className="ce-address" key={row.id}><strong>{row.label}{row.is_default ? ' · Default' : ''}</strong><p>{row.name} · {row.phone}</p><p>{row.address} · {row.pincode}</p><div className="ce-actions"><button type="button" className="cs-text-button" disabled={busy} onClick={() => setAddress({ id: row.id, label: row.label, name: row.name, phone: row.phone, address: row.address, pincode: row.pincode, is_default: row.is_default })}>Edit</button><button type="button" className="cs-text-button" disabled={busy} onClick={() => void action('address_delete', { address_id: row.id }, 'Saved address removed. Existing orders retain their address.')}>Remove</button></div></article>)}
        {address && <form className="ce-form" onSubmit={saveAddress}><h4>{address.id ? 'Edit address' : 'New address'}</h4>{[['label', 'Label', 60, 'off'], ['name', 'Recipient name', 180, 'name'], ['phone', 'Phone', 30, 'tel'], ['address', 'Street address', 1000, 'street-address'], ['pincode', 'Pincode', 6, 'postal-code']].map(([key, label, max, autoComplete]) => <label key={key}>{label}<input required value={address[key]} maxLength={max} minLength={key === 'address' ? 5 : key === 'name' ? 2 : key === 'phone' ? 7 : 1} autoComplete={autoComplete} inputMode={key === 'pincode' ? 'numeric' : undefined} pattern={key === 'pincode' ? '[0-9]{6}' : undefined} onChange={event => setAddress(current => ({ ...current, [key]: event.target.value }))} /></label>)}<label className="ce-check"><input type="checkbox" checked={address.is_default} onChange={event => setAddress(current => ({ ...current, is_default: event.target.checked }))} />Use as my default address for this store</label><div className="ce-actions"><button type="submit" className="cs-primary" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button><button type="button" className="cs-secondary" disabled={busy} onClick={() => setAddress(null)}>Cancel</button></div></form>}
      </section><section className="ce-card"><h3>Wishlist</h3><p>{data.wishlist?.length || 0} saved product{data.wishlist?.length === 1 ? '' : 's'} in this store.</p>{data.wishlist?.map(productId => <div className="ce-wishlist-row" key={productId}><Link className="cs-text-link" href={`${home}?product=${encodeURIComponent(productId)}`}>{data.wishlist_products?.find(product => product.id === productId)?.name || `View product ${productId.slice(0, 8)}`}</Link><button className="cs-text-button" type="button" disabled={busy} onClick={() => void action('wishlist_remove', { product_id: productId }, 'Product removed from your wishlist.')}>Remove</button></div>)}<Link className="cs-text-link" href={home}>Browse this store</Link></section></div>
      <section className="ce-card"><h3>Your verified purchase reviews</h3><p>Review products from your completed orders. New reviews and edits need approval before appearing publicly.</p>{data.review_eligible?.map(row => { const existing = data.reviews?.find(item => item.product_id === row.product_id); return <div className="ce-review-row" key={`${row.order_id}:${row.product_id}`}><div><strong>{productName(row.order_id, row.product_id)}</strong>{existing && <p>{existing.rating} / 5 · {readable(existing.status)}</p>}</div><button className="cs-secondary" type="button" disabled={busy} onClick={() => setReview({ order_id: row.order_id, product_id: row.product_id, rating: existing?.rating || 5, title: existing?.title || '', body: existing?.body || '' })}>{existing ? 'Edit review' : 'Write a review'}</button></div> })}{!data.review_eligible?.length && <p>Review options appear after an order is completed.</p>}
        {review && <form className="ce-form" onSubmit={saveReview}><label>Rating<select value={review.rating} onChange={event => setReview(current => ({ ...current, rating: Number(event.target.value) }))}>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label><label>Title<input maxLength={120} value={review.title} onChange={event => setReview(current => ({ ...current, title: event.target.value }))} /></label><label>Your review<textarea required minLength={1} maxLength={3000} value={review.body} onChange={event => setReview(current => ({ ...current, body: event.target.value }))} /></label><div className="ce-actions"><button className="cs-primary" disabled={busy} type="submit">Submit review</button><button className="cs-secondary" type="button" disabled={busy} onClick={() => setReview(null)}>Cancel</button></div></form>}
      </section>
      <section className="ce-card"><h3>Order timelines and requests</h3><p>Request a cancellation or an eligible return. The store reviews each request; payment and refund arrangements are confirmed separately.</p>{orders.map(order => <article className="ce-order-tools" key={order.id}><h4>Order {order.id.slice(0, 8).toUpperCase()}</h4><ol className="ce-timeline">{(data.events || []).filter(event => event.order_id === order.id).map(event => <li key={event.id}><span>{readable(event.status)} · Payment {readable(event.payment_status)}</span><time dateTime={event.created_at}>{date(event.created_at)}</time></li>)}</ol>{!(data.events || []).some(event => event.order_id === order.id) && <p>Current stored status: {readable(order.status)}. Historical steps were not recorded.</p>}{(data.requests || []).filter(row => row.order_id === order.id).map(row => <div className="ce-request" key={row.id}><strong>{readable(row.kind || row.type)} request · {readable(row.status)}</strong><p>{row.reason}</p>{row.decision_note && <p>Store response: {row.decision_note}</p>}</div>)}<div className="ce-actions">{(data.request_eligible || []).filter(row => row.order_id === order.id).map(row => <button className="cs-secondary" type="button" disabled={busy} key={row.type} onClick={() => setRequest({ order_id: order.id, type: row.type, reason: '' })}>Request {row.type === 'return' ? 'a return' : 'cancellation'}</button>)}</div></article>)}{!orders.length && <p>Your order timelines will appear here after checkout.</p>}
        {request && <form className="ce-form" onSubmit={createRequest}><h4>{request.type === 'return' ? 'Return' : 'Cancellation'} request for {request.order_id.slice(0, 8).toUpperCase()}</h4><label>Reason<textarea required minLength={5} maxLength={2000} value={request.reason} onChange={event => setRequest(current => ({ ...current, reason: event.target.value }))} /></label><div className="ce-actions"><button className="cs-primary" type="submit" disabled={busy}>Send request</button><button className="cs-secondary" type="button" disabled={busy} onClick={() => setRequest(null)}>Cancel</button></div></form>}
      </section>
    </>}
  </section>
}

export default function CustomerExperience(props) {
  if (!props.session?.user?.email_confirmed_at) return null
  return <Experience key={`${props.website.id}:${props.session.user.id}`} {...props} />
}
