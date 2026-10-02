import Razorpay from 'razorpay'

import { NextResponse } from 'next/server'

import { createClient } from '@supabase/supabase-js'

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



function publicOrder(order) {
  return {
    id: order?.id,
    orderCode: order?.order_code,
    orderNumber: order?.order_number,
    customerName: order?.customer_name,
    items: order?.items || [],
    subtotal: Number(order?.subtotal || 0),
    discountAmount: Number(order?.discount_amount || 0),
    taxAmount: Number(order?.tax_amount || 0),
    sgstAmount: Number(order?.sgst_amount || 0),
    cgstAmount: Number(order?.cgst_amount || 0),
    packingFee: Number(order?.packing_fee || 0),
    deliveryFee: Number(order?.delivery_fee || 0),
    handlingCharge: Number(order?.handling_charge || 0),
    surgeCharge: Number(order?.surge_charge || 0),
    surgeApplied: Boolean(order?.surge_applied),
    totalAmount: Number(order?.total_amount || 0),
    paymentMethod: order?.payment_method,
    paymentStatus: order?.payment_status,
    orderStatus: order?.order_status,
    estimatedDeliveryAt: order?.estimated_delivery_at,
    createdAt: order?.created_at,
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



    const {

      data: created,

      error: createError,

    } = await admin.rpc(

      'create_delivery_order_secure',

      {

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



    const { error: locationSaveError } = await admin

      .from('delivery_orders')

      .update({

        latitude,

        longitude,

        location_accuracy_m:

          locationAccuracy,

        location_captured_at:

          new Date().toISOString(),

        delivery_distance_km:

          deliveryDistanceKm === null

            ? null

            : Number(deliveryDistanceKm.toFixed(2)),

      })

      .eq('id', createdOrderId)



    if (locationSaveError) {

      throw new Error(

        locationSaveError.message ||

          'Unable to save the customer live location.'

      )

    }



    if (

      paymentMethod === 'cod'

    ) {

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

      await admin

        .from('delivery_orders')

        .update({

          payment_status:

            'failed',

          order_status:

            'cancelled',

          cancelled_at:

            new Date().toISOString(),

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

      await admin

        .from('delivery_orders')

        .update({

          payment_status:

            'failed',

          order_status:

            'cancelled',

          cancelled_at:

            new Date().toISOString(),

        })

        .eq(

          'id',

          createdOrderId

        )

    }



    return NextResponse.json(

      {

        success: false,

        message:

          error?.message ||

          'Unable to create Delivery order.',

      },

      { status: 500 }

    )

  }

}
