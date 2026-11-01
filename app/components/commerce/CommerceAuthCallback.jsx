'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCommerceClient } from '@/lib/commerce/client'
import { parseCommerceCallback } from '@/lib/commerce/authRedirect'

export default function CommerceAuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Successful auth-js PKCE initialization removes the code with replaceState.
  // Preserve the original parameters so that cleanup does not restart this flow.
  const initialQuery = useRef(searchParams.toString())
  const [failed, setFailed] = useState(false)
  // Provider errors still block completion; retain a validated storefront's
  // fixed sign-in link so a customer can request a fresh email from that store.
  const backParams = new URLSearchParams(searchParams.toString())
  for (const name of ['error', 'error_code', 'error_description']) backParams.delete(name)
  const signInPath = parseCommerceCallback(backParams)?.signInPath || '/commerce/auth'

  useEffect(() => {
    let active = true
    async function complete() {
      try {
        const params = new URLSearchParams(initialQuery.current)
        const context = parseCommerceCallback(params)
        const codes = params.getAll('code')
        if (!context || codes.length !== 1 || !codes[0] || codes[0].length > 2048 ||
            /[\s\p{Cc}]/u.test(codes[0]) || window.location.hash) {
          throw new Error('Invalid callback.')
        }
        const client = getCommerceClient(context.scope)
        // getSession() alone can return an existing session even when URL
        // initialization failed. Await and check the installed SDK's result.
        const initialized = await client.auth.initialize()
        if (initialized.error) throw new Error('Invalid callback.')
        // auth-js removes `code` only after a successful PKCE URL exchange.
        // A missing verifier skips exchange and recovers an old stored session;
        // require this cleanup so wrong-scope/replayed links cannot pass that way.
        const current = new URL(window.location.href)
        if (current.searchParams.has('code') || current.hash) throw new Error('Invalid callback.')
        const { data, error } = await client.auth.getSession()
        const session = data?.session
        if (error || typeof session?.access_token !== 'string' || !session.access_token ||
            typeof session.user?.id !== 'string' || !session.user.id) {
          throw new Error('Invalid callback.')
        }
        if (active) router.replace(context.destination)
      } catch {
        // Never expose provider errors, callback codes or stored session details.
        if (active) setFailed(true)
      }
    }
    void complete()
    return () => { active = false }
  }, [router])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f5f7f3] px-5 py-10 text-neutral-950">
      <section className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">Digital Dine-In · Client Websites</p>
        <h1 className="mt-3 text-2xl font-semibold">{failed ? 'We could not complete sign-in.' : 'Completing your sign-in…'}</h1>
        {failed ? <>
          <p className="mt-3 text-sm leading-6 text-neutral-600" role="alert">This link is invalid or expired, or was opened in a different browser. Return to sign in and request a fresh email link.</p>
          <Link className="mt-6 inline-flex rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold" style={{ color: '#ffffff' }} href={signInPath}>Back to sign in</Link>
        </> : <p className="mt-3 text-sm leading-6 text-neutral-600" role="status">Please wait while we check your secure email link.</p>}
      </section>
    </main>
  )
}
