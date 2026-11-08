'use client'
import { useState } from 'react'
export default function RestaurantOrderingAdminPage() {
  const [restaurantId, setRestaurantId] = useState('')
  const [policy, setPolicy] = useState(null)
  const [tables, setTables] = useState([])
  const [table, setTable] = useState('1')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [approveRequested, setApproveRequested] = useState(false)
  async function request(url, options) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...options })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.success) throw new Error(data.message || 'Request failed.')
    return data
  }
  const load = async () => {
    setBusy(true); setNotice('')
    try {
      const data = await request(`/api/admin/restaurant-ordering?restaurantId=${encodeURIComponent(restaurantId)}`)
      setPolicy(data.policy); setTables(data.tables || [])
    } catch (e) { setNotice(e.message) } finally { setBusy(false) }
  }
  const save = async () => {
    setBusy(true); setNotice('')
    try {
      const data = await request('/api/admin/restaurant-ordering', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        restaurantId, action: 'policy', latitude: policy.origin_latitude, longitude: policy.origin_longitude,
        geofenceEnabled: policy.geofence_enabled, signedQrRequired: policy.signed_table_qr_required,
        homeDeliveryEnabled: policy.home_delivery_entry_enabled, radiusMeters: Number(policy.radius_m), maxAccuracyMeters: Number(policy.max_accuracy_m), estimatedPrepMinutes: Number(policy.estimated_prep_minutes), approveRequested,
      }) })
      setPolicy(data.policy); setApproveRequested(false); setNotice('Policy saved. Changes apply to new checkouts.')
    } catch (e) { setNotice(e.message) } finally { setBusy(false) }
  }
  const addTable = async () => {
    setBusy(true); setNotice('')
    try {
      await request('/api/admin/restaurant-ordering', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurantId, action: 'table', table, enabled: true }) })
      const data = await request(`/api/admin/restaurant-ordering?restaurantId=${encodeURIComponent(restaurantId)}`)
      setTables(data.tables || []); setNotice('Table registered.')
    } catch (e) { setNotice(e.message) } finally { setBusy(false) }
  }
  return <main className="min-h-dvh bg-slate-50 p-4 text-slate-900"><div className="mx-auto max-w-xl space-y-5">
    <header className="rounded-3xl bg-slate-950 p-6 text-white"><p className="text-xs uppercase tracking-widest text-slate-300">Digital Dine-In · Super Admin</p><h1 className="mt-2 text-2xl font-black">Restaurant Ordering Controls</h1><p className="mt-2 text-sm text-slate-300">Only Super Admin can activate dine-in location checks and combined home delivery.</p></header>
    <section className="rounded-2xl bg-white p-4 shadow-sm"><label className="text-sm font-bold">Restaurant UUID<input value={restaurantId} onChange={e => setRestaurantId(e.target.value)} placeholder="Restaurant UUID" className="mt-2 w-full rounded-xl border p-3 text-sm" /></label><button onClick={load} disabled={busy} className="mt-3 w-full rounded-xl bg-indigo-600 p-3 text-sm font-bold text-white">Load settings</button></section>
    {notice && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{notice}</p>}
    {policy && <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">Ordering policy</h2>
      {policy.origin_change_requested_at && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        Owner requested a location change: {policy.requested_origin_latitude}, {policy.requested_origin_longitude}.
        <button className="mt-2 block rounded-lg bg-amber-800 px-3 py-2 text-xs font-bold text-white" onClick={() => {
          setPolicy(p => ({ ...p, origin_latitude: p.requested_origin_latitude, origin_longitude: p.requested_origin_longitude }))
          setApproveRequested(true)
        }}>Approve these coordinates when saving</button>
      </div>}
      {[['geofence_enabled','Require live Dine-In geofence'],['signed_table_qr_required','Require signed table QR'],['home_delivery_entry_enabled','Show Home Delivery inside restaurant menu']].map(([key,label]) =>
        <label key={key} className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={policy[key] === true} onChange={e => setPolicy(v => ({ ...v, [key]: e.target.checked }))} />{label}</label>)}
      <div className="grid grid-cols-2 gap-3">{[['origin_latitude','Latitude'],['origin_longitude','Longitude'],['radius_m','Radius (m)'],['max_accuracy_m','Max GPS uncertainty (m)'],['estimated_prep_minutes','Estimated preparation (min)']].map(([key,label]) =>
        <label key={key} className="text-xs font-semibold">{label}<input type="number" step={key.includes('latitude') || key.includes('longitude') ? 'any' : '1'} value={policy[key] ?? ''} onChange={e => setPolicy(v => ({ ...v, [key]: e.target.value === '' ? null : Number(e.target.value) }))} className="mt-2 w-full rounded-xl border p-3 text-sm" /></label>)}</div>
      <button onClick={save} disabled={busy} className="w-full rounded-xl bg-indigo-600 p-3 text-sm font-bold text-white">Save policy</button>
      <p className="text-xs text-slate-500">Restaurant + Delivery eligibility still depends on plan and existing tenant feature controls. Location values must be verified on site.</p>
    </section>}
    {policy && <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Registered tables</h2><p className="mt-2 text-sm text-slate-500">Signed QR can be issued only for enabled tables.</p>
      <div className="mt-3 flex gap-2"><input value={table} onChange={e => setTable(e.target.value)} className="min-w-0 flex-1 rounded-xl border p-3 text-sm" /><button onClick={addTable} disabled={busy} className="rounded-xl bg-slate-900 px-4 text-sm font-bold text-white">Add table</button></div>
      <ul className="mt-4 space-y-2 text-sm">{tables.map(t => <li key={t.table_label} className="rounded-xl bg-slate-50 p-3">Table {t.table_label} · {t.enabled ? 'Enabled' : 'Disabled'}</li>)}</ul>
    </section>}
  </div></main>
}
