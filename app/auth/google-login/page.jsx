'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const OWNER_GOOGLE_CONTEXT_KEY =
  'digitaldining_owner_google_context'

const OWNER_APP_CONTEXT_KEY =
  'digitaldining_owner_app_context'

const MOBILE_CONTEXT_MAX_AGE_MS =
  15 * 60 * 1000

export default function GoogleLoginCallbackPage() {
  const router = useRouter()

  const [message, setMessage] = useState(
    'Completing Google sign in...'
  )

  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const clearGoogleContext = () => {
      try {
        sessionStorage.removeItem(
          OWNER_GOOGLE_CONTEXT_KEY
        )
        localStorage.removeItem(
          OWNER_GOOGLE_CONTEXT_KEY
        )
      } catch {}
    }

    const readGoogleContext = () => {
      if (
        typeof window === 'undefined'
      ) {
        return null
      }

      let raw = ''

      try {
        raw =
          sessionStorage.getItem(
            OWNER_GOOGLE_CONTEXT_KEY
          ) ||
          localStorage.getItem(
            OWNER_GOOGLE_CONTEXT_KEY
          ) ||
          ''
      } catch {
        return null
      }

      if (!raw) {
        return null
      }

      try {
        const parsed =
          JSON.parse(raw)

        const createdAt =
          Number(parsed?.createdAt || 0)

        const age =
          Date.now() - createdAt

        const isValid =
          parsed?.source ===
            'owner-app' &&
          Boolean(
            String(
              parsed?.restaurantId ||
                ''
            ).trim()
          ) &&
          Number.isFinite(age) &&
          age >= 0 &&
          age <=
            MOBILE_CONTEXT_MAX_AGE_MS

        if (!isValid) {
          clearGoogleContext()
          return null
        }

        return {
          source: 'owner-app',
          restaurantId: String(
            parsed.restaurantId
          ).trim(),
          restaurantCode: String(
            parsed.restaurantCode || ''
          )
            .replace(/\D/g, '')
            .slice(0, 5),
        }
      } catch {
        clearGoogleContext()
        return null
      }
    }

    const waitForGoogleSession =
      async () => {
        /*
         * lib/supabase.js uses detectSessionInUrl:true.
         * Usually getSession() already sees the OAuth session.
         * If the PKCE code is still present and the session has
         * not been exchanged yet, exchange it once here.
         */
        let {
          data: { session },
          error: sessionError,
        } =
          await supabase.auth
            .getSession()

        if (
          !session &&
          !sessionError &&
          typeof window !==
            'undefined'
        ) {
          const params =
            new URLSearchParams(
              window.location.search
            )

          const code =
            params.get('code')

          if (
            code &&
            typeof supabase.auth
              .exchangeCodeForSession ===
              'function'
          ) {
            const {
              data: exchangeData,
              error: exchangeError,
            } =
              await supabase.auth
                .exchangeCodeForSession(
                  code
                )

            if (!exchangeError) {
              session =
                exchangeData?.session ||
                null
            } else {
              /*
               * detectSessionInUrl may have exchanged the same
               * code just before this call. Re-check once.
               */
              const {
                data: retryData,
              } =
                await supabase.auth
                  .getSession()

              session =
                retryData?.session ||
                null

              if (
                !session &&
                exchangeError
              ) {
                throw exchangeError
              }
            }
          }
        }

        if (sessionError) {
          throw sessionError
        }

        if (session?.user) {
          return session.user
        }

        const {
          data: { user },
          error: userError,
        } =
          await supabase.auth
            .getUser()

        if (
          userError ||
          !user?.id
        ) {
          throw new Error(
            'Google authentication session could not be verified.'
          )
        }

        return user
      }

    const finishGoogleLogin =
      async () => {
        const mobileContext =
          readGoogleContext()

        try {
          if (active) {
            setMessage(
              mobileContext
                ? 'Opening Owner mobile portal...'
                : 'Opening restaurant dashboard...'
            )
          }

          const user =
            await waitForGoogleSession()

          const provider = String(
            user?.app_metadata
              ?.provider || ''
          ).toLowerCase()

          const hasGoogleIdentity =
            Array.isArray(
              user?.identities
            ) &&
            user.identities.some(
              (identity) =>
                String(
                  identity?.provider ||
                    ''
                ).toLowerCase() ===
                'google'
            )

          if (
            provider &&
            provider !== 'google' &&
            !hasGoogleIdentity
          ) {
            throw new Error(
              'This is not a Google authentication session.'
            )
          }

          if (mobileContext) {
            const {
              data: selectedRestaurant,
              error:
                selectedRestaurantError,
            } = await supabase
              .from('restaurants')
              .select(
                'id, owner_id, restaurant_code, name'
              )
              .eq(
                'id',
                mobileContext
                  .restaurantId
              )
              .eq(
                'owner_id',
                user.id
              )
              .maybeSingle()

            if (
              selectedRestaurantError
            ) {
              throw selectedRestaurantError
            }

            if (
              !selectedRestaurant?.id
            ) {
              await supabase.auth
                .signOut()

              clearGoogleContext()

              const params =
                new URLSearchParams()

              params.set(
                'restaurantId',
                mobileContext
                  .restaurantId
              )

              if (
                mobileContext
                  .restaurantCode
              ) {
                params.set(
                  'restaurantCode',
                  mobileContext
                    .restaurantCode
                )
              }

              params.set(
                'googleError',
                'This Google account is not the Owner account for the selected restaurant. Please choose the correct Google account.'
              )

              router.replace(
                `/app/owner?${params.toString()}`
              )
              return
            }

            try {
              sessionStorage.setItem(
                OWNER_APP_CONTEXT_KEY,
                JSON.stringify({
                  restaurantId:
                    selectedRestaurant.id,
                  restaurantCode:
                    mobileContext
                      .restaurantCode ||
                    selectedRestaurant
                      .restaurant_code ||
                    '',
                })
              )
            } catch {}

            clearGoogleContext()

            router.replace(
              `/app/owner/${encodeURIComponent(
                String(
                  selectedRestaurant.id
                )
              )}`
            )
            router.refresh()
            return
          }

          /*
           * NORMAL WEBSITE GOOGLE LOGIN
           * Preserve the existing website behavior when there is
           * no mobile Owner OAuth context.
           */
          const {
            data: restaurants,
            error: restaurantError,
          } = await supabase
            .from('restaurants')
            .select(
              'id, owner_id, created_at'
            )
            .eq(
              'owner_id',
              user.id
            )
            .order(
              'created_at',
              { ascending: false }
            )
            .limit(1)

          if (restaurantError) {
            throw restaurantError
          }

          const restaurant =
            Array.isArray(
              restaurants
            )
              ? restaurants[0]
              : null

          if (!restaurant?.id) {
            await supabase.auth
              .signOut()

            throw new Error(
              'No restaurant account is linked to this Google account.'
            )
          }

          clearGoogleContext()

          router.replace(
            `/dashboard/${encodeURIComponent(
              String(restaurant.id)
            )}`
          )
          router.refresh()
        } catch (loginError) {
          console.error(
            '[GOOGLE LOGIN CALLBACK] Error:',
            loginError
          )

          if (!active) {
            return
          }

          const mobileContext =
            readGoogleContext()

          if (mobileContext) {
            const params =
              new URLSearchParams()

            params.set(
              'restaurantId',
              mobileContext.restaurantId
            )

            if (
              mobileContext
                .restaurantCode
            ) {
              params.set(
                'restaurantCode',
                mobileContext
                  .restaurantCode
              )
            }

            params.set(
              'googleError',
              loginError?.message ||
                'Google sign in failed.'
            )

            clearGoogleContext()

            router.replace(
              `/app/owner?${params.toString()}`
            )
            return
          }

          clearGoogleContext()

          setError(
            loginError?.message ||
              'Google sign in failed.'
          )
        }
      }

    finishGoogleLogin()

    return () => {
      active = false
    }
  }, [router])

  if (error) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-neutral-950 px-5 text-white">
        <section className="w-full max-w-sm rounded-[28px] border border-red-500/20 bg-neutral-900 p-6 text-center shadow-2xl">
          <div className="text-3xl">
            ⚠️
          </div>

          <h1 className="mt-3 text-lg font-black">
            Google Sign In Failed
          </h1>

          <p className="mt-2 text-[11px] leading-5 text-red-300">
            {error}
          </p>

          <button
            type="button"
            onClick={() =>
              router.replace('/login')
            }
            className="mt-5 w-full rounded-2xl bg-orange-500 py-3 text-xs font-black text-white"
          >
            Back to Login
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-neutral-950 px-5 text-white">
      <div className="text-center">
        <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-neutral-800 border-t-orange-500" />

        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
          Google Sign In
        </p>

        <p className="mt-2 text-xs font-semibold text-neutral-400">
          {message}
        </p>
      </div>
    </main>
  )
}
