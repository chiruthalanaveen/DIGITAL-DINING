/* ============================================================
 * DIGITAL DINE-IN
 * APP-ONLY PWA SERVICE WORKER
 *
 * Physical application folder:
 *   app/app/
 *
 * Browser application URLs:
 *   /app
 *   /app/owner/*
 *   /app/manager/*
 *   /app/waiter/*
 *   /app/kitchen/*
 *   /app/packer/*
 *   /app/driver/*
 *
 * IMPORTANT:
 * This service worker is registered with scope "/app/" from
 * instrumentation-client.js.
 *
 * It intentionally does NOT cache Next.js pages, Supabase data,
 * payment flows, orders, inventory, or live Delivery information.
 * ============================================================ */

const APP_HOME = '/app'

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

/*
 * Do not intercept network requests.
 *
 * This keeps all Next.js, Supabase, Razorpay, Delivery,
 * inventory and realtime requests using normal network behavior.
 */
self.addEventListener(
  'fetch',
  () => {}
)

/*
 * Push notifications.
 *
 * Your server can optionally send:
 *
 * {
 *   "title": "New Delivery Order",
 *   "body": "Order #123 is ready.",
 *   "url": "/app/driver/12345"
 * }
 *
 * Only /app URLs are accepted as notification destinations.
 */
self.addEventListener(
  'push',
  (event) => {
    let payload = {}

    try {
      payload =
        event.data?.json?.() ||
        {}
    } catch {
      try {
        payload = {
          body:
            event.data?.text?.() ||
            '',
        }
      } catch {
        payload = {}
      }
    }

    const title =
      String(
        payload?.title ||
          'Digital Dine-In'
      ).trim() ||
      'Digital Dine-In'

    const body =
      String(
        payload?.body ||
          'You have a new update.'
      ).trim()

    const rawUrl =
      String(
        payload?.url ||
          APP_HOME
      ).trim()

    const safeUrl =
      rawUrl === APP_HOME ||
      rawUrl.startsWith(
        `${APP_HOME}/`
      )
        ? rawUrl
        : APP_HOME

    event.waitUntil(
      self.registration.showNotification(
        title,
        {
          body,
          icon:
            '/icons/digital-dine-192.png',
          badge:
            '/icons/digital-dine-192.png',
          data: {
            url: safeUrl,
          },
          tag:
            payload?.tag
              ? String(
                  payload.tag
                )
              : undefined,
        }
      )
    )
  }
)

/*
 * Clicking an app notification:
 *
 * 1. Reuse an already-open /app window when possible.
 * 2. Otherwise open the requested /app route.
 * 3. Never redirect the installed-app notification to the
 *    public website landing page.
 */
self.addEventListener(
  'notificationclick',
  (event) => {
    event.notification.close()

    const rawUrl =
      String(
        event.notification
          ?.data?.url ||
          APP_HOME
      ).trim()

    const targetPath =
      rawUrl === APP_HOME ||
      rawUrl.startsWith(
        `${APP_HOME}/`
      )
        ? rawUrl
        : APP_HOME

    const targetUrl =
      new URL(
        targetPath,
        self.location.origin
      ).href

    event.waitUntil(
      self.clients
        .matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        .then(
          async (windowClients) => {
            for (
              const client of
              windowClients
            ) {
              try {
                const clientUrl =
                  new URL(
                    client.url
                  )

                if (
                  clientUrl.origin ===
                    self.location
                      .origin &&
                  (
                    clientUrl.pathname ===
                      APP_HOME ||
                    clientUrl.pathname.startsWith(
                      `${APP_HOME}/`
                    )
                  )
                ) {
                  if (
                    'navigate' in
                    client &&
                    client.url !==
                      targetUrl
                  ) {
                    await client.navigate(
                      targetUrl
                    )
                  }

                  if (
                    'focus' in
                    client
                  ) {
                    return client.focus()
                  }

                  return client
                }
              } catch {
                // Continue checking other clients.
              }
            }

            if (
              self.clients
                .openWindow
            ) {
              return self.clients.openWindow(
                targetUrl
              )
            }

            return undefined
          }
        )
    )
  }
)