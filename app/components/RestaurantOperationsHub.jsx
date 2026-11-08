'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '@/lib/supabase'

const TABS = [{ id: 'all', label: 'All' }, { id: 'dine-in', label: 'Dine-In' }, { id: 'takeaway', label: 'Takeaway' }, { id: 'delivery', label: 'Home Delivery' }]
const money = amount => `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateLabel = value => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'
function getStaffSession(restaurantId) {
  try {
    const data = JSON.parse(localStorage.getItem('digital-dine-staff-session') || '{}')
    if (String(data.restaurantId || '').toLowerCase() === restaurantId.toLowerCase() && data.sessionToken) return data.sessionToken
  } catch {}
  return null
}
export default function RestaurantOperationsHub({ restaurantId }) {
  const [auth, setAuth] = useState(null)
  const [role, setRole] = useState('')
  const [orders, setOrders] = useState([])
  const [report, setReport] = useState({})
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState('orders')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [sound, setSound] = useState(false)
  const [table, setTable] = useState('1')
  const [qr, setQr] = useState(null)
  const [location, setLocation] = useState({ latitude: '', longitude: '' })
  const [busy, setBusy] = useState(false)
  const [updatingId, setUpdatingId] = useState('')
  const previousIds = useRef(new Set())
  const audioRef = useRef(null)
  const getToken = useCallback(async () => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('role') === 'staff') {
      return getStaffSession(restaurantId)
    }
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) return data.session.access_token
    return getStaffSession(restaurantId)
  }, [restaurantId])
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Sign in to the Owner or Staff portal first.')
      const response = await fetch(`/api/restaurant/combined-orders?restaurantId=${encodeURIComponent(restaurantId)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load orders.')
      const ids = new Set(data.orders.map(o => o.id))
      if (sound && previousIds.current.size && data.orders.some(o => !previousIds.current.has(o.id))) {
        try {
          const ctx = audioRef.current
          if (ctx?.state === 'suspended') await ctx.resume()
          if (ctx) {
            const osc = ctx.createOscillator(), gain = ctx.createGain()
            osc.type = 'sine'; osc.frequency.value = 850; gain.gain.value = 0.04
            osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.2)
          }
        } catch {}
      }
      previousIds.current = ids
      setOrders(data.orders || [])
      setReport(data.report || {})
      setRole(data.role)
      setAuth(token)
      setError('')
    } catch (e) { setError(e.message) }
    finally { if (!quiet) setLoading(false) }
  }, [getToken, restaurantId, sound])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const timer = setInterval(() => load(true), 20000)
    return () => clearInterval(timer)
  }, [load])
  useEffect(() => () => { try { audioRef.current?.close() } catch {} }, [])
  const unlockSound = async () => {
    if (sound) { setSound(false); return }
    const Context = window.AudioContext || window.webkitAudioContext
    if (!Context) { setInfo('Order sound is not supported on this device.'); return }
    try { audioRef.current ||= new Context(); await audioRef.current.resume(); setSound(true) }
    catch { setInfo('Unable to enable order sound on this device.') }
  }
  const visible = orders.filter(o => (tab === 'all' || o.mode === tab) &&
    `${o.number} ${o.table} ${o.customer} ${o.status}`.toLowerCase().includes(search.toLowerCase()))
  const issueQr = async () => {
    setBusy(true); setInfo('')
    try {
      const token = await getToken()
      const response = await fetch('/api/restaurant/table-qr', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurantId, table }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to generate table QR.')
      setQr({ ...data, createdAt: Date.now() })
    } catch (e) { setInfo(e.message) } finally { setBusy(false) }
  }
  const updateLocation = async () => {
    setBusy(true); setInfo('')
    try {
      const token = await getToken()
      const response = await fetch('/api/restaurant/owner-location', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurantId, ...location }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to update location.')
      setInfo('Location change submitted for Super Admin approval. The active geofence is unchanged.')
    } catch (e) { setInfo(e.message) } finally { setBusy(false) }
  }
  const updateRestaurantStatus = async (order, newStatus) => {
    setUpdatingId(order.id); setInfo('')
    try {
      const token = await getToken()
      const url = role === 'owner' ? '/api/owner/restaurant-orders' : '/api/staff/restaurant-orders'
      const response = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurantId, orderId: order.id, newStatus }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to update order.')
      await load(true)
    } catch (e) { setInfo(e.message) } finally { setUpdatingId('') }
  }
  return (
    <main className="min-h-dvh bg-gradient-to-b from-[#edf3ff] via-[#f7f8fc] to-white pb-[max(2rem,env(safe-area-inset-bottom))] text-slate-900">
      <div className="mx-auto max-w-5xl px-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <header className="rounded-[28px] bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-800 p-5 text-white shadow-xl sm:p-7">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-blue-200">Digital Dine-In · Operations</p>
            <h1 className="mt-2 text-2xl font-black">Restaurant Orders</h1><p className="mt-1 text-xs text-blue-100">Dine-In, Takeaway & Home Delivery · {role || 'Secure access'}</p></div>
            <a href="/app" className="rounded-xl bg-white/15 px-3 py-2 text-xs font-bold">Portal</a></div>
          <div className="mt-5 grid grid-cols-3 gap-2">{['dine-in','takeaway','delivery'].map(mode => <div key={mode} className="rounded-xl bg-white/10 p-3">
            <p className="text-[10px] capitalize text-blue-100">{mode === 'delivery' ? 'Delivery' : mode}</p>
            <p className="mt-1 text-xl font-black">{report[mode]?.count || 0}</p>
            <p className="mt-1 text-[10px] text-blue-100">{money(report[mode]?.orderValue)}</p></div>)}</div>
        </header>
        <nav className="sticky top-0 z-20 mt-3 flex gap-2 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-sm backdrop-blur" aria-label="Operations sections">
          {[['orders','Orders'],['tables','Tables & QR'],['location','Location']].filter(([id]) => id === 'orders' || (role === 'owner' || role === 'manager') && (id !== 'location' || role === 'owner')).map(([id,label]) =>
            <button type="button" key={id} onClick={() => setPage(id)} className={`flex-1 rounded-xl px-2 py-3 text-xs font-extrabold ${page === id ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>{label}</button>)}</nav>
        {error && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error} <button onClick={() => load()} className="ml-2 underline">Retry</button></div>}
        {info && <div role="status" className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{info}</div>}
        {page === 'orders' && <section className="mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-black">Live order inbox</h2>
            <div className="flex gap-2"><button onClick={unlockSound} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">{sound ? '🔔 Sound on' : '🔕 Enable sound'}</button>
              <button onClick={() => load()} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">Refresh</button></div></div>
          <div className="flex gap-2 overflow-x-auto pb-2">{TABS.map(item => <button key={item.id} onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-bold ${tab === item.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 shadow-sm'}`}>{item.label}</button>)}</div>
          <input aria-label="Search orders" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order, table or status" className="my-3 w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          {loading ? <p className="p-8 text-center text-sm">Loading orders…</p> : visible.length === 0 ? <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">No matching orders.</div> :
            <div className="grid gap-3 sm:grid-cols-2">{visible.map(o => <article key={`${o.source}-${o.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex justify-between gap-2"><div><p className="text-xs font-black uppercase text-indigo-700">{o.mode === 'delivery' ? '🛵 Home Delivery' : o.mode === 'takeaway' ? '🥡 Takeaway' : '🍽 Dine-In'}</p>
                <h3 className="mt-1 text-lg font-black">#{o.number || String(o.id).slice(0,8)}</h3></div>
                <span className="h-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold capitalize">{String(o.status).replaceAll('_',' ')}</span></div>
              <p className="mt-1 text-xs text-slate-500">{dateLabel(o.createdAt)} {o.table ? ` · Table ${o.table}` : ''}</p>
              {o.customer && <p className="mt-2 text-sm font-semibold">{o.customer}</p>}
              <ul className="mt-3 space-y-1 text-sm text-slate-600">{o.items.slice(0,6).map((item,i) => <li key={i}>{item.quantity} × {item.name}</li>)}</ul>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><strong>{money(o.amount)}</strong><span className="text-xs text-slate-500">{o.paymentMethod || '—'}</span></div>
              {o.source === 'restaurant' && ['owner','manager','kitchen','waiter'].includes(role) && <div className="mt-3 flex flex-wrap gap-2">
                {(role === 'waiter' ? ['completed'] : role === 'kitchen' ? ['preparing','ready'] : ['preparing','ready','completed']).map(status => <button key={status} type="button" disabled={updatingId === o.id || o.status === status}
                  onClick={() => updateRestaurantStatus(o,status)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold capitalize disabled:opacity-40">{status}</button>)}</div>}
              {o.source === 'delivery' && <p className="mt-3 text-xs text-slate-500">Driver, packer and delivery status changes remain in the existing Delivery Management workspace.</p>}
            </article>)}</div>}
          <p className="mt-4 text-xs text-slate-500">Amounts shown are order values, not confirmed settled revenue. The latest 100 orders per module are displayed.</p>
        </section>}
        {page === 'tables' && (role === 'owner' || role === 'manager') && <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">Rotating signed table QR</h2><p className="mt-2 text-sm text-slate-600">Register tables in Super Admin settings first. Codes expire after 10 minutes; refresh before guests scan. Do not print these rotating codes as permanent table stickers.</p>
          <label className="mt-4 block text-xs font-bold">Table number<input value={table} onChange={e => setTable(e.target.value)} maxLength={50} className="mt-2 w-full rounded-xl border p-3 text-sm" /></label>
          <button onClick={issueQr} disabled={busy} className="mt-3 w-full rounded-xl bg-indigo-600 p-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Generating…' : 'Generate secure table QR'}</button>
          {qr && <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl bg-slate-50 p-4"><QRCodeSVG value={qr.url} size={220} includeMargin />
            <p className="text-sm font-bold">Table {qr.table} · Valid for 10 minutes</p><a href={qr.url} className="break-all text-xs text-indigo-700 underline">Open customer menu</a>
            <button onClick={issueQr} className="rounded-xl border bg-white px-4 py-2 text-xs font-bold">Refresh QR</button></div>}
        </section>}
        {page === 'location' && role === 'owner' && <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">Restaurant location</h2><p className="mt-2 text-sm text-slate-600">Set the actual restaurant entrance / dining-area center. Only Super Admin can enable or change geofence requirements.</p>
          <div className="mt-4 grid grid-cols-2 gap-2"><label className="text-xs font-bold">Latitude<input inputMode="decimal" value={location.latitude} onChange={e => setLocation(v => ({ ...v, latitude: e.target.value }))} className="mt-2 w-full rounded-xl border p-3 text-sm" /></label>
            <label className="text-xs font-bold">Longitude<input inputMode="decimal" value={location.longitude} onChange={e => setLocation(v => ({ ...v, longitude: e.target.value }))} className="mt-2 w-full rounded-xl border p-3 text-sm" /></label></div>
          <button onClick={updateLocation} disabled={busy} className="mt-4 w-full rounded-xl bg-indigo-600 p-3 text-sm font-bold text-white disabled:opacity-50">Save location</button>
        </section>}
      </div>
    </main>
  )
}
