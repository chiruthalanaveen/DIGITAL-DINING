'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

function statusText(value) {
  const labels = {
    pending_review: 'Pending review',
    in_review: 'Under review',
    approved: 'Approved for processing',
    rejected: 'Closed after review',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return labels[value] || 'Request recorded'
}

async function callOwnerRequest(method, body) {
  const { data, error } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (error || !token) throw new Error('Please sign in to your restaurant owner account first.')

  const response = await fetch('/api/privacy/deletion-requests', {
    method,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.success !== true) {
    throw new Error(result.message || 'Could not process your deletion request.')
  }
  return result
}

export default function OwnerDeletionRequestClient() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [currentRequest, setCurrentRequest] = useState(null)
  const [understandsReview, setUnderstandsReview] = useState(false)
  const [confirmationText, setConfirmationText] = useState('')

  useEffect(() => {
    let active = true
    callOwnerRequest('GET')
      .then(result => { if (active) setCurrentRequest(result.request || null) })
      .catch(error => { if (active) setMessage(error?.message || 'Request status unavailable.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const submitRequest = async event => {
    event.preventDefault()
    if (saving) return
    setMessage('')
    setSaving(true)
    try {
      const result = await callOwnerRequest('POST', { confirmationText, understandsReview })
      setCurrentRequest(result.request)
      setMessage(result.alreadyRequested ? 'You already have an active deletion request.' : 'Your verified request has been recorded for manual review.')
      setConfirmationText('')
      setUnderstandsReview(false)
    } catch (error) {
      setMessage(error?.message || 'Unable to submit request.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50/60 p-4 sm:p-5">
      <h2 className="text-base font-bold text-slate-900">Restaurant owner: secure request</h2>
      <p className="mt-2 text-xs leading-6 text-slate-700">
        Sign in to your owner account before submitting. The server verifies account ownership using Supabase Auth.
        This form records a request; it does not automatically close your business or erase orders, staff, wallet, or payment history.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">Checking your account…</p>
      ) : currentRequest && ['pending_review', 'in_review', 'approved'].includes(currentRequest.status) ? (
        <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-white p-4 text-sm text-emerald-800">
          <p className="font-bold">{statusText(currentRequest.status)}</p>
          <p className="mt-1 text-xs">Request reference: {currentRequest.id}</p>
          <p className="mt-1 text-xs">Your account remains active during review.</p>
        </div>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={submitRequest}>
          <label className="flex items-start gap-3 text-xs leading-5 text-slate-700">
            <input
              type="checkbox"
              checked={understandsReview}
              onChange={event => setUnderstandsReview(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-orange-600"
              required
            />
            <span>I understand that this starts a verified review, that final deletion may require reauthentication, and that some transaction records may legally need to be retained.</span>
          </label>
          <div>
            <label htmlFor="deletion-confirm" className="block text-xs font-semibold text-slate-700">Type DELETE MY ACCOUNT to submit a request</label>
            <input
              id="deletion-confirm"
              type="text"
              value={confirmationText}
              onChange={event => setConfirmationText(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="DELETE MY ACCOUNT"
              className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-orange-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving || !understandsReview || confirmationText !== 'DELETE MY ACCOUNT'}
            className="min-h-12 w-full rounded-xl bg-red-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Submitting…' : 'Request account deletion review'}
          </button>
        </form>
      )}

      {message && <p role="status" className="mt-3 text-xs leading-5 text-slate-700">{message}</p>}
      <p className="mt-4 text-xs text-slate-600">
        <Link href="/login" className="font-semibold text-orange-700 underline">Website owner sign-in</Link>
        {' · '}
        <Link href="/app/owner" className="font-semibold text-orange-700 underline">Mobile owner sign-in</Link>
      </p>
    </div>
  )
}