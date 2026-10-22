import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import { isSameOriginAdminRequest } from '@/lib/server/adminRequestOrigin'

export class CommerceError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'CommerceError'; this.status = status }
}

export function parse(schema, value) {
  const result = schema.safeParse(value)
  if (!result.success) throw new CommerceError(result.error.issues[0]?.message || 'Check the submitted fields.')
  return result.data
}

export function requireSameOrigin(request) {
  if (!isSameOriginAdminRequest(request)) throw new CommerceError('A same-origin browser request is required.', 403)
}

export async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new CommerceError('Send a JSON request.', 415)
  const limit = 65536
  if (Number(request.headers.get('content-length')) > limit) throw new CommerceError('The request is too large.', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new CommerceError('A JSON body is required.')
  const chunks = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw new CommerceError('The request is too large.', 413) }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    try { return JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new CommerceError('Invalid JSON request.') }
  } finally { reader.releaseLock() }
}

export function publicClient(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new CommerceError('Client Websites is not configured.', 503)
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      fetch: (input, init = {}) => fetch(input, { ...init, cache: 'no-store', signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) }),
    },
  })
}

export async function userContext(request) {
  const header = request.headers.get('authorization') || ''
  const token = header.length <= 8192 ? /^Bearer\s+([^\s]+)$/i.exec(header)?.[1] : null
  if (!token) throw new CommerceError('Sign in to continue.', 401)
  const client = publicClient(token)
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user?.id) throw new CommerceError('Your session is invalid or expired. Sign in again.', 401)
  if (!data.user.email || !data.user.email_confirmed_at) throw new CommerceError('Verify your email address before continuing.', 403)
  return { client, user: data.user }
}

export function adminContext(request, mutation = false) {
  const session = requireAdmin(request)
  if (!session) throw new CommerceError('Super Admin sign-in required.', 401)
  if (mutation) requireSameOrigin(request)
  return { client: getAdminSupabase(), session }
}

export async function dataResult(query) {
  const boundedQuery = typeof query?.abortSignal === 'function'
    ? query.abortSignal(AbortSignal.timeout(10000))
    : query
  const { data, error, status } = await boundedQuery
  if (error) {
    const code = String(error.code || '')
    const message = String(error.message || '')
    if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(code)) throw new CommerceError('Client Websites database setup is not installed. Contact the platform administrator.', 503)
    const upstreamStatus = Number(status || error.status || 0)
    if (code.startsWith('08') || code.startsWith('57P') || code === '57014' || (upstreamStatus >= 500 && upstreamStatus <= 599)) throw new CommerceError('Client Websites is temporarily unavailable. Please try again.', 503)
    if (code === '42501' || /permission|access denied|not authorized|membership/i.test(message)) throw new CommerceError('You do not have permission for this website.', 403)
    if (code === '23505' || /stock|idempotency|duplicate|already|transition/i.test(message)) throw new CommerceError('The request conflicts with the current stock or saved state. Refresh and try again.', 409)
    if (['23514', '22023', '22P02', '23503'].includes(code) || /invalid|required|disabled|unavailable|pharmacy|verified|approved/i.test(message)) throw new CommerceError('This request is not permitted by the website configuration.', 400)
    throw new CommerceError('Client Websites is temporarily unavailable. Please try again.', 503)
  }
  return data
}

export async function ownerContext(request, websiteId) {
  const { client, user } = await userContext(request)
  const membership = await dataResult(client.from('commerce_memberships').select('website_id,user_id,role,active').eq('website_id', websiteId).eq('user_id', user.id).eq('role', 'owner').eq('active', true).maybeSingle())
  if (!membership) throw new CommerceError('You do not have permission for this website.', 403)
  const website = await dataResult(client.from('commerce_websites').select('*').eq('id', websiteId).maybeSingle())
  if (!website) throw new CommerceError('Website not found.', 404)
  return { client, user, membership, website }
}

export function can(website, permission) { return website.owner_permissions?.[permission] === true }
export function feature(website, name) { return website.features?.[name] === true }

export async function run(work, status = 200) {
  try {
    return NextResponse.json({ success: true, ...await work() }, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie', 'X-Content-Type-Options': 'nosniff' } })
  } catch (error) {
    const known = error instanceof CommerceError
    if (!known) console.error('[COMMERCE]', error?.name || 'ServerError')
    return NextResponse.json({ success: false, message: known ? error.message : 'Client Websites is temporarily unavailable. Please try again.' }, { status: known ? error.status : 503, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie', 'X-Content-Type-Options': 'nosniff' } })
  }
}
