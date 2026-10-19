'use client'
// Destination: app/components/AdminDeliverySeasonalAds.jsx
import { useCallback, useEffect, useMemo, useState } from 'react'

const initial = () => ({ id: '', restaurantId: '', eyebrow: 'SEASONAL SPECIAL', headline: '',
  description: '', imageUrl: '', buttonLabel: 'Shop now', buttonAction: 'browse',
  categoryName: '', startsAt: '', endsAt: '', priority: 10 })
const localDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
const fromDb = (ad) => ({
  id: ad.id, restaurantId: ad.restaurant_id, eyebrow: ad.eyebrow || '',
  headline: ad.headline || '', description: ad.description || '', imageUrl: ad.image_url || '',
  buttonLabel: ad.button_label || 'Shop now', buttonAction: ad.button_action || 'browse',
  categoryName: ad.category_name || '', startsAt: localDateTime(ad.starts_at),
  endsAt: localDateTime(ad.ends_at), priority: Number(ad.priority ?? 10),
})
const campaignStatus = (row) => {
  if (!row.is_enabled) return 'Disabled'
  const now = Date.now()
  if (now < new Date(row.starts_at).getTime()) return 'Scheduled'
  if (now >= new Date(row.ends_at).getTime()) return 'Ended'
  return 'Live'
}
const cn = 'w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400'
const label = 'mb-1 block text-xs font-bold text-neutral-300'

export default function AdminDeliverySeasonalAds() {
  const [stores, setStores] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [filterStore, setFilterStore] = useState('')
  const [form, setForm] = useState(initial)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/delivery-seasonal-ads', { cache: 'no-store', credentials: 'same-origin' })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.success) throw new Error(json.message || 'Unable to load ads.')
      setStores(json.stores || [])
      setCampaigns(json.campaigns || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (stores.length && !form.restaurantId) setForm(current => ({ ...current, restaurantId: stores[0].id }))
  }, [stores, form.restaurantId])
  const rows = useMemo(() => campaigns.filter(row => !filterStore || row.restaurant_id === filterStore), [campaigns, filterStore])
  const byId = useMemo(() => new Map(stores.map(row => [row.id, row])), [stores])
  const reset = () => setForm({ ...initial(), restaurantId: filterStore || stores[0]?.id || '' })
  const submit = async (event) => {
    event.preventDefault()
    setSaving(true); setError(''); setNotice('')
    try {
      if (!form.startsAt || !form.endsAt) throw new Error('Set campaign start and end dates.')
      const startsAt = new Date(form.startsAt).toISOString()
      const endsAt = new Date(form.endsAt).toISOString()
      const response = await fetch('/api/admin/delivery-seasonal-ads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ ...form, operation: form.id ? 'update' : 'create', startsAt, endsAt }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.success) throw new Error(json.message || 'Unable to save campaign.')
      setNotice(json.message || 'Campaign saved.')
      reset()
      await load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }
  const action = async (operation, row, enabled) => {
    const confirmation = operation === 'delete' ? 'Delete this campaign permanently?' : null
    if (confirmation && !window.confirm(confirmation)) return
    setSaving(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/delivery-seasonal-ads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ operation, id: row.id, enabled }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.success) throw new Error(json.message || 'Unable to update campaign.')
      setNotice(json.message || 'Campaign updated.')
      if (form.id === row.id && operation === 'delete') reset()
      await load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }
  const uploadFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!form.restaurantId) { setError('Select a store before uploading an image.'); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setError('Choose a JPEG, PNG or WebP image under 3 MB.'); return
    }
    setUploading(true); setError(''); setNotice('')
    try {
      const payload = new FormData()
      payload.set('restaurantId', form.restaurantId)
      payload.set('file', file)
      const response = await fetch('/api/admin/delivery-seasonal-ads/upload', { method: 'POST', body: payload, credentials: 'same-origin' })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.success) throw new Error(json.message || 'Image upload failed.')
      update('imageUrl', json.imageUrl)
      setNotice('Banner uploaded. Save the campaign to publish it.')
    } catch (err) { setError(err.message) }
    finally { setUploading(false) }
  }
  return <section className="space-y-6 text-neutral-100">
    <div>
      <p className="text-xs font-black uppercase tracking-widest text-emerald-400">DD Delivery · Admin</p>
      <h1 className="mt-1 text-2xl font-black">Seasonal sales & advertisements</h1>
      <p className="mt-2 text-sm text-neutral-400">Create sale banners for individual delivery stores. Enable a campaign to show it only during the scheduled dates.</p>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-700 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-700 bg-emerald-950/50 p-3 text-sm text-emerald-200">{notice}</p>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">{form.id ? 'Edit campaign' : 'Create campaign'}</h2><button type="button" onClick={reset} className="text-xs font-bold text-emerald-400">New campaign</button></div>
        <label><span className={label}>Delivery store</span><select className={cn} value={form.restaurantId} disabled={Boolean(form.id)} required onChange={e => update('restaurantId', e.target.value)}><option value="">Select store</option>{stores.map(row => <option key={row.id} value={row.id}>{row.name} · {row.restaurant_code}</option>)}</select></label>
        <label><span className={label}>Small label</span><input className={cn} maxLength={48} value={form.eyebrow} onChange={e => update('eyebrow', e.target.value)} placeholder="FESTIVAL SALE" /></label>
        <label><span className={label}>Advertisement headline</span><input className={cn} required minLength={3} maxLength={90} value={form.headline} onChange={e => update('headline', e.target.value)} placeholder="Festive deals are here!" /></label>
        <label><span className={label}>Description</span><textarea className={cn} maxLength={240} rows={2} value={form.description} onChange={e => update('description', e.target.value)} placeholder="Discover this week's seasonal picks" /></label>
        <label><span className={label}>Banner image URL (HTTPS)</span><input className={cn} type="url" value={form.imageUrl} onChange={e => update('imageUrl', e.target.value)} placeholder="https://..." /></label>
        <label className="block cursor-pointer rounded-xl border border-dashed border-neutral-700 bg-neutral-950 px-4 py-3 text-center text-xs font-bold text-emerald-300">{uploading ? 'Uploading…' : 'Upload banner image (JPEG/PNG/WebP · max 3 MB)'}<input disabled={uploading || saving} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={uploadFile} /></label>
        {form.imageUrl && /^https:\/\//i.test(form.imageUrl) && <img className="max-h-44 w-full rounded-2xl object-cover" src={form.imageUrl} alt="Advertisement preview" />}
        <div className="grid grid-cols-2 gap-3">
          <label><span className={label}>Start (your device time)</span><input className={cn} required type="datetime-local" value={form.startsAt} onChange={e => update('startsAt', e.target.value)} /></label>
          <label><span className={label}>End (your device time)</span><input className={cn} required type="datetime-local" value={form.endsAt} onChange={e => update('endsAt', e.target.value)} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label><span className={label}>Button text</span><input className={cn} required maxLength={32} value={form.buttonLabel} onChange={e => update('buttonLabel', e.target.value)} /></label>
          <label><span className={label}>Button action</span><select className={cn} value={form.buttonAction} onChange={e => update('buttonAction', e.target.value)}><option value="browse">Browse products</option><option value="category">Open category</option></select></label>
        </div>
        {form.buttonAction === 'category' && <label><span className={label}>Exact store category name</span><input className={cn} required maxLength={80} value={form.categoryName} onChange={e => update('categoryName', e.target.value)} placeholder="e.g. Groceries" /><span className="mt-1 block text-xs text-neutral-400">Must match a category in the selected store menu.</span></label>}
        <label><span className={label}>Priority (0–100)</span><input className={cn} min={0} max={100} step={1} type="number" value={form.priority} onChange={e => update('priority', Number(e.target.value))} /></label>
        <p className="text-xs text-amber-300">New campaigns are saved as drafts. The enable switch publishes the banner only inside the scheduled period. No discounts are applied to prices by this feature.</p>
        <button type="submit" disabled={saving || uploading || !form.restaurantId} className="w-full rounded-xl bg-emerald-600 p-3 text-sm font-black text-white disabled:opacity-50">{saving ? 'Saving…' : form.id ? 'Save campaign changes' : 'Create draft campaign'}</button>
      </form>
      <div className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center justify-between"><h2 className="text-lg font-black">Campaigns</h2><button className="text-xs font-bold text-emerald-400" type="button" disabled={loading} onClick={load}>{loading ? 'Loading…' : 'Refresh'}</button></div>
        <label><span className={label}>Filter by store</span><select className={cn} value={filterStore} onChange={e => setFilterStore(e.target.value)}><option value="">All delivery stores</option>{stores.map(row => <option key={row.id} value={row.id}>{row.name} · {row.restaurant_code}</option>)}</select></label>
        {rows.length === 0 && <p className="rounded-xl bg-neutral-950 p-4 text-sm text-neutral-400">No seasonal campaigns yet.</p>}
        {rows.map(row => <article key={row.id} className="rounded-xl border border-neutral-700 bg-neutral-950 p-3">
          <div className="flex gap-3">
            {row.image_url && <img src={row.image_url} alt="" className="h-20 w-24 shrink-0 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-neutral-400">{byId.get(row.restaurant_id)?.name || 'Delivery store'}</p><p className="font-bold">{row.headline}</p><p className="mt-1 text-xs text-neutral-400">{new Date(row.starts_at).toLocaleString()} – {new Date(row.ends_at).toLocaleString()}</p><p className="mt-1 text-xs text-emerald-300">{campaignStatus(row)} · Priority {row.priority}</p></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-lg border border-neutral-700 px-3 py-2 text-xs font-bold" onClick={() => { setForm(fromDb(row)); window.scrollTo({ top: 0, behavior: 'smooth' }) }} type="button">Edit</button><button className={`rounded-lg px-3 py-2 text-xs font-bold ${row.is_enabled ? 'bg-amber-800' : 'bg-emerald-700'}`} disabled={saving} onClick={() => action('toggle', row, !row.is_enabled)} type="button">{row.is_enabled ? 'Disable' : 'Enable'}</button><button className="rounded-lg bg-red-900 px-3 py-2 text-xs font-bold" disabled={saving} onClick={() => action('delete', row)} type="button">Delete</button></div>
        </article>)}
      </div>
    </div>
  </section>
}