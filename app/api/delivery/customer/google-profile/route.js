// Destination: app/api/delivery/customer/google-profile/route.js
// Requires Supabase service_role SELECT/INSERT/UPDATE grants on
// public.delivery_customer_profiles. Never use anon key for this server API.
// Supabase Auth customer profile (Google, SMS-verified phone, or device-bound mobile).
// Kept at the existing google-profile URL to preserve old client integrations.
import 'server-only'

import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MOBILE = /^[6-9][0-9]{9}$/
const PHONE = /^\+91[6-9][0-9]{9}$/
const json = (payload, status = 200) => NextResponse.json(payload, {
  status,
  headers: {
    'Cache-Control': 'private, no-store',
    'Vary': 'Authorization',
    'X-Content-Type-Options': 'nosniff',
  },
})
const cleanPhone = value => String(value || '').replace(/\D/g, '').slice(-10)

async function verifiedCustomer(admin, request) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '')?.[1]
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  const user = data?.user
  if (error || !user?.id) return null
  const hasGoogle = user.identities?.some(item => item.provider === 'google') ||
    user.app_metadata?.provider === 'google' ||
    user.app_metadata?.providers?.includes('google')
  if (hasGoogle) return { user, type: 'google' }
  // Server-issued marker: user_metadata alone is never accepted for this auth method.
  if (user.app_metadata?.delivery_auth_method === 'mobile_device') {
    return { user, type: 'device' }
  }
  if (PHONE.test(String(user.phone || '')) && user.phone_confirmed_at) {
    return { user, type: 'phone' }
  }
  return null
}

async function profileState(admin, account) {
  const { user, type } = account
  // Date of birth is required only for Mobile + DOB customers. Google
  // customers must not fail just because the optional DOB migration has not
  // yet been installed. This is a server-side schema compatibility change.
  const fields = type === 'phone' ? 'id,full_name,date_of_birth' : 'id,full_name'
  const { data: existing, error: lookupError } = await admin
    .from('delivery_customer_profiles')
    .select(fields)
    .eq('id', user.id)
    .maybeSingle()
  if (lookupError) throw lookupError

  // Google signup creates an initial customer profile automatically.
  // Phone signups create their profile in /mobile-dob after SMS verification.
  if (!existing && type === 'google') {
    const name = String(user.user_metadata?.full_name || user.user_metadata?.name ||
      user.email?.split('@')[0] || 'Customer').trim().slice(0, 100)
    const avatar = String(user.user_metadata?.avatar_url || user.user_metadata?.picture || '').trim()
    const { error: insertError } = await admin.from('delivery_customer_profiles').insert({
      id: user.id,
      full_name: name,
      email: type === 'device' ? null : user.email || null,
      avatar_url: avatar || null,
    })
    if (insertError && insertError.code !== '23505') throw insertError
  }

  const { data: addresses, error: addressError } = await admin
    .from('delivery_customer_saved_addresses')
    .select('id,recipient_mobile')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
  if (addressError) throw addressError

  const saved = addresses?.[0] || null
  let deviceMobile = ''
  if (type === 'device') {
    const { data: device, error: deviceError } = await admin
      .from('delivery_customer_device_accounts').select('unverified_mobile')
      .eq('user_id', user.id).maybeSingle()
    if (deviceError) throw deviceError
    if (!device) throw new Error('Mobile device registration is incomplete.')
    deviceMobile = device.unverified_mobile
  }
  const name = String(existing?.full_name || user.user_metadata?.full_name ||
    user.user_metadata?.name || user.email?.split('@')[0] || '').trim()
  const mobile = type === 'phone'
    ? cleanPhone(user.phone)
    : type === 'device' ? deviceMobile
      : cleanPhone(user.user_metadata?.phone) || cleanPhone(saved?.recipient_mobile)
  return {
    type,
    name,
    mobile,
    email: type === 'device' ? '' : user.email || '',
    hasSavedAddress: Boolean(saved),
    complete: name.length >= 2 && MOBILE.test(mobile) && Boolean(saved) &&
      (type !== 'phone' || Boolean(existing?.date_of_birth)),
  }
}

export async function GET(request) {
  try {
    const admin = getAdminSupabase()
    const account = await verifiedCustomer(admin, request)
    if (!account) return json({ success: false, message: 'Sign in with Google, SMS-verified mobile, or a registered device.' }, 401)
    return json({ success: true, profile: await profileState(admin, account) })
  } catch (error) {
    console.error('[DELIVERY CUSTOMER PROFILE GET]', error?.code || 'ERROR', error?.message)
    return json({ success: false, message: 'Unable to load Delivery profile. Check the database migration.' }, 503)
  }
}

export async function POST(request) {
  try {
    const admin = getAdminSupabase()
    const account = await verifiedCustomer(admin, request)
    if (!account) return json({ success: false, message: 'Sign in to save your Delivery profile.' }, 401)
    const { user, type } = account
    const body = await request.json().catch(() => null)
    const name = String(body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 100)
    const mobile = cleanPhone(body?.mobile)
    if (name.length < 2 || !MOBILE.test(mobile)) {
      return json({ success: false, message: 'Enter your name and a valid 10-digit mobile number.' }, 400)
    }
    if (type === 'phone' && mobile !== cleanPhone(user.phone)) {
      return json({ success: false, message: 'Your mobile contact must match the SMS-verified login number.' }, 400)
    }
    if (type === 'device') {
      const { data: registered, error: deviceError } = await admin
        .from('delivery_customer_device_accounts').select('unverified_mobile')
        .eq('user_id', user.id).maybeSingle()
      if (deviceError) throw deviceError
      if (!registered || mobile !== registered.unverified_mobile) {
        return json({ success: false, message: 'Mobile contact must match the number registered on this device.' }, 400)
      }
    }
    if (type === 'phone') {
      // A newly SMS-verified phone session must register its name and DOB
      // before it can create the mobile Delivery profile.
      const { data: current, error: currentError } = await admin
        .from('delivery_customer_profiles')
        .select('date_of_birth')
        .eq('id', user.id)
        .maybeSingle()
      if (currentError) throw currentError
      if (!current?.date_of_birth) {
        return json({ success: false, message: 'Finish Mobile + DOB registration first.' }, 403)
      }
    }
    // Save to the profile table FIRST. If its SELECT/INSERT/UPDATE grants are
    // missing, fail before modifying Supabase Auth user metadata. This avoids
    // claiming a completed save when the profile table rejected the write.
    // The owner ID comes only from the server-verified access token.
    const { error: profileError } = await admin.from('delivery_customer_profiles').upsert({
      id: user.id,
      full_name: name,
      email: type === 'device' ? null : user.email || null,
      avatar_url: String(user.user_metadata?.avatar_url || user.user_metadata?.picture || '').trim() || null,
    }, { onConflict: 'id' })
    if (profileError) throw profileError

    // This project's customer contact number lives in Auth user_metadata.
    // Admin SDK is server-only; never expose SUPABASE_SERVICE_ROLE_KEY in JSX.
    const metadata = { ...(user.user_metadata || {}), full_name: name, phone: mobile }
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: metadata,
    })
    if (metadataError) {
      console.error('[DELIVERY CUSTOMER PROFILE METADATA SYNC]', metadataError.code || 'ERROR', metadataError.message)
      return json({
        success: false,
        code: 'PROFILE_CONTACT_SYNC_FAILED',
        message: 'Your profile name was saved, but we could not update the contact number. Please retry.',
      }, 503)
    }
    return json({ success: true, message: 'Delivery profile saved.', profile: { name, mobile } })
  } catch (error) {
    console.error('[DELIVERY CUSTOMER PROFILE POST]', error?.code || 'ERROR', error?.message)
    if (error?.code === '42501') {
      return json({
        success: false,
        code: 'PROFILE_TABLE_PERMISSION_DENIED',
        message: 'Profile database permissions are not configured. Please ask the administrator to apply the Delivery profile permission SQL.',
      }, 503)
    }
    return json({ success: false, code: 'PROFILE_SAVE_UNAVAILABLE', message: 'Unable to save customer profile right now.' }, 503)
  }
}
