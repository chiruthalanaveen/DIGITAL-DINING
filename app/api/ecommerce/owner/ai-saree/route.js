
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const BUCKET = 'ecommerce-ai-saree-previews'
const MAX_SOURCE = 5 * 1024 * 1024
const MAX_GENERATED = 10 * 1024 * 1024

const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const respond = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

const fail = (message, status = 400) =>
  respond({ success: false, message }, status)

function isValidImage(bytes, type) {
  if (type === 'image/jpeg') {
    return bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
  }

  if (type === 'image/png') {
    return bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
  }

  if (type === 'image/webp') {
    return bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
  }

  return false
}

async function authorize(request, storeId, productId) {
  if (!UUID.test(storeId || '') || !UUID.test(productId || '')) {
    return {
      response: fail('Invalid website or product ID.'),
    }
  }

  const bearer = /^Bearer\s+([^\s]+)$/i.exec(
    request.headers.get('authorization') || ''
  )

  if (!bearer) {
    return {
      response: fail('Sign in to your owner account.', 401),
    }
  }

  const admin = getAdminSupabase()

  const { data: auth, error: authError } =
    await admin.auth.getUser(bearer[1])

  if (authError || !auth?.user?.id) {
    return {
      response: fail('Session expired. Sign in again.', 401),
    }
  }

  const { data: membership, error: memberError } = await admin
    .from('ecommerce_store_members')
    .select('store_id')
    .eq('store_id', storeId)
    .eq('user_id', auth.user.id)
    .eq('role', 'owner')
    .maybeSingle()

  if (memberError) throw memberError

  if (!membership) {
    return {
      response: fail('You do not own this website.', 403),
    }
  }

  const { data: store, error: storeError } = await admin
    .from('ecommerce_stores')
    .select('id,category,approval_status,is_active')
    .eq('id', storeId)
    .maybeSingle()

  if (storeError) throw storeError

  if (
    !store ||
    store.approval_status !== 'approved' ||
    !store.is_active
  ) {
    return {
      response: fail('Website is not approved and active.', 403),
    }
  }

  if (!/cloth|fashion|saree|apparel/i.test(store.category || '')) {
    return {
      response: fail(
        'AI Saree Studio is only available for clothing websites.',
        403
      ),
    }
  }

  const { data: product, error: productError } = await admin
    .from('ecommerce_products')
    .select('id,name')
    .eq('id', productId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (productError) throw productError

  if (!product) {
    return {
      response: fail(
        'Product does not belong to this website.',
        404
      ),
    }
  }

  return {
    admin,
    userId: auth.user.id,
    product,
  }
}

async function signedUrl(admin, path) {
  if (!path) return null

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 900)

  return error ? null : data?.signedUrl || null
}

async function serialize(admin, records) {
  return Promise.all(
    records.map(async item => ({
      id: item.id,
      status: item.status,
      pose: item.pose,
      createdAt: item.created_at,
      failureReason: item.failure_reason,
      sourceUrl: await signedUrl(
        admin,
        item.source_image_path
      ),
      generatedUrl: await signedUrl(
        admin,
        item.generated_image_path
      ),
    }))
  )
}

function buildPrompt(pose, productName) {
  const poses = {
    front:
      'Full-length front-facing standing fashion catalog pose.',
    side:
      'Full-length three-quarter side standing pose, with the saree drape visible.',
    pallu:
      'Full-length fashion pose emphasizing the saree pallu, border and woven details.',
  }

  return [
    'Generate one premium photorealistic Indian saree fashion catalog image.',
    'The reference photograph shows the original saree being worn.',
    'Create a NEW fictional adult woman as the fashion model.',
    'Do not reproduce the identity or face of the reference person.',
    'Use the reference saree as the garment design.',
    'Preserve its original color, motifs, embroidery,',
    'border pattern, border width, fabric texture,',
    'pallu design, draping and blouse details as closely as possible.',
    'Do not redesign the saree or introduce different patterns.',
    'Use natural body proportions and realistic fabric folds.',
    'Use a clean, softly illuminated professional studio background.',
    'Show the complete outfit without cropping important garment details.',
    poses[pose],
    'No text, logos, watermarks, collage or extra people.',
    `Catalog product: ${String(productName || 'Saree').slice(0, 100)}.`,
  ].join(' ')
}

async function generateWithGemini(bytes, mimeType, pose, productName) {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    const error = new Error(
      'GEMINI_API_KEY is missing from the server environment.'
    )
    error.status = 503
    throw error
  }

  const model =
    process.env.GEMINI_IMAGE_MODEL ||
    'gemini-2.5-flash-image'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)

  let response

  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: buildPrompt(pose, productName),
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: bytes.toString('base64'),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
      }
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const details = await response.json().catch(() => ({}))
    const reason = String(details?.error?.message || '')

    console.error('[GEMINI SAREE API]', {
      status: response.status,
      message: reason,
    })

    const error = new Error(
      response.status === 429
        ? 'Gemini rate limit or quota exceeded. Try again later.'
        : response.status === 400
          ? 'Gemini rejected the image request. Check model configuration.'
          : response.status === 403
            ? 'Gemini API access denied. Check your API key and project permissions.'
            : 'Gemini image generation failed. Check the server terminal.'
    )

    error.status =
      response.status === 429 ? 429 :
      response.status === 403 ? 503 : 502

    throw error
  }

  const result = await response.json()

  const parts = (result.candidates || []).flatMap(
    candidate => candidate.content?.parts || []
  )

  const imagePart = parts.find(
    part => part.inlineData?.data || part.inline_data?.data
  )

  const inline =
    imagePart?.inlineData || imagePart?.inline_data

  if (!inline?.data) {
    const error = new Error(
      'Gemini returned no image. Try a different saree photograph.'
    )
    error.status = 422
    throw error
  }

  const outputMime =
    inline.mimeType || inline.mime_type || 'image/png'

  if (!TYPES[outputMime]) {
    const error = new Error(
      'Gemini returned an unsupported image format.'
    )
    error.status = 422
    throw error
  }

  const generated = Buffer.from(inline.data, 'base64')

  if (
    generated.length < 100 ||
    generated.length > MAX_GENERATED ||
    !isValidImage(generated, outputMime)
  ) {
    const error = new Error(
      'Gemini returned an invalid or oversized image.'
    )
    error.status = 422
    throw error
  }

  return {
    bytes: generated,
    mimeType: outputMime,
    extension: TYPES[outputMime],
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url)
    const storeId = url.searchParams.get('storeId')
    const productId = url.searchParams.get('productId')

    const access = await authorize(request, storeId, productId)
    if (access.response) return access.response

    const { data, error } = await access.admin
      .from('ecommerce_ai_saree_previews')
      .select(
        'id,status,pose,source_image_path,generated_image_path,created_at,failure_reason'
      )
      .eq('store_id', storeId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) throw error

    return respond({
      success: true,
      generationEnabled: Boolean(process.env.GEMINI_API_KEY),
      items: await serialize(access.admin, data || []),
    })
  } catch (error) {
    console.error('[OWNER AI SAREE GET]', error)
    return fail('Unable to load saree previews.', 500)
  }
}

export async function POST(request) {
  let admin = null
  let sourcePath = null
  let generatedPath = null
  let previewId = null

  try {
    const contentLength = Number(
      request.headers.get('content-length') || 0
    )

    if (contentLength > 6 * 1024 * 1024) {
      return fail('Image upload is too large.', 413)
    }

    // Check authentication before parsing uploaded file data.
    const bearer = /^Bearer\s+([^\s]+)$/i.exec(
      request.headers.get('authorization') || ''
    )

    if (!bearer) {
      return fail('Sign in to your owner account.', 401)
    }

    if (!process.env.GEMINI_API_KEY) {
      return fail(
        'Gemini API key is not configured on the server.',
        503
      )
    }

    const form = await request.formData()

    const storeId = String(form.get('storeId') || '')
    const productId = String(form.get('productId') || '')
    const pose = String(form.get('pose') || 'front')
    const file = form.get('image')

    const access = await authorize(request, storeId, productId)
    if (access.response) return access.response

    admin = access.admin

    if (!['front', 'side', 'pallu'].includes(pose)) {
      return fail('Invalid pose.')
    }

    if (
      !(file instanceof File) ||
      file.size < 100 ||
      file.size > MAX_SOURCE
    ) {
      return fail(
        'Choose a JPG, PNG or WebP image up to 5 MB.'
      )
    }

    if (!TYPES[file.type]) {
      return fail('Only JPG, PNG and WebP images are supported.')
    }

    const bytes = Buffer.from(await file.arrayBuffer())

    if (!isValidImage(bytes, file.type)) {
      return fail('File contents do not match the image type.')
    }

    // Basic per-product saved-preview limit.
    // Production also needs an atomic rate limiter covering
    // concurrent and failed requests.
    const since = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString()

    const { count, error: countError } = await admin
      .from('ecommerce_ai_saree_previews')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('product_id', productId)
      .gte('created_at', since)

    if (countError) throw countError

    if ((count || 0) >= 5) {
      return fail(
        'Maximum 5 saved AI previews per product per hour.',
        429
      )
    }

    const fileId = randomUUID()

    sourcePath =
      `${storeId}/${productId}/source/` +
      `${fileId}.${TYPES[file.type]}`

    const sourceUpload = await admin.storage
      .from(BUCKET)
      .upload(sourcePath, bytes, {
        contentType: file.type,
        upsert: false,
      })

    if (sourceUpload.error) throw sourceUpload.error

    const { data: preview, error: insertError } = await admin
      .from('ecommerce_ai_saree_previews')
      .insert({
        store_id: storeId,
        product_id: productId,
        requested_by: access.userId,
        source_image_path: sourcePath,
        status: 'draft',
        pose,
      })
      .select('id')
      .single()

    if (insertError) throw insertError

    previewId = preview.id

    const generated = await generateWithGemini(
      bytes,
      file.type,
      pose,
      access.product.name
    )

    generatedPath =
      `${storeId}/${productId}/generated/` +
      `${fileId}.${generated.extension}`

    const generatedUpload = await admin.storage
      .from(BUCKET)
      .upload(generatedPath, generated.bytes, {
        contentType: generated.mimeType,
        upsert: false,
      })

    if (generatedUpload.error) throw generatedUpload.error

    const { data: updated, error: updateError } = await admin
      .from('ecommerce_ai_saree_previews')
      .update({
        generated_image_path: generatedPath,
        status: 'review',
        failure_reason: null,
      })
      .eq('id', previewId)
      .eq('store_id', storeId)
      .eq('product_id', productId)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle()

    if (updateError) throw updateError
    if (!updated) throw new Error('Preview update failed.')

    return respond({
      success: true,
      id: previewId,
      message:
        'Gemini generated your AI saree model. ' +
        'Review and approve it before publication.',
    }, 201)
  } catch (error) {
    console.error('[OWNER AI SAREE POST]', error)

    if (admin && previewId) {
      const reason = String(
        error?.message || 'Generation failed.'
      ).slice(0, 500)

      const { error: failureError } = await admin
        .from('ecommerce_ai_saree_previews')
        .update({
          status: 'failed',
          failure_reason: reason,
        })
        .eq('id', previewId)
        .eq('status', 'draft')

      if (failureError) {
        console.error(
          '[OWNER AI SAREE FAILURE SAVE]',
          failureError
        )
      }

      if (generatedPath) {
        await admin.storage
          .from(BUCKET)
          .remove([generatedPath])
          .catch(() => {})
      }
    } else if (admin && sourcePath) {
      await admin.storage
        .from(BUCKET)
        .remove([sourcePath])
        .catch(() => {})
    }

    const status = Number(error?.status) || 500

    return fail(
      status < 500
        ? error.message
        : status === 503
          ? error.message
          : 'AI generation failed. Check the server terminal.',
      status
    )
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => null)

    if (!body) return fail('Invalid request.')

    const access = await authorize(
      request,
      body.storeId,
      body.productId
    )

    if (access.response) return access.response

    if (
      !UUID.test(body.previewId || '') ||
      !['approved', 'rejected'].includes(body.status)
    ) {
      return fail('Invalid preview or status.')
    }

    const { data: preview, error: readError } =
      await access.admin
        .from('ecommerce_ai_saree_previews')
        .select('id,status,generated_image_path')
        .eq('id', body.previewId)
        .eq('store_id', body.storeId)
        .eq('product_id', body.productId)
        .maybeSingle()

    if (readError) throw readError

    if (!preview) {
      return fail('Preview not found.', 404)
    }

    if (
      !preview.generated_image_path ||
      preview.status !== 'review'
    ) {
      return fail(
        'Only generated images awaiting review can be approved or rejected.',
        409
      )
    }

    const changes =
      body.status === 'approved'
        ? {
            status: 'approved',
            approved_by: access.userId,
            approved_at: new Date().toISOString(),
          }
        : {
            status: 'rejected',
            approved_by: null,
            approved_at: null,
          }

    const { data: updated, error: updateError } =
      await access.admin
        .from('ecommerce_ai_saree_previews')
        .update(changes)
        .eq('id', preview.id)
        .eq('store_id', body.storeId)
        .eq('product_id', body.productId)
        .eq('status', 'review')
        .select('id')
        .maybeSingle()

    if (updateError) throw updateError

    if (!updated) {
      return fail(
        'Preview status changed. Refresh and try again.',
        409
      )
    }

    return respond({
      success: true,
      message: 'Preview status updated.',
    })
  } catch (error) {
    console.error('[OWNER AI SAREE PATCH]', error)
    return fail('Unable to update preview.', 500)
  }
}
