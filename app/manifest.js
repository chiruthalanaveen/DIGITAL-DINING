export default function manifest() {
  return {
    id: '/',

    name:
      'Digital Dine-In',

    short_name:
      'Digital Dine-In',

    description:
      'Digital Dine-In restaurant, delivery and hospitality platform.',

    start_url: '/',

    scope: '/',

    display:
      'standalone',

    background_color:
      '#ffffff',

    theme_color:
      '#111827',

    prefer_related_applications:
      false,

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