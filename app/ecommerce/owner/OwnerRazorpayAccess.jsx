'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const STATUS_LABELS = {
  pending: 'Waiting for Super Admin',
  approved: 'Approved',
  rejected: 'Rejected',
  consumed: 'Used',
  revoked: 'Revoked',
  expired: 'Expired',
}

function displayDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

async function getCurrentToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) {
    throw new Error('Your login has expired. Please sign in again.')
  }
  return data.session.access_token
}

export default function OwnerRazorpayAccess({ storeId, accessToken }) {
  const [reason, setReason] = useState('')
  const [requests, setRequests] = useState([])
  const [keyId, setKeyId] = useState('')
  const [keySecret, setKeySecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async (signal) => {
    if (!storeId || !accessToken) return
    setLoading(true)
    try {
      const token = await getCurrentToken()
      if (signal?.aborted) return
      const response = await fetch(
        `/api/ecommerce/owner/razorpay/access-request?storeId=${encodeURIComponent(storeId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal,
        }
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not load access requests.')
      }
      if (!signal?.aborted) {
        setRequests(Array.isArray(result.requests) ? result.requests : [])
        setNow(Date.now())
        setError('')
      }
    } catch (err) {
      if (err?.name !== 'AbortError' && !signal?.aborted) {
        setError(err?.message || 'Could not load access requests.')
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [storeId, accessToken])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const pending = requests.some(item => item.status === 'pending')
  const activeApproval = requests.find(item =>
    item.status === 'approved' &&
    item.expires_at &&
    Date.parse(item.expires_at) > now
  )
  const remainingSeconds = activeApproval
    ? Math.max(0, Math.ceil((Date.parse(activeApproval.expires_at) - now) / 1000))
    : 0
  const remainingTime = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`
  const validKeyId = /^rzp_(test|live)_[A-Za-z0-9]{8,140}$/.test(keyId.trim())
  const validSecret = keySecret.length >= 10 && keySecret.length <= 500

  async function submitRequest(event) {
    event.preventDefault()
    if (submitting || pending || activeApproval) return
    const cleanReason = reason.trim()
    if (cleanReason.length < 10 || cleanReason.length > 1000) {
      setError('Enter a reason between 10 and 1000 characters.')
      return
    }
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const token = await getCurrentToken()
      const response = await fetch('/api/ecommerce/owner/razorpay/access-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ storeId, reason: cleanReason }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not submit request.')
      }
      setReason('')
      setNotice('Request sent to Super Admin.')
      await load()
    } catch (err) {
      setError(err?.message || 'Could not submit request.')
    } finally {
      setSubmitting(false)
    }
  }

  async function saveCredentials(event) {
    event.preventDefault()
    if (saving || !activeApproval || !validKeyId || !validSecret) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const token = await getCurrentToken()
      const response = await fetch('/api/ecommerce/owner/razorpay/credential-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storeId,
          requestId: activeApproval.id,
          keyId: keyId.trim(),
          keySecret,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Could not save credentials.')
      }
      setKeyId('')
      setKeySecret('')
      setShowSecret(false)
      setNotice('Razorpay credentials saved securely. Your one-time approval has been used.')
      await load()
    } catch (err) {
      setError(err?.message || 'Could not save credentials.')
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-5 text-white">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-red-400">
          E-Commerce / Payment Settings
        </p>
        <h2 className="mt-2 text-2xl font-black">Razorpay Settings</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Super Admin approval is required to update this website's Razorpay credentials.
          Approval is valid for one save within 30 minutes.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}

      {activeApproval && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="font-bold text-emerald-300">Permission approved</p>
          <p className="mt-1 text-sm text-neutral-300">
            Time remaining: <strong>{remainingTime}</strong> · Expires {displayDate(activeApproval.expires_at)}
          </p>
        </div>
      )}

      {activeApproval && (
        <form onSubmit={saveCredentials} className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="text-lg font-bold">Save Razorpay credentials</h3>
          <p className="text-xs text-neutral-400">
            Enter credentials for this store only. The Key Secret is sent to the server
            over HTTPS, encrypted before storage, and never shown again.
          </p>
          <div>
            <label htmlFor="ecommerce-razorpay-key-id" className="block text-sm font-semibold">Razorpay Key ID</label>
            <input
              id="ecommerce-razorpay-key-id"
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={150}
              value={keyId}
              onChange={event => setKeyId(event.target.value)}
              placeholder="rzp_test_... or rzp_live_..."
              disabled={saving}
              required
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-sm outline-none focus:border-red-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="ecommerce-razorpay-key-secret" className="block text-sm font-semibold">Razorpay Key Secret</label>
            <div className="mt-2 flex gap-2">
              <input
                id="ecommerce-razorpay-key-secret"
                type={showSecret ? 'text' : 'password'}
                autoComplete="new-password"
                spellCheck={false}
                maxLength={500}
                value={keySecret}
                onChange={event => setKeySecret(event.target.value)}
                disabled={saving}
                required
                className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-sm outline-none focus:border-red-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowSecret(value => !value)}
                disabled={saving}
                className="rounded-xl border border-neutral-700 px-3 text-sm disabled:opacity-50"
              >
                {showSecret ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={saving || !validKeyId || !validSecret || !storeId}
            className="rounded-xl bg-red-600 px-5 py-3 text-sm font-bold hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving securely...' : 'Save credentials (use approval)'}
          </button>
        </form>
      )}

      <form onSubmit={submitRequest} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <label htmlFor="razorpay-request-reason" className="block text-sm font-bold">
          Reason for requesting Razorpay access
        </label>
        <textarea
          id="razorpay-request-reason"
          rows={4}
          maxLength={1000}
          value={reason}
          onChange={event => setReason(event.target.value)}
          placeholder="For example: I need to configure my business Razorpay account."
          disabled={submitting || pending || Boolean(activeApproval)}
          className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-sm text-white outline-none focus:border-red-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={submitting || pending || Boolean(activeApproval) || !storeId || !accessToken}
          className="mt-3 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : pending ? 'Request Pending' : activeApproval ? 'Access Approved' : 'Request Permission'}
        </button>
      </form>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold">Request History</h3>
          <button type="button" onClick={() => load()} disabled={loading} className="text-xs font-bold text-red-300 disabled:opacity-50">
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {requests.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">No requests yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {requests.map(item => (
              <article key={item.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{STATUS_LABELS[item.status] || item.status}</strong>
                  <span className="text-xs text-neutral-400">{displayDate(item.created_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-xs text-neutral-300">{item.reason}</p>
                {item.decision_note && <p className="mt-2 text-xs text-neutral-400">Admin note: {item.decision_note}</p>}
                {item.expires_at && <p className="mt-2 text-xs text-neutral-400">Expires: {displayDate(item.expires_at)}</p>}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}