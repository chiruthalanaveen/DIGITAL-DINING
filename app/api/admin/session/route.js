import {
  NextResponse,
} from 'next/server'

import {
  requireAdmin,
} from '@/lib/server/adminSession'

export const runtime =
  'nodejs'

export const dynamic =
  'force-dynamic'

export async function GET(
  request
) {
  try {
    const session =
      requireAdmin(
        request
      )

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
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

    return NextResponse.json(
      {
        success: true,
        authenticated: true,
        admin: {
          email:
            session.email,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    )
  } catch (error) {
    console.error(
      '[ADMIN SESSION]',
      error
    )

    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        message:
          'Admin session verification failed.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    )
  }
}
