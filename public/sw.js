const CACHE_NAME = 'chatbit-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add('/')))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// Only page navigations are handled: the network first, and the cached app shell if the network is down.
// Everything else (scripts, API calls, media) goes straight to the browser, so this worker can never break them.
self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || request.mode !== 'navigate') return
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put('/', copy))
        }
        return response
      })
      // A cache miss is undefined, which respondWith rejects; fall back to a proper error response instead.
      .catch(async () => (await caches.match('/')) ?? Response.error()),
  )
})

// Push payloads are generic on purpose (the server cannot read encrypted messages): { title, body, tag, url }.
self.addEventListener('push', (event) => {
  const payload = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'New message', {
      body: payload.body ?? 'You have a new message.',
      tag: payload.tag ?? 'chatbit-message',
      data: {
        url:
          typeof payload.url === 'string' && payload.url.startsWith('/')
            ? payload.url
            : '/',
      },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients[0]
        if (existing)
          return existing
            .focus()
            .then((client) =>
              'navigate' in client ? client.navigate(target) : client,
            )
        return self.clients.openWindow(target)
      }),
  )
})
