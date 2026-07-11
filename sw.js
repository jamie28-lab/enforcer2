// ENFORCER 2.0 service worker — notification-only, no fetch/caching handler
// (avoids stale-app bugs from caching the app shell)
'use strict';

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

self.addEventListener('push', event => {
  let title = 'ENFORCER';
  let body = '';
  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      body = data.body || '';
    } catch {
      body = event.data.text();
    }
  }
  event.waitUntil(self.registration.showNotification(title, { body, icon: './icon.png' }));
});
