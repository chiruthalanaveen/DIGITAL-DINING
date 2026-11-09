
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'ecommerce-product-images'
const MAX_BYTES = 5 * 1024 * 1024
const MAX_IMAGES = 8
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function authorize(request, write = false) {
  const session = await requireAdmin(request)

  if (!session) {
    return respond({
      success: false,
      message: 'Super Admin login required.',
    }, 401)
  }

  if (write) {
    const origin = request.headers.get('origin')
    if (!origin || origin !== request.nextUrl.origin) {
      return respond({
        success: false,
        message: 'Invalid request origin.',
      }, 403)
    }
  }

  return null
}

function failure(error, operation) {
  console.error(`[ECOMMERCE IMAGE ${operation}]`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
  })

  return respond({
    success: false,
    message: 'Image operation failed. Check the server logs.',
    errorCode: error?.code || 'IMAGE_ERROR',
  }, 500)
}

function detectImage(bytes) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { mime: 'image/jpeg', extension: 'jpg' }
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: 'image/png', extension: 'png' }
  }

  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' &&
    Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP'
  ) {
    return { mime: 'image/webp', extension: 'webp' }
  }

  return null
}

function productPath(storeId, productId) {
  return `${storeId}/${productId}/`
}

function readImages(attributes) {
  if (!attributes || typeof attributes !== 'object' ||
      Array.isArray(attributes)) {
    return []
  }

  const images = attributes.images
  if (!Array.isArray(images)) return []

  return images.filter(image =>
    image &&
    typeof image === 'object' &&
    typeof image.path === 'string' &&
    typeof image.id === 'string'
  )
}

async function getProduct(db, storeId, productId) {
  const { data, error } = await db
    .from('ecommerce_products')
    .select('id,store_id,attributes')
    .eq('id', productId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function signedImages(db, images, storeId, productId) {
  const prefix = productPath(storeId, productId)
  const results = []

  for (const image of images) {
    if (!image.path.startsWith(prefix)) continue

    const { data, error } = await db.storage
      .from(BUCKET)
      .createSignedUrl(image.path, 600)

    results.push({
      id: image.id,
      path: image.path,
      alt: image.alt || '',
      url: error ? null : data?.signedUrl || null,
    })
  }

  return results
}

export async function GET(request) {
  try {
    const denied = await authorize(request)
    if (denied) return denied

    const params = new URL(request.url).searchParams
    const storeId = params.get('storeId')
    const productId = params.get('productId')

    if (!UUID.test(storeId || '') ||
        !UUID.test(productId || '')) {
      return respond({
        success: false,
        message: 'Valid store and product IDs are required.',
      }, 400)
    }

    const db = getAdminSupabase()
    const product = await getProduct(db, storeId, productId)

    if (!product) {
      return respond({
        success: false,
        message: 'Product not found in this store.',
      }, 404)
    }

    const images = await signedImages(
      db,
      readImages(product.attributes),
      storeId,
      productId
    )

    return respond({ success: true, images })
  } catch (error) {
    return failure(error, 'GET')
  }
}

export async function POST(request) {
  try {
    const denied = await authorize(request, true)
    if (denied) return denied

    const form = await request.formData()
    const storeId = form.get('storeId')
    const productId = form.get('productId')
    const file = form.get('file')
    const altValue = form.get('alt')
    const alt = typeof altValue === 'string'
      ? altValue.trim().slice(0, 200)
      : ''

    if (typeof storeId !== 'string' ||
        typeof productId !== 'string' ||
        !UUID.test(storeId) ||
        !UUID.test(productId)) {
      return respond({
        success: false,
        message: 'Invalid store or product ID.',
      }, 400)
    }

    if (!file || typeof file.arrayBuffer !== 'function') {
      return respond({
        success: false,
        message: 'Choose an image to upload.',
      }, 400)
    }

    if (file.size <= 0 || file.size > MAX_BYTES) {
      return respond({
        success: false,
        message: 'Image must be smaller than or equal to 5 MB.',
      }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const format = detectImage(buffer)

    if (!format || file.type !== format.mime) {
      return respond({
        success: false,
        message: 'Only valid JPEG, PNG and WebP images are allowed.',
      }, 400)
    }

    const db = getAdminSupabase()
    const product = await getProduct(db, storeId, productId)

    if (!product) {
      return respond({
        success: false,
        message: 'Product not found in this store.',
      }, 404)
    }

    const previousImages = readImages(product.attributes)

    if (previousImages.length >= MAX_IMAGES) {
      return respond({
        success: false,
        message: `Maximum ${MAX_IMAGES} images per product.`,
      }, 400)
    }

    const imageId = randomUUID()
    const path = `${productPath(storeId, productId)}${imageId}.${format.extension}`

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: format.mime,
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) return failure(uploadError, 'UPLOAD')

    const imageRecord = { id: imageId, path, alt }

    // Conditional update prevents overwriting another simultaneous
    // edit to the product's attributes.
    const { data: updated, error: updateError } = await db
      .from('ecommerce_products')
      .update({
        attributes: {
          ...(product.attributes || {}),
          images: [...previousImages, imageRecord],
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId)
      .eq('store_id', storeId)
      .eq('attributes', product.attributes || {})
      .select('id')
      .maybeSingle()

    if (updateError || !updated) {
      const { error: cleanupError } = await db.storage
        .from(BUCKET)
        .remove([path])

      if (cleanupError) {
        console.error('[ECOMMERCE IMAGE CLEANUP]', cleanupError)
      }

      if (updateError) return failure(updateError, 'SAVE')

      return respond({
        success: false,
        message: 'Product changed during upload. Please retry.',
      }, 409)
    }

    const images = await signedImages(
      db,
      [...previousImages, imageRecord],
      storeId,
      productId
    )

    return respond({
      success: true,
      images,
      message: 'Image uploaded successfully.',
    }, 201)
  } catch (error) {
    return failure(error, 'POST')
  }
}

export async function DELETE(request) {
  try {
    const denied = await authorize(request, true)
    if (denied) return denied

    const body = await request.json()
    const { storeId, productId, imageId } = body || {}

    if (!UUID.test(storeId || '') ||
        !UUID.test(productId || '') ||
        !UUID.test(imageId || '')) {
      return respond({
        success: false,
        message: 'Invalid image request.',
      }, 400)
    }

    const db = getAdminSupabase()
    const product = await getProduct(db, storeId, productId)

    if (!product) {
      return respond({
        success: false,
        message: 'Product not found.',
      }, 404)
    }

    const images = readImages(product.attributes)
    const target = images.find(image => image.id === imageId)

    if (!target ||
        !target.path.startsWith(productPath(storeId, productId))) {
      return respond({
        success: false,
        message: 'Image not found.',
      }, 404)
    }

    const remaining = images.filter(image => image.id !== imageId)

    // Remove the image reference first, so customers stop receiving
    // new signed URLs for it.
    const { data: updated, error: updateError } = await db
      .from('ecommerce_products')
      .update({
        attributes: {
          ...(product.attributes || {}),
          images: remaining,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId)
      .eq('store_id', storeId)
      .eq('attributes', product.attributes || {})
      .select('id')
      .maybeSingle()

    if (updateError) return failure(updateError, 'DELETE SAVE')

    if (!updated) {
      return respond({
        success: false,
        message: 'Product changed. Refresh and retry.',
      }, 409)
    }

    const { error: storageError } = await db.storage
      .from(BUCKET)
      .remove([target.path])

    if (storageError) {
      console.error('[ECOMMERCE IMAGE STORAGE DELETE]', storageError)
      return respond({
        success: true,
        message: 'Image removed from product, but Storage cleanup failed.',
        storageCleanupPending: true,
        images: await signedImages(db, remaining, storeId, productId),
      })
    }

    return respond({
      success: true,
      message: 'Image removed successfully.',
      images: await signedImages(db, remaining, storeId, productId),
    })
  } catch (error) {
    return failure(error, 'DELETE')
  }
}
