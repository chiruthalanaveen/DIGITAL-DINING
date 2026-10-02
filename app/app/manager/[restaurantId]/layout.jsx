'use client'



import { useCallback, useEffect, useState } from 'react'

import { useParams, useRouter } from 'next/navigation'

import { Capacitor } from '@capacitor/core'

import {

  AndroidBiometryStrength,

  BiometricAuth,

} from '@aparajita/capacitor-biometric-auth'

import { supabase } from '@/lib/supabase'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'



const SESSION_STORAGE_KEY = 'digital-dine-staff-session'

const ROLE = 'manager'

const ROLE_LABEL = 'Manager'



export default function ManagerFaceLockLayout({ children }) {

  useMobileViewportLock()

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
      <main className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#09090b] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="pointer-events-none absolute left-1/2 top-[-10rem] h-80 w-80 -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />

        <div className="relative flex flex-1 items-center justify-center">
          <section className="w-full max-w-sm text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-orange-500 text-lg font-black shadow-xl shadow-orange-500/20">
              D
            </div>

            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
              Digital Dine Security
            </p>

            <h1 className="mt-2 text-2xl font-black tracking-tight">
              Opening {ROLE_LABEL}
            </h1>

            <p className="mx-auto mt-2 max-w-xs text-xs leading-6 text-neutral-500">
              Checking the secure staff session before the Manager workspace opens.
            </p>

            <div className="mx-auto mt-7 h-11 w-11 animate-spin rounded-full border-[3px] border-neutral-800 border-t-orange-500" />

            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-2 text-[9px] font-black text-neutral-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Secure session verification
            </div>
          </section>
        </div>
      </main>
    )
  }

  if (state === 'setup') {
    return (
      <main className="relative flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-[#09090b] px-4 pb-[calc(10rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="pointer-events-none absolute left-1/2 top-[-8rem] h-80 w-80 -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />

        <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-orange-500 text-sm font-black shadow-lg shadow-orange-500/20">
              D
            </div>

            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">
                Digital Dine
              </p>
              <p className="mt-0.5 text-xs font-bold text-neutral-500">
                Manager device security
              </p>
            </div>
          </div>

          <section className="mt-8 rounded-[28px] border border-neutral-800 bg-neutral-900/90 p-5 shadow-2xl">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-orange-500/20 bg-orange-500/10 text-3xl">
              🔐
            </div>

            <p className="mt-5 text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">
              Optional device lock
            </p>

            <h1 className="mt-2 text-2xl font-black tracking-tight">
              Enable {biometryName}?
            </h1>

            <p className="mt-3 text-sm leading-6 text-neutral-400">
              After a valid Manager login, this phone can verify you with its built-in biometric security before reopening the workspace.
            </p>

            <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex gap-3">
                <span className="text-lg">🛡️</span>
                <div>
                  <p className="text-[10px] font-black text-neutral-200">
                    Your biometric data stays on the device
                  </p>
                  <p className="mt-1 text-[10px] leading-5 text-neutral-500">
                    Digital Dine does not receive or store your face or fingerprint. Android or iOS performs the biometric match.
                  </p>
                </div>
              </div>
            </div>

            {message && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold leading-5 text-red-300">
                {message}
              </div>
            )}
          </section>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-neutral-950/95 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <div className="mx-auto grid w-full max-w-sm grid-cols-2 gap-2">
            <button
              type="button"
              onClick={continueWithoutBiometric}
              disabled={busy}
              className="min-h-14 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 text-xs font-black text-neutral-300 disabled:opacity-50"
            >
              Not Now
            </button>

            <button
              type="button"
              onClick={enableBiometric}
              disabled={busy}
              className="min-h-14 rounded-2xl bg-orange-500 px-4 text-xs font-black text-white shadow-lg shadow-orange-500/20 disabled:opacity-50"
            >
              {busy
                ? 'Checking...'
                : `Enable ${biometryName}`}
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (state === 'locked' || state === 'unavailable') {
    return (
      <main className="relative flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-[#09090b] px-4 pb-[calc(10rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="pointer-events-none absolute left-1/2 top-[-8rem] h-80 w-80 -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />

        <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-orange-500 text-sm font-black shadow-lg shadow-orange-500/20">
              D
            </div>

            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">
                Digital Dine
              </p>
              <p className="mt-0.5 text-xs font-bold text-neutral-500">
                Secure Manager access
              </p>
            </div>
          </div>

          <section className="mt-8 rounded-[28px] border border-neutral-800 bg-neutral-900/90 p-5 text-left shadow-2xl">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-orange-500/20 bg-orange-500/10 text-3xl">
              {state === 'unavailable' ? '⚠️' : '🔒'}
            </div>

            <p className="mt-5 text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">
              {ROLE_LABEL} Locked
            </p>

            <h1 className="mt-2 text-2xl font-black tracking-tight">
              {state === 'unavailable'
                ? 'Biometric unavailable'
                : `Unlock with ${biometryName}`}
            </h1>

            <p className="mt-3 text-sm leading-6 text-neutral-400">
              {state === 'unavailable'
                ? 'Biometric verification is not available right now. Use the normal Manager password login to regain access.'
                : `Verify on this phone to open the ${ROLE_LABEL} workspace.`}
            </p>

            {message && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold leading-5 text-red-300">
                {message}
              </div>
            )}
          </section>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-neutral-950/95 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-sm space-y-2">
            {state !== 'unavailable' && (
              <button
                type="button"
                onClick={authenticate}
                disabled={busy}
                className="min-h-14 w-full rounded-2xl bg-orange-500 px-4 text-sm font-black text-white shadow-lg shadow-orange-500/20 disabled:opacity-50"
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
              className="min-h-13 w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3.5 text-xs font-black text-neutral-300 disabled:opacity-50"
            >
              Use Password Login Instead
            </button>
          </div>
        </div>
      </main>
    )
  }

  return children

}
