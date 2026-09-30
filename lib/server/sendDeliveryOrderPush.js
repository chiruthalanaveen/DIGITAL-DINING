import { createClient } from '@supabase/supabase-js'
import { getFirebaseMessaging } from '@/lib/server/firebaseAdmin'

function getAdminClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase server configuration is incomplete.'
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function text(value, max = 120) {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

export async function sendDeliveryOrderPush({
  restaurantId,
  orderId,
  orderCode,
  customerName,
  totalAmount,
}) {
  try {
    if (!restaurantId || !orderId) {
      return {
        success: false,
        skipped: true,
        reason: 'missing_order_identity',
      }
    }

    const admin = getAdminClient()

    const {
      data: deviceRows,
      error: deviceError,
    } = await admin
      .from('app_push_devices')
      .select('id, actor_role, actor_key, push_token')
      .eq('restaurant_id', restaurantId)
      .eq('app_scope', 'delivery')
      .eq('platform', 'android')
      .eq('is_active', true)

    if (deviceError) {
      throw deviceError
    }

    const {
      data: restaurant,
      error: restaurantError,
    } = await admin
      .from('restaurants')
      .select('owner_id')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError) {
      throw restaurantError
    }

    const managerActorKeys = [
      ...new Set(
        (deviceRows || [])
          .filter(
            (row) =>
              row.actor_role === 'manager'
          )
          .map((row) =>
            String(row.actor_key || '')
              .trim()
              .toLowerCase()
          )
          .filter(Boolean)
      ),
    ]

    let activeManagerKeys = new Set()

    if (managerActorKeys.length > 0) {
      const {
        data: managers,
        error: managersError,
      } = await admin
        .from('staff_users')
        .select('user_id')
        .eq('restaurant_id', restaurantId)
        .eq('role', 'manager')
        .eq('is_active', true)
        .in('user_id', managerActorKeys)

      if (managersError) {
        throw managersError
      }

      activeManagerKeys = new Set(
        (managers || []).map((row) =>
          String(row.user_id || '')
            .trim()
            .toLowerCase()
        )
      )
    }

    const authorizedRows =
      (deviceRows || []).filter(
        (row) => {
          if (
            row.actor_role === 'owner'
          ) {
            return (
              String(row.actor_key) ===
              String(
                restaurant?.owner_id || ''
              )
            )
          }

          if (
            row.actor_role === 'manager'
          ) {
            return activeManagerKeys.has(
              String(row.actor_key || '')
                .trim()
                .toLowerCase()
            )
          }

          return false
        }
      )

    const uniqueTokens = [
      ...new Set(
        authorizedRows
          .map((row) =>
            String(row.push_token || '').trim()
          )
          .filter(Boolean)
      ),
    ]

    if (!uniqueTokens.length) {
      return {
        success: true,
        sent: 0,
        skipped: true,
        reason: 'no_registered_devices',
      }
    }

    const messaging = getFirebaseMessaging()

    let successCount = 0
    let failureCount = 0
    const invalidTokens = []

    for (
      let offset = 0;
      offset < uniqueTokens.length;
      offset += 500
    ) {
      const tokens =
        uniqueTokens.slice(offset, offset + 500)

      const response =
        await messaging.sendEachForMulticast({
          tokens,

          notification: {
            title: 'New Delivery Order',
            body: `${text(orderCode, 50)} · ${text(
              customerName || 'Customer',
              60
            )} · ₹${Number(
              totalAmount || 0
            ).toLocaleString('en-IN')}`,
          },

          data: {
            type: 'delivery_order',
            restaurantId: text(restaurantId, 100),
            orderId: text(orderId, 100),
            orderCode: text(orderCode, 100),
          },

          android: {
            priority: 'high',
            notification: {
              channelId: 'delivery_orders',
              sound: 'default',
              tag: `delivery-${text(orderId, 100)}`,
            },
          },
        })

      successCount += response.successCount
      failureCount += response.failureCount

      response.responses.forEach(
        (item, index) => {
          if (item.success) return

          const code =
            String(item.error?.code || '')

          if (
            [
              'messaging/registration-token-not-registered',
              'messaging/invalid-registration-token',
              'messaging/invalid-argument',
            ].includes(code)
          ) {
            invalidTokens.push(tokens[index])
          }
        }
      )
    }

    if (invalidTokens.length > 0) {
      await admin
        .from('app_push_devices')
        .update({
          is_active: false,
        })
        .in('push_token', invalidTokens)
    }

    return {
      success: true,
      sent: successCount,
      failed: failureCount,
      invalidated: invalidTokens.length,
    }
  } catch (error) {
    // Push delivery must never undo a valid customer order.
    console.error(
      'Delivery native push error:',
      error
    )

    return {
      success: false,
      sent: 0,
      error:
        error?.message ||
        'Unable to send native Delivery push.',
    }
  }
}
