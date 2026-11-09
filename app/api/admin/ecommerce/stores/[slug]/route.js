
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function GET(request, { params }) {
  const { slug } = await params

  if (
    typeof slug !== 'string' ||
    slug.length > 63 ||
    !validSlug.test(slug)
  ) {
    return json({
      success: false,
      message: 'Store not found.',
    }, 404)
  }

  try {
    // Service-role access stays on the server.
    // Never return membership, wallet or private data.
    const admin = getAdminSupabase()

    const { data: store, error } = await admin
      .from('ecommerce_stores')
      .select('id,name,slug,category,theme,currency')
      .eq('slug', slug)
      .eq('approval_status', 'approved')
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      console.error('[PUBLIC STORE QUERY]', error)
      return json({
        success: false,
        message: 'Unable to load store.',
      }, 500)
    }

    if (!store) {
      return json({
        success: false,
        message: 'Store not found or unavailable.',
      }, 404)
    }

    return json({
      success: true,
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        category: store.category,
        theme: store.theme,
        currency: store.currency,
      },
    })
  } catch (error) {
    console.error('[PUBLIC ECOMMERCE STORE]', error)

    return json({
      success: false,
      message: 'Unable to load storefront.',
    }, 500)
  }
}
