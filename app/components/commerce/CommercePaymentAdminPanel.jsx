'use client'

import { useEffect, useState } from 'react'
import './commerce-payments.css'

async function adminPaymentRequest(path, body, signal) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.message || 'Store payment configuration is unavailable.')
  return result
}
export function CommercePaymentAdminPanel({ websiteId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [credentials, setCredentials] = useState({ key_id: '', key_secret: '', webhook_secret: '' })
  const [enabled, setEnabled] = useState(false)
  const [recovery, setRecovery] = useState({ intent_id: '', provider_order_id: '' })
  const path = `/api/commerce/payments/admin?website_id=${websiteId}`
  useEffect(() => {
    const controller = new AbortController()
    adminPaymentRequest(path, null, controller.signal).then(setData).catch(failure => { if (failure.name !== 'AbortError') setError(failure.message) })
    return () => controller.abort()
  }, [path])
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await adminPaymentRequest('/api/commerce/payments/admin', { website_id: websiteId, action: 'configure', credentials, enabled })
      setCredentials({ key_id: '', key_secret: '', webhook_secret: '' })
      setData(await adminPaymentRequest(path))
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  async function disable() {
    setBusy(true); setError('')
    try { await adminPaymentRequest('/api/commerce/payments/admin', { website_id: websiteId, action: 'disable' }); setData(await adminPaymentRequest(path)) } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  async function refresh() {
    setBusy(true); setError('')
    try { setData(await adminPaymentRequest(path)) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  async function reconcile(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await adminPaymentRequest('/api/commerce/payments/admin', { website_id: websiteId, action: 'reconcile', intent_id: recovery.intent_id, ...(recovery.provider_order_id ? { provider_order_id: recovery.provider_order_id } : {}) })
      setError(result.payment?.state === 'fulfilled' ? 'The captured payment now has its original order and receipt.' : 'Reconciliation remains pending. No refund has been confirmed; do not ask the customer to pay again.')
      setData(await adminPaymentRequest(path))
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  return <section className="commerce-payment-admin" aria-label="Commerce merchant payments">
    <h3>Store online payments</h3>
    <p>Use separate commerce merchant credentials for this store. Saved secrets are never returned. Each save creates an immutable version used by its original payment attempts.</p>
    {error && <p role="status">{error}</p>}
    {data && <p>Rollout: {data.rollout?.enabled ? 'enabled' : 'disabled'} · Merchant: {data.readiness?.merchant_enabled ? 'enabled' : 'disabled'} · Mode: {data.readiness?.mode || 'unconfigured'} · Captured orders needing attention: {data.readiness?.captured_unfulfilled_count || 0} · Provider results needing reconciliation: {data.readiness?.provider_unknown_count || 0}</p>}
    <section className="commerce-payment-queue" aria-label="Open payment attempts"><div className="commerce-payment-actions"><h4>Open payment attempts</h4><button type="button" disabled={busy} onClick={() => void refresh()}>Refresh payment attempts</button></div>
      {data?.recovery?.available === false ? <p>The recovery queue is unavailable until its reviewed database capability is installed.</p> : data?.recovery?.available === true ? <>
        <p>{data.recovery.total_count} open attempt{data.recovery.total_count === 1 ? '' : 's'}. Captured payments needing fulfillment appear first. An open attempt is not proof of a failed or unpaid payment.</p>
        {data.recovery.has_more && <p role="status">Showing the first 100 attempts. Resolve older cases and refresh to see the next entries.</p>}
        {data.recovery.intents.map(intent => <article className="commerce-payment-queue-item" key={intent.id}><strong>{intent.state.replaceAll('_', ' ')} · {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(intent.amount_paise / 100)} · {intent.mode}</strong><p>Payment reference: <code>{intent.id}</code></p><p>Checkout reference: <code>{intent.cart_key}</code></p><p>Created: <time dateTime={intent.created_at}>{new Date(intent.created_at).toLocaleString('en-IN')}</time></p>{intent.provider_order_id && <p>Provider order: <code>{intent.provider_order_id}</code></p>}{intent.receipt && <p>Receipt: <code>{intent.receipt.id}</code> · {intent.receipt.state.replaceAll('_', ' ')}</p>}<button type="button" disabled={busy} onClick={() => setRecovery({ intent_id: intent.id, provider_order_id: intent.provider_order_id || '' })}>Select for reconciliation</button></article>)}
        {!data.recovery.intents.length && <p>No open payment attempts for this website.</p>}
      </> : !error && <p role="status">Loading payment attempts…</p>}
    </section>
    <form onSubmit={save}>
      {['key_id','key_secret','webhook_secret'].map(key => <label key={key}>{key === 'key_id' ? 'Merchant key ID' : key === 'key_secret' ? 'Merchant key secret' : 'Webhook secret'}<input type={key === 'key_id' ? 'text' : 'password'} autoComplete="off" required minLength={key === 'key_id' ? 15 : 16} maxLength={key === 'key_id' ? 100 : 200} value={credentials[key]} onChange={event => setCredentials(current => ({ ...current, [key]: event.target.value }))} /></label>)}
      <label className="commerce-payment-checkbox"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Enable merchant checkout after verified setup</label>
      <div className="commerce-payment-actions"><button disabled={busy}>Save new credential version</button><button type="button" disabled={busy || !data?.readiness?.merchant_enabled} onClick={() => void disable()}>Disable merchant checkout</button></div>
    </form>
    {data?.readiness?.credential_version && <p>Webhook URL: <code>/api/commerce/payments/webhook?website_id={websiteId}&amp;credential_version={data.readiness.credential_version}</code>. Configure payment.captured and order.paid for this credential version after separate provider activation approval. Keep older webhook versions for outstanding attempts.</p>}
    <form onSubmit={reconcile}><h4>Reconcile an existing payment</h4><p>Fetches provider evidence and retries fulfillment for the same captured receipt. It never creates a second provider order or reports a completed refund.</p><label>Payment intent ID<input required value={recovery.intent_id} onChange={event => setRecovery(current => ({ ...current, intent_id: event.target.value }))} /></label><label>Provider order ID, for an unknown creation result<input value={recovery.provider_order_id} onChange={event => setRecovery(current => ({ ...current, provider_order_id: event.target.value }))} /></label><button disabled={busy}>Check existing provider payment</button></form>
  </section>
}
export default CommercePaymentAdminPanel
