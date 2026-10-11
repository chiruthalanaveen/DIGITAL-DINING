import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    if (!requireAdmin(request)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = getAdminSupabase()

    const { data, error } = await supabase
      .from('customer_auth_settings')
      .select('otp_enabled, updated_at')
      .eq('id', 1)
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      otpEnabled: data.otp_enabled,
      updatedAt: data.updated_at,
    })
  } catch (error) {
    console.error('Customer auth settings GET:', error)

    return NextResponse.json(
      { success: false, message: 'Unable to load OTP settings.' },
      { status: 500 }
    )
  }
}

export async function POST(request) {
  try {
    if (!requireAdmin(request)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => null)

    if (!body || typeof body.otpEnabled !== 'boolean') {
      return NextResponse.json(
        { success: false, message: 'Invalid OTP setting.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabase()

    const { data, error } = await supabase
      .from('customer_auth_settings')
      .update({
        otp_enabled: body.otpEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select('otp_enabled, updated_at')
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      otpEnabled: data.otp_enabled,
      updatedAt: data.updated_at,
    })
  } catch (error) {
    console.error('Customer auth settings POST:', error)

    return NextResponse.json(
      { success: false, message: 'Unable to update OTP settings.' },
      { status: 500 }
    )
  }
}