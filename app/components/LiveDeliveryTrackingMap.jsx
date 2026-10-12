'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// Digital Dine-In | Customer live delivery map
// Compatible with the existing DeliveryTrackingPage props.
// This component displays actual GPS updates only. It never invents rider positions.
// A dashed line is a straight-line guide, NOT a road/navigation route.
// To draw a real route, pass routeCoordinates from your own routing provider.

const LEAFLET_VERSION = '1.9.4'
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`
const GREEN = '#84cc35'
const DARK = '#26351b'

function validCoordinate(latitude, longitude) {
  // Number(null) and Number('') are zero, but an empty GPS value is not a location.
  if (
    latitude === null || latitude === undefined ||
    longitude === null || longitude === undefined ||
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
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : ''
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
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * sinLng * sinLng
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

function getHeading(value, previous, next) {
  if (value !== undefined && value !== null && String(value).trim() !== '' &&
      Number.isFinite(Number(value))) {
    return ((Number(value) % 360) + 360) % 360
  }
  if (!previous || !next || distanceMeters(previous, next) < 2) return 0

  const rad = (value) => (value * Math.PI) / 180
  const lngDiff = rad(next.lng - previous.lng)
  const y = Math.sin(lngDiff) * Math.cos(rad(next.lat))
  const x = Math.cos(rad(previous.lat)) * Math.sin(rad(next.lat)) -
    Math.sin(rad(previous.lat)) * Math.cos(rad(next.lat)) * Math.cos(lngDiff)
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

function ensureLeaflet() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('The map is available only in the browser.'))
  }
  if (window.L?.map) return Promise.resolve(window.L)
  if (window.__digitalDineLeafletPromise) {
    return window.__digitalDineLeafletPromise.catch((error) => {
      // A previous map instance may have cached a failed CDN load.
      window.__digitalDineLeafletPromise = null
      throw error
    })
  }

  window.__digitalDineLeafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-digital-dine-leaflet="true"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = LEAFLET_CSS
      link.dataset.digitalDineLeaflet = 'true'
      document.head.appendChild(link)
    }

    let settled = false
    let timer
    let script = document.querySelector('script[data-digital-dine-leaflet="true"]')

    const done = (error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      script?.removeEventListener('load', loaded)
      script?.removeEventListener('error', failed)
      if (error) {
        // Recover cleanly after an unavailable CDN or failed initial load.
        window.__digitalDineLeafletPromise = null
        script?.remove()
        reject(error)
      } else {
        resolve(window.L)
      }
    }
    const loaded = () => {
      if (window.L?.map) done()
      else done(new Error('The map library did not initialize.'))
    }
    const failed = () => done(new Error('Unable to load the map library. Check your connection.'))

    if (!script) {
      script = document.createElement('script')
      script.src = LEAFLET_JS
      script.async = true
      script.dataset.digitalDineLeaflet = 'true'
      script.addEventListener('load', loaded)
      script.addEventListener('error', failed)
      document.body.appendChild(script)
    } else {
      script.addEventListener('load', loaded)
      script.addEventListener('error', failed)
      // Another component may have loaded Leaflet just before our handlers attached.
      if (window.L?.map) loaded()
    }
    timer = window.setTimeout(
      () => done(new Error('The map took too long to load. Please retry.')),
      15000
    )
  })

  return window.__digitalDineLeafletPromise
}

function driverIconHtml({
  markerType,
  markerImageUrl,
  markerLabel,
  driverName,
  heading,
  advertisement,
}) {
  const type = String(markerType || 'bike').toLowerCase()
  const imageUrl = safeHttpUrl(markerImageUrl)
  const useImage = ['logo', 'custom'].includes(type) && imageUrl
  const safeLabel = escapeHtml(markerLabel || driverName || 'Delivery partner')
  const angle = Number.isFinite(Number(heading)) ? Number(heading) : 0

  // Preserve owner/manager-configured ads above the marker.
  const adsEnabled = Boolean(advertisement?.enabled)
  const adPosition = String(advertisement?.position || 'above_marker')
  const adAbove = adsEnabled && ['above_marker', 'both'].includes(adPosition)
  const adTitle = escapeHtml(advertisement?.title || 'Delivery offer')
  const adImageUrl = safeHttpUrl(advertisement?.image_url)
  const adHtml = adAbove ? `
    <div style="max-width:148px;margin-bottom:8px;overflow:hidden;padding:7px;border:1px solid #deebd1;border-radius:13px;background:#fff;box-shadow:0 5px 16px #16250f26;text-align:center;font-size:10px;line-height:1.3;font-weight:800;color:#27351c;">
      ${adImageUrl ? `<img src="${escapeHtml(adImageUrl)}" alt="" style="display:block;width:100%;max-height:58px;object-fit:cover;border-radius:8px;margin-bottom:5px;" />` : ''}
      ${adTitle}
    </div>` : ''

  const visual = useImage
    ? `<img src="${escapeHtml(imageUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;" />`
    : `<span style="font-size:26px;line-height:1;">${markerEmoji(type)}</span>`

  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;transform:translateY(-1px);">
      ${adHtml}
      <div style="position:relative;display:grid;place-items:center;width:53px;height:53px;background:${useImage ? '#fff' : GREEN};border:3px solid white;border-radius:19px;overflow:visible;box-shadow:0 7px 21px #26351b42;">
        <div style="display:grid;place-items:center;overflow:hidden;width:100%;height:100%;border-radius:16px;">${visual}</div>
        <span style="position:absolute;top:-10px;right:-11px;display:grid;place-items:center;width:24px;height:24px;background:#26351b;color:#fff;border:2px solid #fff;border-radius:50%;font-size:12px;box-shadow:0 3px 8px #17240e38;transform:rotate(${angle}deg);">▲</span>
        <span style="position:absolute;bottom:-9px;left:50%;transform:translateX(-50%) rotate(45deg);width:13px;height:13px;background:#fff;border-radius:2px;"></span>
      </div>
      <div style="max-width:156px;margin-top:12px;padding:6px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:999px;background:#26351b;color:#fff;box-shadow:0 4px 11px #26351b2e;font-size:10px;font-weight:800;line-height:1.3;">${safeLabel}</div>
    </div>`
}

function customerIconHtml() {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="width:46px;height:46px;display:grid;place-items:center;border-radius:19px;border:3px solid white;background:#fbfff6;color:#30441e;box-shadow:0 5px 18px #26351b42;font-size:22px;">📍</div>
      <div style="margin-top:5px;border-radius:999px;padding:5px 10px;background:white;color:#26351b;box-shadow:0 3px 12px #26351b26;font-size:10px;font-weight:800;white-space:nowrap;">Delivery address</div>
    </div>`
}

function animateToMarker(marker, target, animationRef, onFrame) {
  if (!marker) return
  if (animationRef.current !== null) {
    window.cancelAnimationFrame(animationRef.current)
    animationRef.current = null
  }
  const start = marker.getLatLng()
  const from = { lat: start.lat, lng: start.lng }
  const distance = distanceMeters(from, target)
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  if (!Number.isFinite(distance) || distance < 1 || distance > 2500 || reduceMotion) {
    marker.setLatLng(target)
    onFrame?.(target)
    return
  }

  // Smooth between actual GPS samples; does not generate additional GPS locations.
  const duration = 850
  const began = performance.now()
  const frame = (time) => {
    const ratio = Math.min(1, Math.max(0, (time - began) / duration))
    const easing = 1 - Math.pow(1 - ratio, 3)
    const point = {
      lat: from.lat + (target.lat - from.lat) * easing,
      lng: from.lng + (target.lng - from.lng) * easing,
    }
    marker.setLatLng(point)
    onFrame?.(point)
    if (ratio < 1) animationRef.current = window.requestAnimationFrame(frame)
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
  // Optional: real road route from YOUR routing service as [[lat,lng], ...].
  // No third-party request is made with the customer's precise location.
  routeCoordinates = null,
  showControls = true,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const driverMarkerRef = useRef(null)
  const customerMarkerRef = useRef(null)
  const guideLineRef = useRef(null)
  const animationRef = useRef(null)
  const previousDriverRef = useRef(null)
  const lastHeadingRef = useRef(0)
  const firstFitRef = useRef(false)
  const followingRef = useRef(true)
  const latestPropsRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [retry, setRetry] = useState(0)
  const [following, setFollowing] = useState(true)

  const driverPoint = toPoint(driverLatitude, driverLongitude)
  const customerPoint = toPoint(customerLatitude, customerLongitude)
  const safeRoute = useMemo(() => normalizedRouteCoordinates(routeCoordinates), [routeCoordinates])
  const bottomAdvertisement = useMemo(() => {
    if (!advertisement?.enabled) return null
    const position = String(advertisement?.position || 'above_marker')
    if (!['bottom', 'both'].includes(position)) return null
    return {
      title: String(advertisement.title || '').trim(),
      text: String(advertisement.text || '').trim(),
      imageUrl: safeHttpUrl(advertisement.image_url),
      link: safeHttpUrl(advertisement.link),
    }
  }, [advertisement])

  latestPropsRef.current = { driverPoint, customerPoint }

  const followRider = () => {
    followingRef.current = true
    setFollowing(true)
    const map = mapRef.current
    const point = latestPropsRef.current?.driverPoint
    if (map && point) map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 15), { duration: 0.6 })
  }

  const showWholeRoute = () => {
    const map = mapRef.current
    if (!map) return
    const driver = latestPropsRef.current?.driverPoint
    const customer = latestPropsRef.current?.customerPoint
    if (!driver || !customer) return
    followingRef.current = false
    setFollowing(false)
    const bounds = guideLineRef.current?.getBounds?.()
    map.fitBounds(bounds?.isValid?.() ? bounds : [[driver.lat, driver.lng], [customer.lat, customer.lng]], {
      padding: [52, 54], maxZoom: 16, animate: true,
    })
  }

  useEffect(() => {
    let mounted = true
    let resizeObserver = null
    let resizeTimeout = null
    let map = null

    const start = async () => {
      try {
        const L = await ensureLeaflet()
        if (!mounted || !containerRef.current) return

        const driver = latestPropsRef.current?.driverPoint
        const customer = latestPropsRef.current?.customerPoint
        const startPoint = driver || customer || { lat: 20.5937, lng: 78.9629 }
        map = L.map(containerRef.current, {
          zoomControl: !showControls,
          attributionControl: true,
          scrollWheelZoom: false,
        }).setView([startPoint.lat, startPoint.lng], driver || customer ? 15 : 5)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map)
        mapRef.current = map

        // Manual gestures pause auto-follow so customers can inspect the route.
        map.on('dragstart zoomstart', (event) => {
          if (!event?.originalEvent) return
          followingRef.current = false
          setFollowing(false)
        })

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => map?.invalidateSize({ pan: false }))
          resizeObserver.observe(containerRef.current)
        }
        resizeTimeout = window.setTimeout(() => {
          if (mounted && map) map.invalidateSize({ pan: false })
        }, 120)

        if (mounted) {
          setMapReady(true)
          setMapError('')
        }
      } catch (error) {
        if (mounted) setMapError(error?.message || 'Unable to load live tracking map.')
      }
    }

    start()
    return () => {
      mounted = false
      if (resizeTimeout !== null) window.clearTimeout(resizeTimeout)
      resizeObserver?.disconnect()
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current)
      animationRef.current = null
      try { map?.remove() } catch { /* Map may already be destroyed. */ }
      mapRef.current = null
      driverMarkerRef.current = null
      customerMarkerRef.current = null
      guideLineRef.current = null
      previousDriverRef.current = null
      firstFitRef.current = false
    }
    // Leaflet maps must be created only once per mount or manual retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry])

  useEffect(() => {
    if (!mapReady || !mapRef.current || typeof window === 'undefined') return
    const L = window.L
    if (!L) return
    const map = mapRef.current

    if (customerPoint) {
      const location = [customerPoint.lat, customerPoint.lng]
      if (!customerMarkerRef.current) {
        customerMarkerRef.current = L.marker(location, {
          keyboard: false,
          icon: L.divIcon({
            className: 'dd-live-delivery-customer-marker',
            html: customerIconHtml(),
            iconSize: [130, 91],
            iconAnchor: [65, 40],
          }),
        }).addTo(map)
      } else customerMarkerRef.current.setLatLng(location)
    } else if (customerMarkerRef.current) {
      customerMarkerRef.current.remove()
      customerMarkerRef.current = null
    }

    if (driverPoint) {
      const previous = previousDriverRef.current
      const heading = (driverHeading === null || driverHeading === undefined || String(driverHeading).trim() === '')
        ? previous && distanceMeters(previous, driverPoint) >= 2
          ? getHeading(null, previous, driverPoint)
          : lastHeadingRef.current
        : getHeading(driverHeading, previous, driverPoint)
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
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = L.marker([driverPoint.lat, driverPoint.lng], {
          keyboard: false,
          zIndexOffset: 1000,
          icon,
        }).addTo(map)
      } else {
        driverMarkerRef.current.setIcon(icon)
        if (!previous || distanceMeters(previous, driverPoint) > 0.5) {
          animateToMarker(driverMarkerRef.current, driverPoint, animationRef)
        }
      }

      const changed = previous && distanceMeters(previous, driverPoint) > 1
      previousDriverRef.current = driverPoint

      if (!firstFitRef.current) {
        firstFitRef.current = true
        if (customerPoint && distanceMeters(driverPoint, customerPoint) > 50) {
          map.fitBounds(
            [[driverPoint.lat, driverPoint.lng], [customerPoint.lat, customerPoint.lng]],
            { padding: [52, 54], maxZoom: 16, animate: false }
          )
        } else {
          map.setView([driverPoint.lat, driverPoint.lng], 16, { animate: false })
        }
      } else if (followingRef.current && changed) {
        map.panTo([driverPoint.lat, driverPoint.lng], { animate: true, duration: 0.65 })
      }
    } else if (driverMarkerRef.current) {
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current)
      animationRef.current = null
      driverMarkerRef.current.remove()
      driverMarkerRef.current = null
      previousDriverRef.current = null
      firstFitRef.current = false
    }

    // Real road route: use only geometry provided by the app's route service.
    // Fallback: visibly dashed, straight-line guidance; NOT street directions.
    const linePoints = driverPoint && customerPoint
      ? safeRoute || [[driverPoint.lat, driverPoint.lng], [customerPoint.lat, customerPoint.lng]]
      : null
    if (linePoints) {
      const isRoadRoute = Boolean(safeRoute)
      const lineStyle = {
        color: isRoadRoute ? '#62ad20' : '#719849',
        weight: isRoadRoute ? 5 : 3,
        opacity: isRoadRoute ? 0.85 : 0.75,
        dashArray: isRoadRoute ? undefined : '7 9',
        lineJoin: 'round',
      }
      if (guideLineRef.current) {
        guideLineRef.current.setLatLngs(linePoints)
        guideLineRef.current.setStyle(lineStyle)
      } else {
        guideLineRef.current = L.polyline(linePoints, lineStyle).addTo(map)
        guideLineRef.current.bringToBack()
      }
    } else if (guideLineRef.current) {
      guideLineRef.current.remove()
      guideLineRef.current = null
    }
  }, [
    mapReady, driverLatitude, driverLongitude, driverHeading,
    customerLatitude, customerLongitude, markerType, markerImageUrl,
    markerLabel, driverName, advertisement, safeRoute,
  ])

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-neutral-200 bg-[#ecf2e4]"
      style={{ isolation: 'isolate' }}
      aria-label="Delivery rider location map"
    >
      <div
        ref={containerRef}
        style={{ height: `${Math.max(260, Number(height) || 360)}px`, width: '100%' }}
        className="w-full"
      />

      {mapReady && (
        <>
          <div
            className="pointer-events-none absolute bottom-3 left-3 z-[450] max-w-[185px] rounded-full bg-white/95 px-3 py-2 text-[10px] font-extrabold shadow-md"
            style={{ color: DARK }}
          >
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#84cc35]" />
            {driverPoint
              ? (safeRoute ? 'Rider GPS · road route' : customerPoint ? 'Rider GPS · direct-line guide' : 'Rider GPS location')
              : 'Waiting for rider location'}
          </div>

          {showControls && (
            <div className="absolute bottom-12 right-3 z-[450] flex flex-col gap-2" aria-label="Map controls">
              {driverPoint && (
                <button
                  type="button"
                  aria-label="Center map on delivery rider"
                  title="Follow rider"
                  onClick={followRider}
                  className="grid h-10 w-10 place-items-center rounded-full border border-[#e3ebd8] bg-white text-xl font-bold shadow-lg"
                  style={{ color: following ? '#5d9724' : DARK }}
                >
                  ⌖
                </button>
              )}
              {driverPoint && customerPoint && (
                <button
                  type="button"
                  aria-label="Show rider and delivery address"
                  title="View both locations"
                  onClick={showWholeRoute}
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
              setRetry((value) => value + 1)
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
