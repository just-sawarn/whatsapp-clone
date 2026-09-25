const CACHE_NAME = 'whatsapp-clone-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['/'])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
})

// Push payloads are generic on purpose (the server cannot read encrypted messages): { title, body, tag, url }.
self.addEventListener('push', (event) => {
  const payload = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'New message', {
      body: payload.body ?? 'You have a new message.',
      tag: payload.tag ?? 'whatsapp-message',
      data: { url: typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients[0]
      if (existing) return existing.focus().then((client) => ('navigate' in client ? client.navigate(target) : client))
      return self.clients.openWindow(target)
    }),
  )
})
