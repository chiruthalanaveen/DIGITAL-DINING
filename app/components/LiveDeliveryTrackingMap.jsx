'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const LEAFLET_VERSION = '1.9.4'
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`

function validCoordinate(latitude, longitude) {
  const lat = Number(latitude)
  const lng = Number(longitude)

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
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
  const url = String(value || '').trim()
  if (!url) return ''

  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return ''
    return parsed.href
  } catch {
    return ''
  }
}

function markerEmoji(type) {
  switch (String(type || '').toLowerCase()) {
    case 'scooter':
      return '🛵'
    case 'car':
      return '🚗'
    case 'van':
      return '🚚'
    case 'bike':
    default:
      return '🏍️'
  }
}

function loadLeaflet() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Map is available only in the browser.'))
  }

  if (window.L) return Promise.resolve(window.L)

  if (window.__digitalDineLeafletPromise) {
    return window.__digitalDineLeafletPromise
  }

  window.__digitalDineLeafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-digital-dine-leaflet="true"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = LEAFLET_CSS
      link.dataset.digitalDineLeaflet = 'true'
      document.head.appendChild(link)
    }

    const existing = document.querySelector(
      'script[data-digital-dine-leaflet="true"]'
    )

    if (existing) {
      existing.addEventListener('load', () => resolve(window.L), { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Unable to load the map library.')),
        { once: true }
      )
      return
    }

    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.async = true
    script.dataset.digitalDineLeaflet = 'true'
    script.onload = () => {
      if (window.L) resolve(window.L)
      else reject(new Error('Map library did not initialize.'))
    }
    script.onerror = () => reject(new Error('Unable to load the map library.'))
    document.body.appendChild(script)
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
  const headingValue = Number.isFinite(Number(heading)) ? Number(heading) : 0

  const adEnabled = Boolean(advertisement?.enabled)
  const adPosition = String(advertisement?.position || 'above_marker')
  const showAdAbove = adEnabled && ['above_marker', 'both'].includes(adPosition)
  const adTitle = escapeHtml(advertisement?.title || '')
  const adImageUrl = safeHttpUrl(advertisement?.image_url)

  const adHtml = showAdAbove
    ? `<div style="margin-bottom:6px;max-width:145px;border:1px solid rgba(16,185,129,.25);background:#ffffff;border-radius:12px;padding:6px 8px;box-shadow:0 8px 24px rgba(0,0,0,.14);font-size:10px;font-weight:800;color:#111827;line-height:1.2;text-align:center;white-space:normal;">
        ${adImageUrl ? `<img src="${escapeHtml(adImageUrl)}" alt="" style="display:block;width:100%;max-height:58px;object-fit:cover;border-radius:8px;margin-bottom:5px;" />` : ''}
        ${adTitle || 'Delivery offer'}
      </div>`
    : ''

  const markerVisual = useImage
    ? `<div style="height:50px;width:50px;border-radius:18px;border:3px solid white;background:#fff;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;">
        <img src="${escapeHtml(imageUrl)}" alt="" style="height:100%;width:100%;object-fit:cover;" />
      </div>`
    : `<div style="height:50px;width:50px;border-radius:18px;border:3px solid white;background:#10b981;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:26px;line-height:1;">
        ${markerEmoji(type)}
      </div>`

  const label = escapeHtml(markerLabel || driverName || 'Delivery partner')

  return `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-1px,-4px);">
      ${adHtml}
      <div style="position:relative;">
        ${markerVisual}
        <div style="position:absolute;right:-8px;top:-8px;height:22px;width:22px;border-radius:9999px;border:2px solid white;background:#111827;color:white;display:flex;align-items:center;justify-content:center;font-size:10px;box-shadow:0 4px 12px rgba(0,0,0,.22);transform:rotate(${headingValue}deg);">▲</div>
        <div style="position:absolute;left:50%;bottom:-5px;height:10px;width:10px;border-radius:9999px;background:#10b981;border:2px solid white;transform:translateX(-50%);box-shadow:0 2px 8px rgba(0,0,0,.25);"></div>
      </div>
      <div style="margin-top:8px;max-width:150px;border-radius:9999px;background:rgba(17,24,39,.92);color:white;padding:5px 9px;font-size:9px;font-weight:800;line-height:1.2;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 6px 18px rgba(0,0,0,.18);">${label}</div>
    </div>
  `
}

function animateMarker(marker, from, to, duration, animationRef) {
  if (!marker || !from || !to) return

  if (animationRef.current) {
    cancelAnimationFrame(animationRef.current)
  }

  const start = performance.now()

  const frame = (now) => {
    const progress = Math.min(1, (now - start) / duration)
    const eased = 1 - Math.pow(1 - progress, 3)

    marker.setLatLng([
      from.lat + (to.lat - from.lat) * eased,
      from.lng + (to.lng - from.lng) * eased,
    ])

    if (progress < 1) {
      animationRef.current = requestAnimationFrame(frame)
    } else {
      animationRef.current = null
    }
  }

  animationRef.current = requestAnimationFrame(frame)
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
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const driverMarkerRef = useRef(null)
  const customerMarkerRef = useRef(null)
  const guideLineRef = useRef(null)
  const animationRef = useRef(null)
  const lastDriverPointRef = useRef(null)

  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')

  const driverValid = validCoordinate(driverLatitude, driverLongitude)
  const customerValid = validCoordinate(customerLatitude, customerLongitude)

  const bottomAdvertisement = useMemo(() => {
    if (!advertisement?.enabled) return null

    const position = String(advertisement.position || 'above_marker')
    if (!['bottom', 'both'].includes(position)) return null

    return {
      title: String(advertisement.title || '').trim(),
      text: String(advertisement.text || '').trim(),
      imageUrl: safeHttpUrl(advertisement.image_url),
      link: safeHttpUrl(advertisement.link),
    }
  }, [advertisement])

  useEffect(() => {
    let active = true

    const start = async () => {
      try {
        const L = await loadLeaflet()
        if (!active || !containerRef.current || mapRef.current) return

        const initialCenter = driverValid
          ? [Number(driverLatitude), Number(driverLongitude)]
          : customerValid
            ? [Number(customerLatitude), Number(customerLongitude)]
            : [20.5937, 78.9629]

        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView(initialCenter, driverValid || customerValid ? 16 : 5)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map)

        mapRef.current = map

        if (customerValid) {
          const customerIcon = L.divIcon({
            className: '',
            html: `
              <div style="display:flex;flex-direction:column;align-items:center;">
                <div style="height:42px;width:42px;border-radius:16px;border:3px solid white;background:#111827;box-shadow:0 8px 24px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center;font-size:21px;">🏠</div>
                <div style="margin-top:6px;border-radius:9999px;background:#fff;color:#111827;padding:4px 8px;font-size:9px;font-weight:800;box-shadow:0 6px 18px rgba(0,0,0,.14);white-space:nowrap;">Your address</div>
              </div>
            `,
            iconSize: [70, 70],
            iconAnchor: [35, 40],
          })

          customerMarkerRef.current = L.marker(
            [Number(customerLatitude), Number(customerLongitude)],
            { icon: customerIcon, keyboard: false }
          ).addTo(map)
        }

        if (driverValid) {
          const driverIcon = L.divIcon({
            className: '',
            html: driverIconHtml({
              markerType,
              markerImageUrl,
              markerLabel,
              driverName,
              heading: driverHeading,
              advertisement,
            }),
            iconSize: [170, 150],
            iconAnchor: [85, 108],
          })

          const point = [Number(driverLatitude), Number(driverLongitude)]
          driverMarkerRef.current = L.marker(point, {
            icon: driverIcon,
            keyboard: false,
            zIndexOffset: 1000,
          }).addTo(map)

          lastDriverPointRef.current = {
            lat: point[0],
            lng: point[1],
          }
        }

        if (driverValid && customerValid) {
          const points = [
            [Number(driverLatitude), Number(driverLongitude)],
            [Number(customerLatitude), Number(customerLongitude)],
          ]

          guideLineRef.current = L.polyline(points, {
            weight: 3,
            opacity: 0.55,
            dashArray: '8 10',
          }).addTo(map)

          map.fitBounds(points, {
            padding: [60, 60],
            maxZoom: 17,
          })
        }

        window.setTimeout(() => {
          try {
            map.invalidateSize()
          } catch {
            // Ignore cleanup races.
          }
        }, 120)

        if (active) {
          setMapReady(true)
          setMapError('')
        }
      } catch (error) {
        if (active) {
          setMapError(error?.message || 'Unable to load live tracking map.')
        }
      }
    }

    start()

    return () => {
      active = false

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }

      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {
          // Ignore map cleanup races.
        }
      }

      mapRef.current = null
      driverMarkerRef.current = null
      customerMarkerRef.current = null
      guideLineRef.current = null
      lastDriverPointRef.current = null
    }
    // Create once for this component instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapReady || !mapRef.current || typeof window === 'undefined') return
    if (!driverValid) return

    const L = window.L
    if (!L) return

    const nextPoint = {
      lat: Number(driverLatitude),
      lng: Number(driverLongitude),
    }

    const nextIcon = L.divIcon({
      className: '',
      html: driverIconHtml({
        markerType,
        markerImageUrl,
        markerLabel,
        driverName,
        heading: driverHeading,
        advertisement,
      }),
      iconSize: [170, 150],
      iconAnchor: [85, 108],
    })

    if (!driverMarkerRef.current) {
      driverMarkerRef.current = L.marker(
        [nextPoint.lat, nextPoint.lng],
        {
          icon: nextIcon,
          keyboard: false,
          zIndexOffset: 1000,
        }
      ).addTo(mapRef.current)

      lastDriverPointRef.current = nextPoint
    } else {
      driverMarkerRef.current.setIcon(nextIcon)

      const previous = lastDriverPointRef.current || nextPoint
      animateMarker(
        driverMarkerRef.current,
        previous,
        nextPoint,
        850,
        animationRef
      )
      lastDriverPointRef.current = nextPoint
    }

    if (customerValid) {
      const customerPoint = [
        Number(customerLatitude),
        Number(customerLongitude),
      ]

      if (guideLineRef.current) {
        guideLineRef.current.setLatLngs([
          [nextPoint.lat, nextPoint.lng],
          customerPoint,
        ])
      } else {
        guideLineRef.current = L.polyline(
          [[nextPoint.lat, nextPoint.lng], customerPoint],
          {
            weight: 3,
            opacity: 0.55,
            dashArray: '8 10',
          }
        ).addTo(mapRef.current)
      }
    }

    const bounds = mapRef.current.getBounds()
    const driverLatLng = L.latLng(nextPoint.lat, nextPoint.lng)

    if (!bounds.pad(-0.15).contains(driverLatLng)) {
      mapRef.current.panTo(driverLatLng, {
        animate: true,
        duration: 0.6,
      })
    }
  }, [
    advertisement,
    customerLatitude,
    customerLongitude,
    customerValid,
    driverHeading,
    driverLatitude,
    driverLongitude,
    driverName,
    driverValid,
    mapReady,
    markerImageUrl,
    markerLabel,
    markerType,
  ])

  useEffect(() => {
    if (!mapReady || !mapRef.current || typeof window === 'undefined') return
    if (!customerValid) return

    const L = window.L
    if (!L) return

    const point = [Number(customerLatitude), Number(customerLongitude)]

    if (customerMarkerRef.current) {
      customerMarkerRef.current.setLatLng(point)
    }
  }, [customerLatitude, customerLongitude, customerValid, mapReady])

  const bottomAdContent = bottomAdvertisement ? (
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
          <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">
            Promotion
          </p>

          {bottomAdvertisement.title && (
            <p className="mt-0.5 truncate text-sm font-black text-neutral-950">
              {bottomAdvertisement.title}
            </p>
          )}

          {bottomAdvertisement.text && (
            <p className="mt-1 text-[11px] leading-4 text-neutral-600">
              {bottomAdvertisement.text}
            </p>
          )}
        </div>

        {bottomAdvertisement.link && (
          <a
            href={bottomAdvertisement.link}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black text-white"
          >
            View
          </a>
        )}
      </div>
    </div>
  ) : null

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
      <div
        ref={containerRef}
        style={{ height: `${Math.max(260, Number(height) || 360)}px` }}
        className="w-full"
      />

      {!mapReady && !mapError && (
        <div className="border-t border-neutral-200 bg-white px-4 py-3 text-xs font-bold text-neutral-500">
          Loading live map…
        </div>
      )}

      {mapError && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
          {mapError}
        </div>
      )}

      {bottomAdContent}
    </div>
  )
}
