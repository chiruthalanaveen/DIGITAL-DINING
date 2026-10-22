'use client'

import { createClient } from '@supabase/supabase-js'

const clients = new Map()

export function getCommerceClient(scope = 'owner') {
  const key = `digital-dine-commerce:${scope}`
  if (clients.has(key)) return clients.get(key)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Commerce authentication is not configured.')

  const client = createClient(url, anonKey, {
    auth: {
      storageKey: key,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
  // Browser clients are separated by role and storefront. Never retain an SSR session.
  if (typeof window !== 'undefined') clients.set(key, client)
  return client
}

export async function commerceFetch(path, { client, method = 'GET', body, signal } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (client) {
    const { data, error } = await client.auth.getSession()
    if (error) throw new Error('Please sign in again.')
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`
  }
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.success !== true) {
    const error = new Error(result.message || 'The request could not be completed. Please try again.')
    error.status = response.status
    throw error
  }
  return result
}
