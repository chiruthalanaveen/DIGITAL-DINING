import {
  NextResponse,
} from 'next/server'

import {
  ADMIN_COOKIE_NAME,
} from '@/lib/server/adminSession'

export const runtime =
  'nodejs'

export async function POST() {
  const response =
    NextResponse.json({
      success: true,
    })

  response.cookies.set(
    ADMIN_COOKIE_NAME,
    '',
    {
      httpOnly: true,
      secure:
        process.env
          .NODE_ENV ===
        'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    }
  )

  return response
}
