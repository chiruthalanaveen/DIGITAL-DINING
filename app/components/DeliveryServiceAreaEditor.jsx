'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Map library is already used by DeliveryLocationMap. Reuse the same loader.
async function loadLeaflet() {
  if (typeof window === 'undefined') throw new Error('Map requires a browser.')
  if (window.L) return window.L
  if (window.__digitalDineLeafletPromise) return window.__digitalDineLeafletPromise
  const promise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-digital-dine-leaflet="true"]')) {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      css.dataset.digitalDineLeaflet = 'true'
      document.head.appendChild(css)
    }
    const existing = document.querySelector('script[data-digital-dine-leaflet="true"]')
    if (existing) {
      existing.addEventListener('load', () => window.L ? resolve(window.L) : reject(new Error('Map not available.')), { once: true })
      existing.addEventListener('error', () => reject(new Error('Map failed to load.')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.dataset.digitalDineLeaflet = 'true'
    script.onload = () => window.L ? resolve(window.L) : reject(new Error('Map did not initialize.'))
    script.onerror = () => reject(new Error('Unable to load the Leaflet library.'))
    document.body.appendChild(script)
  })
  window.__digitalDineLeafletPromise = promise.catch(error => {
    window.__digitalDineLeafletPromise = null
    throw error
  })
  return window.__digitalDineLeafletPromise
}

function validCoords(lat, lng) {
  return lat !== '' && lng !== '' && lat != null && lng != null &&
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
    Number(lat) >= -90 && Number(lat) <= 90 && Number(lng) >= -180 && Number(lng) <= 180
}

const round = n => Number(Number(n).toFixed(7))
const normalize = points => Array.isArray(points)
  ? points.filter(p => validCoords(p?.lat, p?.lng)).slice(0, 40).map(p => ({ lat: round(p.lat), lng: round(p.lng) })) : []

function AreaMap({ points, onPointsChange, center, radiusKm }) {
  const hostRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(null)
  const onPointsRef = useRef(onPointsChange)
  const pointsRef = useRef(points)
  const [mapError, setMapError] = useState('')
  const [mapReady, setMapReady] = useState(false)
  useEffect(() => { onPointsRef.current = onPointsChange; pointsRef.current = points }, [onPointsChange, points])

  useEffect(() => {
    let alive = true
    let resizeObserver
    let invalidateId
    async function mount() {
      try {
        const L = await loadLeaflet()
        if (!alive || !hostRef.current || mapRef.current) return
        const first = validCoords(center?.lat, center?.lng) ? [Number(center.lat), Number(center.lng)] : [20.5937, 78.9629]
        const map = L.map(hostRef.current, { scrollWheelZoom: true }).setView(first, validCoords(center?.lat, center?.lng) ? 14 : 5)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map)
        const layers = L.layerGroup().addTo(map)
        mapRef.current = map
        layersRef.current = layers
        map.on('click', e => {
          const existing = pointsRef.current
          if (existing.length >= 40) return
          const next = [...existing, { lat: round(e.latlng.lat), lng: round(e.latlng.lng) }]
          pointsRef.current = next
          onPointsRef.current(next)
        })
        invalidateId = window.setTimeout(() => map.invalidateSize(), 160)
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => map.invalidateSize())
          resizeObserver.observe(hostRef.current)
        }
        setMapReady(true)
      } catch (e) {
        if (alive) setMapError(e?.message || 'Unable to show map.')
      }
    }
    void mount()
    return () => {
      alive = false
      if (invalidateId) window.clearTimeout(invalidateId)
      resizeObserver?.disconnect()
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      layersRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.L || !layersRef.current) return
    const L = window.L
    const layers = layersRef.current
    layers.clearLayers()
    if (validCoords(center?.lat, center?.lng) && Number(radiusKm) > 0) {
      L.circle([Number(center.lat), Number(center.lng)], {
        radius: Number(radiusKm) * 1000, color: '#64748b',
        dashArray: '5 7', weight: 1, fillOpacity: 0.015,
      }).addTo(layers)
    }
    if (points.length >= 2) {
      L.polyline(points.map(p => [p.lat, p.lng]), { color: '#16a34a', weight: 4 }).addTo(layers)
    }
    if (points.length >= 3) {
      L.polygon(points.map(p => [p.lat, p.lng]), { color: '#16a34a', weight: 2, fillOpacity: 0.18 }).addTo(layers)
    }
    points.forEach((p, i) => {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 8, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1,
      }).addTo(layers)
      marker.bindTooltip(`Point ${i + 1} — click to remove`, { direction: 'top' })
      marker.on('click', e => {
        L.DomEvent.stopPropagation(e)
        const next = pointsRef.current.filter((_, idx) => idx !== i)
        pointsRef.current = next
        onPointsRef.current(next)
      })
    })
  }, [mapReady, points, center?.lat, center?.lng, radiusKm])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    if (points.length >= 3 && window.L) {
      const bounds = window.L.latLngBounds(points.map(p => [p.lat, p.lng]))
      mapRef.current.fitBounds(bounds.pad(0.25), { maxZoom: 16 })
    } else if (validCoords(center?.lat, center?.lng)) {
      mapRef.current.setView([Number(center.lat), Number(center.lng)], 14)
    }
    // A new store/loaded polygon should recenter; not every click when drawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, center?.lat, center?.lng])

  return <div className="relative overflow-hidden rounded-2xl border border-slate-200">
    <div ref={hostRef} className="h-[380px] w-full bg-slate-100" aria-label="Click map to add delivery boundary points" />
    {mapError && <p className="absolute inset-x-3 top-3 z-[1000] rounded-xl bg-red-50 p-3 text-sm text-red-700">{mapError}</p>}
  </div>
}

// Add to OWNER and MANAGER delivery management portals without replacing existing management features.
export default function DeliveryServiceAreaEditor({
  role = 'owner', restaurantId, restaurantCode, sessionMode = false,
  sessionToken = '', userId = '', password = '',
}) {
  const [points, setPoints] = useState([])
  const [enabled, setEnabled] = useState(false)
  const [savedPoints, setSavedPoints] = useState([])
  const [savedEnabled, setSavedEnabled] = useState(false)
  const [center, setCenter] = useState(null)
  const [radiusKm, setRadiusKm] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const call = useCallback(async (verb, next = {}) => {
    let rpcName, args
    if (role === 'owner') {
      rpcName = verb === 'get' ? 'delivery_owner_service_area_get' : 'delivery_owner_service_area_save'
      args = { p_restaurant_id: restaurantId }
    } else if (role === 'manager') {
      if (sessionMode && sessionToken) {
        rpcName = verb === 'get' ? 'delivery_manager_service_area_get_session' : 'delivery_manager_service_area_save_session'
        args = { p_session_token: sessionToken }
      } else {
        rpcName = verb === 'get' ? 'delivery_manager_service_area_get_legacy' : 'delivery_manager_service_area_save_legacy'
        args = {
          p_restaurant_id: String(restaurantId || ''),
          p_restaurant_code: String(restaurantCode || ''),
          p_user_id: String(userId || ''), p_password: String(password || ''),
        }
      }
    } else throw new Error('Unsupported management role.')
    if (verb !== 'get') {
      args.p_vertices = normalize(next.points)
      args.p_enabled = Boolean(next.enabled)
    }
    const { data, error: rpcError } = await supabase.rpc(rpcName, args)
    if (rpcError) throw rpcError
    if (data?.success !== true) throw new Error(data?.message || 'Service area request was rejected.')
    return data
  }, [role,restaurantId,restaurantCode,sessionMode,sessionToken,userId,password])

  const load = useCallback(async () => {
    if (!restaurantId || !restaurantCode) {
      setLoading(false)
      setError('Store ID or store code is missing. Reload the management portal.')
      return
    }
    setLoading(true); setError(''); setNotice('')
    try {
      const [result, coverage] = await Promise.all([
        call('get'),
        supabase.rpc('get_public_delivery_coverage', { p_restaurant_code: restaurantCode }),
      ])
      const pts = normalize(result.vertices)
      setPoints(pts); setSavedPoints(pts)
      setEnabled(result.enabled === true); setSavedEnabled(result.enabled === true)
      const c = coverage?.data || {}
      if (validCoords(c.delivery_origin_latitude, c.delivery_origin_longitude)) {
        setCenter({ lat: Number(c.delivery_origin_latitude), lng: Number(c.delivery_origin_longitude) })
      } else if (pts.length) setCenter(pts[0])
      setRadiusKm(Math.max(0, Number(c.max_delivery_distance_km || 0)))
    } catch(e) { setError(e?.message || 'Unable to load service area.') }
    finally { setLoading(false) }
  }, [call,restaurantId,restaurantCode])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (saving || loading) return
    if (enabled && points.length < 3) { setError('Mark at least 3 points on the map to enable a custom area.'); return }
    setError(''); setNotice(''); setSaving(true)
    try {
      const result = await call('save', { points, enabled })
      const pts = normalize(result.vertices)
      setPoints(pts); setSavedPoints(pts); setSavedEnabled(result.enabled === true)
      setNotice(result.enabled ? 'Selected boundary is active. New orders outside it will be blocked.' : 'Custom boundary disabled. Existing radius settings remain in use.')
    } catch(e) { setError(e?.message || 'Unable to save service area.') }
    finally { setSaving(false) }
  }

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setError('Device GPS is unavailable. Pan and zoom the map manually.'); return }
    navigator.geolocation.getCurrentPosition(
      p => setCenter({ lat: round(p.coords.latitude), lng: round(p.coords.longitude) }),
      () => setError('Location permission denied; pan the map to your store.'),
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  return <section className="my-5 rounded-3xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm">
    <h2 className="text-lg font-extrabold">Draw delivery service area</h2>
    <p className="mt-1 text-xs leading-5 text-slate-600">Limit delivery to selected streets and neighbourhoods. Click the map to outline the area, click a point to remove it, and save. The existing maximum delivery radius still applies.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={locate} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">Center on my GPS</button>
      <button type="button" disabled={!points.length} onClick={() => setPoints(a => a.slice(0,-1))} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-40">Undo point</button>
      <button type="button" disabled={!points.length} onClick={() => setPoints([])} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-40">Clear area</button>
      <button type="button" onClick={() => { setPoints(savedPoints); setEnabled(savedEnabled) }} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">Reset edits</button>
    </div>
    <div className="mt-3"><AreaMap points={points} onPointsChange={setPoints} center={center} radiusKm={radiusKm} /></div>
    <p className="mt-2 text-xs text-slate-600">{points.length} of 40 boundary points {radiusKm > 0 ? `· Existing circular limit: ${radiusKm} km` : ''}</p>
    <label className="mt-4 flex items-start gap-3 rounded-xl bg-emerald-50 p-3">
      <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="mt-1 h-4 w-4 accent-emerald-600" />
      <span><strong className="block text-sm">Use drawn delivery boundary</strong><span className="block text-xs text-emerald-800">When enabled, only customer addresses inside the saved area can order. When disabled, the current delivery rules apply.</span></span>
    </label>
    {loading && <p className="mt-3 text-sm">Loading current area…</p>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">{notice}</p>}
    <button type="button" onClick={save} disabled={loading || saving || (enabled && points.length<3)} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40">
      {saving ? 'Saving service area…' : enabled ? 'Save & activate selected area' : 'Save with polygon disabled'}
    </button>
    <p className="mt-2 text-xs text-slate-500">Changes affect NEW orders only. Existing orders and deliveries are not cancelled.</p>
  </section>
}