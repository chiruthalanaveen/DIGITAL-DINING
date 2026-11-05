'use client'

import { useEffect, useState } from 'react'

// Admin-only owner identity summary. The server derives the name from the
// verified owner Auth account; it is never supplied by the chat browser.
// This component is keyed by the selected business. Polling message refreshes
// do not trigger additional owner-profile requests.
export default function AdminSupportOwnerIdentity({ restaurantId, onOpenDetails }) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!restaurantId) return undefined
    const controller = new AbortController()
    setName('')
    setContact('')
    setError('')
    setLoading(true)
    fetch(`/api/admin/live-support/owner-profile?restaurantId=${encodeURIComponent(restaurantId)}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data?.success) throw new Error(data.message || 'Owner profile unavailable.')
        return data
      })
      .then((data) => {
        setName(String(data?.owner?.name || '').trim())
        setContact(String(data?.owner?.email || '').trim())
      })
      .catch((cause) => {
        if (cause?.name !== 'AbortError') setError(cause?.message || 'Owner profile unavailable.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [restaurantId])

  if (!restaurantId) return null
  const display = loading ? 'Finding owner…' : (name || 'View owner profile')

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-neutral-400">Verified business owner:</span>
      <button
        type="button"
        onClick={onOpenDetails}
        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 underline decoration-emerald-400/60 underline-offset-2 hover:bg-emerald-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
        title="Open verified owner details and Restaurant, Delivery and Resort order activity"
      >
        {display} ↗
      </button>
      {!loading && contact && <span className="max-w-full break-all text-[11px] text-neutral-500">{contact}</span>}
      {error && <span className="text-[11px] text-amber-400">Owner details unavailable; click to retry.</span>}
    </div>
  )
}