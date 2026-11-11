'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

const INITIAL = { name: '', slug: '', category: 'pickles', ownerEmail: '' }
const CATEGORIES = [
  ['pickles', 'Pickles'], ['clothing', 'Clothing & Sarees'],
  ['toys', 'Toys & Collectibles'], ['groceries', 'Groceries'],
  ['snacks', 'Snacks & Bakery'], ['gifts', 'Custom Gifts'],
]
const slugify = value => String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const input = 'mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-red-500 focus:ring-1 focus:ring-red-500/30'
const actionButton = 'rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-[11px] font-bold text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40'

async function request(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.success) throw new Error(data.message || `Request failed (${response.status})`)
  return data
}

export default function AdminEcommerceStoresPage() {
  const [stores, setStores] = useState([])
  const [form, setForm] = useState(INITIAL)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [workingStore, setWorkingStore] = useState('')
  const [ownerIds, setOwnerIds] = useState({})
  const [emailDrafts, setEmailDrafts] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await request('/api/admin/ecommerce/stores')
      setStores(Array.isArray(data.stores) ? data.stores : [])
      setError('')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => ({
    total: stores.length,
    pending: stores.filter(s => s.approval_status === 'pending').length,
    approved: stores.filter(s => s.approval_status === 'approved').length,
    active: stores.filter(s => s.is_active).length,
  }), [stores])

  const visible = useMemo(() => stores.filter(s => {
    const q = search.trim().toLowerCase()
    const matches = !q || [s.name, s.slug, s.category, s.owner_email].some(v => String(v || '').toLowerCase().includes(q))
    const status = filter === 'all' || (filter === 'active' ? s.is_active : filter === 'pending' ? s.approval_status === 'pending' : !s.is_active)
    return matches && status
  }), [stores, search, filter])

  async function create(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError(''); setNotice('')
    try {
      const data = await request('/api/admin/ecommerce/stores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setNotice(data.message || `${data.store?.name || 'Website'} created as pending. Assign an owner, approve and activate it before customers can access it.`)
      setForm(INITIAL)
      await load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function storeAction(storeId, action) {
    if (workingStore) return
    if (action === 'assign_owner' && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test((ownerIds[storeId] || '').trim())) {
      setError('Enter a valid Supabase Auth owner UUID before assigning the owner.')
      return
    }
    if (!window.confirm(`Confirm ${action.replaceAll('_', ' ')} for this website?`)) return
    setWorkingStore(storeId); setError(''); setNotice('')
    try {
      const result = await request('/api/admin/ecommerce/stores/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, action, userId: (ownerIds[storeId] || '').trim() }),
      })
      setNotice(`${action.replaceAll('_', ' ')} completed.${result.auditLogged === false ? ' Warning: audit logging failed.' : ''}`)
      await load()
    } catch (e) { setError(e.message) }
    finally { setWorkingStore('') }
  }

  async function changeOwnerEmail(store) {
    const newEmail = String(emailDrafts[store.id] || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { setError('Enter a valid new login email.'); return }
    if (!store.owner_user_id) { setError('Assign an owner before editing their login email.'); return }
    const count = Number(store.owner_store_count || 0)
    const warning = count > 1 ? `\nIMPORTANT: This account owns ${count} stores. All those stores will use the new login email.` : ''
    if (!window.confirm(`Change Supabase Auth login email for ${store.name}?\n\n${store.owner_email || 'Unknown'} → ${newEmail}${warning}\n\nThis changes the existing Auth user, not the store owner ID.`)) return
    setWorkingStore(store.id); setError(''); setNotice('')
    try {
      const result = await request('/api/admin/ecommerce/stores/owner-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id, newEmail, confirmedSharedOwner: count > 1 }),
      })
      setNotice(result.message || 'Owner login email updated.')
      setEmailDrafts(prev => ({ ...prev, [store.id]: '' }))
      await load()
    } catch (e) { setError(e.message) }
    finally { setWorkingStore('') }
  }

  return (
    <div className="min-w-0 space-y-6 text-neutral-100">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">Digital Dine-In / E-Commerce</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Website Management</h1>
          <p className="mt-2 text-xs leading-5 text-neutral-400">Create websites, assign owners and manage approvals in one place.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} disabled={loading} className={actionButton}>{loading ? 'Refreshing…' : '↻ Refresh'}</button>
          <button type="button" onClick={() => setShowForm(v => !v)} className="rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white hover:bg-red-500">{showForm ? 'Hide form' : '+ New website'}</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ['Total websites', stats.total, 'All registered stores'],
          ['Pending approval', stats.pending, 'Awaiting review'],
          ['Approved', stats.approved, 'Approved businesses'],
          ['Active websites', stats.active, 'Currently enabled'],
        ].map(([title, value, description]) => (
          <div key={title} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">{title}</p>
            <p className="mt-3 text-3xl font-black text-white">{value}</p>
            <p className="mt-2 text-[10px] text-neutral-500">{description}</p>
          </div>
        ))}
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-200">{notice}</div>}

      {showForm && (
        <section className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
          <div className="border-b border-neutral-800 px-5 py-4 sm:px-6">
            <h2 className="text-base font-black text-white">Create a new E-Commerce website</h2>
            <p className="mt-1 text-xs text-neutral-400">New websites start pending and inactive. No subscription is activated automatically.</p>
          </div>
          <form onSubmit={create} className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block text-xs font-bold text-neutral-300">Website / Store name
                <input required minLength={2} maxLength={120} className={input} placeholder="e.g. Ramu Pickles" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))} />
              </label>
              <label className="block text-xs font-bold text-neutral-300">Website slug
                <input required maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={input} placeholder="ramu-pickles" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))} />
              </label>
              <label className="block text-xs font-bold text-neutral-300">Business category
                <select required className={input} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-neutral-300">Owner login email (optional)
                <input type="email" maxLength={254} className={input} placeholder="owner@example.com" value={form.ownerEmail} onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))} />
                <span className="mt-2 block text-[10px] font-normal text-neutral-500">If entered, the server links an existing Auth account or invites a new owner. The store remains pending and inactive.</span>
              </label>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Planned storefront address</p>
                <p className="mt-2 break-all text-xs font-bold text-emerald-300">{form.slug || 'your-store'}.digitaldine-in.online</p>
                <p className="mt-2 text-[10px] leading-4 text-neutral-500">DNS and custom subdomain routing must be configured separately.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-5">
              <p className="text-[11px] text-amber-300">Approval and activation are required before going live.</p>
              <button type="submit" disabled={saving || loading} className="rounded-xl bg-red-600 px-5 py-3 text-xs font-black text-white hover:bg-red-500 disabled:opacity-50">{saving ? 'Creating website…' : 'Create pending website'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 p-5">
          <div><h2 className="text-base font-black text-white">Existing websites</h2><p className="mt-1 text-xs text-neutral-500">{visible.length} matching websites</p></div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <input aria-label="Search websites" placeholder="Search name, slug or category" value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-xs text-white outline-none focus:border-red-500 sm:w-64" />
            <select aria-label="Filter websites" value={filter} onChange={e => setFilter(e.target.value)} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-xs text-white"><option value="all">All</option><option value="pending">Pending</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
          </div>
        </div>
        {loading ? <p className="p-6 text-sm text-neutral-400">Loading websites…</p> : visible.length === 0 ? <p className="p-8 text-center text-xs text-neutral-500">No websites match the selected filter.</p> : (
          <div className="divide-y divide-neutral-800">
            {visible.map(s => (
              <article key={s.id} className="grid min-w-0 gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,1fr)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-base font-black text-white">{s.name}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${s.approval_status === 'approved' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>{s.approval_status || 'pending'}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${s.is_active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-neutral-800 text-neutral-400'}`}>{s.is_active ? 'Live' : 'Inactive'}</span>
                  </div>
                  <p className="mt-2 break-all text-xs text-neutral-400">{s.slug}.digitaldine-in.online</p>
                  <p className="mt-2 text-[11px] text-neutral-500">Category: {s.category || '—'}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-neutral-600">ID: {s.id}</p>
                  <a href={`/shop/${encodeURIComponent(s.slug)}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-bold text-red-400 hover:text-red-300">Preview storefront ↗</a>
                </div>
                <div className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                    <p className="text-[11px] font-bold text-neutral-300">Owner login email</p>
                    <p className="mt-1 break-all text-xs text-emerald-300">{s.owner_email || 'No owner assigned'}</p>
                    {Number(s.owner_store_count || 0) > 1 && <p className="mt-1 text-[10px] text-amber-300">Shared Auth account across {s.owner_store_count} stores</p>}
                    {s.owner_user_id && <>
                      <input type="email" maxLength={254} className={input} placeholder="New login email" value={emailDrafts[s.id] || ''} onChange={e => setEmailDrafts(prev => ({ ...prev, [s.id]: e.target.value }))} />
                      <button type="button" className={`${actionButton} mt-3`} disabled={!!workingStore || !emailDrafts[s.id]?.trim()} onClick={() => changeOwnerEmail(s)}>Change owner login email</button>
                    </>}
                  </div>
                  <label className="block text-[11px] font-bold text-neutral-400">Owner's Supabase Auth UUID
                    <input className={input} placeholder="Paste owner's Auth user ID" value={ownerIds[s.id] || ''} onChange={e => setOwnerIds(prev => ({ ...prev, [s.id]: e.target.value }))} />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={actionButton} disabled={!!workingStore || s.is_active} onClick={() => storeAction(s.id, 'assign_owner')}>Assign owner</button>
                    <button type="button" className={actionButton} disabled={!!workingStore || s.approval_status === 'approved'} onClick={() => storeAction(s.id, 'approve')}>Approve</button>
                    <button type="button" className="rounded-lg bg-emerald-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-40" disabled={!!workingStore || s.is_active || s.approval_status !== 'approved'} onClick={() => storeAction(s.id, 'activate')}>Activate</button>
                    <button type="button" className={actionButton} disabled={!!workingStore || !s.is_active} onClick={() => storeAction(s.id, 'deactivate')}>Deactivate</button>
                  </div>
                  {workingStore === s.id && <p className="mt-2 text-xs text-amber-300">Processing action…</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}