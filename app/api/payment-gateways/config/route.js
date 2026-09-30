import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptGatewaySecret } from '@/lib/server/paymentGatewayCrypto'

export const runtime = 'nodejs'

const VALID_MODULES = new Set(['restaurant', 'resort'])

function serverConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceKey) {
    throw new Error('Supabase server configuration is incomplete.')
  }

  return { url, anonKey, serviceKey }
}

function getBearerToken(request) {
  const header = String(request.headers.get('authorization') || '')
  return header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : ''
}

function getAdminClient() {
  const { url, serviceKey } = serverConfig()
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function requireOwner(request, restaurantId) {
  const token = getBearerToken(request)
  if (!token) {
    return { error: NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 }) }
  }

  const { url, anonKey } = serverConfig()
  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await authClient.auth.getUser(token)
  const user = authData?.user

  if (authError || !user) {
    return { error: NextResponse.json({ success: false, message: 'Your login session is invalid or expired.' }, { status: 401 }) }
  }

  const admin = getAdminClient()
  const { data: restaurant, error } = await admin
    .from('restaurants')
    .select('id, owner_id, plan_code, enable_counter_payment')
    .eq('id', restaurantId)
    .maybeSingle()

  if (error) throw error

  if (!restaurant || String(restaurant.owner_id) !== String(user.id)) {
    return { error: NextResponse.json({ success: false, message: 'You do not have permission to manage this restaurant.' }, { status: 403 }) }
  }

  return { admin, restaurant, user }
}

async function getOfflineSetting(admin, restaurant, moduleName) {
  if (moduleName === 'restaurant') {
    return restaurant.enable_counter_payment ?? true
  }

  const { data, error } = await admin
    .from('resort_properties')
    .select('pay_at_property')
    .eq('restaurant_id', restaurant.id)
    .maybeSingle()

  if (error) throw error
  return data?.pay_at_property ?? true
}

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const restaurantId = String(url.searchParams.get('restaurantId') || '').trim()
    const moduleName = String(url.searchParams.get('module') || '').trim().toLowerCase()

    if (!restaurantId || !VALID_MODULES.has(moduleName)) {
      return NextResponse.json({ success: false, message: 'A valid restaurantId and module are required.' }, { status: 400 })
    }

    const owner = await requireOwner(request, restaurantId)
    if (owner.error) return owner.error

    const { admin, restaurant } = owner

    const { data: config, error } = await admin
      .from('payment_gateway_configs')
      .select('key_id, secret_ciphertext, secret_iv, secret_tag, is_enabled')
      .eq('restaurant_id', restaurantId)
      .eq('module', moduleName)
      .eq('provider', 'razorpay')
      .maybeSingle()

    if (error) throw error

    const offlinePaymentEnabled = await getOfflineSetting(admin, restaurant, moduleName)
    const hasSecret = Boolean(
      config?.secret_ciphertext && config?.secret_iv && config?.secret_tag
    )

    return NextResponse.json({
      success: true,
      module: moduleName,
      provider: 'razorpay',
      configured: Boolean(config?.key_id && hasSecret),
      enabled: Boolean(config?.is_enabled),
      keyId: config?.key_id || '',
      hasSecret,
      offlinePaymentEnabled: Boolean(offlinePaymentEnabled),
    })
  } catch (error) {
    console.error('Payment gateway GET error:', error)
    return NextResponse.json({ success: false, message: error?.message || 'Unable to load payment gateway settings.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const restaurantId = String(body?.restaurantId || '').trim()
    const moduleName = String(body?.module || '').trim().toLowerCase()
    const keyId = String(body?.keyId || '').trim()
    const keySecret = String(body?.keySecret || '').trim()
    const enabled = Boolean(body?.enabled)
    const offlinePaymentEnabled = Boolean(body?.offlinePaymentEnabled)

    if (!restaurantId || !VALID_MODULES.has(moduleName)) {
      return NextResponse.json({ success: false, message: 'A valid restaurantId and module are required.' }, { status: 400 })
    }

    const owner = await requireOwner(request, restaurantId)
    if (owner.error) return owner.error
    const { admin } = owner

    const { data: existing, error: existingError } = await admin
      .from('payment_gateway_configs')
      .select('id, key_id, secret_ciphertext, secret_iv, secret_tag')
      .eq('restaurant_id', restaurantId)
      .eq('module', moduleName)
      .eq('provider', 'razorpay')
      .maybeSingle()

    if (existingError) throw existingError

    const finalKeyId = keyId || existing?.key_id || ''
    const hasExistingSecret = Boolean(
      existing?.secret_ciphertext && existing?.secret_iv && existing?.secret_tag
    )

    if (enabled && !finalKeyId) {
      return NextResponse.json({ success: false, message: 'Razorpay Key ID is required before online payments can be enabled.' }, { status: 400 })
    }

    if (enabled && !keySecret && !hasExistingSecret) {
      return NextResponse.json({ success: false, message: 'Razorpay Key Secret is required the first time you configure this gateway.' }, { status: 400 })
    }

    const payload = {
      restaurant_id: restaurantId,
      module: moduleName,
      provider: 'razorpay',
      key_id: finalKeyId,
      is_enabled: enabled,
    }

    if (keySecret) {
      const encrypted = encryptGatewaySecret(keySecret)
      payload.secret_ciphertext = encrypted.ciphertext
      payload.secret_iv = encrypted.iv
      payload.secret_tag = encrypted.tag
    } else if (existing) {
      payload.secret_ciphertext = existing.secret_ciphertext
      payload.secret_iv = existing.secret_iv
      payload.secret_tag = existing.secret_tag
    }

    const { error: saveError } = await admin
      .from('payment_gateway_configs')
      .upsert(payload, { onConflict: 'restaurant_id,module,provider' })

    if (saveError) throw saveError

    if (moduleName === 'restaurant') {
      const { error: offlineError } = await admin
        .from('restaurants')
        .update({ enable_counter_payment: offlinePaymentEnabled })
        .eq('id', restaurantId)
      if (offlineError) throw offlineError
    } else {
      const { error: offlineError } = await admin
        .from('resort_properties')
        .update({ pay_at_property: offlinePaymentEnabled })
        .eq('restaurant_id', restaurantId)
      if (offlineError) throw offlineError
    }

    return NextResponse.json({
      success: true,
      configured: Boolean(finalKeyId && (keySecret || hasExistingSecret)),
      enabled,
      keyId: finalKeyId,
      hasSecret: Boolean(keySecret || hasExistingSecret),
      offlinePaymentEnabled,
    })
  } catch (error) {
    console.error('Payment gateway POST error:', error)
    return NextResponse.json({ success: false, message: error?.message || 'Unable to save payment gateway settings.' }, { status: 500 })
  }
}
