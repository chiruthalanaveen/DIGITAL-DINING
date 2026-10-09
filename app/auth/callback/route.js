import { NextResponse } from 'next/server'

function safeSource(value) {
  return value === 'delivery' || value === 'website' ? value : ''
}

function safeNextPath(value) {
  const next = String(value || '').trim()
  return next.startsWith('/delivery') ? next : ''
}

export async function GET(request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const source = safeSource(requestUrl.searchParams.get('source'))
  const next =
    source === 'delivery'
      ? safeNextPath(requestUrl.searchParams.get('next'))
      : ''

  const loginUrl = new URL(
    source === 'delivery' ? '/delivery/login' : '/login',
    requestUrl.origin
  )

  if (!code) {
    loginUrl.searchParams.set('error', 'missing_code')
    return NextResponse.redirect(loginUrl)
  }

  // IMPORTANT:
  // Do not exchange the PKCE code on the server here.
  // The project's browser Supabase client persists the auth session in browser
  // storage, so /auth/complete performs the exchange in the browser.
  const completeUrl = new URL('/auth/complete', requestUrl.origin)
  completeUrl.searchParams.set('code', code)

  if (source) {
    completeUrl.searchParams.set('source', source)
  }

  if (source === 'delivery' && next) {
    completeUrl.searchParams.set('next', next)
  }

  return NextResponse.redirect(completeUrl)
}