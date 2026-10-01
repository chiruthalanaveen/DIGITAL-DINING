'use client'

import { useEffect, useRef, useState } from 'react'

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

function loadLeaflet() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Map is available only in the browser.'))
  }

  if (window.L) {
    return Promise.resolve(window.L)
  }

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
      existing.addEventListener(
        'load',
        () => resolve(window.L),
        { once: true }
      )
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

export default function DeliveryLocationMap({
  latitude,
  longitude,
  onChange,
  referenceLatitude,
  referenceLongitude,
  radiusKm,
  showRadius = false,
  readOnly = false,
  height = 300,
  zoom = 16,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const circleRef = useRef(null)
  const changeRef = useRef(onChange)
  const [mapError, setMapError] = useState('')
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    changeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    let active = true

    const start = async () => {
      try {
        const L = await loadLeaflet()
        if (!active || !containerRef.current || mapRef.current) return

        const hasSelected = validCoordinate(latitude, longitude)
        const hasReference = validCoordinate(
          referenceLatitude,
          referenceLongitude
        )

        const center = hasSelected
          ? [Number(latitude), Number(longitude)]
          : hasReference
            ? [Number(referenceLatitude), Number(referenceLongitude)]
            : [20.5937, 78.9629]

        const initialZoom = hasSelected || hasReference ? zoom : 5

        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView(center, initialZoom)

        L.tileLayer(
          'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution:
              '&copy; OpenStreetMap contributors',
          }
        ).addTo(map)

        const marker = L.marker(center, {
          draggable: !readOnly,
          keyboard: !readOnly,
          autoPan: true,
        }).addTo(map)

        const emit = (lat, lng) => {
          if (readOnly) return
          if (typeof changeRef.current === 'function') {
            changeRef.current({
              latitude: Number(lat).toFixed(7),
              longitude: Number(lng).toFixed(7),
            })
          }
        }

        if (!readOnly) {
          marker.on('dragend', () => {
            const point = marker.getLatLng()
            emit(point.lat, point.lng)
          })

          map.on('click', (event) => {
            marker.setLatLng(event.latlng)
            emit(event.latlng.lat, event.latlng.lng)
          })
        }

        mapRef.current = map
        markerRef.current = marker

        if (
          showRadius &&
          hasReference &&
          Number(radiusKm) > 0
        ) {
          circleRef.current = L.circle(
            [
              Number(referenceLatitude),
              Number(referenceLongitude),
            ],
            {
              radius: Number(radiusKm) * 1000,
              weight: 2,
              fillOpacity: 0.08,
            }
          ).addTo(map)
        }

        window.setTimeout(() => {
          try {
            map.invalidateSize()
          } catch {
            // Ignore map cleanup races.
          }
        }, 100)

        if (active) {
          setMapReady(true)
          setMapError('')
        }
      } catch (error) {
        if (active) {
          setMapError(
            error?.message || 'Unable to load location map.'
          )
        }
      }
    }

    start()

    return () => {
      active = false
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {
          // Ignore cleanup failures.
        }
      }
      mapRef.current = null
      markerRef.current = null
      circleRef.current = null
    }
    // Create the Leaflet map once for this component instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapReady || !mapRef.current || !markerRef.current) return
    if (!validCoordinate(latitude, longitude)) return

    const point = [Number(latitude), Number(longitude)]
    markerRef.current.setLatLng(point)

    const center = mapRef.current.getCenter()
    const movedFar =
      Math.abs(center.lat - point[0]) > 0.002 ||
      Math.abs(center.lng - point[1]) > 0.002

    if (movedFar) {
      mapRef.current.setView(
        point,
        Math.max(mapRef.current.getZoom(), zoom)
      )
    }
  }, [latitude, longitude, mapReady, zoom])

  useEffect(() => {
    if (!mapReady || !mapRef.current || typeof window === 'undefined') return

    const L = window.L
    if (!L) return

    if (circleRef.current) {
      try {
        mapRef.current.removeLayer(circleRef.current)
      } catch {
        // Ignore stale layer cleanup.
      }
      circleRef.current = null
    }

    if (
      showRadius &&
      validCoordinate(referenceLatitude, referenceLongitude) &&
      Number(radiusKm) > 0
    ) {
      circleRef.current = L.circle(
        [
          Number(referenceLatitude),
          Number(referenceLongitude),
        ],
        {
          radius: Number(radiusKm) * 1000,
          weight: 2,
          fillOpacity: 0.08,
        }
      ).addTo(mapRef.current)
    }
  }, [
    mapReady,
    referenceLatitude,
    referenceLongitude,
    radiusKm,
    showRadius,
  ])

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
      <div
        ref={containerRef}
        style={{ height: `${Math.max(220, Number(height) || 300)}px` }}
        className="w-full"
      />

      {!mapReady && !mapError && (
        <div className="border-t border-neutral-200 bg-white px-4 py-3 text-xs font-bold text-neutral-500">
          Loading map…
        </div>
      )}

      {mapError && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
          {mapError}
        </div>
      )}
    </div>
  )
}
