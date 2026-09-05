import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

export async function POST(request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ success: false, message: 'Email and password are required.' }, { status: 400 })
    }

    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (error || !restaurant) {
      return NextResponse.json({ success: false, message: 'Account not found with this email.' }, { status: 401 })
    }

    if (!restaurant.password_hash) {
      return NextResponse.json({ success: false, message: 'Password not configured.' }, { status: 401 })
    }

    const passwordMatch = await bcrypt.compare(password, restaurant.password_hash)

    if (!passwordMatch) {
      return NextResponse.json({ success: false, message: 'Incorrect password.' }, { status: 401 })
    }

    return NextResponse.json({ 
      success: true, 
      restaurantId: restaurant.id,
      name: restaurant.name 
    }, { status: 200 })

  } catch (err) {
    console.error('Login API Error:', err)
    return NextResponse.json({ success: false, message: err.message }, { status: 500 })
  }
}