import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  checkIpRateLimit,
  getLoginLockStatus,
  recordFailedLogin,
  clearFailedLoginAttempts,
} from '@/lib/login-security'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing Supabase environment variables for login API.'
  )
}

const supabaseAdmin = createClient(
  supabaseUrl || '',
  serviceRoleKey || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

function getClientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for')

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function normalizeDate(value) {
  if (!value) return ''

  return String(value).trim().slice(0, 10)
}

export async function POST(request) {
  const ipAddress = getClientIp(request)

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Server configuration error. Supabase service role key is missing.',
        },
        { status: 500 }
      )
    }

    let body

    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid request body.',
        },
        { status: 400 }
      )
    }

    const email = String(body?.email || '')
      .trim()
      .toLowerCase()

    const password = String(body?.password || '')
    const dob = normalizeDate(body?.dob)

    if (!email || !password || !dob) {
      return NextResponse.json(
        {
          success: false,
          message: 'Email, password, and Date of Birth are required.',
        },
        { status: 400 }
      )
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Please enter a valid email address.',
        },
        { status: 400 }
      )
    }

    // Check IP rate limit if the security helper is available.
    try {
      const rateLimitResult = await checkIpRateLimit(ipAddress)

      if (
        rateLimitResult &&
        rateLimitResult.allowed === false
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              rateLimitResult.message ||
              'Too many login attempts. Please try again later.',
          },
          { status: 429 }
        )
      }
    } catch (error) {
      console.warn('IP rate-limit check skipped:', error)
    }

    // Check whether this IP is temporarily locked.
    try {
      const lockStatus = await getLoginLockStatus(email)

      if (lockStatus?.locked) {
        return NextResponse.json(
          {
            success: false,
            message:
              lockStatus.message ||
              'Too many failed attempts. Please try again later.',
          },
          { status: 429 }
        )
      }
    } catch (error) {
      console.warn('Login lock check skipped:', error)
    }

    // Authenticate against Supabase Auth.
    const {
      data: authData,
      error: authError,
    } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData?.user || !authData?.session) {
      try {
        await recordFailedLogin(email)
      } catch (error) {
        console.warn('Failed-login recording skipped:', error)
      }

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid email or password.',
        },
        { status: 401 }
      )
    }

    const authUser = authData.user

    // IMPORTANT:
    // The restaurant record must be connected using owner_id.
    // Do not search restaurants.id using the Auth user ID.
    const {
      data: restaurant,
      error: restaurantError,
    } = await supabaseAdmin
      .from('restaurants')
      .select(
        `
          id,
          name,
          email,
          dob,
          owner_id
        `
      )
      .eq('owner_id', authUser.id)
      .maybeSingle()

    if (restaurantError) {
      console.error(
        'Restaurant lookup error:',
        restaurantError
      )

      return NextResponse.json(
        {
          success: false,
          message:
            'Unable to load your restaurant account. Please contact support.',
        },
        { status: 500 }
      )
    }

    if (!restaurant) {
      try {
        await recordFailedLogin(email)
      } catch (error) {
        console.warn('Failed-login recording skipped:', error)
      }

      return NextResponse.json(
        {
          success: false,
          message:
            'No restaurant account is linked to this login. Please contact support.',
        },
        { status: 404 }
      )
    }

    // Verify Date of Birth.
    const registeredDob = normalizeDate(restaurant.dob)

    if (!registeredDob) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Date of Birth is not configured for this account.',
        },
        { status: 403 }
      )
    }

    if (registeredDob !== dob) {
      try {
        await recordFailedLogin(email)
      } catch (error) {
        console.warn('Failed-login recording skipped:', error)
      }

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid Date of Birth.',
        },
        { status: 401 }
      )
    }

    try {
      await clearFailedLoginAttempts(email)
    } catch (error) {
      console.warn(
        'Failed-login reset skipped:',
        error
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Login successful.',
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          expires_in: authData.session.expires_in,
          expires_at: authData.session.expires_at,
          token_type: authData.session.token_type,
        },
        user: {
          id: authUser.id,
          email: authUser.email,
        },
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          email: restaurant.email,
          dob: restaurant.dob,
          owner_id: restaurant.owner_id,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Login API unexpected error:', error)

    return NextResponse.json(
      {
        success: false,
        message:
          'An unexpected error occurred while logging in. Please try again.',
      },
      { status: 500 }
    )
  }
}