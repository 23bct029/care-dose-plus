// firebase-messaging-sw.js - Required for FCM background push
// This file MUST be at root level (/public/)
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDnokm6rJx8OQXuYxPHpUBzVjmCd4bgtq0",
  authDomain: "caredose-6b966.firebaseapp.com",
  projectId: "caredose-6b966",
  storageBucket: "caredose-6b966.firebasestorage.app",
  messagingSenderId: "773546090775",
  appId: "1:773546090775:web:acd360e9197b378ede5752",
});

const messaging = firebase.messaging();

// Handle background push messages
messaging.onBackgroundMessage(payload => {
  console.log('[FCM SW] Background message:', payload);
  const { title, body, icon, tag, url } = payload.notification || {};
  const notifTitle = title || 'CareDose+';
  const options = {
    body: body || payload.data?.body || 'You have a new notification',
    icon: icon || '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: tag || payload.data?.tag || 'caredose',
    data: { url: url || payload.data?.url || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: payload.data?.requireInteraction === 'true',
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  self.registration.showNotification(notifTitle, options);
});

// Notification click
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      const existing = cls.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});
