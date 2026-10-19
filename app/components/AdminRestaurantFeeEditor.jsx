'use client'

import { useCallback, useEffect, useState } from 'react'

const MONEY_RE = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/

function paiseToRupees(value) {
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= 0 ? (n / 100).toFixed(2) : ''
}

function validAmount(value) {
  return MONEY_RE.test(String(value).trim())
}

/**
 * Super Admin per-restaurant pricing control.
 * Must be rendered in the existing Tenants & Access editor.
 * This component has its own save action and NEVER updates wallet balances.
 */
export default function AdminRestaurantFeeEditor({ restaurantId }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exists, setExists] = useState(false)
  const [qrFee, setQrFee] = useState('')
  const [deliveryFee, setDeliveryFee] = useState('')
  const [loaded, setLoaded] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    if (!restaurantId) return
    let current = true
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError('')
      setNotice('')
      setExists(false)
      setLoaded(null)
      setQrFee('')
      setDeliveryFee('')
      try {
        const response = await fetch(
          `/api/admin/restaurant-fees?restaurantId=${encodeURIComponent(restaurantId)}`,
          { cache: 'no-store', credentials: 'same-origin', signal: controller.signal }
        )
        const result = await response.json().catch(() => ({}))
        if (response.status === 401) {
          throw new Error('Admin session expired. Sign in to Admin ERP again.')
        }
        if (!response.ok || result.success !== true) {
          throw new Error(result.message || 'Unable to load platform fees.')
        }
        if (!current) return
        if (result.wallet) {
          setExists(true)
          setQrFee(paiseToRupees(result.wallet.restaurant_platform_fee_paise))
          setDeliveryFee(paiseToRupees(result.wallet.platform_fee_paise))
          setLoaded(result.wallet)
        }
      } catch (err) {
        if (current && err?.name !== 'AbortError') {
          setError(err?.message || 'Unable to load platform fees.')
        }
      } finally {
        if (current) setLoading(false)
      }
    }

    load()
    return () => {
      current = false
      controller.abort()
    }
  }, [restaurantId, reloadCount])

  const save = useCallback(async () => {
    if (!exists || !loaded || saving || loading) return
    if (!validAmount(qrFee) || !validAmount(deliveryFee)) {
      setError('Enter a valid fee between ₹0 and ₹9,999.99, using at most two decimal places.')
      return
    }
    const nextQrPaise = Math.round(Number(qrFee) * 100)
    const nextDeliveryPaise = Math.round(Number(deliveryFee) * 100)
    if (
      nextQrPaise === Number(loaded.restaurant_platform_fee_paise) &&
      nextDeliveryPaise === Number(loaded.platform_fee_paise)
    ) {
      setNotice('No fee changes to save.')
      setError('')
      return
    }

    const confirmed = window.confirm(
      `Save new platform fees for this restaurant?\n\nQR ordering: ₹${(nextQrPaise / 100).toFixed(2)} per billable order\nDD MART: ₹${(nextDeliveryPaise / 100).toFixed(2)} per billable order\n\nThis must not alter existing wallet balances or accrued fees.`
    )
    if (!confirmed) return

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/admin/restaurant-fees', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          qrFeeRupees: qrFee.trim(),
          deliveryFeeRupees: deliveryFee.trim(),
          expectedQrFeePaise: loaded.restaurant_platform_fee_paise,
          expectedDeliveryFeePaise: loaded.platform_fee_paise,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success !== true) {
        throw new Error(result.message || 'Unable to save platform fees.')
      }
      if (!result.wallet) throw new Error('The server did not confirm the updated fees. Refresh to verify.')
      setLoaded(result.wallet)
      setQrFee(paiseToRupees(result.wallet.restaurant_platform_fee_paise))
      setDeliveryFee(paiseToRupees(result.wallet.platform_fee_paise))
      setNotice(result.auditWarning
        ? 'Fees saved, but the admin audit log could not be recorded. Contact your administrator and check the server logs.'
        : 'Restaurant-specific platform fees saved successfully.')
    } catch (err) {
      setError(err?.message || 'Unable to save platform fees.')
    } finally {
      setSaving(false)
    }
  }, [restaurantId, qrFee, deliveryFee, loaded, exists, saving, loading])

  return (
    <section className="rounded-2xl border border-red-500/20 bg-neutral-900/60 p-4" aria-label="Per-restaurant platform fees">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-white">Platform fees — this restaurant</p>
          <p className="mt-2 text-[10px] leading-5 text-neutral-400">
            Super Admin pricing. These values are independent for every restaurant and stored in paise on the server.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || saving}
          onClick={() => setReloadCount((v) => v + 1)}
          className="rounded-lg border border-neutral-700 px-3 py-2 text-[10px] font-bold text-neutral-200 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh fees'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-200">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[11px] text-emerald-200">
          {notice}
        </p>
      )}

      {!loading && !exists && !error && (
        <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-5 text-amber-200">
          This restaurant has no wallet record yet. Pricing cannot be edited here until the existing wallet provisioning flow creates it.
        </p>
      )}

      {exists && !loading && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[10px] font-bold text-neutral-300">QR ordering fee (₹)</span>
              <input
                type="number" min="0" max="9999.99" step="0.01" inputMode="decimal"
                value={qrFee} onChange={(event) => setQrFee(event.target.value)}
                disabled={saving}
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-red-500 disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold text-neutral-300">DD MART fee (₹)</span>
              <input
                type="number" min="0" max="9999.99" step="0.01" inputMode="decimal"
                value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)}
                disabled={saving}
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm font-bold text-white outline-none focus:border-red-500 disabled:opacity-50"
              />
            </label>
          </div>
          <p className="mt-3 text-[10px] leading-5 text-neutral-500">
            Only future eligible order fees should use these values. Existing accrued fees and wallet balances are not recalculated. Who pays the fee is controlled separately in Wallet Controls.
          </p>
          <button
            type="button" onClick={save} disabled={saving || !validAmount(qrFee) || !validAmount(deliveryFee)}
            className="mt-4 w-full rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving platform fees...' : 'Save This Restaurant’s Fees'}
          </button>
        </>
      )}
    </section>
  )
}