import {
  NextResponse,
} from 'next/server'

import {
  ADMIN_COOKIE_NAME,
  createAdminSession,
  validateAdminCredentials,
} from '@/lib/server/adminSession'

export const runtime =
  'nodejs'

export const dynamic =
  'force-dynamic'

export async function POST(
  request
) {
  try {
    const body =
      await request
        .json()
        .catch(
          () => ({})
        )

    const valid =
      validateAdminCredentials(
        body?.email,
        body?.password
      )

    if (!valid) {
      const response =
        NextResponse.json(
          {
            success: false,
            message:
              'Invalid Admin email or password.',
          },
          {
            status: 401,
            headers: {
              'Cache-Control':
                'no-store',
            },
          }
        )

      response.cookies.set(
        ADMIN_COOKIE_NAME,
        '',
        {
          path: '/',
          maxAge: 0,
          httpOnly: true,
          sameSite: 'lax',
          secure:
            process.env.NODE_ENV ===
            'production',
        }
      )

      return response
    }

    const session =
      createAdminSession()

    const response =
      NextResponse.json(
        {
          success: true,
        },
        {
          status: 200,
          headers: {
            'Cache-Control':
              'no-store',
          },
        }
      )

    response.cookies.set(
      ADMIN_COOKIE_NAME,
      session.token,
      {
        httpOnly: true,

        /*
         * Lax works reliably for normal localhost navigation.
         */
        sameSite: 'lax',

        /*
         * IMPORTANT:
         * secure must be false for http://localhost.
         * It becomes true automatically in production HTTPS.
         */
        secure:
          process.env.NODE_ENV ===
          'production',

        path: '/',
      }
    )

    return response
  } catch (error) {
    console.error(
      '[ADMIN LOGIN]',
      error
    )

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message?.includes(
            'Admin server configuration is incomplete'
          )
            ? 'Admin environment variables are incomplete. Check .env.local and restart Next.js.'
            : 'Admin login server error.',
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
