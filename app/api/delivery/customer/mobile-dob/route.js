// Mobile + DOB account registration and post-OTP DOB verification.
// OTP ownership verification is performed by Supabase Auth before this API.
import 'server-only'

import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MOBILE = /^\+91[6-9][0-9]{9}$/
const reply = (data, status = 200) => NextResponse.json(data, {
  status,
  headers: {
    'Cache-Control': 'private, no-store',
    Vary: 'Authorization',
    'X-Content-Type-Options': 'nosniff',
  },
})

function validDob(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10)
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8')
  const right = Buffer.from(String(b || ''), 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function POST(request) {
  try {
    const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '')?.[1]
    if (!token) return reply({ success: false, message: 'Verify your mobile number before continuing.' }, 401)

    const admin = getAdminSupabase()
    const { data: auth, error: authError } = await admin.auth.getUser(token)
    const user = auth?.user
    // Never trust the number from the request. Use the Auth-verified phone.
    if (authError || !user?.id || !MOBILE.test(String(user.phone || '')) || !user.phone_confirmed_at) {
      return reply({ success: false, message: 'A verified Indian mobile session is required.' }, 401)
    }

    const body = await request.json().catch(() => null)
    const action = String(body?.action || '')
    const dob = String(body?.dateOfBirth || '').trim()
    if (!['register', 'verify'].includes(action) || !validDob(dob)) {
      return reply({ success: false, message: 'Enter a valid date of birth.' }, 400)
    }

    const { data: profile, error: lookupError } = await admin
      .from('delivery_customer_profiles')
      .select('id,date_of_birth')
      .eq('id', user.id)
      .maybeSingle()
    if (lookupError) throw lookupError

    if (action === 'verify') {
      // DATE OF BIRTH IS NOT A PASSWORD. Requiring verified SMS possession is
      // what keeps account access safe even when DOB becomes public.
      if (!profile?.date_of_birth || !safeEqual(profile.date_of_birth, dob)) {
        return reply({ success: false, code: 'DOB_MISMATCH', message: 'The mobile number or date of birth does not match a registered Delivery account.' }, 401)
      }
      return reply({ success: true, message: 'Mobile customer verified.' })
    }

    const fullName = String(body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 100)
    if (fullName.length < 2) {
      return reply({ success: false, message: 'Enter your full name.' }, 400)
    }
    if (profile?.date_of_birth) {
      return reply({ success: false, code: 'ALREADY_REGISTERED', message: 'This mobile account is already registered. Use Mobile + DOB login.' }, 409)
    }

    const { error: profileError } = await admin
      .from('delivery_customer_profiles')
      .upsert({
        id: user.id,
        full_name: fullName,
        email: user.email || null,
        date_of_birth: dob,
      }, { onConflict: 'id' })
    if (profileError) throw profileError

    // Phone is a verified Auth claim; metadata is used only to prefill contact
    // fields in the existing storefront and saved-address UI.
    const metadata = {
      ...(user.user_metadata || {}),
      full_name: fullName,
      phone: String(user.phone).replace(/^\+91/, ''),
    }
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: metadata,
    })
    if (metadataError) throw metadataError

    return reply({ success: true, message: 'Mobile Delivery account registered.' }, 201)
  } catch (error) {
    console.error('[DELIVERY MOBILE DOB]', error?.code || 'ERROR', error?.message)
    return reply({ success: false, message: 'Unable to complete mobile authentication. Check the DOB migration and Supabase settings.' }, 503)
  }
}