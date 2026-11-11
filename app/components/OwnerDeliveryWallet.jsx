'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Presentation-only redesign. Wallet balances, fee rates, rollout state and
// permissions are supplied by the existing authenticated owner APIs.
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
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Checkout is unavailable.'))
  }
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

const icons = {
  back: <><path d="M19 12H5m7 7-7-7 7-7" /></>,
  arrow: <><path d="m9 18 6-6-6-6" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12-2" /></>,
  wallet: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18m-5 5h3" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3zM9 8h6M9 12h6" /></>,
  settings: <><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" /><circle cx="12" cy="12" r="4" /></>,
  shield: <><path d="m12 2 9 4v6c0 5-3.4 8.5-9 10-5.6-1.5-9-5-9-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  alert: <><path d="m12 3 10 18H2L12 3z" /><path d="M12 9v5m0 3h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
}

function Icon({ name, size = 20 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || icons.wallet}
    </svg>
  )
}

function ActionRow({ icon, title, description, onClick, trailing }) {
  return (
    <button type="button" onClick={onClick}
      className="flex min-h-[72px] w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-orange-50/50 active:bg-orange-50 last:border-0">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-extrabold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{description}</span>
      </span>
      {trailing || <span className="text-slate-400"><Icon name="arrow" size={17} /></span>}
    </button>
  )
}

function SubpageHeader({ title, description, onBack }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <button type="button" onClick={onBack} aria-label="Back to wallet overview"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm lg:hidden">
        <Icon name="back" />
      </button>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h3>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  )
}

function Stat({ title, amount, tone = 'default' }) {
  const toneClass = tone === 'orange' ? 'text-orange-600' :
    tone === 'red' ? 'text-rose-600' :
      tone === 'green' ? 'text-emerald-700' : 'text-slate-900'
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3.5 shadow-sm">
      <p className="text-[10px] font-bold leading-4 text-slate-500">{title}</p>
      <p className={`mt-1 break-words text-lg font-black tracking-tight sm:text-xl ${toneClass}`}>{amount}</p>
    </div>
  )
}

export default function OwnerDeliveryWallet({ restaurantId }) {
  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('2000')
  const [view, setView] = useState('overview')
  const [historyFilter, setHistoryFilter] = useState('all')
  const [restaurantChargeCustomer, setRestaurantChargeCustomer] = useState(false)
  const [deliveryChargeCustomer, setDeliveryChargeCustomer] = useState(false)
  const [savingFeePreferences, setSavingFeePreferences] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const rootRef = useRef(null)
  const requestRef = useRef(0)

  const loadWallet = useCallback(async ({ silent = false } = {}) => {
    if (!restaurantId) return
    const request = ++requestRef.current
    if (!silent) setLoading(true)
    try {
      const token = await getOwnerToken()
      const response = await fetch(
        `/api/owner/wallet?restaurantId=${encodeURIComponent(restaurantId)}`,
        { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } }
      )
      const data = await parseResponse(response)
      if (request !== requestRef.current) return
      setWallet(data.wallet)
      setRestaurantChargeCustomer(data.wallet?.restaurantChargeCustomer === true)
      setDeliveryChargeCustomer(data.wallet?.deliveryChargeCustomer === true)
      setTransactions(Array.isArray(data.transactions) ? data.transactions : [])
      setErrorMessage('')
    } catch (error) {
      if (request === requestRef.current) {
        setErrorMessage(error?.message || 'Unable to load wallet.')
      }
    } finally {
      if (request === requestRef.current && !silent) setLoading(false)
    }
  }, [restaurantId])

  useEffect(() => {
    setWallet(null)
    setTransactions([])
    setView('overview')
    setLoading(true)
    void loadWallet()
    return () => { requestRef.current += 1 }
  }, [loadWallet])

  // Reset only the wallet's scroll container. Never jump down the dashboard.
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 1024) return
    let node = rootRef.current?.parentElement
    while (node && node !== document.body) {
      const overflow = window.getComputedStyle(node).overflowY
      if (overflow === 'auto' || overflow === 'scroll') {
        node.scrollTop = 0
        break
      }
      node = node.parentElement
    }
  }, [view])

  const minimumRupees = useMemo(
    () => Math.ceil(Number(wallet?.minimumTopupPaise || 200000) / 100),
    [wallet?.minimumTopupPaise]
  )
  const feePreferencesChanged = Boolean(wallet) && (
    restaurantChargeCustomer !== (wallet.restaurantChargeCustomer === true) ||
    deliveryChargeCustomer !== (wallet.deliveryChargeCustomer === true)
  )
  const filteredTransactions = useMemo(() => transactions.filter((transaction) => {
    const credit = transaction.type === 'topup' || transaction.type === 'admin_credit'
    return historyFilter === 'all' || (historyFilter === 'credit' ? credit : !credit)
  }), [transactions, historyFilter])

  const saveFeePreferences = async () => {
    if (!wallet || savingFeePreferences || !feePreferencesChanged) return
    setSavingFeePreferences(true)
    setNotice('')
    setErrorMessage('')
    try {
      const token = await getOwnerToken()
      const response = await fetch('/api/owner/platform-fee-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurantId, restaurantChargeCustomer, deliveryChargeCustomer }),
      })
      const payload = await parseResponse(response)
      setNotice(payload.message || 'Fee payer preferences saved.')
      await loadWallet({ silent: true })
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to save fee payer preferences.')
    } finally {
      setSavingFeePreferences(false)
    }
  }

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurantId, amountRupees }),
      })
      const created = await parseResponse(createResponse)
      const checkout = new window.Razorpay({
        key: created.keyId,
        amount: created.amountPaise,
        currency: 'INR',
        name: 'Digital Dine-In',
        description: 'Owner wallet recharge',
        order_id: created.razorpayOrderId,
        theme: { color: '#f97316' },
        handler: async (payment) => {
          try {
            const freshToken = await getOwnerToken()
            const verifyResponse = await fetch('/api/owner/wallet/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
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
            setView('overview')
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

  const isShown = (section) => view === section ? 'block' : 'hidden lg:block'
  const transactionTitle = (type) => ({
    platform_fee_debit: 'Daily Platform Fee',
    topup: 'Razorpay Recharge',
    admin_credit: 'Admin Credit',
    admin_debit: 'Admin Debit',
  }[type] || 'Wallet Adjustment')

  return (
    <section ref={rootRef} className="dd-owner-wallet w-full min-w-0 rounded-[24px] border border-slate-200 bg-[#f8fafc] p-3 text-slate-900 shadow-sm sm:p-5">
      <style jsx global>{`
        :root[data-theme='dark'] .dd-owner-wallet {
          background: #101722 !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }
        :root[data-theme='dark'] .dd-owner-wallet .bg-white,
        :root[data-theme='dark'] .dd-owner-wallet .bg-slate-50,
        :root[data-theme='dark'] .dd-owner-wallet [class*="bg-slate-50/70"] {
          background-color: #1c2737 !important;
        }
        :root[data-theme='dark'] .dd-owner-wallet .bg-slate-100 {
          background-color: #283448 !important;
        }
        :root[data-theme='dark'] .dd-owner-wallet .bg-orange-50 {
          background-color: #39291b !important;
        }
        :root[data-theme='dark'] .dd-owner-wallet .bg-blue-50 {
          background-color: #182d42 !important;
        }
        :root[data-theme='dark'] .dd-owner-wallet .bg-amber-50 {
          background-color: #382a17 !important;
        }
        :root[data-theme='dark'] .dd-owner-wallet .bg-rose-50 {
          background-color: #3d202a !important;
        }
        :root[data-theme='dark'] .dd-owner-wallet .bg-emerald-50 {
          background-color: #14372c !important;
        }
        :root[data-theme='dark'] .dd-owner-wallet .text-slate-900,
        :root[data-theme='dark'] .dd-owner-wallet .text-slate-800,
        :root[data-theme='dark'] .dd-owner-wallet .text-slate-700 {
          color: #f1f5f9 !important;
        }
        :root[data-theme='dark'] .dd-owner-wallet .text-slate-500,
        :root[data-theme='dark'] .dd-owner-wallet .text-slate-600,
        :root[data-theme='dark'] .dd-owner-wallet .text-slate-400 {
          color: #a9b8ce !important;
        }
        :root[data-theme='dark'] .dd-owner-wallet .text-blue-900 { color: #bfdbfe !important; }
        :root[data-theme='dark'] .dd-owner-wallet .text-amber-900,
        :root[data-theme='dark'] .dd-owner-wallet .text-amber-800 { color: #fde68a !important; }
        :root[data-theme='dark'] .dd-owner-wallet .text-rose-800 { color: #fda4af !important; }
        :root[data-theme='dark'] .dd-owner-wallet .text-emerald-800 { color: #6ee7b7 !important; }
        :root[data-theme='dark'] .dd-owner-wallet .text-orange-700,
        :root[data-theme='dark'] .dd-owner-wallet .text-orange-600 { color: #fdba74 !important; }
        :root[data-theme='dark'] .dd-owner-wallet .border-slate-100,
        :root[data-theme='dark'] .dd-owner-wallet .border-slate-200 {
          border-color: #354154 !important;
        }
      `}</style>
      {/* Desktop keeps all wallet tools visible. Mobile shows one screen at a time. */}
      <div className="mb-4 hidden items-center justify-between gap-3 lg:flex">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[.15em] text-orange-600">Owner finances</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight">Wallet & Platform Fees</h2>
          <p className="mt-1 text-xs text-slate-500">Restaurant and delivery fees in your existing owner wallet.</p>
        </div>
        <button type="button" onClick={() => void loadWallet()} disabled={loading || busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold hover:bg-slate-50 disabled:opacity-50">
          <Icon name="refresh" size={17} /> {loading ? 'Refreshing...' : 'Refresh wallet'}
        </button>
      </div>

      {errorMessage && (
        <div role="alert" className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold leading-5 text-rose-800">
          {errorMessage}
        </div>
      )}
      {notice && (
        <div role="status" className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold leading-5 text-emerald-800">
          {notice}
        </div>
      )}

      {!wallet ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Icon name="wallet" size={24} /></span>
          <p className="mt-3 text-sm font-bold">{loading ? 'Loading your wallet...' : 'Wallet unavailable'}</p>
          <p className="mt-1 text-xs text-slate-500">{loading ? 'Retrieving your balance securely.' : 'Check the error above and try again.'}</p>
          {!loading && <button type="button" onClick={() => void loadWallet()} className="mt-4 rounded-xl bg-orange-500 px-5 py-3 text-xs font-bold text-white">Try again</button>}
        </div>
      ) : (
        <>
          <div className={isShown('overview')}>
            <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-slate-500">Owner wallet</p>
                <h2 className="mt-0.5 text-xl font-black tracking-tight">Wallet overview</h2>
              </div>
              <button type="button" aria-label="Refresh wallet" title="Refresh wallet"
                onClick={() => void loadWallet()} disabled={loading || busy}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 disabled:opacity-50">
                <Icon name="refresh" />
              </button>
            </div>

            <div className="relative overflow-hidden rounded-[23px] bg-[#17253c] px-5 py-5 text-white shadow-[0_12px_26px_rgba(15,23,42,.12)] sm:px-6">
              <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-orange-500/20 blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-300">Total wallet balance</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-orange-300"><Icon name="wallet" /></span>
                </div>
                <p className="mt-2 break-words text-[30px] font-black leading-tight tracking-tight sm:text-4xl">{formatMoney(wallet.balancePaise)}</p>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-300"><Icon name="shield" size={14} /> Secure owner wallet</p>
              </div>
            </div>

            {wallet.lowBalance && (
              <div role="alert" className="mt-3 flex gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-900">
                <span className="mt-0.5 shrink-0"><Icon name="alert" size={19} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold">Low spendable balance</p>
                  <p className="mt-1 text-[11px] leading-5">At or below {formatMoney(wallet.thresholdPaise)}. New orders may be blocked by the server until you recharge.</p>
                  <button type="button" onClick={() => setView('recharge')} className="mt-2 text-xs font-black text-orange-700 underline underline-offset-2">Add money</button>
                </div>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Stat title="Spendable" amount={formatMoney(wallet.spendablePaise)} tone={wallet.lowBalance ? 'red' : 'green'} />
              <Stat title="Pending fees" amount={formatMoney(wallet.pendingFeesPaise)} tone="orange" />
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-slate-500">Per restaurant order</span>
                <span className="font-black text-slate-900">{formatMoney(wallet.restaurantPlatformFeePaise ?? 500)}</span>
              </div>
              <div className="my-2.5 border-t border-slate-100" />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-slate-500">Per delivered order</span>
                <span className="font-black text-slate-900">{formatMoney(wallet.platformFeePaise)}</span>
              </div>
              <p className="mt-2.5 text-[10px] leading-4 text-slate-400">Fee rates are set by Super Admin.</p>
            </div>

            <div className="mt-4 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm lg:hidden">
              <ActionRow icon="plus" title="Add money" description="Recharge securely using Razorpay" onClick={() => setView('recharge')} />
              <ActionRow icon="settings" title="Platform fee settings" description="Choose who bears restaurant and delivery fees" onClick={() => setView('fees')} trailing={feePreferencesChanged ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">Unsaved</span> : undefined} />
              <ActionRow icon="receipt" title="Transactions" description="Recharges, fee debits and adjustments" onClick={() => setView('history')} />
            </div>
            <p className="mt-3 flex items-start gap-2 px-1 text-[10px] leading-5 text-slate-500">
              <Icon name="clock" size={15} /> Daily platform-fee settlement is scheduled for 11:00 PM IST once enabled by Admin.
            </p>
          </div>

          <div className={`${isShown('recharge')} mt-0 lg:mt-5`}>
            <SubpageHeader title="Add money" description="Recharge your existing owner wallet securely." onBack={() => setView('overview')} />
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-500">Current balance</p>
                <p className="text-base font-black text-slate-900">{formatMoney(wallet.balancePaise)}</p>
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <label htmlFor="wallet-topup-amount" className="block text-xs font-extrabold text-slate-800">Recharge amount (₹)</label>
                <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-100">
                  <span className="text-lg font-bold text-slate-500">₹</span>
                  <input id="wallet-topup-amount" type="number" inputMode="numeric"
                    min={minimumRupees} max="500000" step="1" value={amount}
                    onChange={(event) => setAmount(event.target.value)} disabled={busy}
                    className="h-14 min-w-0 w-full bg-transparent px-2 text-xl font-black text-slate-900 outline-none disabled:opacity-50" />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Minimum {formatMoney(wallet.minimumTopupPaise ?? 200000)} · Maximum ₹5,00,000</p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[minimumRupees, Math.max(minimumRupees, 5000), Math.max(minimumRupees, 10000)]
                    .filter((value, index, list) => list.indexOf(value) === index)
                    .map((value) => (
                      <button key={value} type="button" onClick={() => setAmount(String(value))} disabled={busy}
                        className={`min-h-11 rounded-xl border px-2 text-xs font-extrabold transition disabled:opacity-50 ${Number(amount) === value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-700'}`}>
                        ₹{value.toLocaleString('en-IN')}
                      </button>
                    ))}
                </div>
              </div>
              <button type="button" onClick={() => void recharge()} disabled={busy || loading}
                className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 text-sm font-black text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
                <Icon name="plus" size={18} /> {busy ? 'Processing payment...' : 'Continue to Razorpay'}
              </button>
              <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><Icon name="shield" size={16} /> Balance updates only after server-side payment verification. If verification is pending, do not pay twice.</p>
            </div>
          </div>

          <div className={`${isShown('fees')} mt-0 lg:mt-5`}>
            <SubpageHeader title="Platform fee settings" description="Choose who pays each fee. The Super Admin controls fee amounts." onBack={() => setView('overview')} />
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-900">
                <span className="flex items-start gap-2"><Icon name="info" size={18} /> Customer fees are collected only after the platform enables and verifies the corresponding checkout. Saving a preference does not activate checkout billing.</span>
              </div>
              {[
                {
                  id: 'restaurant-platform-fee-payer', label: 'Restaurant', detail: 'Dine-in & takeaway',
                  fee: wallet.restaurantPlatformFeePaise ?? 500,
                  checked: restaurantChargeCustomer, change: setRestaurantChargeCustomer,
                  live: wallet.restaurantCustomerCheckoutLive === true,
                  saved: wallet.restaurantChargeCustomer === true,
                },
                {
                  id: 'delivery-platform-fee-payer', label: 'Delivery', detail: 'Delivery orders',
                  fee: wallet.platformFeePaise ?? 500,
                  checked: deliveryChargeCustomer, change: setDeliveryChargeCustomer,
                  live: wallet.deliveryCustomerCheckoutLive === true,
                  saved: wallet.deliveryChargeCustomer === true,
                },
              ].map((pref) => {
                const customerBillingActive = pref.saved && pref.live
                const status = customerBillingActive ? 'Customer billing enabled' :
                  pref.saved ? 'Pending platform activation' : 'Owner absorbs fee'
                return (
                  <div key={pref.id} className="mb-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 last:mb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-extrabold text-slate-900">{pref.label}</h4>
                        <p className="mt-0.5 text-[11px] text-slate-500">{pref.detail}</p>
                      </div>
                      <span className="text-base font-black text-slate-900">{formatMoney(pref.fee)}</span>
                    </div>
                    <p className={`mt-2 text-[11px] font-bold ${customerBillingActive ? 'text-emerald-700' : pref.saved ? 'text-amber-700' : 'text-slate-600'}`}>{status}</p>
                    <div className="my-3 border-t border-slate-200" />
                    <label htmlFor={pref.id} className="flex cursor-pointer items-center justify-between gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-slate-900">Charge customer</span>
                        <span className="mt-1 block text-[11px] leading-4 text-slate-500">{pref.checked ? 'Customer selected as fee payer' : 'Your business pays this fee'}</span>
                      </span>
                      <input id={pref.id} type="checkbox" role="switch" checked={pref.checked}
                        disabled={savingFeePreferences} onChange={(event) => pref.change(event.target.checked)}
                        className="h-5 w-5 shrink-0 accent-orange-500 disabled:opacity-50" />
                    </label>
                  </div>
                )
              })}
              {feePreferencesChanged && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-[11px] font-bold text-amber-800">You have unsaved changes.</p>}
              <button type="button" onClick={() => void saveFeePreferences()}
                disabled={savingFeePreferences || loading || !feePreferencesChanged}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 text-sm font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
                <Icon name="check" size={19} /> {savingFeePreferences ? 'Saving preferences...' : 'Save fee preferences'}
              </button>
              <p className="mt-3 text-[10px] leading-5 text-slate-500">Platform-fee amounts and checkout activation are controlled by Super Admin. Your choice cannot override those controls.</p>
            </div>
          </div>

          <div className={`${isShown('history')} mt-0 lg:mt-5`}>
            <SubpageHeader title="Transactions" description="Your wallet recharges, fee debits and admin adjustments." onBack={() => setView('overview')} />
            <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3 sm:p-4">
                <span className="text-xs font-bold text-slate-600">{filteredTransactions.length} transaction{filteredTransactions.length === 1 ? '' : 's'}</span>
                <div className="flex gap-1 rounded-xl bg-slate-100 p-1" aria-label="Filter transactions">
                  {[
                    ['all', 'All'], ['credit', 'Credits'], ['debit', 'Debits'],
                  ].map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setHistoryFilter(key)}
                      aria-pressed={historyFilter === key}
                      className={`rounded-lg px-2.5 py-2 text-[11px] font-bold ${historyFilter === key ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {filteredTransactions.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Icon name="receipt" size={24} /></span>
                  <p className="mt-3 text-sm font-bold text-slate-800">No matching transactions</p>
                  <p className="mt-1 text-xs text-slate-500">Your wallet activity will appear here.</p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100 lg:hidden">
                    {filteredTransactions.map((transaction, index) => {
                      const credit = transaction.type === 'topup' || transaction.type === 'admin_credit'
                      return (
                        <div key={transaction.id ?? index} className="px-4 py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-extrabold text-slate-900">{transactionTitle(transaction.type)}</p>
                              <p className="mt-1 text-[10px] text-slate-500">{formatWhen(transaction.createdAt)}</p>
                            </div>
                            <span className={`shrink-0 text-sm font-black ${credit ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {credit ? '+' : '−'}{formatMoney(transaction.amountPaise)}
                            </span>
                          </div>
                          {transaction.description && <p className="mt-2 break-words text-[11px] leading-4 text-slate-500">{transaction.description}</p>}
                          <p className="mt-2 text-[10px] font-semibold text-slate-500">Balance after: <span className="text-slate-700">{formatMoney(transaction.balanceAfterPaise)}</span></p>
                        </div>
                      )
                    })}
                  </div>
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full min-w-[650px] text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500"><tr>
                        <th className="px-4 py-3">Date (IST)</th>
                        <th className="px-4 py-3">Transaction</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-right">Balance after</th>
                      </tr></thead>
                      <tbody>
                        {filteredTransactions.map((transaction, index) => {
                          const credit = transaction.type === 'topup' || transaction.type === 'admin_credit'
                          return <tr key={transaction.id ?? index} className="border-t border-slate-100">
                            <td className="px-4 py-3 text-slate-500">{formatWhen(transaction.createdAt)}</td>
                            <td className="px-4 py-3"><span className="font-bold">{transactionTitle(transaction.type)}</span>
                              {transaction.description && <p className="mt-1 text-[11px] text-slate-500">{transaction.description}</p>}</td>
                            <td className={`px-4 py-3 text-right font-black ${credit ? 'text-emerald-700' : 'text-rose-600'}`}>{credit ? '+' : '−'}{formatMoney(transaction.amountPaise)}</td>
                            <td className="px-4 py-3 text-right font-semibold">{formatMoney(transaction.balanceAfterPaise)}</td>
                          </tr>
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}