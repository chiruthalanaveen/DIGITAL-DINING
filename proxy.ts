import { NextResponse, type NextRequest } from 'next/server'
import { maintenancePage } from './lib/maintenance-page'
import { maintenanceEnabled } from './lib/server/maintenanceSettings'

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

  if (!await maintenanceEnabled()) return NextResponse.next()

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
