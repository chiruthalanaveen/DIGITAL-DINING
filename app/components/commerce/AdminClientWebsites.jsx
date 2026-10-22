'use client'

import { useEffect, useRef, useState } from 'react'
import { BUSINESS_TYPES, DEFAULT_BRANDING, DEFAULT_FEATURES, DEFAULT_FULFILLMENT, DEFAULT_OWNER_PERMISSIONS, formatCommerceMoney } from '@/lib/commerce/config'
import './admin-commerce.css'

const FEATURE_LABELS = { catalog: 'Public catalog', inventory: 'Inventory controls', cod: 'Cash on delivery / pickup' }
const PERMISSION_LABELS = { products: 'Products', categories: 'Categories', inventory: 'Inventory', orders: 'Orders', branding: 'Branding', customers: 'Customers' }
const EMPTY_DATA = { websites: [], applications: [], memberships: [], audit_logs: [] }

function freshDraft(website = {}, ownerId = '') {
  return {
    name: website.name || '', slug: website.slug || '', business_type: website.business_type || 'general',
    owner_user_id: ownerId, application_id: '', template: 'general', status: website.status || 'setup',
    branding: { ...DEFAULT_BRANDING, ...website.branding },
    features: { ...DEFAULT_FEATURES, ...website.features },
    owner_permissions: { ...DEFAULT_OWNER_PERMISSIONS, ...website.owner_permissions },
    fulfillment: { ...DEFAULT_FULFILLMENT, ...website.fulfillment },
    subscription_plan: website.subscription_plan || 'basic', subscription_status: website.subscription_status || 'trial',
    monthly_price: String(Number(website.monthly_price_paise || 0) / 100),
    delivery_fee: String(Number(website.fulfillment?.delivery_fee_paise || 0) / 100),
    minimum_order: String(Number(website.fulfillment?.minimum_order_paise || 0) / 100),
  }
}

function paise(value, label) {
  const text = String(value).trim()
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(text)) throw new Error(`${label} must be a non-negative amount with up to two decimal places.`)
  const [whole, fraction = ''] = text.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

function draftPayload(draft) {
  return {
    name: draft.name.trim(), slug: draft.slug.trim().toLowerCase(), business_type: draft.business_type,
    template: 'general', status: draft.status, branding: draft.branding, features: draft.features,
    owner_permissions: draft.owner_permissions,
    fulfillment: { ...draft.fulfillment, delivery_fee_paise: paise(draft.delivery_fee, 'Delivery fee'), minimum_order_paise: paise(draft.minimum_order, 'Minimum order') },
    subscription_plan: draft.subscription_plan.trim(), subscription_status: draft.subscription_status,
    monthly_price_paise: paise(draft.monthly_price, 'Monthly plan price'),
  }
}

async function adminRequest(options = {}) {
  const response = await fetch('/api/commerce/admin', { credentials: 'same-origin', cache: 'no-store', ...options })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.success) {
    const error = new Error(result.message || 'Unable to load client websites.')
    error.status = response.status
    throw error
  }
  return result
}

const money = formatCommerceMoney
const words = value => String(value || '').replaceAll('_', ' ')
const date = value => value ? new Date(value).toLocaleString('en-IN') : '—'

function Field({ label, children, help }) {
  return <label className="ac-field"><span>{label}</span>{children}{help && <small>{help}</small>}</label>
}

function Status({ value }) {
  return <span className={`ac-status ac-status-${value || 'setup'}`}>{words(value || 'setup')}</span>
}

export default function AdminClientWebsites() {
  const [data, setData] = useState(EMPTY_DATA)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('websites')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(() => freshDraft())
  const [view, setView] = useState(null)
  const [reviewNotes, setReviewNotes] = useState({})
  const pending = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    adminRequest({ signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) { setData({ ...EMPTY_DATA, ...result }); setLoaded(true) }
    }).catch(requestError => {
      if (!controller.signal.aborted) setError(requestError.message)
    }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [])

  async function refresh() {
    if (pending.current || busy) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try { setData({ ...EMPTY_DATA, ...await adminRequest() }); setLoaded(true) }
    catch (requestError) { setError(requestError.message) }
    finally { pending.current = false; setBusy(false) }
  }

  async function act(action, payload, message) {
    if (pending.current || busy || !loaded) return null
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const result = await adminRequest({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) })
      if (action === 'open_management_view') {
        setView(result)
      } else {
        const next = { ...EMPTY_DATA, ...await adminRequest() }
        setData(next)
        if (selectedId) {
          const saved = next.websites.find(website => website.id === selectedId)
          if (saved) setDraft(freshDraft(saved, next.memberships.find(member => member.website_id === selectedId && member.role === 'owner' && member.active)?.user_id || ''))
        }
        setView(null)
      }
      setNotice(message || 'Change saved.')
      return result
    } catch (requestError) {
      setError(`${requestError.message} Refresh before retrying if the request may have been saved.`)
      return null
    } finally { pending.current = false; setBusy(false) }
  }

  function update(key, value) { setDraft(current => ({ ...current, [key]: value })) }
  function nested(group, key, value) { setDraft(current => ({ ...current, [group]: { ...current[group], [key]: value } })) }

  function startCreate(application) {
    const next = freshDraft()
    if (application) {
      Object.assign(next, {
        name: application.business_name || '', slug: application.preferred_slug || '', business_type: application.business_type || 'general',
        owner_user_id: application.applicant_user_id || '', application_id: application.id,
        fulfillment: { ...next.fulfillment, ...application.fulfillment, pickup_address: application.address || '' },
        branding: { ...next.branding, description: application.description || '', contact_email: application.email || '', contact_phone: application.phone || '' },
      })
    }
    setDraft(next); setCreating(true); setSelectedId(''); setView(null); setTab('websites'); setError(''); setNotice('')
  }

  async function openWebsite(website) {
    if (busy) return
    const owner = data.memberships.find(member => member.website_id === website.id && member.role === 'owner' && member.active)
    setSelectedId(website.id); setDraft(freshDraft(website, owner?.user_id || '')); setCreating(false); setView(null)
    await act('open_management_view', { website_id: website.id }, 'Management view opened and recorded in the audit history.')
  }

  async function saveWebsite(event) {
    event.preventDefault()
    let payload
    try { payload = draftPayload(draft) }
    catch (validationError) { setError(validationError.message); return }
    if (creating) {
      payload.owner_user_id = draft.owner_user_id.trim() || undefined
      if (draft.application_id) payload.application_id = draft.application_id
      const result = await act('create_website', payload, 'Client website created. Review its catalog and settings before activation.')
      if (result) { setCreating(false); setSelectedId(''); setDraft(freshDraft()) }
    } else await act('save_website', { ...payload, id: selectedId }, 'Website configuration saved for this client only.')
  }

  const websites = data.websites || []
  const applications = data.applications || []
  const filtered = websites.filter(website => `${website.name} ${website.slug} ${website.business_type}`.toLowerCase().includes(search.toLowerCase()))
  const selected = websites.find(website => website.id === selectedId)
  const pendingApplications = applications.filter(application => ['submitted', 'under_review'].includes(application.status))

  return (
    <div className="admin-commerce" aria-busy={busy}>
      <div className="ac-heading">
        <div><p className="ac-eyebrow">Digital Dine-In / Client Websites</p><h1>E-Commerce Website Management</h1><p className="ac-muted">Independent storefronts. One secure control center.</p></div>
        <div className="ac-actions"><button type="button" className="ac-button ac-secondary" onClick={refresh} disabled={busy}>Refresh</button><button type="button" className="ac-button" onClick={() => startCreate()} disabled={busy || !loaded}>+ Create website</button></div>
      </div>
      {error && <div className="ac-feedback ac-error" role="alert">{error}</div>}
      {notice && <div className="ac-feedback ac-success" role="status">{notice}</div>}
      {!loaded && busy && <p className="ac-loading" role="status">Loading client websites…</p>}
      <div className="ac-metrics">
        {[['Client websites', websites.length], ['Active storefronts', websites.filter(website => website.status === 'active').length], ['Awaiting review', pendingApplications.length], ['In setup', websites.filter(website => website.status === 'setup').length]].map(([label, value]) => <div className="ac-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      <div className="ac-tabs" role="tablist" aria-label="Website management sections">
        {[['websites', 'Client websites'], ['applications', 'Owner applications'], ['audit', 'Audit history']].map(([key, title]) => <button type="button" key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{title}</button>)}
      </div>

      {tab === 'websites' && <>
        <div className="ac-list-toolbar"><label className="ac-search"><span>Search websites</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name, slug or business type" /></label><span className="ac-muted">{filtered.length} website{filtered.length === 1 ? '' : 's'}</span></div>
        {!filtered.length && loaded && <div className="ac-empty"><span aria-hidden="true">◇</span><h2>Your next client starts here</h2><p>Create a website or approve an owner application to begin.</p></div>}
        <div className="ac-websites">{filtered.map(website => <article className={`ac-website ${selectedId === website.id ? 'ac-selected' : ''}`} key={website.id}>
          <div className="ac-website-top"><span className="ac-store-mark" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(website.branding?.primary_color || '') ? website.branding.primary_color : '#166f57' }}>{website.name?.slice(0, 1).toUpperCase() || 'W'}</span><Status value={website.status} /></div>
          <p className="ac-eyebrow">{words(website.business_type)}</p><h2>{website.name}</h2><p className="ac-store-path">/shops/{website.slug}</p>
          <div className="ac-website-meta"><span>{words(website.subscription_plan || 'basic')} plan</span><span>{money(website.monthly_price_paise)} / month</span></div>
          <div className="ac-actions"><button type="button" className="ac-button ac-secondary" disabled={busy} onClick={() => void openWebsite(website)}>Manage website</button>{website.status === 'active' && <a className="ac-text-link" href={`/shops/${encodeURIComponent(website.slug)}`} target="_blank" rel="noreferrer">Open storefront ↗</a>}</div>
        </article>)}</div>

        {(creating || selected) && <section className="ac-editor" aria-labelledby="ac-editor-title">
          <div className="ac-panel-heading"><div><p className="ac-eyebrow">{creating ? 'New client website' : 'Client configuration'}</p><h2 id="ac-editor-title">{creating ? 'Build a new storefront' : selected.name}</h2></div><button type="button" className="ac-button ac-secondary" disabled={busy} onClick={() => { setCreating(false); setSelectedId(''); setView(null) }}>Close</button></div>
          {selected && <div className="ac-management-note"><strong>Audited administration</strong><span>You are viewing this client as Super Admin. This does not create or impersonate an owner session.</span></div>}
          {view?.report && <div className="ac-metrics ac-report">{[['Orders', view.report.order_count], ['Completed COD sales', money(view.report.sales_paise)], ['Customers', view.report.customer_count], ['Products', view.report.product_count]].map(([title, value]) => <div className="ac-metric" key={title}><span>{title}</span><strong>{value ?? 0}</strong></div>)}</div>}
          <form onSubmit={saveWebsite}>
            <fieldset disabled={busy}>
              <legend>Website identity</legend><div className="ac-form-grid">
                <Field label="Website name"><input required maxLength={120} value={draft.name} onChange={event => update('name', event.target.value)} /></Field>
                <Field label="Unique website slug" help="3–48 lowercase letters, numbers and hyphens. No DNS configuration is changed."><input required pattern="[a-z0-9][a-z0-9\-]{1,46}[a-z0-9]" maxLength={48} value={draft.slug} onChange={event => update('slug', event.target.value.toLowerCase())} /></Field>
                <Field label="Business type"><select value={draft.business_type} onChange={event => update('business_type', event.target.value)}>{BUSINESS_TYPES.map(([type, title]) => <option key={type} value={type}>{title}</option>)}</select></Field>
                <Field label="Website template" help="The shared retail template is available in Phase 1. Industry-specific layouts are a later phase."><select value="general" disabled><option value="general">General retail</option></select></Field>
                <Field label="Website status"><select value={draft.status} onChange={event => update('status', event.target.value)}><option value="setup">Website setup</option><option value="active" disabled={draft.business_type === 'pharmacy'}>Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></Field>
                <Field label="Verified owner Auth user ID" help={creating ? 'Use the verified applicant account, or leave blank to assign an owner during setup.' : 'Owner reassignment is saved separately and audited.'}><input value={draft.owner_user_id} onChange={event => update('owner_user_id', event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></Field>
              </div>
              {!creating && <button type="button" className="ac-button ac-secondary" disabled={!draft.owner_user_id.trim()} onClick={() => void act('assign_owner', { website_id: selectedId, user_id: draft.owner_user_id.trim() }, 'Verified owner assigned and membership change audited.')}>Assign verified owner</button>}
              {draft.business_type === 'pharmacy' && <p className="ac-warning">Pharmacy activation and prescription sales are blocked. Licensing and regulatory review are required before a later production release.</p>}
            </fieldset>

            <fieldset disabled={busy}><legend>Branding</legend><div className="ac-form-grid">
              {[['primary_color', 'Primary color'], ['background_color', 'Background color'], ['text_color', 'Text color']].map(([key, title]) => <Field key={key} label={title}><input type="color" value={/^#[0-9a-f]{6}$/i.test(draft.branding[key] || '') ? draft.branding[key] : '#166f57'} onChange={event => nested('branding', key, event.target.value)} /></Field>)}
              <Field label="Storefront headline"><input maxLength={160} value={draft.branding.headline} onChange={event => nested('branding', 'headline', event.target.value)} /></Field>
              <Field label="Logo URL"><input type="url" value={draft.branding.logo_url} onChange={event => nested('branding', 'logo_url', event.target.value)} placeholder="https://…" /></Field>
              <Field label="Banner URL"><input type="url" value={draft.branding.banner_url} onChange={event => nested('branding', 'banner_url', event.target.value)} placeholder="https://…" /></Field>
              <Field label="Contact email"><input type="email" value={draft.branding.contact_email} onChange={event => nested('branding', 'contact_email', event.target.value)} /></Field>
              <Field label="Contact phone"><input maxLength={30} value={draft.branding.contact_phone} onChange={event => nested('branding', 'contact_phone', event.target.value)} /></Field>
            </div><Field label="Store description"><textarea maxLength={2000} rows={3} value={draft.branding.description} onChange={event => nested('branding', 'description', event.target.value)} /></Field></fieldset>

            <div className="ac-settings-columns"><fieldset disabled={busy}><legend>Enabled features</legend>{Object.entries(FEATURE_LABELS).map(([key, title]) => <label className="ac-checkbox" key={key}><input type="checkbox" checked={Boolean(draft.features[key])} onChange={event => nested('features', key, event.target.checked)} /><span>{title}</span></label>)}<p className="ac-muted">Online payment collection is not enabled in this phase.</p></fieldset>
              <fieldset disabled={busy}><legend>Owner permissions</legend>{Object.entries(PERMISSION_LABELS).map(([key, title]) => <label className="ac-checkbox" key={key}><input type="checkbox" checked={Boolean(draft.owner_permissions[key])} onChange={event => nested('owner_permissions', key, event.target.checked)} /><span>Manage {title.toLowerCase()}</span></label>)}</fieldset></div>

            <fieldset disabled={busy}><legend>Delivery and pickup</legend><div className="ac-inline-options">{[['pickup', 'Pickup'], ['delivery', 'Local delivery']].map(([key, title]) => <label className="ac-checkbox" key={key}><input type="checkbox" checked={Boolean(draft.fulfillment[key])} onChange={event => nested('fulfillment', key, event.target.checked)} /><span>{title}</span></label>)}</div><div className="ac-form-grid">
              <Field label="Delivery fee (₹)"><input inputMode="decimal" value={draft.delivery_fee} onChange={event => update('delivery_fee', event.target.value)} /></Field>
              <Field label="Minimum order (₹)"><input inputMode="decimal" value={draft.minimum_order} onChange={event => update('minimum_order', event.target.value)} /></Field>
            </div><Field label="Pickup address"><textarea rows={2} maxLength={1000} value={draft.fulfillment.pickup_address} onChange={event => nested('fulfillment', 'pickup_address', event.target.value)} /></Field><p className="ac-muted">Shipping-provider integrations and geographic delivery boundaries are planned separately.</p></fieldset>

            <fieldset disabled={busy}><legend>Subscription configuration</legend><div className="ac-form-grid">
              <Field label="Plan name"><input maxLength={60} value={draft.subscription_plan} onChange={event => update('subscription_plan', event.target.value)} /></Field>
              <Field label="Subscription status"><select value={draft.subscription_status} onChange={event => update('subscription_status', event.target.value)}>{['trial', 'active', 'past_due', 'cancelled'].map(status => <option key={status} value={status}>{words(status)}</option>)}</select></Field>
              <Field label="Monthly plan price (₹)"><input inputMode="decimal" value={draft.monthly_price} onChange={event => update('monthly_price', event.target.value)} /></Field>
            </div><p className="ac-muted">This records the service agreement only. It does not create recurring charges, debit wallets or collect funds.</p></fieldset>
            <div className="ac-editor-footer"><span className="ac-muted">Changes affect this client website only.</span><button type="submit" className="ac-button" disabled={busy}>{busy ? 'Saving…' : creating ? 'Create client website' : 'Save website configuration'}</button></div>
          </form>
          {view?.orders && <div className="ac-order-summary"><h3>Recent orders</h3>{!view.orders.length ? <p className="ac-muted">No orders for this website yet.</p> : <div className="ac-table-wrap"><table><thead><tr><th>Order</th><th>Created</th><th>Status</th><th>Total</th></tr></thead><tbody>{view.orders.slice(0, 20).map(order => <tr key={order.id}><td>{order.id.slice(0, 8)}</td><td>{date(order.created_at)}</td><td><Status value={order.status} /></td><td>{money(order.total_paise)}</td></tr>)}</tbody></table></div>}</div>}
        </section>}
      </>}

      {tab === 'applications' && <div className="ac-applications">{!applications.length ? <div className="ac-empty"><h2>No owner applications yet</h2><p>Owners can register and submit requirements at <a href="/commerce">/commerce</a>.</p></div> : applications.map(application => <article className="ac-application" key={application.id}>
        <div className="ac-panel-heading"><div><p className="ac-eyebrow">{words(application.business_type)}</p><h2>{application.business_name}</h2><p className="ac-muted">{application.owner_name} · {application.email}</p></div><Status value={application.status} /></div>
        <dl className="ac-details"><div><dt>Preferred website</dt><dd>/shops/{application.preferred_slug}</dd></div><div><dt>Phone</dt><dd>{application.phone}</dd></div><div><dt>Business address</dt><dd>{application.address}</dd></div><div><dt>Submitted</dt><dd>{date(application.created_at)}</dd></div><div><dt>Verified applicant ID</dt><dd className="ac-id">{application.applicant_user_id}</dd></div></dl>
        {application.description && <p>{application.description}</p>}
        <div className="ac-requirements"><p><strong>Features:</strong> {(application.required_features || []).join(', ') || 'None specified'}</p><p><strong>Categories:</strong> {(application.product_categories || []).join(', ') || 'None specified'}</p><p><strong>Branding:</strong> {application.branding_preferences || 'None specified'}</p><p><strong>Payments:</strong> {application.payment_requirements || 'None specified'}</p></div>
        {application.review_note && <p className="ac-muted">Saved review: {application.review_note}</p>}
        <Field label={`Review note for ${application.business_name}`}><textarea rows={2} maxLength={2000} value={reviewNotes[application.id] ?? application.review_note ?? ''} onChange={event => setReviewNotes(current => ({ ...current, [application.id]: event.target.value }))} /></Field>
        <div className="ac-actions">{['under_review', 'approved', 'rejected'].map(status => <button type="button" className={`ac-button ${status === 'approved' ? '' : 'ac-secondary'}`} key={status} disabled={busy || application.status === status || Boolean(application.website_id)} onClick={() => void act('review_application', { application_id: application.id, status, review_note: reviewNotes[application.id] ?? application.review_note ?? '' }, `Application marked ${words(status)}.`)}>{status === 'under_review' ? 'Start review' : status === 'approved' ? 'Approve application' : 'Reject application'}</button>)}{application.status === 'approved' && !application.website_id && <button type="button" className="ac-button ac-secondary" disabled={busy} onClick={() => startCreate(application)}>Set up website →</button>}{application.website_id && <span className="ac-muted">Website setup created.</span>}</div>
      </article>)}</div>}

      {tab === 'audit' && <section className="ac-audit"><div className="ac-panel-heading"><div><h2>Administrative audit history</h2><p className="ac-muted">Website changes and management views are recorded with the acting administrator.</p></div></div>{!data.audit_logs?.length ? <p className="ac-muted">No commerce audit events yet.</p> : <div className="ac-table-wrap"><table><thead><tr><th>Action</th><th>Website</th><th>Actor</th><th>Time</th></tr></thead><tbody>{data.audit_logs.map(event => <tr key={event.id}><td>{words(event.action)}</td><td>{websites.find(website => website.id === event.website_id)?.name || event.website_id?.slice(0, 8) || 'Application'}</td><td>{event.actor_email || event.actor_user_id || 'System'}</td><td>{date(event.created_at)}</td></tr>)}</tbody></table></div>}</section>}
    </div>
  )
}
