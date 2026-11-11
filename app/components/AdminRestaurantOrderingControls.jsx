'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RestaurantLocationPicker } from '@/app/components/RestaurantLocationPicker'

// These are the existing Digital Dine-In plan codes. The server still decides
// actual access; this summary never grants permissions.
const RESTAURANT_PLANS = new Set([
  'restaurant_pro',
  'restaurant_standard',
  'restaurant_resort_pro',
  'restaurant_resort_standard',
  'restaurant_delivery',
  'restaurant_resort_delivery',
])
const DELIVERY_PLANS = new Set([
  'delivery',
  'restaurant_delivery',
  'restaurant_resort_delivery',
])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const inputClass = 'mt-1.5 w-full rounded-xl border border-neutral-700 bg-[#0b0e15] px-3 py-2.5 text-xs text-white outline-none focus:border-red-500 disabled:opacity-50'
const buttonClass = 'rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-xs font-bold text-neutral-200 transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40'

async function adminOrderingRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.success !== true) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Super Admin session required. Sign in again and retry.')
    }
    throw new Error(data.message || `Ordering request failed (${response.status}).`)
  }
  return data
}

function Capability({ label, allowed, hint }) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
      <p className="text-[10px] font-black text-neutral-200">{label}</p>
      <p className={`mt-1 text-[10px] font-bold ${allowed ? 'text-emerald-400' : 'text-neutral-500'}`}>
        {allowed ? 'Allowed by plan & feature switches' : 'Not enabled in selected access'}
      </p>
      {hint && <p className="mt-1 text-[9px] leading-4 text-neutral-500">{hint}</p>}
    </div>
  )
}

/**
 * Shared Super Admin ordering editor.
 *
 * Inside Tenants & Access: pass restaurantId + tenant. It automatically loads
 * that tenant's policy without asking the admin to type a UUID.
 * In the Commerce sidebar: pass tenants, and select a tenant from the list.
 * All reads/writes go through the existing admin-only ordering API.
 */
export default function AdminRestaurantOrderingControls({
  restaurantId = '',
  tenant = null,
  tenants = [],
  compact = false,
}) {
  const [selectedId, setSelectedId] = useState('')
  const activeId = restaurantId || selectedId
  const selectedTenant = useMemo(() => {
    if (tenant && String(tenant.id) === String(activeId)) return tenant
    return (Array.isArray(tenants) ? tenants : []).find((item) => String(item.id) === String(activeId)) || null
  }, [tenant, tenants, activeId])

  const [policy, setPolicy] = useState(null)
  const [tables, setTables] = useState([])
  const [tableInput, setTableInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [approveRequested, setApproveRequested] = useState(false)

  const load = useCallback(async (signal) => {
    if (!UUID.test(String(activeId || ''))) return
    setLoading(true)
    setNotice(null)
    try {
      const result = await adminOrderingRequest(
        `/api/admin/restaurant-ordering?restaurantId=${encodeURIComponent(activeId)}`,
        signal ? { signal } : {},
      )
      if (signal?.aborted) return
      setPolicy(result.policy || null)
      setTables(Array.isArray(result.tables) ? result.tables : [])
      setApproveRequested(false)
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') return
      setPolicy(null)
      setTables([])
      setNotice({ type: 'error', message: error?.message || 'Unable to load ordering settings.' })
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [activeId])

  useEffect(() => {
    setPolicy(null)
    setTables([])
    setApproveRequested(false)
    setNotice(null)
    if (!UUID.test(String(activeId || ''))) return undefined
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [activeId, load])

  const planCode = String(selectedTenant?.planCode || selectedTenant?.plan_code || '')
  const features = selectedTenant?.features || {}
  const restaurantIncluded = RESTAURANT_PLANS.has(planCode)
  const deliveryIncluded = DELIVERY_PLANS.has(planCode)
  const restaurantAccess = restaurantIncluded && features.restaurant_enabled !== false
  const deliveryAccess = deliveryIncluded && features.delivery_enabled !== false
  const dineInAllowed = restaurantAccess && features.qr_menu_enabled !== false && features.dine_in_enabled !== false
  const takeawayAllowed = restaurantAccess && features.qr_menu_enabled !== false && features.takeaway_enabled !== false
  const homeDeliveryAllowed = deliveryAccess && features.delivery_customer_ordering_enabled !== false
  const validId = UUID.test(String(activeId || ''))
  const busy = loading || saving

  function changePolicy(key, value) {
    setPolicy((current) => current ? { ...current, [key]: value } : current)
    // A manual coordinate edit is not an approval of the owner's request.
    if (key === 'origin_latitude' || key === 'origin_longitude') setApproveRequested(false)
    setNotice(null)
  }

  // A selected GPS/map point is a draft until the admin explicitly saves policy.
  // Never auto-approve an owner's pending coordinate-change request.
  function applySelectedLocation({ latitude, longitude }) {
    if (!validId || busy || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return
    setPolicy((current) => current ? {
      ...current,
      origin_latitude: latitude,
      origin_longitude: longitude,
    } : current)
    setApproveRequested(false)
    setNotice({ type: 'success', message: 'Location selected. Review it and click Save restaurant ordering policy to persist it.' })
  }

  async function savePolicy() {
    if (!policy || !validId || busy) return
    const latitude = policy.origin_latitude === '' || policy.origin_latitude == null ? null : Number(policy.origin_latitude)
    const longitude = policy.origin_longitude === '' || policy.origin_longitude == null ? null : Number(policy.origin_longitude)
    const radius = Number(policy.radius_m)
    const accuracy = Number(policy.max_accuracy_m)
    const prep = Number(policy.estimated_prep_minutes)
    if ((latitude === null) !== (longitude === null) ||
      (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) ||
      !Number.isInteger(radius) || radius < 20 || radius > 200 ||
      !Number.isInteger(accuracy) || accuracy < 10 || accuracy > 100 ||
      !Number.isInteger(prep) || prep < 5 || prep > 180) {
      setNotice({ type: 'error', message: 'Check the coordinates and numeric ranges before saving.' })
      return
    }
    if (policy.geofence_enabled && (latitude === null || longitude === null)) {
      setNotice({ type: 'error', message: 'Set verified restaurant coordinates before enabling dine-in GPS checks.' })
      return
    }
    // DD_SIGNED_QR_INDEPENDENT_GPS_20261108: signed table QR works with GPS on or off.
    if (approveRequested && !window.confirm('Approve the owner-requested restaurant coordinates and save this policy?')) return
    setSaving(true)
    setNotice(null)
    try {
      const result = await adminOrderingRequest('/api/admin/restaurant-ordering', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: activeId,
          action: 'policy',
          latitude,
          longitude,
          geofenceEnabled: policy.geofence_enabled === true,
          signedQrRequired: policy.signed_table_qr_required === true,
          homeDeliveryEnabled: policy.home_delivery_entry_enabled === true,
          radiusMeters: radius,
          maxAccuracyMeters: accuracy,
          estimatedPrepMinutes: prep,
          approveRequested,
        }),
      })
      setPolicy(result.policy)
      setApproveRequested(false)
      setNotice({ type: 'success', message: 'Restaurant ordering policy saved for this tenant.' })
    } catch (error) {
      setNotice({ type: 'error', message: error?.message || 'Unable to save policy.' })
    } finally {
      setSaving(false)
    }
  }

  async function changeTable(tableLabel, enabled) {
    const label = String(tableLabel || '').trim()
    if (!validId || busy) return
    if (!label || label.length > 50) {
      setNotice({ type: 'error', message: 'Table label must contain 1–50 characters.' })
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      await adminOrderingRequest('/api/admin/restaurant-ordering', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: activeId, action: 'table', table: label, enabled }),
      })
      // Do not call load() while saving; it would briefly reset notices.
      const result = await adminOrderingRequest(
        `/api/admin/restaurant-ordering?restaurantId=${encodeURIComponent(activeId)}`,
      )
      setTables(Array.isArray(result.tables) ? result.tables : [])
      if (enabled) setTableInput('')
      setNotice({ type: 'success', message: `Table ${label} ${enabled ? 'enabled' : 'disabled'}.` })
    } catch (error) {
      setNotice({ type: 'error', message: error?.message || 'Unable to update table.' })
    } finally {
      setSaving(false)
    }
  }

  const displayedPolicy = policy && String(policy.restaurant_id) === String(activeId) ? policy : null
  const fieldList = [
    ['radius_m', 'Dine-in radius (metres)', 1, 20, 200],
    ['max_accuracy_m', 'Maximum GPS uncertainty (metres)', 1, 10, 100],
    ['estimated_prep_minutes', 'Estimated preparation (minutes)', 1, 5, 180],
  ]

  return (
    <div className={`min-w-0 space-y-4 text-neutral-100 ${compact ? '' : 'max-w-5xl'}`}>
      {!restaurantId && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <label htmlFor="admin-ordering-tenant-select" className="block text-xs font-bold text-neutral-300">
            Select a tenant to configure restaurant ordering
          </label>
          <select id="admin-ordering-tenant-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={busy} className={inputClass}>
            <option value="">Choose restaurant / delivery business</option>
            {(Array.isArray(tenants) ? tenants : []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || 'Tenant'} · {item.restaurant_code || item.id}
              </option>
            ))}
          </select>
          {(!Array.isArray(tenants) || tenants.length === 0) && (
            <p className="mt-2 text-xs text-amber-300">No tenants are available in the current Admin Dashboard response.</p>
          )}
        </div>
      )}

      {validId && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.18em] text-red-400">Per-tenant configuration</p>
              <h3 className="mt-1 text-base font-black text-white">
                {selectedTenant?.name || 'Restaurant Ordering'}
              </h3>
              <p className="mt-1 break-all font-mono text-[10px] text-neutral-500">
                {selectedTenant?.restaurant_code || activeId}
              </p>
            </div>
            <button type="button" onClick={() => void load()} disabled={busy} className={buttonClass}>
              {loading ? 'Loading…' : 'Refresh policy'}
            </button>
          </div>

          {selectedTenant && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Capability label="Dine-In / QR" allowed={dineInAllowed} hint="Restaurant plan, QR menu and dine-in feature must all be allowed." />
              <Capability label="Takeaway / Parcel" allowed={takeawayAllowed} hint="Restaurant plan, QR menu and takeaway feature must all be allowed." />
              <Capability label="Home Delivery" allowed={homeDeliveryAllowed} hint="Delivery plan and customer ordering must be allowed; policy toggle is separate." />
              <Capability label="Signed Table QR" allowed={dineInAllowed && displayedPolicy?.signed_table_qr_required === true} hint="Requires an enabled table and a valid signed QR at checkout. GPS is optional." />
            </div>
          )}

          {notice && (
            <div role={notice.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-xs leading-5 ${notice.type === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'}`}>
              {notice.message}
            </div>
          )}

          {loading && !displayedPolicy && <p className="rounded-xl border border-neutral-800 p-4 text-xs text-neutral-400">Loading saved ordering policy…</p>}

          {displayedPolicy && (
            <>
              <section className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
                <div>
                  <h4 className="text-sm font-black text-white">Ordering policy</h4>
                  <p className="mt-1 text-[10px] leading-5 text-neutral-400">
                    These settings are saved separately from tenant plan, subscription and feature switches.
                  </p>
                </div>

                {displayedPolicy.origin_change_requested_at && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-xs font-bold text-amber-200">Owner location change pending</p>
                    <p className="mt-1 text-[10px] leading-5 text-amber-100/80">
                      Requested: {displayedPolicy.requested_origin_latitude}, {displayedPolicy.requested_origin_longitude}.
                      Verify the physical restaurant location before approving.
                    </p>
                    <button type="button" disabled={busy} className="mt-3 rounded-lg bg-amber-600 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40" onClick={() => {
                      setPolicy((current) => ({
                        ...current,
                        origin_latitude: current.requested_origin_latitude,
                        origin_longitude: current.requested_origin_longitude,
                      }))
                      setApproveRequested(true)
                      setNotice(null)
                    }}>
                      Use requested coordinates for next save
                    </button>
                    {approveRequested && <p className="mt-2 text-[10px] text-amber-200">Not approved yet. Click Save ordering policy to apply.</p>}
                  </div>
                )}

                {/* DD_ADMIN_DINEIN_GPS_TOGGLE_20261111: reuses the existing saved geofence_enabled policy. */}
                <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4" aria-label="Customer Dine-In GPS control">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h5 className="text-xs font-black text-white">Customer Dine-In Location Check</h5>
                      <p className="mt-1 text-[10px] leading-5 text-neutral-400">
                        Super Admin controls whether customers must verify GPS inside the restaurant.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Require customer GPS for dine-in ordering"
                      aria-checked={displayedPolicy.geofence_enabled === true}
                      disabled={busy}
                      onClick={() => changePolicy('geofence_enabled', displayedPolicy.geofence_enabled !== true)}
                      className={`shrink-0 rounded-full border px-5 py-2.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${displayedPolicy.geofence_enabled === true ? 'border-emerald-500/40 bg-emerald-600 text-white hover:bg-emerald-500' : 'border-neutral-600 bg-neutral-800 text-neutral-200 hover:bg-neutral-700'}`}
                    >
                      {displayedPolicy.geofence_enabled === true ? 'ON · GPS Required' : 'OFF · No GPS'}
                    </button>
                  </div>
                  <p className="mt-3 text-[10px] leading-5 text-neutral-300">
                    {displayedPolicy.geofence_enabled === true
                      ? 'ON: The customer sees Check my Dine-In location, and checkout verifies GPS.'
                      : 'OFF: The location-check button is hidden, and dine-in checkout does not request GPS.'}
                  </p>
                  <p className="mt-1 text-[10px] leading-5 text-neutral-400">
                    Signed table QR verification remains independent. Click Save restaurant ordering policy below to apply this change.
                  </p>
                </section>

                <div className="space-y-3">
                  {[
                    ['signed_table_qr_required', 'Require signed table QR', 'Only registered and enabled tables with valid signed QR can order dine-in.'],
                    ['home_delivery_entry_enabled', 'Show Home Delivery in restaurant menu', 'Also requires a delivery-enabled plan and delivery customer ordering access.'],
                  ].map(([key, title, description]) => (
                    <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
                      <input type="checkbox" checked={displayedPolicy[key] === true} onChange={(event) => changePolicy(key, event.target.checked)} disabled={busy} className="mt-0.5 h-4 w-4 shrink-0 accent-red-600" />
                      <span>
                        <span className="block text-[11px] font-black text-white">{title}</span>
                        <span className="mt-1 block text-[10px] leading-4 text-neutral-500">{description}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <RestaurantLocationPicker
                  key={activeId}
                  latitude={displayedPolicy.origin_latitude}
                  longitude={displayedPolicy.origin_longitude}
                  radiusMeters={Number(displayedPolicy.radius_m) || 40}
                  maxAccuracyMeters={Number(displayedPolicy.max_accuracy_m) || 50}
                  disabled={busy}
                  onApply={applySelectedLocation}
                />

                <details className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
                  <summary className="cursor-pointer text-[10px] font-black text-neutral-300">
                    Manual latitude / longitude (optional fallback)
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {[
                      ['origin_latitude', 'Restaurant latitude', -90, 90],
                      ['origin_longitude', 'Restaurant longitude', -180, 180],
                    ].map(([key, title, min, max]) => (
                      <label key={key} className="block text-[10px] font-bold text-neutral-300">
                        {title}
                        <input type="number" inputMode="decimal" step="any" min={min} max={max}
                          value={displayedPolicy[key] ?? ''}
                          onChange={(event) => changePolicy(key, event.target.value)}
                          disabled={busy} className={inputClass} />
                      </label>
                    ))}
                  </div>
                </details>

                <div className="grid gap-3 sm:grid-cols-2">
                  {fieldList.map(([key, title, step, min, max]) => (
                    <label key={key} className="block text-[10px] font-bold text-neutral-300">
                      {title}
                      <input type="number" inputMode="decimal" step={step} min={min} max={max} value={displayedPolicy[key] ?? ''} onChange={(event) => changePolicy(key, event.target.value)} disabled={busy} className={inputClass} />
                    </label>
                  ))}
                </div>
                <p className="text-[10px] leading-5 text-neutral-500">
                  Default radius: 40m; maximum reported GPS uncertainty: 50m. Checkout uses a stricter check:
                  measured distance + GPS uncertainty must fit inside the radius. Verify coordinates on-site.
                </p>
                <button type="button" onClick={() => void savePolicy()} disabled={busy} className="w-full rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white transition hover:bg-red-500 disabled:opacity-40">
                  {saving ? 'Saving…' : 'Save restaurant ordering policy'}
                </button>
              </section>

              <section className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
                <h4 className="text-sm font-black text-white">Registered restaurant tables</h4>
                <p className="mt-1 text-[10px] leading-5 text-neutral-500">Register tables before requiring signed QR. Disabled tables cannot be used for new signed-QR dine-in orders.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input aria-label="New table label" maxLength={50} value={tableInput} onChange={(event) => setTableInput(event.target.value)} placeholder="Table number (e.g. 1, A2)" disabled={busy} className={`${inputClass} mt-0 min-w-[140px] flex-1`} />
                  <button type="button" onClick={() => void changeTable(tableInput, true)} disabled={busy || !tableInput.trim()} className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">Add table</button>
                </div>
                <div className="mt-3 space-y-2">
                  {tables.length === 0 && <p className="text-[10px] text-neutral-500">No tables registered for this tenant.</p>}
                  {tables.map((item) => (
                    <div key={item.table_label} className="flex items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-white">Table {item.table_label}</p>
                        <p className={`mt-1 text-[10px] ${item.enabled ? 'text-emerald-400' : 'text-neutral-500'}`}>{item.enabled ? 'Enabled' : 'Disabled'}</p>
                      </div>
                      <button type="button" onClick={() => void changeTable(item.table_label, !item.enabled)} disabled={busy} className={buttonClass}>
                        {item.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
      {!validId && restaurantId && <p role="alert" className="text-xs text-red-400">The selected tenant has an invalid restaurant UUID.</p>}
      {!validId && !restaurantId && <p className="text-xs text-neutral-500">Choose a tenant above to view its saved restaurant-ordering settings.</p>}
    </div>
  )
}