import {
  NextResponse,
} from 'next/server'

export const runtime =
  'nodejs'

export const dynamic =
  'force-dynamic'

export async function GET() {
  const checks = {
    adminEmail:
      Boolean(
        String(
          process.env.ADMIN_EMAIL ||
            ''
        ).trim()
      ),

    adminPassword:
      Boolean(
        String(
          process.env.ADMIN_PASSWORD ||
            ''
        )
      ),

    adminSessionSecret:
      String(
        process.env.ADMIN_SESSION_SECRET ||
          ''
      ).length >= 32,

    supabaseUrl:
      Boolean(
        String(
          process.env.NEXT_PUBLIC_SUPABASE_URL ||
            ''
        ).trim()
      ),

    supabaseAnonKey:
      Boolean(
        String(
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
            ''
        ).trim()
      ),

    supabaseServiceRole:
      Boolean(
        String(
          process.env.SUPABASE_SERVICE_ROLE_KEY ||
            ''
        ).trim()
      ),
  }

  const ready =
    Object.values(
      checks
    ).every(Boolean)

  return NextResponse.json(
    {
      success: true,
      ready,
      checks,
      message:
        ready
          ? 'Admin server configuration is ready.'
          : 'One or more Admin server environment variables are missing or invalid.',
    },
    {
      headers: {
        'Cache-Control':
          'no-store',
      },
    }
  )
}
