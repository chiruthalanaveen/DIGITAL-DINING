
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORIES = [
  'pickles',
  'clothing',
  'toys',
  'groceries',
  'snacks',
  'gifts',
]

const RESERVED_SLUGS = new Set([
  'www',
  'admin',
  'api',
  'app',
  'delivery',
  'mail',
  'support',
  'localhost',
])

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function databaseFailure(error, operation) {
  console.error(`[ECOMMERCE ${operation}]`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  })

  const code = error?.code || 'SERVER_ERROR'

  let message = 'E-Commerce database request failed.'

  if (code === '42P01') {
    message = 'Required E-Commerce database table is missing.'
  } else if (code === '42703') {
    message = 'An E-Commerce database column is missing.'
  } else if (code === '23502') {
    message = 'A required store field is missing.'
  } else if (code === '23514') {
    message = 'The submitted value violates a database constraint.'
  } else if (code === '23505') {
    message = 'A store with this subdomain already exists.'
  } else if (code === '42501') {
    message = 'Database permission denied.'
  } else if (code === 'PGRST205') {
    message = 'E-Commerce table is not available in the API schema.'
  }

  return respond(
    {
      success: false,
      message,
      errorCode: code,
    },
    code === '23505' ? 409 : 500
  )
}

async function authenticate(request) {
  try {
    const session = await requireAdmin(request)

    if (!session) {
      return {
        response: respond(
          {
            success: false,
            message: 'Super Admin login required.',
          },
          401
        ),
      }
    }

    return { session }
  } catch (error) {
    console.error('[ECOMMERCE ADMIN AUTH]', error)

    return {
      response: respond(
        {
          success: false,
          message: 'Admin authentication check failed.',
          errorCode: 'ADMIN_AUTH_ERROR',
        },
        500
      ),
    }
  }
}

export async function GET(request) {
  const auth = await authenticate(request)

  if (auth.response) {
    return auth.response
  }

  try {
    const admin = getAdminSupabase()

    const { data, error } = await admin
      .from('ecommerce_stores')
      .select(
        'id,name,slug,category,theme,approval_status,is_active,currency,payment_mode,fulfillment_mode,created_at'
      )
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      return databaseFailure(error, 'STORES GET')
    }

    return respond({
      success: true,
      stores: data || [],
    })
  } catch (error) {
    return databaseFailure(
      error,
      'STORES GET EXCEPTION'
    )
  }
}

export async function POST(request) {
  const auth = await authenticate(request)

  if (auth.response) {
    return auth.response
  }

  // Prevent cross-origin browser requests.
  const origin = request.headers.get('origin')

  if (!origin || origin !== request.nextUrl.origin) {
    return respond(
      {
        success: false,
        message: 'Invalid request origin.',
      },
      403
    )
  }

  let body

  try {
    body = await request.json()
  } catch {
    return respond(
      {
        success: false,
        message: 'Valid JSON is required.',
      },
      400
    )
  }

  const name =
    typeof body?.name === 'string'
      ? body.name.trim()
      : ''

  const slug =
    typeof body?.slug === 'string'
      ? body.slug.trim().toLowerCase()
      : ''

  const category =
    typeof body?.category === 'string'
      ? body.category.trim().toLowerCase()
      : ''

  if (
    name.length < 2 ||
    name.length > 120 ||
    slug.length > 63 ||
    !SLUG_PATTERN.test(slug)
  ) {
    return respond(
      {
        success: false,
        message: 'Invalid store name or subdomain.',
      },
      400
    )
  }

  if (!CATEGORIES.includes(category)) {
    return respond(
      {
        success: false,
        message:
          `Choose a valid category: ${CATEGORIES.join(', ')}.`,
      },
      400
    )
  }

  if (RESERVED_SLUGS.has(slug)) {
    return respond(
      {
        success: false,
        message: 'This subdomain is reserved.',
      },
      400
    )
  }

  try {
    const admin = getAdminSupabase()

    // Create a pending, inactive E-Commerce store.
    // "quick" is a valid required theme.
    const { data: store, error } = await admin
      .from('ecommerce_stores')
      .insert({
        name,
        slug,
        category,
        theme: 'quick',
        approval_status: 'pending',
        is_active: false,
        currency: 'INR',
        payment_mode: 'razorpay_cod',
        fulfillment_mode: 'shipping',
      })
      .select(
        'id,name,slug,category,theme,approval_status,is_active,currency,payment_mode,fulfillment_mode,created_at'
      )
      .single()

    if (error) {
      return databaseFailure(
        error,
        'STORES CREATE'
      )
    }

    // Audit the Super Admin action.
    const { error: auditError } = await admin
      .from('admin_audit_logs')
      .insert({
        actor_email: auth.session.email ?? 'admin',
        action: 'ecommerce_store_created',
        entity_type: 'ecommerce_store',
        entity_id: String(store.id),
        before_data: null,
        after_data: {
          name: store.name,
          slug: store.slug,
          category: store.category,
          theme: store.theme,
          approval_status: store.approval_status,
          is_active: store.is_active,
          currency: store.currency,
          payment_mode: store.payment_mode,
          fulfillment_mode: store.fulfillment_mode,
        },
        metadata: {
          source: 'admin_ecommerce_stores',
        },
      })

    if (auditError) {
      console.error(
        '[ECOMMERCE AUDIT FAILURE]',
        auditError
      )
    }

    return respond(
      {
        success: true,
        store,
        auditLogged: !auditError,
      },
      201
    )
  } catch (error) {
    return databaseFailure(
      error,
      'STORES CREATE EXCEPTION'
    )
  }
}
