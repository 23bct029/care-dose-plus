// CareDose+ Service Worker v3
const CACHE_NAME = 'caredose-v3';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => Promise.all(STATIC_ASSETS.map(url =>
        c.add(url).catch(() => {}) // gracefully ignore failures
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Only handle http/https requests (not chrome-extension:// or others)
  if (!url.startsWith('http')) return;
  if (e.request.method !== 'GET') return;
  // Skip Firebase/Google API calls
  if (url.includes('firestore.googleapis.com') || url.includes('googleapis.com') ||
      url.includes('firebase') || url.includes('gstatic.com') || url.includes('identitytoolkit')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request)
        .then(r => r || caches.match('/index.html'))
      )
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(self.registration.showNotification(data.title || 'CareDose+', {
    body: data.body || 'New notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'caredose',
    requireInteraction: data.requireInteraction || false,
    data: data.url || '/',
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      if (list.length) { list[0].focus(); list[0].navigate(e.notification.data || '/'); }
      else clients.openWindow(e.notification.data || '/');
    })
  );
});

self.addEventListener('sync', e => {
  if (e.tag === 'sync-medicine-actions') {
    e.waitUntil(clients.matchAll({ type:'window' }).then(cs => cs.forEach(c => c.postMessage({ type:'SYNC_NEEDED' }))));
  }
});
