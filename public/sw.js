// CareDose+ Service Worker v2 - Full offline + push notifications
const CACHE_NAME = 'caredose-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg'
];

// Install: cache static assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first for API, cache-first for assets
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  // Skip Firebase/Firestore requests (handle online only)
  if (url.includes('firestore.googleapis.com') || url.includes('firebase') ||
      url.includes('googleapis.com') || url.includes('gstatic.com')) return;
  
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request)
        .then(r => r || caches.match('/index.html'))
      )
  );
});

// Push Notifications
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'caredose-notif',
    requireInteraction: data.requireInteraction || false,
    data: data.url || '/',
    actions: data.actions || []
  };
  e.waitUntil(self.registration.showNotification(data.title || 'CareDose+', options));
});

// Notification click
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      if (clientList.length > 0) {
        clientList[0].focus();
        clientList[0].navigate(e.notification.data || '/');
      } else {
        clients.openWindow(e.notification.data || '/');
      }
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', e => {
  if (e.tag === 'sync-medicine-actions') {
    e.waitUntil(syncMedicineActions());
  }
});

async function syncMedicineActions() {
  // Notify all clients to sync
  const allClients = await clients.matchAll({ type: 'window' });
  allClients.forEach(c => c.postMessage({ type: 'SYNC_NEEDED' }));
}
