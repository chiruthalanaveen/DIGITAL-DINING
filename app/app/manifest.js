export default function manifest() {
  return {
    id: '/app',

    name: 'Digital Dine-In',
    short_name: 'Digital Dine-In',

    description:
      'Digital Dine-In business operations application for Restaurant, Delivery and Resort management.',

    start_url: '/app',

    scope: '/app/',

    display: 'standalone',

    orientation: 'any',

    background_color: '#090909',
    theme_color: '#090909',

    prefer_related_applications: false,

    categories: [
      'business',
      'food',
      'productivity',
    ],

    icons: [
      {
        src:
          '/icons/digital-dine-192.png',
        sizes:
          '192x192',
        type:
          'image/png',
        purpose:
          'any',
      },

      {
        src:
          '/icons/digital-dine-512.png',
        sizes:
          '512x512',
        type:
          'image/png',
        purpose:
          'any',
      },
    ],
  }
}