/* DD Delivery: navigation-only offline fallback. No API, order, cookie or personal-data caching. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || url.origin !== self.location.origin ||
      url.pathname !== '/dd-delivery') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DD Delivery - Offline</title><body style="font:16px system-ui;background:#153f31;color:#fff;padding:40px 22px"><h1>DD Delivery</h1><p>You are offline. Connect to the internet and reopen the app to continue.</p><button onclick="location.reload()" style="padding:12px 22px;border:0;border-radius:12px">Retry</button></body></html>',
    { headers: { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' }, status: 503 }
  )));
});
