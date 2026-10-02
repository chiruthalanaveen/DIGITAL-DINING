const CACHE_NAME =
  'digital-dine-v1'

self.addEventListener(
  'install',
  () => {
    self.skipWaiting()
  }
)

self.addEventListener(
  'activate',
  (event) => {
    event.waitUntil(
      self.clients.claim()
    )
  }
)

self.addEventListener(
  'fetch',
  (event) => {
    const request =
      event.request

    if (
      request.method !==
      'GET'
    ) {
      return
    }

    /*
     * Network-first.
     *
     * Digital Dine is a live operations
     * application, so stale order data
     * should not be preferred.
     */
    event.respondWith(
      fetch(request).catch(
        () =>
          caches.match(
            request
          )
      )
    )
  }
)