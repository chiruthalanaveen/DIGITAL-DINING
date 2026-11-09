'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'

const buttonClass = 'rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-xs font-bold text-neutral-200 transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40'

function validPoint(latitude, longitude) {
  if (latitude === '' || latitude == null || longitude === '' || longitude == null) return false
  const lat = Number(latitude)
  const lng = Number(longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function normalizedPoint(latitude, longitude) {
  return {
    lat: Number(Number(latitude).toFixed(7)),
    lng: Number(Number(longitude).toFixed(7)),
  }
}

function gpsErrorMessage(error) {
  if (error?.code === 1) return 'Location permission was denied. Allow location access in your browser, or choose the restaurant on the map.'
  if (error?.code === 2) return 'Your device could not determine its location. Try outdoors or select the location on the map.'
  if (error?.code === 3) return 'Location lookup timed out. Retry with a stronger GPS signal or select the location on the map.'
  return 'Could not obtain the device location. Use the map or manual coordinates.'
}

/**
 * A location-selection UI, not an authentication or geofence bypass.
 * GPS is requested only when the administrator clicks the button.
 * Map tiles are loaded only when the map is explicitly opened.
 * Changes are drafts until Apply is clicked, then the parent still requires Save.
 */
export function RestaurantLocationPicker({
  latitude,
  longitude,
  radiusMeters = 40,
  maxAccuracyMeters = 50,
  disabled = false,
  onApply,
}) {
  const [mapOpen, setMapOpen] = useState(false)
  const [candidate, setCandidate] = useState(() =>
    validPoint(latitude, longitude) ? normalizedPoint(latitude, longitude) : null,
  )
  const [source, setSource] = useState('saved')
  const [gpsAccuracy, setGpsAccuracy] = useState(null)
  const [gpsTime, setGpsTime] = useState(null)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [mapError, setMapError] = useState('')
  const [gpsError, setGpsError] = useState('')
  const [applied, setApplied] = useState(false)

  const mapNode = useRef(null)
  const mapInstance = useRef(null)
  const candidateRef = useRef(candidate)
  candidateRef.current = candidate

  // Refresh the preview if the saved policy changes (including a tenant switch).
  // The parent keys this component by restaurant ID, so tenants never share drafts.
  useEffect(() => {
    setCandidate(validPoint(latitude, longitude) ? normalizedPoint(latitude, longitude) : null)
    setSource('saved')
    setGpsAccuracy(null)
    setGpsTime(null)
    setApplied(false)
  }, [latitude, longitude])

  // Load Leaflet in the browser only, avoiding SSR/window errors in Next.js.
  useEffect(() => {
    if (!mapOpen || !mapNode.current) return undefined
    let cancelled = false
    let localMap = null
    setMapError('')

    import('leaflet').then((leafletModule) => {
      if (cancelled || !mapNode.current) return
      const L = leafletModule.default || leafletModule
      const start = candidateRef.current
      const initialCenter = start ? [start.lat, start.lng] : [20, 0]
      const initialZoom = start ? 18 : 2

      localMap = L.map(mapNode.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        keyboard: true,
      }).setView(initialCenter, initialZoom)

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        maxZoom: 19,
      }).addTo(localMap)

      const markerIcon = L.divIcon({
        className: '',
        html: '<div style="width:26px;height:26px;background:#dc2626;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px #0009"><div style="width:8px;height:8px;background:white;border-radius:50%;position:absolute;left:6px;top:6px"></div></div>',
        iconSize: [28, 34],
        iconAnchor: [13, 31],
      })

      const refs = { map: localMap, L, marker: null, circle: null, markerIcon }
      mapInstance.current = refs

      localMap.on('click', (event) => {
        const point = normalizedPoint(event.latlng.lat, event.latlng.lng)
        setCandidate(point)
        setSource('map')
        setGpsAccuracy(null)
        setGpsTime(null)
        setApplied(false)
        setGpsError('')
      })

      const point = candidateRef.current
      if (point) {
        refs.marker = L.marker([point.lat, point.lng], {
          draggable: true,
          icon: markerIcon,
          title: 'Drag to adjust the restaurant centre',
        }).addTo(localMap)
        refs.circle = L.circle([point.lat, point.lng], {
          radius: Number(radiusMeters) > 0 ? Number(radiusMeters) : 40,
          color: '#ef4444',
          fillColor: '#ef4444',
          fillOpacity: 0.08,
          weight: 2,
          interactive: false,
        }).addTo(localMap)
        refs.marker.on('dragend', () => {
          const position = refs.marker.getLatLng()
          setCandidate(normalizedPoint(position.lat, position.lng))
          setSource('map')
          setGpsAccuracy(null)
          setGpsTime(null)
          setApplied(false)
          setGpsError('')
        })
      }
      window.requestAnimationFrame(() => localMap?.invalidateSize())
    }).catch(() => {
      if (!cancelled) setMapError('Map could not load. Check that leaflet is installed and your connection allows OpenStreetMap tiles. GPS and manual entry are still available.')
    })

    return () => {
      cancelled = true
      if (localMap) localMap.remove()
      if (mapInstance.current?.map === localMap) mapInstance.current = null
    }
  // The map is created only when opened. Subsequent changes update its marker.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapOpen])

  useEffect(() => {
    const refs = mapInstance.current
    if (!mapOpen || !refs || !candidate) return
    const { L, map, markerIcon } = refs
    const position = [candidate.lat, candidate.lng]
    if (!refs.marker) {
      refs.marker = L.marker(position, {
        draggable: true,
        icon: markerIcon,
        title: 'Drag to adjust the restaurant centre',
      }).addTo(map)
      refs.marker.on('dragend', () => {
        const point = refs.marker.getLatLng()
        setCandidate(normalizedPoint(point.lat, point.lng))
        setSource('map')
        setGpsAccuracy(null)
        setGpsTime(null)
        setApplied(false)
        setGpsError('')
      })
    } else {
      refs.marker.setLatLng(position)
    }
    if (!refs.circle) {
      refs.circle = L.circle(position, {
        radius: Number(radiusMeters) > 0 ? Number(radiusMeters) : 40,
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.08,
        weight: 2,
        interactive: false,
      }).addTo(map)
    } else {
      refs.circle.setLatLng(position)
      refs.circle.setRadius(Number(radiusMeters) > 0 ? Number(radiusMeters) : 40)
    }
    if (!map.getBounds().contains(position)) map.panTo(position)
  }, [candidate, mapOpen, radiusMeters])

  function useDeviceLocation() {
    if (disabled || gpsBusy) return
    setGpsError('')
    setApplied(false)
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsError('This browser does not support GPS location. Select the restaurant on the map instead.')
      return
    }
    if (!window.isSecureContext) {
      setGpsError('Live GPS requires HTTPS or localhost. Open your HTTPS staging site on a phone, or select the restaurant on the map.')
      return
    }
    setGpsBusy(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords
        if (!validPoint(lat, lng)) {
          setGpsError('The device returned invalid coordinates. Select the restaurant on the map.')
          setGpsBusy(false)
          return
        }
        const point = normalizedPoint(lat, lng)
        setCandidate(point)
        setSource('gps')
        setGpsAccuracy(Number.isFinite(accuracy) ? accuracy : null)
        setGpsTime(position.timestamp || Date.now())
        setMapOpen(true)
        mapInstance.current?.map.setView([point.lat, point.lng], 18)
        setGpsBusy(false)
      },
      (error) => {
        setGpsError(gpsErrorMessage(error))
        setGpsBusy(false)
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  }

  function apply() {
    if (!candidate || disabled || gpsBusy || typeof onApply !== 'function') return
    onApply({ latitude: candidate.lat, longitude: candidate.lng })
    setApplied(true)
  }

  const hasSavedPoint = validPoint(latitude, longitude)
  const unchanged = candidate && hasSavedPoint &&
    Number(latitude) === candidate.lat && Number(longitude) === candidate.lng
  const accuracyLimit = Number(maxAccuracyMeters)
  const gpsUncertain = source === 'gps' && gpsAccuracy != null &&
    Number.isFinite(accuracyLimit) && gpsAccuracy > accuracyLimit

  return (
    <section className="space-y-3 rounded-2xl border border-red-500/20 bg-[#11151e] p-3 sm:p-4">
      <div>
        <h5 className="text-xs font-black text-white">Select exact restaurant location</h5>
        <p className="mt-1 text-[10px] leading-5 text-neutral-400">
          Use GPS only when you are physically at the restaurant, or choose the entrance/dining area on the map.
          This sets the centre for all table QR dine-in location checks.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={useDeviceLocation} disabled={disabled || gpsBusy} className="rounded-xl bg-red-600 px-3 py-2.5 text-xs font-black text-white hover:bg-red-500 disabled:opacity-40">
          {gpsBusy ? 'Finding location…' : 'Use my live GPS'}
        </button>
        <button type="button" onClick={() => setMapOpen((current) => !current)} disabled={disabled} className={buttonClass}>
          {mapOpen ? 'Hide map' : 'Select on map'}
        </button>
      </div>

      {gpsError && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] leading-5 text-amber-200">{gpsError}</p>}
      {mapError && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] leading-5 text-amber-200">{mapError}</p>}

      {mapOpen && (
        <div className="space-y-2">
          <div ref={mapNode} aria-label="Map for selecting the restaurant location" className="h-[300px] w-full overflow-hidden rounded-xl border border-neutral-700 bg-neutral-800" />
          <p className="text-[10px] leading-5 text-neutral-400">
            Tap the map or drag the red pin to choose the exact location. The red circle shows the configured dine-in radius.
            Map data © OpenStreetMap contributors.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3 text-[10px] leading-5">
        <p className="font-bold text-neutral-300">{candidate ? 'Selected location (not saved)' : 'No location selected'}</p>
        {candidate ? (
          <p className="mt-1 break-all font-mono text-neutral-100">{candidate.lat.toFixed(7)}, {candidate.lng.toFixed(7)}</p>
        ) : (
          <p className="mt-1 text-neutral-500">Use live GPS or tap the map to choose a point.</p>
        )}
        {source === 'gps' && gpsAccuracy != null && (
          <p className={`mt-1 ${gpsUncertain ? 'text-amber-300' : 'text-neutral-400'}`}>
            Device GPS uncertainty: approximately {Math.round(gpsAccuracy)} m
            {gpsTime ? ` · ${new Date(gpsTime).toLocaleTimeString()}` : ''}
            {gpsUncertain ? ` · Above the ${accuracyLimit} m policy limit. Refine the pin and verify on-site.` : ''}
          </p>
        )}
        {source === 'map' && <p className="mt-1 text-neutral-400">Pin selected on map. Verify the actual entrance/dining area before saving.</p>}
      </div>

      <button type="button" onClick={apply} disabled={disabled || gpsBusy || !candidate || Boolean(unchanged)} className="w-full rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs font-black text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40">
        {applied || unchanged ? 'Coordinates ready in policy' : 'Apply selected location to policy'}
      </button>
      <p className="text-[10px] leading-5 text-amber-200/90">
        Applying does not save to Supabase or approve an owner location request. Review the position, then click “Save restaurant ordering policy” below.
        Customer GPS is still checked separately at checkout.
      </p>
    </section>
  )
}

// Keep the default export for any other existing imports.
export default RestaurantLocationPicker
