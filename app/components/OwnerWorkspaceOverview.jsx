'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import './owner-workspace-premium.css'

const MODE = {
  restaurant: { label: 'Restaurant', emoji: '🍽', kicker: 'DINE-IN OPERATIONS', title: 'Your restaurant, in sync.', blurb: 'Menus, tables, kitchen, billing and staff — all from one workspace.', color: 'orange' },
  delivery: { label: 'Delivery', emoji: '🚚', kicker: 'DELIVERY OPERATIONS', title: 'Deliver with confidence.', blurb: 'Manage incoming orders, packing, driver assignment and dispatch.', color: 'green' },
  resort: { label: 'Resort', emoji: '🏨', kicker: 'HOSPITALITY OPERATIONS', title: 'Make every stay seamless.', blurb: 'Keep room inventory, guest bookings, payments and resort settings together.', color: 'blue' },
}

function Stat({ label, value, icon, description }) {
  return <div className="dd-ws-stat"><span className="dd-ws-stat-icon" aria-hidden="true">{icon}</span><span className="dd-ws-stat-value">{value}</span><span className="dd-ws-stat-label">{label}</span>{description && <span className="dd-ws-stat-desc">{description}</span>}</div>
}

function Action({ icon, title, subtitle, onClick }) {
  return <button type="button" onClick={onClick} className="dd-ws-action"><span aria-hidden="true" className="dd-ws-action-icon">{icon}</span><span><strong>{title}</strong><small>{subtitle}</small></span><span aria-hidden="true" className="dd-ws-action-arrow">↗</span></button>
}

// UI-only enhancement: existing order, payment, wallet, booking and staff components stay untouched.
export default function OwnerWorkspaceOverview({
  restaurantId, restaurantName = 'Your business', mode = 'restaurant', onModeChange,
  allowedModes = ['restaurant'], onRestaurantTab, restaurantStats = {},
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(true)
  const current = MODE[mode] || MODE.restaurant
  const allowed = allowedModes.filter(key => Boolean(MODE[key]))
  const openQr = type => router.push(`/dashboard/${encodeURIComponent(restaurantId)}/${type === 'delivery' ? 'delivery-qr' : 'qr'}`)
  const openTab = tab => { onModeChange?.('restaurant'); onRestaurantTab?.(tab) }

  return <section className={`dd-ws dd-ws-${current.color}`} aria-label={`${current.label} owner quick workspace`}>
    <div className="dd-ws-hero">
      <div className="dd-ws-topline"><span className="dd-ws-brandmark">DD<span className="dd-ws-branddot">●</span></span><span className="dd-ws-context">OWNER WORKSPACE / {current.kicker}</span><button type="button" className="dd-ws-toggle" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? 'Hide shortcuts' : 'Show shortcuts'} <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span></button></div>
      <div className="dd-ws-hero-body"><div className="dd-ws-hero-copy"><span className="dd-ws-overline">WELCOME BACK · {restaurantName}</span><h2>{current.title}</h2><p>{current.blurb}</p><span className="dd-ws-hero-foot">One business. Three connected operating experiences.</span></div><div className="dd-ws-hero-art" aria-hidden="true"><div className="dd-ws-art-circle"><span>{current.emoji}</span></div><div className="dd-ws-art-orbit dd-ws-art-orbit-1"/><div className="dd-ws-art-orbit dd-ws-art-orbit-2"/></div></div>
    </div>
    <div className="dd-ws-switch" role="group" aria-label="Business dashboards">{allowed.map(key => <button key={key} type="button" className={`dd-ws-switch-tab ${key === mode ? 'is-selected' : ''}`} onClick={() => onModeChange?.(key)} aria-pressed={key === mode}><span aria-hidden="true">{MODE[key].emoji}</span> {MODE[key].label}</button>)}</div>
    {expanded && <div className="dd-ws-content">
      {mode === 'restaurant' && <div className="dd-ws-stats">
        <Stat icon="🧾" label="Orders today" value={restaurantStats.ordersToday ?? '—'} />
        <Stat icon="🔥" label="Live kitchen queue" value={restaurantStats.activeOrders ?? '—'} />
        <Stat icon="▦" label="Registered tables" value={restaurantStats.tableCount ?? '—'} />
        <Stat icon="☰" label="Menu products" value={restaurantStats.menuCount ?? '—'} />
      </div>}
      <div className="dd-ws-actions">
        {mode === 'restaurant' && <><Action icon="▦" title="QR poster designer" subtitle="Edit and print each table QR" onClick={() => openQr('table')}/><Action icon="☰" title="Menu & products" subtitle="Manage dishes, prices and offers" onClick={() => openTab('menu')}/><Action icon="🍽" title="Tables & orders" subtitle="Registered tables and their orders" onClick={() => openTab('tables')}/><Action icon="🧾" title="Billing & reports" subtitle="Invoices, reports and payments" onClick={() => openTab('billing')}/></>}
        {mode === 'delivery' && <><Action icon="▣" title="Delivery QR designer" subtitle="Custom posters for your delivery store" onClick={() => openQr('delivery')}/><Action icon="📦" title="Orders & packing" subtitle="Manage packing and dispatch below" onClick={() => document.getElementById('dd-ws-live-module')?.scrollIntoView({behavior:'smooth', block:'start'})}/><Action icon="🚚" title="Drivers & fulfilment" subtitle="Use the delivery operations panel" onClick={() => document.getElementById('dd-ws-live-module')?.scrollIntoView({behavior:'smooth', block:'start'})}/></>}
        {mode === 'resort' && <><Action icon="🏨" title="Room management" subtitle="Availability and inventory" onClick={() => document.getElementById('dd-ws-live-module')?.scrollIntoView({behavior:'smooth', block:'start'})}/><Action icon="📅" title="Guest bookings" subtitle="Reservations and guest operations" onClick={() => document.getElementById('dd-ws-live-module')?.scrollIntoView({behavior:'smooth', block:'start'})}/><Action icon="▦" title="Resort QR codes" subtitle="Existing room and booking QR manager" onClick={() => document.getElementById('dd-ws-live-module')?.scrollIntoView({behavior:'smooth', block:'start'})}/></>}
      </div>
    </div>}
    <div className="dd-ws-bottomline"><span className="dd-ws-status-dot"/><span>Existing approval, billing and operational permissions remain in effect.</span><span>Digital Dine-In</span></div>
  </section>
}
