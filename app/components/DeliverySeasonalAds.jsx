'use client'
// Destination: app/components/DeliverySeasonalAds.jsx
// Horizontal, touch-swipeable seasonal campaign carousel for one Delivery store.
// Server retains final control of store assignment, enabled status and dates.
import { useCallback, useEffect, useRef, useState } from 'react'
import '@/app/components/delivery-seasonal-ads.css'

const STORE_CODE = /^[A-Za-z0-9_-]{1,80}$/
const ROTATE_MS = 7000
const REFRESH_MS = 60000
const THEMES = ['violet', 'sunset', 'gold', 'emerald', 'blue']

export default function DeliverySeasonalAds({ restaurantCode, onBrowse, onCategory }) {
  const [campaigns, setCampaigns] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [interacting, setInteracting] = useState(false)
  const [visible, setVisible] = useState(false)
  const [fetchState, setFetchState] = useState('idle')
  const [fetchError, setFetchError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const sliderRef = useRef(null)
  const sectionRef = useRef(null)
  const resumeTimerRef = useRef(null)
  const userPauseRef = useRef(false)
  const refreshRef = useRef(0)

  const moveTo = useCallback((index, behavior = 'smooth') => {
    const viewport = sliderRef.current
    if (!viewport) return
    const count = viewport.children.length
    if (!count) return
    const nextIndex = (index + count) % count
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    viewport.scrollTo({
      left: nextIndex * viewport.clientWidth,
      behavior: prefersReducedMotion ? 'auto' : behavior,
    })
    setActiveIndex(nextIndex)
  }, [])

  const pauseTemporarily = useCallback(() => {
    userPauseRef.current = true
    setInteracting(true)
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null
      userPauseRef.current = false
      setInteracting(false)
    }, 4500)
  }, [])

  useEffect(() => {
    // A store switch or manual retry resets the currently displayed campaigns.
    // No expired campaigns or campaigns belonging to another store are retained.
    const requestGeneration = ++refreshRef.current
    let disposed = false
    let request = null
    setCampaigns([])
    setActiveIndex(0)
    setVisible(false)
    setFetchState('loading')
    setFetchError('')
    if (sliderRef.current) sliderRef.current.scrollLeft = 0

    if (!STORE_CODE.test(String(restaurantCode || ''))) {
      setFetchState('idle')
      return undefined
    }

    const reload = async () => {
      // Supersede an older request rather than allowing stale responses to win.
      request?.abort()
      const controller = new AbortController()
      request = controller
      let timedOut = false
      const timeout = window.setTimeout(() => {
        timedOut = true
        controller.abort()
      }, 12000)

      try {
        const endpoint = `/api/delivery/seasonal-ads?restaurantCode=${encodeURIComponent(restaurantCode)}`
        const response = await fetch(endpoint, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        const isJson = response.headers.get('content-type')?.includes('application/json')
        const payload = isJson ? await response.json().catch(() => null) : null
        if (!response.ok) {
          const statusText = response.status === 404
            ? 'The seasonal ads API route is missing (HTTP 404).'
            : response.status === 503
              ? 'The seasonal ads server is unavailable (HTTP 503).'
              : `The seasonal ads API returned HTTP ${response.status}.`
          throw new Error(statusText)
        }
        if (payload?.success !== true || !Array.isArray(payload?.campaigns)) {
          throw new Error('The seasonal ads API returned an invalid response.')
        }
        if (disposed || requestGeneration !== refreshRef.current || controller.signal.aborted) return
        const next = payload.campaigns.slice(0, 5)
        setCampaigns(next)
        setActiveIndex(index => index < next.length ? index : 0)
        setFetchError('')
        setFetchState('ready')
      } catch (error) {
        if (disposed || requestGeneration !== refreshRef.current ||
            (controller.signal.aborted && !timedOut)) return
        // A fetch rejection means no HTTP response arrived. Common reasons:
        // the Next.js server restarted, a network interruption, or browser blocking.
        const reason = timedOut
          ? 'The advertisements request timed out.'
          : error instanceof TypeError
            ? 'Could not connect to the seasonal ads API.'
            : String(error?.message || 'Unable to load seasonal advertisements.')
        setCampaigns([]) // Fail closed: never show a stale/expired promotion.
        setActiveIndex(0)
        setFetchError(process.env.NODE_ENV === 'production'
          ? 'Seasonal sale banners are temporarily unavailable.'
          : reason)
        setFetchState('error')
      } finally {
        window.clearTimeout(timeout)
        if (request === controller) request = null
      }
    }

    void reload()
    const refreshTimer = window.setInterval(() => { void reload() }, REFRESH_MS)
    const onConnectionRestored = () => { void reload() }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    window.addEventListener('online', onConnectionRestored)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      disposed = true
      request?.abort()
      window.clearInterval(refreshTimer)
      window.removeEventListener('online', onConnectionRestored)
      document.removeEventListener('visibilitychange', onVisible)
      refreshRef.current += 1
    }
  }, [restaurantCode, retryCount])

  useEffect(() => {
    if (!campaigns.length) return undefined
    const section = sectionRef.current
    if (!section || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(Boolean(entry?.isIntersecting))
    }, { threshold: 0.25 })
    observer.observe(section)
    return () => observer.disconnect()
  }, [campaigns.length])

  useEffect(() => {
    // If an admin removes a slide while it is selected, return to a valid slide.
    if (!campaigns.length) return
    const viewport = sliderRef.current
    if (!viewport) return
    if (activeIndex >= campaigns.length) moveTo(0, 'instant')
  }, [campaigns.length, activeIndex, moveTo])

  useEffect(() => {
    if (campaigns.length < 2 || interacting || !visible ||
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return undefined
    const timer = window.setInterval(() => {
      if (document.hidden || userPauseRef.current) return
      const viewport = sliderRef.current
      if (!viewport) return
      const index = Math.round(viewport.scrollLeft / Math.max(1, viewport.clientWidth))
      moveTo(index + 1)
    }, ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [campaigns.length, interacting, visible, moveTo])

  useEffect(() => () => {
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current)
  }, [])

  const onScroll = () => {
    const viewport = sliderRef.current
    if (!viewport?.clientWidth) return
    const index = Math.round(viewport.scrollLeft / viewport.clientWidth)
    setActiveIndex(Math.max(0, Math.min(campaigns.length - 1, index)))
  }

  const browseAd = (campaign) => {
    if (campaign.button_action === 'category' && campaign.category_name) {
      onCategory?.(campaign.category_name)
    } else {
      onBrowse?.()
    }
  }

  if (!campaigns.length) {
    if (fetchState !== 'error') return null
    return (
      <div className="dds-ads-fetch-notice" role="status">
        <span>{fetchError || 'Seasonal advertisements are temporarily unavailable.'}</span>
        <button type="button" onClick={() => setRetryCount(count => count + 1)}>
          Retry ads
        </button>
      </div>
    )
  }

  return (
    <section
      ref={sectionRef}
      className="dds-ads"
      aria-label="Store seasonal sale advertisements"
      aria-roledescription="carousel"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => { if (!userPauseRef.current) setInteracting(false) }}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !userPauseRef.current) {
          setInteracting(false)
        }
      }}
    >
      <div className="dds-ads-head">
        <div><span className="dds-ads-sparkle" aria-hidden="true">✦</span> GREAT DEALS & SEASONAL EVENTS</div>
        {campaigns.length > 1 && <span className="dds-ads-count">Swipe to explore <span aria-hidden="true">←</span></span>}
      </div>

      <div
        ref={sliderRef}
        className="dds-ads-scroller"
        onScroll={onScroll}
        onTouchStart={pauseTemporarily}
        onPointerDown={pauseTemporarily}
        aria-live="off"
        tabIndex={0}
        aria-label="Swipe left or right to view promotions"
      >
        {campaigns.map((ad, index) => (
          <article
            key={ad.id}
            className={`dds-ads-banner dds-ads-theme-${THEMES[index % THEMES.length]}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`Advertisement ${index + 1} of ${campaigns.length}: ${ad.headline}`}
          >
            <div className="dds-ads-decor dds-ads-decor-one" aria-hidden="true" />
            <div className="dds-ads-decor dds-ads-decor-two" aria-hidden="true" />
            <div className="dds-ads-copy">
              <span className="dds-ads-sale-tag">✦ {ad.eyebrow || 'SEASONAL SPECIAL'}</span>
              <h2>{ad.headline}</h2>
              {ad.description && <p className="dds-ads-desc">{ad.description}</p>}
              <button type="button" className="dds-ads-cta" onClick={() => browseAd(ad)}>
                {ad.button_label || 'Shop now'} <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="dds-ads-art" aria-hidden="true">
              {ad.image_url ? (
                <img src={ad.image_url} alt="" loading={index === 0 ? 'eager' : 'lazy'} />
              ) : (
                <div className="dds-ads-fallback"><span>🛍️</span><span>🎁</span><span>✨</span></div>
              )}
            </div>
            <span className="dds-ads-corner" aria-hidden="true">✳</span>
          </article>
        ))}
      </div>

      {campaigns.length > 1 && (
        <div className="dds-ads-controls">
          <button type="button" className="dds-ads-arrow" onClick={() => { pauseTemporarily(); moveTo(activeIndex - 1) }} aria-label="Previous advertisement">‹</button>
          <div className="dds-ads-pages" aria-label="Choose advertisement">
            {campaigns.map((ad, index) => (
              <button
                key={ad.id}
                type="button"
                className={index === activeIndex ? 'is-active' : ''}
                aria-label={`Show advertisement ${index + 1}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                onClick={() => { pauseTemporarily(); moveTo(index) }}
              />
            ))}
          </div>
          <button type="button" className="dds-ads-arrow" onClick={() => { pauseTemporarily(); moveTo(activeIndex + 1) }} aria-label="Next advertisement">›</button>
        </div>
      )}
    </section>
  )
}