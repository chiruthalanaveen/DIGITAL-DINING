// EXACT PATH: app/api/delivery/customer/mobile-device/route.js
// No-SMS-OTP: safe DEVICE-BOUND registration and login.
// IMPORTANT: mobile+DOB is NOT sufficient to access private data on another device.
// Access requires a separate cryptographically random, browser-held credential.
// This deliberately does not link or take over preexisting phone/Google accounts.
import 'server-only'
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MOBILE = /^[6-9][0-9]{9}$/
const json = (data, status = 200) => NextResponse.json(data, {
  status,
  headers: {
    'Cache-Control': 'private, no-store',
    'Vary': 'Authorization, Cookie',
    'X-Content-Type-Options': 'nosniff',
  },
})
function dobValid(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value &&
    value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10)
}
const clean = (value, max = 100) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, max)
function scryptHash(value, salt) {
  const pepper = String(process.env.DELIVERY_DOB_HASH_PEPPER || '')
  if (pepper.length < 32) throw new Error('DELIVERY_DOB_HASH_PEPPER must be 32+ characters.')
  return scryptSync(`${pepper}:${value}`, salt, 64).toString('hex')
}
function sameHash(a, b) {
  const aa = Buffer.from(String(a || ''), 'hex')
  const bb = Buffer.from(String(b || ''), 'hex')
  return aa.length === 64 && bb.length === 64 && timingSafeEqual(aa, bb)
}
function throttleKey(request, mobile) {
  const pepper = String(process.env.DELIVERY_AUTH_THROTTLE_PEPPER || '')
  if (pepper.length < 32) throw new Error('DELIVERY_AUTH_THROTTLE_PEPPER must be 32+ characters.')
  // IP is provided by the hosting proxy, not accepted from a client body.
  const ip = String(request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].slice(0, 100)
  return createHash('sha256').update(`dd-device-registration|${pepper}|${ip}|${mobile}`).digest('hex')
}

async function register(request, body) {
  if (process.env.DELIVERY_ENABLE_UNVERIFIED_DEVICE_ACCOUNTS !== 'true') {
    return json({ success: false, message: 'Device-only registration is disabled. Enable it only after staging review; Google sign-in is available.' }, 403)
  }
  const name = clean(body.name)
  const mobile = String(body.mobile || '').replace(/\D/g, '')
  const dob = String(body.dateOfBirth || '')
  if (name.length < 2 || name.length > 100 || !MOBILE.test(mobile) || !dobValid(dob)) {
    return json({ success: false, message: 'Enter your full name, 10-digit mobile number and valid date of birth.' }, 400)
  }
  const admin = getAdminSupabase()
  const { data: allowed, error: throttleError } = await admin.rpc('delivery_device_signup_throttle', {
    p_key: throttleKey(request, mobile), p_max: 3, p_window_seconds: 3600,
  })
  if (throttleError) throw throttleError
  if (allowed !== true) {
    return json({ success: false, message: 'Too many registrations. Please try again later.' }, 429)
  }

  // This internal alias is NOT a customer email or mobile verification claim.
  // The user can authenticate only with the secret generated in their browser.
  const internalEmail = `dd-device-${randomBytes(20).toString('hex')}@accounts.digitaldine-in.online`
  const devicePassword = randomBytes(48).toString('hex')
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: internalEmail,
    password: devicePassword,
    email_confirm: true,
    app_metadata: { delivery_auth_method: 'mobile_device' },
    user_metadata: {
      full_name: name,
      phone: mobile,
      phone_unverified: true,
    },
  })
  if (authError || !created?.user?.id) {
    console.error('[DELIVERY DEVICE REGISTER USER]', authError?.code || authError?.message)
    return json({ success: false, message: 'Unable to create your Delivery account right now.' }, 503)
  }
  const id = created.user.id
  try {
    const salt = randomBytes(16).toString('hex')
    const { error: deviceError } = await admin.from('delivery_customer_device_accounts').insert({
      user_id: id, unverified_mobile: mobile,
      dob_salt: salt, dob_hash: scryptHash(dob, salt),
    })
    if (deviceError) throw deviceError
    const { error: profileError } = await admin.from('delivery_customer_profiles').upsert({
      id, full_name: name, email: null, avatar_url: null,
    }, { onConflict: 'id' })
    if (profileError) throw profileError
    return json({
      success: true,
      message: 'This device has been registered. Your mobile number is not verified.',
      loginEmail: internalEmail,
      devicePassword, // Returned once to the registering browser over HTTPS. Never logged.
    }, 201)
  } catch (error) {
    console.error('[DELIVERY DEVICE REGISTER DATA]', error?.code || error?.message)
    // Avoid orphaned auth users when profile and device registration fail.
    const { error: deleteError } = await admin.auth.admin.deleteUser(id)
    if (deleteError) console.error('[DELIVERY DEVICE REGISTER ROLLBACK]', deleteError.code || deleteError.message)
    return json({ success: false, message: 'Unable to set up the account. Apply the device-auth migration and profile permissions first.' }, 503)
  }
}

async function verify(request, body) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '')?.[1]
  if (!token) return json({ success: false, message: 'Sign in on your registered device first.' }, 401)
  const mobile = String(body.mobile || '').replace(/\D/g, '')
  const dob = String(body.dateOfBirth || '')
  if (!MOBILE.test(mobile) || !dobValid(dob)) {
    return json({ success: false, message: 'Check your mobile number and date of birth.' }, 400)
  }
  const admin = getAdminSupabase()
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  const user = auth?.user
  if (authError || !user?.id || user.app_metadata?.delivery_auth_method !== 'mobile_device') {
    return json({ success: false, message: 'This is not a registered mobile device account.' }, 401)
  }
  const { data: record, error: lookupError } = await admin
    .from('delivery_customer_device_accounts')
    .select('unverified_mobile,dob_salt,dob_hash,attempts,locked_until')
    .eq('user_id', user.id).maybeSingle()
  if (lookupError) throw lookupError
  if (!record) return json({ success: false, message: 'Device registration not found.' }, 401)
  if (record.locked_until && Date.parse(record.locked_until) > Date.now()) {
    return json({ success: false, message: 'Too many attempts. Try again later.' }, 429)
  }
  const match = mobile === record.unverified_mobile && sameHash(scryptHash(dob, record.dob_salt), record.dob_hash)
  if (!match) {
    const attempts = Number(record.attempts || 0) + 1
    const { error: updateError } = await admin.from('delivery_customer_device_accounts')
      .update({ attempts: attempts >= 5 ? 0 : attempts,
        locked_until: attempts >= 5 ? new Date(Date.now() + 30 * 60_000).toISOString() : null,
        updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
    if (updateError) throw updateError
    return json({ success: false, message: 'Mobile number or date of birth did not match.' }, 401)
  }
  const { error: resetError } = await admin.from('delivery_customer_device_accounts')
    .update({ attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (resetError) throw resetError
  return json({ success: true, message: 'Registered device account confirmed.' })
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || !['register', 'verify'].includes(body.action)) {
      return json({ success: false, message: 'Invalid authentication action.' }, 400)
    }
    return body.action === 'register' ? await register(request, body) : await verify(request, body)
  } catch (error) {
    console.error('[DELIVERY MOBILE DEVICE AUTH]', error?.code || error?.message)
    return json({ success: false, message: 'Mobile device sign-in is unavailable. Check the SQL migration and server configuration.' }, 503)
  }
}
