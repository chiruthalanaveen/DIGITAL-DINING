import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))

    const {
      name,
      email,
      phone,
      dob,
      password,
    } = body

    // Validate required fields
    if (!name || !email || !password) {
      return NextResponse.json(
        {
          success: false,
          message: 'Name, email, and password are required.',
        },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.SUPABASE_URL?.trim()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
      )

      return NextResponse.json(
        {
          success: false,
          message:
            'CRITICAL CONFIG ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.',
        },
        { status: 500 }
      )
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    // Clean and safely format input values
    const cleanName = String(name).trim()
    const cleanEmail = String(email).trim().toLowerCase()
    const cleanPassword = String(password).trim()

    const formattedPhone =
      phone &&
      typeof phone === 'string' &&
      phone.trim() !== ''
        ? phone.trim().replace(/\D/g, '').slice(-10)
        : null

    const formattedDob =
      dob &&
      typeof dob === 'string' &&
      dob.trim() !== ''
        ? dob.trim()
        : null

    // Additional validation
    if (!cleanName || !cleanEmail || !cleanPassword) {
      return NextResponse.json(
        {
          success: false,
          message: 'Please provide valid name, email, and password.',
        },
        { status: 400 }
      )
    }

    if (cleanPassword.length < 6) {
      return NextResponse.json(
        {
          success: false,
          message: 'Password must be at least 6 characters long.',
        },
        { status: 400 }
      )
    }

    // 1. Create user in Supabase Auth through Admin API
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: cleanPassword,
        email_confirm: true,
        user_metadata: {
          name: cleanName,
          phone: formattedPhone,
          dob: formattedDob,
          registration_method: 'password',
        },
      })

    if (authError) {
      console.error('Supabase Auth Admin Error:', authError)

      let errorMessage = authError.message

      if (
        authError.message?.toLowerCase().includes('already registered') ||
        authError.message?.toLowerCase().includes('already exists') ||
        authError.message?.toLowerCase().includes('duplicate')
      ) {
        errorMessage =
          'An account with this email already exists. Please log in instead.'
      }

      return NextResponse.json(
        {
          success: false,
          message: `Auth Error: ${errorMessage}`,
        },
        { status: 400 }
      )
    }

    if (!authData?.user) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Auth Error: User object was not returned by Supabase.',
        },
        { status: 400 }
      )
    }

    const userId = authData.user.id

    // 2. Insert restaurant profile into restaurants table
    const { data: restaurantData, error: dbError } =
      await supabaseAdmin
        .from('restaurants')
        .insert([
          {
            id: userId,
            name: cleanName,
            email: cleanEmail,
            phone: formattedPhone,
            dob: formattedDob,
            subscription_status: 'pending',
            enable_counter_payment: true,
          },
        ])
        .select()
        .single()

    if (dbError) {
      console.error(
        'Supabase Restaurants Table Insert Error:',
        dbError
      )

      // Rollback Auth user if restaurant profile creation fails
      const { error: rollbackError } =
        await supabaseAdmin.auth.admin.deleteUser(userId)

      if (rollbackError) {
        console.error(
          'Auth User Rollback Error:',
          rollbackError
        )
      }

      return NextResponse.json(
        {
          success: false,
          message:
            `Database Error: ${dbError.message}. ` +
            'Make sure the restaurants table and required columns exist.',
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        restaurantId: restaurantData.id,
        message: 'Account registered successfully!',
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('API /api/register Exception:', err)

    return NextResponse.json(
      {
        success: false,
        message:
          err?.message ||
          'An unexpected server error occurred during registration.',
      },
      { status: 500 }
    )
  }
}