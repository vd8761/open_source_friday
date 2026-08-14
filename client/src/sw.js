import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Precache all assets built by Vite
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// ─── Push Notification Handler ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Open Source Friday', body: event.data ? event.data.text() : '' };
  }

  const {
    title = 'Open Source Friday',
    body = '',
    icon = '/favicon.png',
    badge = '/favicon.png',
    url = '/',
    tag,
  } = payload;

  const options = {
    body,
    icon,
    badge,
    data: { url },
    tag: tag || 'osf-notification',
    vibrate: [200, 100, 200],
    requireInteraction: false,
    actions: [
      { action: 'open', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification Click Handler ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
