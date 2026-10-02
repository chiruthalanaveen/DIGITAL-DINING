const BASE_URL = 'https://digitaldine-in.online'

export default function sitemap() {
  const now = new Date()

  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },

    {
      url: `${BASE_URL}/app`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },

    {
      url: `${BASE_URL}/delivery`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },

    {
      url: `${BASE_URL}/demo`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },

    {
      url: `${BASE_URL}/register`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },

    {
      url: `${BASE_URL}/privacy-policy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },

    // Public restaurant QR menu
    {
      url: `${BASE_URL}/menu/b489cf07-e19d-4d28-ab33-3cbf5871f5e1`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ]
}