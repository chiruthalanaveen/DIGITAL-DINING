import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const { name, email, phone, dob, password } = body

    if (!email || !password || !name) {
      return NextResponse.json({ success: false, message: 'Name, email, and password are required.' }, { status: 400 })
    }

    // Safely retrieve and sanitize environment variables
    const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseUrl = rawSupabaseUrl.trim().replace(/\/+$/, '')
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Environment Error: Missing Supabase URL or Service Role Key.')
      return NextResponse.json({ 
        success: false, 
        message: 'Server Configuration Error: Missing Supabase environment variables in .env.local' 
      }, { status: 500 })
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    })
    
    const formattedPhone = phone ? phone.trim().replace(/\D/g, '').slice(-10) : ''

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: password.trim(),
      email_confirm: true
    })

    if (authError) {
      return NextResponse.json({ success: false, message: authError.message }, { status: 400 })
    }

    const userId = authData.user.id

    // 2. Insert restaurant profile into 'restaurants' table
    const { data: restaurantData, error: dbError } = await supabaseAdmin
      .from('restaurants')
      .insert([
        {
          id: userId,
          name: name.trim(),
          email: email.trim(),
          phone: formattedPhone,
          dob: dob ? dob.trim() : null,
          subscription_status: 'pending',
          enable_counter_payment: true
        }
      ])
      .select()
      .single()

    if (dbError) {
      console.error('Supabase Restaurants Table Insert Error:', dbError)
      return NextResponse.json({ 
        success: false, 
        message: `Database Error: ${dbError.message}. Ensure the 'restaurants' table exists in Supabase.` 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      restaurantId: restaurantData.id,
      message: 'Account registered successfully!' 
    })
  } catch (err) {
    console.error('API /register Exception:', err)
    return NextResponse.json({ success: false, message: err.message || 'Internal Server Error' }, { status: 500 })
  }
}