export default function manifest() {
  return {
    // This PWA represents ONLY the mobile application under app/app/.
    id: '/app',

    name: 'Digital Dine-In',
    short_name: 'Digital Dine-In',

    description:
      'Digital Dine-In mobile application for Restaurant, Delivery and Resort operations.',

    // Physical file: app/app/page.jsx
    // Browser URL:  /app
    //
    // Installed application ALWAYS starts here.
    start_url: '/app',

    // Physical folder: app/app/
    // Browser routes:  /app/*
    //
    // Website routes such as /manager, /waiter, /kitchen,
    // /delivery-driver, etc. are outside this installed-app scope.
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
        src: '/icons/digital-dine-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/digital-dine-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}