'use client'

import { useCallback, useEffect, useState } from 'react'

const rupees = (paise) =>
  `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const dateTimeIST = (value) => {
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
    hour12: true,
  })
}

export default function ManagerWalletReadOnly({ restaurantId, sessionToken }) {
  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async (signal, silent = false) => {
    if (!restaurantId || !sessionToken) {
      setLoading(false)
      setWallet(null)
      setError('Sign in to your manager account to view the wallet.')
      return
    }

    if (!silent) setLoading(true)
    try {
      const response = await fetch(
        `/api/manager/wallet?restaurantId=${encodeURIComponent(restaurantId)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${sessionToken}` },
          cache: 'no-store',
          signal,
        }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Unable to load wallet.')
      }
      if (signal?.aborted) return
      setWallet(data.wallet || null)
      setTransactions(Array.isArray(data.transactions) ? data.transactions : [])
      setError('')
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted) return
      if (!silent) setWallet(null)
      setError(err?.message || 'Unable to load wallet.')
    } finally {
      if (!signal?.aborted && !silent) setLoading(false)
    }
  }, [restaurantId, sessionToken])

  useEffect(() => {
    const controller = new AbortController()
    setWallet(null)
    setTransactions([])
    void load(controller.signal)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load(controller.signal, true)
      }
    }, 60000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [load])

  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 text-white shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">
            Platform wallet · Manager view
          </p>
          <h2 className="mt-1 text-xl font-black">Wallet Balance & Daily Fees</h2>
          <p className="mt-1 text-xs text-neutral-400">
            Read-only. Only the business owner can recharge; Super Admin controls fee settings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(undefined, false)}
          disabled={loading}
          className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-bold text-neutral-200 hover:border-orange-500 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </p>
      )}

      {wallet && (
        <>
          {wallet.lowBalance && (
            <div role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-black text-amber-300">⚠️ Wallet balance is low</p>
              <p className="mt-1 text-xs text-amber-100/80">
                Spendable balance is at or below {rupees(wallet.thresholdPaise)}. Contact the owner to recharge.
              </p>
            </div>
          )}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Wallet balance', rupees(wallet.balancePaise), 'text-emerald-400'],
              ['Pending platform fees', rupees(wallet.pendingFeesPaise), 'text-amber-400'],
              ['Spendable balance', rupees(wallet.spendablePaise), wallet.lowBalance ? 'text-red-400' : 'text-white'],
              ['Fees deducted today', rupees(wallet.todayDebitsPaise), 'text-rose-400'],
              ['Per delivered order', rupees(wallet.platformFeePaise), 'text-orange-400'],
            ].map(([label, amount, color]) => (
              <div key={label} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
                <p className={`mt-2 text-xl font-black ${color}`}>{amount}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-400">
              Blocking threshold: <strong className="text-white">{rupees(wallet.thresholdPaise)}</strong>
              {' '}· Daily settlement planned for 11:00 PM IST
            </p>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="text-xs font-black text-orange-400 hover:text-orange-300"
            >
              {expanded ? 'Hide transactions' : 'View wallet transactions'}
            </button>
          </div>

          {expanded && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-800">
              <table className="w-full min-w-[590px] text-left text-xs">
                <thead className="bg-neutral-950 text-neutral-400">
                  <tr>
                    <th className="px-4 py-3">Date (IST)</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length ? transactions.map((item) => (
                    <tr key={item.id} className="border-t border-neutral-800">
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-300">{dateTimeIST(item.createdAt)}</td>
                      <td className="px-4 py-3 text-neutral-200">
                        <span className="font-bold capitalize">{String(item.type || 'transaction').replaceAll('_', ' ')}</span>
                        {item.description ? <span className="block text-[10px] text-neutral-500">{item.description}</span> : null}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-black ${item.isDebit === true || ['platform_fee_debit', 'admin_debit'].includes(item.type) ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {item.isDebit === true || ['platform_fee_debit', 'admin_debit'].includes(item.type) ? '−' : '+'}{rupees(item.amountPaise)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-neutral-300">{rupees(item.balanceAfterPaise)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-500">No wallet transactions yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
