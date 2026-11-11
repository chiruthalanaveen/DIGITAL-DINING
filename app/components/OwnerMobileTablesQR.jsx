'use client'

import { useMemo, useState } from 'react'

// Mobile presentation only. Table inventory and occupancy come from the
// existing authenticated Owner Dashboard; QR management uses its existing route.
// No table writes, unsigned QR links, new Supabase queries, or permission changes.

const ICON_PATHS = {
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M15 15h3v3h-3m5-4v7m-6 0h3" /></>,
  arrow: <path d="m9 18 6-6-6-6" />,
  back: <path d="m15 18-6-6 6-6M9 12h12" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>,
  table: <><rect x="4" y="7" width="16" height="9" rx="2" /><path d="M7 16v4m10-4v4M7 4v3m10-3v3" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2z" /><path d="M8 8h8M8 12h8" /></>,
  close: <path d="M5 5l14 14M19 5 5 19" />,
}

function Icon({ name, size = 20 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name] || ICON_PATHS.table}
    </svg>
  )
}

function Status({ occupied, compact = false }) {
  return (
    <span className={`ddtqr-status ${occupied ? 'ddtqr-occupied' : 'ddtqr-available'} ${compact ? 'text-[10px]' : 'text-xs'}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {occupied ? 'Occupied' : 'Available'}
    </span>
  )
}

const FILTERS = [
  { id: 'all', label: 'All tables' },
  { id: 'available', label: 'Available' },
  { id: 'occupied', label: 'Occupied' },
]

export default function OwnerMobileTablesQR({
  restaurantName = '',
  tableNumbers = [],
  occupiedTableNumbers,
  activeOrders = [],
  ordersLoaded = false,
  ordersError = '',
  onManageQR,
}) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedTable, setSelectedTable] = useState(null)

  const numbers = useMemo(() => (
    [...new Set((Array.isArray(tableNumbers) ? tableNumbers : [])
      .map(value => String(value ?? '').trim())
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  ), [tableNumbers])

  const occupiedSet = useMemo(() => (
    occupiedTableNumbers instanceof Set
      ? occupiedTableNumbers
      : new Set(Array.isArray(occupiedTableNumbers) ? occupiedTableNumbers : [])
  ), [occupiedTableNumbers])

  const orderCounts = useMemo(() => {
    const counts = new Map()
    for (const order of Array.isArray(activeOrders) ? activeOrders : []) {
      const number = String(order?.table_number ?? '').trim()
      if (number) counts.set(number, (counts.get(number) || 0) + 1)
    }
    return counts
  }, [activeOrders])

  const total = numbers.length
  const occupied = numbers.filter(number => occupiedSet.has(number)).length
  const available = total - occupied

  const filtered = numbers.filter(number => {
    const isOccupied = occupiedSet.has(number)
    if (filter === 'occupied' && !isOccupied) return false
    if (filter === 'available' && isOccupied) return false
    return `table ${number}`.toLowerCase().includes(search.trim().toLowerCase())
  })

  const selectedExists = selectedTable !== null && numbers.includes(selectedTable)
  const selectedOccupied = selectedExists && occupiedSet.has(selectedTable)
  const selectedOrders = selectedExists ? (orderCounts.get(selectedTable) || 0) : 0

  const manageQR = () => {
    if (typeof onManageQR === 'function') onManageQR()
  }

  return (
    <div className="ddtqr mx-auto w-full max-w-3xl space-y-3 pb-6" data-dd-owner-tables-mobile>
      <style jsx global>{`
        .ddtqr { --dt-card:#fff; --dt-ink:#172238; --dt-muted:#68758a; --dt-border:#e3e8ef; --dt-soft:#f3f6fa; color:var(--dt-ink); }
        .ddtqr .ddtqr-card { background:var(--dt-card); border:1px solid var(--dt-border); border-radius:18px; }
        .ddtqr .ddtqr-muted { color:var(--dt-muted); }
        .ddtqr .ddtqr-status { display:inline-flex; align-items:center; gap:6px; width:fit-content; border-radius:999px; padding:5px 9px; font-weight:800; }
        .ddtqr .ddtqr-available { background:#e6f9f1; color:#087b54; }
        .ddtqr .ddtqr-occupied { background:#fff0ee; color:#c24135; }
        .ddtqr .ddtqr-filter { border-radius:11px; min-height:38px; padding:0 6px; font-size:11px; font-weight:800; background:var(--dt-card); border:1px solid var(--dt-border); color:var(--dt-muted); }
        .ddtqr .ddtqr-filter[aria-pressed='true'] { background:#fff0e6; border-color:#fdba74; color:#c2410c; }
        .ddtqr button:focus-visible, .ddtqr input:focus-visible { outline:3px solid #fb923c; outline-offset:2px; }
        :root[data-theme='dark'] .ddtqr, .dark .ddtqr { --dt-card:#1d2634; --dt-ink:#f1f5f9; --dt-muted:#a9b5c7; --dt-border:#354052; --dt-soft:#252f3e; }
        :root[data-theme='dark'] .ddtqr .ddtqr-available, .dark .ddtqr .ddtqr-available { background:#123e34; color:#6ee7b7; }
        :root[data-theme='dark'] .ddtqr .ddtqr-occupied, .dark .ddtqr .ddtqr-occupied { background:#4d2525; color:#fca5a5; }
        :root[data-theme='dark'] .ddtqr .ddtqr-filter[aria-pressed='true'], .dark .ddtqr .ddtqr-filter[aria-pressed='true'] { background:#482c20; color:#fdba74; }
      `}</style>

      {selectedTable !== null ? (
        <>
          <button type="button" onClick={() => setSelectedTable(null)}
            className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-bold text-orange-600">
            <Icon name="back" size={19} /> Back to all tables
          </button>

          {selectedExists ? (
            <>
              <section className="ddtqr-card overflow-hidden p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
                    <Icon name="table" size={27} />
                  </span>
                  <Status occupied={selectedOccupied} />
                </div>
                <p className="ddtqr-muted mt-5 text-xs font-bold uppercase tracking-wider">Restaurant table</p>
                <h2 className="mt-1 break-words text-3xl font-black">Table {selectedTable}</h2>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <div className="rounded-xl p-3" style={{ background:'var(--dt-soft)' }}>
                    <p className="ddtqr-muted text-[11px]">Current status</p>
                    <p className="mt-1 text-sm font-extrabold">{selectedOccupied ? 'Occupied' : 'Available'}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background:'var(--dt-soft)' }}>
                    <p className="ddtqr-muted text-[11px]">Active orders</p>
                    <p className="mt-1 text-sm font-extrabold">{selectedOrders}</p>
                  </div>
                </div>
              </section>

              <button type="button" onClick={manageQR} disabled={typeof onManageQR !== 'function'}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-orange-500 px-4 text-left text-sm font-extrabold text-white shadow-sm disabled:opacity-50">
                <span className="flex items-center gap-3"><Icon name="qr" size={22} /> Manage table QR codes</span>
                <Icon name="arrow" size={19} />
              </button>
              <p className="ddtqr-muted px-1 text-xs leading-5">
                QR generation and signed-QR validation stay in your existing secure QR management page.
              </p>
            </>
          ) : (
            <div className="ddtqr-card p-5 text-center text-sm">This table is no longer in the registered table list.</div>
          )}
        </>
      ) : (
        <>
          <section className="overflow-hidden rounded-[22px] bg-[#17253c] p-4 text-white shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-orange-300">Dining floor</p>
                <h2 className="mt-1 text-xl font-extrabold">Tables overview</h2>
                <p className="mt-1 truncate text-xs text-slate-300">{restaurantName || 'Restaurant'} · QR ordering</p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-orange-200">
                <Icon name="table" size={22} />
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-3">
              <div><p className="text-[10px] text-slate-300">Total</p><p className="mt-0.5 text-2xl font-black">{total}</p></div>
              <div><p className="text-[10px] text-slate-300">Available</p><p className="mt-0.5 text-2xl font-black text-emerald-300">{available}</p></div>
              <div><p className="text-[10px] text-slate-300">Occupied</p><p className="mt-0.5 text-2xl font-black text-rose-300">{occupied}</p></div>
            </div>
          </section>

          {ordersError ? (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
              Order history could not refresh. Table occupancy may be outdated.
            </div>
          ) : !ordersLoaded ? (
            <div role="status" className="ddtqr-muted flex items-center gap-2 px-1 text-[11px]">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Checking current table occupancy…
            </div>
          ) : (
            <div role="status" className="ddtqr-muted flex items-center gap-2 px-1 text-[11px]">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Occupancy based on current active restaurant orders
            </div>
          )}

          <button type="button" onClick={manageQR} disabled={typeof onManageQR !== 'function'}
            className="ddtqr-card flex min-h-[66px] w-full items-center gap-3 px-4 text-left shadow-sm disabled:opacity-50">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
              <Icon name="qr" size={21} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-sm">Manage table QR codes</strong>
              <span className="ddtqr-muted mt-0.5 block text-[11px]">Add tables, generate and print QR posters</span>
            </span>
            <span className="text-orange-500"><Icon name="arrow" size={18} /></span>
          </button>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <h3 className="text-sm font-extrabold">Your tables</h3>
              <span className="ddtqr-muted text-xs">{filtered.length} shown</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Filter tables">
              {FILTERS.map(item => (
                <button key={item.id} type="button" className="ddtqr-filter" aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}>{item.label}</button>
              ))}
            </div>
            <label className="ddtqr-card flex min-h-11 items-center gap-2.5 px-3">
              <span className="ddtqr-muted"><Icon name="search" size={18} /></span>
              <span className="sr-only">Search table number</span>
              <input type="search" value={search} onChange={event => setSearch(event.target.value)}
                placeholder="Search table number" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="ddtqr-muted p-1"><Icon name="close" size={16} /></button>}
            </label>
          </div>

          {filtered.length ? (
            <div className="grid grid-cols-2 gap-2.5">
              {filtered.map(number => {
                const isOccupied = occupiedSet.has(number)
                const count = orderCounts.get(number) || 0
                return (
                  <button key={number} type="button" onClick={() => setSelectedTable(number)}
                    className="ddtqr-card flex min-h-[115px] min-w-0 flex-col items-start justify-between gap-2 p-3.5 text-left transition active:scale-[.99]"
                    aria-label={`Table ${number}, ${isOccupied ? 'occupied' : 'available'}, ${count} active orders. View details.`}>
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${isOccupied ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40'}`}>
                        <Icon name="table" size={20} />
                      </span>
                      <span className="ddtqr-muted"><Icon name="arrow" size={16} /></span>
                    </div>
                    <div className="min-w-0 w-full">
                      <p className="truncate text-sm font-extrabold">Table {number}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Status occupied={isOccupied} compact />
                        {count > 0 && <span className="ddtqr-muted text-[10px]">{count} order{count === 1 ? '' : 's'}</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="ddtqr-card px-4 py-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Icon name="table" size={23} /></span>
              <h4 className="mt-3 text-sm font-extrabold">{total === 0 ? 'No tables registered' : 'No matching tables'}</h4>
              <p className="ddtqr-muted mt-1 text-xs leading-5">
                {total === 0 ? 'Add your first table through the QR management page.' : 'Try another status filter or table number.'}
              </p>
              {total === 0 && <button type="button" onClick={manageQR} className="mt-3 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-white">Manage QR codes</button>}
            </div>
          )}
        </>
      )}
    </div>
  )
}