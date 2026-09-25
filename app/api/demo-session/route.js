import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set([
  'owner',
  'manager',
  'waiter',
  'kitchen',
])

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim()

  if (!value) {
    throw new Error(`Missing server environment variable: ${name}`)
  }

  return value
}

function createServerSupabase() {
  const url = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey =
    String(
      process.env.SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        ''
    ).trim()

  if (!anonKey) {
    throw new Error(
      'Missing SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function getStaffCredentials(role) {
  const restaurantId = requiredEnv('DEMO_RESTAURANT_ID')
  const restaurantCode = requiredEnv('DEMO_RESTAURANT_CODE')

  if (role === 'manager') {
    return {
      restaurantId,
      restaurantCode,
      userId: requiredEnv('DEMO_MANAGER_USER_ID'),
      password: requiredEnv('DEMO_MANAGER_PASSWORD'),
    }
  }

  if (role === 'waiter') {
    return {
      restaurantId,
      restaurantCode,
      userId: requiredEnv('DEMO_WAITER_USER_ID'),
      password: requiredEnv('DEMO_WAITER_PASSWORD'),
    }
  }

  if (role === 'kitchen') {
    return {
      restaurantId,
      restaurantCode,
      userId: requiredEnv('DEMO_KITCHEN_USER_ID'),
      password: requiredEnv('DEMO_KITCHEN_PASSWORD'),
    }
  }

  throw new Error('Unsupported staff role.')
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const role = String(body?.role || '')
      .trim()
      .toLowerCase()

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unsupported demo role.',
        },
        { status: 400 }
      )
    }

    const restaurantId = requiredEnv('DEMO_RESTAURANT_ID')
    const supabase = createServerSupabase()

    // ---------------------------------------------------------
    // OWNER
    // ---------------------------------------------------------
    // Uses a dedicated Supabase Auth demo owner account.
    // Credentials stay server-side and are never sent to the browser.
    if (role === 'owner') {
      const email = requiredEnv('DEMO_OWNER_EMAIL')
      const password = requiredEnv('DEMO_OWNER_PASSWORD')

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        })

      if (error) throw error

      if (
        !data?.session?.access_token ||
        !data?.session?.refresh_token ||
        !data?.user?.id
      ) {
        throw new Error(
          'The demo owner session could not be created.'
        )
      }

      // Verify that the dedicated demo owner actually owns
      // the configured demo restaurant.
      const {
        data: ownedRestaurant,
        error: ownershipError,
      } = await supabase
        .from('restaurants')
        .select('id, owner_id, name')
        .eq('id', restaurantId)
        .eq('owner_id', data.user.id)
        .maybeSingle()

      if (ownershipError) throw ownershipError

      if (!ownedRestaurant?.id) {
        throw new Error(
          'The configured demo owner does not own the demo restaurant.'
        )
      }

      return NextResponse.json({
        success: true,
        role: 'owner',
        restaurantId: String(restaurantId),
        restaurantName:
          ownedRestaurant?.name || 'Demo Restaurant',
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      })
    }

    // ---------------------------------------------------------
    // MANAGER / WAITER / KITCHEN
    // ---------------------------------------------------------
    // This calls the same secure staff-session RPC used by /app.
    const credentials = getStaffCredentials(role)

    const { data, error } = await supabase.rpc(
      'create_staff_app_session',
      {
        p_restaurant_id: String(credentials.restaurantId),
        p_restaurant_code: String(
          credentials.restaurantCode
        ).trim(),
        p_user_id: String(credentials.userId)
          .trim()
          .toLowerCase(),
        p_password: String(credentials.password),
        p_role: role,
      }
    )

    if (error) throw error

    if (!data?.success) {
      throw new Error(
        data?.message ||
          `Unable to create the ${role} demo session.`
      )
    }

    if (!data?.sessionToken) {
      throw new Error(
        'The staff login server did not return a session token.'
      )
    }

    if (
      String(data?.restaurantId) !==
      String(credentials.restaurantId)
    ) {
      throw new Error(
        'The demo staff account belongs to another restaurant.'
      )
    }

    if (
      String(data?.role || '').toLowerCase() !== role
    ) {
      throw new Error(
        'The demo staff account returned the wrong role.'
      )
    }

    return NextResponse.json({
      success: true,
      role,
      restaurantId: String(credentials.restaurantId),
      restaurantCode: String(
        data?.restaurantCode ||
          credentials.restaurantCode
      ).trim(),
      restaurantName:
        data?.restaurantName || 'Demo Restaurant',
      userId: String(
        data?.userId || credentials.userId
      )
        .trim()
        .toLowerCase(),
      staff: data?.staff || null,
      sessionId: data?.sessionId || null,
      sessionToken: data.sessionToken,
      expiresAt: data?.expiresAt || null,
    })
  } catch (error) {
    console.error('[PUBLIC DEMO SESSION]', error)

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          'Unable to open the live demo right now.',
      },
      { status: 500 }
    )
  }
}
