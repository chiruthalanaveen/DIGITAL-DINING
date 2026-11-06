'use client'

import { useEffect, useMemo, useState } from 'react'

const RESTAURANT_TOOLS = [
  { id: 'settlements', label: 'Dashboard & Reports', info: 'Sales, analytics and activity', icon: 'chart', group: 'Overview' },
  { id: 'menu', label: 'Menu & Products', info: 'Items, pricing, photos and availability', icon: 'menu', group: 'Operations' },
  { id: 'tables', label: 'Tables', info: 'Table management and QR ordering', icon: 'grid', group: 'Operations' },
  { id: 'billing', label: 'Billing & Invoices', info: 'Bills, branding and receipts', icon: 'receipt', group: 'Operations' },
  { id: 'staff', label: 'Managers', info: 'Manager access and responsibilities', icon: 'users', group: 'People', advanced: true },
  { id: 'staff-access', label: 'Staff Login QR', info: 'Kitchen, waiter and staff access', icon: 'scan', group: 'People' },
  { id: 'taxes', label: 'Taxes & Packing', info: 'GST and packaging charges', icon: 'settings', group: 'Settings' },
  { id: 'offers', label: 'Offers & Promotions', info: 'Daily offers and discounts', icon: 'sparkles', group: 'Settings' },
  { id: 'swiggy-sync', label: 'Menu Import / Sync', info: 'Import and sync your catalogue', icon: 'refresh', group: 'Settings', advanced: true },
  { id: 'gateway', label: 'Payment Gateways', info: 'Razorpay and pay-at-counter', icon: 'wallet', group: 'Settings' },
  { id: 'alarm-settings', label: 'Kitchen & Waiter Alarms', info: 'Notification sound settings', icon: 'bell', group: 'Settings', advanced: true },
]

const paths = {
  home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  chart: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 16v-4m5 4V8m5 8v-6" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  receipt: <path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h8" />,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 8a3 3 0 0 1 0 6m1 2a5 5 0 0 1 3 4" /></>,
  scan: <path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M4 12h16" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  sparkles: <path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" />,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-3l2.5 1M4 17l2.5 1A7 7 0 0 0 18.5 15" /></>,
  wallet: <><rect x="2" y="5" width="20" height="16" rx="3" /><path d="M2 9h20m-5 5h3" /></>,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>,
  close: <path d="M5 5 19 19M19 5 5 19" />,
  arrow: <path d="m9 18 6-6-6-6" />,
  hotel: <path d="M4 21V4h16v17M2 21h20M8 8h2m4 0h2M8 12h2m4 0h2M10 21v-5h4v5" />,
  truck: <path d="M3 5h12v12H3zM15 9h4l3 4v4h-7M7 17a2 2 0 1 0 4 0m6 0a2 2 0 1 0 4 0" />,
  support: <path d="M4 13v-2a8 8 0 0 1 16 0v2M4 13H3v5h4v-5zM20 13h1v5h-4v-5zM17 20c-1 2-4 2-6 2" />,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v4m-3 3h4" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
}

function Icon({ name, size = 21 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.grid}
    </svg>
  )
}

export default function OwnerMobileCommandCenter({
  restaurantName = 'My business',
  mode = 'restaurant',
  activeTab = 'settlements',
  hasRestaurant = true,
  hasDelivery = false,
  hasResort = false,
  advanced = true,
  onModeChange,
  onRestaurantTab,
  onProfile,
  onQR,
  onSupport,
  onWallet,
}) {
  const [opened, setOpened] = useState(false)
  const [search, setSearch] = useState('')

  const modules = [
    ...(hasRestaurant ? [{ id: 'restaurant', label: 'Restaurant', icon: 'grid' }] : []),
    ...(hasDelivery ? [{ id: 'delivery', label: 'Delivery', icon: 'truck' }] : []),
    ...(hasResort ? [{ id: 'resort', label: 'Resort', icon: 'hotel' }] : []),
  ]

  const tools = useMemo(
    () =>
      RESTAURANT_TOOLS.filter(
        (t) =>
          (advanced || !t.advanced) &&
          `${t.label} ${t.info} ${t.group}`.toLowerCase().includes(search.toLowerCase().trim())
      ),
    [advanced, search]
  )

  useEffect(() => {
    if (!opened) return
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onEscape = (e) => {
      if (e.key === 'Escape') setOpened(false)
    }
    document.addEventListener('keydown', onEscape)
    return () => {
      document.body.style.overflow = oldOverflow
      document.removeEventListener('keydown', onEscape)
    }
  }, [opened])

  // Show ONLY the selected section, then jump to the top of the page.
  const showOnly = (target, tab) => {
    setOpened(false)
    setSearch('')
    if (target === 'restaurant' && tab) onRestaurantTab?.(tab)
    else onModeChange?.(target)
    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 60)
  }

  const action = (callback) => {
    setOpened(false)
    setSearch('')
    callback?.()
  }

  const currentName = modules.find((item) => item.id === mode)?.label || 'Workspace'

  const bottom = [
    { id: 'home', label: 'Home', icon: 'home', onClick: () => showOnly('restaurant', 'settlements') },
    ...(hasRestaurant
      ? [{ id: 'restaurant', label: 'Restaurant', icon: 'grid', onClick: () => showOnly('restaurant', 'settlements') }]
      : []),
    ...(hasDelivery ? [{ id: 'delivery', label: 'Delivery', icon: 'truck', onClick: () => showOnly('delivery') }] : []),
    ...(hasResort ? [{ id: 'resort', label: 'Resort', icon: 'hotel', onClick: () => showOnly('resort') }] : []),
    { id: 'wallet', label: 'Wallet', icon: 'wallet', onClick: () => action(onWallet) },
    { id: 'more', label: 'All tools', icon: 'more', onClick: () => setOpened(true) },
  ].slice(0, 5)

  const isSelected = (item) => {
    if (item.id === 'more') return opened
    if (item.id === 'home') return false
    if (item.id === 'wallet') return false
    return item.id === mode || (mode === 'restaurant' && item.id === 'restaurant' && activeTab)
  }

  return (
    <>
      <style jsx global>{`
        .dd-mobile-command { display: none; }
        @media (max-width: 1023px) {
          .dd-mobile-command { display: block; }
        }
      `}</style>

      <div className="dd-mobile-command">
        <div className="mb-4 rounded-[24px] border border-neutral-200 bg-white p-4 shadow-[0_4px_22px_rgba(15,23,42,.05)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[.15em] text-orange-600">Owner workspace</p>
              <h2 className="mt-1 truncate text-xl font-extrabold tracking-tight text-neutral-900">{restaurantName}</h2>
              <p className="mt-1 text-xs text-neutral-500">{currentName}</p>
            </div>
            <button
              type="button"
              onClick={() => action(onProfile)}
              aria-label="Open owner profile"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-800"
            >
              <Icon name="profile" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOpened(true)}
            className="mt-4 flex min-h-12 w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 text-left text-sm font-medium text-neutral-500"
            aria-label="Search settings and tools"
          >
            <Icon name="search" size={19} />
            Search settings, orders, payments…
            <span className="ml-auto"><Icon name="arrow" size={17} /></span>
          </button>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {modules.slice(0, 3).map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => showOnly(item.id, item.id === 'restaurant' ? 'settlements' : undefined)}
                className={`flex min-h-[78px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1 text-[11px] font-bold ${
                  mode === item.id
                    ? 'border-orange-200 bg-orange-50 text-orange-700'
                    : 'border-neutral-200 bg-white text-neutral-700'
                }`}
              >
                <Icon name={item.icon} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <nav
        aria-label="Mobile owner navigation"
        className="dd-mobile-command fixed bottom-0 left-0 right-0 z-[85] grid h-[calc(68px+env(safe-area-inset-bottom))] grid-cols-5 border-t border-neutral-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_rgba(0,0,0,.07)] backdrop-blur-xl"
      >
        {bottom.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={item.onClick}
            aria-label={item.label}
            aria-current={isSelected(item) ? 'page' : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold ${
              isSelected(item) ? 'text-orange-600' : 'text-neutral-500'
            }`}
          >
            <Icon name={item.icon} size={21} />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </nav>

      {opened && (
        <div
          className="dd-mobile-command fixed inset-0 z-[120] flex items-end justify-center bg-neutral-950/55 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpened(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dd-tools-title"
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-[#f8f9fb] text-neutral-900 shadow-2xl"
          >
            <div className="border-b border-neutral-200 bg-white px-5 pb-4 pt-3">
              <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-neutral-200" />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-orange-600">Digital Dine-In</p>
                  <h2 id="dd-tools-title" className="mt-1 text-2xl font-extrabold tracking-tight">All tools & settings</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpened(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100"
                  aria-label="Close tools"
                >
                  <Icon name="close" />
                </button>
              </div>
              <label className="mt-4 flex h-12 items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 text-neutral-500">
                <Icon name="search" size={19} />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find a setting or feature"
                  className="w-full min-w-0 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
                  aria-label="Search settings"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
              {!search && (
                <>
                  <h3 className="px-1 text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">Your businesses</h3>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {modules.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => showOnly(m.id, m.id === 'restaurant' ? 'settlements' : undefined)}
                        className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border text-xs font-bold ${
                          mode === m.id ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-neutral-200 bg-white'
                        }`}
                      >
                        <Icon name={m.icon} />
                        {m.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {hasRestaurant && (
                <>
                  <h3 className="mb-2 mt-5 px-1 text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">Restaurant tools</h3>
                  <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                    {tools.length ? (
                      tools.map((t, i) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => showOnly('restaurant', t.id)}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left active:bg-orange-50 ${i ? 'border-t border-neutral-100' : ''}`}
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
                            <Icon name={t.icon} size={19} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-bold text-neutral-900">{t.label}</span>
                            <span className="mt-0.5 block text-[11px] text-neutral-500">{t.info}</span>
                          </span>
                          <Icon name="arrow" size={17} />
                        </button>
                      ))
                    ) : (
                      <p className="px-4 py-6 text-center text-sm text-neutral-500">No restaurant tools match your search.</p>
                    )}
                  </div>
                </>
              )}

              <h3 className="mb-2 mt-5 px-1 text-[11px] font-extrabold uppercase tracking-widest text-neutral-500">More</h3>
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                {[
                  { label: 'Owner wallet', info: 'Balance, transactions and platform fees', icon: 'wallet', go: () => action(onWallet) },
                  ...(hasDelivery ? [{ label: 'Delivery management', info: 'Orders, drivers and settings', icon: 'truck', go: () => showOnly('delivery') }] : []),
                  ...(hasResort ? [{ label: 'Resort management', info: 'Rooms, bookings and pricing', icon: 'hotel', go: () => showOnly('resort') }] : []),
                  { label: 'Owner profile', info: 'Account information and privacy', icon: 'profile', go: () => action(onProfile) },
                  ...(hasRestaurant ? [{ label: 'Restaurant QR codes', info: 'QR code management', icon: 'qr', go: () => action(onQR) }] : []),
                  { label: 'Live Support', info: 'AI assistant and Admin support', icon: 'support', go: () => action(onSupport) },
                ]
                  .filter((t) => !search || `${t.label} ${t.info}`.toLowerCase().includes(search.toLowerCase()))
                  .map((t, i) => (
                    <button
                      type="button"
                      key={t.label}
                      onClick={t.go}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${i ? 'border-t border-neutral-100' : ''}`}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100">
                        <Icon name={t.icon} size={19} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold">{t.label}</span>
                        <span className="block text-[11px] text-neutral-500">{t.info}</span>
                      </span>
                      <Icon name="arrow" size={17} />
                    </button>
                  ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  )
}