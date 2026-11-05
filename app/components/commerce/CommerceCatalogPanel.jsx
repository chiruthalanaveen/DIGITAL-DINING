'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'
import { formatCommerceMoney } from '@/lib/commerce/config'
import './commerce-expansion-owner.css'

const SECTION_TYPES = ['hero', 'categories', 'featured_products', 'banner', 'text', 'faq']
const textLabel = value => String(value || '').replaceAll('_', ' ')
const moneyDraft = value => (Number(value || 0) / 100).toFixed(2)

function paise(value) {
  const text = String(value).trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter an amount with no more than two decimal places.')
  const [whole, fraction = ''] = text.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(amount) || amount > 100000000) throw new Error('Amounts must be between ₹0 and ₹10,00,000.')
  return amount
}

function imageDraft(image) { return { url: image.url || image.image_url || '', alt: image.alt || '' } }

function ProductImages({ images, onChange, website, client, disabled, onUploading }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  async function upload(event) {
    const input = event.currentTarget
    const files = Array.from(input.files || [])
    if (!files.length || uploading) return
    setError('')
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
    if (files.length + images.length > 12 || files.some(file => !extensions[file.type] || file.size > 5 * 1024 * 1024)) {
      setError('Choose up to 12 total images. Each must be JPEG, PNG or WebP and no larger than 5 MB.')
      input.value = ''; return
    }
    setUploading(true); onUploading(true)
    try {
      const uploaded = []
      const bucket = client.storage.from('commerce-media')
      for (const file of files) {
        const path = `${website.id}/${crypto.randomUUID()}.${extensions[file.type]}`
        const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false })
        if (uploadError) throw new Error('Image upload failed. Check your website permissions or try again.')
        uploaded.push({ url: bucket.getPublicUrl(path).data.publicUrl, alt: '' })
      }
      onChange([...images, ...uploaded])
    } catch (requestError) { setError(requestError.message || 'Unable to upload images.') }
    finally { input.value = ''; setUploading(false); onUploading(false) }
  }
  function update(index, key, value) { onChange(images.map((image, position) => position === index ? { ...image, [key]: value } : image)) }
  function move(index, direction) {
    const next = [...images]
    ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
    onChange(next)
  }
  return <div className="ce-images"><div className="co-panel-title"><div><h3>Product gallery</h3><p>Upload up to 12 images. The first gallery image appears first; the original product image remains available when the gallery is empty.</p></div></div>
    <label>Upload product images<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading || images.length >= 12} onChange={event => void upload(event)} /></label><p className="co-form-note">JPEG, PNG or WebP · up to 5 MB each. Save product options to publish the gallery.</p>
    {uploading && <p role="status">Uploading images…</p>}{error && <p className="co-message co-message-error" role="alert">{error}</p>}
    <ol className="ce-image-list">{images.map((image, index) => <li key={`${index}:${image.url}`}><Image unoptimized src={image.url} alt={image.alt || `Gallery image ${index + 1}`} width={96} height={96} /><label>Image description<input value={image.alt} maxLength={300} disabled={disabled || uploading} onChange={event => update(index, 'alt', event.target.value)} /></label><div className="co-inline-actions"><button type="button" className="co-button co-button-outline co-button-small" aria-label={`Move image ${index + 1} earlier`} disabled={disabled || uploading || index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" className="co-button co-button-outline co-button-small" aria-label={`Move image ${index + 1} later`} disabled={disabled || uploading || index === images.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="co-button co-button-danger co-button-small" disabled={disabled || uploading} onClick={() => onChange(images.filter((_, position) => position !== index))}>Remove</button></div></li>)}</ol>
  </div>
}

function VariantForm({ variant, product, disabled, action, onClose }) {
  const [draft, setDraft] = useState({ sku: variant?.sku || '', name: variant?.name || '', price: moneyDraft(variant?.price_paise ?? product.price_paise), active: variant?.active ?? true, options: Object.entries(variant?.options || {}).map(([key, value]) => ({ key, value })) })
  const [error, setError] = useState('')
  const field = (key, value) => setDraft(current => ({ ...current, [key]: value }))
  function option(index, key, value) { field('options', draft.options.map((row, position) => position === index ? { ...row, [key]: value } : row)) }
  async function submit(event) {
    event.preventDefault(); setError('')
    try {
      const keys = draft.options.map(row => row.key.trim())
      if (keys.some(key => !key) || new Set(keys).size !== keys.length || draft.options.some(row => !row.value.trim())) throw new Error('Give each option a unique name and a value.')
      if (await action('save_variant', { ...(variant?.id ? { id: variant.id } : {}), product_id: product.id, sku: draft.sku.trim(), name: draft.name.trim(), price_paise: paise(draft.price), active: draft.active, options: Object.fromEntries(draft.options.map(row => [row.key.trim(), row.value.trim()])) })) onClose()
    } catch (requestError) { setError(requestError.message) }
  }
  return <form className="co-form ce-subform" onSubmit={submit}><h3>{variant ? 'Edit variant' : 'Add variant'}</h3><fieldset disabled={disabled}><div className="co-form-grid"><label>Variant name<input value={draft.name} required maxLength={180} onChange={event => field('name', event.target.value)} /></label><label>SKU<input value={draft.sku} required maxLength={80} onChange={event => field('sku', event.target.value)} /></label><label>Variant price (₹)<input inputMode="decimal" value={draft.price} required onChange={event => field('price', event.target.value)} /></label></div><div className="ce-option-list">{draft.options.map((row, index) => <div className="ce-option-row" key={index}><label>Option name<input required maxLength={40} value={row.key} onChange={event => option(index, 'key', event.target.value)} /></label><label>Option value<input required maxLength={100} value={row.value} onChange={event => option(index, 'value', event.target.value)} /></label><button type="button" className="co-button co-button-outline co-button-small" onClick={() => field('options', draft.options.filter((_, position) => position !== index))}>Remove option</button></div>)}</div><button type="button" className="co-button co-button-outline co-button-small" disabled={draft.options.length >= 8} onClick={() => field('options', [...draft.options, { key: '', value: '' }])}>Add option</button><label className="co-check-label"><input type="checkbox" checked={draft.active} onChange={event => field('active', event.target.checked)} />Available in catalog</label><p className="co-form-note">New variants start with zero stock. Add quantities in Variant inventory. Editing a variant never overwrites stock consumed by orders.</p>{error && <p className="co-message co-message-error" role="alert">{error}</p>}<div className="co-actions"><button type="submit" className="co-button co-button-primary">Save variant</button><button type="button" className="co-button co-button-outline" onClick={onClose}>Cancel</button></div></fieldset></form>
}

function ProductOptions({ product, data, client, website, disabled, action }) {
  const profile = data.product_profiles?.find(row => row.product_id === product.id)
  const [images, setImages] = useState(() => (data.images || []).filter(row => row.product_id === product.id).sort((a, b) => a.sort_order - b.sort_order).map(imageDraft))
  const [required, setRequired] = useState(profile?.variants_required === true)
  const [uploading, setUploading] = useState(false)
  const [editor, setEditor] = useState(null)
  const variants = (data.variants || []).filter(row => row.product_id === product.id)
  async function submit(event) {
    event.preventDefault()
    if (!uploading) await action('save_product_options', { product_id: product.id, variants_required: required, images: images.map((image, sort_order) => ({ ...image, sort_order })) })
  }
  return <><form className="co-form" onSubmit={submit}><fieldset disabled={disabled || uploading}><ProductImages images={images} onChange={setImages} website={website} client={client} disabled={disabled} onUploading={setUploading} /><label className="co-check-label"><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} />Require customers to select a variant</label><p className="co-form-note">Enable this after adding an active variant and its stock. Simple products continue to use their original price and Inventory stock when variant selection is not required.</p><button type="submit" className="co-button co-button-primary" disabled={uploading}>{uploading ? 'Uploading…' : 'Save product options'}</button></fieldset></form>
    <div className="co-panel-title ce-variants-heading"><div><h3>Variants</h3><p>Each variant has its own SKU, price and available stock.</p></div><button type="button" className="co-button co-button-outline co-button-small" disabled={disabled || uploading} onClick={() => setEditor({})}>Add variant</button></div>
    {editor && <VariantForm key={editor.id || 'new'} variant={editor.id ? editor : null} product={product} disabled={disabled} action={action} onClose={() => setEditor(null)} />}
    <div className="co-table-wrap"><table><thead><tr><th>Variant</th><th>SKU / options</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead><tbody>{variants.map(variant => <tr key={variant.id}><td><strong>{variant.name}</strong><small>{variant.active ? 'Active' : 'Archived'}</small></td><td>{variant.sku}<small>{Object.entries(variant.options || {}).map(([key, value]) => `${key}: ${value}`).join(' · ')}</small></td><td>{formatCommerceMoney(variant.price_paise)}</td><td>{variant.stock_quantity}</td><td><div className="co-inline-actions"><button type="button" className="co-button co-button-outline co-button-small" disabled={disabled || uploading} onClick={() => setEditor(variant)}>Edit</button>{variant.active && <button type="button" className="co-button co-button-danger co-button-small" disabled={disabled || uploading} onClick={() => void action('archive_variant', { id: variant.id })}>Archive</button>}</div></td></tr>)}</tbody></table>{!variants.length && <p className="co-table-empty">No variants for this product. Its existing price and stock remain available when variant selection is not required.</p>}</div>
  </>
}

function VariantInventory({ data, products, disabled, action }) {
  const [error, setError] = useState('')
  const variants = data.variants || []
  async function submit(event) {
    event.preventDefault(); setError('')
    const form = event.currentTarget
    const values = new FormData(form)
    const delta = Number(values.get('delta'))
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000000) { setError('Enter a non-zero whole quantity between -1,000,000 and 1,000,000.'); return }
    if (await action('adjust_variant_stock', { variant_id: String(values.get('variant_id')), delta })) form.reset()
  }
  return <><p>Adjust variant stock separately from simple-product Inventory. Orders consume stock on the server.</p>{variants.length ? <><form className="co-form ce-subform" onSubmit={submit}><fieldset disabled={disabled}><div className="co-form-grid"><label>Variant<select name="variant_id" required>{variants.map(variant => <option value={variant.id} key={variant.id}>{products.find(product => product.id === variant.product_id)?.name || 'Product'} · {variant.name} · {variant.stock_quantity} available{variant.active ? '' : ' (archived)'}</option>)}</select></label><label>Quantity change<input type="number" name="delta" required step="1" min="-1000000" max="1000000" /></label></div>{error && <p className="co-message co-message-error" role="alert">{error}</p>}<button type="submit" className="co-button co-button-primary">Update variant inventory</button></fieldset></form><div className="co-table-wrap"><table><thead><tr><th>Product</th><th>Variant / SKU</th><th>Available stock</th></tr></thead><tbody>{variants.map(variant => <tr key={variant.id}><td>{products.find(product => product.id === variant.product_id)?.name || 'Product'}</td><td>{variant.name}<small>{variant.sku}</small></td><td>{variant.stock_quantity}</td></tr>)}</tbody></table></div></> : <p className="co-table-empty">Add variants in Photos & variants before adjusting variant inventory. Use Inventory for existing simple products.</p>}</>
}

function DeliveryForm({ zone, disabled, action, onClose }) {
  const [draft, setDraft] = useState({ name: zone?.name || '', pincodes: (zone?.pincodes || []).join(', '), fee: moneyDraft(zone?.delivery_fee_paise), minimum: moneyDraft(zone?.minimum_order_paise), active: zone?.active ?? true })
  const [error, setError] = useState('')
  const field = (key, value) => setDraft(current => ({ ...current, [key]: value }))
  async function submit(event) {
    event.preventDefault(); setError('')
    try {
      const pincodes = draft.pincodes.split(/[\s,]+/).filter(Boolean)
      if (!pincodes.length || pincodes.length > 500 || pincodes.some(value => !/^\d{6}$/.test(value)) || new Set(pincodes).size !== pincodes.length) throw new Error('Enter 1–500 unique six-digit PIN codes, separated by commas or spaces.')
      if (await action('save_delivery_zone', { ...(zone?.id ? { id: zone.id } : {}), name: draft.name.trim(), pincodes, delivery_fee_paise: paise(draft.fee), minimum_order_paise: paise(draft.minimum), active: draft.active })) onClose()
    } catch (requestError) { setError(requestError.message) }
  }
  return <form className="co-form ce-subform" onSubmit={submit}><h3>{zone ? 'Edit delivery zone' : 'Add delivery zone'}</h3><fieldset disabled={disabled}><div className="co-form-grid"><label>Zone name<input required maxLength={120} value={draft.name} onChange={event => field('name', event.target.value)} /></label><label>Delivery fee (₹)<input required inputMode="decimal" value={draft.fee} onChange={event => field('fee', event.target.value)} /></label><label>Minimum order (₹)<input required inputMode="decimal" value={draft.minimum} onChange={event => field('minimum', event.target.value)} /></label><label className="co-span-full">Delivery PIN codes<textarea required maxLength={4000} value={draft.pincodes} onChange={event => field('pincodes', event.target.value)} /><span className="co-form-note">Up to 500 unique six-digit codes. An active PIN code can belong to one active zone.</span></label></div><label className="co-check-label"><input type="checkbox" checked={draft.active} onChange={event => field('active', event.target.checked)} />Zone is active</label>{error && <p className="co-message co-message-error" role="alert">{error}</p>}<div className="co-actions"><button type="submit" className="co-button co-button-primary">Save delivery zone</button><button type="button" className="co-button co-button-outline" onClick={onClose}>Cancel</button></div></fieldset></form>
}

function DeliveryZones({ data, disabled, action }) {
  const [editor, setEditor] = useState(null)
  const [enabled, setEnabled] = useState(data.settings?.delivery_zones_enabled === true)
  const zones = data.delivery_zones || []
  return <><form className="co-form" onSubmit={event => { event.preventDefault(); void action('save_settings', { delivery_zones_enabled: enabled }) }}><fieldset disabled={disabled}><label className="co-check-label"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Require delivery PIN-code coverage</label><p className="co-form-note">When enabled, delivery requires a matching active zone and uses that zone’s fee and minimum order. Pickup remains governed by your store configuration. Add active zones before enabling coverage.</p><button type="submit" className="co-button co-button-primary">Save delivery coverage</button></fieldset></form><div className="co-panel-title ce-variants-heading"><div><h3>Delivery zones</h3><p>Coverage is checked again when an order is placed.</p></div><button type="button" className="co-button co-button-outline co-button-small" disabled={disabled} onClick={() => setEditor({})}>Add zone</button></div>{editor && <DeliveryForm key={editor.id || 'new'} zone={editor.id ? editor : null} disabled={disabled} action={action} onClose={() => setEditor(null)} />}<div className="co-table-wrap"><table><thead><tr><th>Zone</th><th>PIN codes</th><th>Fee / minimum</th><th>Actions</th></tr></thead><tbody>{zones.map(zone => <tr key={zone.id}><td><strong>{zone.name}</strong><small>{zone.active ? 'Active' : 'Archived'}</small></td><td><details><summary>{zone.pincodes.length} PIN codes</summary><p className="ce-pin-list">{zone.pincodes.join(', ')}</p></details></td><td>{formatCommerceMoney(zone.delivery_fee_paise)}<small>Minimum {formatCommerceMoney(zone.minimum_order_paise)}</small></td><td><div className="co-inline-actions"><button type="button" className="co-button co-button-outline co-button-small" disabled={disabled} onClick={() => setEditor(zone)}>Edit</button>{zone.active && <button type="button" className="co-button co-button-danger co-button-small" disabled={disabled} onClick={() => void action('archive_delivery_zone', { id: zone.id })}>Archive</button>}</div></td></tr>)}</tbody></table>{!zones.length && <p className="co-table-empty">No delivery zones configured. Existing delivery settings apply while PIN-code coverage is disabled.</p>}</div></>
}

function StoreContent({ data, products, categories, disabled, action }) {
  const [policies, setPolicies] = useState({ shipping: '', returns: '', privacy: '', terms: '', returns_enabled: false, return_days: 0, ...data.settings?.policies })
  const [faq, setFaq] = useState(data.settings?.faq || [])
  const [sections, setSections] = useState(data.settings?.sections || [])
  const [seo, setSeo] = useState({ title: '', description: '', image_url: '', ...data.settings?.seo })
  const [error, setError] = useState('')
  const policy = (key, value) => setPolicies(current => ({ ...current, [key]: value }))
  const updateFaq = (index, key, value) => setFaq(current => current.map((entry, position) => position === index ? { ...entry, [key]: value } : entry))
  const updateSection = (index, key, value) => setSections(current => current.map((entry, position) => position === index ? { ...entry, [key]: value } : entry))
  function moveSection(index, direction) {
    const next = [...sections]
    ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
    setSections(next)
  }
  async function submit(event) {
    event.preventDefault(); setError('')
    if (policies.returns_enabled && (!Number.isInteger(Number(policies.return_days)) || Number(policies.return_days) < 1 || Number(policies.return_days) > 365)) { setError('Set a return window from 1 to 365 days before enabling return requests.'); return }
    if (policies.returns_enabled && !policies.returns.trim()) { setError('Enter your return policy before enabling return requests.'); return }
    await action('save_settings', { policies: { ...policies, return_days: Number(policies.return_days || 0) }, faq, sections, seo })
  }
  return <form className="co-form" onSubmit={submit}><fieldset disabled={disabled}><div className="co-form-section"><h3>Store policies</h3><p>Publish your own plain-text policies. These fields do not accept HTML.</p><div className="co-form-grid">{['shipping', 'returns', 'privacy', 'terms'].map(key => <label key={key}>{textLabel(key)} policy<textarea required={key === 'returns' && policies.returns_enabled} maxLength={10000} rows={5} value={policies[key]} onChange={event => policy(key, event.target.value)} /></label>)}</div><label className="co-check-label"><input type="checkbox" checked={policies.returns_enabled} onChange={event => policy('returns_enabled', event.target.checked)} />Allow eligible customers to request a return</label><label>Return request window (days)<input type="number" min={policies.returns_enabled ? 1 : 0} max="365" step="1" required={policies.returns_enabled} value={policies.return_days} onChange={event => policy('return_days', event.target.value)} /></label><p className="co-form-note">Return requests require written return terms, a completed order and a configured window from 1 to 365 days. Accepting a request does not send a refund or erase order/payment history.</p></div>
    <div className="co-form-section"><div className="co-panel-title"><div><h3>Frequently asked questions</h3><p>Up to 30 questions answered in your own words.</p></div><button type="button" className="co-button co-button-outline co-button-small" disabled={faq.length >= 30} onClick={() => setFaq(current => [...current, { question: '', answer: '' }])}>Add question</button></div>{faq.map((entry, index) => <div className="ce-subform" key={index}><label>Question {index + 1}<input required maxLength={300} value={entry.question} onChange={event => updateFaq(index, 'question', event.target.value)} /></label><label>Answer<textarea required maxLength={3000} value={entry.answer} onChange={event => updateFaq(index, 'answer', event.target.value)} /></label><button type="button" className="co-button co-button-outline co-button-small" onClick={() => setFaq(current => current.filter((_, position) => position !== index))}>Remove question</button></div>)}</div>
    <div className="co-form-section"><div className="co-panel-title"><div><h3>Homepage sections</h3><p>Choose and order up to 20 sections. Empty content remains empty until you add it.</p></div><button type="button" className="co-button co-button-outline co-button-small" disabled={sections.length >= 20} onClick={() => setSections(current => [...current, { id: crypto.randomUUID(), type: 'text', enabled: true, title: '', body: '' }])}>Add section</button></div>{sections.map((section, index) => <div className="ce-subform" key={section.id}><div className="co-form-grid"><label>Section type<select value={section.type} onChange={event => updateSection(index, 'type', event.target.value)}>{SECTION_TYPES.map(type => <option key={type} value={type}>{textLabel(type)}</option>)}</select></label><label>Title<input maxLength={180} value={section.title || ''} onChange={event => updateSection(index, 'title', event.target.value)} /></label>{['hero', 'banner', 'text'].includes(section.type) && <label className="co-span-full">Text<textarea maxLength={3000} value={section.body || ''} onChange={event => updateSection(index, 'body', event.target.value)} /></label>}{['hero', 'banner'].includes(section.type) && <label className="co-span-full">Image URL<input type="url" maxLength={2048} value={section.image_url || ''} onChange={event => updateSection(index, 'image_url', event.target.value)} /><span className="co-form-note">Use an HTTPS URL for an image you are authorized to publish.</span></label>}{section.type === 'categories' && <label>Category<select value={section.category_id || ''} onChange={event => updateSection(index, 'category_id', event.target.value || null)}><option value="">All categories</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}{category.active ? '' : ' (archived)'}</option>)}</select></label>}{section.type === 'featured_products' && <label className="co-span-full">Featured products<select multiple value={section.product_ids || []} onChange={event => updateSection(index, 'product_ids', Array.from(event.target.selectedOptions, option => option.value).slice(0, 50))}>{products.map(product => <option key={product.id} value={product.id}>{product.name}{product.active ? '' : ' (archived)'}</option>)}</select><span className="co-form-note">Choose up to 50 products.</span></label>}</div><label className="co-check-label"><input type="checkbox" checked={section.enabled} onChange={event => updateSection(index, 'enabled', event.target.checked)} />Show section</label><div className="co-inline-actions"><button type="button" className="co-button co-button-outline co-button-small" aria-label={`Move section ${index + 1} earlier`} disabled={index === 0} onClick={() => moveSection(index, -1)}>Move up</button><button type="button" className="co-button co-button-outline co-button-small" aria-label={`Move section ${index + 1} later`} disabled={index === sections.length - 1} onClick={() => moveSection(index, 1)}>Move down</button><button type="button" className="co-button co-button-danger co-button-small" onClick={() => setSections(current => current.filter((_, position) => position !== index))}>Remove section</button></div></div>)}</div>
    <div className="co-form-section"><h3>Search and share preview</h3><div className="co-form-grid"><label className="co-span-full">Page title<input maxLength={180} value={seo.title} onChange={event => setSeo(current => ({ ...current, title: event.target.value }))} /></label><label className="co-span-full">Description<textarea maxLength={500} value={seo.description} onChange={event => setSeo(current => ({ ...current, description: event.target.value }))} /></label><label className="co-span-full">Share image URL<input type="url" maxLength={2048} value={seo.image_url} onChange={event => setSeo(current => ({ ...current, image_url: event.target.value }))} /></label></div></div>{error && <p className="co-message co-message-error" role="alert">{error}</p>}<button type="submit" className="co-button co-button-primary">Save policies, sections and search settings</button></fieldset></form>
}

export default function CommerceCatalogPanel({ website, client, readOnly = false, products = [], categories = [], mode = 'products' }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState(products[0]?.id || '')
  const [revision, setRevision] = useState(0)
  const pending = useRef(false)
  const path = client ? `/api/commerce/workspace/${website.id}/catalog` : `/api/commerce/admin/catalog?website_id=${encodeURIComponent(website.id)}&workspace=1`
  useEffect(() => {
    const controller = new AbortController()
    commerceFetch(path, { client, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setData(result)
    }).catch(requestError => {
      if (!controller.signal.aborted) setError(requestError.message || 'Unable to load catalog settings.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [client, path])
  const permission = mode === 'products' ? 'products' : mode === 'inventory' ? 'inventory' : 'branding'
  const disabled = !client || readOnly || busy || website.owner_permissions?.[permission] !== true
  async function refresh() {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try { setData(await commerceFetch(path, { client })); setRevision(value => value + 1) }
    catch (requestError) { setError(requestError.message || 'Unable to refresh catalog settings.') }
    finally { pending.current = false; setBusy(false); setLoading(false) }
  }
  async function action(name, payload) {
    if (pending.current || disabled || data?.available === false) return false
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await commerceFetch(path, { client, method: 'POST', body: { action: name, payload } })
      setData(await commerceFetch(path, { client })); setRevision(value => value + 1)
      setNotice('Your changes were saved for this website.')
      return true
    } catch (requestError) { setError(`${requestError.message || 'Unable to save changes.'} Refresh to check the saved state before retrying.`); return false }
    finally { pending.current = false; setBusy(false) }
  }
  const titles = { products: 'Photos & variants', inventory: 'Variant inventory', delivery: 'Delivery coverage', content: 'Policies, FAQ & sections' }
  const product = products.find(row => row.id === selectedId) || products[0]
  return <section className="co-card co-expansion" aria-busy={loading || busy}><div className="co-panel-title"><div><h2>{titles[mode]}</h2><p>Changes apply to {website.name} only.</p></div><button type="button" className="co-button co-button-outline co-button-small" disabled={busy || loading} onClick={() => void refresh()}>Refresh panel</button></div>{error && <p className="co-message co-message-error" role="alert">{error}</p>}{notice && <p className="co-message co-message-success" role="status">{notice}</p>}{loading ? <p role="status">Loading store settings…</p> : data?.available === false ? <p className="co-message co-message-info">This capability is unavailable for this website. Existing products, inventory, orders and branding remain available in their workspace sections. Contact the platform team to enable the required capability.</p> : data ? <div key={`${website.id}:${mode}:${revision}`}>{mode === 'products' && (product ? <><label className="ce-product-selector">Product<select value={product.id} disabled={busy} onChange={event => setSelectedId(event.target.value)}>{products.map(row => <option key={row.id} value={row.id}>{row.name}{row.active ? '' : ' (archived)'}</option>)}</select></label><ProductOptions key={`${product.id}:${revision}`} product={product} data={data} client={client} website={website} disabled={disabled} action={action} /></> : <p className="co-table-empty">Add a product in Products before configuring its photos or variants.</p>)}{mode === 'inventory' && <VariantInventory data={data} products={products} disabled={disabled} action={action} />}{mode === 'delivery' && <DeliveryZones data={data} disabled={disabled} action={action} />}{mode === 'content' && <StoreContent data={data} products={products} categories={categories} disabled={disabled} action={action} />}</div> : <p>Store settings could not be loaded. Refresh this panel to try again.</p>}</section>
}
