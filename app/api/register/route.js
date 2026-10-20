import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const runtime = 'nodejs'

// IMPORTANT:
// This route runs on the server only. Never expose SUPABASE_SERVICE_ROLE_KEY
// in a NEXT_PUBLIC_ variable or send it to a browser.
// Existing immediate-login behavior is retained here for compatibility.
// Before public production, implement verified-email signup and rate limiting.

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Restaurant name is required').max(150, 'Restaurant name is too long'),
  email: z.string().trim().email('Enter a valid email address').max(254),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  dob: z.string().min(1, 'Date of birth is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(256, 'Password is too long'),
})

function json(payload, status) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Server-side Supabase configuration is missing.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function validDateOfBirth(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return false

  const today = new Date()
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  )
  const earliest = Date.UTC(today.getUTCFullYear() - 120, today.getUTCMonth(), today.getUTCDate())
  const dobTimestamp = date.getTime()

  return dobTimestamp >= earliest && dobTimestamp <= todayUtc
}

export async function POST(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return json({ success: false, message: 'Invalid request data.' }, 400)
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return json({
      success: false,
      message: parsed.error.issues?.[0]?.message || 'Please check the entered details.',
    }, 400)
  }

  const { name, phone, dob, password } = parsed.data
  const email = parsed.data.email.toLowerCase()

  if (!validDateOfBirth(dob)) {
    return json({ success: false, message: 'Please enter a valid date of birth.' }, 400)
  }

  try {
    const supabaseAdmin = getAdminClient()

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      // Preserved to avoid breaking the current registration-page auto-login.
      // SECURITY FOLLOW-UP: replace with an email-verification flow.
      email_confirm: true,
      user_metadata: {
        full_name: name,
        phone,
        dob,
        account_type: 'restaurant_owner',
      },
    })

    if (authError) {
      console.error('[REGISTER] Authentication creation failed:', authError.code || authError.status || 'unknown')
      return json({
        success: false,
        message: 'Unable to create an account with these details. If you already have an account, please sign in.',
      }, 400)
    }

    const userId = authData?.user?.id
    if (!userId) {
      console.error('[REGISTER] Authentication creation returned no user ID')
      return json({ success: false, message: 'Account creation failed. Please try again.' }, 500)
    }

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from('restaurants')
      .insert({
        name,
        email,
        phone,
        dob,
        owner_id: userId,
      })
      .select('id, restaurant_code')
      .single()

    if (restaurantError || !restaurant?.id) {
      console.error('[REGISTER] Restaurant creation failed:', restaurantError?.code || 'missing-record')

      // Undo only the newly created Auth user if the restaurant insert fails.
      // This is NOT the account-deletion workflow for existing users.
      const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (rollbackError) {
        console.error('[REGISTER] Auth rollback failed:', rollbackError.code || rollbackError.status || 'unknown')
      }

      return json({
        success: false,
        message: 'Unable to create the restaurant profile. Please try again or contact support.',
      }, 400)
    }

    // Restaurant approval and wallet activation remain governed by existing DB
    // triggers / Admin workflows. This API does not self-approve accounts.
    return json({
      success: true,
      message: 'Registration successful.',
      restaurantId: restaurant.id,
      restaurantCode: restaurant.restaurant_code,
    }, 201)
  } catch (error) {
    console.error('[REGISTER] Unexpected server-side failure:', error instanceof Error ? error.name : 'unknown')
    return json({
      success: false,
      message: 'Registration is temporarily unavailable. Please try again.',
    }, 500)
  }
}