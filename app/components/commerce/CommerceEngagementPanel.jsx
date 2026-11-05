'use client'

import { useEffect, useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'
import './customer-experience.css'

const readable = value => String(value || '').replaceAll('_', ' ')

function Engagement({ website, client, readOnly = false }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const endpoint = `/api/commerce/workspace/${encodeURIComponent(website.id)}/engagement`
  useEffect(() => {
    if (!client) return
    const controller = new AbortController()
    commerceFetch(endpoint, { client, signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setData(result); setError('') } }).catch(requestError => { if (!controller.signal.aborted) setError(requestError.message || 'Unable to load customer engagement.') })
    return () => controller.abort()
  }, [endpoint, client, refresh])
  async function action(name, payload) {
    if (busy || readOnly) return
    setBusy(true); setError(''); setNotice('')
    try { setData(await commerceFetch(endpoint, { client, method: 'POST', body: { action: name, payload } })); setNotice('Decision saved. Payment and refund records have not been changed.') }
    catch (requestError) { setError(requestError.message || 'Unable to save this decision.') }
    finally { setBusy(false) }
  }
  function decide(event, request) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    void action('request_decide', { request_id: request.id, decision: String(fields.get('decision')), note: String(fields.get('note') || '').trim() })
  }
  return <section className="co-card ce-owner"><div className="co-panel-title"><div><h2>Customer reviews and requests</h2><p>Moderate verified purchase reviews and decide customer requests. Refunds require a separate verified payment workflow.</p></div><button className="co-button co-button-outline" type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh</button></div>{error && <p className="co-message co-message-error" role="alert">{error}</p>}{notice && <p className="co-message" role="status">{notice}</p>}{!data ? !error && <p role="status">Loading customer engagement…</p> : <>
    {website.owner_permissions?.products === true && <section><h3>Recent product reviews</h3><p>The latest 200 reviews are shown.</p>{!data.reviews?.length && <p>No reviews to moderate.</p>}{data.reviews?.map(review => <article className="ce-review-row" key={review.id}><div><strong>{review.rating} / 5 · {review.product_name || review.product_id?.slice(0, 8)}</strong><p>{review.title}</p><p>{review.body}</p><small>{readable(review.status)} · {new Date(review.created_at).toLocaleString('en-IN')}</small></div><div className="ce-actions"><button type="button" className="co-button co-button-outline" disabled={busy || readOnly || review.status === 'approved'} onClick={() => void action('review_moderate', { review_id: review.id, status: 'approved' })}>Approve</button><button type="button" className="co-button co-button-outline" disabled={busy || readOnly || review.status === 'rejected'} onClick={() => void action('review_moderate', { review_id: review.id, status: 'rejected' })}>Reject</button></div></article>)}</section>}
    {website.owner_permissions?.orders === true && <section><h3>Cancellation and return requests</h3><p>The latest 200 requests are shown.</p>{!data.requests?.length && <p>No customer requests.</p>}{data.requests?.map(request => <article className="ce-order-tools" key={request.id}><strong>{readable(request.kind || request.type)} · Order {request.order_id.slice(0, 8).toUpperCase()} · {readable(request.status)}</strong><p>{request.reason}</p>{request.decision_note && <p>Decision note: {request.decision_note}</p>}{request.status === 'pending' && <form className="ce-form" onSubmit={event => decide(event, request)}><label>Decision<select name="decision" disabled={busy || readOnly}><option value="approved">Approve request</option><option value="rejected">Reject request</option></select></label><label>Response to customer<textarea name="note" maxLength={2000} disabled={busy || readOnly} /></label><p>{(request.kind || request.type) === 'cancellation' ? 'Approval cancels an eligible open order and restores tracked inventory once.' : 'Approval records the return decision. Arrange collection and any payment adjustment separately.'}</p><button className="co-button co-button-primary" type="submit" disabled={busy || readOnly}>Save decision</button></form>}</article>)}</section>}
    </>}
  </section>
}

export default function CommerceEngagementPanel(props) {
  return <Engagement key={props.website.id} {...props} />
}
