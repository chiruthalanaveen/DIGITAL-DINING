'use client'
// Destination: app/components/DeliveryAppAuthGate.jsx
// The delivery app starts with login when the browser has no valid Supabase session.
// This is a UX gate: DB RLS, RPCs and checkout remain the real security boundaries.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function safeNext(nextPath) {
  const value = String(nextPath || '/delivery')
  if (!value.startsWith('/delivery') || value.startsWith('//') ||
      value.includes('\\') || /[\r\n]/.test(value) ||
      /^\/delivery\/(?:login|signup|forgot-pin|complete-profile)(?:[/?]|$)/.test(value)) {
    return '/delivery'
  }
  return value
}

export default function DeliveryAppAuthGate({ nextPath = '/delivery', children }) {
  const router = useRouter()
  const [status, setStatus] = useState('checking')
  const [retry, setRetry] = useState(0)
  const destination = safeNext(nextPath)
  const loginUrl = `/delivery/login?next=${encodeURIComponent(destination)}`

  const verify = useCallback(async (alive) => {
    try {
      // getUser checks validity with Supabase Auth; getSession alone can be stale.
      const { data, error } = await supabase.auth.getUser()
      if (!alive()) return
      if (error) {
        // Never treat a cached, unverified token as a valid account.
        if ([400,401,403].includes(Number(error.status)) || /session missing|auth session missing|invalid jwt|refresh token not found/i.test(error.message || '')) setStatus('unsigned')
        else setStatus('error')
        return
      }
      setStatus(data?.user?.id ? 'signed' : 'unsigned')
    } catch {
      if (alive()) setStatus('error')
    }
  }, [])

  useEffect(() => {
    let active = true
    setStatus('checking')
    void verify(() => active)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { if (active) setStatus('unsigned'); return }
      // Never call getUser synchronously within onAuthStateChange.
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        Promise.resolve().then(() => { if (active) void verify(() => active) })
      }
    })
    return () => { active = false; subscription?.unsubscribe() }
  }, [verify, retry])

  useEffect(() => {
    if (status === 'unsigned') router.replace(loginUrl)
  }, [status, loginUrl, router])

  if (status === 'signed') return children
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f5f7f4] p-6 text-slate-900" role="status">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-xl font-black text-white">DD</div>
        <h1 className="mt-4 text-xl font-black">Digital Dine-In Delivery</h1>
        {status === 'error' ? (
          <>
            <p className="mt-2 text-sm text-slate-600">Unable to verify your internet connection and customer session.</p>
            <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-5 w-full rounded-xl bg-emerald-600 p-3 text-sm font-bold text-white">Retry</button>
            <button type="button" onClick={() => router.push(loginUrl)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm font-bold">Open sign in</button>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-500">{status === 'unsigned' ? 'Opening login…' : 'Verifying your account…'}</p>
        )}
      </div>
    </main>
  )
}