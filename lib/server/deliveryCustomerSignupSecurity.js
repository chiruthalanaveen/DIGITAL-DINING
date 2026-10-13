import { createHash } from 'node:crypto'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

const STORE_CODE = /^[A-Za-z0-9_-]{1,80}$/
const MOBILE = /^[6-9]\d{9}$/
export const QUESTION_KEYS = ['first_trip', 'childhood_street', 'first_teacher', 'private_phrase']
export const CUSTOMER_COOKIE = 'digitaldine_delivery_customer_session'
export const CUSTOMER_COOKIE_MAX_AGE = 30 * 24 * 60 * 60
export function validStoreCode(value) { return STORE_CODE.test(String(value || '').trim()) }
export function cleanMobile(value) { return String(value || '').replace(/\D/g,'') }
export function validMobile(value) { return MOBILE.test(value) }
export function validPin(value) { return /^\d{4}$/.test(String(value || '')) }
export function safeText(value, max = 100) { return String(value || '').trim().replace(/[<>]/g,'').slice(0,max) }

export async function getSignupPolicy(admin) {
  const { data, error } = await admin.from('delivery_customer_signup_policy')
    .select('signup_mode,updated_at').eq('id',1).single()
  if (error || !['otp','pin_question'].includes(data?.signup_mode)) {
    throw new Error('Delivery signup policy is not configured.')
  }
  return data
}

export async function enforceSignupThrottle(request, action, restaurantCode, mobile, max = 5) {
  const admin = getAdminSupabase()
  // This is a defense-in-depth limit. Use a trusted reverse proxy and CAPTCHA as well.
  const ip = String(request.headers.get('x-real-ip') || request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0,70)
  const pepper = String(process.env.DELIVERY_AUTH_THROTTLE_PEPPER || process.env.ADMIN_SESSION_SECRET || '')
  if (pepper.length < 32) throw new Error('Set DELIVERY_AUTH_THROTTLE_PEPPER (32+ characters) before enabling mobile registration.')
  const digest = createHash('sha256').update(`${pepper}|${action}|${ip}|${restaurantCode}|${mobile}`).digest('hex')
  const { data, error } = await admin.rpc('delivery_auth_throttle_check', {
    p_key: digest, p_max: max, p_window_seconds: 1800,
  })
  if (error) throw error
  return data === true
}

export function respond(body, status = 200) {
  // This file is imported only from Next.js server routes. Use native Response.
  return Response.json(body, {status, headers:{'Cache-Control':'private, no-store','Vary':'Authorization, Cookie'}})
}
export function issueCustomerSession(response, rawToken) {
  if (!/^[0-9a-f]{64}$/i.test(String(rawToken || ''))) return false
  // API routes call this after verifying the DB token returned by registration.
  return true
}
