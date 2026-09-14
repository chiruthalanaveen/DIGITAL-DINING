import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const runtime = 'nodejs'

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Restaurant name is required'),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  dob: z.string().min(1, 'Date of birth is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Supabase environment variables are missing. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function POST(request) {
  console.log('REGISTER API: Request received')

  let body

  try {
    body = await request.json()
  } catch (error) {
    console.error('REGISTER API: Invalid JSON body', error)

    return NextResponse.json(
      {
        success: false,
        message: 'Invalid request data.',
      },
      { status: 400 }
    )
  }

  try {
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      const message =
        parsed.error.issues?.[0]?.message || 'Please check the entered details.'

      console.error('REGISTER API: Validation failed:', parsed.error.issues)

      return NextResponse.json(
        {
          success: false,
          message,
        },
        { status: 400 }
      )
    }

    const { name, email, phone, dob, password } = parsed.data

    const dateOfBirth = new Date(`${dob}T00:00:00`)
    const today = new Date()

    if (Number.isNaN(dateOfBirth.getTime())) {
      return NextResponse.json(
        {
          success: false,
          message: 'Please enter a valid date of birth.',
        },
        { status: 400 }
      )
    }

    if (dateOfBirth > today) {
      return NextResponse.json(
        {
          success: false,
          message: 'Date of birth cannot be in the future.',
        },
        { status: 400 }
      )
    }

    const minimumDate = new Date()
    minimumDate.setFullYear(minimumDate.getFullYear() - 120)

    if (dateOfBirth < minimumDate) {
      return NextResponse.json(
        {
          success: false,
          message: 'Please enter a valid date of birth.',
        },
        { status: 400 }
      )
    }

    const supabaseAdmin = getAdminClient()

    console.log('REGISTER API: Creating authentication user')

    const {
      data: authData,
      error: authError,
    } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        phone,
        dob,
        account_type: 'restaurant_owner',
      },
    })

    if (authError) {
      console.error('REGISTER API: Auth user creation failed:', authError)

      return NextResponse.json(
        {
          success: false,
          message: authError.message || 'Unable to create account.',
        },
        { status: 400 }
      )
    }

    if (!authData?.user?.id) {
      console.error('REGISTER API: Auth user ID was not returned')

      return NextResponse.json(
        {
          success: false,
          message: 'Account creation failed. Please try again.',
        },
        { status: 500 }
      )
    }

    const userId = authData.user.id

    console.log('REGISTER API: Creating restaurant record')

    const {
      data: restaurant,
      error: restaurantError,
    } = await supabaseAdmin
      .from('restaurants')
      .insert({
        name,
        email,
        phone,
        dob,
        owner_id: userId,
      })
      .select('id')
      .single()

    if (restaurantError) {
      console.error(
        'REGISTER API: Restaurant creation failed:',
        restaurantError
      )

      // Roll back the authentication user if restaurant creation fails.
      const { error: deleteUserError } =
        await supabaseAdmin.auth.admin.deleteUser(userId)

      if (deleteUserError) {
        console.error(
          'REGISTER API: Rollback user deletion failed:',
          deleteUserError
        )
      }

      return NextResponse.json(
        {
          success: false,
          message:
            restaurantError.message ||
            'Unable to create restaurant profile.',
        },
        { status: 400 }
      )
    }

    console.log('REGISTER API: Registration completed successfully')

    return NextResponse.json(
      {
        success: true,
        message: 'Registration successful.',
        restaurantId: restaurant.id,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('REGISTER API: Unexpected error:', error)

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected registration error occurred.',
      },
      { status: 500 }
    )
  }
}