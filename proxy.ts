import { NextResponse, type NextRequest } from 'next/server'
import { maintenancePage } from './lib/maintenance-page'
import { maintenanceEnabled } from './lib/server/maintenanceSettings'
import { resolveCommerceDomain } from './lib/server/commerce/domains'

const publicFiles = new Set([
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/logo.png',
  '/manifest.json',
  '/sw.js',
  '/dd-business-sw.js',
  '/dd-delivery-sw.js',
  '/file.svg',
  '/globe.svg',
  '/next.svg',
  '/vercel.svg',
  '/window.svg',
])

const servicePaths = [
  '/admin',
  '/icons',
  '/sounds',
  '/manifests',
  '/dd-apps',
  '/.well-known',
  '/auth/callback',
  '/auth/login',
  '/auth/signup',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Admin login and controls remain available even during maintenance.
  if (
    publicFiles.has(pathname) ||
    servicePaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  ) {
    return NextResponse.next()
  }

  if (!await maintenanceEnabled()) {
    // Only storefront entry points use custom-host routing. Existing platform,
    // auth, Admin, API and asset paths retain their current handling.
    if (pathname === '/' || pathname === '/account' || pathname === '/wishlist' || pathname === '/shops' || pathname.startsWith('/shops/')) {
      const slug = await resolveCommerceDomain(request)
      if (slug) {
        const destination = request.nextUrl.clone()
        let response
        if (pathname === `/shops/${slug}` || pathname === `/shops/${slug}/account` || pathname === `/shops/${slug}/wishlist`) {
          destination.pathname = pathname === `/shops/${slug}` ? '/' : pathname.endsWith('/wishlist') ? '/wishlist' : '/account'
          response = NextResponse.redirect(destination, 307)
        } else if (pathname === '/' || pathname === '/account' || pathname === '/wishlist') {
          destination.pathname = `/shops/${slug}${pathname === '/' ? '' : pathname}`
          response = NextResponse.rewrite(destination)
        } else {
          // A verified host cannot present another tenant's storefront.
          response = new NextResponse('Store page not found.', { status: 404 })
        }
        response.headers.set('Cache-Control', 'private, no-store')
        response.headers.set('Vary', 'Host')
        return response
      }
    }
    return NextResponse.next()
  }

  return new NextResponse(request.method === 'HEAD' ? null : maintenancePage, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Retry-After': '300',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

export const config = {
  matcher: ['/((?!api(?:/|$)|_next(?:/|$)).*)'],
}
