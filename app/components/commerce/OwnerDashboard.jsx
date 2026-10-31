'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'
import { DEFAULT_BRANDING, formatCommerceMoney } from '@/lib/commerce/config'
import { OwnerAccess, slugify, useOwnerSession } from './OwnerSession'

const transitions = { placed: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['completed', 'cancelled'] }
const readable = value => String(value || 'Unknown').replaceAll('_', ' ')
const dateTime = value => value ? new Date(value).toLocaleString('en-IN') : '—'
const permitted = (website, key) => website?.owner_permissions?.[key] === true
const enabled = (website, key) => website?.features?.[key] === true

function amountToPaise(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter a price with no more than two decimal places.')
  const [whole, fraction = ''] = value.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(result) || result > 100000000) throw new Error('Enter a price between ₹0 and ₹10,00,000.')
  return result
}

function Badge({ value }) { return <span className={`co-badge co-badge-${value}`}>{readable(value)}</span> }
function Empty({ children }) { return <p className="co-table-empty">{children}</p> }

function ImageUpload({ label, value, onChange, onUploadingChange, client, websiteId, disabled }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  async function upload(event) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file || uploading) return
    setError('')
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
    if (!extension || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPEG, PNG or WebP image no larger than 5 MB.')
      input.value = ''
      return
    }
    setUploading(true)
    onUploadingChange?.(true)
    try {
      const path = `${websiteId}/${crypto.randomUUID()}.${extension}`
      const bucket = client.storage.from('commerce-media')
      const { error } = await bucket.upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
      if (error) throw new Error('Image upload failed. Check your website permissions or try again.')
      onChange(bucket.getPublicUrl(path).data.publicUrl)
    } catch (requestError) { setError(requestError.message || 'Image upload failed.') }
    finally { input.value = ''; setUploading(false); onUploadingChange?.(false) }
  }
  return <div className="co-upload"><label>{label}<input aria-label={label} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading} onChange={event => void upload(event)} /></label><p>JPEG, PNG or WebP · up to 5 MB. Images are visible to your website visitors.</p>{uploading && <p role="status">Uploading image…</p>}{error && <p className="co-message co-message-error" role="alert">{error}</p>}{value && <Image unoptimized width={480} height={240} className="co-upload-preview" src={value} alt={`${label} preview`} />}</div>
}

function ProductForm({ product, categories, client, websiteId, busy, onSave, onClose }) {
  const [draft, setDraft] = useState({
    name: product?.name || '', slug: product?.slug || '', category_id: product?.category_id || '',
    description: product?.description || '', price: ((product?.price_paise || 0) / 100).toFixed(2),
    image_url: product?.image_url || '', active: product?.active ?? true,
    attributes: JSON.stringify(product?.attributes || {}, null, 2),
  })
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const field = (key, value) => setDraft(current => ({ ...current, [key]: value }))
  async function submit(event) {
    event.preventDefault(); setError('')
    if (uploading) return
    try {
      const attributes = JSON.parse(draft.attributes || '{}')
      if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) throw new Error('Attributes must be a JSON object with simple product details.')
      const saved = await onSave('save_product', {
        ...(product?.id ? { id: product.id } : {}), name: draft.name.trim(), slug: draft.slug,
        category_id: draft.category_id || null, description: draft.description.trim(),
        price_paise: amountToPaise(draft.price), image_url: draft.image_url, active: draft.active, attributes,
      })
      if (saved) onClose()
    } catch (requestError) { setError(requestError.message || 'Check the product details.') }
  }
  return <section className="co-card"><div className="co-panel-title"><div><h2>{product ? 'Edit product' : 'Add a product'}</h2><p>Product changes apply only to this website.</p></div><button className="co-button co-button-outline co-button-small" type="button" disabled={busy || uploading} onClick={onClose}>Close</button></div><form className="co-form" onSubmit={submit}>
    <div className="co-form-grid"><label>Product name<input value={draft.name} onChange={event => field('name', event.target.value)} required maxLength={180} /></label><label>Product slug<input value={draft.slug} onChange={event => field('slug', slugify(event.target.value))} required minLength={2} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><label>Category<select value={draft.category_id} onChange={event => field('category_id', event.target.value)}><option value="">Uncategorized</option>{categories.filter(category => category.active || category.id === draft.category_id).map(category => <option key={category.id} value={category.id}>{category.name}{category.active ? '' : ' (archived)'}</option>)}</select></label><label>Price (₹)<input value={draft.price} onChange={event => field('price', event.target.value)} inputMode="decimal" required pattern="[0-9]+(?:\.[0-9]{1,2})?" /></label><label className="co-span-full">Description<textarea value={draft.description} onChange={event => field('description', event.target.value)} maxLength={3000} /></label><div className="co-span-full"><ImageUpload label="Product image" value={draft.image_url} onChange={value => field('image_url', value)} client={client} websiteId={websiteId} disabled={busy} onUploadingChange={setUploading} /></div><label className="co-span-full">Product attributes<textarea className="co-code-input" value={draft.attributes} onChange={event => field('attributes', event.target.value)} maxLength={12000} spellCheck={false} /><span className="co-form-note">Optional JSON, for example {`{"Fabric":"Cotton","Sizes":["S","M","L"]}`}. Use text, numbers, booleans or lists of text.</span></label></div><label className="co-check-label"><input type="checkbox" checked={draft.active} onChange={event => field('active', event.target.checked)} />Published in your catalog</label><p className="co-form-note">New products start with zero stock. Use Inventory to add available quantities; editing a product never overwrites stock consumed by orders.</p>{error && <p className="co-message co-message-error" role="alert">{error}</p>}<button className="co-button co-button-primary" type="submit" disabled={busy || uploading}>{uploading ? 'Uploading…' : busy ? 'Saving…' : 'Save product'}</button></form></section>
}

function Categories({ categories, busy, readOnly, action }) {
  const [draft, setDraft] = useState(null)
  async function submit(event) {
    event.preventDefault()
    if (await action('save_category', draft)) setDraft(null)
  }
  return <section className="co-card"><div className="co-panel-title"><div><h2>Categories</h2><p>Organize the collections customers see in your store.</p></div><button className="co-button co-button-primary co-button-small" disabled={busy || readOnly} onClick={() => setDraft({ name: '', slug: '', active: true })}>Add category</button></div>{draft && <form className="co-form co-inline-form" onSubmit={submit}><div className="co-form-grid"><label>Category name<input required maxLength={120} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label><label>Category slug<input required minLength={2} maxLength={80} value={draft.slug} onChange={event => setDraft(current => ({ ...current, slug: slugify(event.target.value) }))} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label></div><label className="co-check-label"><input type="checkbox" checked={draft.active} onChange={event => setDraft(current => ({ ...current, active: event.target.checked }))} />Visible in your catalog</label><div className="co-actions"><button type="submit" className="co-button co-button-primary" disabled={busy || readOnly}>Save category</button><button type="button" className="co-button co-button-outline" onClick={() => setDraft(null)}>Cancel</button></div></form>}<div className="co-table-wrap"><table><thead><tr><th>Category</th><th>Status</th><th>Actions</th></tr></thead><tbody>{categories.map(category => <tr key={category.id}><td><strong>{category.name}</strong><small>{category.slug}</small></td><td><Badge value={category.active ? 'active' : 'archived'} /></td><td><div className="co-inline-actions"><button className="co-button co-button-outline co-button-small" disabled={busy || readOnly} onClick={() => setDraft({ id: category.id, name: category.name, slug: category.slug, active: category.active })}>Edit</button>{category.active && <button className="co-button co-button-danger co-button-small" disabled={busy || readOnly} onClick={() => void action('archive_category', { id: category.id })}>Archive</button>}</div></td></tr>)}</tbody></table>{!categories.length && <Empty>No categories yet. Add your first collection to organize products.</Empty>}</div></section>
}

function Inventory({ products, busy, readOnly, action }) {
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    setError('')
    const form = event.currentTarget
    const fields = new FormData(form)
    const delta = Number(fields.get('delta'))
    if (!Number.isInteger(delta) || delta === 0) {
      setError('Enter a non-zero whole number to change inventory.')
      return
    }
    if (await action('adjust_stock', { product_id: String(fields.get('product_id')), delta, reason: String(fields.get('reason') || '').trim() })) form.reset()
  }
  return <section className="co-card"><div className="co-panel-title"><div><h2>Inventory</h2><p>Adjust stock with a positive or negative quantity. Orders consume stock securely on the server.</p></div></div>{products.length ? <><form className="co-form co-inline-form" onSubmit={submit}><div className="co-form-grid"><label>Product<select name="product_id" required disabled={busy || readOnly}>{products.map(product => <option key={product.id} value={product.id}>{product.name}{product.active ? '' : ' (archived)'} · {product.stock_quantity} available</option>)}</select></label><label>Quantity change<input name="delta" required type="number" step="1" min="-1000000" max="1000000" placeholder="For example: 20 or -2" disabled={busy || readOnly} /></label><label className="co-span-full">Reason<input name="reason" maxLength={500} placeholder="New stock received, stock correction…" disabled={busy || readOnly} /></label></div>{error && <p className="co-message co-message-error" role="alert">{error}</p>}<button className="co-button co-button-primary" disabled={busy || readOnly} type="submit">Update inventory</button></form><div className="co-table-wrap"><table><thead><tr><th>Product</th><th>Available stock</th><th>Catalog status</th></tr></thead><tbody>{products.map(product => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.slug}</small></td><td>{product.stock_quantity}</td><td><Badge value={product.active ? 'active' : 'archived'} /></td></tr>)}</tbody></table></div></> : <Empty>Add a product before adjusting inventory.</Empty>}</section>
}

function Orders({ orders, items, busy, readOnly, action }) {
  async function submit(event, order) {
    event.preventDefault()
    const status = String(new FormData(event.currentTarget).get('status'))
    await action('update_order_status', { order_id: order.id, status })
  }
  return <section className="co-card"><div className="co-panel-title"><div><h2>Orders</h2><p>Your most recent 200 orders. Completed COD value is not a payment-provider settlement report.</p></div></div><div className="co-order-grid">{orders.map(order => <article className="co-order" key={order.id}><div className="co-order-heading"><div><strong>Order {order.id.slice(0, 8).toUpperCase()}</strong><small>{dateTime(order.created_at)}</small></div><Badge value={order.status} /></div><div className="co-order-details"><div><strong>{order.customer_details?.name || 'Customer'}</strong><p>{order.customer_details?.phone}</p>{order.customer_details?.address && <p>{order.customer_details.address}</p>}<p>{readable(order.fulfillment_method)} · Cash on delivery / pay at pickup</p></div><div>{items.filter(item => item.order_id === order.id).map(item => <p key={item.id}>{item.quantity} × {item.product_name} · {formatCommerceMoney(item.line_total_paise)}</p>)}<p>Delivery: {formatCommerceMoney(order.delivery_fee_paise)}</p></div></div><div className="co-order-bottom"><strong>{formatCommerceMoney(order.total_paise)}</strong>{transitions[order.status] ? <form className="co-order-action" onSubmit={event => void submit(event, order)}><label className="co-sr-only" htmlFor={`order-status-${order.id}`}>Next status for order {order.id.slice(0, 8)}</label><select id={`order-status-${order.id}`} name="status" disabled={busy || readOnly}>{transitions[order.status].map(status => <option key={status} value={status}>{readable(status)}</option>)}</select><button className="co-button co-button-outline co-button-small" disabled={busy || readOnly} type="submit">Update order</button></form> : <span className="co-form-note">This order is closed.</span>}</div></article>)}{!orders.length && <Empty>Your orders will appear here when customers check out.</Empty>}</div>{orders.some(order => transitions[order.status]) && <p className="co-form-note co-panel-note">Cancelling an order returns tracked items to inventory once. Completed and cancelled orders remain in history.</p>}</section>
}

function Branding({ website, client, busy, readOnly, action }) {
  const [draft, setDraft] = useState({ ...DEFAULT_BRANDING, ...website.branding })
  const [uploadCount, setUploadCount] = useState(0)
  const field = (key, value) => setDraft(current => ({ ...current, [key]: value }))
  async function submit(event) { event.preventDefault(); if (!uploadCount) await action('update_branding', { branding: draft }) }
  return <section className="co-card"><div className="co-panel-title"><div><h2>Website branding</h2><p>Customize the settings your platform administrator has enabled.</p></div></div><form className="co-form" onSubmit={submit}><div className="co-form-grid">{[['primary_color', 'Primary color'], ['background_color', 'Background color'], ['text_color', 'Text color']].map(([key, label]) => <label className="co-color-field" key={key}>{label}<span><input aria-label={label} type="color" value={draft[key].length === 7 ? draft[key] : DEFAULT_BRANDING[key]} onChange={event => field(key, event.target.value)} disabled={busy || readOnly} /><code>{draft[key]}</code></span></label>)}<label className="co-span-full">Headline<input maxLength={200} value={draft.headline} onChange={event => field('headline', event.target.value)} disabled={busy || readOnly} /></label><label className="co-span-full">Store description<textarea maxLength={2000} value={draft.description} onChange={event => field('description', event.target.value)} disabled={busy || readOnly} /></label><label>Contact email<input type="email" maxLength={254} value={draft.contact_email} onChange={event => field('contact_email', event.target.value)} disabled={busy || readOnly} /></label><label>Contact phone<input type="tel" maxLength={30} value={draft.contact_phone} onChange={event => field('contact_phone', event.target.value)} disabled={busy || readOnly} /></label><ImageUpload label="Website logo" value={draft.logo_url} onChange={value => field('logo_url', value)} client={client} websiteId={website.id} disabled={busy || readOnly} onUploadingChange={value => setUploadCount(count => count + (value ? 1 : -1))} /><ImageUpload label="Website banner" value={draft.banner_url} onChange={value => field('banner_url', value)} client={client} websiteId={website.id} disabled={busy || readOnly} onUploadingChange={value => setUploadCount(count => count + (value ? 1 : -1))} /></div><button className="co-button co-button-primary" disabled={busy || readOnly || uploadCount > 0} type="submit">Save branding</button></form></section>
}

function ApplicationList({ applications }) {
  return <section className="co-card"><div className="co-panel-title"><div><h2>Your applications</h2><p>Follow each request from review to website setup.</p></div><Link className="co-button co-button-outline co-button-small" href="/commerce/apply">New application</Link></div><div className="co-applications">{applications.map(application => <article className="co-application-item" key={application.id}><div><strong>{application.business_name}</strong><Badge value={application.status} /></div><p>Preferred store: /shops/{application.preferred_slug} · Submitted {dateTime(application.created_at)}</p>{application.review_note && <p><strong>Review note:</strong> {application.review_note}</p>}{application.status === 'approved' && <p>{application.website_id ? 'Your website has been assigned. Select it from your workspace to continue setup.' : 'Approved. The platform team will assign and configure your website next.'}</p>}</article>)}{!applications.length && <Empty>You have not submitted an application yet. Tell us about your business to get started.</Empty>}</div></section>
}

function Workspace({ state }) {
  const router = useRouter()
  const { client, session } = state
  const [websites, setWebsites] = useState([])
  const [applications, setApplications] = useState([])
  const [websiteId, setWebsiteId] = useState('')
  const [workspace, setWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [section, setSection] = useState('overview')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState(null)
  const requestInFlight = useRef(false)
  const workspaceLoading = Boolean(websiteId && workspace?.website?.id !== websiteId && workspace?.failedWebsiteId !== websiteId)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const [stores, requests] = await Promise.all([
          commerceFetch('/api/commerce/workspace', { client, signal: controller.signal }),
          commerceFetch('/api/commerce/applications', { client, signal: controller.signal }),
        ])
        if (controller.signal.aborted) return
        setWebsites(stores.websites || []); setApplications(requests.applications || [])
        setWebsiteId(stores.websites?.[0]?.id || '')
      } catch (requestError) { if (!controller.signal.aborted) setError(requestError.message) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [client])

  useEffect(() => {
    if (!websiteId) return
    const controller = new AbortController()
    async function load() {
      try {
        const result = await commerceFetch(`/api/commerce/workspace/${websiteId}`, { client, signal: controller.signal })
        if (!controller.signal.aborted) setWorkspace(result)
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError.message)
          setWorkspace({ failedWebsiteId: websiteId })
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [client, websiteId])

  async function refresh() {
    if (requestInFlight.current) return
    requestInFlight.current = true
    setBusy(true); setError(''); setNotice('')
    try {
      const [stores, requests] = await Promise.all([commerceFetch('/api/commerce/workspace', { client }), commerceFetch('/api/commerce/applications', { client })])
      setWebsites(stores.websites || []); setApplications(requests.applications || [])
      const selected = stores.websites?.some(website => website.id === websiteId) ? websiteId : stores.websites?.[0]?.id || ''
      setWebsiteId(selected)
      if (!selected) setWorkspace(null)
      else if (selected === websiteId) setWorkspace(await commerceFetch(`/api/commerce/workspace/${selected}`, { client }))
    } catch (requestError) { setError(requestError.message || 'Unable to refresh your workspace.') }
    finally { requestInFlight.current = false; setBusy(false) }
  }

  async function action(name, payload) {
    if (requestInFlight.current || !websiteId) return false
    requestInFlight.current = true
    setBusy(true); setError(''); setNotice('')
    try {
      await commerceFetch(`/api/commerce/workspace/${websiteId}`, { client, method: 'POST', body: { action: name, payload } })
      const result = await commerceFetch(`/api/commerce/workspace/${websiteId}`, { client })
      setWorkspace(result)
      setWebsites(current => current.map(website => website.id === result.website.id ? result.website : website))
      setNotice('Your changes have been saved for this website.')
      return true
    } catch (requestError) {
      setWorkspace({ failedWebsiteId: websiteId })
      setError(`${requestError.message || 'Unable to save changes.'} Refresh to check the current state.`)
      return false
    }
    finally { requestInFlight.current = false; setBusy(false) }
  }

  async function signOut() {
    if (requestInFlight.current) return
    requestInFlight.current = true
    setBusy(true)
    try {
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (error) throw error
      router.push('/commerce/auth')
    } catch {
      requestInFlight.current = false
      setError('Unable to sign out. Please try again.')
      setBusy(false)
    }
  }

  const website = workspace?.website?.id === websiteId ? workspace.website : null
  const readOnly = !website || !['setup', 'active'].includes(website.status)
  const products = workspace?.products || []
  const categories = workspace?.categories || []
  const orders = workspace?.orders || []
  const customers = workspace?.customers || []
  const menu = website ? [
    ['overview', 'Overview', true], ['products', 'Products', enabled(website, 'catalog') && permitted(website, 'products')],
    ['categories', 'Categories', enabled(website, 'catalog') && permitted(website, 'categories')],
    ['inventory', 'Inventory', enabled(website, 'inventory') && permitted(website, 'inventory')],
    ['orders', 'Orders', permitted(website, 'orders')], ['customers', 'Customers', permitted(website, 'customers')],
    ['branding', 'Branding', permitted(website, 'branding')], ['settings', 'Store & subscription', true],
    ['applications', 'My applications', true],
  ].filter(([, , visible]) => visible) : []
  const visibleSection = menu.some(([key]) => key === section) ? section : 'overview'

  return <main className="co-main"><div className="co-page-heading co-workspace-heading"><div><span className="co-eyebrow">Your business, in one place</span><h1>Owner workspace</h1><p>Manage the stores assigned to {session.user.email}.</p></div><div className="co-workspace-tools">{!!websites.length && <label className="co-sr-only" htmlFor="co-website-selector">Select website</label>}{!!websites.length && <select id="co-website-selector" value={websiteId} disabled={busy || workspaceLoading} onChange={event => { setWebsiteId(event.target.value); setWorkspace(null); setEditor(null); setSection('overview'); setError(''); setNotice('') }}>{websites.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select>}<button type="button" className="co-button co-button-outline co-button-small" disabled={busy || loading || workspaceLoading} onClick={() => void refresh()}>{busy ? 'Working…' : 'Refresh'}</button><button type="button" className="co-button co-button-outline co-button-small" disabled={busy} onClick={() => void signOut()}>Sign out</button></div></div>
    {error && <p className="co-message co-message-error co-workspace-message" role="alert">{error}</p>}{notice && <p className="co-message co-message-success co-workspace-message" role="status">{notice}</p>}
    {loading ? <div className="co-loading" role="status"><span className="co-spinner" />Loading your websites…</div> : !websites.length ? <><section className="co-card co-empty"><span className="co-empty-icon" aria-hidden="true">✦</span><h2>Your website journey starts here.</h2><p>Once your application is approved and a website is assigned, your store will appear in this workspace.</p><Link className="co-button co-button-primary" href="/commerce/apply">Apply for a website →</Link></section><ApplicationList applications={applications} /></> : <div className="co-workspace-grid"><aside className="co-sidebar"><p className="co-sidebar-title">YOUR WORKSPACE</p><nav aria-label="Owner workspace sections">{menu.map(([key, label]) => <button key={key} type="button" aria-current={visibleSection === key ? 'page' : undefined} disabled={busy || workspaceLoading} onClick={() => { setSection(key); setEditor(null) }}>{label}<span aria-hidden="true">{visibleSection === key ? '●' : '›'}</span></button>)}</nav><p className="co-sidebar-footer">Website permissions and activation are managed by your platform administrator.</p></aside><div className="co-workspace-content">
      {workspaceLoading ? <div className="co-loading" role="status"><span className="co-spinner" />Opening your store…</div> : website ? <>
        {readOnly && <p className="co-message co-message-info">This website is {readable(website.status)}. You can view your permitted records; changes are paused. Contact the platform team for assistance.</p>}
        {visibleSection === 'overview' && <><div className="co-store-heading"><div><span className="co-eyebrow">YOUR WEBSITE</span><h2>{website.name}</h2><p>/shops/{website.slug}</p></div><div className="co-actions"><Badge value={website.status} />{website.status === 'active' && <Link className="co-button co-button-outline co-button-small" target="_blank" rel="noopener noreferrer" href={`/shops/${website.slug}`}>View storefront ↗</Link>}</div></div><div className="co-metrics"><div className="co-metric"><span>Active products</span><strong>{products.filter(product => product.active).length}</strong><small>Within your permitted catalog</small></div><div className="co-metric"><span>Recent orders</span><strong>{orders.length}</strong><small>Most recent 200 orders</small></div><div className="co-metric"><span>Completed COD value</span><strong>{formatCommerceMoney(orders.filter(order => order.status === 'completed').reduce((sum, order) => sum + Number(order.total_paise || 0), 0))}</strong><small>Order value, not settlement balance</small></div></div><section className="co-card"><div className="co-panel-title"><div><h2>A store that feels like you.</h2><p>Build your collection, check stock and keep customers informed as orders progress.</p></div></div><div className="co-two-grid">{menu.filter(([key]) => ['products', 'orders', 'branding', 'inventory'].includes(key)).map(([key, label]) => <button className="co-workspace-shortcut" key={key} onClick={() => setSection(key)}><strong>{label}</strong><span>Open {label.toLowerCase()} →</span></button>)}</div></section></>}
        {visibleSection === 'products' && <>{editor && <ProductForm key={`${website.id}:${editor.id || 'new'}`} product={editor.id ? editor : null} categories={categories} client={client} websiteId={website.id} busy={busy || readOnly} onSave={action} onClose={() => setEditor(null)} />}<section className="co-card"><div className="co-panel-title"><div><h2>Your products</h2><p>Prices are in INR. Archive products to keep existing order history intact.</p></div><button className="co-button co-button-primary co-button-small" disabled={busy || readOnly} onClick={() => setEditor({})}>Add product</button></div><div className="co-table-wrap"><table><thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>{products.map(product => <tr key={product.id}><td><div className="co-product-cell">{product.image_url ? <Image unoptimized width={42} height={48} className="co-product-thumb" src={product.image_url} alt="" /> : <span className="co-product-thumb" aria-hidden="true">◒</span>}<div><strong>{product.name}</strong><small>{product.slug}</small></div></div></td><td>{formatCommerceMoney(product.price_paise)}</td><td>{product.stock_quantity}</td><td><Badge value={product.active ? 'active' : 'archived'} /></td><td><div className="co-inline-actions"><button className="co-button co-button-outline co-button-small" disabled={busy || readOnly} onClick={() => setEditor(product)}>Edit</button>{product.active && <button className="co-button co-button-danger co-button-small" disabled={busy || readOnly} onClick={() => void action('archive_product', { id: product.id })}>Archive</button>}</div></td></tr>)}</tbody></table>{!products.length && <Empty>No products yet. Add your first product and then set its stock in Inventory.</Empty>}</div></section></>}
        {visibleSection === 'categories' && <Categories categories={categories} busy={busy} readOnly={readOnly} action={action} />}
        {visibleSection === 'inventory' && <Inventory products={products} busy={busy} readOnly={readOnly} action={action} />}
        {visibleSection === 'orders' && <Orders orders={orders} items={workspace.order_items || []} busy={busy} readOnly={readOnly} action={action} />}
        {visibleSection === 'customers' && <section className="co-card"><div className="co-panel-title"><div><h2>Customers</h2><p>Customers who have placed orders with this website. Keep their contact details private.</p></div></div><div className="co-table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Address</th><th>First order account</th></tr></thead><tbody>{customers.map(customer => <tr key={customer.user_id}><td><strong>{customer.name}</strong></td><td>{customer.phone}</td><td>{customer.address || '—'}</td><td>{dateTime(customer.created_at)}</td></tr>)}</tbody></table>{!customers.length && <Empty>No customer records yet.</Empty>}</div></section>}
        {visibleSection === 'branding' && <Branding key={`${website.id}:${website.updated_at || ''}`} website={website} client={client} busy={busy} readOnly={readOnly} action={action} />}
        {visibleSection === 'settings' && <section className="co-card"><div className="co-panel-title"><div><h2>Store & subscription</h2><p>These settings are configured by the platform team. Contact support to request changes.</p></div></div><dl className="co-detail-list">{[['Website', website.name], ['Preview path', `/shops/${website.slug}`], ['Business category', readable(website.business_type)], ['Website status', readable(website.status)], ['Template', 'General storefront'], ['Pickup', website.fulfillment?.pickup ? 'Available' : 'Not available'], ['Local delivery', website.fulfillment?.delivery ? 'Available' : 'Not available'], ['Delivery fee', formatCommerceMoney(website.fulfillment?.delivery_fee_paise)], ['Minimum order', formatCommerceMoney(website.fulfillment?.minimum_order_paise)], ['Pickup address', website.fulfillment?.pickup_address || 'Not configured'], ['COD / pay at pickup', enabled(website, 'cod') ? 'Enabled' : 'Disabled'], ['Plan', website.subscription_plan || 'Not configured'], ['Subscription status', readable(website.subscription_status)], ['Configured monthly charge', formatCommerceMoney(website.monthly_price_paise)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="co-form-note co-panel-note">Billing is managed by the platform team. No automatic charge is made from this workspace. Online payment processing is not enabled.</p><a className="co-text-link" href="mailto:digitaldining077@gmail.com">Request a configuration change →</a></section>}
        {visibleSection === 'applications' && <ApplicationList applications={applications} />}
      </> : !workspaceLoading && <section className="co-card co-empty"><h2>This workspace could not be opened.</h2><p>Refresh your account to check current access. Your website administrator may have updated the assignment.</p><button className="co-button co-button-primary" disabled={busy} onClick={() => void refresh()}>Refresh workspace</button></section>}
    </div></div>}
  </main>
}

export default function OwnerDashboard() {
  const state = useOwnerSession()
  return <OwnerAccess state={state}><Workspace key={state.session?.user.id || 'signed-out'} state={state} /></OwnerAccess>
}
