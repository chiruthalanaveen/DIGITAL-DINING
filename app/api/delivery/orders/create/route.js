import Razorpay from 'razorpay'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { decryptGatewaySecret } from '@/lib/server/paymentGatewayCrypto'
import { sendDeliveryOrderPush } from '@/lib/server/sendDeliveryOrderPush'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
function serverConfig() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Delivery server configuration is incomplete.'
    )
  }
  return {
    url,
    serviceKey,
  }
}
function getAdminClient() {
  const {
    url,
    serviceKey,
  } = serverConfig()
  return createClient(
    url,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}
async function getAuthenticatedDeliveryCustomer(request) {
  // The delivery storefront uses the browser Supabase client, whose session
  // normally lives in browser storage rather than in Next.js SSR cookies.
  // Verify the real Supabase access token; NEVER accept a user ID in JSON.
  const authHeader = String(request.headers.get('authorization') || '').trim()
  if (authHeader) {
    const accessToken = authHeader.match(/^Bearer\s+([^\s]+)$/i)?.[1]
    if (!accessToken) {
      const error = new Error('Invalid authorization header. Please sign in again.')
      error.code = 'CUSTOMER_SESSION_INVALID'
      error.httpStatus = 401
      throw error
    }

    const admin = getAdminClient()
    const { data, error: userError } = await admin.auth.getUser(accessToken)
    if (userError || !data?.user?.id) {
      const error = new Error('Your delivery session has expired. Please sign in again.')
      error.code = 'CUSTOMER_SESSION_INVALID'
      error.httpStatus = 401
      throw error
    }
    return data.user
  }

  // Preserve the previously supported Supabase SSR cookie-based login.
  const { url } = serverConfig()
  const auth = createServerClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {
          // Read-only auth client for this request.
        },
      },
    }
  )
  const {
    data: { user },
    error,
  } = await auth.auth.getUser()
  if (error || !user?.id) return null
  return user
}
function distanceKm(lat1, lng1, lat2, lng2) {
  const firstLat = Number(lat1)
  const firstLng = Number(lng1)
  const secondLat = Number(lat2)
  const secondLng = Number(lng2)
  if (![firstLat, firstLng, secondLat, secondLng].every(Number.isFinite)) {
    return null
  }
  const toRadians = (value) => (value * Math.PI) / 180
  const earthRadiusKm = 6371.0088
  const dLat = toRadians(secondLat - firstLat)
  const dLng = toRadians(secondLng - firstLng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(firstLat)) *
      Math.cos(toRadians(secondLat)) *
      Math.sin(dLng / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))
}
async function readDeliveryCoverage(admin, restaurantCode) {
  const { data: restaurant, error: restaurantError } = await admin
    .from('restaurants')
    .select('id')
    .ilike('restaurant_code', restaurantCode)
    .maybeSingle()
  if (restaurantError) throw restaurantError
  if (!restaurant?.id) {
    throw new Error('Delivery store was not found.')
  }
  const { data: settings, error: settingsError } = await admin
    .from('delivery_settings')
    .select(
      `
        delivery_radius_enabled,
        max_delivery_distance_km,
        delivery_origin_latitude,
        delivery_origin_longitude
      `
    )
    .eq('restaurant_id', restaurant.id)
    .maybeSingle()
  if (settingsError) throw settingsError
  return {
    restaurantId: restaurant.id,
    settings: settings || null,
  }
}
async function readDeliveryGateway(
  admin,
  restaurantId
) {
  const {
    data,
    error,
  } = await admin
    .from('payment_gateway_configs')
    .select(
      `
        key_id,
        secret_ciphertext,
        secret_iv,
        secret_tag,
        is_enabled
      `
    )
    .eq(
      'restaurant_id',
      restaurantId
    )
    .eq('module', 'delivery')
    .eq('provider', 'razorpay')
    .maybeSingle()
  if (error) throw error
  return data || null
}
async function expireStaleInventoryReservations(admin) {
  try {
    const {
      data,
      error,
    } = await admin.rpc(
      'delivery_expire_unpaid_razorpay_orders',
      {
        p_limit: 100,
      }
    )
    if (error) {
      console.error(
        'Delivery inventory expiry cleanup error:',
        error
      )
      return
    }
    if (data?.success === false) {
      console.error(
        'Delivery inventory expiry cleanup failed:',
        data
      )
    }
  } catch (error) {
    console.error(
      'Delivery inventory expiry cleanup exception:',
      error
    )
  }
}
async function runInventoryAction(
  admin,
  functionName,
  args,
  fallbackMessage
) {
  const {
    data,
    error,
  } = await admin.rpc(
    functionName,
    args
  )
  if (error) {
    const actionError = new Error(
      error.message ||
        fallbackMessage
    )
    actionError.code =
      error.code ||
      'INVENTORY_ERROR'
    actionError.httpStatus = 409
    throw actionError
  }
  if (data?.success === false) {
    const actionError = new Error(
      data?.message ||
        fallbackMessage
    )
    actionError.code =
      data?.code ||
      'INVENTORY_ERROR'
    actionError.httpStatus =
      data?.code === 'ORDER_NOT_FOUND'
        ? 404
        : 409
    actionError.inventoryData =
      data
    throw actionError
  }
  return data || {
    success: true,
  }
}
async function releaseInventorySafe(
  admin,
  orderId,
  reason
) {
  if (!admin || !orderId) return
  try {
    const {
      data,
      error,
    } = await admin.rpc(
      'delivery_release_order_inventory',
      {
        p_order_id: orderId,
        p_reason:
          String(reason || '')
            .trim()
            .slice(0, 500),
      }
    )
    if (error) {
      console.error(
        'Delivery inventory release error:',
        error
      )
      return
    }
    if (data?.success === false) {
      console.error(
        'Delivery inventory release failed:',
        data
      )
    }
  } catch (error) {
    console.error(
      'Delivery inventory release exception:',
      error
    )
  }
}
function publicOrder(order) {
  return {
    id: order?.id,
    orderCode:
      order?.order_code,
    orderNumber:
      order?.order_number,
    customerName:
      order?.customer_name,
    items:
      order?.items || [],
    subtotal:
      Number(order?.subtotal || 0),
    discountAmount:
      Number(
        order?.discount_amount || 0
      ),
    taxAmount:
      Number(
        order?.tax_amount || 0
      ),
    packingFee:
      Number(
        order?.packing_fee || 0
      ),
    deliveryFee:
      Number(
        order?.delivery_fee || 0
      ),
    handlingFee:
      Number(
        order?.handling_fee || 0
      ),
    surgeFee:
      Number(
        order?.surge_fee || 0
      ),
    surgeApplied:
      Boolean(
        order?.surge_applied
      ),
    platformFeeCustomerAmount: Number(order?.platform_fee_customer_amount || 0),
    platformFeeChargeCustomer: Boolean(order?.platform_fee_charge_customer),
    platformFeePaise: Number(order?.platform_fee_paise || 0),
    totalAmount:
      Number(
        order?.total_amount || 0
      ),
    paymentMethod:
      order?.payment_method,
    paymentStatus:
      order?.payment_status,
    orderStatus:
      order?.order_status,
    inventoryStatus:
      order?.inventory_status,
    estimatedDeliveryAt:
      order?.estimated_delivery_at,
    createdAt:
      order?.created_at,
  }
}
export async function POST(request) {
  let admin = null
  let createdOrderId = null
  try {
    const body =
      await request
        .json()
        .catch(() => ({}))
    const restaurantCode =
      String(
        body?.restaurantCode || ''
      ).trim()
    const paymentMethod =
      String(
        body?.paymentMethod || ''
      )
        .trim()
        .toLowerCase()
    const latitude = Number(body?.latitude)
    const longitude = Number(body?.longitude)
    const locationAccuracy =
      body?.locationAccuracy === null ||
      body?.locationAccuracy === undefined ||
      body?.locationAccuracy === ''
        ? null
        : Number(body.locationAccuracy)
    if (!restaurantCode) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Delivery store code is missing.',
        },
        { status: 400 }
      )
    }
    if (
      !['cod', 'razorpay'].includes(
        paymentMethod
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Choose a valid payment method.',
        },
        { status: 400 }
      )
    }
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Choose your live delivery location before placing the order.',
        },
        { status: 400 }
      )
    }
    if (
      locationAccuracy !== null &&
      (!Number.isFinite(locationAccuracy) || locationAccuracy < 0)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'The selected live location is invalid. Please choose it again.',
        },
        { status: 400 }
      )
    }
    admin = getAdminClient()
  // Never trust a customer user id sent by the browser.
  const authenticatedCustomer =
    await getAuthenticatedDeliveryCustomer(request)
    const customerUserId =
      authenticatedCustomer?.id || null

    // A newer signed-in storefront explicitly requests an account-linked order.
    // Older guest/API clients remain supported without requiring a login.
    // Never trust a client-supplied user ID: customerUserId is verified by Supabase.
    const requireAccountLink = body?.requireAccountLink === true
    if (requireAccountLink && !customerUserId) {
      return NextResponse.json(
        {
          success: false,
          code: 'DELIVERY_SIGN_IN_REQUIRED',
          message: 'Your login could not be verified. Please sign in again before ordering.',
        },
        { status: 401 }
      )
    }
    // Best-effort cleanup for expired unpaid Razorpay orders.
    // This safely releases inventory reserved by expired checkouts.
    await expireStaleInventoryReservations(admin)
    const coverage = await readDeliveryCoverage(
      admin,
      restaurantCode
    )
    const radiusEnabled = Boolean(
      coverage?.settings?.delivery_radius_enabled
    )
    const maxRadiusKm = Number(
      coverage?.settings?.max_delivery_distance_km
    )
    const originLatitude = Number(
      coverage?.settings?.delivery_origin_latitude
    )
    const originLongitude = Number(
      coverage?.settings?.delivery_origin_longitude
    )
    let deliveryDistanceKm = null
    if (
      Number.isFinite(originLatitude) &&
      Number.isFinite(originLongitude)
    ) {
      deliveryDistanceKm = distanceKm(
        originLatitude,
        originLongitude,
        latitude,
        longitude
      )
    }
    if (radiusEnabled) {
      if (
        !Number.isFinite(maxRadiusKm) ||
        maxRadiusKm <= 0 ||
        !Number.isFinite(originLatitude) ||
        originLatitude < -90 ||
        originLatitude > 90 ||
        !Number.isFinite(originLongitude) ||
        originLongitude < -180 ||
        originLongitude > 180
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Delivery coverage is not configured correctly. Please contact the store.',
          },
          { status: 409 }
        )
      }
      if (
        deliveryDistanceKm === null ||
        deliveryDistanceKm > maxRadiusKm
      ) {
        return NextResponse.json(
          {
            success: false,
            code: 'OUTSIDE_DELIVERY_RADIUS',
            message:
              `This location is outside the delivery area. This store delivers within ${maxRadiusKm.toFixed(1)} km. Your selected pin is ${Number(deliveryDistanceKm || 0).toFixed(2)} km away.`,
            maxDeliveryDistanceKm: maxRadiusKm,
            selectedDistanceKm: deliveryDistanceKm,
          },
          { status: 422 }
        )
      }
    }
    // Customer consent quote (in paise), never trusted as the real fee.
    // Supabase independently computes the fee, then atomically compares it.
    const expectedPlatformFeePaise = Number(body?.expectedPlatformFeePaise)
    if (
      !Number.isSafeInteger(expectedPlatformFeePaise) ||
      expectedPlatformFeePaise < 0 ||
      expectedPlatformFeePaise > 100000
    ) {
      return NextResponse.json({
        success: false,
        message: 'Platform fee quote is missing. Refresh the checkout and retry.',
      }, { status: 400 })
    }
    const {
      data: created,
      error: createError,
    } = await admin.rpc(
      'create_delivery_order_fee_confirmed',
      {
        p_expected_fee_paise: expectedPlatformFeePaise,
        p_restaurant_code:
          restaurantCode,
        p_customer_name:
          String(
            body?.customerName || ''
          ).trim(),
        p_customer_mobile:
          String(
            body?.customerMobile || ''
          )
            .replace(/\D/g, '')
            .slice(0, 10),
        p_alternate_mobile:
          String(
            body?.alternateMobile || ''
          )
            .replace(/\D/g, '')
            .slice(0, 10),
        p_customer_email:
          String(
            body?.customerEmail || ''
          ).trim(),
        p_address_line1:
          String(
            body?.addressLine1 || ''
          ).trim(),
        p_address_line2:
          String(
            body?.addressLine2 || ''
          ).trim(),
        p_landmark:
          String(
            body?.landmark || ''
          ).trim(),
        p_city:
          String(
            body?.city || ''
          ).trim(),
        p_state:
          String(
            body?.state || ''
          ).trim(),
        p_pincode:
          String(
            body?.pincode || ''
          )
            .replace(/\D/g, '')
            .slice(0, 6),
        p_items:
          Array.isArray(body?.items)
            ? body.items.map(
                (item) => ({
                  id: item?.id,
                  quantity:
                    Number(
                      item?.quantity ||
                        1
                    ),
                })
              )
            : [],
        p_payment_method:
          paymentMethod,
        p_customer_note:
          String(
            body?.customerNote || ''
          ).trim(),
      }
    )
    if (createError) {
      console.error(
        'Delivery secure order RPC error:',
        createError
      )
      return NextResponse.json(
        {
          success: false,
          message:
            createError.message ||
            'Unable to create Delivery order.',
        },
        { status: 400 }
      )
    }
    if (
      !created?.success ||
      !created?.order?.id
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            created?.message ||
            'Unable to create Delivery order.',
        },
        { status: 400 }
      )
    }
    createdOrderId =
      created.order.id
    // IMPORTANT: update() without select() can succeed with zero matching rows.
    // Verify the actual row, restaurant scope and linked Google account BEFORE
    // inventory consumption, COD dispatch, or Razorpay checkout.
    const locationAndIdentity = {
      latitude,
      longitude,
      location_accuracy_m: locationAccuracy,
      location_captured_at: new Date().toISOString(),
      delivery_distance_km: deliveryDistanceKm === null
        ? null
        : Number(deliveryDistanceKm.toFixed(2)),
    }
    // Do not erase a pre-existing account association in legacy guest flows.
    if (customerUserId) {
      locationAndIdentity.customer_user_id = customerUserId
    }

    const {
      data: linkedOrder,
      error: locationSaveError,
    } = await admin
      .from('delivery_orders')
      .update(locationAndIdentity)
      .eq('id', createdOrderId)
      .eq('restaurant_id', coverage.restaurantId)
      .select('id, restaurant_id, customer_user_id')
      .maybeSingle()

    if (locationSaveError || !linkedOrder?.id) {
      const accountSaveError = new Error(
        locationSaveError?.message ||
        'Order was created, but the delivery location or account link could not be saved.'
      )
      accountSaveError.code = 'ORDER_IDENTITY_SAVE_FAILED'
      accountSaveError.httpStatus = 409
      throw accountSaveError
    }
    if (customerUserId && String(linkedOrder.customer_user_id) !== String(customerUserId)) {
      const accountLinkError = new Error(
        'Your order could not be linked to the signed-in account. Please try again.'
      )
      accountLinkError.code = 'ORDER_ACCOUNT_LINK_FAILED'
      accountLinkError.httpStatus = 409
      throw accountLinkError
    }

    // We only report a verified association, never a guessed phone/email match.
    const customerAccountLinked =
      Boolean(customerUserId && linkedOrder.customer_user_id === customerUserId)
    // --------------------------------------------------------
    // INVENTORY RESERVATION
    // --------------------------------------------------------
    // Food items with stock tracking disabled are ignored by
    // the database inventory engine. Stock-tracked products are
    // atomically reserved here before COD dispatch or Razorpay.
    await runInventoryAction(
        admin,
        'delivery_reserve_order_inventory',
        {
          p_order_id: createdOrderId,
        },
        'Unable to reserve stock for this order.'
      )
    if (
      paymentMethod === 'cod'
    ) {
      // COD becomes a confirmed stock sale immediately.
      // This changes stock_quantity and clears the reservation
      // atomically. Repeated calls are idempotent in PostgreSQL.
      await runInventoryAction(
        admin,
        'delivery_consume_order_inventory',
        {
          p_order_id: createdOrderId,
        },
        'Unable to confirm stock for this COD order.'
      )
      try {
        await admin.rpc(
          'try_delivery_auto_assignment',
          {
            p_restaurant_id:
              String(created.restaurantId || ''),
          }
        )
      } catch (assignmentError) {
        console.error(
          'Delivery COD auto assignment fallback error:',
          assignmentError
        )
      }
      await sendDeliveryOrderPush({
        restaurantId:
          String(
            created.restaurantId || ''
          ),
        orderId:
          created.order.id,
        orderCode:
          created.order.order_code,
        customerName:
          created.order.customer_name,
        totalAmount:
          created.order.total_amount,
      })
      return NextResponse.json({
        success: true,
        customerAccountLinked,
        paymentMethod: 'cod',
        order:
          publicOrder(
            created.order
          ),
      })
    }
    const restaurantId =
      String(
        created.restaurantId || ''
      ).trim()
    const gateway =
      await readDeliveryGateway(
        admin,
        restaurantId
      )
    if (
      !gateway?.is_enabled ||
      !gateway?.key_id ||
      !gateway?.secret_ciphertext ||
      !gateway?.secret_iv ||
      !gateway?.secret_tag
    ) {
      await releaseInventorySafe(
        admin,
        createdOrderId,
        'Razorpay is not configured for this store'
      )
      await admin
        .from('delivery_orders')
        .update({
          payment_status:
            'failed',
          order_status:
            'cancelled',
          cancelled_at:
            new Date().toISOString(),
          payment_expires_at:
            null,
        })
        .eq('id', createdOrderId)
      return NextResponse.json(
        {
          success: false,
          message:
            'Online Delivery payment is not configured for this store.',
        },
        { status: 400 }
      )
    }
    const keySecret =
      decryptGatewaySecret({
        ciphertext:
          gateway.secret_ciphertext,
        iv: gateway.secret_iv,
        tag: gateway.secret_tag,
      })
    const amountInPaise =
      Math.round(
        Number(
          created.order.total_amount
        ) * 100
      )
    if (
      !Number.isInteger(
        amountInPaise
      ) ||
      amountInPaise <= 0
    ) {
      throw new Error(
        'Calculated Delivery payment amount is invalid.'
      )
    }
    const razorpay =
      new Razorpay({
        key_id:
          gateway.key_id,
        key_secret:
          keySecret,
      })
    const razorpayOrder =
      await razorpay.orders.create({
        amount:
          amountInPaise,
        currency: 'INR',
        receipt:
          `del_${String(
            created.order.order_code ||
              Date.now()
          )
            .replace(
              /[^a-zA-Z0-9_-]/g,
              ''
            )
            .slice(0, 35)}`,
        notes: {
          delivery_order_id:
            String(
              created.order.id
            ),
          order_code:
            String(
              created.order.order_code
            ),
          restaurant_id:
            restaurantId,
          restaurant_code:
            restaurantCode,
        },
      })
    if (
      !razorpayOrder?.id
    ) {
      throw new Error(
        'Razorpay did not return a valid Delivery payment order.'
      )
    }
    const {
      data: saved,
      error: saveError,
    } = await admin
      .from('delivery_orders')
      .update({
        payment_provider:
          'razorpay',
        provider_order_id:
          razorpayOrder.id,
        payment_expires_at:
          new Date(
            Date.now() +
              15 * 60 * 1000
          ).toISOString(),
      })
      .eq('id', createdOrderId)
      .select('id')
      .maybeSingle()
    if (
      saveError ||
      !saved
    ) {
      throw new Error(
        'Unable to attach Razorpay payment to the Delivery order.'
      )
    }
    return NextResponse.json({
      success: true,
      customerAccountLinked,
      paymentMethod:
        'razorpay',
      keyId: gateway.key_id,
      orderId:
        razorpayOrder.id,
      amount:
        razorpayOrder.amount,
      currency:
        razorpayOrder.currency ||
        'INR',
      deliveryOrderId:
        created.order.id,
      deliveryOrderCode:
        created.order.order_code,
      order:
        publicOrder(
          created.order
        ),
    })
  } catch (error) {
    console.error(
      'Delivery order create API error:',
      error
    )
    if (
      admin &&
      createdOrderId
    ) {
      await releaseInventorySafe(
        admin,
        createdOrderId,
        error?.message ||
          'Delivery order creation failed'
      )
      await admin
        .from('delivery_orders')
        .update({
          payment_status:
            'failed',
          order_status:
            'cancelled',
          cancelled_at:
            new Date().toISOString(),
          payment_expires_at:
            null,
        })
        .eq(
          'id',
          createdOrderId
        )
    }
    const responseBody = {
      success: false,
      message:
        error?.message ||
        'Unable to create Delivery order.',
    }
    if (error?.code) {
      responseBody.code =
        error.code
    }
    if (error?.inventoryData) {
      const inventoryData =
        error.inventoryData
      if (inventoryData.itemId) {
        responseBody.itemId =
          inventoryData.itemId
      }
      if (inventoryData.itemName) {
        responseBody.itemName =
          inventoryData.itemName
      }
      if (
        inventoryData.requestedQuantity !==
        undefined
      ) {
        responseBody.requestedQuantity =
          inventoryData.requestedQuantity
      }
      if (
        inventoryData.availableQuantity !==
        undefined
      ) {
        responseBody.availableQuantity =
          inventoryData.availableQuantity
      }
    }
    const responseStatus =
      Number.isInteger(
        error?.httpStatus
      )
        ? error.httpStatus
        : 500
    return NextResponse.json(
      responseBody,
      { status: responseStatus }
    )
  }
}
