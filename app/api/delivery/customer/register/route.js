
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Registration is temporarily disabled until the backend
// can securely verify mobile-number ownership.
//
// IMPORTANT:
// Do not enable registration merely by changing a frontend
// button or a configuration flag. The registration RPC must
// require verified ownership before creating an account.

function jsonResponse(body, status = 200) {
  const response = NextResponse.json(body, {
    status,
  })

  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Pragma', 'no-cache')

  return response
}

export async function POST() {
  // Fail closed: do not parse or process submitted PINs,
  // create customer records, or issue customer sessions.
  //
  // Existing customers and other application workflows
  // are unaffected by this registration endpoint.

  return jsonResponse(
    {
      success: false,
      code: 'REGISTRATION_TEMPORARILY_DISABLED',
      message:
        'Mobile registration is temporarily unavailable while we complete account security improvements. Please continue with Google sign-in.',
    },
    503
  )
}
