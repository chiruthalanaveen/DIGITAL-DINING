const BASE_URL = 'https://www.digitaldine-in.online'

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',

        // Public pages Google can crawl
        allow: [
          '/',
          '/app',
          '/delivery',
          '/demo',
          '/privacy-policy',
          '/register',
          '/menu/',
        ],

        // Private / operational pages
        disallow: [
          '/admin/',
          '/api/',
          '/auth/',
          '/dashboard/',
          '/delivery-driver/',
          '/delivery-packer/',
          '/developer/',
          '/kitchen/',
          '/login/',
          '/manager/',
          '/subscribe/',
          '/waiter/',
        ],
      },
    ],

    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}