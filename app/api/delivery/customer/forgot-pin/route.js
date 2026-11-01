export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STORE_CODE = /^[A-Za-z0-9_-]{1,80}$/
const MOBILE = /^[6-9]\d{9}$/

function reply(body, status) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' },
  })
}

function validAccount(store, mobile) {
  return typeof store === 'string' && STORE_CODE.test(store.trim()) &&
    typeof mobile === 'string' && MOBILE.test(mobile)
}

function unavailable() {
  // The linked recovery page predates any checked-in recovery RPC/schema.
  // Do not guess a reset function or write PIN/session tables with service_role.
  // Enable recovery only after its atomic verification, code rotation, session
  // revocation and rate-limit contract has passed isolated staging tests.
  return reply({
    success: false,
    code: 'PIN_RECOVERY_UNAVAILABLE',
    message: 'PIN recovery is temporarily unavailable. Contact your delivery store for help. Your PIN has not changed.',
  }, 503)
}

export async function GET(request) {
  const params = new URL(request.url).searchParams
  if (!validAccount(params.get('store'), params.get('mobile'))) {
    return reply({ success: false, code: 'INVALID_RECOVERY_DETAILS', message: 'Enter a valid store and 10-digit mobile number.' }, 400)
  }
  // The same response for every syntactically valid account avoids disclosure
  // of whether a mobile number is registered or has a security question.
  return unavailable()
}

export async function POST(request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body) || !validAccount(body.store, body.mobile)) {
    return reply({ success: false, code: 'INVALID_RECOVERY_DETAILS', message: 'Enter a valid store and 10-digit mobile number.' }, 400)
  }
  return unavailable()
}
