import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase server configuration is missing.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Returns only a restaurant's identity after server-side Supabase Auth verification.
// The browser-supplied token is never used as a database service-role credential.
export async function GET(request) {
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return json({ success: false, message: 'Please sign in again.' }, 401)

  try {
    const admin = getAdminClient()
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    const userId = authData?.user?.id
    if (authError || !userId) {
      return json({ success: false, message: 'Your session is invalid or expired.' }, 401)
    }

    // An explicitly assigned owner always wins over the legacy ID convention.
    const { data: ownedRestaurants, error: ownerError } = await admin
      .from('restaurants')
      .select('id, name')
      .eq('owner_id', userId)
      .limit(2)

    if (ownerError) {
      console.error('[OWNER LOOKUP] owner_id query failed:', ownerError)
      return json({ success: false, message: 'Restaurant verification failed.' }, 500)
    }

    if ((ownedRestaurants || []).length > 1) {
      return json({ success: false, message: 'Multiple restaurants found. Contact support to select an account.' }, 409)
    }

    let restaurant = ownedRestaurants?.[0] || null
    if (!restaurant) {
      // Existing legacy accounts: restaurants.id = auth.users.id only when
      // restaurants.owner_id IS NULL. Never match another owner's restaurant.
      const { data: legacyRestaurant, error: legacyError } = await admin
        .from('restaurants')
        .select('id, name')
        .eq('id', userId)
        .is('owner_id', null)
        .maybeSingle()

      if (legacyError) {
        console.error('[OWNER LOOKUP] legacy query failed:', legacyError)
        return json({ success: false, message: 'Restaurant verification failed.' }, 500)
      }
      restaurant = legacyRestaurant
    }

    if (!restaurant) {
      return json({ success: false, message: 'No restaurant is connected to this owner account.' }, 404)
    }

    return json({
      success: true,
      restaurant: { id: restaurant.id, name: restaurant.name },
    })
  } catch (error) {
    console.error('[OWNER LOOKUP] unexpected error:', error)
    return json({ success: false, message: 'Restaurant verification is unavailable.' }, 500)
  }
}