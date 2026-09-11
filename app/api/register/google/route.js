import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))

    const {
      userId,
      name,
      email,
      phone,
      dob,
    } = body

    if (!userId || !email) {
      return NextResponse.json(
        {
          success: false,
          message: 'Google user ID and email are required.',
        },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.SUPABASE_URL?.trim()
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          message:
            'CRITICAL CONFIG ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
        },
        { status: 500 }
      )
    }

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

    const cleanUserId = String(userId).trim()
    const cleanEmail = String(email).trim().toLowerCase()

    const cleanName =
      name && String(name).trim() !== ''
        ? String(name).trim()
        : cleanEmail.split('@')[0]

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

    // Check whether the restaurant profile already exists
    const {
      data: existingRestaurant,
      error: existingError,
    } = await supabaseAdmin
      .from('restaurants')
      .select('id, name, email, subscription_status')
      .eq('id', cleanUserId)
      .maybeSingle()

    if (existingError) {
      console.error(
        'EXISTING RESTAURANT LOOKUP ERROR:',
        existingError
      )

      return NextResponse.json(
        {
          success: false,
          message: `Database Error: ${existingError.message}`,
        },
        { status: 400 }
      )
    }

    // Prevent duplicate restaurant profiles
    if (existingRestaurant) {
      return NextResponse.json(
        {
          success: true,
          alreadyExists: true,
          restaurantId: existingRestaurant.id,
          message: 'Restaurant profile already exists.',
        },
        { status: 200 }
      )
    }

    // Create restaurant profile
    const {
      data: restaurantData,
      error: dbError,
    } = await supabaseAdmin
      .from('restaurants')
      .insert([
        {
          id: cleanUserId,
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
        'GOOGLE RESTAURANT INSERT ERROR:',
        dbError
      )

      return NextResponse.json(
        {
          success: false,
          message:
            `Database Error: ${dbError.message}. ` +
            'Please verify your restaurants table columns.',
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        alreadyExists: false,
        restaurantId: restaurantData.id,
        message: 'Google account registered successfully!',
      },
      { status: 200 }
    )
  } catch (err) {
    console.error(
      'API /api/register/google Exception:',
      err
    )

    return NextResponse.json(
      {
        success: false,
        message:
          err?.message ||
          'An unexpected error occurred while creating the Google profile.',
      },
      { status: 500 }
    )
  }
}