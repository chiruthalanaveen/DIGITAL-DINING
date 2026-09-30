'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function PaymentGatewayConfigCard({
  restaurantId,
  module = 'restaurant',
  title,
  description,
}) {
  const isResort = module === 'resort'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [keyId, setKeyId] = useState('')
  const [keySecret, setKeySecret] = useState('')
  const [hasSecret, setHasSecret] = useState(false)
  const [offlinePaymentEnabled, setOfflinePaymentEnabled] = useState(true)
  const [editing, setEditing] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [password, setPassword] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [message, setMessage] = useState('')

  const getAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    const token = data?.session?.access_token
    if (!token) throw new Error('Your login session has expired. Please sign in again.')
    return token
  }

  const loadConfig = async () => {
    if (!restaurantId) return
    setLoading(true)
    setMessage('')

    try {
      const token = await getAccessToken()
      const response = await fetch(
        `/api/payment-gateways/config?restaurantId=${encodeURIComponent(restaurantId)}&module=${encodeURIComponent(module)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }
      )

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Unable to load payment settings.')
      }

      setConfigured(Boolean(data.configured))
      setEnabled(Boolean(data.enabled))
      setKeyId(String(data.keyId || ''))
      setKeySecret('')
      setHasSecret(Boolean(data.hasSecret))
      setOfflinePaymentEnabled(data.offlinePaymentEnabled ?? true)
    } catch (error) {
      console.error(`${module} gateway load error:`, error)
      setMessage(error?.message || 'Unable to load payment settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, module])

  const requestEdit = () => {
    setPassword('')
    setShowPasswordModal(true)
  }

  const verifyPassword = async (event) => {
    event.preventDefault()
    if (!password.trim()) {
      setMessage('Enter your login password to edit payment credentials.')
      return
    }

    setVerifying(true)
    setMessage('')

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      const user = userData?.user
      if (userError || !user?.email) {
        throw new Error('Your login session has expired. Please sign in again.')
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password.trim(),
      })

      if (authError) {
        throw new Error('Incorrect login password. Payment credentials remain locked.')
      }

      setPassword('')
      setShowPasswordModal(false)
      setEditing(true)
    } catch (error) {
      setMessage(error?.message || 'Password verification failed.')
    } finally {
      setVerifying(false)
    }
  }

  const saveConfig = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const token = await getAccessToken()
      const response = await fetch('/api/payment-gateways/config', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          restaurantId,
          module,
          keyId: keyId.trim(),
          keySecret: keySecret.trim(),
          enabled,
          offlinePaymentEnabled,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Unable to save payment settings.')
      }

      setConfigured(Boolean(data.configured))
      setEnabled(Boolean(data.enabled))
      setKeyId(String(data.keyId || ''))
      setKeySecret('')
      setHasSecret(Boolean(data.hasSecret))
      setOfflinePaymentEnabled(data.offlinePaymentEnabled ?? true)
      setEditing(false)
      setMessage('Payment settings saved securely.')
    } catch (error) {
      console.error(`${module} gateway save error:`, error)
      setMessage(error?.message || 'Unable to save payment settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
        Loading payment settings...
      </div>
    )
  }

  const connected = configured && hasSecret
  const offlineLabel = isResort ? 'Pay at Property' : 'Pay at Counter'

  return (
    <>
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-400">
              {isResort ? 'Resort payments' : 'Restaurant payments'}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              {title || (isResort ? 'Resort / Hotel Razorpay' : 'Restaurant Razorpay')}
            </h3>
            <p className="mt-1 max-w-xl text-xs leading-5 text-neutral-400">
              {description ||
                (isResort
                  ? 'Used only for room-booking payments on the resort website.'
                  : 'Used only for food-order payments from the restaurant QR menu.')}
            </p>
          </div>

          <span
            className={`inline-flex w-fit items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
              connected && enabled
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : connected
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-neutral-700 bg-neutral-950 text-neutral-400'
            }`}
          >
            {connected && enabled
              ? 'Online payments enabled'
              : connected
                ? 'Configured but disabled'
                : 'Not configured'}
          </span>
        </div>

        {message && (
          <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-xs text-neutral-300">
            {message}
          </div>
        )}

        {!editing ? (
          <div className="mt-5 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Razorpay Key ID</p>
                <p className="mt-2 break-all font-mono text-xs text-white">{keyId || 'Not configured'}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Razorpay Key Secret</p>
                <p className="mt-2 font-mono text-xs text-white">{hasSecret ? '••••••••••••••••••••••••' : 'Not configured'}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-xs font-medium text-neutral-300">Online Razorpay</p>
                <p className={`mt-1 text-xs font-semibold ${enabled ? 'text-emerald-400' : 'text-neutral-500'}`}>
                  {enabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-xs font-medium text-neutral-300">{offlineLabel}</p>
                <p className={`mt-1 text-xs font-semibold ${offlinePaymentEnabled ? 'text-emerald-400' : 'text-neutral-500'}`}>
                  {offlinePaymentEnabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={requestEdit}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-xs font-semibold text-white transition hover:bg-neutral-700"
            >
              Edit payment settings
            </button>
          </div>
        ) : (
          <form onSubmit={saveConfig} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-300">Razorpay Key ID</span>
              <input
                value={keyId}
                onChange={(event) => setKeyId(event.target.value)}
                placeholder="rzp_test_... or rzp_live_..."
                autoComplete="off"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 font-mono text-xs text-white outline-none focus:border-orange-500"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-neutral-300">Razorpay Key Secret</span>
              <input
                type="password"
                value={keySecret}
                onChange={(event) => setKeySecret(event.target.value)}
                placeholder={hasSecret ? 'Leave blank to keep the existing secret' : 'Enter Razorpay Key Secret'}
                autoComplete="new-password"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 font-mono text-xs text-white outline-none focus:border-orange-500"
              />
              <p className="mt-1.5 text-[11px] leading-5 text-neutral-500">
                The secret is encrypted on the server and is never returned to this page after saving.
              </p>
            </label>

            <label className="flex items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <span>
                <span className="block text-xs font-medium text-white">Enable Razorpay online payments</span>
                <span className="mt-1 block text-[11px] text-neutral-500">Customers can pay online using this module's own Razorpay account.</span>
              </span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="h-5 w-5 accent-orange-500"
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <span>
                <span className="block text-xs font-medium text-white">Enable {offlineLabel}</span>
                <span className="mt-1 block text-[11px] text-neutral-500">
                  {isResort
                    ? 'Allow guests to reserve a room and pay directly at the property.'
                    : 'Allow QR-menu customers to choose cash or offline payment at the counter.'}
                </span>
              </span>
              <input
                type="checkbox"
                checked={offlinePaymentEnabled}
                onChange={(event) => setOfflinePaymentEnabled(event.target.checked)}
                className="h-5 w-5 accent-orange-500"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-orange-500 px-4 py-3 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save & lock settings'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(false)
                  setKeySecret('')
                  loadConfig()
                }}
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-xs font-semibold text-neutral-200 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {showPasswordModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Verify your password</h3>
            <p className="mt-2 text-xs leading-5 text-neutral-400">
              Enter the password used for your owner account before changing payment credentials.
            </p>

            <form onSubmit={verifyPassword} className="mt-5 space-y-4">
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Login password"
                disabled={verifying}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-orange-500 disabled:opacity-50"
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={verifying}
                  className="flex-1 rounded-xl bg-orange-500 px-4 py-3 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {verifying ? 'Verifying...' : 'Verify & continue'}
                </button>
                <button
                  type="button"
                  disabled={verifying}
                  onClick={() => {
                    setPassword('')
                    setShowPasswordModal(false)
                  }}
                  className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-xs font-semibold text-neutral-200 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
