import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function reply(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}

// Public read-only endpoint. The signup mode is not a secret.
// DO NOT assume OTP or PIN signup when policy lookup fails.
export async function GET() {
  try {
    const admin = getAdminSupabase()
    const { data, error } = await admin
      .from('delivery_customer_signup_policy')
      .select('signup_mode')
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      const missingMigration = [
        '42P01', 'PGRST205', 'PGRST116',
      ].includes(String(error.code || ''))
      console.error('[DELIVERY SIGNUP POLICY QUERY]', {
        code: error.code,
        message: error.message,
      })
      return reply({
        success: false,
        code: missingMigration ? 'SIGNUP_POLICY_MIGRATION_REQUIRED' : 'SIGNUP_POLICY_QUERY_FAILED',
        message: missingMigration
          ? 'Mobile signup setup is incomplete. Ask the administrator to install the signup policy database migration.'
          : 'Could not verify mobile signup settings. Please try again.',
      }, 503)
    }

    if (!data || !['otp', 'pin_question'].includes(data.signup_mode)) {
      console.error('[DELIVERY SIGNUP POLICY] Missing/invalid policy row id=1')
      return reply({
        success: false,
        code: 'SIGNUP_POLICY_NOT_CONFIGURED',
        message: 'Mobile signup policy has not been configured by the administrator.',
      }, 503)
    }

    return reply({ success: true, signupMode: data.signup_mode })
  } catch (error) {
    console.error('[DELIVERY SIGNUP POLICY SERVER]', error?.message)
    return reply({
      success: false,
      code: 'SIGNUP_POLICY_SERVER_ERROR',
      message: 'Could not load mobile signup settings. Please contact support.',
    }, 503)
  }
}
