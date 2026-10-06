import {

  NextResponse,

} from 'next/server'



import {

  requireAdmin,

} from '@/lib/server/adminSession'



import {

  getAdminSupabase,

} from '@/lib/server/adminSupabase'



export const runtime =

  'nodejs'



export const dynamic =

  'force-dynamic'



const VALID_PLAN_CODES =

  new Set([

    'restaurant_pro',

    'delivery',

    'restaurant_resort_pro',

    'restaurant_delivery',

    'restaurant_resort_delivery',

  ])



const PLAN_MATRIX = {

  restaurant_pro: {

    label: 'Restaurant',

    plan: 'Pro',

    business_type:

      'restaurant',

    resort_enabled:

      false,

    delivery_enabled:

      false,

  },



  delivery: {

    label: 'Delivery',

    plan: 'Delivery',

    business_type:

      'delivery',

    resort_enabled:

      false,

    delivery_enabled:

      true,

  },



  restaurant_resort_pro: {

    label:

      'Restaurant + Resort',

    plan: 'Pro+',

    business_type:

      'restaurant_resort',

    resort_enabled:

      true,

    delivery_enabled:

      false,

  },



  restaurant_delivery: {

    label:

      'Restaurant + Delivery',

    plan: 'Pro',

    business_type:

      'restaurant_delivery',

    resort_enabled:

      false,

    delivery_enabled:

      true,

  },



  restaurant_resort_delivery:

    {

      label:

        'Restaurant + Resort + Delivery',

      plan: 'Pro+',

      business_type:

        'restaurant_resort_delivery',

      resort_enabled:

        true,

      delivery_enabled:

        true,

    },

}



const VALID_STATUS =

  new Set([

    'active',

    'trial',

    'trialing',

    'pending',

    'inactive',

    'expired',

    'suspended',

    'cancelled',

  ])



const VALID_BILLING =

  new Set([

    '1month',

    '6months',

    '12months',

  ])



const VALID_CUSTOM_PLAN_STATUS =

  new Set([

    'new',

    'reviewing',

    'contacted',

    'quoted',

    'accepted',

    'rejected',

  ])



function cleanText(

  value,

  max = 500

) {

  return String(

    value ?? ''

  )

    .trim()

    .slice(

      0,

      max

    )

}



function numberValue(

  value

) {

  const parsed =

    Number(value)



  return Number.isFinite(

    parsed

  )

    ? parsed

    : 0

}



function asArray(

  value

) {

  return Array.isArray(

    value

  )

    ? value

    : []

}



function dateValue(

  value

) {

  if (!value) {

    return null

  }



  const parsed =

    new Date(value)



  return Number.isNaN(

    parsed.getTime()

  )

    ? null

    : parsed

}



function todayStartUtcForIndia() {

  const now =

    new Date()



  const offsetMs =

    5.5 *

    60 *

    60 *

    1000



  const indiaNow =

    new Date(

      now.getTime() +

        offsetMs

    )



  indiaNow.setUTCHours(

    0,

    0,

    0,

    0

  )



  return new Date(

    indiaNow.getTime() -

      offsetMs

  )

}



async function readTable(

  admin,

  table,

  {

    limit = 1000,

    orderBy =

      'created_at',

    ascending =

      false,

  } = {}

) {

  try {

    let query =

      admin

        .from(table)

        .select('*')

        .limit(limit)



    if (orderBy) {

      query =

        query.order(

          orderBy,

          {

            ascending,

          }

        )

    }



    const {

      data,

      error,

    } =

      await query



    if (error) {

      return {

        rows: [],

        warning:

          `${table}: ${error.message}`,

      }

    }



    return {

      rows:

        asArray(data),

      warning: '',

    }

  } catch (error) {

    return {

      rows: [],

      warning:

        `${table}: ${

          error?.message ||

          'unavailable'

        }`,

    }

  }

}



function sanitizeRestaurant(

  row

) {

  return {

    id:

      row?.id || '',

    name:

      row?.name || '',

    email:

      row?.email || '',

    phone:

      row?.phone || '',

    restaurant_code:

      row?.restaurant_code ||

      '',

    plan:

      row?.plan || '',

    plan_code:

      row?.plan_code ||

      '',

    billing_cycle:

      row?.billing_cycle ||

      '',

    subscription_status:

      row?.subscription_status ||

      '',

    subscription_expires_at:

      row?.subscription_expires_at ||

      null,

    subscription_started_at:

      row?.subscription_started_at ||

      row?.subscription_start_date ||

      null,

    business_type:

      row?.business_type ||

      '',

    resort_enabled:

      Boolean(

        row?.resort_enabled

      ),

    delivery_enabled:

      Boolean(

        row?.delivery_enabled

      ),

    created_at:

      row?.created_at ||

      null,

  }

}



function sanitizeOrder(

  row,

  module

) {

  return {

    id:

      row?.id || '',

    module,

    restaurant_id:

      row?.restaurant_id ||

      '',

    order_code:

      row?.order_code ||

      row?.booking_code ||

      row?.order_number ||

      '',

    customer_name:

      row?.customer_name ||

      row?.guest_name ||

      '',

    status:

      row?.order_status ||

      row?.booking_status ||

      row?.status ||

      '',

    payment_status:

      row?.payment_status ||

      '',

    payment_method:

      row?.payment_method ||

      row?.payment_mode ||

      '',

    total_amount:

      numberValue(

        row?.total_amount ??

          row?.total ??

          row?.grand_total

      ),

    created_at:

      row?.created_at ||

      row?.booked_at ||

      null,

  }

}



function sanitizeStaff(

  row

) {

  // Password / credential fields are intentionally omitted.

  return {

    id:

      row?.id || '',

    restaurant_id:

      row?.restaurant_id ||

      '',

    name:

      row?.name || '',

    role:

      row?.role || '',

    user_id:

      row?.user_id || '',

    mobile:

      row?.mobile || '',

    is_active:

      row?.is_active ??

      true,

    created_at:

      row?.created_at ||

      null,

  }

}



function sanitizeReview(

  row

) {

  return {

    id:

      row?.id || '',

    restaurant_id:

      row?.restaurant_id ||

      '',

    delivery_order_id:

      row?.delivery_order_id ||

      '',

    menu_item_id:

      row?.menu_item_id ||

      '',

    product_name:

      row?.product_name ||

      '',

    customer_display_name:

      row?.customer_display_name ||

      'Verified customer',

    rating:

      numberValue(

        row?.rating

      ),

    review_text:

      row?.review_text ||

      '',

    is_visible:

      row?.is_visible !==

      false,

    created_at:

      row?.created_at ||

      null,

  }

}



function sanitizeGateway(

  row

) {

  const keyId =

    cleanText(

      row?.key_id,

      200

    )



  return {

    id:

      row?.id || '',

    restaurant_id:

      row?.restaurant_id ||

      '',

    module:

      row?.module || '',

    provider:

      row?.provider || '',

    key_id_masked:

      keyId

        ? `${keyId.slice(

            0,

            6

          )}••••${keyId.slice(

            -4

          )}`

        : '',

    is_enabled:

      Boolean(

        row?.is_enabled

      ),

    updated_at:

      row?.updated_at ||

      null,

  }

}



function isToday(

  value,

  start

) {

  const date =

    dateValue(value)



  return Boolean(

    date &&

    date >= start

  )

}



function restaurantNameMap(

  restaurants

) {

  return Object.fromEntries(

    restaurants.map(

      (row) => [

        String(

          row.id

        ),

        row.name ||

          row.restaurant_code ||

          'Tenant',

      ]

    )

  )

}



async function logAudit(

  admin,

  session,

  request,

  {

    action,

    entityType,

    entityId,

    beforeData,

    afterData,

  }

) {

  try {

    await admin

      .from(

        'admin_audit_logs'

      )

      .insert({

        actor_email:

          session.email,

        action:

          cleanText(

            action,

            120

          ),

        entity_type:

          cleanText(

            entityType,

            120

          ),

        entity_id:

          cleanText(

            entityId,

            200

          ),

        before_data:

          beforeData ||

          null,

        after_data:

          afterData ||

          null,

        metadata: {

          ip:

            cleanText(

              request.headers.get(

                'x-forwarded-for'

              ) ||

                request.headers.get(

                  'x-real-ip'

                ) ||

                '',

              300

            ),

          user_agent:

            cleanText(

              request.headers.get(

                'user-agent'

              ) || '',

              500

            ),

        },

      })

  } catch (error) {

    console.warn(

      '[ADMIN AUDIT LOG]',

      error?.message ||

        error

    )

  }

}



function unauthorized() {

  return NextResponse.json(

    {

      success: false,

      message:

        'Admin authentication required.',

    },

    {

      status: 401,

      headers: {

        'Cache-Control':

          'no-store',

      },

    }

  )

}



export async function GET(

  request

) {

  const session =

    requireAdmin(

      request

    )



  if (!session) {

    return unauthorized()

  }



  try {

    const admin =

      getAdminSupabase()



    const [

      restaurantsResult,

      ordersResult,

      deliveryOrdersResult,

      bookingsResult,

      staffResult,

      driversResult,

      packersResult,

      deliverySettingsResult,

      menuResult,

      supportResult,

      legacySupportResult,

      pickupResult,

      reviewsResult,

      gatewaysResult,

      settingsResult,

      auditResult,

      customPlanRequestsResult,

    ] =

      await Promise.all([

        readTable(

          admin,

          'restaurants',

          {

            limit: 2000,

          }

        ),



        readTable(

          admin,

          'orders',

          {

            limit: 1000,

          }

        ),



        readTable(

          admin,

          'delivery_orders',

          {

            limit: 1000,

          }

        ),



        readTable(

          admin,

          'room_bookings',

          {

            limit: 1000,

          }

        ),



        readTable(

          admin,

          'staff_users',

          {

            limit: 2000,

          }

        ),



        readTable(

          admin,

          'delivery_drivers',

          {

            limit: 1000,

          }

        ),



        readTable(

          admin,

          'delivery_packers',

          {

            limit: 1000,

          }

        ),



        readTable(

          admin,

          'delivery_settings',

          {

            limit: 1000,

            orderBy:

              'updated_at',

          }

        ),



        readTable(

          admin,

          'menu_items',

          {

            limit: 3000,

            orderBy:

              'stock_updated_at',

          }

        ),



        readTable(

          admin,

          'delivery_support_threads',

          {

            limit: 500,

          }

        ),



        readTable(

          admin,

          'support_chat_sessions',

          {

            limit: 500,

          }

        ),



        readTable(

          admin,

          'delivery_return_pickups',

          {

            limit: 500,

          }

        ),



        readTable(

          admin,

          'delivery_product_reviews',

          {

            limit: 1000,

          }

        ),



        readTable(

          admin,

          'payment_gateway_configs',

          {

            limit: 500,

            orderBy:

              'updated_at',

          }

        ),



        readTable(

          admin,

          'platform_settings',

          {

            limit: 50,

            orderBy: null,

          }

        ),



        readTable(

          admin,

          'admin_audit_logs',

          {

            limit: 200,

          }

        ),

 

        readTable(

          admin,

          'custom_plan_requests',

          {

            limit: 1000,

            orderBy: 'created_at',

            ascending: false,

          }

        ),

      ])



    const warnings =

      [

        restaurantsResult,

        ordersResult,

        deliveryOrdersResult,

        bookingsResult,

        staffResult,

        driversResult,

        packersResult,

        deliverySettingsResult,

        menuResult,

        supportResult,

        legacySupportResult,

        pickupResult,

        reviewsResult,

        gatewaysResult,

        settingsResult,

        auditResult,

      customPlanRequestsResult,

      ]

        .map(

          (result) =>

            result.warning

        )

        .filter(Boolean)



    let authUserCount = 0



    try {

      const {

        data,

        error,

      } =

        await admin

          .auth

          .admin

          .listUsers({

            page: 1,

            perPage:

              1000,

          })



      if (error) {

        throw error

      }



      authUserCount =

        Number(

          data?.total ||

            data?.users

              ?.length ||

            0

        )

    } catch (error) {

      warnings.push(

        `auth.users: ${

          error?.message ||

          'unavailable'

        }`

      )

    }



    const restaurants =

      restaurantsResult.rows.map(

        sanitizeRestaurant

      )



    const normalOrders =

      ordersResult.rows.map(

        (row) =>

          sanitizeOrder(

            row,

            'restaurant'

          )

      )



    const deliveryOrders =

      deliveryOrdersResult.rows.map(

        (row) =>

          sanitizeOrder(

            row,

            'delivery'

          )

      )



    const resortBookings =

      bookingsResult.rows.map(

        (row) =>

          sanitizeOrder(

            row,

            'resort'

          )

      )



    const staff =

      staffResult.rows.map(

        sanitizeStaff

      )



    const reviews =

      reviewsResult.rows.map(

        sanitizeReview

      )



    const gatewayRows =

      gatewaysResult.rows.map(

        sanitizeGateway

      )



    const startToday =

      todayStartUtcForIndia()



    const todayOrders =

      [

        ...normalOrders,

        ...deliveryOrders,

        ...resortBookings,

      ].filter(

        (row) =>

          isToday(

            row.created_at,

            startToday

          )

      )



    const revenueToday =

      todayOrders.reduce(

        (

          total,

          row

        ) =>

          total +

          numberValue(

            row.total_amount

          ),

        0

      )



    const activeSubscriptions =

      restaurants.filter(

        (row) =>

          [

            'active',

            'trial',

            'trialing',

          ].includes(

            String(

              row.subscription_status ||

                ''

            ).toLowerCase()

          )

      ).length



    const now =

      Date.now()



    const sevenDays =

      7 *

      24 *

      60 *

      60 *

      1000



    const expiringSoon =

      restaurants.filter(

        (row) => {

          const expiry =

            dateValue(

              row.subscription_expires_at

            )



          if (!expiry) {

            return false

          }



          const delta =

            expiry.getTime() -

            now



          return (

            delta >= 0 &&

            delta <=

              sevenDays

          )

        }

      ).length



    const lowStock =

      menuResult.rows

        .filter(

          (row) => {

            if (

              row?.track_stock !==

              true

            ) {

              return false

            }



            const stock =

              numberValue(

                row?.stock_quantity

              )



            const reserved =

              numberValue(

                row?.reserved_quantity

              )



            const threshold =

              numberValue(

                row?.low_stock_threshold

              )



            return (

              Math.max(

                0,

                stock -

                  reserved

              ) <=

              threshold

            )

          }

        )

        .slice(

          0,

          200

        )

        .map(

          (row) => ({

            id:

              row?.id || '',

            restaurant_id:

              row?.restaurant_id ||

              '',

            name:

              row?.name || '',

            category:

              row?.category || '',

            stock_quantity:

              numberValue(

                row?.stock_quantity

              ),

            reserved_quantity:

              numberValue(

                row?.reserved_quantity

              ),

            low_stock_threshold:

              numberValue(

                row?.low_stock_threshold

              ),

            is_out_of_stock:

              Boolean(

                row?.is_out_of_stock

              ),

          })

        )



    const siteStatus =

      settingsResult.rows.find(

        (row) =>

          row?.key ===

          'website_status'

      )?.status ||

      'Working'



    const nameMap =

      restaurantNameMap(

        restaurants

      )



    const supportThreads =

      supportResult.rows.map(

        (row) => ({

          id:

            row?.id || '',

          thread_code:

            row?.thread_code ||

            '',

          restaurant_id:

            row?.restaurant_id ||

            '',

          restaurant_name:

            nameMap[

              String(

                row?.restaurant_id

              )

            ] ||

            'Tenant',

          delivery_order_id:

            row?.delivery_order_id ||

            '',

          customer_name:

            row?.customer_name ||

            '',

          customer_mobile:

            row?.customer_mobile ||

            '',

          status:

            row?.status || '',

          latest_message_at:

            row?.latest_message_at ||

            null,

          created_at:

            row?.created_at ||

            null,

        })

      )



    const legacySupport =

      legacySupportResult.rows.map(

        (row) => ({

          id:

            row?.id || '',

          restaurant_id:

            row?.restaurant_id ||

            '',

          restaurant_name:

            nameMap[

              String(

                row?.restaurant_id

              )

            ] ||

            row?.restaurant_name ||

            'Tenant',

          status:

            row?.status ||

            row?.chat_status ||

            '',

          created_at:

            row?.created_at ||

            null,

          updated_at:

            row?.updated_at ||

            null,

        })

      )



    const returnPickups =

      pickupResult.rows.map(

        (row) => ({

          id:

            row?.id || '',

          pickup_code:

            row?.pickup_code ||

            '',

          restaurant_id:

            row?.restaurant_id ||

            '',

          restaurant_name:

            nameMap[

              String(

                row?.restaurant_id

              )

            ] ||

            'Tenant',

          original_order_id:

            row?.original_order_id ||

            '',

          driver_id:

            row?.driver_id ||

            '',

          customer_name:

            row?.customer_name ||

            '',

          customer_mobile:

            row?.customer_mobile ||

            '',

          status:

            row?.status || '',

          created_at:

            row?.created_at ||

            null,

        })

      )



    const drivers =

      driversResult.rows.map(

        (row) => ({

          id:

            row?.id || '',

          restaurant_id:

            row?.restaurant_id ||

            '',

          name:

            row?.name || '',

          mobile:

            row?.mobile || '',

          is_active:

            row?.is_active !==

            false,

          created_at:

            row?.created_at ||

            null,

        })

      )



    const packers =

      packersResult.rows.map(

        (row) => ({

          id:

            row?.id || '',

          restaurant_id:

            row?.restaurant_id ||

            '',

          name:

            row?.name || '',

          mobile:

            row?.mobile || '',

          is_active:

            row?.is_active !==

            false,

          created_at:

            row?.created_at ||

            null,

        })

      )



    const deliverySettings =

      deliverySettingsResult.rows.map(

        (row) => ({

          id:

            row?.id || '',

          restaurant_id:

            row?.restaurant_id ||

            '',

          restaurant_name:

            nameMap[

              String(

                row?.restaurant_id

              )

            ] ||

            'Tenant',

          store_name:

            row?.store_name ||

            '',

          is_open:

            row?.is_open !==

            false,

          cod_enabled:

            row?.cod_enabled !==

            false,

          online_payment_enabled:

            row?.online_payment_enabled !==

            false,

          delivery_fee:

            numberValue(

              row?.delivery_fee

            ),

          handling_charge:

            numberValue(

              row?.handling_charge

            ),

          surge_charge:

            numberValue(

              row?.surge_charge

            ),

          updated_at:

            row?.updated_at ||

            null,

        })

      )



    const allRecentOrders =

      [

        ...normalOrders,

        ...deliveryOrders,

        ...resortBookings,

      ]

        .sort(

          (a, b) =>

            new Date(

              b.created_at ||

                0

            ).getTime() -

            new Date(

              a.created_at ||

                0

            ).getTime()

        )

        .slice(

          0,

          200

        )

        .map(

          (row) => ({

            ...row,

            restaurant_name:

              nameMap[

                String(

                  row.restaurant_id

                )

              ] ||

              'Tenant',

          })

        )



    const avgRating =

      reviews.length

        ? reviews.reduce(

            (

              sum,

              row

            ) =>

              sum +

              numberValue(

                row.rating

              ),

            0

          ) /

          reviews.length

        : 0



    return NextResponse.json(

      {

        success: true,



        generatedAt:

          new Date().toISOString(),



        admin: {

          email:

            session.email,

        },



        summary: {

          authUsers:

            authUserCount,

          tenants:

            restaurants.length,

          activeSubscriptions,

          expiringSoon,

          restaurantEnabled:

            restaurants.filter(

              (row) =>

                row.plan_code !==

                  'delivery'

            ).length,

          deliveryEnabled:

            restaurants.filter(

              (row) =>

                row.delivery_enabled ||

                [

                  'delivery',

                  'restaurant_delivery',

                  'restaurant_resort_delivery',

                ].includes(

                  row.plan_code

                )

            ).length,

          resortEnabled:

            restaurants.filter(

              (row) =>

                row.resort_enabled

            ).length,

          ordersToday:

            todayOrders.length,

          revenueToday,

          restaurantOrders:

            normalOrders.length,

          deliveryOrders:

            deliveryOrders.length,

          resortBookings:

            resortBookings.length,

          staff:

            staff.length,

          drivers:

            drivers.length,

          packers:

            packers.length,

          openHelpCentre:

            supportThreads.filter(

              (row) =>

                row.status ===

                'open'

            ).length,

          returnPickupsOpen:

            returnPickups.filter(

              (row) =>

                ![

                  'completed',

                  'returned_to_store',

                  'cancelled',

                ].includes(

                  String(

                    row.status ||

                      ''

                  ).toLowerCase()

                )

            ).length,

          lowStock:

            lowStock.length,

          reviews:

            reviews.length,

          averageRating:

            Number(

              avgRating.toFixed(

                2

              )

            ),

          configuredGateways:

            gatewayRows.filter(

              (row) =>

                row.is_enabled

            ).length,

          customPlanRequests:

            customPlanRequestsResult.rows.length,

          newCustomPlanRequests:

            customPlanRequestsResult.rows.filter(

              (row) =>

                String(row?.status || '').toLowerCase() === 'new'

            ).length,

        },



        platform: {

          websiteStatus:

            siteStatus,

          installedApp: {

            startUrl:

              '/app',

            scope:

              '/app/',

            description:

              'Installed Digital Dine-In PWA opens the app/app portal login area.',

          },

        },



        tenants:

          restaurants,



        orders:

          allRecentOrders,



        staff,



        drivers,

        packers,

        deliverySettings,



        lowStock,



        supportThreads,

        legacySupport,

        returnPickups,



        reviews,



        gateways:

          gatewayRows,



        customPlanRequests:

          customPlanRequestsResult.rows.map(

            (row) => ({

              id: row?.id || '',

              customer_name: row?.customer_name || '',

              contact_number: row?.contact_number || '',

              email: row?.email || '',

              business_name: row?.business_name || '',

              business_city: row?.business_city || '',

              restaurant_selected: Boolean(row?.restaurant_selected),

              delivery_selected: Boolean(row?.delivery_selected),

              resort_selected: Boolean(row?.resort_selected),

              restaurant_requirements: asArray(row?.restaurant_requirements),

              delivery_requirements: asArray(row?.delivery_requirements),

              resort_requirements: asArray(row?.resort_requirements),

              additional_requirements: row?.additional_requirements || '',

              quoted_monthly_price: row?.quoted_monthly_price ?? null,

              admin_notes: row?.admin_notes || '',

              status: row?.status || 'new',

              contacted_at: row?.contacted_at || null,

              quoted_at: row?.quoted_at || null,

              accepted_at: row?.accepted_at || null,

              created_at: row?.created_at || null,

              updated_at: row?.updated_at || null,

            })

          ),



        auditLogs:

          auditResult.rows.map(

            (row) => ({

              id:

                row?.id ||

                '',

              actor_email:

                row?.actor_email ||

                '',

              action:

                row?.action ||

                '',

              entity_type:

                row?.entity_type ||

                '',

              entity_id:

                row?.entity_id ||

                '',

              before_data:

                row?.before_data ||

                null,

              after_data:

                row?.after_data ||

                null,

              created_at:

                row?.created_at ||

                null,

            })

          ),



        warnings,

      },

      {

        headers: {

          'Cache-Control':

            'no-store',

        },

      }

    )

  } catch (error) {

    console.error(

      '[ADMIN CONTROL CENTER GET]',

      error

    )



    return NextResponse.json(

      {

        success: false,

        message:

          error?.message ||

          'Unable to load Admin Control Center.',

      },

      {

        status: 500,

      }

    )

  }

}



export async function POST(

  request

) {

  const session =

    requireAdmin(

      request

    )



  if (!session) {

    return unauthorized()

  }



  try {

    const admin =

      getAdminSupabase()



    const body =

      await request

        .json()

        .catch(

          () => ({})

        )



    const action =

      cleanText(

        body?.action,

        100

      )



    if (

      action ===

      'update_tenant_access'

    ) {

      const restaurantId =

        cleanText(

          body?.restaurantId,

          100

        )



      const planCode =

        cleanText(

          body?.planCode,

          100

        )



      const status =

        cleanText(

          body?.subscriptionStatus,

          50

        ).toLowerCase()



      const billingCycle =

        cleanText(

          body?.billingCycle,

          50

        )



      const expiry =

        body?.subscriptionExpiresAt

          ? new Date(

              body

                .subscriptionExpiresAt

            )

          : null



      if (

        !restaurantId ||

        !VALID_PLAN_CODES.has(

          planCode

        ) ||

        !VALID_STATUS.has(

          status

        )

      ) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Invalid tenant access update.',

          },

          {

            status: 400,

          }

        )

      }



      if (

        billingCycle &&

        !VALID_BILLING.has(

          billingCycle

        )

      ) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Invalid billing cycle.',

          },

          {

            status: 400,

          }

        )

      }



      if (

        expiry &&

        Number.isNaN(

          expiry.getTime()

        )

      ) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Invalid subscription expiry date.',

          },

          {

            status: 400,

          }

        )

      }



      const {

        data: before,

        error:

          beforeError,

      } =

        await admin

          .from(

            'restaurants'

          )

          .select(

            '*'

          )

          .eq(

            'id',

            restaurantId

          )

          .maybeSingle()



      if (beforeError) {

        throw beforeError

      }



      if (!before) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Tenant was not found.',

          },

          {

            status: 404,

          }

        )

      }



      const plan =

        PLAN_MATRIX[

          planCode

        ]



      const update = {

        plan_code:

          planCode,

        plan:

          plan.plan,

        business_type:

          plan.business_type,

        resort_enabled:

          plan.resort_enabled,

        delivery_enabled:

          plan.delivery_enabled,

        subscription_status:

          status,

      }



      if (billingCycle) {

        update.billing_cycle =

          billingCycle

      }



      if (expiry) {

        update.subscription_expires_at =

          expiry.toISOString()

      }



      const {

        data: after,

        error,

      } =

        await admin

          .from(

            'restaurants'

          )

          .update(

            update

          )

          .eq(

            'id',

            restaurantId

          )

          .select(

            '*'

          )

          .single()



      if (error) {

        throw error

      }



      await logAudit(

        admin,

        session,

        request,

        {

          action:

            'update_tenant_access',

          entityType:

            'restaurant',

          entityId:

            restaurantId,

          beforeData:

            sanitizeRestaurant(

              before

            ),

          afterData:

            sanitizeRestaurant(

              after

            ),

        }

      )



      return NextResponse.json({

        success: true,

        tenant:

          sanitizeRestaurant(

            after

          ),

      })

    }



    if (

      action ===

      'set_website_status'

    ) {

      const status =

        body?.status ===

        'Not Working'

          ? 'Not Working'

          : 'Working'



      const {

        data: before,

      } =

        await admin

          .from(

            'platform_settings'

          )

          .select('*')

          .eq(

            'key',

            'website_status'

          )

          .maybeSingle()



      const {

        data: after,

        error,

      } =

        await admin

          .from(

            'platform_settings'

          )

          .upsert(

            {

              key:

                'website_status',

              status,

              updated_at:

                new Date().toISOString(),

            },

            {

              onConflict:

                'key',

            }

          )

          .select('*')

          .single()



      if (error) {

        throw error

      }



      await logAudit(

        admin,

        session,

        request,

        {

          action:

            'set_website_status',

          entityType:

            'platform',

          entityId:

            'website_status',

          beforeData:

            before,

          afterData:

            after,

        }

      )



      return NextResponse.json({

        success: true,

        status,

      })

    }



    if (

      action ===

      'set_review_visibility'

    ) {

      const reviewId =

        cleanText(

          body?.reviewId,

          100

        )



      const visible =

        Boolean(

          body?.visible

        )



      const {

        data: before,

        error:

          beforeError,

      } =

        await admin

          .from(

            'delivery_product_reviews'

          )

          .select('*')

          .eq(

            'id',

            reviewId

          )

          .maybeSingle()



      if (beforeError) {

        throw beforeError

      }



      if (!before) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Review was not found.',

          },

          {

            status: 404,

          }

        )

      }



      const {

        data: after,

        error,

      } =

        await admin

          .from(

            'delivery_product_reviews'

          )

          .update({

            is_visible:

              visible,

            updated_at:

              new Date().toISOString(),

          })

          .eq(

            'id',

            reviewId

          )

          .select('*')

          .single()



      if (error) {

        throw error

      }



      await logAudit(

        admin,

        session,

        request,

        {

          action:

            visible

              ? 'show_review'

              : 'hide_review',

          entityType:

            'delivery_product_review',

          entityId:

            reviewId,

          beforeData:

            sanitizeReview(

              before

            ),

          afterData:

            sanitizeReview(

              after

            ),

        }

      )



      return NextResponse.json({

        success: true,

        review:

          sanitizeReview(

            after

          ),

      })

    }



    if (

      action ===

      'set_support_status'

    ) {

      const threadId =

        cleanText(

          body?.threadId,

          100

        )



      const status =

        body?.status ===

        'closed'

          ? 'closed'

          : 'open'



      const {

        data: before,

        error:

          beforeError,

      } =

        await admin

          .from(

            'delivery_support_threads'

          )

          .select('*')

          .eq(

            'id',

            threadId

          )

          .maybeSingle()



      if (beforeError) {

        throw beforeError

      }



      if (!before) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Help Centre thread was not found.',

          },

          {

            status: 404,

          }

        )

      }



      const update = {

        status,

        updated_at:

          new Date().toISOString(),

        closed_at:

          status ===

          'closed'

            ? new Date().toISOString()

            : null,

      }



      const {

        data: after,

        error,

      } =

        await admin

          .from(

            'delivery_support_threads'

          )

          .update(

            update

          )

          .eq(

            'id',

            threadId

          )

          .select('*')

          .single()



      if (error) {

        throw error

      }



      await logAudit(

        admin,

        session,

        request,

        {

          action:

            `help_centre_${status}`,

          entityType:

            'delivery_support_thread',

          entityId:

            threadId,

          beforeData: {

            status:

              before.status,

          },

          afterData: {

            status:

              after.status,

          },

        }

      )



      return NextResponse.json({

        success: true,

        thread: {

          id:

            after.id,

          status:

            after.status,

        },

      })

    }



    if (

      action ===

      'set_worker_active'

    ) {

      const workerType =

        cleanText(

          body?.workerType,

          20

        ).toLowerCase()



      const workerId =

        cleanText(

          body?.workerId,

          100

        )



      const active =

        Boolean(

          body?.active

        )



      const table =

        workerType ===

        'driver'

          ? 'delivery_drivers'

          : workerType ===

              'packer'

            ? 'delivery_packers'

            : ''



      if (

        !table ||

        !workerId

      ) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Invalid worker update.',

          },

          {

            status: 400,

          }

        )

      }



      const {

        data: before,

        error:

          beforeError,

      } =

        await admin

          .from(table)

          .select('*')

          .eq(

            'id',

            workerId

          )

          .maybeSingle()



      if (beforeError) {

        throw beforeError

      }



      if (!before) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Worker was not found.',

          },

          {

            status: 404,

          }

        )

      }



      const {

        data: after,

        error,

      } =

        await admin

          .from(table)

          .update({

            is_active:

              active,

          })

          .eq(

            'id',

            workerId

          )

          .select('*')

          .single()



      if (error) {

        throw error

      }



      await logAudit(

        admin,

        session,

        request,

        {

          action:

            `${workerType}_${active ? 'enabled' : 'disabled'}`,

          entityType:

            workerType,

          entityId:

            workerId,

          beforeData: {

            is_active:

              before.is_active,

          },

          afterData: {

            is_active:

              after.is_active,

          },

        }

      )



      return NextResponse.json({

        success: true,

      })

    }



    if (

      action ===

      'set_gateway_enabled'

    ) {

      const gatewayId =

        cleanText(

          body?.gatewayId,

          100

        )



      const enabled =

        Boolean(

          body?.enabled

        )



      const {

        data: before,

        error:

          beforeError,

      } =

        await admin

          .from(

            'payment_gateway_configs'

          )

          .select('*')

          .eq(

            'id',

            gatewayId

          )

          .maybeSingle()



      if (beforeError) {

        throw beforeError

      }



      if (!before) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Payment gateway configuration was not found.',

          },

          {

            status: 404,

          }

        )

      }



      const {

        data: after,

        error,

      } =

        await admin

          .from(

            'payment_gateway_configs'

          )

          .update({

            is_enabled:

              enabled,

            updated_at:

              new Date().toISOString(),

          })

          .eq(

            'id',

            gatewayId

          )

          .select('*')

          .single()



      if (error) {

        throw error

      }



      await logAudit(

        admin,

        session,

        request,

        {

          action:

            enabled

              ? 'gateway_enabled'

              : 'gateway_disabled',

          entityType:

            'payment_gateway',

          entityId:

            gatewayId,

          beforeData:

            sanitizeGateway(

              before

            ),

          afterData:

            sanitizeGateway(

              after

            ),

        }

      )



      return NextResponse.json({

        success: true,

      })

    }



    if (

      action ===

      'set_delivery_store_open'

    ) {

      const restaurantId =

        cleanText(

          body?.restaurantId,

          100

        )



      const isOpen =

        Boolean(

          body?.isOpen

        )



      if (!restaurantId) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Restaurant ID is missing.',

          },

          {

            status: 400,

          }

        )

      }



      const {

        data: before,

        error:

          beforeError,

      } =

        await admin

          .from(

            'delivery_settings'

          )

          .select('*')

          .eq(

            'restaurant_id',

            restaurantId

          )

          .maybeSingle()



      if (beforeError) {

        throw beforeError

      }



      if (!before) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Delivery settings were not found for this tenant.',

          },

          {

            status: 404,

          }

        )

      }



      /*

       * Reuse the existing Delivery Manager action engine.

       * This keeps store open/close behaviour consistent with

       * Manager/Owner Delivery Management.

       */

      const {

        data: result,

        error:

          actionError,

      } =

        await admin.rpc(

          'manager_delivery_action_core',

          {

            p_restaurant_id:

              restaurantId,

            p_manager_name:

              'Platform Admin',

            p_action:

              'toggle_store',

            p_payload: {

              is_open:

                isOpen,

            },

          }

        )



      if (actionError) {

        throw actionError

      }



      if (

        result?.success ===

        false

      ) {

        throw new Error(

          result?.message ||

            'Unable to update Delivery store.'

        )

      }



      const {

        data: after,

      } =

        await admin

          .from(

            'delivery_settings'

          )

          .select('*')

          .eq(

            'restaurant_id',

            restaurantId

          )

          .maybeSingle()



      await logAudit(

        admin,

        session,

        request,

        {

          action:

            isOpen

              ? 'delivery_store_opened'

              : 'delivery_store_closed',

          entityType:

            'delivery_settings',

          entityId:

            restaurantId,

          beforeData: {

            is_open:

              before.is_open,

          },

          afterData: {

            is_open:

              after?.is_open,

          },

        }

      )



      return NextResponse.json({

        success: true,

        result,

      })

    }



    if (

      action ===

      'restock_inventory'

    ) {

      const restaurantId =

        cleanText(

          body?.restaurantId,

          100

        )



      const itemId =

        cleanText(

          body?.itemId,

          100

        )



      const quantity =

        Number(

          body?.quantity

        )



      if (

        !restaurantId ||

        !itemId ||

        !Number.isInteger(

          quantity

        ) ||

        quantity <= 0 ||

        quantity >

          1000000

      ) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Enter a valid positive whole-number restock quantity.',

          },

          {

            status: 400,

          }

        )

      }



      const {

        data: before,

        error:

          beforeError,

      } =

        await admin

          .from(

            'menu_items'

          )

          .select(

            'id,restaurant_id,name,stock_quantity,reserved_quantity,low_stock_threshold,track_stock'

          )

          .eq(

            'id',

            itemId

          )

          .eq(

            'restaurant_id',

            restaurantId

          )

          .maybeSingle()



      if (beforeError) {

        throw beforeError

      }



      if (!before) {

        return NextResponse.json(

          {

            success: false,

            message:

              'Inventory item was not found.',

          },

          {

            status: 404,

          }

        )

      }



      if (

        before.track_stock !==

        true

      ) {

        return NextResponse.json(

          {

            success: false,

            message:

              'This item is not configured as tracked inventory.',

          },

          {

            status: 400,

          }

        )

      }



      const {

        data: result,

        error:

          restockError,

      } =

        await admin.rpc(

          'manager_delivery_action_core',

          {

            p_restaurant_id:

              restaurantId,

            p_manager_name:

              'Platform Admin',

            p_action:

              'restock_inventory',

            p_payload: {

              id:

                itemId,

              quantity,

              notes:

                'Platform Admin ERP restock',

            },

          }

        )



      if (restockError) {

        throw restockError

      }



      if (

        result?.success ===

        false

      ) {

        throw new Error(

          result?.message ||

            'Unable to restock inventory.'

        )

      }



      const {

        data: after,

      } =

        await admin

          .from(

            'menu_items'

          )

          .select(

            'id,restaurant_id,name,stock_quantity,reserved_quantity,low_stock_threshold,track_stock'

          )

          .eq(

            'id',

            itemId

          )

          .eq(

            'restaurant_id',

            restaurantId

          )

          .maybeSingle()



      await logAudit(

        admin,

        session,

        request,

        {

          action:

            'inventory_restock',

          entityType:

            'menu_item',

          entityId:

            itemId,

          beforeData:

            before,

          afterData:

            after,

        }

      )



      return NextResponse.json({

        success: true,

        result,

      })

    }



    if (action === 'update_custom_plan_request') {
      const requestId = cleanText(body?.requestId, 100)
      const status = cleanText(body?.status, 50).toLowerCase()
      const adminNotes = cleanText(body?.adminNotes, 5000)
      const rawQuote = body?.quotedMonthlyPrice
      const quotedMonthlyPrice =
        rawQuote === null || rawQuote === undefined || rawQuote === ''
          ? null
          : Number(rawQuote)

      if (!requestId || !VALID_CUSTOM_PLAN_STATUS.has(status)) {
        return NextResponse.json(
          { success: false, message: 'Invalid custom plan request update.' },
          { status: 400 }
        )
      }

      if (
        quotedMonthlyPrice !== null &&
        (!Number.isFinite(quotedMonthlyPrice) ||
          quotedMonthlyPrice < 0 ||
          quotedMonthlyPrice > 10000000)
      ) {
        return NextResponse.json(
          { success: false, message: 'Enter a valid quotation amount.' },
          { status: 400 }
        )
      }

      const { data: before, error: beforeError } = await admin
        .from('custom_plan_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle()

      if (beforeError) throw beforeError

      if (!before) {
        return NextResponse.json(
          { success: false, message: 'Custom plan request was not found.' },
          { status: 404 }
        )
      }

      const now = new Date().toISOString()
      const update = {
        status,
        admin_notes: adminNotes || null,
        quoted_monthly_price: quotedMonthlyPrice,
      }

      if (
        ['contacted', 'quoted', 'accepted'].includes(status) &&
        !before.contacted_at
      ) {
        update.contacted_at = now
      }

      if (['quoted', 'accepted'].includes(status) && !before.quoted_at) {
        update.quoted_at = now
      }

      if (status === 'accepted' && !before.accepted_at) {
        update.accepted_at = now
      }

      const { data: after, error } = await admin
        .from('custom_plan_requests')
        .update(update)
        .eq('id', requestId)
        .select('*')
        .single()

      if (error) throw error

      await logAudit(admin, session, request, {
        action: 'update_custom_plan_request',
        entityType: 'custom_plan_request',
        entityId: requestId,
        beforeData: {
          status: before.status,
          quoted_monthly_price: before.quoted_monthly_price,
          admin_notes: before.admin_notes,
          contacted_at: before.contacted_at,
          quoted_at: before.quoted_at,
          accepted_at: before.accepted_at,
        },
        afterData: {
          status: after.status,
          quoted_monthly_price: after.quoted_monthly_price,
          admin_notes: after.admin_notes,
          contacted_at: after.contacted_at,
          quoted_at: after.quoted_at,
          accepted_at: after.accepted_at,
        },
      })

      return NextResponse.json({
        success: true,
        customPlanRequest: {
          id: after.id,
          status: after.status,
          quoted_monthly_price: after.quoted_monthly_price,
          admin_notes: after.admin_notes || '',
          contacted_at: after.contacted_at,
          quoted_at: after.quoted_at,
          accepted_at: after.accepted_at,
          updated_at: after.updated_at,
        },
      })
    }



    return NextResponse.json(

      {

        success: false,

        message:

          'Unknown Admin action.',

      },

      {

        status: 400,

      }

    )

  } catch (error) {

    console.error(

      '[ADMIN CONTROL CENTER POST]',

      error

    )



    return NextResponse.json(

      {

        success: false,

        message:

          error?.message ||

          'Admin action failed.',

      },

      {

        status: 500,

      }

    )

  }

}