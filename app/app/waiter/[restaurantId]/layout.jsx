'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import {
  AndroidBiometryStrength,
  BiometricAuth,
} from '@aparajita/capacitor-biometric-auth'
import { supabase } from '@/lib/supabase'

const SESSION_STORAGE_KEY = 'digital-dine-staff-session'
const ROLE = 'waiter'
const ROLE_LABEL = 'Waiter'

export default function WaiterFaceLockLayout({ children }) {
  const params = useParams()
  const router = useRouter()

  const restaurantId = String(
    params?.restaurantId ||
      params?.restaurantid ||
      params?.restaurant_id ||
      params?.id ||
      ''
  ).trim()

  const [state, setState] = useState('checking')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [biometryName, setBiometryName] = useState('Face / Biometric')

  const biometricKey = restaurantId
    ? `digital-dine-biometric-${ROLE}-${restaurantId}`
    : ''

  const readStaffSession = useCallback(() => {
    if (typeof window === 'undefined') return null

    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY)
      if (!raw) return null

      const saved = JSON.parse(raw)

      const savedRole = String(saved?.role || '')
        .trim()
        .toLowerCase()

      const savedRestaurantId = String(
        saved?.restaurantId || ''
      ).trim()

      const token = String(
        saved?.sessionToken || ''
      ).trim()

      if (
        savedRole !== ROLE ||
        savedRestaurantId !== String(restaurantId) ||
        !token
      ) {
        return null
      }

      return saved
    } catch {
      return null
    }
  }, [restaurantId])

  const checkSavedSession = useCallback(async () => {
    const saved = readStaffSession()

    if (!saved) {
      // No secure app session yet. Let the existing page show its normal login.
      return null
    }

    const { data, error } = await supabase.rpc(
      'validate_staff_app_session',
      {
        p_session_token: String(saved.sessionToken),
        p_required_role: ROLE,
      }
    )

    if (
      error ||
      !data?.success ||
      String(data?.restaurantId || '') !== String(restaurantId)
    ) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }

    return saved
  }, [readStaffSession, restaurantId])

  const getBiometryLabel = (info) => {
    const type = String(info?.biometryType || '').toLowerCase()

    if (type.includes('face')) return 'Face Lock'
    if (type.includes('fingerprint')) return 'Fingerprint Lock'
    if (type.includes('touch')) return 'Touch ID'
    if (type.includes('iris')) return 'Iris Lock'

    return 'Biometric Lock'
  }

  const authenticate = useCallback(async () => {
    setBusy(true)
    setMessage('')

    try {
      const info = await BiometricAuth.checkBiometry()

      setBiometryName(getBiometryLabel(info))

      if (!info?.isAvailable) {
        setMessage(
          info?.reason ||
            'Biometric authentication is not available or is not enrolled on this device.'
        )
        setState('unavailable')
        return false
      }

      await BiometricAuth.authenticate({
        reason: `Unlock Digital Dine ${ROLE_LABEL}`,
        cancelTitle: 'Cancel',
        allowDeviceCredential: false,
        iosFallbackTitle: '',
        androidTitle: `${ROLE_LABEL} Face Lock`,
        androidSubtitle: `Unlock the ${ROLE_LABEL} workspace`,
        androidConfirmationRequired: false,
        // Weak is intentional: many Android face-unlock implementations
        // are classified as weak biometry. Strong-only can force fingerprint.
        androidBiometryStrength: AndroidBiometryStrength.weak,
      })

      setState('unlocked')
      setMessage('')
      return true
    } catch (error) {
      console.error(
        `[${ROLE_LABEL.toUpperCase()} BIOMETRIC] Authentication error:`,
        error
      )

      setMessage(
        error?.message ||
          'Biometric verification was cancelled or failed.'
      )
      setState('locked')
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const enableBiometric = async () => {
    const success = await authenticate()

    if (!success || !biometricKey) return

    localStorage.setItem(
      biometricKey,
      JSON.stringify({
        enabled: true,
        role: ROLE,
        restaurantId,
        enabledAt: new Date().toISOString(),
      })
    )
  }

  const continueWithoutBiometric = () => {
    setMessage('')
    setState('unlocked')
  }

  const usePasswordInstead = () => {
    if (biometricKey) {
      localStorage.removeItem(biometricKey)
    }

    localStorage.removeItem(SESSION_STORAGE_KEY)
    router.replace('/app')
  }

  useEffect(() => {
    let active = true

    const initialize = async () => {
      // Face/biometric lock is for the installed Capacitor app only.
      // Browser users keep the existing website login behavior.
      if (!Capacitor.isNativePlatform()) {
        if (active) setState('unlocked')
        return
      }

      if (!restaurantId) {
        if (active) setState('unlocked')
        return
      }

      try {
        const savedSession = await checkSavedSession()

        if (!active) return

        if (!savedSession) {
          setState('unlocked')
          return
        }

        const info = await BiometricAuth.checkBiometry()

        if (!active) return

        setBiometryName(getBiometryLabel(info))

        if (!info?.isAvailable) {
          const enabled =
            biometricKey &&
            localStorage.getItem(biometricKey)

          if (enabled) {
            setMessage(
              info?.reason ||
                'Biometric authentication is currently unavailable on this device.'
            )
            setState('unavailable')
          } else {
            // Do not block a first-time user whose device has no supported
            // app-level biometry. Existing password login remains available.
            setState('unlocked')
          }

          return
        }

        const enabledRaw = biometricKey
          ? localStorage.getItem(biometricKey)
          : null

        if (!enabledRaw) {
          setState('setup')
          return
        }

        let enabled = false

        try {
          enabled = Boolean(
            JSON.parse(enabledRaw)?.enabled
          )
        } catch {
          enabled = false
        }

        if (!enabled) {
          setState('setup')
          return
        }

        setState('locked')

        // Automatically open the native biometric prompt after a valid
        // Digital Dine staff session has been found.
        window.setTimeout(() => {
          if (active) authenticate()
        }, 250)
      } catch (error) {
        console.error(
          `[${ROLE_LABEL.toUpperCase()} BIOMETRIC] Initialization error:`,
          error
        )

        if (active) {
          // Do not break the existing login/dashboard if the biometric
          // plugin itself has a temporary problem.
          setState('unlocked')
        }
      }
    }

    initialize()

    return () => {
      active = false
    }
  }, [
    restaurantId,
    biometricKey,
    checkSavedSession,
    authenticate,
  ])

  if (state === 'checking') {
    return (
      <main className="flex min-h-[100dvh] w-full items-center justify-center overflow-x-hidden bg-neutral-950 p-4 text-white">
        <div className="w-full max-w-sm rounded-[28px] border border-neutral-800 bg-neutral-900 p-7 text-center shadow-2xl">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-neutral-800 border-t-orange-500" />

          <h1 className="mt-5 text-lg font-black">
            Opening {ROLE_LABEL}
          </h1>

          <p className="mt-2 text-xs text-neutral-500">
            Checking secure staff session...
          </p>
        </div>
      </main>
    )
  }

  if (state === 'setup') {
    return (
      <main className="flex min-h-[100dvh] w-full items-center justify-center overflow-x-hidden bg-neutral-950 p-4 text-white">
        <div className="w-full max-w-sm rounded-[30px] border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-500/10 text-3xl">
            🧑‍🍳
          </div>

          <p className="mt-5 text-center text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
            Digital Dine Security
          </p>

          <h1 className="mt-2 text-center text-2xl font-black">
            Enable {biometryName}?
          </h1>

          <p className="mt-3 text-center text-xs leading-relaxed text-neutral-400">
            After a successful {ROLE_LABEL} password login, this device can use
            its built-in biometric verification before reopening the workspace.
          </p>

          <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-[10px] leading-relaxed text-neutral-500">
            Digital Dine does not receive or store your face or fingerprint.
            Android/iOS performs the biometric match.
          </div>

          {message && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold text-red-300">
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={enableBiometric}
            disabled={busy}
            className="mt-5 w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white disabled:opacity-50"
          >
            {busy
              ? 'Checking Biometrics...'
              : `Enable ${biometryName}`}
          </button>

          <button
            type="button"
            onClick={continueWithoutBiometric}
            disabled={busy}
            className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 py-3.5 text-xs font-black text-neutral-400 disabled:opacity-50"
          >
            Not Now
          </button>
        </div>
      </main>
    )
  }

  if (state === 'locked' || state === 'unavailable') {
    return (
      <main className="flex min-h-[100dvh] w-full items-center justify-center overflow-x-hidden bg-neutral-950 p-4 text-white">
        <div className="w-full max-w-sm rounded-[30px] border border-neutral-800 bg-neutral-900 p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-orange-500/10 text-4xl">
            🧑‍🍳
          </div>

          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
            {ROLE_LABEL} Locked
          </p>

          <h1 className="mt-2 text-2xl font-black">
            {state === 'unavailable'
              ? 'Biometric unavailable'
              : `Unlock with ${biometryName}`}
          </h1>

          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            {state === 'unavailable'
              ? 'Use normal staff login to regain access or reconfigure biometrics on the phone.'
              : `Verify on this phone to open the ${ROLE_LABEL} workspace.`}
          </p>

          {message && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold text-red-300">
              {message}
            </div>
          )}

          {state !== 'unavailable' && (
            <button
              type="button"
              onClick={authenticate}
              disabled={busy}
              className="mt-5 w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white disabled:opacity-50"
            >
              {busy
                ? 'Verifying...'
                : `Unlock ${ROLE_LABEL}`}
            </button>
          )}

          <button
            type="button"
            onClick={usePasswordInstead}
            disabled={busy}
            className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 py-3.5 text-xs font-black text-neutral-400 disabled:opacity-50"
          >
            Use Password Login Instead
          </button>
        </div>
      </main>
    )
  }

  return children
}
