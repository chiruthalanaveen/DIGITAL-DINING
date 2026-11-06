'use client'



import {

  use,

  useEffect,

  useMemo,

  useRef,

  useState,

} from 'react'



import { supabase } from '@/lib/supabase'

import { useMobileViewportLock } from '@/lib/useMobileViewportLock'

import { useLiveDeliveryRefresh } from '@/lib/useLiveDeliveryRefresh'
import { usePersistentPortalAlarm } from '@/lib/usePersistentPortalAlarm'



function money(value) {

  return `₹${Number(value || 0).toLocaleString('en-IN', {

    maximumFractionDigits: 2,

  })}`

}



function labelStatus(value) {

  return String(value || '')

    .replaceAll('_', ' ')

    .replace(/\b\w/g, (char) => char.toUpperCase())

}



function formatDate(value) {

  if (!value) return '—'



  const date = new Date(value)



  if (Number.isNaN(date.getTime())) {

    return '—'

  }



  return date.toLocaleString('en-IN', {

    day: '2-digit',

    month: 'short',

    hour: '2-digit',

    minute: '2-digit',

  })

}



// Small local icon set; no external icon dependency or layout shift.
function PackerIcon({ name, className = 'h-5 w-5' }) {
  const paths = {
    box: <><path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    inbox: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 13h5l2 3h4l2-3h5"/></>,
    scan: <><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3M6 12h12"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    truck: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 12-3l2.5 1M4 17l2.5 1A7 7 0 0 0 18.5 15"/></>,
    logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 16l4-4-4-4M9 12h9"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    right: <path d="m9 5 7 7-7 7"/>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.8L7.1 10a16 16 0 0 0 6.9 6.9l1.5-1.9a2 2 0 0 1 1.8-.6l3 .5a2 2 0 0 1 1.7 2Z"/>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-6 16-6 16 0"/></>,
    shield: <><path d="m12 2 8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
    camera: <><path d="M4 7h4l2-3h4l2 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/></>,
    alert: <><path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3h.01"/></>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    sparkle: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8Z"/><path d="m19 18 .6 1.4L21 20l-1.4.6L19 22l-.6-1.4L17 20l1.4-.6Z"/></>,
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.box}
    </svg>
  )
}


// Read-only packed order details. No status changes are sent from this dialog.
function PackerOrderDetailsDialog({ order, onClose }) {
  const detailsRef = useRef(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    detailsRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const items = Array.isArray(order?.items) ? order.items : []
  const packing = order?.packing && typeof order.packing === 'object'
    ? order.packing
    : null
  const packableUnits = items.reduce((total, item) =>
    total + Number(item.quantity || item.qty || 1), 0)
  const status = String(order.order_status || '')
  const address = [
    order.address_line1,
    order.address_line2,
    order.landmark,
    order.city,
    order.state,
    order.pincode,
  ].filter(Boolean).join(', ')
  const latitude = order.latitude == null || order.latitude === ''
    ? NaN : Number(order.latitude)
  const longitude = order.longitude == null || order.longitude === ''
    ? NaN : Number(order.longitude)
  const pinAvailable = Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
  const mapQuery = pinAvailable ? `${latitude},${longitude}` : address
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
  const detailRow = (label, value) => (
    <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2.5 last:border-b-0">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className="max-w-full break-words text-right text-xs font-bold text-slate-800">{value || '—'}</span>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[#081523]/80 px-0 pt-8 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={detailsRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="packer-order-detail-title"
        className="flex max-h-[96dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl outline-none sm:max-h-[92dvh] sm:rounded-[28px]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">
              <PackerIcon name="check" className="h-3.5 w-3.5" />
              {labelStatus(status) || 'Order'}
            </div>
            <h2 id="packer-order-detail-title" className="text-xl font-black text-[#12253c] sm:text-2xl">
              Order #{order.order_code || order.order_number || 'Details'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">Full order details · Read-only for packer</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close order details"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <PackerIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-[#f6f8fb] p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Units</p>
              <p className="mt-1 text-xl font-black text-[#12253c]">{packableUnits}</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Payment</p>
              <p className="mt-1 text-sm font-black text-[#12253c]">{String(order.payment_method || '').toLowerCase() === 'cod' ? 'Cash on Delivery' : 'Online'}</p>
            </div>
            <div className="col-span-2 rounded-2xl bg-white p-4 shadow-sm sm:col-span-1">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Order total</p>
              <p className="mt-1 text-xl font-black text-[#12253c]">{money(order.total_amount)}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-2 flex items-center gap-2"><PackerIcon name="user" className="h-4 w-4 text-emerald-600"/><h3 className="text-sm font-black text-[#12253c]">Customer</h3></div>
            {detailRow('Name', order.customer_name)}
            {detailRow('Mobile', order.customer_mobile)}
            {order.alternate_mobile && detailRow('Alternate mobile', order.alternate_mobile)}
            {detailRow('Placed', formatDate(order.created_at))}
            {detailRow('Last updated', formatDate(order.updated_at))}
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-black text-[#12253c]"><PackerIcon name="box" className="h-4 w-4 text-emerald-600"/> Items packed</h3>
              <span className="text-xs font-extrabold text-slate-500">{items.length} products</span>
            </div>
            <div className="space-y-3">
              {items.map((item, index) => {
                const qty = Number(item.quantity || item.qty || 1)
                const lineTotal = item.line_total ?? qty * Number(item.price || 0)
                return <div key={item.id || index} className="flex items-start justify-between gap-3 rounded-xl bg-[#f6f8fb] p-3">
                  <div className="min-w-0"><p className="text-sm font-bold text-[#12253c]">{item.name || 'Item'}</p><p className="mt-1 text-xs font-semibold text-slate-500">Quantity: {qty}</p></div>
                  <span className="shrink-0 text-sm font-black text-[#12253c]">{money(lineTotal)}</span>
                </div>
              })}
              {items.length === 0 && <p className="text-xs text-slate-500">No product details available.</p>}
            </div>
            {packing && <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
              <div className="flex items-center gap-2"><PackerIcon name="scan" className="h-4 w-4"/>{packing.requires_scan ? `Barcode verified: ${Number(packing.scanned_total || 0)}/${Number(packing.required_total || 0)} units` : 'No barcode verification required'}</div>
              {packing.requires_scan && !packing.ready_to_pack && <p className="mt-2 text-amber-700">Current scan progress is not complete.</p>}
            </div>}
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-black text-[#12253c]"><PackerIcon name="pin" className="h-4 w-4 text-emerald-600"/> Delivery address</h3>
            <p className="mt-3 break-words text-sm leading-6 text-slate-700">{address || 'No delivery address supplied'}</p>
            {mapQuery && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-xs font-bold text-sky-700 hover:bg-sky-100"><PackerIcon name="pin" className="h-4 w-4"/> Open location</a>}
            {order.customer_note && <div className="mt-4 rounded-xl bg-amber-50 p-3"><p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700">Customer note</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-amber-900">{order.customer_note}</p></div>}
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-black text-[#12253c]"><PackerIcon name="truck" className="h-4 w-4 text-emerald-600"/> Driver handoff</h3>
            {detailRow('Driver', order.driver_name || 'Waiting for driver assignment')}
            {order.driver_mobile && detailRow('Driver mobile', order.driver_mobile)}
            {detailRow('Payment status', labelStatus(order.payment_status))}
            {detailRow('Order status', labelStatus(status))}
            <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-3 text-xs font-semibold leading-5 text-emerald-800">
              Packing complete does not start delivery. Only the driver can accept the handoff and start delivery.
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6">
          <button type="button" onClick={onClose} className="h-12 w-full rounded-xl bg-[#12253c] text-sm font-extrabold text-white hover:bg-[#213a57]">
            Back to Packed Orders
          </button>
        </div>
      </section>
    </div>
  )
}


// FOCUSED PACKING WORKSPACE (UI ONLY)
// - Exactly one order is shown expanded for packing.
// - The barcode scan RPC remains the authoritative packaged-item verification.
// - Local item tick marks are a visual second check, NOT server-side proof.
// - Driver handoff/order authorization remain controlled by the existing RPCs.
function FocusedPackerWorkspace({
  rows,
  focusOrderId,
  setFocusOrderId,
  updateStatus,
  updatingOrderId,
  scanningOrderId,
  barcodeInputs,
  setBarcodeInputs,
  submitBarcode,
  openCameraScanner,
  cameraOrderId,
  openDetails,
}) {
  const [itemChecks, setItemChecks] = useState({})
  const [blockedOrders, setBlockedOrders] = useState({})
  const [showDeliveryInfo, setShowDeliveryInfo] = useState(false)

  // Stable sorting: in-progress work takes precedence, then oldest incoming.
  const orderedRows = [...rows].sort((a, b) => {
    const aPacking = ['confirmed', 'preparing'].includes(String(a.order_status || '').toLowerCase())
    const bPacking = ['confirmed', 'preparing'].includes(String(b.order_status || '').toLowerCase())
    if (aPacking !== bPacking) return aPacking ? -1 : 1
    const aTime = Date.parse(a.created_at || '') || 0
    const bTime = Date.parse(b.created_at || '') || 0
    return aTime - bTime
  })

  const focusedOrder =
    orderedRows.find((row) => String(row.id) === String(focusOrderId)) ||
    orderedRows[0] || null

  if (!focusedOrder) {
    return (
      <section className="rounded-[26px] border border-dashed border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <PackerIcon name="check" className="h-8 w-8" />
        </div>
        <h3 className="mt-5 text-lg font-black text-[#12253c]">No orders waiting in this queue</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
          New paid or COD orders appear automatically when your store receives them.
        </p>
      </section>
    )
  }

  const order = focusedOrder
  const orderItems = Array.isArray(order.items) ? order.items : []
  const status = String(order.order_status || '').toLowerCase()
  const isIncoming = status === 'received'
  const isPacking = ['confirmed', 'preparing'].includes(status)
  const packing = order.packing && typeof order.packing === 'object' ? order.packing : null
  const hasPackingData = Boolean(packing && 'requires_scan' in packing)
  const requiresScan = Boolean(packing?.requires_scan)
  const serverReady = hasPackingData && Boolean(packing.ready_to_pack)
  const requiredTotal = Number(packing?.required_total || 0)
  const scannedTotal = Number(packing?.scanned_total || 0)
  const remainingTotal = Number(packing?.remaining_total || 0)
  const missingBarcodeCount = Number(packing?.missing_barcode_count || 0)
  const scanItems = Array.isArray(packing?.items) ? packing.items : []
  const statusBusy = updatingOrderId === order.id
  const scanBusy = scanningOrderId === order.id
  const isBlocked = Boolean(blockedOrders[order.id])
  const deliveryAddress = [
    order.address_line1, order.address_line2, order.landmark,
    order.city, order.state, order.pincode,
  ].filter(Boolean).join(', ')

  // Include ordered line, product identity and required quantity in the checklist key.
  // If the item/quantity changes, an older tick does not match the new line.
  const checklistLines = orderItems.map((item, index) => ({
    item,
    key: JSON.stringify([
      order.id, index, item.menu_item_id || item.id || '',
      item.name || '', Number(item.quantity ?? item.qty ?? 1),
    ]),
    quantity: Number(item.quantity ?? item.qty ?? 1),
  }))
  const checkedLines = checklistLines.filter((line) => Boolean(itemChecks[line.key])).length
  const manuallyChecked = checklistLines.length > 0 && checkedLines === checklistLines.length
  const manualPercent = checklistLines.length > 0
    ? Math.round((checkedLines / checklistLines.length) * 100) : 0
  const barcodePercent = requiredTotal > 0
    ? Math.max(0, Math.min(100, Math.round((scannedTotal / requiredTotal) * 100))) : 100
  const canMarkPacked = isPacking && !statusBusy && !scanBusy &&
    !isBlocked && manuallyChecked && serverReady && missingBarcodeCount === 0

  const showBarcodeTools = isPacking && hasPackingData && requiresScan &&
    !serverReady && missingBarcodeCount === 0

  const cardButton = 'flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] xl:items-start">
      {/* Compact queue: selecting a card only changes the focused order. */}
      <aside className="min-w-0 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-24" aria-label="Packing queue">
        <div className="flex items-center justify-between px-2 py-2">
          <h3 className="text-sm font-black text-[#12253c]">Work queue</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">{orderedRows.length}</span>
        </div>
        <p className="mb-2 px-2 text-xs leading-5 text-slate-500">Choose one order. Active packing is shown first, followed by older incoming orders.</p>
        <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto px-1 pb-1 xl:max-h-[calc(100dvh-220px)]">
          {orderedRows.map((row) => {
            const selected = row.id === order.id
            const working = ['confirmed', 'preparing'].includes(String(row.order_status || '').toLowerCase())
            const units = Array.isArray(row.items)
              ? row.items.reduce((sum, item) => sum + Number(item.quantity ?? item.qty ?? 1), 0)
              : 0
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => { setFocusOrderId(row.id); setShowDeliveryInfo(false) }}
                aria-pressed={selected}
                className={`w-full rounded-2xl border px-3.5 py-3.5 text-left transition focus-visible:outline-2 focus-visible:outline-emerald-500 ${
                  selected ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-slate-100 bg-slate-50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-black text-[#12253c]">#{row.order_code || row.order_number || 'Order'}</span>
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-extrabold ${
                    working ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                  }`}>{working ? 'Packing' : 'Incoming'}</span>
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-slate-600">{row.customer_name || 'Customer'}</p>
                <div className="mt-2 flex justify-between gap-2 text-[11px] text-slate-500">
                  <span>{units} {units === 1 ? 'unit' : 'units'}</span>
                  <span>{formatDate(row.created_at)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Only the selected order has packing controls. */}
      <section className="min-w-0 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm" aria-labelledby="focused-packing-title">
        <div className="border-b border-slate-100 bg-[#12253c] p-5 text-white sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">
              {isIncoming ? 'Step 1 · Start packing' : 'Step 2 · Verify and pack'}
            </span>
            <span className="font-mono text-sm font-black text-white/80">#{order.order_code || order.order_number || 'Order'}</span>
          </div>
          <h3 id="focused-packing-title" className="mt-3 text-xl font-black tracking-tight sm:text-2xl">
            {isIncoming ? 'Ready to start this order?' : 'Pack this order accurately'}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {order.customer_name || 'Customer'} · {order.payment_method === 'cod' ? 'Cash on delivery' : 'Prepaid'} · {money(order.total_amount)}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-1.5" aria-label="Packing steps">
            {['Start', 'Verify', 'Packed'].map((step, index) => (
              <div key={step} className={`rounded-lg py-2 text-center text-[10px] font-extrabold ${
                (isIncoming ? index === 0 : index <= 1) ? 'bg-emerald-400 text-[#10243a]' : 'bg-white/10 text-white/60'
              }`}>{index + 1}. {step}</div>
            ))}
          </div>
        </div>

        <div className="space-y-5 p-4 sm:p-6">
          {order.customer_note && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-amber-800">Customer packing instructions</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-amber-900">{order.customer_note}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-black text-[#12253c]">Item-by-item checklist</h4>
            <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
              {checkedLines}/{checklistLines.length} checked
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-label="Item checklist completion">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${manualPercent}%` }} />
          </div>

          <div className="space-y-2">
            {checklistLines.map(({ item, key, quantity }) => {
              const picked = Boolean(itemChecks[key])
              return (
                <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 sm:p-4 ${
                  picked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-[#f7f9fb]'
                }`}>
                  <input
                    type="checkbox"
                    checked={picked}
                    disabled={!isPacking}
                    onChange={(event) => setItemChecks((current) => ({ ...current, [key]: event.target.checked }))}
                    className="mt-1 h-5 w-5 shrink-0 accent-emerald-600 disabled:opacity-40"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="break-words text-sm font-extrabold leading-5 text-[#12253c]">{item.name || 'Item'}</span>
                    <span className="text-xs text-slate-500">Check product, condition and exact quantity</span>
                  </div>
                  <span className="rounded-lg bg-white px-2.5 py-1 text-sm font-black text-slate-800">× {quantity}</span>
                </label>
              )
            })}
            {!orderItems.length && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">No item details were returned by the server. Ask the manager before packing.</p>
            )}
          </div>
          {isIncoming && (
            <div className="rounded-xl bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-800">
              Start Packing unlocks the physical item checklist. The order status changes using your existing secure Supabase function.
            </div>
          )}

          {isPacking && (
            <div className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-black text-[#12253c]">
                    <PackerIcon name="scan" className="h-4 w-4 text-emerald-600" /> Barcode verification
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">{requiresScan
                    ? `${scannedTotal}/${requiredTotal} packaged units verified by Supabase`
                    : hasPackingData ? 'No packaged-item barcode scans required' : 'Checking server packing requirements…'}</p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-[11px] font-black ${
                  serverReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>{serverReady ? 'Server ready' : 'Server pending'}</span>
              </div>
              {requiresScan && (
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-label="Barcode scan completion">
                  <div className="h-full bg-sky-500 transition-all" style={{ width: `${barcodePercent}%` }} />
                </div>
              )}
              {scanItems.length > 0 && (
                <div className="space-y-2">
                  {scanItems.map((item, i) => (
                    <div key={item.menu_item_id || `${item.name}-${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-slate-800">{item.name || 'Packaged item'}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{item.barcode ? 'Barcode configured' : 'Barcode needs setup'}</p>
                      </div>
                      <span className={`rounded-lg px-2.5 py-1 font-mono text-xs font-black ${
                        item.complete ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-slate-800'
                      }`}>{Number(item.scanned_quantity || 0)}/{Number(item.required_quantity || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
              {missingBarcodeCount > 0 && (
                <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold leading-5 text-red-800">
                  {missingBarcodeCount} packaged product(s) have no configured barcode. Ask the manager to configure the barcode. Packing remains blocked.
                </div>
              )}
              {showBarcodeTools && (
                <div className="space-y-2">
                  <form onSubmit={async (event) => { event.preventDefault(); await submitBarcode(order.id, barcodeInputs[order.id]) }} className="flex gap-2">
                    <input
                      aria-label={`Barcode for ${order.order_code || 'order'}`}
                      value={barcodeInputs[order.id] || ''}
                      onChange={(event) => setBarcodeInputs((current) => ({ ...current, [order.id]: event.target.value }))}
                      autoComplete="off"
                      inputMode="text"
                      placeholder="Scan or enter barcode"
                      className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                    />
                    <button type="submit" disabled={scanBusy || !String(barcodeInputs[order.id] || '').trim()} className="h-12 rounded-xl bg-[#12253c] px-4 text-xs font-black text-white disabled:opacity-40">{scanBusy ? 'Verifying…' : 'Verify'}</button>
                  </form>
                  <button type="button" disabled={scanBusy || Boolean(cameraOrderId)} onClick={() => openCameraScanner(order.id)} className={`${cardButton} w-full border border-emerald-200 bg-emerald-50 text-emerald-800`}>
                    <PackerIcon name="camera" className="h-5 w-5" /> Scan with camera · {remainingTotal} remaining
                  </button>
                </div>
              )}
              <p className="text-[11px] leading-5 text-slate-500">The barcode RPC verifies the real product and quantity. Checking an item above does not replace barcode scanning.</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowDeliveryInfo((current) => !current)}
            aria-expanded={showDeliveryInfo}
            className="flex min-h-[46px] w-full items-center justify-between rounded-xl border border-slate-200 px-3.5 text-left text-xs font-bold text-slate-700"
          >
            Delivery address and driver info
            <PackerIcon name="chevron" className={`h-4 w-4 transition-transform ${showDeliveryInfo ? 'rotate-180' : ''}`} />
          </button>
          {showDeliveryInfo && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
              <p><span className="font-extrabold text-slate-800">Address:</span> {deliveryAddress || 'Not provided'}</p>
              <p><span className="font-extrabold text-slate-800">Driver:</span> {order.driver_name || 'Not assigned yet'}</p>
              {order.driver_mobile && <p><span className="font-extrabold text-slate-800">Driver phone:</span> {order.driver_mobile}</p>}
            </div>
          )}

          <label className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold leading-5 text-rose-800">
            <input type="checkbox" checked={isBlocked} onChange={(event) => setBlockedOrders((current) => ({ ...current, [order.id]: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-rose-600" />
            <span><strong>Missing, damaged or wrong product?</strong> Pause this order and contact the manager. This is a local hold on this screen; it does not notify the manager or change the order in Supabase.</span>
          </label>

          {isIncoming ? (
            <button
              type="button"
              disabled={statusBusy || isBlocked || !orderItems.length}
              onClick={() => updateStatus(order, 'confirmed')}
              className={`${cardButton} w-full bg-[#12253c] text-white shadow-md shadow-slate-900/10`}
            >
              <PackerIcon name="arrow" className="h-5 w-5" /> {statusBusy ? 'Starting packing…' : 'Start Packing'}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={!canMarkPacked}
                onClick={() => updateStatus(order, 'packed')}
                className={`${cardButton} w-full bg-emerald-600 text-white shadow-md shadow-emerald-600/10 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none`}
              >
                <PackerIcon name="check" className="h-5 w-5" /> {statusBusy ? 'Updating…' : 'Mark Packed & View Details'}
              </button>
              {!canMarkPacked && (
                <p className="text-center text-[11px] font-semibold leading-5 text-slate-500">
                  {isBlocked ? 'Resolve the item issue before packing.'
                    : !manuallyChecked ? `Verify all ${checklistLines.length} product lines and quantities first.`
                    : !hasPackingData ? 'Waiting for server packing requirements.'
                    : missingBarcodeCount > 0 ? 'Manager must configure missing barcodes.'
                    : requiresScan && !serverReady ? `Scan ${remainingTotal} remaining packaged units.`
                    : 'Packing verification is still in progress.'}
                </p>
              )}
            </>
          )}

          <p className="text-center text-[11px] leading-5 text-slate-500">
            Packed orders move into the Packed Orders tab. Only the driver can start delivery.
          </p>
        </div>
      </section>
    </div>
  )
}

export default function DeliveryPackerPortal({

  params,

}) {

  const unwrappedParams = use(params)



  useMobileViewportLock()



  const restaurantCode = String(

    unwrappedParams?.restaurantCode ||

      unwrappedParams?.restaurantcode ||

      ''

  ).trim()



  const storageKey =

    `digitaldining_delivery_packer_session_${restaurantCode}`



  const [

    sessionToken,

    setSessionToken,

  ] = useState('')



  const [

    userId,

    setUserId,

  ] = useState('')



  const [

    password,

    setPassword,

  ] = useState('')



  const [

    portalData,

    setPortalData,

  ] = useState(null)



  const [

    loading,

    setLoading,

  ] = useState(true)



  const [

    loggingIn,

    setLoggingIn,

  ] = useState(false)



  const [

    refreshing,

    setRefreshing,

  ] = useState(false)



  const [

    updatingOrderId,

    setUpdatingOrderId,

  ] = useState('')



  const [

    error,

    setError,

  ] = useState('')



  const [

    message,

    setMessage,

  ] = useState('')



  const [

    barcodeInputs,

    setBarcodeInputs,

  ] = useState({})



  const [

    scanningOrderId,

    setScanningOrderId,

  ] = useState('')



  const [

    cameraOrderId,

    setCameraOrderId,

  ] = useState('')



  const [

    cameraError,

    setCameraError,

  ] = useState('')



  const [

    cameraStarting,

    setCameraStarting,

  ] = useState(false)



  const videoRef =

    useRef(null)



  const cameraStreamRef =

    useRef(null)



  const cameraFrameRef =

    useRef(null)



  const cameraScanLockedRef =

    useRef(false)

  // View-only state: existing auth, barcode and status RPCs are unchanged.
  // Incoming and in-progress orders are the packer's default work queue.
  const [activeStage, setActiveStage] = useState('active')
  const [mobilePackerMenu, setMobilePackerMenu] = useState(false)
  const [mobilePackerTheme, setMobilePackerTheme] = useState('light')

  const [focusOrderId, setFocusOrderId] = useState('')
  const [ordersMenuOpen, setOrdersMenuOpen] = useState(false)
  const [orderSearch, setOrderSearch] = useState('')
  const [detailsOpen, setDetailsOpen] = useState({})
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [selectedOrderSnapshot, setSelectedOrderSnapshot] = useState(null)



  /*

   * ---------------------------------------------------------

   * LOAD SAVED PACKER SESSION

   * ---------------------------------------------------------

   */



  useEffect(() => {

    try {

      const saved =

        localStorage.getItem(

          storageKey

        )



      if (saved) {

        setSessionToken(saved)

      }

    } catch {

      // Ignore unavailable local storage.

    }



    setLoading(false)

  }, [storageKey])



  /*

   * ---------------------------------------------------------

   * LOAD PACKER PORTAL

   * ---------------------------------------------------------

   */



  const loadPortal = async (

    tokenOverride = '',

    quiet = false

  ) => {

    const token =

      String(

        tokenOverride ||

          sessionToken ||

          ''

      ).trim()



    if (!token) {

      setPortalData(null)

      return

    }



    if (quiet) {

      setRefreshing(true)

    }



    try {

      const {

        data,

        error: rpcError,

      } = await supabase.rpc(

        'get_delivery_packer_portal_data',

        {

          p_session_token:

            token,

        }

      )



      if (rpcError) {

        throw rpcError

      }



      if (!data?.success) {

        throw new Error(

          data?.message ||

            'Packer session is invalid.'

        )

      }



      setPortalData(data)

      setError('')

    } catch (loadError) {

      console.error(

        'Packer portal load error:',

        loadError

      )



      setPortalData(null)
      setSelectedOrderId('')
      setSelectedOrderSnapshot(null)

      setSessionToken('')



      try {

        localStorage.removeItem(

          storageKey

        )

      } catch {

        // Ignore.

      }



      setError(

        loadError?.message ||

          'Your Packer Portal session expired. Please sign in again.'

      )

    } finally {

      setRefreshing(false)

    }

  }



  useEffect(() => {

    if (!sessionToken) {

      return

    }



    loadPortal()



    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [sessionToken])



  /*

   * ---------------------------------------------------------

   * LIVE DELIVERY REFRESH

   * ---------------------------------------------------------

   */



  useLiveDeliveryRefresh(

    () =>

      loadPortal(

        '',

        false

      ),

    Boolean(sessionToken),

    1000

  )



  /*

   * ---------------------------------------------------------

   * LOGIN

   * ---------------------------------------------------------

   */



  const handleLogin = async (

    event

  ) => {

    event.preventDefault()



    if (loggingIn) {

      return

    }



    const cleanUserId =

      userId

        .trim()

        .toLowerCase()



    if (

      cleanUserId.length < 3 ||

      password.length < 6

    ) {

      setError(

        'Enter your Packer User ID and password.'

      )



      return

    }



    setLoggingIn(true)

    setError('')

    setMessage('')



    try {

      const {

        data,

        error: rpcError,

      } = await supabase.rpc(

        'delivery_packer_login',

        {

          p_restaurant_code:

            restaurantCode,



          p_user_id:

            cleanUserId,



          p_password:

            password,

        }

      )



      if (rpcError) {

        throw rpcError

      }



      if (

        !data?.success ||

        !data?.session_token

      ) {

        throw new Error(

          data?.message ||

            'Packer login failed.'

        )

      }



      const token =

        String(

          data.session_token

        )



      try {

        localStorage.setItem(

          storageKey,

          token

        )

      } catch {

        // Continue even if local storage is unavailable.

      }



      setSessionToken(token)



      setPassword('')



      setMessage(

        `Welcome ${

          data?.packer?.name ||

          'Packer'

        }.`

      )



      await loadPortal(

        token

      )

    } catch (loginError) {

      console.error(

        'Delivery packer login error:',

        loginError

      )



      setError(

        loginError?.message ||

          'Packer login failed.'

      )

    } finally {

      setLoggingIn(false)

    }

  }



  /*

   * ---------------------------------------------------------

   * LOGOUT

   * ---------------------------------------------------------

   */



  const logout = async () => {

    const token =

      sessionToken



    try {

      if (token) {

        await supabase.rpc(

          'delivery_packer_logout',

          {

            p_session_token:

              token,

          }

        )

      }

    } catch (logoutError) {

      console.error(

        'Packer logout error:',

        logoutError

      )

    } finally {

      try {

        localStorage.removeItem(

          storageKey

        )

      } catch {

        // Ignore.

      }



      setCameraOrderId('')
      setFocusOrderId('')
      setSelectedOrderId('')
      setSelectedOrderSnapshot(null)

      setCameraError('')

      setScanningOrderId('')

      setBarcodeInputs({})



      setSessionToken('')

      setPortalData(null)

      setUserId('')

      setPassword('')

      setMessage('')

      setError('')

    }

  }



  /*

   * ---------------------------------------------------------

   * UPDATE PACKING PROGRESS LOCALLY

   * ---------------------------------------------------------

   */



  const updatePackingLocally = (

    orderId,

    packing

  ) => {

    if (!packing) {

      return

    }



    setPortalData(

      (current) => {

        if (

          !current ||

          !Array.isArray(

            current.orders

          )

        ) {

          return current

        }



        return {

          ...current,



          orders:

            current.orders.map(

              (order) =>

                order.id ===

                orderId

                  ? {

                      ...order,

                      packing,

                    }

                  : order

            ),

        }

      }

    )

  }



  /*

   * ---------------------------------------------------------

   * VERIFY BARCODE

   * ---------------------------------------------------------

   */



  const submitBarcode =

    async (

      orderId,

      rawBarcode

    ) => {

      const barcode =

        String(

          rawBarcode || ''

        ).trim()



      if (

        !sessionToken ||

        !orderId ||

        !barcode ||

        scanningOrderId

      ) {

        if (!barcode) {

          setError(

            'Scan or enter a product barcode.'

          )

        }



        return false

      }



      setScanningOrderId(

        orderId

      )



      setError('')

      setMessage('')



      try {

        const {

          data,

          error: rpcError,

        } = await supabase.rpc(

          'delivery_packer_scan_barcode',

          {

            p_session_token:

              sessionToken,



            p_order_id:

              orderId,



            p_barcode:

              barcode,

          }

        )



        if (rpcError) {

          throw rpcError

        }



        if (!data?.success) {

          const scanError =

            new Error(

              data?.message ||

                'Unable to verify this barcode.'

            )



          scanError.code =

            data?.code || ''



          throw scanError

        }



        updatePackingLocally(

          orderId,

          data?.packing

        )



        setBarcodeInputs(

          (current) => ({

            ...current,

            [orderId]: '',

          })

        )



        setMessage(

          data?.message ||

            'Product barcode verified.'

        )



        await loadPortal(

          '',

          true

        )



        return true

      } catch (scanError) {

        console.error(

          'Packer barcode scan error:',

          scanError

        )



        setError(

          scanError?.message ||

            'Unable to verify this barcode.'

        )



        return false

      } finally {

        setScanningOrderId('')

      }

    }



  /*

   * ---------------------------------------------------------

   * CAMERA HELPERS

   * ---------------------------------------------------------

   */



  const stopCamera = () => {

    if (

      cameraFrameRef.current

    ) {

      window.cancelAnimationFrame(

        cameraFrameRef.current

      )



      cameraFrameRef.current =

        null

    }



    if (

      cameraStreamRef.current

    ) {

      cameraStreamRef.current

        .getTracks()

        .forEach(

          (track) => {

            try {

              track.stop()

            } catch {

              // Ignore camera cleanup errors.

            }

          }

        )



      cameraStreamRef.current =

        null

    }



    if (

      videoRef.current

    ) {

      videoRef.current.srcObject =

        null

    }



    cameraScanLockedRef.current =

      false

  }



  const closeCameraScanner =

    () => {

      stopCamera()



      setCameraOrderId('')

      setCameraError('')

      setCameraStarting(false)

    }



  const openCameraScanner = (

    orderId

  ) => {

    if (

      !orderId ||

      scanningOrderId

    ) {

      return

    }



    setCameraError('')

    setCameraOrderId(

      orderId

    )

  }



  /*

   * ---------------------------------------------------------

   * NATIVE BARCODE CAMERA

   * ---------------------------------------------------------

   */



  useEffect(() => {

    if (!cameraOrderId) {

      return undefined

    }



    let cancelled = false



    const startCamera =

      async () => {

        if (

          typeof window ===

            'undefined' ||

          !navigator

            ?.mediaDevices

            ?.getUserMedia

        ) {

          setCameraError(

            'Camera access is not supported here. Use manual barcode entry below.'

          )



          return

        }



        if (

          !(

            'BarcodeDetector' in

            window

          )

        ) {

          setCameraError(

            'Automatic barcode detection is not supported by this browser. Use manual barcode entry on the order card.'

          )



          return

        }



        setCameraStarting(true)



        try {

          const stream =

            await navigator

              .mediaDevices

              .getUserMedia({

                video: {

                  facingMode: {

                    ideal:

                      'environment',

                  },

                },



                audio: false,

              })



          if (cancelled) {

            stream

              .getTracks()

              .forEach(

                (track) =>

                  track.stop()

              )



            return

          }



          cameraStreamRef.current =

            stream



          const video =

            videoRef.current



          if (!video) {

            throw new Error(

              'Camera preview is unavailable.'

            )

          }



          video.srcObject =

            stream



          await video.play()



          const detector =

            new window.BarcodeDetector()



          const detectOnce =

            async () => {

              if (

                cancelled ||

                cameraScanLockedRef.current ||

                !videoRef.current

              ) {

                return

              }



              try {

                const detected =

                  await detector.detect(

                    videoRef.current

                  )



                const barcode =

                  String(

                    detected?.[0]

                      ?.rawValue ||

                      ''

                  ).trim()



                if (barcode) {

                  /*

                   * One camera activation records one physical scan only.

                   *

                   * Closing after detection prevents the same physical

                   * barcode frame being counted several times.

                   */



                  cameraScanLockedRef.current =

                    true



                  await submitBarcode(

                    cameraOrderId,

                    barcode

                  )



                  if (!cancelled) {

                    setCameraOrderId(

                      ''

                    )



                    setCameraError(

                      ''

                    )

                  }



                  return

                }

              } catch (

                detectError

              ) {

                console.error(

                  'Barcode detector error:',

                  detectError

                )

              }



              if (!cancelled) {

                cameraFrameRef.current =

                  window.requestAnimationFrame(

                    detectOnce

                  )

              }

            }



          cameraFrameRef.current =

            window.requestAnimationFrame(

              detectOnce

            )

        } catch (

          cameraStartError

        ) {

          console.error(

            'Packer camera error:',

            cameraStartError

          )



          if (!cancelled) {

            setCameraError(

              cameraStartError

                ?.message ||

                'Unable to open the camera. Allow camera permission or use manual barcode entry.'

            )

          }

        } finally {

          if (!cancelled) {

            setCameraStarting(

              false

            )

          }

        }

      }



    startCamera()



    return () => {

      cancelled = true

      stopCamera()

    }



    // Camera should restart only when a new order is selected.

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [cameraOrderId])



  useEffect(() => {

    return () =>

      stopCamera()



    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [])



  /*

   * ---------------------------------------------------------

   * UPDATE ORDER STATUS

   * ---------------------------------------------------------

   */



  const updateStatus =

    async (

      order,

      nextStatus

    ) => {

      if (

        !sessionToken ||

        updatingOrderId

      ) {

        return

      }



      /*

       * Update immediately from Packer Portal.

       *

       * No additional confirmation popup is added.

       * The button press itself remains the action.

       */



      setUpdatingOrderId(

        order.id

      )



      setError('')

      setMessage('')



      try {

        const {

          data,

          error: rpcError,

        } = await supabase.rpc(

          'delivery_packer_update_order_status',

          {

            p_session_token:

              sessionToken,



            p_order_id:

              order.id,



            p_new_status:

              nextStatus,

          }

        )



        if (rpcError) {

          throw rpcError

        }



        if (!data?.success) {

          throw new Error(

            data?.message ||

              'Unable to update order.'

          )

        }



        setMessage(

          nextStatus ===

            'confirmed'

            ? 'Packing started.'

            : nextStatus ===

                'packed'

              ? 'Order marked Packed.'

              : 'Order marked Out for Delivery.'

        )



        await loadPortal(

          '',

          true

        )

        // After a successful status change, show the next correct queue.
        // Keep backend authorization and barcode checks unchanged.
        if (nextStatus === 'confirmed') {
          setFocusOrderId(order.id)
          setActiveStage('confirmed')
          setOrdersMenuOpen(true)
          setOrderSearch('')
        }

        if (nextStatus === 'packed') {
          setFocusOrderId('')
          setActiveStage('packed')
          setOrdersMenuOpen(true)
          setOrderSearch('')
          setDetailsOpen((current) => ({ ...current, [order.id]: true }))
          // A temporary in-memory snapshot lets the confirmation dialog
          // open even if the live refresh returns a moment later.
          setSelectedOrderSnapshot({
            ...order,
            order_status: 'packed',
            updated_at: new Date().toISOString(),
          })
          setSelectedOrderId(order.id)
        }

      } catch (

        updateError

      ) {

        console.error(

          'Packer order update error:',

          updateError

        )



        setError(

          updateError?.message ||

            'Unable to update order.'

        )

      } finally {

        setUpdatingOrderId(

          ''

        )

      }

    }



  /*

   * ---------------------------------------------------------

   * ORDERS

   * ---------------------------------------------------------

   */



  const orders =

    Array.isArray(

      portalData?.orders

    )

      ? portalData.orders

      : []



  // Live backend data takes precedence over the just-packed in-memory snapshot.
  const selectedOrder = selectedOrderId
    ? orders.find((order) => String(order.id) === String(selectedOrderId)) ||
      (String(selectedOrderSnapshot?.id || '') === String(selectedOrderId)
        ? selectedOrderSnapshot
        : null)
    : null

  const closeOrderDetails = () => {
    setSelectedOrderId('')
    setSelectedOrderSnapshot(null)
  }

  const sections =

    useMemo(() => {

      const grouped = {

        received: [],

        confirmed: [],

        packed: [],

        out_for_delivery: [],

      }



      for (

        const order of orders

      ) {

        const status =

          String(

            order.order_status ||

              ''

          )



        if (

          status ===

          'preparing'

        ) {

          grouped.confirmed.push(

            order

          )

        } else if (

          grouped[status]

        ) {

          grouped[status].push(

            order

          )

        }

      }



      return grouped

    }, [orders])



  /*
   * PACKER ALARM:
   * sound only while orders are waiting in received and no order is
   * currently confirmed/preparing.
   */
  const waitingToPackOrders =
    sections.received

  const packingInProgressOrders =
    sections.confirmed

  const packerAlarmShouldRing =
    waitingToPackOrders.length > 0 &&
    packingInProgressOrders.length === 0

  const {
    enabled: packerAlarmEnabled,
    active: packerAlarmActive,
    enable: enablePackerAlarm,
    disable: disablePackerAlarm,
  } =
    usePersistentPortalAlarm({
      active:
        Boolean(
          sessionToken &&
          packerAlarmShouldRing
        ),
      repeatMs: 1700,
      notificationTitle:
        'Packing Required',
      notificationBody:
        waitingToPackOrders.length === 1
          ? `${waitingToPackOrders[0]?.order_code || '1 order'} is waiting. Press Start Packing.`
          : `${waitingToPackOrders.length} orders are waiting. Start Packing the next order.`,
    })

  /*
   * ---------------------------------------------------------
   * MODERN PACKER WORKSPACE — presentation only
   * ---------------------------------------------------------
   */

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#f5f7fa] px-5 text-slate-900">
        <div className="w-full max-w-sm rounded-[30px] border border-slate-200 bg-white p-10 text-center shadow-[0_20px_65px_rgba(15,23,42,0.07)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <PackerIcon name="box" className="h-8 w-8" />
          </div>
          <div className="mx-auto mt-7 h-8 w-8 animate-spin rounded-full border-[3px] border-emerald-100 border-t-emerald-600" />
          <h1 className="mt-5 text-lg font-extrabold">Preparing your workspace</h1>
          <p className="mt-2 text-sm text-slate-500">Connecting securely to your pack station.</p>
        </div>
      </main>
    )
  }

  if (!sessionToken || !portalData) {
    return (
      <main className="min-h-[100dvh] bg-[#f5f7fa] text-slate-900 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(430px,0.9fr)]">
        <div className="relative hidden min-h-[100dvh] flex-col overflow-hidden bg-[#111d2e] p-12 text-white lg:flex xl:p-16">
          <div className="absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-32 h-[460px] w-[460px] rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative z-10 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400 text-[#0d1b28]"><PackerIcon name="box" className="h-7 w-7"/></span>
            <div><p className="text-base font-black tracking-tight">Digital Dine-In</p><p className="text-xs font-medium text-slate-400">Fulfilment operations</p></div>
          </div>
          <div className="relative z-10 my-auto max-w-xl py-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-extrabold tracking-wide text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400"/> PACK STATION</div>
            <h1 className="mt-7 text-5xl font-black leading-[1.1] tracking-[-0.05em] xl:text-6xl">Every order.<br/><span className="text-emerald-400">Packed right.</span></h1>
            <p className="mt-6 max-w-md text-base leading-8 text-slate-400">One focused place to receive, verify, pack and hand off customer orders. Move fast without missing a single item.</p>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
              {[['inbox','Receive'],['scan','Verify'],['truck','Dispatch']].map(([icon,name]) => (
                <div key={name} className="rounded-2xl border border-white/10 bg-white/5 p-4"><PackerIcon name={icon} className="h-6 w-6 text-emerald-400"/><p className="mt-3 text-sm font-bold">{name}</p></div>
              ))}
            </div>
          </div>
          <p className="relative z-10 text-xs text-slate-500">Secure staff workspace · Digital Dine-In</p>
        </div>

        <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#132338] text-emerald-400"><PackerIcon name="box" className="h-6 w-6"/></span>
              <div><p className="text-sm font-black">Digital Dine-In</p><p className="text-xs text-slate-500">Packer Portal</p></div>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.07)] sm:px-9 sm:py-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><PackerIcon name="shield" className="h-7 w-7"/></div>
              <p className="mt-7 text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-600">Staff sign in</p>
              <h2 className="mt-2 text-[30px] font-black leading-tight tracking-tight">Welcome back.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">Sign in with the Packer User ID and password given by your store owner.</p>
              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                <label className="block">
                  <span className="mb-2 block text-xs font-extrabold text-slate-700">Packer User ID</span>
                  <input autoComplete="username" autoCapitalize="none" spellCheck={false} required value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="e.g. packer01" className="h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-extrabold text-slate-700">Password</span>
                  <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10" />
                </label>
                {error && <div role="alert" className="flex gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-semibold leading-5 text-red-700"><PackerIcon name="alert" className="mt-0.5 h-4 w-4 shrink-0"/>{error}</div>}
                <button type="submit" disabled={loggingIn} className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#12253c] px-5 text-sm font-extrabold text-white shadow-lg shadow-slate-900/10 transition hover:bg-[#1c3756] active:scale-[0.99] disabled:cursor-wait disabled:opacity-60">
                  {loggingIn ? 'Signing in…' : 'Open Pack Station'}
                  {!loggingIn && <PackerIcon name="arrow" className="h-4 w-4"/>}
                </button>
              </form>
              <p className="mt-7 flex items-center justify-center gap-2 text-center text-xs font-medium text-slate-400"><PackerIcon name="shield" className="h-4 w-4"/> Authorized packer access only</p>
            </div>
            <p className="mt-6 text-center text-xs text-slate-400">Store code: <span className="font-mono font-bold text-slate-500">{restaurantCode}</span></p>
          </div>
        </div>
      </main>
    )
  }

  const packer = portalData.packer || {}
  const restaurant = portalData.restaurant || {}
  const packerName = String(packer.name || 'Team member')
  const activeOrders = [
    ...sections.received,
    ...sections.confirmed,
  ]

  const otherOrders = orders.filter((order) => {
    const status = String(order.order_status || '').toLowerCase()
    return !['received', 'confirmed', 'preparing', 'packed', 'out_for_delivery'].includes(status)
  })

  // All order views are UI-only: live data and server-authorized status rules stay unchanged.
  const stages = [
    { key: 'overview', label: 'Dashboard', icon: 'grid', count: orders.length },
    { key: 'all', label: 'All Orders', icon: 'box', count: orders.length },
    { key: 'active', label: 'Active Orders', icon: 'clock', count: activeOrders.length },
    { key: 'received', label: 'New Orders', icon: 'inbox', count: sections.received.length },
    { key: 'confirmed', label: 'Active Packing', icon: 'scan', count: sections.confirmed.length },
    { key: 'packed', label: 'Packed Orders', icon: 'check', count: sections.packed.length },
    { key: 'out_for_delivery', label: 'Out for Delivery', icon: 'truck', count: sections.out_for_delivery.length },
  ]

  const selectView = (key) => {
    setActiveStage(key)
    if (key !== 'overview') setOrdersMenuOpen(true)
    setOrderSearch('')
    if (key !== 'overview' && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        document.getElementById('packer-orders-content')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    }
  }

  const searchedOrders = (rows) => {
    const term = orderSearch.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((order) => [
      order.order_code, order.customer_name, order.customer_mobile,
      ...(Array.isArray(order.items) ? order.items.map((item) => item.name) : []),
    ].some((value) => String(value || '').toLowerCase().includes(term)))
  }

  const renderOrders = (stageKey, title, subtitle, sourceRows) => {
    const rows = searchedOrders(sourceRows)
    return (
      <section key={stageKey} className="min-w-0 scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${stageKey === 'received' ? 'bg-amber-500' : stageKey === 'confirmed' ? 'bg-sky-500' : stageKey === 'packed' ? 'bg-emerald-500' : 'bg-violet-500'}`}/><p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">{subtitle}</p></div>
            <h2 className="mt-1 text-xl font-black tracking-tight text-[#12253c]">{title}</h2>
          </div>
          <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600">{rows.length} {rows.length === 1 ? 'order' : 'orders'}</span>
        </div>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {rows.map((order) => {
            const status = String(order.order_status || '')
            const packing = order?.packing || null
            const hasPackingData = Boolean(packing && typeof packing === 'object' && 'requires_scan' in packing)
            const requiresScan = Boolean(packing?.requires_scan)
            const readyToPack = hasPackingData ? Boolean(packing?.ready_to_pack) : false
            const requiredTotal = Number(packing?.required_total || 0)
            const scannedTotal = Number(packing?.scanned_total || 0)
            const remainingTotal = Number(packing?.remaining_total || 0)
            const missingBarcodeCount = Number(packing?.missing_barcode_count || 0)
            const packingItems = Array.isArray(packing?.items) ? packing.items : []
            const busy = updatingOrderId === order.id
            const scanBusy = scanningOrderId === order.id
            const progressPercent = requiredTotal > 0 ? Math.min(100, Math.round((scannedTotal / requiredTotal) * 100)) : 100
            const canScan = ['confirmed', 'preparing'].includes(status) && !readyToPack && missingBarcodeCount === 0
            const expanded = Boolean(detailsOpen[order.id])
            const address = [order.address_line1, order.address_line2, order.landmark, order.city, order.state, order.pincode].filter(Boolean).join(', ')
            const lat = order.latitude == null || order.latitude === '' ? NaN : Number(order.latitude)
            const lng = order.longitude == null || order.longitude === '' ? NaN : Number(order.longitude)
            const hasLocation = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
            const mapQuery = hasLocation ? `${lat},${lng}` : address
            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
            const orderItems = Array.isArray(order.items) ? order.items : []
            const itemTotal = orderItems.reduce((sum, item) => sum + Number(item.quantity || item.qty || 1), 0)
            const isReceived = status === 'received'
            const isWorking = ['confirmed', 'preparing'].includes(status)
            const isPacked = status === 'packed'
            const isOut = status === 'out_for_delivery'
            const badgeTone = isReceived ? 'bg-amber-50 text-amber-700 ring-amber-200' : isWorking ? 'bg-sky-50 text-sky-700 ring-sky-200' : isPacked ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-violet-50 text-violet-700 ring-violet-200'

            return (
              <article key={order.id} className="group flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_5px_28px_rgba(15,23,42,0.035)] transition hover:border-slate-300 hover:shadow-[0_16px_35px_rgba(15,23,42,0.075)]">
                <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[15px] font-black tracking-tight text-[#12253c]">#{order.order_code || 'ORDER'}</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-extrabold ring-1 ${badgeTone}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{labelStatus(status)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><PackerIcon name="clock" className="h-3.5 w-3.5"/>{formatDate(order.created_at)}</span>
                    <span className="inline-flex items-center gap-1"><PackerIcon name="box" className="h-3.5 w-3.5"/>{itemTotal} {itemTotal === 1 ? 'unit' : 'units'}</span>
                    <span className="font-bold text-slate-700">{order.payment_method === 'cod' ? 'COD' : 'Prepaid'} · {money(order.total_amount)}</span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col px-4 py-4 sm:px-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef4fa] text-[#163a5a]"><PackerIcon name="user" className="h-5 w-5"/></div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-[#12253c]">{order.customer_name || 'Customer'}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{order.customer_mobile || 'Mobile not provided'}{order.alternate_mobile ? ` · Alt ${order.alternate_mobile}` : ''}</p></div>
                    {order.customer_mobile && <a href={`tel:${order.customer_mobile}`} aria-label="Call customer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"><PackerIcon name="phone" className="h-4 w-4"/></a>}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl bg-[#f6f8fb] p-3.5 sm:p-4">
                    <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Packing checklist</p><span className="rounded-lg bg-white px-2 py-1 text-[10px] font-extrabold text-slate-600">{orderItems.length} products</span></div>
                    <ul className="mt-3 space-y-2.5">
                      {orderItems.map((item, index) => <li key={item.id || index} className="flex items-start gap-3 text-sm"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] font-black text-slate-700">{Number(item.quantity || item.qty || 1)}×</span><div className="min-w-0 flex-1"><p className="break-words font-semibold leading-6 text-slate-800">{item.name || 'Product'}</p></div><span className="shrink-0 pt-1 text-xs font-extrabold text-slate-600">{money(item.line_total ?? Number(item.price || 0) * Number(item.quantity || item.qty || 1))}</span></li>)}
                      {!orderItems.length && <li className="text-xs text-slate-500">No item details available.</li>}
                    </ul>
                  </div>

                  {hasPackingData && <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div><p className="flex items-center gap-1.5 text-xs font-extrabold text-[#12253c]"><PackerIcon name="scan" className="h-4 w-4 text-emerald-600"/> Barcode verification</p><p className="mt-1 text-[11px] text-slate-500">{requiresScan ? `${scannedTotal} of ${requiredTotal} units verified` : 'Food-only · No barcode scan needed'}</p></div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${readyToPack ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{readyToPack ? 'Ready' : 'Pending'}</span>
                    </div>
                    {requiresScan && <><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{width:`${progressPercent}%`}}/></div><p className="mt-1.5 text-right text-[10px] font-bold text-slate-500">{progressPercent}% complete</p></>}
                    {requiresScan && packingItems.length > 0 && <div className="mt-3 space-y-2">{packingItems.map((item, i) => <div key={`${item.menu_item_id || item.name || i}`} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-[11px] font-bold text-slate-700">{item.name || 'Packaged product'}</p><p className="mt-0.5 text-[10px] text-slate-500">{item.barcode ? 'Barcode configured' : 'Missing barcode'}</p></div><span className={`shrink-0 rounded-lg px-2 py-1 font-mono text-[11px] font-black ${item.complete ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-700'}`}>{Number(item.scanned_quantity || 0)}/{Number(item.required_quantity || 0)}</span></div>)}</div>}
                    {missingBarcodeCount > 0 && <div className="mt-3 flex gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-[11px] font-semibold leading-5 text-red-700"><PackerIcon name="alert" className="mt-0.5 h-4 w-4 shrink-0"/>{missingBarcodeCount} packaged {missingBarcodeCount === 1 ? 'product has' : 'products have'} no configured barcode. Ask the manager to configure it before marking this order Packed.</div>}
                    {canScan && <div className="mt-4 space-y-2.5"><form onSubmit={async (event)=>{event.preventDefault(); await submitBarcode(order.id,barcodeInputs[order.id])}} className="flex min-w-0 gap-2"><input aria-label={`Barcode for order ${order.order_code || order.id}`} value={barcodeInputs[order.id] || ''} onChange={(event)=>setBarcodeInputs((current)=>({...current,[order.id]:event.target.value}))} autoComplete="off" inputMode="text" placeholder="Scan or enter barcode" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"/><button type="submit" disabled={scanBusy || !String(barcodeInputs[order.id] || '').trim()} className="h-11 shrink-0 rounded-xl bg-[#14253c] px-4 text-xs font-extrabold text-white disabled:opacity-40">{scanBusy?'Checking…':'Verify'}</button></form><button type="button" disabled={scanBusy || Boolean(cameraOrderId)} onClick={()=>openCameraScanner(order.id)} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"><PackerIcon name="camera" className="h-4 w-4"/> Scan with camera</button><p className="text-[10px] leading-4 text-slate-400">Scan each physical packaged unit once. {remainingTotal} remaining.</p></div>}
                    {readyToPack && <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] font-bold text-emerald-700"><PackerIcon name="check" className="h-4 w-4"/> All required verification complete</div>}
                  </div>}

                  <div className="mt-4 rounded-xl border border-slate-200 bg-white">
                    <button type="button" aria-expanded={expanded} onClick={()=>setDetailsOpen((current)=>({...current,[order.id]:!current[order.id]}))} className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left text-xs font-bold text-slate-700"><span className="flex items-center gap-2"><PackerIcon name="pin" className="h-4 w-4 text-slate-500"/> Delivery and driver details</span><PackerIcon name="chevron" className={`h-4 w-4 text-slate-400 transition-transform ${expanded?'rotate-180':''}`}/></button>
                    {expanded && <div className="space-y-3 border-t border-slate-100 px-3.5 py-3 text-xs"><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Delivery address</p><p className="mt-1 break-words leading-5 text-slate-700">{address || 'Address not provided'}</p>{hasLocation && <p className="mt-1 text-[10px] font-bold text-emerald-700">Location pin captured{order.location_accuracy_m ? ` · ±${Math.round(Number(order.location_accuracy_m))} m` : ''}</p>}</div><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Assigned driver</p><p className="mt-1 font-bold text-slate-700">{order.driver_name || 'Waiting for driver assignment'}</p>{order.driver_mobile && <p className="mt-1 text-slate-500">{order.driver_mobile}</p>}</div><div className="flex flex-wrap gap-2">{order.customer_mobile && <a href={`tel:${order.customer_mobile}`} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 font-bold text-slate-700"><PackerIcon name="phone" className="h-3.5 w-3.5"/> Call customer</a>}{mapQuery && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-3 py-2 font-bold text-sky-700"><PackerIcon name="pin" className="h-3.5 w-3.5"/> Open location</a>}</div></div>}
                  </div>

                  <div className="mt-auto pt-4">
                    {(isPacked || isOut) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOrderSnapshot(null)
                          setSelectedOrderId(order.id)
                        }}
                        className="mb-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-extrabold text-emerald-800 transition hover:bg-emerald-100"
                      >
                        <PackerIcon name="box" className="h-4 w-4" />
                        View Full Order Details
                        <PackerIcon name="right" className="h-4 w-4" />
                      </button>
                    )}
                    {isReceived && <button type="button" disabled={busy} onClick={()=>updateStatus(order,'confirmed')} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#162a43] px-4 text-sm font-extrabold text-white shadow-md shadow-slate-900/10 transition hover:bg-[#233e5e] active:scale-[0.99] disabled:opacity-50">{busy?'Updating…':'Start Packing'}{!busy && <PackerIcon name="arrow" className="h-4 w-4"/>}</button>}
                    {isWorking && <button type="button" onClick={()=>{setFocusOrderId(order.id);selectView('confirmed')}} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-extrabold text-white shadow-md shadow-emerald-500/15 transition hover:bg-emerald-700 active:scale-[0.99]"><PackerIcon name="scan" className="h-4 w-4"/>Open Packing Workspace</button>}
                    {isPacked && <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-bold leading-5 text-emerald-800"><PackerIcon name="check" className="h-4 w-4 shrink-0"/><div>{order.driver_id ? 'Packed · Waiting for driver to start delivery' : 'Packed · Waiting for driver assignment'}<p className="mt-1 font-normal text-emerald-700">Only the assigned driver can acknowledge and start delivery.</p></div></div>}
                    {isOut && <div className="flex gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 text-xs font-bold leading-5 text-violet-800"><PackerIcon name="truck" className="h-4 w-4 shrink-0"/><div>Out for delivery<p className="mt-1 font-normal text-violet-700">The driver completes delivery with proof.</p></div></div>}
                  </div>
                </div>
              </article>
            )
          })}
          {!rows.length && <div className="col-span-full flex min-h-48 flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-10 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><PackerIcon name={orderSearch?'search':'check'} className="h-6 w-6"/></div><p className="mt-4 text-sm font-extrabold text-[#12253c]">{orderSearch ? 'No matching orders' : 'All clear here'}</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{orderSearch ? 'Try searching another order number, customer or product.' : 'No orders in this stage right now. New orders will appear automatically.'}</p></div>}
        </div>
      </section>
    )
  }

  return (
    <main className={`dd-packer-mobile min-h-[100dvh] overflow-x-hidden bg-[#f5f7fa] pb-24 font-sans text-slate-900 ${mobilePackerTheme === 'dark' ? 'dd-packer-dark' : ''}`}>
      <style>{`
      @media (max-width:1023px) {
        .dd-packer-dark {background:#0f172a!important;color:#f8fafc!important;}
        .dd-packer-dark header,.dd-packer-dark .bg-white {background-color:#1e293b!important;border-color:#334155!important;}
        .dd-packer-dark .text-slate-900,.dd-packer-dark .text-slate-800,.dd-packer-dark [class*="text-[#12253c]"],.dd-packer-dark [class*="text-[#122238]"] {color:#f8fafc!important;}
        .dd-packer-dark .text-slate-500,.dd-packer-dark .text-slate-600 {color:#cbd5e1!important;}
        .dd-packer-dark input {background:#0f172a!important;color:#fff!important;}
      }
      @media(prefers-reduced-motion:reduce){.dd-packer-mobile *{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
      `}</style>
      <div className="lg:flex lg:min-h-[100dvh]">
        {/* Desktop sidebar */}
        <aside className="hidden w-[252px] shrink-0 flex-col bg-[#122238] text-white lg:sticky lg:top-0 lg:flex lg:h-[100dvh]">
          <div className="flex items-center gap-3 border-b border-white/10 px-6 py-7"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400 text-[#122238]"><PackerIcon name="box" className="h-6 w-6"/></div><div><p className="text-sm font-black tracking-tight">Digital Dine-In</p><p className="mt-0.5 text-[11px] text-slate-400">Pack Station</p></div></div>
          <div className="min-h-0 overflow-y-auto px-4 pt-7 pb-5">
            <p className="px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
            <nav aria-label="Packer sections" className="mt-3 space-y-1">
              <button type="button" onClick={() => selectView('overview')} aria-current={activeStage === 'overview' ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-sm font-bold transition ${activeStage === 'overview' ? 'bg-emerald-400 text-[#10243a] shadow-md shadow-black/10' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}>
                <PackerIcon name="grid" className="h-4.5 w-4.5"/><span className="flex-1">Dashboard</span>
              </button>
              <button type="button" onClick={() => { setOrdersMenuOpen(true); selectView('all') }} aria-expanded={ordersMenuOpen} aria-controls="packer-orders-submenu" className={`flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-sm font-bold transition ${activeStage !== 'overview' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}>
                <PackerIcon name="box" className="h-4.5 w-4.5"/>
                <span className="flex-1">Orders</span>
                <span className="rounded-lg bg-white/10 px-1.5 py-0.5 text-[11px] font-black">{orders.length}</span>
                <PackerIcon name="chevron" className={`h-4 w-4 transition-transform ${ordersMenuOpen ? 'rotate-180' : ''}`}/>
              </button>
              {ordersMenuOpen && (
                <div id="packer-orders-submenu" className="ml-4 space-y-1 border-l border-white/15 pl-3 pt-1">
                  {stages.filter((stage) => stage.key !== 'overview').map((stage) => (
                    <button key={stage.key} type="button" onClick={() => selectView(stage.key)} aria-current={activeStage === stage.key ? 'page' : undefined} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-3 text-left text-xs font-bold transition ${activeStage === stage.key ? 'bg-emerald-400 text-[#10243a]' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}>
                      <PackerIcon name={stage.icon} className="h-4 w-4"/>
                      <span className="flex-1">{stage.label}</span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${activeStage === stage.key ? 'bg-[#10243a]/10' : 'bg-white/10'}`}>{stage.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </nav>
          </div>
          <div className="mx-4 mt-8 rounded-2xl border border-white/10 bg-white/5 p-4"><span className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"/> Live updates</span><p className="mt-2 text-xs leading-5 text-slate-400">Your packing queue stays in sync with incoming delivery orders.</p></div>
          <div className="mt-auto border-t border-white/10 p-4"><div className="flex items-center gap-3 rounded-xl bg-white/5 p-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300"><PackerIcon name="user" className="h-5 w-5"/></div><div className="min-w-0"><p className="truncate text-xs font-extrabold">{packerName}</p><p className="text-[11px] text-slate-400">Packer account</p></div></div><button type="button" onClick={logout} className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-bold text-slate-400 transition hover:bg-white/10 hover:text-white"><PackerIcon name="logout" className="h-4 w-4"/> Sign out</button></div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Header */}
          <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-xl"><div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-9"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#122238] text-emerald-400 lg:hidden"><PackerIcon name="box" className="h-5 w-5"/></div><div className="min-w-0"><p className="truncate text-sm font-black tracking-tight text-[#122238]">{restaurant.name || 'Delivery Pack Station'}</p><p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">Packer dashboard <span className="lg:hidden">· {packerName}</span></p></div></div><div className="flex items-center gap-2"><button type="button" onClick={packerAlarmEnabled?disablePackerAlarm:enablePackerAlarm} aria-pressed={packerAlarmEnabled} className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-extrabold transition ${packerAlarmEnabled?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><PackerIcon name="bell" className="h-4 w-4"/><span className="hidden sm:inline">{packerAlarmEnabled?'Alarm on':'Enable alarm'}</span><span className="sm:hidden">{packerAlarmEnabled?'On':'Alarm'}</span></button><button type="button" disabled={refreshing} onClick={()=>loadPortal('',true)} aria-label="Refresh packing queue" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"><PackerIcon name="refresh" className={`h-4 w-4 ${refreshing?'animate-spin':''}`}/></button><button type="button" onClick={logout} className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-extrabold text-slate-600 transition hover:bg-slate-50 lg:hidden"><PackerIcon name="logout" className="h-4 w-4"/><span className="hidden min-[390px]:inline">Logout</span></button></div></div></header>
          {/* Main */}
          <div className="mx-auto max-w-[1480px] space-y-6 px-4 py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-9 lg:py-8">
            <div className="relative overflow-hidden rounded-[26px] bg-[#13273f] px-5 py-6 text-white sm:px-7 sm:py-7"><div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-2xl"/><div className="pointer-events-none absolute bottom-0 right-16 h-28 w-28 rounded-full border-[28px] border-white/[0.04]"/><div className="relative"><div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"/> Live fulfilment</div><div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-black tracking-tight sm:text-[30px]">Good to see you, {packerName.split(' ')[0]}.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Keep every order accurate and on time. Pick an order, verify the items and get it ready for the driver.</p></div><button type="button" onClick={() => selectView('active')} aria-label={`Open Active Orders, ${activeOrders.length} orders`} className="group flex shrink-0 items-center gap-3 rounded-2xl border border-emerald-400/25 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300"><PackerIcon name="box" className="h-5 w-5"/></div><div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Open active orders</p><p className="text-2xl font-black tabular-nums">{activeOrders.length}</p></div><PackerIcon name="right" className="h-4 w-4 text-emerald-300 transition group-hover:translate-x-1"/></button></div></div></div>

            {/* One-tap access to incoming work and packed order details. */}
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => selectView('active')}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${activeStage === 'active' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><PackerIcon name="inbox" className="h-6 w-6" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-black text-[#12253c]">Incoming & Active Packing</span><span className="mt-1 block text-xs font-semibold text-slate-500">{sections.received.length} incoming · {sections.confirmed.length} being packed</span></span>
                <PackerIcon name="right" className="h-5 w-5 text-slate-500" />
              </button>
              <button
                type="button"
                onClick={() => selectView('packed')}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${activeStage === 'packed' ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><PackerIcon name="check" className="h-6 w-6" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-black text-[#12253c]">Packed Orders & Details</span><span className="mt-1 block text-xs font-semibold text-slate-500">{sections.packed.length} packed orders · View details</span></span>
                <PackerIcon name="right" className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            {/* Queue overview cards */}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[
              {key:'received',name:'New orders',detail:'Waiting to start',count:sections.received.length,icon:'inbox',accent:'text-amber-600',background:'bg-amber-50'},
              {key:'confirmed',name:'Packing now',detail:'Being prepared',count:sections.confirmed.length,icon:'scan',accent:'text-sky-600',background:'bg-sky-50'},
              {key:'packed',name:'Packed orders',detail:'View order details',count:sections.packed.length,icon:'check',accent:'text-emerald-600',background:'bg-emerald-50'},
              {key:'out_for_delivery',name:'On the road',detail:'With delivery staff',count:sections.out_for_delivery.length,icon:'truck',accent:'text-violet-600',background:'bg-violet-50'},
            ].map((tile)=><button key={tile.key} type="button" onClick={()=>selectView(tile.key)} className={`rounded-[22px] border bg-white p-4 text-left shadow-[0_4px_20px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${activeStage===tile.key?'border-emerald-400 ring-2 ring-emerald-400/10':'border-slate-200'}`}><div className="flex items-start justify-between gap-2"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tile.background} ${tile.accent}`}><PackerIcon name={tile.icon} className="h-5 w-5"/></div><span className="text-2xl font-black tracking-tight tabular-nums text-[#12253c] sm:text-3xl">{tile.count}</span></div><p className="mt-4 text-xs font-extrabold text-[#12253c] sm:text-sm">{tile.name}</p><p className="mt-1 text-[11px] text-slate-500">{tile.detail}</p></button>)}</div>

            {packerAlarmEnabled && <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${packerAlarmActive?'border-amber-200 bg-amber-50':'border-emerald-200 bg-emerald-50'}`}><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${packerAlarmActive?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}`}><PackerIcon name="bell" className="h-4.5 w-4.5"/></div><div><p className={`text-xs font-black ${packerAlarmActive?'text-amber-800':'text-emerald-800'}`}>{packerAlarmActive?`${waitingToPackOrders.length} waiting ${waitingToPackOrders.length===1?'order needs':'orders need'} attention`:packingInProgressOrders.length>0?'Alarm paused while packing':'Packing alarm ready'}</p><p className="mt-1 text-[11px] leading-5 text-slate-600">{packerAlarmActive?'Start packing the next waiting order to silence the alarm.':packingInProgressOrders.length>0?'The alarm resumes if new orders are waiting after your active packing work.':'You will be notified when a new order needs packing.'}</p></div></div>}

            {message && <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700"><PackerIcon name="check" className="h-4 w-4 shrink-0"/>{message}</div>}
            {error && <div role="alert" className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700"><PackerIcon name="alert" className="h-4 w-4 shrink-0"/>{error}</div>}

            {/* Queue navigation and search */}
            <div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-600">Order management</p><h2 className="mt-1 text-[23px] font-black tracking-tight text-[#12253c]">{stages.find((stage) => stage.key === activeStage)?.label || 'Packing queue'}</h2></div><p className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"/> Automatically updated</p></div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><nav aria-label="Orders and order stages" className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:hidden">{stages.map((stage)=><button key={stage.key} type="button" onClick={()=>selectView(stage.key)} aria-pressed={activeStage===stage.key} className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-[11px] font-extrabold transition ${activeStage===stage.key?'border-[#12253c] bg-[#12253c] text-white':'border-slate-200 bg-white text-slate-600'}`}><PackerIcon name={stage.icon} className="h-4 w-4"/>{stage.label}<span className={`rounded-md px-1.5 py-0.5 text-[10px] ${activeStage===stage.key?'bg-white/20':'bg-slate-100'}`}>{stage.count}</span></button>)}</nav><label className="relative block w-full sm:max-w-xs"><PackerIcon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={orderSearch} onChange={(event)=>setOrderSearch(event.target.value)} type="search" aria-label="Search orders" placeholder="Search order, customer or product" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"/></label></div>
            </div>

            <div id="packer-orders-content" className="scroll-mt-28 space-y-9" role="region" aria-live="polite" aria-label={stages.find((stage) => stage.key === activeStage)?.label || 'Packing queue'}>
              {['overview', 'all'].includes(activeStage) ? (
                <>
                  {renderOrders('received', 'New Orders', 'Awaiting your attention', sections.received)}
                  {renderOrders('confirmed', 'Packing Now', 'In progress', sections.confirmed)}
                  {renderOrders('packed', 'Packed Orders', 'Open an order to view its full details; driver handoff remains separate', sections.packed)}
                  {renderOrders('out_for_delivery', 'Out for Delivery', 'Driver handoff complete', sections.out_for_delivery)}
                  {otherOrders.length > 0 && renderOrders('other', 'Other Orders', 'Other statuses returned by your store', otherOrders)}
                </>
              ) : ['active', 'received', 'confirmed'].includes(activeStage) ? (
                <FocusedPackerWorkspace
                  rows={searchedOrders(
                    activeStage === 'received' ? sections.received :
                    activeStage === 'confirmed' ? sections.confirmed :
                    [...sections.confirmed, ...sections.received]
                  )}
                  focusOrderId={focusOrderId}
                  setFocusOrderId={setFocusOrderId}
                  updateStatus={updateStatus}
                  updatingOrderId={updatingOrderId}
                  scanningOrderId={scanningOrderId}
                  barcodeInputs={barcodeInputs}
                  setBarcodeInputs={setBarcodeInputs}
                  submitBarcode={submitBarcode}
                  openCameraScanner={openCameraScanner}
                  cameraOrderId={cameraOrderId}
                />
              ) : activeStage === 'packed' ? (
                renderOrders('packed', 'Packed Orders', 'View completed packing details', sections.packed)
              ) : (
                renderOrders('out_for_delivery', 'Out for Delivery', 'Driver handoff complete', sections.out_for_delivery)
              )}
            </div>
            <p className="border-t border-slate-200 pt-5 text-center text-[11px] text-slate-400">Digital Dine-In · Pack Station · Accurate packing, every time</p>
          </div>
        </div>
      </div>

      <nav aria-label="Packer mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-200 bg-white/95 px-2 pt-2 shadow-[0_-8px_24px_rgba(15,23,42,.08)] backdrop-blur-lg lg:hidden" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-2">
          {[
            { key: 'home', label: 'Home', icon: 'grid' },
            { key: 'scan', label: 'Scan', icon: 'scan' },
            { key: 'orders', label: 'Orders', icon: 'box' },
            { key: 'profile', label: 'Profile', icon: 'user' },
          ].map((tab) => (
            <button key={tab.key} type="button" aria-label={tab.label} aria-current={(tab.key === 'home' && activeStage === 'overview') || (tab.key === 'scan' && activeStage === 'active') || (tab.key === 'orders' && activeStage === 'all') || (tab.key === 'profile' && mobilePackerMenu) ? 'page' : undefined}
              onClick={() => {
                if (tab.key === 'profile') { setMobilePackerMenu(true); return }
                setMobilePackerMenu(false)
                selectView(tab.key === 'home' ? 'overview' : tab.key === 'scan' ? 'active' : 'all')
              }}
              className={`flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-xs font-extrabold ${((tab.key === 'home' && activeStage === 'overview') || (tab.key === 'scan' && activeStage === 'active') || (tab.key === 'orders' && activeStage === 'all')) ? 'bg-amber-100 text-amber-900' : 'text-slate-600'}`}>
              <PackerIcon name={tab.icon} className="h-5 w-5"/>{tab.label}
            </button>
          ))}
        </div>
      </nav>
      {mobilePackerMenu && <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/60 p-3 lg:hidden" role="presentation" onClick={() => setMobilePackerMenu(false)}>
        <section role="dialog" aria-modal="true" aria-label="Packer profile and settings" onClick={(event) => event.stopPropagation()} className="w-full rounded-3xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-slate-900 shadow-xl">
          <div className="flex items-center justify-between"><div><h2 className="text-xl font-black">{packerName}</h2><p className="text-sm text-slate-500">Packing operations</p></div><button type="button" aria-label="Close profile" onClick={() => setMobilePackerMenu(false)} className="min-h-11 rounded-xl bg-slate-100 px-4">Close</button></div>
          <p className="mt-4 text-sm font-bold">Today's queue: {orders.length} · Active: {activeOrders.length} · Packed: {sections.packed.length}</p>
          <button type="button" onClick={() => setMobilePackerTheme(x => x === 'light' ? 'dark' : 'light')} className="mt-4 min-h-12 w-full rounded-xl border border-slate-200 font-bold">Switch to {mobilePackerTheme === 'light' ? 'dark' : 'light'} mode</button>
          <button type="button" onClick={logout} className="mt-3 min-h-12 w-full rounded-xl bg-rose-600 font-bold text-white">Sign out</button>
        </section>
      </div>}

      {selectedOrder && (
        <PackerOrderDetailsDialog
          order={selectedOrder}
          onClose={closeOrderDetails}
        />
      )}

      {/* Barcode camera modal: same native scanner and one-scan-per-open behavior. */}
      {cameraOrderId && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#07121f]/85 p-0 backdrop-blur-sm sm:items-center sm:p-5"><section role="dialog" aria-modal="true" aria-label="Scan product barcode" className="w-full max-w-md overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]"><div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600">Product verification</p><h3 className="mt-1 text-lg font-black text-[#12253c]">Scan one barcode</h3></div><button type="button" aria-label="Close barcode scanner" onClick={closeCameraScanner} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><PackerIcon name="close" className="h-5 w-5"/></button></div><div className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5"><div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#0b1523]"><video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover"/><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-[42%] w-[78%] rounded-xl border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(0,0,0,0.32)]"/><div className="absolute h-[2px] w-[65%] bg-emerald-400/80 shadow-[0_0_15px_rgba(52,211,153,0.5)]"/></div>{cameraStarting && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-bold text-white">Opening camera…</div>}</div>{cameraError?<div role="alert" className="mt-3 flex gap-2 rounded-xl bg-amber-50 px-3 py-3 text-xs font-semibold leading-5 text-amber-800"><PackerIcon name="alert" className="h-4 w-4 shrink-0"/>{cameraError}</div>:<p className="mt-4 text-center text-xs leading-5 text-slate-500">Place one product barcode inside the frame. For accuracy, each camera session verifies only one unit.</p>}<button type="button" onClick={closeCameraScanner} className="mt-5 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 text-sm font-extrabold text-slate-700">Cancel scanning</button></div></section></div>}
    </main>
  )
}
