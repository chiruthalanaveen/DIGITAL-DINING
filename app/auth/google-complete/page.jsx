'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function GoogleCompletePage() {
  const router = useRouter()

  const hasStarted = useRef(false)

  const [message, setMessage] = useState(
    'Completing Google registration...'
  )

  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (hasStarted.current) {
      return
    }

    hasStarted.current = true

    const completeGoogleRegistration = async () => {
      try {
        setMessage('Checking your Google account...')

        // Get the currently authenticated Google user
        const {
          data: sessionData,
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw new Error(sessionError.message)
        }

        const user = sessionData?.session?.user

        if (!user) {
          throw new Error(
            'Google authentication session was not found. Please try again.'
          )
        }

        // Read additional registration details saved before OAuth
        const savedRegistration =
          localStorage.getItem(
            'digitaldining_google_registration'
          )

        let registrationDetails = {}

        if (savedRegistration) {
          try {
            registrationDetails = JSON.parse(
              savedRegistration
            )
          } catch (parseError) {
            console.error(
              'GOOGLE REGISTRATION STORAGE PARSE ERROR:',
              parseError
            )
          }
        }

        const metadata = user.user_metadata || {}

        const googleName =
          metadata.full_name ||
          metadata.name ||
          metadata.display_name ||
          user.email?.split('@')[0] ||
          'Restaurant Owner'

        const cleanName =
          registrationDetails.name?.trim() ||
          googleName.trim()

        const cleanEmail =
          user.email?.trim().toLowerCase()

        const cleanPhone =
          registrationDetails.phone?.trim() || ''

        const cleanDob =
          registrationDetails.dob?.trim() || ''

        if (!cleanEmail) {
          throw new Error(
            'Google did not provide an email address. Please use another Google account.'
          )
        }

        if (!cleanPhone || !cleanDob) {
          throw new Error(
            'Phone number or date of birth was missing. Please return to registration and try again.'
          )
        }

        setMessage(
          'Creating your restaurant profile...'
        )

        // Create restaurant profile through secure server API
        const response = await fetch(
          '/api/register/google',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: user.id,
              name: cleanName,
              email: cleanEmail,
              phone: cleanPhone,
              dob: cleanDob,
            }),
          }
        )

        const responseText = await response.text()

        let data = {}

        try {
          data = responseText
            ? JSON.parse(responseText)
            : {}
        } catch (parseError) {
          console.error(
            'GOOGLE PROFILE API INVALID RESPONSE:',
            responseText
          )

          throw new Error(
            'The Google registration server returned an invalid response.'
          )
        }

        if (!response.ok || !data.success) {
          throw new Error(
            data.message ||
              'Could not create your restaurant profile.'
          )
        }

        if (!data.restaurantId) {
          throw new Error(
            'Restaurant profile was created, but no restaurant ID was returned.'
          )
        }

        // Remove temporary browser data
        localStorage.removeItem(
          'digitaldining_google_registration'
        )

        const biometricEnabled =
          registrationDetails.biometricEnabled !== false

        // ============================================================
        // BIOMETRIC DISABLED
        // ============================================================

        if (!biometricEnabled) {
          setMessage(
            'Registration completed. Redirecting to subscription...'
          )

          router.replace(
            `/subscribe/${data.restaurantId}`
          )

          return
        }

        // ============================================================
        // CHECK PASSKEY SUPPORT
        // ============================================================

        if (
          typeof window === 'undefined' ||
          !window.PublicKeyCredential
        ) {
          alert(
            'Your Google restaurant account was created successfully. This browser does not support biometric/passkey login. You can enable it later on a supported device.'
          )

          router.replace(
            `/subscribe/${data.restaurantId}`
          )

          return
        }

        if (
          !supabase.auth.registerPasskey ||
          typeof supabase.auth.registerPasskey !== 'function'
        ) {
          console.error(
            'Supabase registerPasskey() is not available.'
          )

          alert(
            'Your Google restaurant account was created successfully. Biometric login is currently unavailable. You can continue without it.'
          )

          router.replace(
            `/subscribe/${data.restaurantId}`
          )

          return
        }

        // ============================================================
        // REGISTER GOOGLE USER PASSKEY
        // ============================================================

        setMessage(
          'Set up your biometric login...'
        )

        try {
          const {
            data: passkeyData,
            error: passkeyError,
          } = await supabase.auth.registerPasskey()

          if (passkeyError) {
            console.error(
              'GOOGLE PASSKEY REGISTRATION ERROR:',
              passkeyError
            )

            const errorCode =
              passkeyError.code ||
              passkeyError.name ||
              ''

            const errorText =
              passkeyError.message ||
              ''

            if (
              errorCode === 'webauthn_verification_failed' ||
              errorText
                .toLowerCase()
                .includes('credential verification failed')
            ) {
              alert(
                'Your Google restaurant account was created successfully, but biometric verification could not be completed. You can continue without biometric login.'
              )
            } else if (
              errorCode === 'webauthn_credential_exists' ||
              errorText
                .toLowerCase()
                .includes('credential already exists')
            ) {
              alert(
                'Your Google restaurant account was created successfully. This biometric/passkey is already registered.'
              )
            } else if (
              errorCode === 'passkey_disabled' ||
              errorText
                .toLowerCase()
                .includes('passkeys are disabled')
            ) {
              alert(
                'Your Google restaurant account was created successfully, but biometric login is currently disabled.'
              )
            } else if (
              errorCode === 'webauthn_challenge_expired' ||
              errorText
                .toLowerCase()
                .includes('challenge expired')
            ) {
              alert(
                'Your Google restaurant account was created successfully, but the biometric request expired. You can try again later.'
              )
            } else if (
              errorText
                .toLowerCase()
                .includes('cancel') ||
              errorText
                .toLowerCase()
                .includes('abort') ||
              errorText
                .toLowerCase()
                .includes('notallowed')
            ) {
              alert(
                'Your Google restaurant account was created successfully. Biometric setup was cancelled.'
              )
            } else {
              alert(
                'Your Google restaurant account was created successfully, but biometric setup could not be completed.'
              )
            }

            router.replace(
              `/subscribe/${data.restaurantId}`
            )

            return
          }

          if (!passkeyData) {
            alert(
              'Your Google restaurant account was created successfully. Biometric setup could not be confirmed, but you can continue.'
            )

            router.replace(
              `/subscribe/${data.restaurantId}`
            )

            return
          }

          alert(
            'Google Account Created and Biometric Login Enabled! 🔐'
          )

          router.replace(
            `/subscribe/${data.restaurantId}`
          )
        } catch (passkeyError) {
          console.error(
            'GOOGLE UNEXPECTED PASSKEY ERROR:',
            passkeyError
          )

          alert(
            'Your Google restaurant account was created successfully, but biometric setup could not be completed. You can continue without biometric login.'
          )

          router.replace(
            `/subscribe/${data.restaurantId}`
          )
        }
      } catch (error) {
        console.error(
          'GOOGLE REGISTRATION COMPLETION ERROR:',
          error
        )

        localStorage.removeItem(
          'digitaldining_google_registration'
        )

        setErrorMessage(
          error?.message ||
            'Google registration could not be completed.'
        )

        setMessage('')
      }
    }

    completeGoogleRegistration()
  }, [router])

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans">

      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-8 shadow-2xl text-center">

        {!errorMessage ? (
          <>
            <div className="mx-auto mb-5 h-12 w-12 rounded-full border-4 border-neutral-700 border-t-orange-500 animate-spin" />

            <h1 className="text-xl font-black text-white">
              Please wait
            </h1>

            <p className="text-sm text-neutral-400 mt-3">
              {message}
            </p>
          </>
        ) : (
          <>
            <div className="text-4xl mb-4">
              ⚠️
            </div>

            <h1 className="text-xl font-black text-white">
              Registration Could Not Be Completed
            </h1>

            <p className="text-sm text-red-400 mt-3 leading-relaxed">
              {errorMessage}
            </p>

            <button
              type="button"
              onClick={() => router.replace('/register')}
              className="mt-6 w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider transition"
            >
              Return to Registration
            </button>
          </>
        )}

      </div>

    </div>
  )
}