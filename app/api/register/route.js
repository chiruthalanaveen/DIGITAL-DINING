import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const { name, email, phone, dob, password } = body

    if (!email || !password || !name) {
      return NextResponse.json({ success: false, message: 'Name, email, and password are required.' }, { status: 400 })
    }

    const supabaseUrl = process.env.SUPABASE_URL?.trim()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ 
        success: false, 
        message: 'CRITICAL CONFIG ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.'
      }, { status: 500 })
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    })
    
    // Safely format phone (handle empty strings properly)
    const formattedPhone = phone && phone.trim() !== '' ? phone.trim().replace(/\D/g, '').slice(-10) : null

    // Safely format date of birth (prevent empty string crash on postgres date columns)
    const formattedDob = dob && dob.trim() !== '' ? dob.trim() : null

    // 1. Create user in Supabase Auth via Admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: password.trim(),
      email_confirm: true // Automatically confirms email so login works instantly
    })

    if (authError) {
      console.error('Supabase Auth Admin Error:', authError)
      return NextResponse.json({ success: false, message: `Auth Error: ${authError.message}` }, { status: 400 })
    }

    if (!authData || !authData.user) {
      return NextResponse.json({ success: false, message: 'Auth Error: User object was not returned by Supabase.' }, { status: 400 })
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
          dob: formattedDob,
          subscription_status: 'pending',
          enable_counter_payment: true
        }
      ])
      .select()
      .single()

    if (dbError) {
      console.error('Supabase Restaurants Table Insert Error:', dbError)
      
      // Rollback: delete the auth user if profile creation fails, preventing orphan auth accounts
      await supabaseAdmin.auth.admin.deleteUser(userId)

      return NextResponse.json({ 
        success: false, 
        message: `Database Error: ${dbError.message}. Make sure the 'restaurants' table and all columns exist.` 
      }, { status: 400 })
    }

    return NextResponse.json({ 
      success: true, 
      restaurantId: restaurantData.id,
      message: 'Account registered successfully!' 
    })
  } catch (err) {
    console.error('API /register Exception:', err)
    return NextResponse.json({ success: false, message: `Server Exception: ${err.message}` }, { status: 500 })
  }
}