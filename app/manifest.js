export default function manifest() {
  return {
    name: 'Digital Dine',
    short_name: 'Digital Dine',

    description:
      'Restaurant, Delivery and Resort operations with Digital Dine.',

    start_url: '/app',

    scope: '/',

    display: 'standalone',

    orientation: 'portrait',

    background_color:
      '#090909',

    theme_color:
      '#f97316',

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
          'any maskable',
      },

      {
        src:
          '/icons/digital-dine-512.png',

        sizes:
          '512x512',

        type:
          'image/png',

        purpose:
          'any maskable',
      },
    ],
  }
}