'use client'

import { useMemo, useState } from 'react'

// Digital Dine-In: the same secured restaurant orders used by the owner's
// existing Billing tab, displayed directly in the mobile Orders tab.
// No new Supabase query or payment/billing mutation is performed here.

const PAGE_SIZE = 30

function billNumber(order) {
  if (!order?.id) return 'BILL-000000'
  const suffix = String(order.id)
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-8)
    .toUpperCase()
  return `BILL-${suffix.padStart(8, '0')}`
}

function validDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function localDateKey(value) {
  const date = validDate(value)
  if (!date) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(value) {
  const date = validDate(value)
  return date ? date.toLocaleDateString('en-GB') : '—'
}

function formatTime(value) {
  const date = validDate(value)
  return date ? date.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  }) : '—'
}

function formatAmount(value) {
  const amount = Number(value || 0)
  return `₹${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`
}

export default function OwnerMobileBillingOrders({
  orders = [],
  ordersLoaded = false,
  ordersError = '',
  onGenerateBill,
  onViewDetails,
  onRefresh,
}) {
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const filteredOrders = useMemo(() => {
    const text = search.trim().toLowerCase()
    const safeOrders = Array.isArray(orders) ? orders : []
    return safeOrders
      .filter(order => {
        if (!order || typeof order !== 'object') return false
        const matchesDate = !dateFilter || localDateKey(order.created_at) === dateFilter
        if (!matchesDate) return false
        if (!text) return true
        const searchable = [
          billNumber(order), order.id, order.order_number, order.order_code,
          order.table_number, order.payment_mode, order.status,
        ].map(value => String(value ?? '').toLowerCase()).join(' ')
        return searchable.includes(text)
      })
      .sort((a, b) => {
        const aTime = validDate(a.created_at)?.getTime() || 0
        const bTime = validDate(b.created_at)?.getTime() || 0
        return bTime - aTime
      })
  }, [orders, search, dateFilter])

  const shownOrders = filteredOrders.slice(0, visibleCount)

  const updateSearch = value => {
    setSearch(value)
    setVisibleCount(PAGE_SIZE)
  }

  const updateDate = value => {
    setDateFilter(value)
    setVisibleCount(PAGE_SIZE)
  }

  return (
    <section className="ddp-fade space-y-3" aria-label="Restaurant billing orders">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold">Orders</h2>
          <p className="ddp-muted mt-1 text-xs">
            {ordersLoaded ? `${filteredOrders.length} billing order${filteredOrders.length === 1 ? '' : 's'}` : 'Loading billing orders…'}
          </p>
        </div>
        {typeof onRefresh === 'function' && (
          <button
            type="button"
            onClick={onRefresh}
            className="min-h-10 rounded-xl border px-3 text-xs font-bold"
            style={{ borderColor: 'var(--ddp-border)' }}
          >
            Refresh
          </button>
        )}
      </div>

      <div className="ddp-surface grid gap-2 p-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="ddp-muted mb-1 block text-[11px] font-semibold">Search bills or tables</span>
          <input
            type="search"
            value={search}
            onChange={event => updateSearch(event.target.value)}
            placeholder="Bill ID, table, status…"
            className="min-h-11 w-full min-w-0 rounded-xl border bg-transparent px-3 text-sm outline-none"
            style={{ borderColor: 'var(--ddp-border)', color: 'var(--ddp-text)' }}
          />
        </label>
        <label className="block min-w-0">
          <span className="ddp-muted mb-1 block text-[11px] font-semibold">Order date (optional)</span>
          <input
            type="date"
            value={dateFilter}
            onChange={event => updateDate(event.target.value)}
            className="min-h-11 w-full min-w-0 rounded-xl border bg-transparent px-3 text-sm outline-none"
            style={{ borderColor: 'var(--ddp-border)', color: 'var(--ddp-text)' }}
          />
        </label>
      </div>

      {ordersError && (
        <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-600">
          {ordersError}{ordersLoaded && Array.isArray(orders) && orders.length ? ' Showing previously loaded orders.' : ''}
        </p>
      )}

      {!ordersLoaded && !(Array.isArray(orders) && orders.length) ? (
        <p className="ddp-muted py-8 text-center text-sm">Synchronizing your restaurant orders…</p>
      ) : filteredOrders.length === 0 ? (
        <div className="ddp-surface p-6 text-center text-sm">
          No matching billing orders. Try another date or search.
        </div>
      ) : (
        <div className="space-y-3">
          {shownOrders.map((order, index) => (
            <article key={String(order.id || `${order.created_at}-${index}`)} className="ddp-surface overflow-hidden p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-orange-500/20 bg-orange-500/10 px-2.5 py-1.5 text-[11px] font-extrabold text-orange-500">
                  {billNumber(order)}
                </span>
                <span className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold" style={{ background: 'var(--ddp-bg)' }}>
                  Table {String(order.table_number || '1')}
                </span>
                <span className="ddp-muted text-[11px] font-extrabold uppercase">
                  {String(order.status || 'pending').replaceAll('_', ' ')}
                </span>
              </div>

              <div className="ddp-muted mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px]">
                <span>📅 {formatDate(order.created_at)}</span>
                <span>🕒 {formatTime(order.created_at)}</span>
                <span>💳 {String(order.payment_mode || 'Online')}</span>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="ddp-muted text-[10px] font-bold uppercase tracking-wide">Total</p>
                  <p className="mt-1 text-xl font-extrabold text-emerald-500">
                    {formatAmount(order.total_amount)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onGenerateBill?.(order)}
                  disabled={typeof onGenerateBill !== 'function'}
                  className="min-h-12 rounded-2xl bg-orange-500 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  🧾 Generate Bill
                </button>
              </div>

              {typeof onViewDetails === 'function' && (
                <button
                  type="button"
                  onClick={() => onViewDetails(order)}
                  className="ddp-muted mt-3 text-xs font-semibold underline underline-offset-4"
                >
                  View order details
                </button>
              )}
            </article>
          ))}
          {shownOrders.length < filteredOrders.length && (
            <button
              type="button"
              onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
              className="ddp-surface min-h-12 w-full text-sm font-bold"
            >
              Load more orders ({filteredOrders.length - shownOrders.length} remaining)
            </button>
          )}
        </div>
      )}
    </section>
  )
}