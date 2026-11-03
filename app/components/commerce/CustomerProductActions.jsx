'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'
import './customer-experience.css'

// Share only concurrent loads. No customer records remain in a module cache.
const pending = new Map()
function loadExperience(websiteId, client, userId) {
  const key = `${websiteId}:${userId}`
  if (!pending.has(key)) {
    const promise = commerceFetch(`/api/commerce/customer/experience?website_id=${encodeURIComponent(websiteId)}`, { client }).finally(() => pending.delete(key))
    pending.set(key, promise)
  }
  return pending.get(key)
}

function ProductActions({ website, client, session, product }) {
  const [saved, setSaved] = useState(false)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reviews, setReviews] = useState(null)
  const [loadingReviews, setLoadingReviews] = useState(false)
  const verified = Boolean(session?.user?.email_confirmed_at)
  useEffect(() => {
    if (!verified || !client) return
    let alive = true
    loadExperience(website.id, client, session.user.id).then(result => {
      if (alive) { setSaved(result.wishlist?.includes(product.id) || false); setReady(true); setLoadError('') }
    }).catch(requestError => { if (alive) setLoadError(requestError.message || 'Unable to check your saved products. Please retry.') })
    return () => { alive = false }
  }, [website.id, client, session?.user?.id, product.id, verified, reload])

  async function toggle() {
    if (busy || !ready || !verified || !client) return
    setBusy(true); setError('')
    try {
      const result = await commerceFetch('/api/commerce/customer/experience', { client, method: 'POST', body: { website_id: website.id, action: saved ? 'wishlist_remove' : 'wishlist_add', payload: { product_id: product.id } } })
      setSaved(result.wishlist?.includes(product.id) || false)
    } catch (requestError) { setError(requestError.message || 'Unable to update your wishlist.') }
    finally { setBusy(false) }
  }

  async function showReviews() {
    if (loadingReviews) return
    if (reviews) { setReviews(null); return }
    setLoadingReviews(true); setError('')
    try { setReviews(await commerceFetch(`/api/commerce/customer/experience?website_id=${encodeURIComponent(website.id)}&product_id=${encodeURIComponent(product.id)}`)) }
    catch (requestError) { setError(requestError.message || 'Unable to load reviews.') }
    finally { setLoadingReviews(false) }
  }

  return <div className="ce-product-actions">
    <div className="ce-actions">{verified ? <button type="button" className="cs-text-button" disabled={busy || !ready && !loadError} aria-pressed={ready ? saved : undefined} onClick={() => { if (ready) void toggle(); else setReload(value => value + 1) }}>{busy ? 'Saving…' : !ready ? loadError ? 'Retry saved status' : 'Checking saved status…' : saved ? '♥ Saved' : '♡ Save'}</button> : <Link className="cs-text-link" href={`/shops/${encodeURIComponent(website.slug)}/account`}>Sign in to save</Link>}<button className="cs-text-button" type="button" disabled={loadingReviews} aria-expanded={Boolean(reviews)} onClick={() => void showReviews()}>{loadingReviews ? 'Loading…' : reviews ? 'Hide reviews' : 'Customer reviews'}</button></div>
    {reviews && <div className="ce-public-reviews"><p>{reviews.rating_count ? `${Number(reviews.average_rating).toFixed(1)} / 5 · ${reviews.rating_count} verified purchase review${reviews.rating_count === 1 ? '' : 's'}` : 'No approved reviews yet.'}</p>{reviews.reviews?.map(review => <blockquote key={review.id}><strong>{review.rating} / 5 {review.title}</strong><p>{review.body}</p><small>{new Date(review.created_at).toLocaleDateString('en-IN')}</small></blockquote>)}</div>}
    {loadError && <p className="cs-error" role="alert">{loadError}</p>}{error && <p className="cs-error" role="alert">{error}</p>}
  </div>
}

export default function CustomerProductActions(props) {
  return <ProductActions key={`${props.website.id}:${props.session?.user?.id || 'guest'}:${props.product.id}`} {...props} />
}
