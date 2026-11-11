'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ThemeToggle from '@/app/components/ThemeToggle'
import OwnerDeliveryWallet from '@/app/components/OwnerDeliveryWallet'
import OwnerMobileBillingOrders from '@/app/components/OwnerMobileBillingOrders'

// DD_OWNER_MOBILE_PLACEMENTS_20261111
// Navigation only. Existing owner APIs, permissions, subscriptions, wallet,
// billing, signed QR and management components remain the source of truth.

const SHAPES = {
  home: <><path d="m3 10 9-7 9 7v11H3z" /><path d="M9 21v-8h6v8" /></>,
  box: <><path d="m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 5 9-5M12 12v10" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  chart: <><path d="M3 20h18M6 16v-6m6 6V5m6 11V9" /></>,
  settings: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></>,
  support: <><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 14H2v6h5v-6zM20 14h2v6h-5v-6zM17 21c-1 1-3 1-5 1" /></>,
  wallet: <><rect x="2" y="5" width="20" height="16" rx="3" /><path d="M2 10h20m-5 5h3" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h8" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 8a3 3 0 0 1 0 6m1 2c2 1 3 3 3 5" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 6-3 7-3 9h18c0-2-3-3-3-9M10 21h4" /></>,
  search: <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></>,
  arrow: <><path d="m9 5 7 7-7 7" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M15 15h3v3h-3m5-4v7m-6 0h3" /></>,
  spark: <><path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7z" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5M6 8a7 7 0 0 1 12-2l2 1M4 17l2 1a7 7 0 0 0 12-2" /></>,
  truck: <><path d="M3 6h12v12H3zM15 10h4l3 4v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="19" cy="18" r="2" /></>,
  pin: <><path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0z" /><circle cx="12" cy="10" r="2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  back: <><path d="m15 18-6-6 6-6M9 12h12" /></>,
}

function Icon({ name, size = 20 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      {SHAPES[name] || SHAPES.grid}
    </svg>
  )
}

const MONEY = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
})
const formatMoney = value => MONEY.format(Number(value) || 0)
const formatDate = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN', {
    dateStyle: 'medium', timeStyle: 'short',
  })
}

const RESTAURANT_BUSINESS = [
  { id: 'menu', label: 'Menu & categories', detail: 'Dishes, images, prices and availability', icon: 'grid', target: 'menu' },
  { id: 'offers', label: 'Offers', detail: 'Daily promotions and discounts', icon: 'spark', target: 'offers' },
]
const RESTAURANT_SETTINGS = [
  { id: 'tables', label: 'Tables & QR', detail: 'Tables and QR ordering configuration', icon: 'qr', target: 'tables' },
  { id: 'qr', label: 'Table QR posters', detail: 'Open the existing signed QR management page', icon: 'qr', action: 'qr' },
  { id: 'staff', label: 'Managers', detail: 'Manager accounts and permissions', icon: 'users', target: 'staff', advanced: true },
  { id: 'staff-access', label: 'Staff login QR', detail: 'Kitchen, waiter and staff access', icon: 'users', target: 'staff-access' },
  { id: 'taxes', label: 'GST & packing', detail: 'Taxes and packing charges', icon: 'receipt', target: 'taxes' },
  { id: 'gateway', label: 'Payment gateways', detail: 'Razorpay and pay-at-counter configuration', icon: 'wallet', target: 'gateway' },
  { id: 'billing', label: 'Bill header & branding', detail: 'Invoices, signatures and bill settings', icon: 'receipt', target: 'billing' },
  { id: 'alarm-settings', label: 'Alarm settings', detail: 'Kitchen and waiter sound alerts', icon: 'bell', target: 'alarm-settings', advanced: true },
  { id: 'swiggy-sync', label: 'Menu integrations', detail: 'Import and synchronize the menu', icon: 'refresh', target: 'swiggy-sync', advanced: true },
]
const DELIVERY_BUSINESS = [
  { id: 'menu', label: 'Delivery products', detail: 'Delivery menu and catalogue', icon: 'grid', target: 'menu' },
  { id: 'inventory', label: 'Products & inventory', detail: 'Stock and availability', icon: 'box', target: 'inventory' },
  { id: 'cod', label: 'COD cash', detail: 'Cash-on-delivery reconciliation', icon: 'wallet', target: 'cod' },
  { id: 'billing', label: 'Delivery billing', detail: 'Existing delivery invoices', icon: 'receipt', target: 'billing' },
  { id: 'offers', label: 'Delivery offers', detail: 'Delivery campaigns and discounts', icon: 'spark', target: 'offers' },
  { id: 'website', label: 'Ordering website', detail: 'Delivery storefront management', icon: 'grid', target: 'website' },
]
const DELIVERY_SETTINGS = [
  { id: 'drivers', label: 'Drivers', detail: 'Assignments and driver operations', icon: 'truck', target: 'drivers' },
  { id: 'packers', label: 'Packers', detail: 'Packing team and workflow', icon: 'users', target: 'packers' },
  { id: 'service_area', label: 'Service area & fees', detail: 'Delivery radius and coverage', icon: 'pin', target: 'service_area' },
  { id: 'settings', label: 'Delivery configuration', detail: 'Minimum order, handling and surge settings', icon: 'settings', target: 'settings' },
  { id: 'support-chat', label: 'Delivery support chat', detail: 'Existing delivery support desk', icon: 'support', target: 'support-chat' },
]

function ToolButton({ label, detail, icon, onClick }) {
  return (
    <button type="button" className="ddp-entry" onClick={onClick}>
      <span className="ddp-icon"><Icon name={icon} /></span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[13px]">{label}</strong>
        <span className="ddp-muted mt-0.5 block text-[11px]">{detail}</span>
      </span>
      <Icon name="arrow" size={16} />
    </button>
  )
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="ddp-muted px-1 text-[11px] font-extrabold uppercase tracking-[.13em]">{title}</h3>
      <div className="ddp-surface overflow-hidden">{children}</div>
    </section>
  )
}

function NavButton({ id, title, icon, screen, onClick }) {
  return (
    <button type="button" className={'ddp-nav-item ' + (screen === id ? 'ddp-nav-current' : '')}
      aria-current={screen === id ? 'page' : undefined} onClick={() => onClick(id)}>
      <Icon name={icon} size={21} />
      <span>{title}</span>
    </button>
  )
}

export default function OwnerPremiumMobileHub({
  restaurantId = '', businessName = 'My business', businessCode = '',
  mode = 'restaurant', hasRestaurant = true, hasDelivery = false, hasResort = false,
  advanced = true, storeOpen = true, savingStore = false,
  onStoreToggle, onModeChange, onRestaurantTab, onProfile, onQR, onSupport,
  onWorkspaceOpen, onMobileScreenChange, onLogout,
  orders = [], ordersLoaded = false, ordersError = '',
  todayRevenue = 0, totalRevenue = 0, activeCount = 0, todayCount = 0,
  graphData = [], onRefresh, onGenerateBill,
}) {
  const [screen, setScreen] = useState('home')
  const [portalReady, setPortalReady] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const screenScrollRef = useRef(null)
  const [settingsQuery, setSettingsQuery] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const lastFocus = useRef(null)

  const enabled = [
    ...(hasRestaurant ? [{ key: 'restaurant', label: 'Restaurant', icon: 'receipt' }] : []),
    ...(hasDelivery ? [{ key: 'delivery', label: 'Delivery', icon: 'truck' }] : []),
    ...(hasResort ? [{ key: 'resort', label: 'Resort', icon: 'layers' }] : []),
  ]
  const currentMode = enabled.some(item => item.key === mode) ? mode : (enabled[0]?.key || 'restaurant')
  const currentModule = enabled.find(item => item.key === currentMode)
  const safeOrders = Array.isArray(orders) ? orders : []
  const graph = Array.isArray(graphData) ? graphData : []
  const maxGraph = Math.max(1, ...graph.map(item => Number(item.revenue) || 0))
  const graphLine = graph.length > 1 ? graph.map((item, index) => {
    const x = (index / (graph.length - 1)) * 100
    const y = 47 - ((Number(item.revenue) || 0) / maxGraph) * 39
    return `${x},${y}`
  }).join(' ') : ''

  // The mobile app is an independent viewport, not a section of the desktop page.
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)')
    const sync = () => setIsMobile(query.matches)
    sync()
    setPortalReady(true)
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    if (!isMobile) return undefined
    const bodyOverflow = document.body.style.overflow
    const htmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = bodyOverflow
      document.documentElement.style.overflow = htmlOverflow
    }
  }, [isMobile])

  useEffect(() => {
    if (!selectedOrder) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = event => {
      if (event.key === 'Escape') setSelectedOrder(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      lastFocus.current?.focus?.()
    }
  }, [selectedOrder])

  function chooseScreen(next) {
    setScreen(next)
    setSelectedOrder(null)
    onMobileScreenChange?.()
    screenScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }

  function switchModule(next) {
    if (!enabled.some(item => item.key === next)) return
    onMobileScreenChange?.()
    setScreen('home')
    onModeChange?.(next)
  }

  function openWorkspace(nextMode, tab = 'overview', title = '') {
    if (!enabled.some(item => item.key === nextMode)) return
    setSelectedOrder(null)
    onModeChange?.(nextMode)
    if (nextMode === 'restaurant') onRestaurantTab?.(tab)
    onWorkspaceOpen?.(nextMode, tab, title)
  }

  function openTool(tool, nextMode) {
    if (tool.action === 'qr') {
      onQR?.()
      return
    }
    openWorkspace(nextMode, tool.target || 'overview', tool.label)
  }

  function openWallet() {
    onMobileScreenChange?.()
    setScreen('wallet')
  }


  const settings = useMemo(() => {
    const term = settingsQuery.trim().toLowerCase()
    return {
      restaurant: RESTAURANT_SETTINGS.filter(item => (
        (advanced || !item.advanced) &&
        `${item.label} ${item.detail}`.toLowerCase().includes(term)
      )),
      delivery: DELIVERY_SETTINGS.filter(item => `${item.label} ${item.detail}`.toLowerCase().includes(term)),
    }
  }, [advanced, settingsQuery])

  function renderTools(tools, nextMode) {
    return tools.map(tool => (
      <ToolButton key={`${nextMode}-${tool.id}`} label={tool.label}
        detail={tool.detail} icon={tool.icon} onClick={() => openTool(tool, nextMode)} />
    ))
  }

  if (!portalReady || !isMobile) return null

  return createPortal(
    <div ref={screenScrollRef} className="ddp-root" data-owner-mobile="independent-app-20261111">
      <style jsx global>{`
        .ddp-root{--ddp-bg:#f8fafc;--ddp-card:#fff;--ddp-text:#142035;--ddp-muted:#64748b;--ddp-border:#e9edf5;--ddp-accent:#ea580c;position:fixed;inset:0;z-index:90;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:calc(12px + env(safe-area-inset-top)) 12px calc(100px + env(safe-area-inset-bottom));background:var(--ddp-bg);color:var(--ddp-text);font-family:inherit}
        :root[data-theme='dark'] .ddp-root{--ddp-bg:#10131b;--ddp-card:#1b202d;--ddp-text:#f1f5f9;--ddp-muted:#a0aec0;--ddp-border:#343b4b;--ddp-accent:#fb923c}
        .ddp-root .ddp-surface{background:var(--ddp-card);border:1px solid var(--ddp-border);border-radius:20px;box-shadow:0 10px 28px rgba(17,24,39,.04)}
        .ddp-root .ddp-muted{color:var(--ddp-muted)}
        .ddp-root .ddp-icon{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:13px;background:var(--ddp-bg);flex-shrink:0}
        .ddp-root .ddp-entry{display:flex;width:100%;align-items:center;gap:12px;padding:13px 14px;text-align:left;min-height:66px;border-bottom:1px solid var(--ddp-border)}
        .ddp-root .ddp-entry:last-child{border-bottom:0}
        .ddp-root .ddp-entry:active{background:var(--ddp-bg)}
        .ddp-root .ddp-wallet-page{position:fixed;inset:0;z-index:115;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:var(--ddp-bg);color:var(--ddp-text)}
        .ddp-root .ddp-wallet-header{position:sticky;top:0;z-index:116;display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;background:var(--ddp-card);border-bottom:1px solid var(--ddp-border)}
        .ddp-root .ddp-nav{position:fixed;bottom:0;left:0;right:0;z-index:90;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));min-height:calc(69px + env(safe-area-inset-bottom));padding:5px 7px env(safe-area-inset-bottom);background:var(--ddp-card);border-top:1px solid var(--ddp-border);box-shadow:0 -12px 32px rgba(15,23,42,.09)}
        .ddp-root .ddp-nav-item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:58px;font-size:10px;font-weight:700;color:var(--ddp-muted);border-radius:13px}
        .ddp-root .ddp-nav-current{color:var(--ddp-accent);background:color-mix(in srgb,var(--ddp-accent) 9%,transparent)}
        /* Hide the legacy Delivery Wallet caption only in the restaurant mobile wallet.
           The actual Owner Wallet & Platform Fees component and payment flow stay intact. */
        .ddp-root .ddp-wallet-restaurant > section > div:first-child > div:first-child > p:first-child{display:none}
        .ddp-root button:focus-visible,.ddp-root input:focus-visible{outline:3px solid #fb923c;outline-offset:2px}
        .ddp-root .ddp-fade{animation:ddp-rise .2s ease both}
        @keyframes ddp-rise{from{opacity:.5;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @media(prefers-reduced-motion:reduce){.ddp-root *{animation:none!important;scroll-behavior:auto!important;transition:none!important}}
        @media(max-width:1023px){.dd-owner-dashboard .dd-dashboard-header{display:none!important}.dd-owner-dashboard .dd-dashboard-intro{display:none!important}.dd-owner-dashboard .dd-dashboard-sidebar{display:none!important}.dd-owner-dashboard .dd-owner-mobile-bottom-nav{display:none!important}.dd-owner-dashboard{padding-bottom:calc(85px + env(safe-area-inset-bottom))!important}}
      `}</style>

      <header className="ddp-surface sticky top-0 z-[45] mb-4 overflow-hidden !rounded-[23px]">
        <div className="flex items-center gap-3 p-3.5">
          {screen !== 'home' && screen !== 'wallet' ? (
            <button type="button" aria-label="Back to home" onClick={() => chooseScreen('home')}
              className="ddp-icon !h-11 !w-11">
              <Icon name="back" size={23} />
            </button>
          ) : (
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-lg font-black text-white"
              style={{ background: 'linear-gradient(145deg,#fb923c,#ea580c)' }}>
              {String(businessName || 'D').slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="ddp-muted text-[10px] font-bold uppercase tracking-widest">Digital Dine-In · Owner</p>
            <h1 className="truncate text-base font-extrabold">{businessName}</h1>
            <p className="ddp-muted text-[11px]">{currentModule?.label || 'Owner'} {businessCode ? `· ${businessCode}` : ''}</p>
          </div>
          <button type="button" aria-label="Owner profile" className="ddp-icon" onClick={() => onProfile?.()}>
            <Icon name="profile" />
          </button>
          <button type="button" aria-label="Log out" className="ddp-icon" disabled={!onLogout} onClick={() => onLogout?.()}>
            <Icon name="logout" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-3.5 py-2.5" style={{ borderColor: 'var(--ddp-border)' }}>
          {hasRestaurant ? (
            <button type="button" role="switch" aria-checked={storeOpen}
              aria-label={storeOpen ? 'Close restaurant' : 'Open restaurant'}
              disabled={savingStore || typeof onStoreToggle !== 'function'}
              onClick={() => onStoreToggle?.()}
              className="flex min-h-10 items-center gap-2 text-xs font-bold disabled:opacity-50">
              <span className={'h-2.5 w-2.5 rounded-full ' + (storeOpen ? 'bg-emerald-500' : 'bg-rose-500')} />
              {savingStore ? 'Updating...' : storeOpen ? 'Restaurant open' : 'Restaurant closed'}
            </button>
          ) : <span className="ddp-muted text-xs">{currentModule?.label} workspace</span>}
          <div className="flex items-center gap-2"><span className="ddp-muted text-[10px]">Appearance</span><ThemeToggle /></div>
        </div>
      </header>

      {enabled.length > 1 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Business module selection">
          {enabled.map(item => (
            <button key={item.key} type="button" onClick={() => switchModule(item.key)}
              aria-current={currentMode === item.key ? 'page' : undefined}
              className={'flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 text-xs font-bold ' +
                (currentMode === item.key ? 'border-orange-400 bg-orange-500 text-white' : 'ddp-surface')}>
              <Icon name={item.icon} size={17} />{item.label}
            </button>
          ))}
        </div>
      )}

      {screen === 'home' && (
        <div className="ddp-fade space-y-3">
          <div className="rounded-[20px] px-4 py-3 text-white"
            style={{ background: 'linear-gradient(125deg,#172b46,#334a73 62%,#6c4983)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/75">{currentModule?.label} overview</p>
            <h2 className="mt-1 text-lg font-extrabold">Welcome to your dashboard</h2>
          </div>

          {currentMode === 'restaurant' ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Today revenue', ordersLoaded && !ordersError ? formatMoney(todayRevenue) : '—'],
                ['Today orders', ordersLoaded && !ordersError ? String(todayCount) : '—'],
                ['Active orders', ordersLoaded && !ordersError ? String(activeCount) : '—'],
                ['Total revenue', ordersLoaded && !ordersError ? formatMoney(totalRevenue) : '—'],
              ].map(([label, value]) => (
                <div key={label} className="ddp-surface px-3 py-3">
                  <p className="ddp-muted text-[10px] font-bold">{label}</p>
                  <p className="mt-1 truncate text-lg font-extrabold">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <button type="button" className="ddp-surface flex w-full items-center gap-3 p-4 text-left"
              onClick={() => openWorkspace(currentMode, 'overview', `${currentModule?.label} management`)}>
              <span className="ddp-icon"><Icon name="grid" /></span>
              <span className="min-w-0 flex-1 text-sm font-bold">Open {currentModule?.label} management</span>
              <Icon name="arrow" size={18} />
            </button>
          )}

          {ordersError && currentMode === 'restaurant' && (
            <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-600">Reports unavailable: {ordersError}</p>
          )}

          <Section title="Wallet & platform fees">
            <ToolButton
              label={currentMode === 'restaurant' ? 'Restaurant wallet' : currentMode === 'delivery' ? 'Delivery wallet' : 'Owner wallet'}
              detail="Open balance, recharge and transaction history"
              icon="wallet"
              onClick={openWallet}
            />
          </Section>

          <div className="ddp-surface p-3">
            <h3 className="ddp-muted mb-2 text-[11px] font-extrabold uppercase tracking-widest">Quick actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Orders', 'box', 'orders'],
                ['Business', 'grid', 'business'],
                ['Insights', 'chart', 'insights'],
                ['Settings', 'settings', 'settings'],
              ].map(([label, icon, target]) => (
                <button key={target} type="button" onClick={() => chooseScreen(target)}
                  className="flex min-h-14 items-center gap-2 rounded-xl px-3 text-xs font-bold"
                  style={{ background: 'var(--ddp-bg)' }}>
                  <Icon name={icon} size={18} />{label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* A real separate wallet screen; no expand-in-place and no page jump. */}
      {screen === 'wallet' && (
        <section className="ddp-wallet-page" role="region" aria-label="Owner wallet screen">
          <header className="ddp-wallet-header">
            <button type="button" aria-label="Back to dashboard" onClick={() => chooseScreen('home')}
              className="ddp-icon !h-11 !w-11">
              <Icon name="back" size={23} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="ddp-muted text-[10px] font-bold uppercase tracking-widest">Home / Overview</p>
              <h2 className="truncate text-base font-extrabold">
                {currentMode === 'restaurant' ? 'Restaurant wallet' : currentMode === 'delivery' ? 'Delivery wallet' : 'Owner wallet'}
              </h2>
            </div>
          </header>
          <div className="mx-auto max-w-2xl px-3 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-3">
            {hasRestaurant && hasDelivery && (
              <p className="ddp-muted mb-3 text-xs">Restaurant and Delivery use the existing tenant wallet. No additional wallet balance is created.</p>
            )}
            {restaurantId ? (
              <div className={currentMode === 'restaurant' ? 'ddp-wallet-restaurant' : ''}>
                <OwnerDeliveryWallet restaurantId={restaurantId} />
              </div>
            ) : (
              <div role="alert" className="ddp-surface p-4 text-sm">Owner wallet requires a restaurant account ID.</div>
            )}
          </div>
        </section>
      )}

      {screen === 'orders' && (
        <div className="ddp-fade space-y-3">
          <h2 className="text-xl font-extrabold">Orders</h2>
          {currentMode === 'restaurant' && (
            <>
              <p className="ddp-muted text-xs">Restaurant → Orders & bills</p>
              <OwnerMobileBillingOrders orders={safeOrders} ordersLoaded={ordersLoaded}
                ordersError={ordersError} onGenerateBill={onGenerateBill}
                onViewDetails={order => { lastFocus.current = document.activeElement; setSelectedOrder(order) }}
                onRefresh={onRefresh} />
            </>
          )}
          {currentMode === 'delivery' && (
            <>
              <p className="ddp-muted text-xs">Delivery → Orders & returns</p>
              <Section title="Delivery orders">
                <ToolButton label="Delivery orders & statuses" detail="Received, packed, out for delivery and completed orders"
                  icon="box" onClick={() => openWorkspace('delivery', 'orders', 'Delivery orders')} />
                <ToolButton label="Order tracking" detail="View the existing delivery order timeline"
                  icon="truck" onClick={() => openWorkspace('delivery', 'orders', 'Order tracking')} />
              </Section>
              <Section title="Returns & refunds">
                <ToolButton label="Returns & unsuccessful deliveries" detail="Existing return, replacement and failed delivery workflows"
                  icon="refresh" onClick={() => openWorkspace('delivery', 'after_sales', 'Returns & refunds')} />
              </Section>
            </>
          )}
          {currentMode === 'resort' && (
            <Section title="Resort bookings">
              <ToolButton label="Bookings & reservations" detail="Open existing resort management"
                icon="calendar" onClick={() => openWorkspace('resort', 'overview', 'Resort bookings')} />
            </Section>
          )}
        </div>
      )}

      {screen === 'business' && (
        <div className="ddp-fade space-y-3">
          <h2 className="text-xl font-extrabold">Business</h2>
          <p className="ddp-muted text-xs">{currentModule?.label} → Management</p>
          {currentMode === 'restaurant' && <Section title="Restaurant">{renderTools(RESTAURANT_BUSINESS, 'restaurant')}</Section>}
          {currentMode === 'delivery' && <Section title="Delivery">{renderTools(DELIVERY_BUSINESS, 'delivery')}</Section>}
          {currentMode === 'resort' && (
            <Section title="Resort">
              <ToolButton label="Resort management" detail="Rooms, bookings, guests, check-in, payments and reports"
                icon="layers" onClick={() => openWorkspace('resort', 'overview', 'Resort management')} />
            </Section>
          )}
        </div>
      )}

      {screen === 'insights' && (
        <div className="ddp-fade space-y-3">
          <h2 className="text-xl font-extrabold">Insights</h2>
          {currentMode === 'restaurant' && (
            <>
              <p className="ddp-muted text-xs">Restaurant → Sales reports</p>
              <div className="ddp-surface p-4">
                <p className="ddp-muted text-xs">Revenue from loaded restaurant orders</p>
                <p className="mt-1 text-3xl font-extrabold">{ordersLoaded && !ordersError ? formatMoney(totalRevenue) : '—'}</p>
                <p className="ddp-muted mt-2 text-xs">{safeOrders.length} orders loaded</p>
                {ordersError && <p role="alert" className="mt-2 text-xs text-rose-500">{ordersError}</p>}
                {ordersLoaded && !ordersError && graphLine ? (
                  <svg className="mt-4 h-28 w-full" viewBox="0 0 100 52" preserveAspectRatio="none"
                    role="img" aria-label="Restaurant sales trend">
                    <polyline points={graphLine} fill="none" stroke="#f97316" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                ) : <p className="ddp-muted mt-3 text-xs">Sales graph appears after orders synchronize.</p>}
              </div>
              <Section title="Sales reports">
                <ToolButton label="Full reports & analytics" detail="Open the existing restaurant reports and exports"
                  icon="chart" onClick={() => openWorkspace('restaurant', 'settlements', 'Sales reports')} />
              </Section>
            </>
          )}
          {currentMode === 'delivery' && (
            <Section title="Delivery reports">
              <ToolButton label="Delivery performance" detail="Existing delivery reports and operational overview"
                icon="chart" onClick={() => openWorkspace('delivery', 'overview', 'Delivery reports')} />
            </Section>
          )}
          {currentMode === 'resort' && (
            <Section title="Resort reports">
              <ToolButton label="Occupancy & revenue" detail="Existing resort management reports"
                icon="chart" onClick={() => openWorkspace('resort', 'overview', 'Resort reports')} />
            </Section>
          )}
        </div>
      )}

      {screen === 'settings' && (
        <div className="ddp-fade space-y-3">
          <h2 className="text-xl font-extrabold">Settings</h2>
          <label className="ddp-surface flex min-h-12 items-center gap-3 px-4">
            <Icon name="search" />
            <input type="search" value={settingsQuery} onChange={event => setSettingsQuery(event.target.value)}
              placeholder="Search settings and tools" aria-label="Search owner settings"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          {currentMode === 'restaurant' && (
            settings.restaurant.length ? (
              <Section title="Restaurant">{renderTools(settings.restaurant, 'restaurant')}</Section>
            ) : <p className="ddp-muted text-xs">No restaurant settings match your search.</p>
          )}
          {currentMode === 'delivery' && (
            settings.delivery.length ? (
              <Section title="Delivery">{renderTools(settings.delivery, 'delivery')}</Section>
            ) : <p className="ddp-muted text-xs">No delivery settings match your search.</p>
          )}
          {currentMode === 'resort' && (
            <Section title="Resort">
              <ToolButton label="Resort management" detail="Existing resort configuration and bookings"
                icon="layers" onClick={() => openWorkspace('resort', 'overview')} />
            </Section>
          )}
          {(!settingsQuery.trim() || 'support chat ai admin'.includes(settingsQuery.trim().toLowerCase())) && (
            <Section title="General">
              <ToolButton label="AI & Admin support chat" detail="Open the existing owner support chat"
                icon="support" onClick={() => onSupport?.()} />
            </Section>
          )}
        </div>
      )}

      {screen !== 'wallet' && <nav className="ddp-nav" aria-label="Owner mobile navigation">
        <NavButton id="home" title="Home" icon="home" screen={screen} onClick={chooseScreen} />
        <NavButton id="orders" title="Orders" icon="box" screen={screen} onClick={chooseScreen} />
        <NavButton id="business" title="Business" icon="grid" screen={screen} onClick={chooseScreen} />
        <NavButton id="insights" title="Insights" icon="chart" screen={screen} onClick={chooseScreen} />
        <NavButton id="settings" title="Settings" icon="settings" screen={screen} onClick={chooseScreen} />
      </nav>}

      {selectedOrder && (
        <div className="fixed inset-0 z-[145] flex items-end justify-center bg-black/60"
          onMouseDown={event => { if (event.target === event.currentTarget) setSelectedOrder(null) }}>
          <section className="w-full max-w-xl rounded-t-[28px] p-5" role="dialog" aria-modal="true"
            aria-label="Order details" style={{ background: 'var(--ddp-card)', color: 'var(--ddp-text)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Order details</h2>
              <button type="button" className="ddp-icon" aria-label="Back to orders"
                onClick={() => setSelectedOrder(null)}><Icon name="back" size={21} /></button>
            </div>
            <p className="ddp-muted mt-3 text-sm">Order ID: {String(selectedOrder.id || '—')}</p>
            <p className="mt-2 text-sm">Status: <strong className="capitalize">{String(selectedOrder.status || 'Unknown').replaceAll('_', ' ')}</strong></p>
            <p className="mt-2 text-sm">Amount: <strong>{formatMoney(selectedOrder.total_amount)}</strong></p>
            <p className="ddp-muted mt-2 text-xs">{formatDate(selectedOrder.created_at)}</p>
            <button type="button" className="mt-5 min-h-12 w-full rounded-xl bg-orange-500 px-4 text-sm font-bold text-white"
              onClick={() => openWorkspace('restaurant', 'billing', 'Billing tools')}>
              Open existing billing tools
            </button>
          </section>
        </div>
      )}
    </div>,
    document.body
  )
}