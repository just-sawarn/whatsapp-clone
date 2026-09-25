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

self.addEventListener('push', (event) => {
  const payload = event.data?.json() ?? {}
  event.waitUntil(self.registration.showNotification(payload.title ?? 'New message', {
    body: payload.body ?? 'You have a new message.',
    tag: payload.tag ?? 'whatsapp-message',
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const firstClient = clients[0]
    if (firstClient) return firstClient.focus()
    return self.clients.openWindow('/')
  }))
})
