'use client'

import { useCallback, useEffect, useState } from 'react'

const STATUS_OPTIONS = [
  ['all', 'All requests'],
  ['pending_review', 'Pending review'],
  ['in_review', 'In review'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
]

const LABELS = {
  pending_review: 'Pending review',
  in_review: 'In review',
  approved: 'Approved for later processing',
  rejected: 'Rejected',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const ACTION_LABELS = {
  start_review: 'Start review',
  approve: 'Approve for processing',
  reject: 'Reject request',
}

const CONFIRMATIONS = { start_review: 'REVIEW', approve: 'APPROVE', reject: 'REJECT' }

function availableActions(status) {
  if (status === 'pending_review') return ['start_review', 'reject']
  if (status === 'in_review') return ['approve', 'reject']
  return []
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

async function adminFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.success !== true) {
    throw new Error(data.message || `Request failed (${response.status}).`)
  }
  return data
}

export default function AdminPrivacyDeletionReviews() {
  const [status, setStatus] = useState('pending_review')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState({ items: [], restaurantNames: {}, count: 0, pageSize: 30 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [choice, setChoice] = useState(null)
  const [note, setNote] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [historyId, setHistoryId] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // Step 3: one-time, non-destructive safety-preflight results per request.
  const [preflightTarget, setPreflightTarget] = useState(null)
  const [preflightConfirm, setPreflightConfirm] = useState('')
  const [preflightBusy, setPreflightBusy] = useState('')
  const [preflightByRequest, setPreflightByRequest] = useState({})

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await adminFetch(`/api/admin/privacy-deletions?status=${encodeURIComponent(status)}&page=${page}`)
      setResult(data)
    } catch (err) {
      setError(err?.message || 'Unable to load requests.')
    } finally {
      setLoading(false)
    }
  }, [status, page])

  useEffect(() => { loadRequests() }, [loadRequests])

  const chooseAction = (row, action) => {
    setChoice({ requestId: row.id, expectedStatus: row.status, action })
    setNote('')
    setConfirmText('')
    setMessage('')
    setError('')
  }

  const review = async (event) => {
    event.preventDefault()
    if (!choice || saving || confirmText !== CONFIRMATIONS[choice.action] || note.trim().length < 12) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const data = await adminFetch('/api/admin/privacy-deletions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: choice.requestId,
          expectedStatus: choice.expectedStatus,
          action: choice.action,
          note: note.trim(),
          confirmationCode: confirmText,
        }),
      })
      setMessage(data.message)
      setChoice(null)
      setNote('')
      setConfirmText('')
      await loadRequests()
    } catch (err) {
      setError(err?.message || 'Unable to save this review.')
    } finally {
      setSaving(false)
    }
  }

  const showHistory = async (id) => {
    if (historyId === id) { setHistoryId(null); return }
    setHistoryId(id)
    setHistory([])
    setHistoryLoading(true)
    setError('')
    try {
      const data = await adminFetch(`/api/admin/privacy-deletions?history=${encodeURIComponent(id)}`)
      setHistory(data.events || [])
    } catch (err) {
      setError(err?.message || 'Unable to load history.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const showSavedPreflight = async (requestId) => {
    if (preflightBusy) return
    setPreflightBusy(requestId)
    setError('')
    try {
      const data = await adminFetch(`/api/admin/privacy-deletion-preflight?requestId=${encodeURIComponent(requestId)}`)
      setPreflightByRequest(prev => ({ ...prev, [requestId]: data.run || null }))
      if (!data.run) setMessage('No safety check has been saved for this request yet.')
    } catch (err) {
      setError(err?.message || 'Unable to load the safety-check history.')
    } finally {
      setPreflightBusy('')
    }
  }

  const runPreflight = async (event, requestId) => {
    event.preventDefault()
    if (preflightBusy || preflightConfirm !== 'RUN SAFETY CHECK') return
    setPreflightBusy(requestId)
    setError('')
    setMessage('')
    try {
      const data = await adminFetch('/api/admin/privacy-deletion-preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, confirmationText: preflightConfirm }),
      })
      setPreflightByRequest(prev => ({ ...prev, [requestId]: data.run }))
      setMessage(data.message || 'Safety preflight recorded. No deletion was performed.')
      setPreflightTarget(null)
      setPreflightConfirm('')
    } catch (err) {
      setError(err?.message || 'Unable to run safety preflight.')
    } finally {
      setPreflightBusy('')
    }
  }

  const total = result.count || 0
  const totalPages = Math.max(1, Math.ceil(total / (result.pageSize || 30)))

  return (
    <section className="space-y-5 text-neutral-100">
      <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-300">Account privacy</p>
        <h2 className="mt-2 text-xl font-bold text-white">Deletion request review</h2>
        <p className="mt-2 text-xs leading-6 text-neutral-300">
          Review verified restaurant-owner requests. Approval is NOT permission to execute deletion.
          Run the new safety preflight to identify blockers before designing the deletion processor.
          <strong> No accounts, wallet balances, staff records, orders or payment records are removed here.</strong>
        </p>
        <p className="mt-2 text-xs leading-5 text-orange-200">
          Before approval, check ownership succession, active orders, outstanding settlements and lawful retention obligations.
          Do not place sensitive customer details, passwords, OTPs or identity documents in review notes.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-neutral-300" htmlFor="privacy-deletion-filter">Filter</label>
        <select
          id="privacy-deletion-filter"
          value={status}
          onChange={event => { setStatus(event.target.value); setPage(0); setChoice(null); setHistoryId(null) }}
          className="min-h-11 rounded-xl border border-neutral-700 bg-neutral-900 px-3 text-sm text-white"
        >
          {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" onClick={loadRequests} disabled={loading || saving}
          className="min-h-11 rounded-xl border border-neutral-700 bg-neutral-900 px-4 text-xs font-bold text-neutral-100 disabled:opacity-50">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <span className="ml-auto text-xs text-neutral-400">{total} matching requests</span>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</p>}

      {loading ? <p className="py-12 text-center text-sm text-neutral-400">Loading deletion requests…</p> : !result.items?.length ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-400">
          No requests in this view.
        </div>
      ) : <div className="space-y-3">
        {result.items.map(row => {
          const business = row.restaurantIds.map(id => result.restaurantNames?.[id] || id).join(' · ')
          const actions = availableActions(row.status)
          return (
            <article key={row.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">{business || 'Owner account'}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-neutral-400">Request: {row.id}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-neutral-500">Auth user: {row.authUserId}</p>
                </div>
                <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-200">
                  {LABELS[row.status] || row.status}
                </span>
              </div>
              <p className="mt-3 text-xs text-neutral-400">Requested: {formatDate(row.requestedAt)} · Last change: {formatDate(row.updatedAt)}</p>
              {row.reviewedBy && <p className="mt-1 text-xs text-neutral-500">Reviewed by: {row.reviewedBy}</p>}
              {row.reviewNotes && <p className="mt-2 break-words rounded-lg bg-neutral-950 p-3 text-xs leading-5 text-neutral-300">Latest review note: {row.reviewNotes}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {actions.map(action => (
                  <button key={action} type="button" disabled={saving} onClick={() => chooseAction(row, action)}
                    className={`min-h-10 rounded-xl border px-4 text-xs font-bold disabled:opacity-40 ${action === 'reject' ? 'border-red-500/35 bg-red-500/10 text-red-200' : 'border-orange-500/30 bg-orange-500/15 text-orange-100'}`}>
                    {ACTION_LABELS[action]}
                  </button>
                ))}
                <button type="button" onClick={() => showHistory(row.id)}
                  className="min-h-10 rounded-xl border border-neutral-700 px-4 text-xs font-semibold text-neutral-300">
                  {historyId === row.id ? 'Hide history' : 'Review history'}
                </button>
                {['in_review', 'approved'].includes(row.status) && (
                  <button type="button" onClick={() => { setPreflightTarget(preflightTarget === row.id ? null : row.id); setPreflightConfirm('') }}
                    disabled={Boolean(preflightBusy)}
                    className="min-h-10 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 text-xs font-bold text-sky-200 disabled:opacity-50">
                    {preflightTarget === row.id ? 'Close safety check' : 'Run safety preflight'}
                  </button>
                )}
                <button type="button" onClick={() => showSavedPreflight(row.id)} disabled={Boolean(preflightBusy)}
                  className="min-h-10 rounded-xl border border-neutral-700 px-4 text-xs font-semibold text-neutral-300 disabled:opacity-50">
                  {preflightBusy === row.id ? 'Checking…' : 'Latest safety result'}
                </button>
              </div>

              {preflightTarget === row.id && (
                <form onSubmit={event => runPreflight(event, row.id)}
                  className="mt-4 rounded-xl border border-sky-500/35 bg-neutral-950 p-4">
                  <h3 className="text-sm font-bold text-white">Non-destructive safety assessment</h3>
                  <p className="mt-2 text-xs leading-5 text-neutral-400">
                    This saves an audit report of current account ownership and wallet conditions.
                    It does not delete, suspend, transfer, or anonymize anything, and is not authorization to execute deletion.
                  </p>
                  <label htmlFor={`preflight-confirm-${row.id}`} className="mt-3 block text-xs font-semibold text-neutral-300">
                    Type RUN SAFETY CHECK
                  </label>
                  <input id={`preflight-confirm-${row.id}`} value={preflightConfirm}
                    onChange={event => setPreflightConfirm(event.target.value)} autoComplete="off"
                    className="mt-2 h-11 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 text-base text-white sm:text-sm" />
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={Boolean(preflightBusy)} onClick={() => { setPreflightTarget(null); setPreflightConfirm('') }}
                      className="min-h-11 flex-1 rounded-xl border border-neutral-700 text-xs font-bold text-neutral-300">Cancel</button>
                    <button type="submit" disabled={Boolean(preflightBusy) || preflightConfirm !== 'RUN SAFETY CHECK'}
                      className="min-h-11 flex-1 rounded-xl bg-sky-700 text-xs font-bold text-white disabled:opacity-40">
                      {preflightBusy === row.id ? 'Checking…' : 'Save safety report'}
                    </button>
                  </div>
                </form>
              )}

              {Object.prototype.hasOwnProperty.call(preflightByRequest, row.id) && preflightByRequest[row.id] && (
                <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-950 p-4">
                  <h3 className="text-sm font-semibold text-white">Latest preflight: {preflightByRequest[row.id].outcome === 'blocked' ? 'Blocked' : 'Manual review required'}</h3>
                  <p className="mt-1 text-xs text-neutral-400">
                    {formatDate(preflightByRequest[row.id].checkedAt)} · {preflightByRequest[row.id].restaurantCount} restaurant(s) · {preflightByRequest[row.id].walletCount} wallet(s)
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    Wallets with remaining balance: {preflightByRequest[row.id].walletsWithBalance}; with pending fees: {preflightByRequest[row.id].walletsWithPendingFees}
                  </p>
                  <div className="mt-3 space-y-2">
                    {(preflightByRequest[row.id].findings || []).map((finding, index) => (
                      <p key={`${finding.code}-${index}`} className={`rounded-lg border p-3 text-xs leading-5 ${finding.severity === 'blocker' ? 'border-red-500/25 bg-red-500/10 text-red-100' : 'border-amber-500/25 bg-amber-500/10 text-amber-100'}`}>
                        <strong>{finding.severity === 'blocker' ? 'Blocked' : 'Manual review'} — {finding.code}:</strong> {finding.explanation}
                      </p>
                    ))}
                  </div>
                  <p className="mt-3 text-xs font-semibold text-orange-200">This report never means the account is safe to delete. No deletion was performed.</p>
                </div>
              )}

              {choice?.requestId === row.id && (
                <form onSubmit={review} className="mt-4 rounded-xl border border-orange-500/30 bg-neutral-950 p-4">
                  <h3 className="text-sm font-bold text-white">Confirm: {ACTION_LABELS[choice.action]}</h3>
                  <p className="mt-1 text-xs text-neutral-400">
                    {choice.action === 'approve'
                      ? 'Approval does not delete the user. A separate verified execution process will be required.'
                      : 'This decision will change only the review status and record an audit event.'}
                  </p>
                  <label className="mt-3 block text-xs font-semibold text-neutral-300" htmlFor="deletion-review-note">Reason / review notes (12–2,000 characters)</label>
                  <textarea id="deletion-review-note" value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={3} required
                    placeholder="Summarize ownership, outstanding obligations, and why this decision is appropriate."
                    className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-base text-white outline-none focus:border-orange-500 sm:text-sm" />
                  <label className="mt-3 block text-xs font-semibold text-neutral-300" htmlFor="deletion-review-confirm">
                    Type {CONFIRMATIONS[choice.action]} to confirm
                  </label>
                  <input id="deletion-review-confirm" value={confirmText} onChange={event => setConfirmText(event.target.value)} autoComplete="off"
                    className="mt-2 h-11 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 text-base text-white outline-none sm:text-sm" />
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setChoice(null)} disabled={saving}
                      className="min-h-11 rounded-xl border border-neutral-700 text-xs font-bold text-neutral-300">Cancel</button>
                    <button type="submit" disabled={saving || note.trim().length < 12 || confirmText !== CONFIRMATIONS[choice.action]}
                      className="min-h-11 rounded-xl bg-orange-600 text-xs font-bold text-white disabled:opacity-40">
                      {saving ? 'Saving…' : 'Save decision'}
                    </button>
                  </div>
                </form>
              )}

              {historyId === row.id && (
                <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-950 p-4">
                  <h3 className="text-xs font-bold text-white">Review history</h3>
                  {historyLoading ? <p className="mt-2 text-xs text-neutral-400">Loading…</p> : history.length === 0 ? (
                    <p className="mt-2 text-xs text-neutral-400">No review decisions recorded yet.</p>
                  ) : history.map(item => (
                    <div key={item.id} className="mt-3 border-t border-neutral-800 pt-3 text-xs text-neutral-300">
                      <p className="font-semibold">{item.previous_status} → {item.next_status}</p>
                      <p className="mt-1 text-neutral-500">{formatDate(item.created_at)} · {item.actor_email}</p>
                      <p className="mt-1 break-words leading-5">{item.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>}

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => { setPage(value => Math.max(0, value - 1)); setChoice(null) }} disabled={page === 0 || loading}
          className="min-h-10 rounded-xl border border-neutral-700 px-4 text-xs font-bold text-neutral-200 disabled:opacity-30">Previous</button>
        <span className="text-xs text-neutral-400">Page {page + 1} of {totalPages}</span>
        <button type="button" onClick={() => { setPage(value => value + 1); setChoice(null) }} disabled={page + 1 >= totalPages || loading}
          className="min-h-10 rounded-xl border border-neutral-700 px-4 text-xs font-bold text-neutral-200 disabled:opacity-30">Next</button>
      </div>
    </section>
  )
}