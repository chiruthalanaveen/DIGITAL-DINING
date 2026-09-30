import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DELIVERY_PLANS = new Set([
  'delivery',
  'restaurant_delivery',
  'restaurant_resort_delivery',
])

function json(body, status = 200) {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  response.headers.set('Pragma', 'no-cache')
  return response
}

function config() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      'Push registration server configuration is incomplete.'
    )
  }

  return {
    url,
    anonKey,
    serviceKey,
  }
}

function getAdmin() {
  const { url, serviceKey } = config()

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function bearerToken(request) {
  const header = String(
    request.headers.get('authorization') || ''
  )

  if (!header.toLowerCase().startsWith('bearer ')) {
    return ''
  }

  return header.slice(7).trim()
}

async function verifyDeliveryRestaurant(
  admin,
  restaurantId
) {
  const {
    data: restaurant,
    error,
  } = await admin
    .from('restaurants')
    .select(
      `
        id,
        owner_id,
        plan_code,
        delivery_enabled,
        subscription_status,
        subscription_expires_at
      `
    )
    .eq('id', restaurantId)
    .maybeSingle()

  if (error) throw error

  if (!restaurant) {
    throw new Error('Restaurant was not found.')
  }

  if (
    !DELIVERY_PLANS.has(
      String(restaurant.plan_code || '').toLowerCase()
    ) ||
    restaurant.delivery_enabled === false
  ) {
    throw new Error(
      'Delivery is not included in this subscription.'
    )
  }

  if (
    String(
      restaurant.subscription_status || ''
    ).toLowerCase() !== 'active'
  ) {
    throw new Error(
      'Delivery subscription is inactive.'
    )
  }

  if (
    restaurant.subscription_expires_at &&
    new Date(
      restaurant.subscription_expires_at
    ).getTime() <= Date.now()
  ) {
    throw new Error(
      'Delivery subscription has expired.'
    )
  }

  return restaurant
}

async function authorizeActor(
  request,
  body
) {
  const admin = getAdmin()
  const restaurantId = String(
    body?.restaurantId || ''
  ).trim()

  if (!restaurantId) {
    return {
      error: json(
        {
          success: false,
          message: 'Restaurant ID is missing.',
        },
        400
      ),
    }
  }

  const restaurant =
    await verifyDeliveryRestaurant(
      admin,
      restaurantId
    )

  const requestedRole =
    String(body?.role || '')
      .trim()
      .toLowerCase()

  if (requestedRole === 'owner') {
    const token = bearerToken(request)

    if (!token) {
      return {
        error: json(
          {
            success: false,
            message:
              'Owner login is required to register native notifications.',
          },
          401
        ),
      }
    }

    const {
      url,
      anonKey,
    } = config()

    const authClient = createClient(
      url,
      anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    const {
      data,
      error,
    } =
      await authClient.auth.getUser(token)

    if (
      error ||
      !data?.user
    ) {
      return {
        error: json(
          {
            success: false,
            message:
              'Owner login session is invalid or expired.',
          },
          401
        ),
      }
    }

    if (
      String(restaurant.owner_id) !==
      String(data.user.id)
    ) {
      return {
        error: json(
          {
            success: false,
            message:
              'This Owner account does not own the restaurant.',
          },
          403
        ),
      }
    }

    return {
      admin,
      restaurant,
      actorRole: 'owner',
      actorKey: String(data.user.id),
    }
  }

  if (requestedRole === 'manager') {
    const managerSession =
      String(
        request.headers.get(
          'x-manager-session'
        ) || ''
      ).trim()

    let authData = null

    if (managerSession) {
      const {
        data,
        error,
      } = await admin.rpc(
        'validate_staff_app_session',
        {
          p_session_token:
            managerSession,
          p_required_role:
            'manager',
        }
      )

      if (error) throw error
      authData = data
    } else {
      const credentials =
        body?.managerCredentials || {}

      const {
        data,
        error,
      } = await admin.rpc(
        'authenticate_staff_login',
        {
          p_restaurant_id:
            restaurantId,
          p_restaurant_code:
            String(
              credentials.restaurantCode ||
                ''
            ).trim(),
          p_user_id:
            String(
              credentials.userId ||
                ''
            )
              .trim()
              .toLowerCase(),
          p_password:
            String(
              credentials.password ||
                ''
            ),
          p_role: 'manager',
        }
      )

      if (error) throw error
      authData = data
    }

    if (!authData?.success) {
      return {
        error: json(
          {
            success: false,
            message:
              authData?.message ||
              'Manager session is invalid or expired.',
          },
          401
        ),
      }
    }

    if (
      String(
        authData.restaurantId ||
          ''
      ) !== restaurantId
    ) {
      return {
        error: json(
          {
            success: false,
            message:
              'This Manager account belongs to another restaurant.',
          },
          403
        ),
      }
    }

    const actorKey =
      String(
        authData.userId ||
          authData.staff?.user_id ||
          body?.managerCredentials?.userId ||
          'manager'
      )
        .trim()
        .toLowerCase()

    return {
      admin,
      restaurant,
      actorRole: 'manager',
      actorKey:
        actorKey || 'manager',
    }
  }

  return {
    error: json(
      {
        success: false,
        message:
          'Push registration role must be owner or manager.',
      },
      400
    ),
  }
}

export async function POST(request) {
  try {
    const body =
      await request
        .json()
        .catch(() => ({}))

    const pushToken =
      String(
        body?.pushToken || ''
      ).trim()

    const platform =
      String(
        body?.platform || ''
      )
        .trim()
        .toLowerCase()

    if (!pushToken) {
      return json(
        {
          success: false,
          message:
            'Native push token is missing.',
        },
        400
      )
    }

    // Phase 6 is intentionally Android/FCM first.
    if (platform !== 'android') {
      return json(
        {
          success: false,
          message:
            'Phase 6 native Delivery push currently supports Android.',
        },
        400
      )
    }

    const auth =
      await authorizeActor(
        request,
        body
      )

    if (auth.error) {
      return auth.error
    }

    const {
      admin,
      actorRole,
      actorKey,
    } = auth

    const payload = {
      restaurant_id:
        String(body.restaurantId),
      actor_role: actorRole,
      actor_key: actorKey,
      app_scope: 'delivery',
      platform: 'android',
      push_token: pushToken,
      is_active: true,
      app_version:
        String(
          body?.appVersion || ''
        ).trim() || null,
      device_model:
        String(
          body?.deviceModel || ''
        ).trim() || null,
      last_seen_at:
        new Date().toISOString(),
    }

    const {
      data,
      error,
    } = await admin
      .from('app_push_devices')
      .upsert(payload, {
        onConflict:
          'restaurant_id,actor_role,actor_key,app_scope,push_token',
      })
      .select(
        `
          id,
          restaurant_id,
          actor_role,
          app_scope,
          platform,
          is_active,
          last_seen_at
        `
      )
      .single()

    if (error) throw error

    return json({
      success: true,
      device: data,
    })
  } catch (error) {
    console.error(
      'Native push registration error:',
      error
    )

    return json(
      {
        success: false,
        message:
          error?.message ||
          'Unable to register native push notifications.',
      },
      500
    )
  }
}

export async function DELETE(request) {
  try {
    const body =
      await request
        .json()
        .catch(() => ({}))

    const pushToken =
      String(
        body?.pushToken || ''
      ).trim()

    if (!pushToken) {
      return json(
        {
          success: false,
          message: 'Push token is missing.',
        },
        400
      )
    }

    const auth =
      await authorizeActor(
        request,
        body
      )

    if (auth.error) {
      return auth.error
    }

    const {
      admin,
      actorRole,
      actorKey,
    } = auth

    const {
      error,
    } = await admin
      .from('app_push_devices')
      .update({
        is_active: false,
        last_seen_at:
          new Date().toISOString(),
      })
      .eq(
        'restaurant_id',
        String(body.restaurantId)
      )
      .eq('actor_role', actorRole)
      .eq('actor_key', actorKey)
      .eq('app_scope', 'delivery')
      .eq('push_token', pushToken)

    if (error) throw error

    return json({
      success: true,
    })
  } catch (error) {
    console.error(
      'Native push unregister error:',
      error
    )

    return json(
      {
        success: false,
        message:
          error?.message ||
          'Unable to unregister native push notifications.',
      },
      500
    )
  }
}
