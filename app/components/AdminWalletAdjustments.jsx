'use client'

import { useCallback, useEffect, useState } from 'react'

const money = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateUTC = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC` : '—'
}

// Add <AdminWalletAdjustments restaurantId={selectedRestaurantId} onAdjusted={refreshWallet} />
// to the existing Super Admin wallet page. The UI never sends actor name/email.
export default function AdminWalletAdjustments({ restaurantId, onAdjusted }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [actorEmail, setActorEmail] = useState('')
  const [wallet, setWallet] = useState(null)
  const [adjustments, setAdjustments] = useState([])
  const [kind, setKind] = useState('credit')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [referenceNote, setReferenceNote] = useState('')
  const [proof, setProof] = useState(null)
  const [proofInputKey, setProofInputKey] = useState(0)

  const refresh = useCallback(async () => {
    if (!restaurantId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/wallet-adjustments?restaurantId=${encodeURIComponent(restaurantId)}`, {
        credentials: 'same-origin', cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load wallet.')
      setActorEmail(data.actorEmail || '')
      setWallet(data.wallet || null)
      setAdjustments(Array.isArray(data.adjustments) ? data.adjustments : [])
      setError('')
    } catch (err) { setError(err?.message || 'Unable to load wallet.') }
    finally { setLoading(false) }
  }, [restaurantId])

  useEffect(() => { void refresh() }, [refresh])

  async function submit(event) {
    event.preventDefault()
    if (!proof) { setError('Attach a proof file before saving.'); return }
    if (!reason.trim() || reason.trim().length < 12) { setError('Give a reason of at least 12 characters.'); return }
    const message = `Confirm ${kind} of ₹${amount} for this restaurant? This action will be recorded under your admin login.`
    if (!window.confirm(message)) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const form = new FormData()
      form.append('restaurantId', restaurantId)
      form.append('kind', kind)
      form.append('amountRupees', amount)
      form.append('reason', reason.trim())
      form.append('referenceNote', referenceNote.trim())
      form.append('proof', proof)
      const response = await fetch('/api/admin/wallet-adjustments', {
        method: 'POST', credentials: 'same-origin', body: form,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data?.message || 'Unable to adjust wallet.')
      setNotice(data.message || 'Wallet adjustment recorded.')
      setAmount('')
      setReason('')
      setReferenceNote('')
      setProof(null)
      setProofInputKey((value) => value + 1)
      await refresh()
      if (typeof onAdjusted === 'function') onAdjusted(data)
    } catch (err) { setError(err?.message || 'Wallet adjustment failed.') }
    finally { setSaving(false) }
  }

  async function openProof(adjustmentId) {
    try {
      const response = await fetch(`/api/admin/wallet-adjustments?restaurantId=${encodeURIComponent(restaurantId)}&proofId=${encodeURIComponent(adjustmentId)}`, {
        credentials: 'same-origin', cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok || !data.success || !data.url) throw new Error(data.message || 'Unable to open proof.')
      // In-app click opens a temporary signed URL, never the private bucket URL.
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (err) { setError(err?.message || 'Unable to open proof.') }
  }

  return (
    <section className="rounded-3xl border border-neutral-700 bg-neutral-950 p-4 text-neutral-100 shadow-sm sm:p-6" aria-label="Admin wallet adjustment">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Super Admin · Evidence required</p>
          <h2 className="mt-1 text-xl font-black">Adjust wallet balance</h2>
          <p className="mt-1 text-xs text-neutral-300">Every manual credit or debit is recorded with proof and the signed-in admin identity.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading || saving} className="rounded-xl border border-neutral-700 px-3 py-2 text-xs font-bold">Refresh</button>
      </div>
      <div className="mt-4 rounded-2xl bg-neutral-900 p-4 text-sm">
        <p><strong>Signed in as:</strong> {actorEmail || 'Checking admin session...'}</p>
        <p className="mt-2"><strong>Current balance:</strong> {wallet ? money(wallet.balance_paise) : '—'}</p>
        <p className="mt-1 text-xs text-neutral-400">Pending fees: {money(wallet?.pending_fee_paise)} · Spendable: {money(Number(wallet?.balance_paise || 0) - Number(wallet?.pending_fee_paise || 0))}</p>
      </div>
      <form onSubmit={submit} className="mt-5 grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold">Action
            <select value={kind} onChange={(event) => setKind(event.target.value)} required className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-900 text-white p-3 text-sm">
              <option value="credit">Add balance (credit)</option><option value="debit">Reduce balance (debit)</option>
            </select>
          </label>
          <label className="text-xs font-bold">Amount (₹)
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,2})?" placeholder="500.00" required className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-900 text-white p-3 text-sm" />
          </label>
        </div>
        <label className="text-xs font-bold">Reason (mandatory)
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} minLength={12} maxLength={1000} required placeholder="Why is this manual wallet adjustment required?" className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-900 text-white p-3 text-sm" />
        </label>
        <label className="text-xs font-bold">Reference / receipt number (optional)
          <input value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} maxLength={120} className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-900 text-white p-3 text-sm" />
        </label>
        <label className="text-xs font-bold">Upload proof (mandatory, max 5 MB)
          <input key={proofInputKey} type="file" accept="application/pdf,image/jpeg,image/png" required
            onChange={(event) => setProof(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-xl border border-neutral-300 p-3 text-xs" />
        </label>
        {error && <p className="rounded-xl bg-red-950/50 p-3 text-xs font-bold text-red-300" role="alert">{error}</p>}
        {notice && <p className="rounded-xl bg-emerald-950/50 p-3 text-xs font-bold text-emerald-200" role="status">{notice}</p>}
        <button type="submit" disabled={!wallet || !actorEmail || saving || loading}
          className="rounded-2xl bg-emerald-700 px-5 py-3.5 text-sm font-black text-white disabled:opacity-50">
          {saving ? 'Recording adjustment...' : 'Review and save audited adjustment'}
        </button>
      </form>
      <div className="mt-7">
        <h3 className="text-sm font-black">Adjustment history</h3>
        <div className="mt-3 space-y-2">
          {adjustments.length === 0 && <p className="text-xs text-neutral-400">No manual adjustments recorded yet.</p>}
          {adjustments.map((item) => (
            <article key={item.id} className="rounded-2xl border border-neutral-700 p-3 text-xs">
              <div className="flex justify-between gap-3">
                <strong className={item.adjustment_kind === 'credit' ? 'text-emerald-300' : 'text-red-300'}>
                  {item.adjustment_kind === 'credit' ? '+' : '−'}{money(item.amount_paise)}
                </strong>
                <span className="text-neutral-400">{dateUTC(item.created_at)}</span>
              </div>
              <p className="mt-2"><strong>Admin:</strong> {item.actor_email}</p>
              <p className="mt-1"><strong>Reason:</strong> {item.reason}</p>
              {item.reference_note && <p className="mt-1"><strong>Reference:</strong> {item.reference_note}</p>}
              <p className="mt-1">Before {money(item.balance_before_paise)} → After {money(item.balance_after_paise)}</p>
              <button type="button" onClick={() => void openProof(item.id)} className="mt-2 font-bold text-emerald-300 underline">View proof</button>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
