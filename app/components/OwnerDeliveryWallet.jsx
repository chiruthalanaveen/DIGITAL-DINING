'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const formatMoney = (paise) =>
  `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const formatWhen = (value) => {
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

async function getOwnerToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) {
    throw new Error('Owner session expired. Please sign in again.')
  }
  return data.session.access_token
}

async function parseResponse(response) {
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.success) {
    throw new Error(data?.message || `Wallet request failed (${response.status}).`)
  }
  return data
}

let razorpayScriptPromise = null
function ensureRazorpayScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Checkout is unavailable.'))
  if (window.Razorpay) return Promise.resolve()
  if (razorpayScriptPromise) return razorpayScriptPromise

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    const timeout = window.setTimeout(() => {
      script.remove()
      razorpayScriptPromise = null
      reject(new Error('Razorpay Checkout timed out. Please retry.'))
    }, 20000)
    script.onload = () => {
      window.clearTimeout(timeout)
      if (window.Razorpay) resolve()
      else {
        razorpayScriptPromise = null
        reject(new Error('Razorpay Checkout could not start.'))
      }
    }
    script.onerror = () => {
      window.clearTimeout(timeout)
      script.remove()
      razorpayScriptPromise = null
      reject(new Error('Razorpay Checkout failed to load. Check your connection.'))
    }
    document.body.appendChild(script)
  })
  return razorpayScriptPromise
}

export default function OwnerDeliveryWallet({ restaurantId }) {
  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('2000')
  const [expanded, setExpanded] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')

  const loadWallet = useCallback(async ({ silent = false } = {}) => {
    if (!restaurantId) return
    if (!silent) setLoading(true)
    try {
      const token = await getOwnerToken()
      const response = await fetch(
        `/api/owner/wallet?restaurantId=${encodeURIComponent(restaurantId)}`,
        {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      const data = await parseResponse(response)
      setWallet(data.wallet)
      setTransactions(Array.isArray(data.transactions) ? data.transactions : [])
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to load wallet.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [restaurantId])

  useEffect(() => {
    setWallet(null)
    setTransactions([])
    setLoading(true)
    void loadWallet()
  }, [loadWallet])

  const minimumRupees = useMemo(
    () => Math.ceil(Number(wallet?.minimumTopupPaise || 200000) / 100),
    [wallet?.minimumTopupPaise]
  )

  const recharge = async () => {
    if (busy || !wallet) return
    setNotice('')
    setErrorMessage('')

    const amountRupees = Number(amount)
    if (!Number.isSafeInteger(amountRupees) || amountRupees < minimumRupees || amountRupees > 500000) {
      setErrorMessage(`Enter a whole-rupee amount from ₹${minimumRupees.toLocaleString('en-IN')} to ₹5,00,000.`)
      return
    }

    setBusy(true)
    try {
      const token = await getOwnerToken()
      await ensureRazorpayScript()

      const createResponse = await fetch('/api/owner/wallet/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ restaurantId, amountRupees }),
      })
      const created = await parseResponse(createResponse)

      const checkout = new window.Razorpay({
        key: created.keyId,
        amount: created.amountPaise,
        currency: 'INR',
        name: 'Digital Dine-In',
        description: 'Delivery wallet recharge',
        order_id: created.razorpayOrderId,
        theme: { color: '#f97316' },
        handler: async (payment) => {
          try {
            const freshToken = await getOwnerToken()
            const verifyResponse = await fetch('/api/owner/wallet/verify-payment', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${freshToken}`,
              },
              body: JSON.stringify({
                restaurantId,
                topupId: created.topupId,
                razorpay_order_id: payment?.razorpay_order_id,
                razorpay_payment_id: payment?.razorpay_payment_id,
                razorpay_signature: payment?.razorpay_signature,
              }),
            })
            await parseResponse(verifyResponse)
            setNotice('Payment verified. Your wallet has been credited successfully.')
            setExpanded(true)
            await loadWallet({ silent: true })
          } catch (error) {
            setErrorMessage(
              `Payment confirmation needs attention: ${error?.message || 'Verification failed.'} Do not recharge again until verified by support.`
            )
          } finally {
            setBusy(false)
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      })

      checkout.on('payment.failed', (failure) => {
        setBusy(false)
        setErrorMessage(failure?.error?.description || 'Payment failed. Please retry.')
      })
      checkout.open()
    } catch (error) {
      setBusy(false)
      setErrorMessage(error?.message || 'Unable to start recharge.')
    }
  }

  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6 text-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-orange-400">Delivery Wallet</p>
          <h3 className="mt-1 text-xl font-black">Owner Wallet & Platform Fees</h3>
          <p className="mt-1 text-xs text-neutral-400">Daily platform-fee settlement is scheduled for 11:00 PM IST once enabled by Admin.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadWallet()}
          disabled={loading || busy}
          className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-bold text-neutral-200 hover:border-orange-500 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh Wallet'}
        </button>
      </div>

      {errorMessage && (
        <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{errorMessage}</p>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">{notice}</p>
      )}

      {wallet ? (
        <>
          {wallet.lowBalance && (
            <div role="alert" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-black text-amber-300">⚠️ Low Wallet Balance</p>
              <p className="mt-1 text-xs text-amber-100/80">
                Spendable balance is at or below {formatMoney(wallet.thresholdPaise)}. Recharge now.
                Customer-order blocking will be enforced after the order API is connected to wallet checks.
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Wallet Balance', formatMoney(wallet.balancePaise), 'text-emerald-400'],
              ['Pending Platform Fees', formatMoney(wallet.pendingFeesPaise), 'text-amber-400'],
              ['Spendable Balance', formatMoney(wallet.spendablePaise), wallet.lowBalance ? 'text-red-400' : 'text-white'],
              ['Fee Per Delivered Order', formatMoney(wallet.platformFeePaise), 'text-orange-400'],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
                <p className={`mt-2 text-xl font-black ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[175px] flex-1">
                <label htmlFor="wallet-topup-amount" className="block text-xs font-bold text-neutral-300">Recharge amount (₹)</label>
                <input
                  id="wallet-topup-amount"
                  type="number"
                  inputMode="numeric"
                  min={minimumRupees}
                  max="500000"
                  step="1"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={busy}
                  className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-bold text-white outline-none focus:border-orange-500"
                />
                <p className="mt-1 text-[10px] text-neutral-500">Minimum recharge: {formatMoney(wallet.minimumTopupPaise)}</p>
              </div>
              <button
                type="button"
                onClick={() => void recharge()}
                disabled={busy || loading}
                className="rounded-xl bg-orange-500 px-6 py-3 text-xs font-black text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Processing...' : 'Add Money via Razorpay'}
              </button>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <h4 className="text-sm font-black">Wallet Transaction History</h4>
            <button type="button" onClick={() => setExpanded((current) => !current)} className="text-xs font-bold text-orange-400">
              {expanded ? 'Hide History' : 'View History'}
            </button>
          </div>
          {expanded && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-800">
              <table className="w-full min-w-[580px] text-left text-xs">
                <thead className="bg-neutral-950 text-neutral-400">
                  <tr>
                    <th className="px-4 py-3">Date (IST)</th>
                    <th className="px-4 py-3">Transaction</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Balance After</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-neutral-500">No wallet transactions yet.</td></tr>
                  ) : (
                    transactions.map((transaction) => {
                      const credit = transaction.type === 'topup' || transaction.type === 'admin_credit'
                      return (
                        <tr key={transaction.id} className="border-t border-neutral-800">
                          <td className="px-4 py-3 text-neutral-300">{formatWhen(transaction.createdAt)}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold">{
                              transaction.type === 'platform_fee_debit' ? 'Daily Platform Fee' :
                                transaction.type === 'topup' ? 'Razorpay Recharge' :
                                  transaction.type === 'admin_credit' ? 'Admin Credit' : 'Admin Debit'
                            }</p>
                            {transaction.description && <p className="mt-1 text-[10px] text-neutral-500">{transaction.description}</p>}
                          </td>
                          <td className={`px-4 py-3 text-right font-black ${credit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {credit ? '+' : '−'}{formatMoney(transaction.amountPaise)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{formatMoney(transaction.balanceAfterPaise)}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p className="mt-5 text-sm text-neutral-400">{loading ? 'Loading wallet data…' : 'Wallet is unavailable. Check the message above and refresh.'}</p>
      )}
    </section>
  )
}
