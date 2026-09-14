
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  loginSchema,
  GENERIC_VALIDATION_ERROR,
  GENERIC_AUTH_ERROR
} from '@/lib/auth-validation'

/*
 * Server-only Supabase client.
 *
 * Uses the service role key only if your architecture requires
 * privileged server operations. For normal sign-in, the anon key
 * is sufficient and preferable.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
)

export async function POST(request) {
  try {
    let body

    try {
      body = await request.json()
    } catch (error) {
      console.warn('[AUTH VALIDATION] Login request contained invalid JSON', {
        timestamp: new Date().toISOString()
      })

      return NextResponse.json(
        { error: GENERIC_VALIDATION_ERROR },
        { status: 400 }
      )
    }

    const result = loginSchema.safeParse({
      email: body?.email,
      password: body?.password
    })

    if (!result.success) {
      console.warn('[AUTH VALIDATION] Login validation failed', {
        timestamp: new Date().toISOString(),
        issueCount: result.error.issues.length,
        // Never log passwords or raw credentials.
        emailProvided: typeof body?.email === 'string'
      })

      return NextResponse.json(
        { error: GENERIC_VALIDATION_ERROR },
        { status: 400 }
      )
    }

    const { email, password } = result.data

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      /*
       * Do not expose Supabase's detailed authentication error.
       * This also avoids revealing whether an email exists.
       */
      console.warn('[AUTH] Login failed', {
        timestamp: new Date().toISOString(),
        emailProvided: Boolean(email),
        reason: 'Authentication provider rejected credentials'
      })

      return NextResponse.json(
        { error: GENERIC_AUTH_ERROR },
        { status: 401 }
      )
    }

    return NextResponse.json(
      {
        message: 'Login successful',
        user: {
          id: data.user?.id,
          email: data.user?.email
        },
        session: data.session
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[AUTH] Unexpected login route error', {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: GENERIC_AUTH_ERROR },
      { status: 500 }
    )
  }
}

