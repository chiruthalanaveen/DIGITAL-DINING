
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  signupSchema,
  GENERIC_VALIDATION_ERROR,
  GENERIC_AUTH_ERROR
} from '@/lib/auth-validation'

/*
 * Server-only Supabase client.
 *
 * The anon key is sufficient for normal user signup.
 * Never expose a service role key to the browser.
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
      console.warn('[AUTH VALIDATION] Signup request contained invalid JSON', {
        timestamp: new Date().toISOString()
      })

      return NextResponse.json(
        { error: GENERIC_VALIDATION_ERROR },
        { status: 400 }
      )
    }

    const result = signupSchema.safeParse({
      email: body?.email,
      password: body?.password,
      username: body?.username,
      displayName: body?.displayName
    })

    if (!result.success) {
      console.warn('[AUTH VALIDATION] Signup validation failed', {
        timestamp: new Date().toISOString(),
        issueCount: result.error.issues.length,
        emailProvided: typeof body?.email === 'string',
        usernameProvided: typeof body?.username === 'string',
        displayNameProvided: typeof body?.displayName === 'string'
      })

      return NextResponse.json(
        { error: GENERIC_VALIDATION_ERROR },
        { status: 400 }
      )
    }

    const {
      email,
      password,
      username,
      displayName
    } = result.data

    /*
     * Create the Supabase Auth user.
     *
     * User metadata is sanitized/validated data from the Zod result.
     */
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: displayName
        }
      }
    })

    if (error) {
      /*
       * Do not return the provider's detailed error.
       * This keeps the external response generic.
       */
      console.warn('[AUTH] Signup failed', {
        timestamp: new Date().toISOString(),
        emailProvided: Boolean(email),
        usernameProvided: Boolean(username),
        reason: 'Authentication provider rejected signup'
      })

      return NextResponse.json(
        { error: GENERIC_AUTH_ERROR },
        { status: 400 }
      )
    }

    /*
     * If email confirmation is enabled in Supabase,
     * data.session may be null until the user verifies email.
     */
    return NextResponse.json(
      {
        message: data.session
          ? 'Signup successful'
          : 'Signup successful. Please verify your email.',
        user: {
          id: data.user?.id,
          email: data.user?.email
        },
        session: data.session
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[AUTH] Unexpected signup route error', {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: GENERIC_AUTH_ERROR },
      { status: 500 }
    )
  }
}

