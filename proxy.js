// Destination: proxy.js (project root, alongside package.json)
// Next.js 16 hostname-based E-Commerce storefront routing.
// Add new store hostnames to STORE_SUBDOMAINS after assigning them in Vercel.

import { NextResponse } from 'next/server'

const ROOT_DOMAIN = 'digitaldine-in.online'

// Explicit allowlist prevents unknown subdomains (such as admin or api)
// from being interpreted as public E-Commerce stores.
const STORE_SUBDOMAINS = Object.freeze({
  ram: 'ram',
  'snitch-clothing': 'snitch-clothing',
})

export function proxy(request) {
  const hostname = (request.nextUrl.hostname || '').toLowerCase().replace(/\.$/, '')
  const suffix = `.${ROOT_DOMAIN}`

  // Main domain, local development, and other unrelated hostnames:
  // retain the application's existing behavior.
  if (!hostname.endsWith(suffix)) return NextResponse.next()

  const subdomain = hostname.slice(0, -suffix.length)
  const storeSlug = STORE_SUBDOMAINS[subdomain]
  if (!storeSlug) return NextResponse.next()

  const pathname = request.nextUrl.pathname

  // Only rewrite the storefront homepage. All other routes, including
  // /api, /_next, images, auth, and owner/admin portals, remain untouched.
  // This avoids breaking existing app features and static resources.
  if (pathname !== '/') return NextResponse.next()

  const destination = request.nextUrl.clone()
  destination.pathname = `/shop/${storeSlug}`
  return NextResponse.rewrite(destination)
}

export const config = {
  matcher: '/',
}