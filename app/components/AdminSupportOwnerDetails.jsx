'use client'

import { useEffect, useState } from 'react'

const FIELDS = [
  ['name', 'Owner name'], ['email', 'Email'], ['phone', 'Phone'],
  ['registeredAt', 'Owner registered'], ['lastLoginAt', 'Last sign-in'],
]

function date(value) {
  if (!value) return 'Not available'
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(time)
}

function display(value) {
  return value === null || value === undefined || value === '' ? 'Not available' : String(value)
}

function amount(value) {
  if (value === null || value === undefined) return '—'
  return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function Metric({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{display(value)}</p>
      {hint ? <p className="mt-1 text-[10px] text-neutral-500">{hint}</p> : null}
    </div>
  )
}

export default function AdminSupportOwnerDetails({ restaurantId, onClose }) {
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeModule, setActiveModule] = useState('all')

  useEffect(() => {
    if (!restaurantId) return undefined
    const controller = new AbortController()
    setLoading(true)
    setDetails(null)
    setError('')
    setActiveModule('all')

    fetch(`/api/admin/live-support/owner-profile?restaurantId=${encodeURIComponent(restaurantId)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload?.success) throw new Error(payload?.message || 'Unable to load owner details.')
        return payload
      })
      .then(setDetails)
      .catch(err => { if (err?.name !== 'AbortError') setError(err?.message || 'Unable to load owner details.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })

    return () => controller.abort()
  }, [restaurantId])

  useEffect(() => {
    const handler = event => { if (event.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!restaurantId) return null
  const owner = details?.owner || {}
  const business = details?.business || {}
  const modules = details?.modules || {}
  const moduleIds = ['restaurant', 'delivery', 'resort']
  const visibleModules = activeModule === 'all' ? moduleIds : [activeModule]

  return (
    <div className="fixed inset-0 z-[2000] flex items-stretch justify-end bg-black/75 p-0 backdrop-blur-sm sm:p-4"
      role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="admin-owner-detail-title"
        className="flex h-full w-full max-w-[780px] flex-col overflow-hidden rounded-none border border-neutral-700 bg-[#111720] text-white shadow-2xl sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-800 bg-[#16202b] px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.17em] text-emerald-400">Super Admin • Business intelligence</p>
            <h2 id="admin-owner-detail-title" className="mt-1 break-words text-xl font-black sm:text-2xl">
              {loading ? 'Loading owner details…' : owner.name || business.name || 'Owner details'}
            </h2>
            <p className="mt-2 text-xs text-neutral-400">Owner profile and live operating activity across all modules</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close owner details"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 text-xl text-white hover:bg-neutral-800">×</button>
        </header>
        <main className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-7">
          {loading && <p role="status" className="rounded-2xl bg-neutral-900 p-5 text-sm text-neutral-300">Retrieving verified owner and order data…</p>}
          {error && <div role="alert" className="rounded-2xl border border-red-600/40 bg-red-950/40 p-5 text-sm text-red-100">{error}</div>}
          {details && <>
            <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-black">{(Array.from(owner.name || 'O')[0] || 'O').toUpperCase()}</span>
                <div className="min-w-0"><h3 className="break-words text-lg font-black">{display(owner.name)}</h3>
                  <p className="break-words text-xs text-neutral-400">Owner account · {display(business.name)}</p></div>
              </div>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                {FIELDS.map(([key, label]) => <div key={key} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-neutral-100">{key.endsWith('At') ? date(owner[key]) : display(owner[key])}</dd>
                </div>)}
              </dl>
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <h3 className="mb-4 text-lg font-black">Business information</h3>
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Business name', business.name], ['Store code', business.code],
                  ['Business type', business.type], ['Subscription plan', business.plan],
                  ['Approval status', business.approval], ['Subscription status', business.subscription],
                  ['Delivery enabled', business.deliveryEnabled ? 'Yes' : 'No'],
                  ['Resort enabled', business.resortEnabled ? 'Yes' : 'No'],
                  ['Registered on', date(business.createdAt)],
                  ['Address', [business.address, business.city, business.state].filter(Boolean).join(', ')],
                ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-semibold">{display(value)}</dd>
                </div>)}
              </dl>
            </section>

            <section>
              <h3 className="mb-3 text-lg font-black">Live operating summary</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="All orders / bookings" value={details.counts?.all} />
                <Metric label="Currently active" value={details.counts?.active} />
                <Metric label="Restaurant orders" value={modules.restaurant?.total} />
                <Metric label="Delivery orders" value={modules.delivery?.total} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Metric label="Resort bookings" value={modules.resort?.total}/>
                <Metric label="Active deliveries" value={modules.delivery?.active}/>
                <Metric label="Active resort stays/bookings" value={modules.resort?.active}/>
              </div>
              <p className="mt-2 text-[11px] text-neutral-400">Exact total counts from Supabase. “Active” uses each module’s non-final statuses, not rider GPS. A dash means a module could not be queried.</p>
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <h3 className="text-lg font-black">Recent orders & bookings</h3>
              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter order activity">
                {['all', ...moduleIds].map(id => <button key={id} type="button" onClick={() => setActiveModule(id)}
                  aria-pressed={activeModule === id}
                  className={`rounded-xl px-3 py-2 text-xs font-bold capitalize ${activeModule === id ? 'bg-emerald-600 text-white' : 'border border-neutral-700 bg-neutral-950 text-neutral-300 hover:bg-neutral-800'}`}>{id === 'all' ? 'All modules' : id}</button>)}
              </div>
              {visibleModules.map(module => <div key={module} className="mt-5">
                <h4 className="mb-2 text-sm font-extrabold capitalize">{module} <span className="font-normal text-neutral-400">• {display(modules[module]?.total)} total / {display(modules[module]?.active)} active</span></h4>
                {!modules[module]?.recent?.length ? <p className="rounded-xl border border-neutral-800 p-3 text-xs text-neutral-500">No recent records available.</p> : (
                  <div className="space-y-2">
                    {modules[module].recent.map(row => <article key={`${module}:${row.id}`} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-all text-xs font-black text-white">{display(row.code)}</p>
                          <p className="mt-1 text-xs text-neutral-400">{date(row.createdAt)}{row.customer ? ` · ${row.customer}` : ''}</p>
                          {module === 'resort' && (row.checkIn || row.checkOut) && <p className="mt-1 text-[11px] text-neutral-500">Stay: {row.checkIn || '?'} → {row.checkOut || '?'}</p>}
                        </div>
                        <p className="text-sm font-black text-emerald-300">{amount(row.total)}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold"><span className="rounded-lg border border-neutral-700 px-2 py-1">{display(row.status)}</span>
                        {row.paymentStatus && <span className="rounded-lg border border-neutral-700 px-2 py-1">Payment: {row.paymentStatus}</span>}</div>
                    </article>)}
                  </div>
                )}
              </div>)}
            </section>
            {details.warnings?.length > 0 && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">{details.warnings.join(' ')}</div>}
          </>}
        </main>
      </section>
    </div>
  )
}