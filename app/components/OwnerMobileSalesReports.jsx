
'use client'

import { useEffect, useMemo, useState } from 'react'

// Mobile-only reporting UI.
// Uses existing Owner Dashboard calculations and handlers.

const QUICK_RANGES = [
  'daily',
  'weekly',
  'monthly',
  '3months',
]

const REPORT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'trend', label: 'Trend' },
  { id: 'hours', label: 'Peak hours' },
  { id: 'summary', label: 'Summary' },
]

function Icon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  if (name === 'download') {
    return (
      <svg {...common}>
        <path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3" />
      </svg>
    )
  }

  if (name === 'print') {
    return (
      <svg {...common}>
        <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 15h12v6H6z" />
      </svg>
    )
  }

  if (name === 'refresh') {
    return (
      <svg {...common}>
        <path d="M20 7v5h-5M4 17v-5h5M6 8a7 7 0 0 1 12-2l2 1M4 17l2 1a7 7 0 0 0 12-2" />
      </svg>
    )
  }

  if (name === 'arrow') {
    return (
      <svg {...common}>
        <path d="m9 5 7 7-7 7" />
      </svg>
    )
  }

  if (name === 'trend') {
    return (
      <svg {...common}>
        <path d="M3 18h18M5 14l5-5 4 3 5-7" />
      </svg>
    )
  }

  if (name === 'clock') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l4 2" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M4 4h16v16H4zM8 16V9m4 7V6m4 10v-4" />
    </svg>
  )
}

function currencyFallback(value) {
  const number = Number(value)

  return `₹${(
    Number.isFinite(number) ? number : 0
  ).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function hourLabel(hour) {
  const value = Number(hour) || 0

  return `${value % 12 || 12}:00 ${
    value >= 12 ? 'PM' : 'AM'
  }`
}

function compactAmount(value) {
  const amount = Number(value) || 0

  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(1)}Cr`
  }

  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)}L`
  }

  if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}k`
  }

  return `₹${Math.round(amount)}`
}

// Keep all revenue and orders, but group adjacent periods
// into at most seven mobile-friendly chart bars.

function groupBuckets(input) {
  const data = Array.isArray(input) ? input : []

  if (!data.length) return []

  const groupSize = Math.ceil(data.length / 7)
  const result = []

  for (
    let index = 0;
    index < data.length;
    index += groupSize
  ) {
    const group = data.slice(index, index + groupSize)

    const first = String(group[0]?.label || '')
    const last = String(
      group[group.length - 1]?.label || ''
    )

    result.push({
      label:
        first === last
          ? first
          : `${first} – ${last}`,

      shortLabel:
        group.length === 1
          ? first.split(' ')[0].slice(0, 5)
          : `${result.length + 1}`,

      revenue: group.reduce(
        (sum, item) =>
          sum + (Number(item?.revenue) || 0),
        0
      ),

      orders: group.reduce(
        (sum, item) =>
          sum + (Number(item?.orders) || 0),
        0
      ),
    })
  }

  return result
}

function Metric({
  title,
  value,
  caption,
  accent = false,
}) {
  return (
    <div className="ddsr-card min-w-0 p-3.5">
      <p className="ddsr-muted text-[11px] font-semibold">
        {title}
      </p>

      <p
        className={`mt-2 break-words text-[22px] font-extrabold tracking-tight ${
          accent ? 'ddsr-positive' : ''
        }`}
      >
        {value}
      </p>

      {caption && (
        <p className="ddsr-muted mt-1 text-[11px]">
          {caption}
        </p>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  emphasis = false,
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <span className="ddsr-muted text-xs">
        {label}
      </span>

      <strong
        className={`text-right text-xs ${
          emphasis ? 'ddsr-positive' : ''
        }`}
      >
        {value}
      </strong>
    </div>
  )
}

export default function OwnerMobileSalesReports({
  timeframes = [],
  timeframe = 'monthly',
  onTimeframeChange,
  ordersLoaded = false,
  ordersError = '',
  ordersLastSynced = null,
  loadedOrderCount = 0,
  allTimeOrderCount = 0,
  allTimeRevenue = 0,
  periodOrderCount = 0,
  periodRevenue = 0,
  averageOrderValue = 0,
  graphData = [],
  hourlyReport = [],
  peakHour = { hour: 0, orders: 0 },
  formatCurrency = currencyFallback,
  onExport,
  onPrint,
  onRefresh,
}) {
  const [tab, setTab] = useState('overview')
  const [selectedBar, setSelectedBar] = useState(null)
  const [showAllHours, setShowAllHours] = useState(false)

  const formatMoney = value => {
    try {
      return formatCurrency(value)
    } catch {
      return currencyFallback(value)
    }
  }

  const periodLabel =
    timeframes.find(item => item.value === timeframe)
      ?.label || 'Selected period'

  const grouped = useMemo(
    () => groupBuckets(graphData),
    [graphData]
  )

  const highest = useMemo(
    () =>
      grouped.reduce(
        (best, item, index) =>
          item.revenue >
          (grouped[best]?.revenue ?? -1)
            ? index
            : best,
        0
      ),
    [grouped]
  )

  const activeBarIndex =
    selectedBar !== null && grouped[selectedBar]
      ? selectedBar
      : highest

  const activeBar = grouped[activeBarIndex]

  const maxRevenue = Math.max(
    1,
    ...grouped.map(item => item.revenue)
  )

  const activeHours = useMemo(
    () =>
      (Array.isArray(hourlyReport) ? hourlyReport : [])
        .filter(item => Number(item?.orders) > 0)
        .sort(
          (a, b) =>
            Number(b.orders) - Number(a.orders) ||
            Number(a.hour) - Number(b.hour)
        ),
    [hourlyReport]
  )

  const visibleHours = showAllHours
    ? [
        ...(Array.isArray(hourlyReport)
          ? hourlyReport
          : []),
      ].sort(
        (a, b) =>
          Number(a.hour) - Number(b.hour)
      )
    : activeHours.slice(0, 6)

  const maxHourlyOrders = Math.max(
    1,
    ...visibleHours.map(
      item => Number(item.orders) || 0
    )
  )

  const syncedText = ordersLastSynced
    ? new Date(ordersLastSynced).toLocaleTimeString(
        'en-IN',
        {
          hour: 'numeric',
          minute: '2-digit',
        }
      )
    : ''

  const canExport =
    ordersLoaded &&
    !ordersError &&
    periodOrderCount > 0

  useEffect(() => {
    setSelectedBar(null)
    setShowAllHours(false)
  }, [timeframe])

  return (
    <div
      className="ddsr mx-auto w-full max-w-3xl space-y-4 pb-6"
      data-dd-owner-sales-mobile
    >
      <style jsx global>{`
        .ddsr {
          --ddsr-card: #fff;
          --ddsr-text: #172238;
          --ddsr-muted: #66748a;
          --ddsr-border: #e4eaf2;
          --ddsr-soft: #f3f6fa;
          --ddsr-positive: #059669;
          color: var(--ddsr-text);
        }

        :root[data-theme='dark'] .ddsr,
        .dark .ddsr {
          --ddsr-card: #1b2432;
          --ddsr-text: #f1f5f9;
          --ddsr-muted: #a8b4c6;
          --ddsr-border: #344052;
          --ddsr-soft: #242f40;
          --ddsr-positive: #34d399;
        }

        .ddsr .ddsr-card {
          background: var(--ddsr-card);
          border: 1px solid var(--ddsr-border);
          border-radius: 19px;
          box-shadow: 0 5px 16px rgba(15, 23, 42, .025);
        }

        .ddsr .ddsr-muted {
          color: var(--ddsr-muted);
        }

        .ddsr .ddsr-positive {
          color: var(--ddsr-positive);
        }

        .ddsr .ddsr-soft {
          background: var(--ddsr-soft);
        }

        .ddsr button:focus-visible,
        .ddsr select:focus-visible {
          outline: 3px solid #fb923c;
          outline-offset: 2px;
        }

        .ddsr .ddsr-tab {
          border-radius: 11px;
          padding: 11px 2px;
          min-width: 0;
          font-size: 11px;
          font-weight: 800;
          color: var(--ddsr-muted);
        }

        .ddsr .ddsr-tab[aria-selected='true'] {
          background: var(--ddsr-card);
          color: var(--ddsr-text);
          box-shadow: 0 2px 8px rgba(0, 0, 0, .07);
        }

        .ddsr .ddsr-range {
          min-height: 40px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 800;
          border: 1px solid var(--ddsr-border);
          background: var(--ddsr-card);
          color: var(--ddsr-text);
        }

        .ddsr .ddsr-range[aria-pressed='true'] {
          background: #fff0e5;
          color: #c2410c;
          border-color: #fb923c;
        }

        @media print {
          .ddsr .ddsr-no-print {
            display: none !important;
          }

          .ddsr .ddsr-print {
            display: block !important;
          }

          .ddsr {
            color: #111 !important;
          }

          .ddsr .ddsr-card {
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-orange-600">
            Restaurant analytics
          </p>

          <h2 className="mt-1 text-xl font-extrabold tracking-tight">
            Sales reports
          </h2>

          <p className="ddsr-muted mt-1 text-xs">
            Sales performance at a glance.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={typeof onRefresh !== 'function'}
          className="ddsr-card ddsr-no-print flex h-10 w-10 shrink-0 items-center justify-center disabled:opacity-40"
          aria-label="Refresh sales reports"
        >
          <Icon name="refresh" />
        </button>
      </div>

      <div
        className="ddsr-no-print grid grid-cols-5 gap-1.5"
        aria-label="Report period"
      >
        {QUICK_RANGES.map(value => {
          const label =
            value === '3months'
              ? '3M'
              : value === 'daily'
                ? 'Today'
                : value === 'weekly'
                  ? 'Week'
                  : 'Month'

          return (
            <button
              key={value}
              type="button"
              className="ddsr-range"
              aria-pressed={timeframe === value}
              onClick={() =>
                onTimeframeChange?.(value)
              }
            >
              {label}
            </button>
          )
        })}

        <select
          className="ddsr-range w-full px-1 text-center"
          aria-label="More report periods"
          value={
            QUICK_RANGES.includes(timeframe)
              ? ''
              : timeframe
          }
          onChange={event => {
            if (event.target.value) {
              onTimeframeChange?.(event.target.value)
            }
          }}
        >
          <option value="">More</option>

          {timeframes
            .filter(
              item =>
                !QUICK_RANGES.includes(item.value)
            )
            .map(item => (
              <option
                key={item.value}
                value={item.value}
              >
                {item.label}
              </option>
            ))}
        </select>
      </div>

      {ordersError ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800"
        >
          <strong>Order sync needs attention.</strong>{' '}
          {ordersError}

          {ordersLoaded && (
            <p className="mt-1">
              Previously loaded numbers may be outdated.
            </p>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="mt-2 font-extrabold underline"
            >
              Retry synchronization
            </button>
          )}
        </div>
      ) : (
        <div
          role="status"
          className="flex items-center gap-2 text-[11px]"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              ordersLoaded
                ? 'bg-emerald-500'
                : 'bg-amber-500'
            }`}
          />

          <span className="ddsr-muted">
            {ordersLoaded
              ? `${loadedOrderCount} orders synced${
                  syncedText
                    ? ` · ${syncedText}`
                    : ''
                }`
              : 'Loading authenticated order history…'}
          </span>
        </div>
      )}

      <section className="overflow-hidden rounded-[22px] bg-[#14243c] p-5 text-white shadow-lg shadow-slate-900/10">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-300">
            Sales · {periodLabel}
          </p>

          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-200">
            Selected period
          </span>
        </div>

        <p className="mt-3 break-words text-[32px] font-black tracking-tight sm:text-4xl">
          {ordersLoaded
            ? formatMoney(periodRevenue)
            : '—'}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-3">
          <div>
            <p className="text-[11px] text-slate-300">
              Orders
            </p>

            <p className="mt-1 text-xl font-extrabold">
              {ordersLoaded
                ? periodOrderCount
                : '—'}
            </p>
          </div>

          <div>
            <p className="text-[11px] text-slate-300">
              Average order
            </p>

            <p className="mt-1 text-xl font-extrabold">
              {ordersLoaded
                ? formatMoney(averageOrderValue)
                : '—'}
            </p>
          </div>
        </div>
      </section>

      <div
        className="ddsr-no-print ddsr-soft grid grid-cols-4 gap-1 rounded-[15px] p-1"
        role="tablist"
        aria-label="Sales report sections"
      >
        {REPORT_TABS.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className="ddsr-tab"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-label={
          REPORT_TABS.find(item => item.id === tab)
            ?.label
        }
        className="min-w-0 space-y-3"
      >
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Metric
                title="All-time orders"
                value={
                  ordersLoaded
                    ? allTimeOrderCount
                    : '—'
                }
                caption="Excludes cancelled"
              />

              <Metric
                title="All-time sales"
                value={
                  ordersLoaded
                    ? formatMoney(allTimeRevenue)
                    : '—'
                }
                caption="Across loaded history"
                accent
              />
            </div>

            <button
              type="button"
              onClick={() => setTab('trend')}
              className="ddsr-card ddsr-no-print flex w-full items-center gap-3 p-4 text-left"
            >
              <span className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
                <Icon name="trend" size={20} />
              </span>

              <span className="min-w-0 flex-1">
                <strong className="block text-sm">
                  View sales trend
                </strong>

                <span className="ddsr-muted mt-1 block text-xs">
                  Revenue and orders over time
                </span>
              </span>

              <Icon name="arrow" />
            </button>

            <button
              type="button"
              onClick={() => setTab('hours')}
              className="ddsr-card ddsr-no-print flex w-full items-center gap-3 p-4 text-left"
            >
              <span className="rounded-xl bg-amber-50 p-2.5 text-amber-600">
                <Icon name="clock" size={20} />
              </span>

              <span className="min-w-0 flex-1">
                <strong className="block text-sm">
                  Busiest ordering hours
                </strong>

                <span className="ddsr-muted mt-1 block text-xs">
                  {ordersLoaded &&
                  Number(peakHour?.orders) > 0
                    ? `${hourLabel(
                        peakHour.hour
                      )} · ${peakHour.orders} orders`
                    : 'Discover your peak times'}
                </span>
              </span>

              <Icon name="arrow" />
            </button>
          </>
        )}

        {tab === 'trend' && (
          <section className="ddsr-card space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold">
                  Sales trend
                </h3>

                <p className="ddsr-muted mt-1 text-xs">
                  Grouped periods for a clear mobile chart
                </p>
              </div>

              <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                {periodLabel}
              </span>
            </div>

            {ordersLoaded && grouped.length ? (
              <>
                <div
                  className="rounded-xl p-3"
                  style={{
                    background: 'var(--ddsr-soft)',
                  }}
                  aria-live="polite"
                >
                  <p className="ddsr-muted text-[11px]">
                    {activeBar?.label || periodLabel}
                  </p>

                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <strong className="text-lg">
                      {formatMoney(
                        activeBar?.revenue || 0
                      )}
                    </strong>

                    <span className="ddsr-muted text-xs">
                      {activeBar?.orders || 0} orders
                    </span>
                  </div>
                </div>

                <div
                  className="flex h-[178px] items-end gap-2 border-b pb-2"
                  style={{
                    borderColor: 'var(--ddsr-border)',
                  }}
                  role="group"
                  aria-label="Sales by grouped period"
                >
                  {grouped.map((item, index) => (
                    <button
                      key={`${item.label}-${index}`}
                      type="button"
                      aria-pressed={
                        activeBarIndex === index
                      }
                      aria-label={`${item.label}: ${formatMoney(
                        item.revenue
                      )}, ${item.orders} orders`}
                      onClick={() =>
                        setSelectedBar(index)
                      }
                      className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                    >
                      <span className="ddsr-muted text-[9px] font-bold">
                        {item.revenue > 0
                          ? compactAmount(
                              item.revenue
                            )
                          : ''}
                      </span>

                      <span
                        className={`block w-full max-w-[48px] rounded-t-lg transition-colors ${
                          activeBarIndex === index
                            ? 'bg-orange-500'
                            : 'bg-orange-200'
                        }`}
                        style={{
                          height: `${Math.max(
                            item.revenue > 0
                              ? 7
                              : 2,
                            (item.revenue /
                              maxRevenue) *
                              125
                          )}px`,
                        }}
                      />

                      <span className="ddsr-muted h-3 text-[10px] font-bold">
                        {item.shortLabel}
                      </span>
                    </button>
                  ))}
                </div>

                {grouped.some(
                  item =>
                    item.label !== item.shortLabel
                ) && (
                  <p className="ddsr-muted text-[11px]">
                    Bars 1–{grouped.length} represent
                    consecutive date/time groups. Tap a
                    bar for its exact range and sales.
                  </p>
                )}

                {!grouped.some(
                  item => item.revenue > 0
                ) && (
                  <p className="ddsr-muted text-xs">
                    No sales recorded in this period.
                  </p>
                )}
              </>
            ) : (
              <p className="ddsr-muted py-8 text-center text-xs">
                {ordersLoaded
                  ? 'No sales data for this period.'
                  : 'Loading sales chart…'}
              </p>
            )}
          </section>
        )}

        {tab === 'hours' && (
          <section className="ddsr-card space-y-4 p-4">
            <div>
              <h3 className="text-base font-extrabold">
                Peak ordering hours
              </h3>

              <p className="ddsr-muted mt-1 text-xs">
                Based on the selected{' '}
                {periodLabel.toLowerCase()} period
              </p>
            </div>

            <div className="rounded-2xl bg-[#fff5e9] p-4 text-[#9a4600]">
              <p className="text-[11px] font-bold uppercase tracking-wider">
                Busiest hour
              </p>

              <p className="mt-1 text-2xl font-extrabold">
                {ordersLoaded &&
                Number(peakHour?.orders) > 0
                  ? hourLabel(peakHour.hour)
                  : 'No orders yet'}
              </p>

              <p className="mt-1 text-xs">
                {ordersLoaded
                  ? `${
                      Number(peakHour?.orders) || 0
                    } orders`
                  : 'Loading order history…'}
              </p>
            </div>

            {ordersLoaded &&
            activeHours.length > 0 ? (
              <div className="space-y-3">
                {visibleHours.map(item => (
                  <div
                    key={item.hour}
                    className="grid grid-cols-[62px_minmax(0,1fr)_64px] items-center gap-2.5"
                  >
                    <span className="ddsr-muted text-[11px] font-semibold">
                      {hourLabel(item.hour)}
                    </span>

                    <div
                      className="h-2.5 overflow-hidden rounded-full"
                      style={{
                        background:
                          'var(--ddsr-soft)',
                      }}
                    >
                      <div
                        className="h-full rounded-full bg-orange-500"
                        style={{
                          width: `${Math.max(
                            0,
                            ((Number(
                              item.orders
                            ) || 0) /
                              maxHourlyOrders) *
                              100
                          )}%`,
                        }}
                      />
                    </div>

                    <span className="text-right text-[11px] font-bold">
                      {item.orders} orders
                    </span>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setShowAllHours(
                      value => !value
                    )
                  }
                  className="ddsr-no-print min-h-10 w-full rounded-xl border text-xs font-bold"
                  style={{
                    borderColor:
                      'var(--ddsr-border)',
                  }}
                >
                  {showAllHours
                    ? 'Show busiest hours only'
                    : 'View all 24 hours'}
                </button>
              </div>
            ) : (
              <p className="ddsr-muted py-3 text-center text-xs">
                {ordersLoaded
                  ? 'No hourly order activity in this period.'
                  : 'Loading hourly activity…'}
              </p>
            )}
          </section>
        )}

        {tab === 'summary' && (
          <section className="ddsr-card p-4">
            <h3 className="text-base font-extrabold">
              Report summary
            </h3>

            <div
              className="mt-2 divide-y"
              style={{
                borderColor:
                  'var(--ddsr-border)',
              }}
            >
              <Row
                label="Period"
                value={periodLabel}
              />

              <Row
                label="Orders generated"
                value={
                  ordersLoaded
                    ? periodOrderCount
                    : '—'
                }
              />

              <Row
                label="Sales generated"
                value={
                  ordersLoaded
                    ? formatMoney(periodRevenue)
                    : '—'
                }
                emphasis
              />

              <Row
                label="Average order value"
                value={
                  ordersLoaded
                    ? formatMoney(
                        averageOrderValue
                      )
                    : '—'
                }
              />

              <Row
                label="All-time orders"
                value={
                  ordersLoaded
                    ? allTimeOrderCount
                    : '—'
                }
              />

              <Row
                label="All-time sales"
                value={
                  ordersLoaded
                    ? formatMoney(allTimeRevenue)
                    : '—'
                }
              />

              <Row
                label="Peak hour"
                value={
                  ordersLoaded &&
                  Number(peakHour?.orders) > 0
                    ? hourLabel(
                        peakHour.hour
                      )
                    : '—'
                }
              />

              <Row
                label="Report status"
                value={
                  ordersError
                    ? 'Sync error'
                    : !ordersLoaded
                      ? 'Loading'
                      : canExport
                        ? 'Ready to export'
                        : 'No orders to export'
                }
              />
            </div>
          </section>
        )}
      </div>

      <div className="ddsr-no-print grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={
            !canExport ||
            typeof onExport !== 'function'
          }
          className="flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-orange-500 px-3 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="download" size={17} />
          Export CSV
        </button>

        <button
          type="button"
          onClick={onPrint}
          disabled={
            !ordersLoaded ||
            typeof onPrint !== 'function'
          }
          className="ddsr-card flex min-h-12 items-center justify-center gap-2 px-3 text-xs font-extrabold disabled:opacity-40"
        >
          <Icon name="print" size={17} />
          Print report
        </button>
      </div>

      <p className="ddsr-muted text-center text-[10px]">
        Figures use the existing authenticated
        restaurant orders and exclude cancelled
        orders from sales.
      </p>

      <section className="ddsr-print hidden">
        <h2>
          Restaurant sales report — {periodLabel}
        </h2>

        <p>
          Orders: {periodOrderCount} · Sales:{' '}
          {formatMoney(periodRevenue)} · Average:{' '}
          {formatMoney(averageOrderValue)}
        </p>

        <p>
          All-time orders: {allTimeOrderCount} ·
          All-time sales: {formatMoney(allTimeRevenue)}
        </p>

        <p>
          Peak hour:{' '}
          {Number(peakHour?.orders) > 0
            ? hourLabel(peakHour.hour)
            : 'No orders'}
        </p>
      </section>
    </div>
  )
}
