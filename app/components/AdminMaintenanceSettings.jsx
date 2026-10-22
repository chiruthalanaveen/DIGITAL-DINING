'use client'

import { useEffect, useRef, useState } from 'react'

async function requestSettings(options = {}) {
  const response = await fetch('/api/admin/maintenance', {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
  })
  const result = await response.json().catch(() => ({}))

  if (!response.ok || !result.success || typeof result.enabled !== 'boolean') {
    throw new Error(result.message || 'Unable to load maintenance settings.')
  }

  return result
}

export default function AdminMaintenanceSettings({ onChange }) {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inFlight = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    requestSettings({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setSettings(result)
          onChange?.(result)
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError.message || 'Unable to load maintenance settings.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [onChange])

  async function refresh() {
    if (inFlight.current || loading || saving) return
    inFlight.current = true
    setLoading(true)
    setSettings(null)
    setError('')
    setNotice('')

    try {
      const result = await requestSettings()
      setSettings(result)
      onChange?.(result)
    } catch (requestError) {
      setError(requestError.message || 'Unable to load maintenance settings.')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  async function save(enabled) {
    if (inFlight.current || loading || saving || !settings || settings.enabled === enabled) return
    inFlight.current = true
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const result = await requestSettings({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      setSettings(result)
      onChange?.(result)
      const confirmation = result.enabled
        ? 'Maintenance is on. Public pages now show the maintenance notice.'
        : 'Maintenance is off. Public pages are available again.'
      setNotice(result.auditLogged === false
        ? `${confirmation} The audit log could not be saved.`
        : confirmation)
    } catch (requestError) {
      // A failed response may follow a successful write. Refresh before retrying.
      setSettings(null)
      setError(`${requestError.message || 'Unable to save maintenance settings.'} Refresh to check the current setting.`)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const busy = loading || saving

  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5" aria-labelledby="admin-maintenance-title" aria-busy={busy}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">Public Website &amp; Apps</p>
          <h2 id="admin-maintenance-title" className="mt-1 text-lg font-black text-white">Maintenance Mode</h2>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${!settings ? 'bg-neutral-800 text-neutral-400' : settings.enabled ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
          {loading ? 'Loading...' : settings ? (settings.enabled ? 'ON' : 'OFF') : 'Unknown'}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-neutral-400">
        Turn on to show the maintenance notice on public pages. Admin sign-in and this dashboard stay accessible so you can turn it off again. Changes apply without a restart.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Maintenance mode">
        <button type="button" aria-pressed={settings?.enabled === true}
          disabled={busy || !settings || settings.enabled}
          onClick={() => void save(true)}
          className="rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400">
          Turn On
        </button>
        <button type="button" aria-pressed={settings?.enabled === false}
          disabled={busy || !settings || !settings.enabled}
          onClick={() => void save(false)}
          className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
          Turn Off
        </button>
      </div>
      {saving && <p role="status" className="mt-3 text-xs text-neutral-300">Saving maintenance setting...</p>}
      {error && <p role="alert" className="mt-3 text-xs leading-5 text-red-400">{error}</p>}
      {notice && <p role="status" className="mt-3 text-xs leading-5 text-emerald-400">{notice}</p>}
      <button type="button" onClick={() => void refresh()} disabled={busy}
        className="mt-4 rounded-xl border border-neutral-700 px-4 py-2 text-xs font-bold text-neutral-300 disabled:opacity-50">
        Refresh
      </button>
    </section>
  )
}
