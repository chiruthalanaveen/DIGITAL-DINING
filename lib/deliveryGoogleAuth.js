'use client'

import { supabase } from '@/lib/supabase'

// This context contains navigation choices only, never tokens or passwords.
const CONTEXT_KEY = 'digitaldine_delivery_google_oauth_v1'
const CONTEXT_TTL_MS = 15 * 60 * 1000

export function safeDeliveryNext(value) {
  const raw = String(value || '').trim()
  if (
    !raw ||
    (raw !== '/delivery' && !raw.startsWith('/delivery/')) ||
    raw.startsWith('//') ||
    raw.includes('\\') ||
    /[\r\n]/.test(raw)
  ) return '/delivery'
  return raw
}

function cleanStoreCode(value) {
  const code = String(value || '').trim()
  return /^[A-Za-z0-9_-]{1,80}$/.test(code) ? code : ''
}

export function saveDeliveryGoogleContext({ nextPath, storeCode, mode = 'login' } = {}) {
  if (typeof window === 'undefined') return
  const value = JSON.stringify({
    next: safeDeliveryNext(nextPath),
    store: cleanStoreCode(storeCode),
    mode: mode === 'signup' ? 'signup' : 'login',
    createdAt: Date.now(),
  })
  // Session storage is preferred, but local storage covers some browser redirects.
  try { window.sessionStorage.setItem(CONTEXT_KEY, value) } catch { /* blocked */ }
  try { window.localStorage.setItem(CONTEXT_KEY, value) } catch { /* blocked */ }
}

export function readDeliveryGoogleContext() {
  if (typeof window === 'undefined') return { next: '/delivery', store: '', mode: 'login' }
  let raw = ''
  try { raw = window.sessionStorage.getItem(CONTEXT_KEY) || '' } catch { /* blocked */ }
  if (!raw) {
    try { raw = window.localStorage.getItem(CONTEXT_KEY) || '' } catch { /* blocked */ }
  }
  try {
    const context = JSON.parse(raw || '{}')
    const age = Date.now() - Number(context.createdAt)
    if (!Number.isFinite(age) || age < 0 || age > CONTEXT_TTL_MS) {
      return { next: '/delivery', store: '', mode: 'login' }
    }
    return {
      next: safeDeliveryNext(context.next),
      store: cleanStoreCode(context.store),
      mode: context.mode === 'signup' ? 'signup' : 'login',
    }
  } catch {
    return { next: '/delivery', store: '', mode: 'login' }
  }
}

export function clearDeliveryGoogleContext() {
  if (typeof window === 'undefined') return
  try { window.sessionStorage.removeItem(CONTEXT_KEY) } catch { /* blocked */ }
  try { window.localStorage.removeItem(CONTEXT_KEY) } catch { /* blocked */ }
}

export async function startDeliveryGoogleOAuth({ nextPath, storeCode, mode = 'login' } = {}) {
  if (typeof window === 'undefined') throw new Error('Google login needs a browser.')
  saveDeliveryGoogleContext({ nextPath, storeCode, mode })

  // IMPORTANT: Stable callback URL, with NO varying query parameters.
  // Add this exact URL (for each used origin) to Supabase's redirect allow-list.
  const redirectTo = new URL('/auth/delivery-callback', window.location.origin).toString()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { prompt: 'select_account' },
    },
  })

  if (error) {
    clearDeliveryGoogleContext()
    throw error
  }
}
