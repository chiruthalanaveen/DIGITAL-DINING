import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'delivery-proof-images'
const MAX_FILES = 5
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

function json(body, status = 200) {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  response.headers.set('Pragma', 'no-cache')
  return response
}

function serverConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceKey) {
    throw new Error('Supabase server configuration is incomplete.')
  }

  return { url, anonKey, serviceKey }
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

function getBearerToken(request) {
  const header = String(request.headers.get('authorization') || '')

  return header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : ''
}

async function requireOwner(request, restaurantId) {
  const token = getBearerToken(request)

  if (!token) {
    return {
      error: json(
        {
          success: false,
          message: 'Owner authentication is required.',
        },
        401
      ),
    }
  }

  const { url, anonKey } = serverConfig()

  const authClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data, error } = await authClient.auth.getUser(token)
  const user = data?.user

  if (error || !user) {
    return {
      error: json(
        {
          success: false,
          message: 'Your owner login session is invalid or expired.',
        },
        401
      ),
    }
  }

  const admin = getAdminClient()
  const { data: restaurant, error: restaurantError } = await admin
    .from('restaurants')
    .select('id, owner_id')
    .eq('id', restaurantId)
    .maybeSingle()

  if (restaurantError) throw restaurantError

  if (!restaurant || String(restaurant.owner_id) !== String(user.id)) {
    return {
      error: json(
        {
          success: false,
          message: 'You are not authorized to view Delivery proof for this restaurant.',
        },
        403
      ),
    }
  }

  return { admin, user, restaurant }
}

async function readDriverSession(admin, sessionToken) {
  const { data, error } = await admin.rpc(
    'validate_delivery_driver_session',
    {
      p_session_token: sessionToken,
    }
  )

  if (error) throw error

  return Array.isArray(data) ? data[0] || null : data || null
}

async function cleanupUploads(admin, paths) {
  if (!paths.length) return

  try {
    await admin.storage.from(BUCKET).remove(paths)
  } catch (error) {
    console.error('Delivery proof cleanup error:', error)
  }
}

export async function POST(request) {
  const admin = getAdminClient()
  const uploadedPaths = []

  try {
    const formData = await request.formData()

    const sessionToken = String(
      formData.get('sessionToken') || ''
    ).trim()
    const orderId = String(formData.get('orderId') || '').trim()
    const result = String(formData.get('result') || '')
      .trim()
      .toLowerCase()
    const failureReason = String(
      formData.get('failureReason') || ''
    )
      .trim()
      .toLowerCase()
      .slice(0, 120)
    const note = String(formData.get('note') || '').trim().slice(0, 500)

    const files = formData
      .getAll('files')
      .filter(
        (file) =>
          file &&
          typeof file.arrayBuffer === 'function' &&
          Number(file.size || 0) > 0
      )

    if (!sessionToken || !orderId) {
      return json(
        {
          success: false,
          message: 'Driver session and Delivery order are required.',
        },
        400
      )
    }

    if (!['delivered', 'not_delivered'].includes(result)) {
      return json(
        {
          success: false,
          message: 'Choose Delivered or Not Delivered.',
        },
        400
      )
    }

    if (result === 'not_delivered' && !failureReason) {
      return json(
        {
          success: false,
          message: 'Choose a reason for Not Delivered.',
        },
        400
      )
    }

    if (files.length > MAX_FILES) {
      return json(
        {
          success: false,
          message: `A maximum of ${MAX_FILES} photos is allowed.`,
        },
        400
      )
    }

    for (const file of files) {
      if (!ALLOWED_TYPES.has(String(file.type || '').toLowerCase())) {
        return json(
          {
            success: false,
            message: 'Only JPG, PNG and WEBP images are allowed.',
          },
          400
        )
      }

      if (Number(file.size || 0) > MAX_FILE_SIZE) {
        return json(
          {
            success: false,
            message: 'Each delivery proof photo must be 5 MB or smaller.',
          },
          400
        )
      }
    }

    const driverSession = await readDriverSession(admin, sessionToken)

    if (!driverSession?.driver_id || !driverSession?.restaurant_id) {
      return json(
        {
          success: false,
          message: 'Driver session is invalid or expired.',
        },
        401
      )
    }

    const { data: order, error: orderError } = await admin
      .from('delivery_orders')
      .select('id, restaurant_id, driver_id, order_code, order_status')
      .eq('id', orderId)
      .eq('restaurant_id', driverSession.restaurant_id)
      .eq('driver_id', driverSession.driver_id)
      .maybeSingle()

    if (orderError) throw orderError

    if (!order) {
      return json(
        {
          success: false,
          message: 'This Delivery order is not assigned to you.',
        },
        403
      )
    }

    if (String(order.order_status || '').toLowerCase() !== 'out_for_delivery') {
      return json(
        {
          success: false,
          message: 'Start Delivery before submitting the final delivery result.',
        },
        409
      )
    }

    for (const file of files) {
      const mime = String(file.type || '').toLowerCase()
      const extension = ALLOWED_TYPES.get(mime)
      const path = `${driverSession.restaurant_id}/${order.id}/${driverSession.driver_id}/${Date.now()}-${randomUUID()}.${extension}`
      const bytes = Buffer.from(await file.arrayBuffer())

      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, bytes, {
          contentType: mime,
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        throw uploadError
      }

      uploadedPaths.push(path)
    }

    const { data: resultData, error: resultError } = await admin.rpc(
      'delivery_driver_record_delivery_result',
      {
        p_session_token: sessionToken,
        p_order_id: order.id,
        p_delivery_result: result,
        p_failure_reason: failureReason,
        p_driver_note: note,
        p_storage_paths: uploadedPaths,
      }
    )

    if (resultError) throw resultError

    if (!resultData?.success) {
      await cleanupUploads(admin, uploadedPaths)

      return json(
        {
          success: false,
          message:
            resultData?.message || 'Unable to save the delivery result.',
        },
        409
      )
    }

    return json({
      success: true,
      deliveryResult: result,
      orderStatus: resultData.order_status,
      proofId: resultData.proof_id,
      uploadedPhotos: uploadedPaths.length,
    })
  } catch (error) {
    await cleanupUploads(admin, uploadedPaths)

    console.error('Driver Delivery proof POST error:', error)

    return json(
      {
        success: false,
        message:
          error?.message || 'Unable to upload Delivery proof.',
      },
      500
    )
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const restaurantId = String(
      url.searchParams.get('restaurantId') || ''
    ).trim()

    if (!restaurantId) {
      return json(
        {
          success: false,
          message: 'restaurantId is required.',
        },
        400
      )
    }

    const owner = await requireOwner(request, restaurantId)
    if (owner.error) return owner.error

    const { admin } = owner

    const { data: rows, error } = await admin
      .from('delivery_order_proofs')
      .select(
        'id, restaurant_id, delivery_order_id, driver_id, driver_name, delivery_result, failure_reason, driver_note, storage_paths, created_at'
      )
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw error

    const proofs = await Promise.all(
      (Array.isArray(rows) ? rows : []).map(async (row) => {
        const paths = Array.isArray(row.storage_paths)
          ? row.storage_paths.filter(Boolean)
          : []

        const images = await Promise.all(
          paths.map(async (path) => {
            const { data: signed, error: signedError } = await admin.storage
              .from(BUCKET)
              .createSignedUrl(path, 60 * 60)

            if (signedError || !signed?.signedUrl) {
              console.error(
                'Delivery proof signed URL error:',
                signedError
              )
              return null
            }

            return {
              path,
              url: signed.signedUrl,
            }
          })
        )

        return {
          id: row.id,
          restaurant_id: row.restaurant_id,
          delivery_order_id: row.delivery_order_id,
          driver_id: row.driver_id,
          driver_name: row.driver_name,
          delivery_result: row.delivery_result,
          failure_reason: row.failure_reason,
          driver_note: row.driver_note,
          created_at: row.created_at,
          images: images.filter(Boolean),
        }
      })
    )

    return json({
      success: true,
      proofs,
    })
  } catch (error) {
    console.error('Owner Delivery proof GET error:', error)

    return json(
      {
        success: false,
        message:
          error?.message || 'Unable to load Delivery proof.',
      },
      500
    )
  }
}
