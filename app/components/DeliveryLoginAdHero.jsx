'use client'
// Exact destination: app/components/DeliveryLoginAdHero.jsx
// Public, admin-controlled carousel: never contains credentials or private customer data.
import { useEffect, useRef, useState } from 'react'

const STORE_CODE = /^[A-Za-z0-9_-]{1,80}$/
const ROTATE_MS = 6500
const MAX_ADS = 6

function Arrow({ direction = 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {direction === 'left' ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  )
}

export default function DeliveryLoginAdHero({ restaurantCode = '', onSkip }) {
  const [ads, setAds] = useState([])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStart = useRef(null)
  const code = STORE_CODE.test(String(restaurantCode)) ? restaurantCode : ''

  useEffect(() => {
    if (!code) { setAds([]); return undefined }
    let mounted = true
    const controller = new AbortController()
    const getAds = async () => {
      try {
        const response = await fetch(`/api/delivery/login-advertisements?restaurantCode=${encodeURIComponent(code)}`, {
          signal: controller.signal,
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) throw new Error('Advertisements are temporarily unavailable')
        const json = await response.json()
        if (mounted && json.success && Array.isArray(json.advertisements)) {
          setAds(json.advertisements.slice(0, MAX_ADS))
          setIndex(0)
        }
      } catch (error) {
        if (mounted && !controller.signal.aborted) {
          // Fallback creative stays visible; never block authentication.
          setAds([])
        }
      }
    }
    void getAds()
    return () => { mounted = false; controller.abort() }
  }, [code])

  useEffect(() => {
    if (ads.length < 2 || paused) return undefined
    const rotate = window.setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) {
        setIndex(value => (value + 1) % ads.length)
      }
    }, ROTATE_MS)
    return () => window.clearInterval(rotate)
  }, [ads.length, paused])

  const move = (delta) => setIndex(value => (value + delta + ads.length) % ads.length)
  const active = ads[index] || null
  const headline = active?.headline || 'Good food. Great moments.'
  const eyebrow = active?.eyebrow || 'DIGITAL DINE-IN DELIVERY'
  const description = active?.description || 'Discover your favourites, delivered with care.'
  const imageUrl = /^https:\/\//i.test(String(active?.image_url || '')) ? active.image_url : ''

  return (
    <section
      aria-label="Delivery login advertisements"
      className="relative isolate flex min-h-[350px] w-full flex-col overflow-hidden bg-[#060908] text-white sm:min-h-[450px]"
      onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null }}
      onTouchEnd={event => {
        const start = touchStart.current
        const end = event.changedTouches[0]?.clientX
        touchStart.current = null
        if (start !== null && Number.isFinite(end) && Math.abs(end - start) > 55 && ads.length > 1) {
          move(end < start ? 1 : -1)
        }
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_65%,rgba(24,151,112,0.24),transparent_51%),radial-gradient(ellipse_at_10%_40%,rgba(245,114,74,0.14),transparent_43%)]" />
      {imageUrl ? (
        <img
          key={imageUrl}
          src={imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-75"
          decoding="async"
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden="true">
          <div className="absolute -bottom-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full border-[28px] border-[#d4a877]/30 bg-[radial-gradient(circle_at_center,#9c6039_0%,#52361f_47%,#231a16_72%)] shadow-[0_0_90px_rgba(202,133,66,0.25)] sm:h-80 sm:w-80" />
          <span className="absolute bottom-[12%] left-[13%] rotate-[-18deg] text-[76px] drop-shadow-[0_15px_16px_#000] sm:text-[104px]">🍔</span>
          <span className="absolute bottom-[8%] right-[8%] rotate-[14deg] text-[85px] drop-shadow-[0_15px_16px_#000] sm:text-[112px]">🍕</span>
          <span className="absolute bottom-[3%] left-[42%] -rotate-[7deg] text-[102px] drop-shadow-[0_15px_16px_#000] sm:text-[138px]">🍛</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/65 via-black/5 to-black/70" />
      <div className="relative z-10 mx-auto flex w-full max-w-xl items-center justify-between px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 text-[11px] font-black tracking-[0.16em]">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 text-base text-[#062013]">DD</span>
          <span>DIGITAL DINE-IN</span>
        </div>
        <button type="button" onClick={onSkip} className="rounded-full border border-white/20 bg-black/45 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md" aria-label="Skip advertisement and go to login">Skip</button>
      </div>
      <div className="relative z-10 mx-auto w-full max-w-xl px-6 pt-8 text-center sm:pt-12">
        <p className="text-[10px] font-black uppercase tracking-[0.27em] text-emerald-200">{eyebrow}</p>
        <h1 className="mt-3 text-[clamp(2.1rem,8.5vw,3.75rem)] font-black leading-[1.05] tracking-[-0.055em] drop-shadow-[0_3px_16px_rgba(0,0,0,.65)]">{headline}</h1>
        <p className="mx-auto mt-3 max-w-sm text-[13px] font-semibold leading-5 text-white/85 drop-shadow-[0_3px_7px_rgba(0,0,0,.7)]">{description}</p>
      </div>
      <div className="relative z-10 mt-auto flex items-center justify-center gap-3 pb-7 pt-32">
        {ads.length > 1 && (
          <>
            <button type="button" onClick={() => move(-1)} className="rounded-full border border-white/25 bg-black/40 p-1.5" aria-label="Previous advertisement"><Arrow direction="left" /></button>
            <div className="flex items-center gap-2" aria-label="Advertisement pages">
              {ads.map((ad, i) => <button type="button" key={ad.id} onClick={() => setIndex(i)} aria-label={`Show advertisement ${i + 1}`} aria-current={index === i ? 'true' : undefined} className={`h-1.5 rounded-full transition-all ${index === i ? 'w-6 bg-emerald-400' : 'w-1.5 bg-white/50'}`} />)}
            </div>
            <button type="button" onClick={() => move(1)} className="rounded-full border border-white/25 bg-black/40 p-1.5" aria-label="Next advertisement"><Arrow /></button>
          </>
        )}
        {ads.length <= 1 && <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold tracking-wide text-white/80">Fresh picks, every day</span>}
      </div>
    </section>
  )
}