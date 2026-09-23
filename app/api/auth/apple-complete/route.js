import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const runtime = 'nodejs'

const appleSignupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/),
  dob: z.string().min(1).max(20),
})

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase server environment variables are missing.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function getUserClient(accessToken) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase public environment variables are missing.')
  }

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function POST(request) {
  try {
    const authorization = request.headers.get('authorization') || ''
    const accessToken = authorization.replace(/^Bearer\s+/i, '').trim()

    if (!accessToken) {
      return NextResponse.json(
        { success: false, message: 'Authentication session is missing.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const parsed = appleSignupSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'Please check the entered registration details.' },
        { status: 400 }
      )
    }

    const { name, phone, dob } = parsed.data
    const dateOfBirth = new Date(`${dob}T00:00:00`)

    if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth > new Date()) {
      return NextResponse.json(
        { success: false, message: 'Please enter a valid date of birth.' },
        { status: 400 }
      )
    }

    const userClient = getUserClient(accessToken)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user?.id || !user.email) {
      return NextResponse.json(
        { success: false, message: 'Apple authentication could not be verified.' },
        { status: 401 }
      )
    }

    if (user.app_metadata?.provider && user.app_metadata.provider !== 'apple') {
      return NextResponse.json(
        { success: false, message: 'This authentication session is not an Apple session.' },
        { status: 403 }
      )
    }

    const supabaseAdmin = getAdminClient()

    const { data: existingRestaurant, error: existingError } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (existingError) {
      console.error('APPLE SIGN-UP: Existing restaurant lookup failed:', existingError)
      return NextResponse.json(
        { success: false, message: 'Unable to verify the restaurant profile.' },
        { status: 500 }
      )
    }

    if (existingRestaurant?.id) {
      return NextResponse.json(
        {
          success: false,
          existingAccount: true,
          message: 'A restaurant account already exists for this Apple Account. Please use Apple Sign In instead.',
          restaurantId: existingRestaurant.id,
        },
        { status: 409 }
      )
    }

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from('restaurants')
      .insert({
        name,
        email: user.email,
        phone,
        dob,
        owner_id: user.id,
      })
      .select('id')
      .single()

    if (restaurantError) {
      console.error('APPLE SIGN-UP: Restaurant creation failed:', restaurantError)
      return NextResponse.json(
        {
          success: false,
          message: restaurantError.message || 'Unable to create restaurant profile.',
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Apple registration successful.',
        restaurantId: restaurant.id,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('APPLE SIGN-UP API ERROR:', error)

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unable to complete Apple sign-up.',
      },
      { status: 500 }
    )
  }
}
