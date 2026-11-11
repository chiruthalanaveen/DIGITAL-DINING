
'use client'

import {
  useCallback,
  useEffect,
  useState,
} from 'react'

const FILTERS = [
  'pending',
  'approved',
  'rejected',
  'revoked',
  'consumed',
  'expired',
]

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusClass(status) {
  if (status === 'approved') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  }

  if (status === 'pending') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  }

  return 'border-neutral-700 bg-neutral-800 text-neutral-300'
}

export default function RazorpayAccessRequests() {
  const [filter, setFilter] = useState('pending')
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [notes, setNotes] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async (signal) => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/admin/ecommerce/razorpay/requests?status=${encodeURIComponent(filter)}`,
        {
          cache: 'no-store',
          credentials: 'same-origin',
          signal,
        }
      )

      const result = await response.json().catch(() => ({}))

      if (!response.ok || result.success !== true) {
        throw new Error(
          result.message || 'Unable to load requests.'
        )
      }

      setRequests(
        Array.isArray(result.requests)
          ? result.requests
          : []
      )
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Unable to load requests.')
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)

    return () => controller.abort()
  }, [load])

  async function decide(row, decision) {
    if (savingId) return

    const note = String(notes[row.id] || '').trim()

    if (decision === 'rejected' && !note) {
      setError('Enter a reason before rejecting.')
      return
    }

    const confirmed = window.confirm(
      `${decision.toUpperCase()} Razorpay access request?\n\nStore ID: ${row.store_id}`
    )

    if (!confirmed) return

    setSavingId(row.id)
    setError('')
    setNotice('')

    try {
      const response = await fetch(
        `/api/admin/ecommerce/razorpay/requests/${encodeURIComponent(row.id)}/decision`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            decision,
            note,
          }),
        }
      )

      const result = await response.json().catch(() => ({}))

      if (!response.ok || result.success !== true) {
        throw new Error(
          result.message || 'Unable to update request.'
        )
      }

      setNotice(result.message || 'Request updated.')
      await load()
    } catch (err) {
      setError(err.message || 'Unable to update request.')
    } finally {
      setSavingId('')
    }
  }

  return (
    <section className="space-y-5 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-red-400">
            E-Commerce / Payment Security
          </p>

          <h1 className="mt-2 text-2xl font-black">
            Razorpay Access Requests
          </h1>

          <p className="mt-2 text-xs leading-6 text-neutral-400">
            Approve or reject store-owner requests to
            update Razorpay payment credentials.
          </p>
        </div>

        <button
          type="button"
          onClick={() => load()}
          disabled={loading || Boolean(savingId)}
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-xs font-bold disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setFilter(item)
              setNotice('')
              setError('')
            }}
            className={`rounded-xl px-4 py-2.5 text-xs font-bold ${
              filter === item
                ? 'bg-red-600 text-white'
                : 'border border-neutral-800 bg-neutral-900 text-neutral-400'
            }`}
          >
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300"
        >
          {notice}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
          Loading Razorpay requests...
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-400">
          No {filter} requests found.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {requests.map((row) => (
            <article
              key={row.id}
              className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-black">
                  Razorpay Edit Access
                </h2>

                <span
                  className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase ${statusClass(row.status)}`}
                >
                  {row.status}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs text-neutral-400">
                <p className="break-all">
                  <strong className="text-neutral-200">
                    Store ID:
                  </strong>{' '}
                  {row.store_id}
                </p>

                <p className="break-all">
                  <strong className="text-neutral-200">
                    Owner ID:
                  </strong>{' '}
                  {row.requester_user_id}
                </p>

                <p>
                  <strong className="text-neutral-200">
                    Requested:
                  </strong>{' '}
                  {formatDate(row.created_at)}
                </p>

                {row.expires_at && (
                  <p>
                    <strong className="text-neutral-200">
                      Permission expires:
                    </strong>{' '}
                    {formatDate(row.expires_at)}
                  </p>
                )}

                {row.decided_by && (
                  <p className="break-all">
                    <strong className="text-neutral-200">
                      Decision by:
                    </strong>{' '}
                    {row.decided_by}
                  </p>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-[10px] font-bold uppercase text-neutral-500">
                  Owner's reason
                </p>

                <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-neutral-200">
                  {row.reason}
                </p>
              </div>

              {row.decision_note && (
                <p className="mt-3 text-xs text-neutral-400">
                  Admin note: {row.decision_note}
                </p>
              )}

              {(row.status === 'pending' ||
                row.status === 'approved') && (
                <div className="mt-4 border-t border-neutral-800 pt-4">
                  <label className="block text-xs font-bold text-neutral-300">
                    Admin Note
                    <textarea
                      value={notes[row.id] || ''}
                      onChange={(event) =>
                        setNotes((previous) => ({
                          ...previous,
                          [row.id]: event.target.value.slice(0, 1000),
                        }))
                      }
                      rows={3}
                      placeholder="Reason for approval, rejection or revocation"
                      className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-xs text-white outline-none focus:border-red-500"
                    />
                  </label>

                  <div className="mt-3 flex flex-wrap gap-3">
                    {row.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          disabled={Boolean(savingId)}
                          onClick={() => decide(row, 'approved')}
                          className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold disabled:opacity-50"
                        >
                          {savingId === row.id
                            ? 'Processing...'
                            : 'Approve'}
                        </button>

                        <button
                          type="button"
                          disabled={Boolean(savingId)}
                          onClick={() => decide(row, 'rejected')}
                          className="rounded-xl bg-red-600 px-5 py-3 text-xs font-bold disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          Boolean(savingId) ||
                          !row.expires_at ||
                          Date.parse(row.expires_at) <= Date.now()
                        }
                        onClick={() => decide(row, 'revoked')}
                        className="rounded-xl bg-red-600 px-5 py-3 text-xs font-bold disabled:opacity-50"
                      >
                        Revoke Access
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
