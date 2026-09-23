import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

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

    const userClient = getUserClient(accessToken)
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user?.id) {
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
    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from('restaurants')
      .select('id, owner_id, subscription_status, plan')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (restaurantError) {
      console.error('APPLE LOGIN: Restaurant lookup failed:', restaurantError)
      return NextResponse.json(
        { success: false, message: 'Unable to load the restaurant profile.' },
        { status: 500 }
      )
    }

    if (!restaurant?.id) {
      return NextResponse.json(
        {
          success: false,
          needsRegistration: true,
          message: 'No restaurant account was found for this Apple Account. Please create your restaurant account first.',
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      restaurant,
    })
  } catch (error) {
    console.error('APPLE LOGIN API ERROR:', error)

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unable to complete Apple login.',
      },
      { status: 500 }
    )
  }
}
