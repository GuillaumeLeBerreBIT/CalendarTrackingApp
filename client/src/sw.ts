/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & typeof globalThis

// Workbox injects the precache manifest here at build time
precacheAndRoute(self.__WB_MANIFEST)

// Cache calendar + group reads — serve stale instantly, refresh in background
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/renderEvents') || url.pathname.startsWith('/api/groups'),
  new StaleWhileRevalidate({
    cacheName: 'api-reads',
    plugins: [
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 }), // 24h max
    ],
  })
)

// Other API calls — network first, fall back to cache when offline
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-fallback',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 6 }), // 6h max
    ],
  })
)

// Handle incoming push messages from the backend
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; link?: string } = {}
  try { data = event.data?.json() ?? {} } catch { data = {} }

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Eventli', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { link: data.link ?? '/' },
      vibrate: [100, 50, 100],
    } as NotificationOptions & { vibrate?: number[] })
  )
})

// When the user taps the notification, open the app at the linked page
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link: string = (event.notification.data as { link?: string })?.link ?? '/'
  event.waitUntil(
    (self.clients as Clients).matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(link)
          return client.focus()
        }
      }
      return (self.clients as Clients).openWindow(link)
    })
  )
})
