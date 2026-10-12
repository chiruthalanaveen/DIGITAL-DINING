'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// Digital Dine-In — customer delivery tracking map.
// Existing component props are preserved. Rider positions must come from the
// application's real location updates; this component never invents GPS points.

const LEAFLET_VERSION = '1.9.4'
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`
const LEAFLET_SOURCES = [
  `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`,
  `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`,
]
const GREEN = '#84cc35'
const DARK = '#26351b'

function validCoordinate(latitude, longitude) {
  if (
    latitude == null || longitude == null ||
    String(latitude).trim() === '' || String(longitude).trim() === ''
  ) return false
  const lat = Number(latitude)
  const lng = Number(longitude)
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  )
}

function toPoint(latitude, longitude) {
  return validCoordinate(latitude, longitude)
    ? { lat: Number(latitude), lng: Number(longitude) }
    : null
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

function markerEmoji(type) {
  switch (String(type || '').toLowerCase()) {
    case 'scooter': return '🛵'
    case 'car': return '🚗'
    case 'van': return '🚚'
    case 'bike':
    default: return '🏍️'
  }
}

function distanceMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY
  const rad = (value) => (value * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(Math.max(0, h))))
}

function getHeading(value, previous, next, fallback = 0) {
  if (value != null && String(value).trim() !== '' && Number.isFinite(Number(value))) {
    return ((Number(value) % 360) + 360) % 360
  }
  if (!previous || !next || distanceMeters(previous, next) < 2) return fallback
  const rad = (value) => (value * Math.PI) / 180
  const dLng = rad(next.lng - previous.lng)
  const y = Math.sin(dLng) * Math.cos(rad(next.lat))
  const x = Math.cos(rad(previous.lat)) * Math.sin(rad(next.lat)) -
    Math.sin(rad(previous.lat)) * Math.cos(rad(next.lat)) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function normalizedRouteCoordinates(input) {
  if (!Array.isArray(input) || input.length < 2) return null
  const points = input.slice(0, 4000).map((item) => {
    if (Array.isArray(item)) return toPoint(item[0], item[1])
    return toPoint(item?.latitude ?? item?.lat, item?.longitude ?? item?.lng)
  })
  if (points.some((point) => !point)) return null
  return points.map(({ lat, lng }) => [lat, lng])
}

function addLeafletCss() {
  if (document.querySelector('link[data-digital-dine-leaflet="true"]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = LEAFLET_CSS
  link.dataset.digitalDineLeaflet = 'true'
  // If the primary CDN is unreachable, load the stylesheet from a second CDN.
  link.onerror = () => {
    if (link.dataset.fallbackTried === 'true') return
    link.dataset.fallbackTried = 'true'
    link.href = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`
  }
  document.head.appendChild(link)
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    let settled = false
    let timer = null
    const clean = () => {
      if (timer !== null) window.clearTimeout(timer)
      script.removeEventListener('load', onLoad)
      script.removeEventListener('error', onError)
    }
    const finish = (error) => {
      if (settled) return
      settled = true
      clean()
      if (error) {
        script.remove()
        reject(error)
      } else {
        resolve(window.L)
      }
    }
    const onLoad = () => {
      if (window.L?.map && window.L?.tileLayer) finish()
      else finish(new Error('Leaflet loaded but did not initialize.'))
    }
    const onError = () => finish(new Error('Map script could not be downloaded.'))
    script.src = src
    script.async = true
    script.dataset.digitalDineLeaflet = 'true'
    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)
    timer = window.setTimeout(() => finish(new Error('Map script loading timed out.')), 14000)
    document.body.appendChild(script)
  })
}

// Shares Leaflet with the original DeliveryLocationMap and other map instances.
async function ensureLeaflet() {
  if (typeof window === 'undefined') {
    throw new Error('The live map is available only in a browser.')
  }
  if (window.L?.map && window.L?.tileLayer) return window.L

  if (window.__digitalDineLeafletPromise) {
    try {
      const existing = await Promise.race([
        window.__digitalDineLeafletPromise,
        new Promise((_, reject) => window.setTimeout(
          () => reject(new Error('Previous map loader timed out.')),
          12000
        )),
      ])
      if (existing?.map && existing?.tileLayer) return existing
    } catch {
      // Recover below if the previously cached loader failed.
    }
    if (window.L?.map && window.L?.tileLayer) return window.L
    window.__digitalDineLeafletPromise = null
  }

  const promise = (async () => {
    addLeafletCss()
    // A previous failed attempt can leave a stale script that never fires load.
    document.querySelectorAll('script[data-digital-dine-leaflet="true"]').forEach((node) => {
      if (!window.L?.map) node.remove()
    })
    let lastError = null
    for (const src of LEAFLET_SOURCES) {
      if (window.L?.map && window.L?.tileLayer) return window.L
      try {
        return await loadScript(src)
      } catch (error) {
        lastError = error
      }
    }
    throw lastError || new Error('Unable to load the tracking map.')
  })()

  window.__digitalDineLeafletPromise = promise
  try {
    return await promise
  } catch (error) {
    if (window.__digitalDineLeafletPromise === promise) {
      window.__digitalDineLeafletPromise = null
    }
    throw error
  }
}

function driverIconHtml({ markerType, markerImageUrl, markerLabel, driverName, heading, advertisement }) {
  const type = String(markerType || 'bike').toLowerCase()
  const imageUrl = safeHttpUrl(markerImageUrl)
  const useImage = ['logo', 'custom'].includes(type) && Boolean(imageUrl)
  const safeLabel = escapeHtml(markerLabel || driverName || 'Delivery partner')
  const angle = Number.isFinite(Number(heading)) ? Number(heading) : 0

  const adPosition = String(advertisement?.position || 'above_marker')
  const showAd = Boolean(advertisement?.enabled) && ['above_marker', 'both'].includes(adPosition)
  const adTitle = escapeHtml(advertisement?.title || 'Delivery offer')
  const adImageUrl = safeHttpUrl(advertisement?.image_url)
  const adHtml = showAd ? `
    <div style="max-width:148px;margin-bottom:8px;overflow:hidden;padding:7px;border:1px solid #deebd1;border-radius:13px;background:#fff;box-shadow:0 5px 16px #16250f26;text-align:center;font-size:10px;line-height:1.3;font-weight:800;color:#27351c;">
      ${adImageUrl ? `<img src="${escapeHtml(adImageUrl)}" alt="" style="display:block;width:100%;max-height:58px;object-fit:cover;border-radius:8px;margin-bottom:5px;" />` : ''}
      ${adTitle}
    </div>` : ''

  const visual = useImage
    ? `<img src="${escapeHtml(imageUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;" />`
    : `<span style="font-size:26px;line-height:1;">${markerEmoji(type)}</span>`

  return `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      ${adHtml}
      <div style="position:relative;display:grid;place-items:center;width:53px;height:53px;background:${useImage ? '#fff' : GREEN};border:3px solid white;border-radius:19px;box-shadow:0 7px 21px #26351b42;">
        <div style="display:grid;place-items:center;overflow:hidden;width:100%;height:100%;border-radius:16px;">${visual}</div>
        <span style="position:absolute;top:-10px;right:-11px;display:grid;place-items:center;width:24px;height:24px;background:#26351b;color:#fff;border:2px solid #fff;border-radius:50%;font-size:12px;transform:rotate(${angle}deg);">▲</span>
        <span style="position:absolute;bottom:-9px;left:50%;transform:translateX(-50%) rotate(45deg);width:13px;height:13px;background:white;border-radius:2px;"></span>
      </div>
      <div style="max-width:156px;margin-top:12px;padding:6px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:999px;background:#26351b;color:white;box-shadow:0 4px 11px #26351b2e;font-size:10px;font-weight:800;line-height:1.3;">${safeLabel}</div>
    </div>`
}

function customerIconHtml() {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="width:46px;height:46px;display:grid;place-items:center;border-radius:19px;border:3px solid white;background:#fbfff6;box-shadow:0 5px 18px #26351b42;font-size:22px;">📍</div>
      <div style="margin-top:5px;border-radius:999px;padding:5px 10px;background:white;color:#26351b;box-shadow:0 3px 12px #26351b26;font-size:10px;font-weight:800;white-space:nowrap;">Delivery address</div>
    </div>`
}

function cancelMarkerAnimation(animationRef) {
  if (animationRef.current != null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(animationRef.current)
  }
  animationRef.current = null
}

function animateToMarker(marker, target, animationRef) {
  if (!marker || typeof window === 'undefined') return
  cancelMarkerAnimation(animationRef)
  const from = marker.getLatLng()
  const distance = distanceMeters(from, target)
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  if (!Number.isFinite(distance) || distance < 1 || distance > 2500 || prefersReducedMotion) {
    marker.setLatLng([target.lat, target.lng])
    return
  }
  const began = window.performance.now()
  const duration = 850
  const frame = (now) => {
    const progress = Math.min(1, Math.max(0, (now - began) / duration))
    const eased = 1 - (1 - progress) ** 3
    marker.setLatLng([
      from.lat + (target.lat - from.lat) * eased,
      from.lng + (target.lng - from.lng) * eased,
    ])
    if (progress < 1) animationRef.current = window.requestAnimationFrame(frame)
    else animationRef.current = null
  }
  animationRef.current = window.requestAnimationFrame(frame)
}

export default function LiveDeliveryTrackingMap({
  driverLatitude,
  driverLongitude,
  driverHeading,
  driverName,
  customerLatitude,
  customerLongitude,
  markerType = 'bike',
  markerImageUrl = '',
  markerLabel = '',
  advertisement = null,
  height = 360,
  routeCoordinates = null,
  showControls = true,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const riderMarkerRef = useRef(null)
  const homeMarkerRef = useRef(null)
  const routeLineRef = useRef(null)
  const animationRef = useRef(null)
  const lastRiderRef = useRef(null)
  const latestCoordinatesRef = useRef({ driver: null, customer: null })
  const lastHeadingRef = useRef(0)
  const cameraInitializedRef = useRef(false)
  const hadRiderRef = useRef(false)
  const autoFollowRef = useRef(true)

  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [following, setFollowing] = useState(true)

  const driver = useMemo(
    () => toPoint(driverLatitude, driverLongitude),
    [driverLatitude, driverLongitude]
  )
  const customer = useMemo(
    () => toPoint(customerLatitude, customerLongitude),
    [customerLatitude, customerLongitude]
  )
  const route = useMemo(
    () => normalizedRouteCoordinates(routeCoordinates),
    [routeCoordinates]
  )
  const bottomAdvertisement = useMemo(() => {
    if (!advertisement?.enabled) return null
    if (!['bottom', 'both'].includes(String(advertisement.position || 'above_marker'))) return null
    return {
      title: String(advertisement.title || '').trim(),
      text: String(advertisement.text || '').trim(),
      imageUrl: safeHttpUrl(advertisement.image_url),
      link: safeHttpUrl(advertisement.link),
    }
  }, [advertisement])

  // Update after render rather than mutating refs while rendering (React 19 safe).
  useEffect(() => {
    latestCoordinatesRef.current = { driver, customer }
  }, [driver, customer])

  const followRider = () => {
    autoFollowRef.current = true
    setFollowing(true)
    const map = mapRef.current
    const point = latestCoordinatesRef.current.driver
    if (map && point) {
      map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 15), { duration: 0.6 })
    }
  }

  const viewBoth = () => {
    const map = mapRef.current
    const { driver: point, customer: destination } = latestCoordinatesRef.current
    if (!map || !point || !destination) return
    autoFollowRef.current = false
    setFollowing(false)
    const bounds = routeLineRef.current?.getBounds?.()
    const points = (bounds && bounds.isValid())
      ? bounds
      : [[point.lat, point.lng], [destination.lat, destination.lng]]
    map.fitBounds(points, { padding: [52, 54], maxZoom: 16, animate: true })
  }

  // Create exactly one Leaflet map for each mount/retry; destroy it on cleanup.
  useEffect(() => {
    let active = true
    let map = null
    let resizeObserver = null
    let resizeTimer = null

    const initialize = async () => {
      try {
        const L = await ensureLeaflet()
        if (!active || !containerRef.current) return
        const { driver: point, customer: destination } = latestCoordinatesRef.current
        const center = point || destination || { lat: 20.5937, lng: 78.9629 }
        map = L.map(containerRef.current, {
          zoomControl: !showControls,
          attributionControl: true,
          scrollWheelZoom: false,
        }).setView([center.lat, center.lng], point || destination ? 15 : 5)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map)
        mapRef.current = map

        map.on('dragstart zoomstart', (event) => {
          if (event?.originalEvent) {
            autoFollowRef.current = false
            setFollowing(false)
          }
        })
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            if (active && map) map.invalidateSize({ pan: false })
          })
          resizeObserver.observe(containerRef.current)
        }
        resizeTimer = window.setTimeout(() => {
          if (active && map) map.invalidateSize({ pan: false })
        }, 160)
        if (active) {
          setMapError('')
          setMapReady(true)
        }
      } catch (error) {
        if (active) {
          setMapReady(false)
          setMapError(error?.message || 'Unable to load the live tracking map.')
        }
      }
    }

    initialize()
    return () => {
      active = false
      if (resizeTimer != null) window.clearTimeout(resizeTimer)
      resizeObserver?.disconnect()
      cancelMarkerAnimation(animationRef)
      try { map?.remove() } catch { /* Ignore cleanup races. */ }
      mapRef.current = null
      riderMarkerRef.current = null
      homeMarkerRef.current = null
      routeLineRef.current = null
      lastRiderRef.current = null
      cameraInitializedRef.current = false
      hadRiderRef.current = false
    }
  }, [retryKey, showControls])

  useEffect(() => {
    if (!mapReady || !mapRef.current || typeof window === 'undefined') return
    const L = window.L
    if (!L?.marker || !L?.polyline) return
    const map = mapRef.current

    // Customer destination may arrive AFTER the map has initialized.
    if (customer) {
      if (!homeMarkerRef.current) {
        homeMarkerRef.current = L.marker([customer.lat, customer.lng], {
          keyboard: false,
          icon: L.divIcon({
            className: 'dd-live-delivery-customer-marker',
            html: customerIconHtml(),
            iconSize: [130, 91],
            iconAnchor: [65, 40],
          }),
        }).addTo(map)
      } else {
        homeMarkerRef.current.setLatLng([customer.lat, customer.lng])
      }
    } else if (homeMarkerRef.current) {
      homeMarkerRef.current.remove()
      homeMarkerRef.current = null
    }

    if (driver) {
      const previous = lastRiderRef.current
      const heading = getHeading(driverHeading, previous, driver, lastHeadingRef.current)
      lastHeadingRef.current = heading
      const icon = L.divIcon({
        className: 'dd-live-delivery-rider-marker',
        html: driverIconHtml({
          markerType, markerImageUrl, markerLabel, driverName,
          heading, advertisement,
        }),
        iconSize: [180, 175],
        iconAnchor: [90, 111],
      })
      if (!riderMarkerRef.current) {
        riderMarkerRef.current = L.marker([driver.lat, driver.lng], {
          keyboard: false,
          zIndexOffset: 1000,
          icon,
        }).addTo(map)
      } else {
        riderMarkerRef.current.setIcon(icon)
        if (!previous || distanceMeters(previous, driver) > 0.5) {
          animateToMarker(riderMarkerRef.current, driver, animationRef)
        }
      }
      const moved = previous && distanceMeters(previous, driver) > 1
      const firstRider = !hadRiderRef.current
      lastRiderRef.current = driver
      hadRiderRef.current = true

      // First available rider: show both driver and customer when possible.
      if (firstRider || !cameraInitializedRef.current) {
        cameraInitializedRef.current = true
        if (customer && distanceMeters(driver, customer) > 50) {
          map.fitBounds([[driver.lat, driver.lng], [customer.lat, customer.lng]], {
            padding: [55, 60], maxZoom: 16, animate: false,
          })
        } else {
          map.setView([driver.lat, driver.lng], 16, { animate: false })
        }
      } else if (autoFollowRef.current && moved) {
        map.panTo([driver.lat, driver.lng], { animate: true, duration: 0.65 })
      }
    } else {
      if (riderMarkerRef.current) {
        cancelMarkerAnimation(animationRef)
        riderMarkerRef.current.remove()
        riderMarkerRef.current = null
      }
      lastRiderRef.current = null
      hadRiderRef.current = false
      if (customer && !cameraInitializedRef.current) {
        cameraInitializedRef.current = true
        map.setView([customer.lat, customer.lng], 16, { animate: false })
      }
    }

    // Real route geometry is used only if supplied by the calling app.
    // Otherwise the dashed line is a DIRECT-LINE guide, not a road route.
    const linePoints = driver && customer
      ? (route || [[driver.lat, driver.lng], [customer.lat, customer.lng]])
      : null
    if (linePoints) {
      const hasRoadRoute = Boolean(route)
      const style = {
        color: hasRoadRoute ? '#62ad20' : '#719849',
        weight: hasRoadRoute ? 5 : 3,
        opacity: hasRoadRoute ? 0.85 : 0.75,
        dashArray: hasRoadRoute ? undefined : '7 9',
        lineJoin: 'round',
      }
      if (routeLineRef.current) {
        routeLineRef.current.setLatLngs(linePoints)
        routeLineRef.current.setStyle(style)
      } else {
        routeLineRef.current = L.polyline(linePoints, style).addTo(map)
        routeLineRef.current.bringToBack()
      }
    } else if (routeLineRef.current) {
      routeLineRef.current.remove()
      routeLineRef.current = null
    }
  }, [
    mapReady, driver, customer, driverHeading, driverName, markerType,
    markerImageUrl, markerLabel, advertisement, route,
  ])

  const mapHeight = Math.max(260, Number.isFinite(Number(height)) ? Number(height) : 360)

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-neutral-200 bg-[#ecf2e4]"
      style={{ isolation: 'isolate' }}
      aria-label="Delivery rider location map"
    >
      <div ref={containerRef} className="w-full" style={{ height: `${mapHeight}px`, width: '100%' }} />

      {mapReady && (
        <>
          <div
            className="pointer-events-none absolute bottom-3 left-3 z-[450] max-w-[195px] rounded-full bg-white/95 px-3 py-2 text-[10px] font-extrabold shadow-md"
            style={{ color: DARK }}
          >
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#84cc35]" />
            {driver
              ? (route ? 'Rider GPS · road route' : customer ? 'Rider GPS · direct-line guide' : 'Rider GPS location')
              : 'Waiting for rider location'}
          </div>

          {showControls && (
            <div className="absolute bottom-12 right-3 z-[450] flex flex-col gap-2" aria-label="Map controls">
              {driver && (
                <button
                  type="button"
                  aria-label="Follow delivery rider"
                  title="Follow rider"
                  onClick={followRider}
                  className="grid h-10 w-10 place-items-center rounded-full border border-[#e3ebd8] bg-white text-xl font-bold shadow-lg"
                  style={{ color: following ? '#5d9724' : DARK }}
                >
                  ⌖
                </button>
              )}
              {driver && customer && (
                <button
                  type="button"
                  aria-label="Show rider and delivery address"
                  title="View both locations"
                  onClick={viewBoth}
                  className="grid h-10 w-10 place-items-center rounded-full border border-[#e3ebd8] bg-white text-lg font-bold shadow-lg"
                  style={{ color: DARK }}
                >
                  ◈
                </button>
              )}
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => mapRef.current?.zoomIn()}
                className="grid h-9 w-10 place-items-center rounded-xl border border-[#e3ebd8] bg-white text-lg font-bold shadow-lg"
                style={{ color: DARK }}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => mapRef.current?.zoomOut()}
                className="grid h-9 w-10 place-items-center rounded-xl border border-[#e3ebd8] bg-white text-lg font-bold shadow-lg"
                style={{ color: DARK }}
              >
                −
              </button>
            </div>
          )}
        </>
      )}

      {!mapReady && !mapError && (
        <div className="absolute inset-0 z-[450] grid place-items-center bg-[#ecf2e4]/95 p-6 text-center text-sm font-semibold text-[#4c613c]" role="status">
          Loading delivery map…
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 z-[450] flex flex-col items-center justify-center gap-3 bg-white p-6 text-center" role="alert">
          <p className="text-sm font-bold text-red-700">{mapError}</p>
          <button
            type="button"
            className="rounded-full bg-[#84cc35] px-5 py-2.5 text-xs font-black text-[#26351b]"
            onClick={() => {
              setMapError('')
              setMapReady(false)
              setRetryKey((key) => key + 1)
            }}
          >
            Retry map
          </button>
        </div>
      )}

      {bottomAdvertisement && (
        <div className="border-t border-emerald-100 bg-emerald-50/80 p-3 sm:p-4">
          <div className="flex items-center gap-3">
            {bottomAdvertisement.imageUrl && (
              <img
                src={bottomAdvertisement.imageUrl}
                alt="Tracking promotion"
                className="h-14 w-14 shrink-0 rounded-xl border border-emerald-100 bg-white object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Promotion</p>
              {bottomAdvertisement.title && (
                <p className="mt-0.5 truncate text-sm font-black text-neutral-950">{bottomAdvertisement.title}</p>
              )}
              {bottomAdvertisement.text && (
                <p className="mt-1 text-[11px] leading-4 text-neutral-600">{bottomAdvertisement.text}</p>
              )}
            </div>
            {bottomAdvertisement.link && (
              <a
                href={bottomAdvertisement.link}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black text-white"
              >
                View
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
