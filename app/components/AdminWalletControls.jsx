'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminWalletAdjustments from '@/app/components/AdminWalletAdjustments'

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
})

function money(paise) {
  return INR.format(Number(paise || 0) / 100)
}

function rupeesInput(paise) {
  return (Number(paise || 0) / 100).toFixed(2)
}

function readableDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN')
}

function WalletEditor({ store, onCancel, onSaved }) {
  const [fee, setFee] = useState(rupeesInput(store.platformFeePaise))
  const [restaurantFee, setRestaurantFee] = useState(rupeesInput(store.restaurantPlatformFeePaise ?? 500))
  const [threshold, setThreshold] = useState(rupeesInput(store.thresholdPaise))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (event) => {
    event.preventDefault()
    if (saving) return
    const numberPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/
    if (!numberPattern.test(fee) || !numberPattern.test(restaurantFee) || !numberPattern.test(threshold)) {
      setError('Enter valid ₹ amounts with at most two decimal places.')
      return
    }
    if (Number(fee) > 1000 || Number(restaurantFee) > 1000 || Number(threshold) > 1000000) {
      setError('Maximum per-order fee ₹1,000; maximum threshold ₹10,00,000.')
      return
    }

    if (!window.confirm(
      `Save wallet settings for ${store.restaurantName}?\n\n` +
      `Delivery fee per delivered order: ₹${fee}\n` +
      `Restaurant fee per placed order: ₹${restaurantFee}\n` +
      `Low-balance block threshold: ₹${threshold}\n\n` +
      'Fee changes apply to future restaurant and delivered delivery orders. Existing fee records remain unchanged.'
    )) return

    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/admin/wallet-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          restaurantId: store.restaurantId,
          platformFeeRupees: fee,
          restaurantFeeRupees: restaurantFee,
          thresholdRupees: threshold,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success !== true) {
        throw new Error(result.message || 'Unable to save wallet settings.')
      }
      onSaved(result)
    } catch (saveError) {
      setError(saveError.message || 'Unable to save wallet settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="mt-4 rounded-2xl border border-red-500/30 bg-neutral-950 p-4 space-y-4">
      <p className="text-sm font-black text-white">Configure {store.restaurantName}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-[11px] font-bold text-neutral-300">Delivery fee per delivered order (₹)</span>
          <input
            type="number" inputMode="decimal" min="0" max="1000" step="0.01" required
            value={fee} onChange={(event) => setFee(event.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white outline-none focus:border-red-500"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold text-neutral-300">Restaurant fee per placed order (₹)</span>
          <input
            type="number" inputMode="decimal" min="0" max="1000" step="0.01" required
            value={restaurantFee} onChange={(event) => setRestaurantFee(event.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white outline-none focus:border-red-500"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold text-neutral-300">Order-block threshold (₹)</span>
          <input
            type="number" inputMode="decimal" min="0" max="1000000" step="0.01" required
            value={threshold} onChange={(event) => setThreshold(event.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white outline-none focus:border-red-500"
          />
        </label>
      </div>
      <p className="text-[11px] leading-5 text-neutral-400">
        Spendable balance = wallet balance − outstanding restaurant and delivery platform fees.
        The configured threshold already applies to QR and delivery orders. The minimum owner recharge remains {money(store.minimumTopupPaise)}.
      </p>
      {error && <p className="text-xs font-bold text-red-400" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit" disabled={saving}
          className="rounded-xl bg-red-600 px-5 py-3 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Wallet Settings'}
        </button>
        <button
          type="button" onClick={onCancel} disabled={saving}
          className="rounded-xl border border-neutral-700 bg-neutral-800 px-5 py-3 text-xs font-bold text-neutral-200"
        >Cancel</button>
      </div>
    </form>
  )
}

export default function AdminWalletControls() {
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editId, setEditId] = useState('')
  const [adjustId, setAdjustId] = useState('')

  const refresh = useCallback(() => setReload((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let live = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({
          page: String(page), pageSize: '20', search,
        })
        const response = await fetch(`/api/admin/wallet-settings?${params}`, {
          cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || result.success !== true) {
          throw new Error(result.message || 'Unable to load wallets.')
        }
        if (live) setData(result)
      } catch (loadError) {
        if (loadError.name === 'AbortError') return
        if (live) setError(loadError.message || 'Unable to load wallet controls.')
      } finally {
        if (live) setLoading(false)
      }
    }
    load()
    return () => { live = false; controller.abort() }
  }, [page, reload, search])

  const stores = Array.isArray(data?.stores) ? data.stores : []
  const totalPages = Math.max(1, Math.ceil((data?.totalCount || 0) / 20))

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">Super Admin / Wallet Settings</p>
          <h1 className="mt-1 text-2xl font-black text-white">Restaurant Wallet Controls</h1>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-neutral-400">
            Set delivery and restaurant per-order fees independently, plus the shared wallet blocking threshold for each business.
            Changing these settings does not credit, debit or settle a wallet.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={loading}
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">
          {loading ? 'Loading...' : 'Refresh Wallets'}
        </button>
      </div>

      <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 text-xs text-orange-200">
        Default fees: <strong>₹5 per delivered delivery order</strong> and <strong>₹5 per placed restaurant order</strong>. Default threshold: <strong>₹500</strong>.
        Existing delivery/restaurant fee records keep their original amounts.
      </div>

      <form onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchDraft.trim()); setEditId('') }} className="flex flex-wrap gap-2">
        <input
          value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search by restaurant name" maxLength={100}
          className="min-w-[200px] flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-white outline-none focus:border-red-500"
        />
        <button type="submit" className="rounded-xl bg-red-600 px-5 py-3 text-xs font-black text-white">Search</button>
        {search && <button type="button" onClick={() => { setSearch(''); setSearchDraft(''); setPage(1) }} className="rounded-xl border border-neutral-700 px-4 py-3 text-xs font-bold text-neutral-300">Clear</button>}
      </form>

      {notice && <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-300" role="status">{notice}</p>}
      {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold text-red-300" role="alert">{error}</p>}

      {loading && !data ? <div className="py-10 text-center text-sm text-neutral-400">Loading store wallets...</div> : null}
      {!loading && stores.length === 0 && !error ? <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center text-xs text-neutral-400">No stores found.</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {stores.map((store) => (
          <article key={store.restaurantId} className="min-w-0 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="break-words text-base font-black text-white">{store.restaurantName}</h2>
                <p className="mt-1 break-all font-mono text-[10px] text-neutral-500">{store.restaurantCode || store.restaurantId}</p>
                <p className="mt-1 text-[10px] capitalize text-neutral-400">Registration: {store.approvalStatus}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${store.lowBalance ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                {store.lowBalance ? 'Low balance' : 'Balance OK'}
              </span>
            </div>

            {!store.walletExists ? (
              <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs text-red-300">Wallet missing. Verify the database wallet-creation trigger.</p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    ['Wallet balance', store.balancePaise],
                    ['Pending fees', store.pendingFeesPaise],
                    ['Spendable balance', store.spendablePaise],
                    ['Delivery fee / order', store.platformFeePaise],
                    ['Restaurant fee / order', store.restaurantPlatformFeePaise ?? 500],
                    ['Block threshold', store.thresholdPaise],
                    ['Minimum recharge', store.minimumTopupPaise],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                      <p className="text-[10px] text-neutral-500">{label}</p>
                      <p className="mt-1 text-sm font-black text-white">{money(value)}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] text-neutral-500">Updated: {readableDate(store.updatedAt)}</p>
                {editId === store.restaurantId ? (
                  <WalletEditor key={store.restaurantId} store={store} onCancel={() => setEditId('')} onSaved={(result) => {
                    setNotice(result.message || 'Wallet settings saved.')
                    setEditId('')
                    refresh()
                  }} />
                ) : (
                  <button type="button" onClick={() => { setEditId(store.restaurantId); setNotice('') }}
                    className="mt-4 w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-black text-red-300 hover:bg-red-500/20">
                    Edit Both Fees & Threshold
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAdjustId((current) => current === store.restaurantId ? '' : store.restaurantId)
                    setEditId('')
                    setNotice('')
                  }}
                  className="mt-3 w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-black text-emerald-200 hover:bg-emerald-500/20"
                >
                  {adjustId === store.restaurantId ? 'Close audited balance adjustment' : 'Adjust Balance · Admin + Proof Required'}
                </button>
                {adjustId === store.restaurantId && (
                  <div className="mt-4">
                    <AdminWalletAdjustments
                      restaurantId={store.restaurantId}
                      onAdjusted={() => {
                        setNotice(`Wallet adjustment recorded for ${store.restaurantName}.`)
                        refresh()
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-neutral-500">{data?.totalCount ?? 0} businesses · Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          <button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-xl border border-neutral-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-30">Previous</button>
          <button type="button" disabled={loading || page >= totalPages} onClick={() => setPage((value) => value + 1)}
            className="rounded-xl border border-neutral-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-30">Next</button>
        </div>
      </div>
    </section>
  )
}
