'use client'

import { useEffect, useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'
import { formatCommerceMoney } from '@/lib/commerce/config'
import './commerce-growth.css'

const initialDraft = { code: '', kind: 'fixed', value: '', cap: '', minimum: '0', starts_at: '', ends_at: '', usage_limit: '', per_customer_limit: '1', active: true }
function exactAmount(value, maximum = 100000000) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Use amounts with at most two decimal places.')
  const [whole, fraction = ''] = value.split('.')
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (amount > BigInt(maximum)) throw new Error('Amount exceeds the permitted limit.')
  return Number(amount)
}
function count(value, optional = false) {
  if (optional && value === '') return null
  if (!/^[0-9]+$/.test(value) || Number(value) < 1 || Number(value) > 1000000) throw new Error('Usage limits must be whole numbers between 1 and 1,000,000.')
  return Number(value)
}
const localDate = value => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''

function AnalyticsDetails({ analytics }) {
  return <div className="cg-details">
    {Array.isArray(analytics.daily_trend) && <section><h3>Daily completed orders</h3><p>{analytics.period_start_date} to {analytics.period_end_date} · {analytics.timezone}. Based on recorded completion events.</p>{analytics.completion_history_incomplete && <p role="status">Some older completed orders have no recorded completion date and are excluded from these trends.</p>}<div className="co-table-wrap"><table><thead><tr><th>Date</th><th>Completed orders</th><th>Completed order value</th></tr></thead><tbody>{analytics.daily_trend.map(day => <tr key={day.date}><td>{day.date}</td><td>{day.completed_orders}</td><td>{formatCommerceMoney(day.completed_order_value_paise)}</td></tr>)}</tbody></table></div></section>}
    {Array.isArray(analytics.best_selling_products) && <section><h3>Best selling products</h3><p>Top 10 products by units in recorded completed orders for this period. Item value excludes order discounts and delivery fees.</p><div className="co-table-wrap"><table><thead><tr><th>Product</th><th>Units</th><th>Gross item value</th></tr></thead><tbody>{analytics.best_selling_products.map(product => <tr key={product.product_id}><td>{product.product_name}</td><td>{product.units}</td><td>{formatCommerceMoney(product.gross_item_value_paise)}</td></tr>)}</tbody></table>{!analytics.best_selling_products.length && <p>No completed product sales recorded for this period.</p>}</div></section>}
    {analytics.low_stock_available === true && <section><h3>Low stock alerts</h3><p>Current tracked inventory with {analytics.low_stock_threshold} or fewer units, up to 50 products and variants. These alerts are independent of the activity period.</p><div className="co-table-wrap"><table><thead><tr><th>Product</th><th>Variant / SKU</th><th>Available units</th></tr></thead><tbody>{(analytics.low_stock || []).map(product => <tr key={`${product.product_id}:${product.variant_id || 'base'}`}><td>{product.product_name}</td><td>{[product.variant_name, product.sku].filter(Boolean).join(' · ') || 'Simple product'}</td><td>{product.stock_quantity}</td></tr>)}</tbody></table>{!analytics.low_stock?.length && <p>No active products or variants are below this threshold.</p>}</div></section>}
  </div>
}

export function CommerceGrowthPanel({ website, client, readOnly = false }) {
  const [data, setData] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [days, setDays] = useState('30')
  const path = `/api/commerce/workspace/${website.id}/growth?days=${days}`
  useEffect(() => {
    const controller = new AbortController()
    commerceFetch(path, { client, signal: controller.signal }).then(result => { setData(result); setError('') }).catch(error => { if (error.name !== 'AbortError') setError(error.message) })
    return () => controller.abort()
  }, [client, path])
  async function action(action, payload) {
    setBusy(true); setError('')
    try {
      await commerceFetch(`/api/commerce/workspace/${website.id}/growth`, { client, method: 'POST', body: { action, payload } })
      setData(await commerceFetch(path, { client }))
      setDraft(null)
    } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  async function save(event) {
    event.preventDefault()
    try {
      const payload = { ...(draft.id ? { id: draft.id } : {}), code: draft.code, kind: draft.kind,
        discount_value: exactAmount(draft.value, draft.kind === 'percentage' ? 10000 : 100000000),
        maximum_discount_paise: draft.cap ? exactAmount(draft.cap) : null,
        minimum_subtotal_paise: exactAmount(draft.minimum, 1000000000000),
        starts_at: draft.starts_at ? new Date(draft.starts_at).toISOString() : null,
        ends_at: draft.ends_at ? new Date(draft.ends_at).toISOString() : null,
        usage_limit: count(draft.usage_limit, true), per_customer_limit: count(draft.per_customer_limit), active: draft.active }
      await action('save_coupon', payload)
    } catch (error) { setError(error.message) }
  }
  function edit(coupon) {
    setDraft({ ...coupon, value: (coupon.discount_value / 100).toFixed(2), cap: coupon.maximum_discount_paise ? (coupon.maximum_discount_paise / 100).toFixed(2) : '', minimum: (coupon.minimum_subtotal_paise / 100).toFixed(2), starts_at: localDate(coupon.starts_at), ends_at: localDate(coupon.ends_at), usage_limit: String(coupon.usage_limit || ''), per_customer_limit: String(coupon.per_customer_limit) })
  }
  const field = (key, value) => setDraft(current => ({ ...current, [key]: value }))
  return <section className="cg-panel" aria-label="Coupons and store analytics">
    <div className="co-panel-title"><div><h2>Coupons and store activity</h2><p>Private coupon settings and order activity for this website.</p></div><button className="co-button co-button-primary co-button-small" disabled={readOnly || busy} onClick={() => setDraft({ ...initialDraft })}>Add coupon</button></div>
    {error && <p className="co-message co-message-error" role="alert">{error}</p>}
    <label>Activity period<select value={days} disabled={busy} onChange={event => setDays(event.target.value)}>{['7', '30', '90'].map(value => <option value={value} key={value}>Last {value} days</option>)}</select></label>
    {!data && !error && <p role="status">Loading store activity…</p>}
    {data?.analytics && <><div className="cg-metrics">
      <article><span>Orders placed · last {data.analytics.period_days} days</span><strong>{data.analytics.placed_orders}</strong><small>Order value {formatCommerceMoney(data.analytics.placed_order_value_paise)}</small></article>
      <article><span>Completed COD orders</span><strong>{data.analytics.completed_cod_orders}</strong><small>Completed value {formatCommerceMoney(data.analytics.completed_cod_value_paise)}</small></article>
      <article><span>Customers · last {data.analytics.period_days} days</span><strong>{data.analytics.customers}</strong><small>{data.analytics.cancelled_orders} cancelled orders</small></article>
    </div><p className="cg-note">Order value and completed cash on delivery value do not establish captured or settled funds. Payment settlement tracking is unavailable.</p><AnalyticsDetails analytics={data.analytics} /></>}
    {draft && <form className="co-form cg-form" onSubmit={save}><h3>{draft.id ? 'Edit coupon' : 'New coupon'}</h3><div className="co-form-grid">
      <label>Coupon code<input required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" value={draft.code} onChange={event => field('code', event.target.value.toUpperCase())} /></label>
      <label>Discount type<select value={draft.kind} onChange={event => field('kind', event.target.value)}><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option></select></label>
      <label>{draft.kind === 'fixed' ? 'Discount (₹)' : 'Discount (%)'}<input required inputMode="decimal" value={draft.value} onChange={event => field('value', event.target.value)} /><span className="co-form-note">{draft.kind === 'percentage' ? 'Up to 100%, with at most two decimal places.' : 'Up to ₹10,00,000, with at most two decimal places.'}</span></label>
      <label>Maximum discount (₹, optional)<input inputMode="decimal" value={draft.cap} onChange={event => field('cap', event.target.value)} /></label>
      <label>Minimum product subtotal (₹)<input required inputMode="decimal" value={draft.minimum} onChange={event => field('minimum', event.target.value)} /></label>
      <label>Total order usage limit (optional)<input inputMode="numeric" value={draft.usage_limit} onChange={event => field('usage_limit', event.target.value)} /></label>
      <label>Orders per customer<input required inputMode="numeric" value={draft.per_customer_limit} onChange={event => field('per_customer_limit', event.target.value)} /></label>
      <label>Starts at (your local time, optional)<input type="datetime-local" value={draft.starts_at} onChange={event => field('starts_at', event.target.value)} /></label>
      <label>Ends at (your local time, optional)<input type="datetime-local" value={draft.ends_at} onChange={event => field('ends_at', event.target.value)} /></label>
    </div><label className="co-check-label"><input type="checkbox" checked={draft.active} onChange={event => field('active', event.target.checked)} />Coupon active</label><p className="cg-note">Discounts apply to products, excluding delivery. Placed orders count toward usage limits, including later cancellations.</p><div className="co-inline-actions"><button className="co-button co-button-primary" disabled={readOnly || busy}>Save coupon</button><button className="co-button co-button-outline" type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button></div></form>}
    {data && <div className="co-table-wrap"><table className="co-table"><thead><tr><th>Code</th><th>Discount</th><th>Uses</th><th>Status</th><th>Actions</th></tr></thead><tbody>{(data.coupons || []).map(coupon => <tr key={coupon.id}><td>{coupon.code}</td><td>{coupon.kind === 'fixed' ? formatCommerceMoney(coupon.discount_value) : `${(coupon.discount_value / 100).toFixed(2)}%`}</td><td>{coupon.redemption_count}{coupon.usage_limit ? ` / ${coupon.usage_limit}` : ''}</td><td>{coupon.active ? 'Active' : 'Archived'}</td><td><div className="co-inline-actions"><button className="co-button co-button-outline co-button-small" disabled={readOnly || busy} onClick={() => edit(coupon)}>Edit</button>{coupon.active && <button className="co-button co-button-danger co-button-small" disabled={readOnly || busy} onClick={() => void action('archive_coupon', { id: coupon.id })}>Archive</button>}</div></td></tr>)}</tbody></table>{!data.coupons?.length && <p className="co-table-empty">No coupons yet.</p>}</div>}
    {data?.notification_status && <article className="cg-notifications"><h3>Order notifications</h3><p>{data.notifications_enabled ? 'Delivery configuration is enabled.' : 'Delivery is disabled pending verified provider configuration and separate activation.'}</p><p>Queued: {data.notification_status.pending} · Sent: {data.notification_status.sent} · Failed: {data.notification_status.failed}</p></article>}
  </section>
}
export default CommerceGrowthPanel
