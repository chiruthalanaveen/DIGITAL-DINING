'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A presentation-only bridge to the EXISTING owner dashboard tools.
 * - Desktop: renders the existing dashboard sections in their original position.
 * - Mobile, closed: mounts no management section.
 * - Mobile, open: moves only the selected workspace into its own viewport layer.
 *
 * No new Supabase queries, permissions, payment handlers, or business state.
 */
export default function OwnerMobileWorkspaceLayer({
  open = false,
  title = 'Management',
  onBack,
  children,
}) {
  const [ready, setReady] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const scrollRef = useRef(null)
  const backButtonRef = useRef(null)
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)')
    const sync = () => setIsMobile(query.matches)
    sync()
    setReady(true)
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    if (!ready || !isMobile || !open) return undefined

    // Preserve the original scroll state when the workspace closes.
    const bodyOverflow = document.body.style.overflow
    const htmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    backButtonRef.current?.focus({ preventScroll: true })
    const onKeyDown = event => {
      if (event.key === 'Escape') onBackRef.current?.()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = bodyOverflow
      document.documentElement.style.overflow = htmlOverflow
    }
  }, [ready, isMobile, open])

  useEffect(() => {
    if (open && isMobile) scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [open, isMobile, title])

  // Do not render the desktop workspace during mobile hydration.
  if (!ready) return <div className="hidden lg:block">{children}</div>
  if (!isMobile) return <>{children}</>
  if (!open) return null

  return createPortal(
    <section
      className="dd-mobile-workspace-portal fixed inset-0 z-[130] flex min-h-0 flex-col overflow-hidden bg-[#f5f6f8] text-neutral-900"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <style jsx global>{`
        .dd-mobile-workspace-portal .dd-dashboard-sidebar,
        .dd-mobile-workspace-portal .dd-ws-metrics-grid,
        .dd-mobile-workspace-portal #dd-owner-delivery-side-navigation {
          display: none !important;
        }
        .dd-mobile-workspace-portal .dd-ws-live-content {
          display: block !important;
        }
        .dd-mobile-workspace-portal input,
        .dd-mobile-workspace-portal select,
        .dd-mobile-workspace-portal textarea {
          max-width: 100%;
        }
        .dd-mobile-workspace-portal table { max-width: none; }
        :root[data-theme='dark'] .dd-mobile-workspace-portal {
          background: #10131b;
          color: #f1f5f9;
        }
      `}</style>

      <header className="relative z-20 flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-3 pb-3 pt-[calc(12px+env(safe-area-inset-top))] shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <button
          ref={backButtonRef}
          type="button"
          aria-label="Back to previous owner screen"
          onClick={() => onBack?.()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white"
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6M9 12h12" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[.13em] text-neutral-500">Owner workspace</p>
          <h1 className="truncate text-base font-extrabold text-neutral-900 dark:text-white">{title}</h1>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="mx-auto max-w-4xl space-y-4">
          {children}
        </div>
      </div>
    </section>,
    document.body
  )
}