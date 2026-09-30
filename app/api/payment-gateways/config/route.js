import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptGatewaySecret } from '@/lib/server/paymentGatewayCrypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_MODULES = new Set([
  'restaurant',
  'resort',
  'delivery',
])

function json(body, status = 200) {
  const response = NextResponse.json(body, { status })
  response.headers.set(
    'Cache-Control',
    'no-store, max-age=0'
  )
  response.headers.set('Pragma', 'no-cache')
  return response
}

function serverConfig() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      'Supabase server configuration is incomplete.'
    )
  }

  return { url, anonKey, serviceKey }
}

function getBearerToken(request) {
  const header = String(
    request.headers.get('authorization') || ''
  )

  return header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : ''
}

function getAdminClient() {
  const { url, serviceKey } = serverConfig()

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function requireOwner(
  request,
  restaurantId
) {
  const token = getBearerToken(request)

  if (!token) {
    return {
      error: json(
        {
          success: false,
          message:
            'Owner authentication is required. Manager and staff accounts cannot manage payment gateway settings.',
        },
        401
      ),
    }
  }

  const { url, anonKey } = serverConfig()

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
    data: authData,
    error: authError,
  } = await authClient.auth.getUser(token)

  const user = authData?.user

  if (authError || !user) {
    return {
      error: json(
        {
          success: false,
          message:
            'Your owner login session is invalid or expired. Manager and staff sessions are not accepted here.',
        },
        401
      ),
    }
  }

  const admin = getAdminClient()

  const {
    data: restaurant,
    error,
  } = await admin
    .from('restaurants')
    .select(
      `
        id,
        owner_id,
        name,
        phone,
        plan_code,
        enable_counter_payment,
        razorpay_key_id,
        razorpay_secret
      `
    )
    .eq('id', restaurantId)
    .maybeSingle()

  if (error) throw error

  if (
    !restaurant ||
    String(restaurant.owner_id) !==
      String(user.id)
  ) {
    return {
      error: json(
        {
          success: false,
          message:
            'Only the restaurant owner can view or change payment gateway credentials.',
        },
        403
      ),
    }
  }

  return {
    admin,
    restaurant,
    user,
  }
}

async function getOfflineSetting(
  admin,
  restaurant,
  moduleName
) {
  if (moduleName === 'restaurant') {
    return (
      restaurant.enable_counter_payment ?? true
    )
  }

  if (moduleName === 'resort') {
    const { data, error } = await admin
      .from('resort_properties')
      .select('pay_at_property')
      .eq(
        'restaurant_id',
        restaurant.id
      )
      .maybeSingle()

    if (error) throw error

    return data?.pay_at_property ?? true
  }

  const { data, error } = await admin
    .from('delivery_settings')
    .select(
      'cod_enabled, online_payment_enabled'
    )
    .eq('restaurant_id', restaurant.id)
    .maybeSingle()

  if (error) throw error

  return data?.cod_enabled ?? true
}

function hasStoredSecret(config) {
  return Boolean(
    config?.secret_ciphertext &&
      config?.secret_iv &&
      config?.secret_tag
  )
}

async function readGatewayConfig(
  admin,
  restaurantId,
  moduleName
) {
  const {
    data,
    error,
  } = await admin
    .from('payment_gateway_configs')
    .select(
      `
        id,
        key_id,
        secret_ciphertext,
        secret_iv,
        secret_tag,
        is_enabled
      `
    )
    .eq('restaurant_id', restaurantId)
    .eq('module', moduleName)
    .eq('provider', 'razorpay')
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function migrateLegacyRestaurantGateway(
  admin,
  restaurant,
  currentConfig
) {
  const legacyKeyId = String(
    restaurant?.razorpay_key_id || ''
  ).trim()

  const legacySecret = String(
    restaurant?.razorpay_secret || ''
  ).trim()

  const currentKeyId = String(
    currentConfig?.key_id || ''
  ).trim()

  const currentHasSecret =
    hasStoredSecret(currentConfig)

  const needsKeyMigration =
    !currentKeyId && Boolean(legacyKeyId)

  const needsSecretMigration =
    !currentHasSecret &&
    Boolean(legacySecret)

  if (
    !needsKeyMigration &&
    !needsSecretMigration
  ) {
    return currentConfig
  }

  const payload = {
    restaurant_id: restaurant.id,
    module: 'restaurant',
    provider: 'razorpay',
    key_id:
      currentKeyId || legacyKeyId,
    is_enabled:
      currentConfig?.is_enabled ??
      Boolean(
        (currentKeyId || legacyKeyId) &&
          (
            currentHasSecret ||
            legacySecret
          )
      ),
  }

  if (needsSecretMigration) {
    const encrypted =
      encryptGatewaySecret(legacySecret)

    payload.secret_ciphertext =
      encrypted.ciphertext
    payload.secret_iv = encrypted.iv
    payload.secret_tag = encrypted.tag
  } else if (currentConfig) {
    payload.secret_ciphertext =
      currentConfig.secret_ciphertext
    payload.secret_iv =
      currentConfig.secret_iv
    payload.secret_tag =
      currentConfig.secret_tag
  }

  const { error: upsertError } =
    await admin
      .from('payment_gateway_configs')
      .upsert(payload, {
        onConflict:
          'restaurant_id,module,provider',
      })

  if (upsertError) throw upsertError

  const { error: cleanupError } =
    await admin
      .from('restaurants')
      .update({
        razorpay_key_id:
          payload.key_id,
        razorpay_secret: '',
      })
      .eq('id', restaurant.id)

  if (cleanupError) throw cleanupError

  return readGatewayConfig(
    admin,
    restaurant.id,
    'restaurant'
  )
}

async function saveOfflineSetting(
  admin,
  restaurant,
  moduleName,
  offlinePaymentEnabled,
  onlinePaymentEnabled
) {
  if (moduleName === 'restaurant') {
    const { error } = await admin
      .from('restaurants')
      .update({
        enable_counter_payment:
          offlinePaymentEnabled,
      })
      .eq('id', restaurant.id)

    if (error) throw error
    return
  }

  if (moduleName === 'resort') {
    const { error } = await admin
      .from('resort_properties')
      .update({
        pay_at_property:
          offlinePaymentEnabled,
      })
      .eq(
        'restaurant_id',
        restaurant.id
      )

    if (error) throw error
    return
  }

  const {
    data: existingSettings,
    error: settingsLookupError,
  } = await admin
    .from('delivery_settings')
    .select('id')
    .eq('restaurant_id', restaurant.id)
    .maybeSingle()

  if (settingsLookupError) {
    throw settingsLookupError
  }

  if (existingSettings?.id) {
    const { error } = await admin
      .from('delivery_settings')
      .update({
        cod_enabled:
          offlinePaymentEnabled,
        online_payment_enabled:
          onlinePaymentEnabled,
      })
      .eq('restaurant_id', restaurant.id)

    if (error) throw error
    return
  }

  const { error } = await admin
    .from('delivery_settings')
    .insert({
      restaurant_id: restaurant.id,
      store_name:
        restaurant.name || '',
      support_phone:
        restaurant.phone || '',
      cod_enabled:
        offlinePaymentEnabled,
      online_payment_enabled:
        onlinePaymentEnabled,
    })

  if (error) throw error
}

export async function GET(request) {
  try {
    const url =
      new URL(request.url)

    const restaurantId = String(
      url.searchParams.get(
        'restaurantId'
      ) || ''
    ).trim()

    const moduleName = String(
      url.searchParams.get('module') || ''
    )
      .trim()
      .toLowerCase()

    if (
      !restaurantId ||
      !VALID_MODULES.has(moduleName)
    ) {
      return json(
        {
          success: false,
          message:
            'A valid restaurantId and module are required.',
        },
        400
      )
    }

    const owner =
      await requireOwner(
        request,
        restaurantId
      )

    if (owner.error) {
      return owner.error
    }

    const {
      admin,
      restaurant,
    } = owner

    let config =
      await readGatewayConfig(
        admin,
        restaurantId,
        moduleName
      )

    if (moduleName === 'restaurant') {
      config =
        await migrateLegacyRestaurantGateway(
          admin,
          restaurant,
          config
        )
    }

    const offlinePaymentEnabled =
      await getOfflineSetting(
        admin,
        restaurant,
        moduleName
      )

    const hasSecret =
      hasStoredSecret(config)

    return json({
      success: true,
      module: moduleName,
      provider: 'razorpay',
      configured: Boolean(
        config?.key_id && hasSecret
      ),
      enabled: Boolean(
        config?.is_enabled
      ),
      keyId: config?.key_id || '',
      hasSecret,
      offlinePaymentEnabled:
        Boolean(
          offlinePaymentEnabled
        ),
    })
  } catch (error) {
    console.error(
      'Payment gateway GET error:',
      error
    )

    return json(
      {
        success: false,
        message:
          error?.message ||
          'Unable to load payment gateway settings.',
      },
      500
    )
  }
}

export async function POST(request) {
  try {
    const body =
      await request.json()

    const restaurantId = String(
      body?.restaurantId || ''
    ).trim()

    const moduleName = String(
      body?.module || ''
    )
      .trim()
      .toLowerCase()

    const keyId = String(
      body?.keyId || ''
    ).trim()

    const keySecret = String(
      body?.keySecret || ''
    ).trim()

    const enabled =
      Boolean(body?.enabled)

    const offlinePaymentEnabled =
      Boolean(
        body?.offlinePaymentEnabled
      )

    if (
      !restaurantId ||
      !VALID_MODULES.has(moduleName)
    ) {
      return json(
        {
          success: false,
          message:
            'A valid restaurantId and module are required.',
        },
        400
      )
    }

    const owner =
      await requireOwner(
        request,
        restaurantId
      )

    if (owner.error) {
      return owner.error
    }

    const {
      admin,
      restaurant,
    } = owner

    let existing =
      await readGatewayConfig(
        admin,
        restaurantId,
        moduleName
      )

    if (moduleName === 'restaurant') {
      existing =
        await migrateLegacyRestaurantGateway(
          admin,
          restaurant,
          existing
        )
    }

    const finalKeyId =
      keyId ||
      existing?.key_id ||
      ''

    const hasExistingSecret =
      hasStoredSecret(existing)

    if (
      enabled &&
      !finalKeyId
    ) {
      return json(
        {
          success: false,
          message:
            'Razorpay Key ID is required before online payments can be enabled.',
        },
        400
      )
    }

    if (
      enabled &&
      !keySecret &&
      !hasExistingSecret
    ) {
      return json(
        {
          success: false,
          message:
            'Razorpay Key Secret is required the first time you configure this gateway.',
        },
        400
      )
    }

    const payload = {
      restaurant_id: restaurantId,
      module: moduleName,
      provider: 'razorpay',
      key_id: finalKeyId,
      is_enabled: enabled,
    }

    if (keySecret) {
      const encrypted =
        encryptGatewaySecret(keySecret)

      payload.secret_ciphertext =
        encrypted.ciphertext
      payload.secret_iv =
        encrypted.iv
      payload.secret_tag =
        encrypted.tag
    } else if (existing) {
      payload.secret_ciphertext =
        existing.secret_ciphertext
      payload.secret_iv =
        existing.secret_iv
      payload.secret_tag =
        existing.secret_tag
    }

    const { error: saveError } =
      await admin
        .from(
          'payment_gateway_configs'
        )
        .upsert(payload, {
          onConflict:
            'restaurant_id,module,provider',
        })

    if (saveError) throw saveError

    await saveOfflineSetting(
      admin,
      restaurant,
      moduleName,
      offlinePaymentEnabled,
      enabled
    )

    if (moduleName === 'restaurant') {
      const { error } = await admin
        .from('restaurants')
        .update({
          razorpay_key_id:
            finalKeyId,
          razorpay_secret: '',
        })
        .eq('id', restaurantId)

      if (error) throw error
    }

    const saved =
      await readGatewayConfig(
        admin,
        restaurantId,
        moduleName
      )

    return json({
      success: true,
      configured: Boolean(
        saved?.key_id &&
          hasStoredSecret(saved)
      ),
      enabled: Boolean(
        saved?.is_enabled
      ),
      keyId: saved?.key_id || '',
      hasSecret:
        hasStoredSecret(saved),
      offlinePaymentEnabled,
    })
  } catch (error) {
    console.error(
      'Payment gateway POST error:',
      error
    )

    return json(
      {
        success: false,
        message:
          error?.message ||
          'Unable to save payment gateway settings.',
      },
      500
    )
  }
}
