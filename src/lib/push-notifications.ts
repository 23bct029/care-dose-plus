// src/lib/push-notifications.ts
// Firebase Cloud Messaging V1 - Web Push Notifications
// Sender ID: 773546090775

import { db, getFCMToken, onFCMMessage } from './firebase';
import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { sendBrowserNotification } from './notifications';

// ─── STEP 1: Get and store FCM token for this device/user ─────────────────
// VAPID key: Get from Firebase Console → Project Settings → Cloud Messaging
//            → Web Push certificates → "Add new pair" → Copy the key string
// Paste it in your .env as: VITE_FIREBASE_VAPID_KEY=your_key_here
// OR paste directly below (less secure but works for demos):
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

export async function registerPushNotifications(userId: string): Promise<string | null> {
  try {
    // Request browser notification permission first
    if (!('Notification' in window)) return null;
    
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      console.log('[FCM] Permission not granted');
      return null;
    }

    // Get FCM registration token
    const token = await getFCMToken(VAPID_KEY);
    if (!token) {
      console.warn('[FCM] No token returned — VAPID key may be missing');
      return null;
    }

    // Store token in Firestore so backend/other devices can send to this user
    await setDoc(doc(db, 'fcm_tokens', userId), {
      userId,
      token,
      device: navigator.userAgent.slice(0, 100),
      platform: 'web',
      updatedAt: serverTimestamp(),
    }, { merge: true });

    console.log('[FCM] Token registered:', token.slice(0, 20) + '...');
    return token;
  } catch (e) {
    console.warn('[FCM] Registration failed:', e);
    return null;
  }
}

// ─── STEP 2: Listen for foreground messages ───────────────────────────────
export function setupForegroundNotifications(
  onReceive?: (payload: any) => void
): () => void {
  const unsub = onFCMMessage((payload) => {
    console.log('[FCM] Foreground message:', payload);
    const { title, body } = payload.notification || {};
    const data = payload.data || {};

    // Show browser notification even in foreground
    sendBrowserNotification(
      title || 'CareDose+',
      body || data.body || 'You have a new notification',
      { tag: data.tag, requireInteraction: data.priority === 'emergency' }
    );

    // Call custom handler
    if (onReceive) onReceive(payload);
  });
  return unsub;
}

// ─── STEP 3: Save notification to Firestore (triggers FCM via Cloud Functions) ──
// Since we don't have Cloud Functions deployed, we save to Firestore and
// the receiving device picks it up via real-time listener OR background SW push
export async function sendPushToUser(
  targetUserId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  // Save to Firestore — the target device's Firestore listener will show it
  await addDoc(collection(db, 'notifications'), {
    userId: targetUserId,
    type: data?.type || 'system',
    title,
    message: body,
    data: data || {},
    read: false,
    createdAt: serverTimestamp(),
    priority: data?.priority || 'medium',
  });
  // Note: For true background push (device locked/app closed), you need
  // Firebase Cloud Functions to call FCM V1 API using the stored token.
  // The firebase-messaging-sw.js handles that automatically once set up.
}

// ─── STEP 4: Get VAPID key setup instructions ─────────────────────────────
export function getVAPIDSetupInstructions(): string {
  return `
To enable real push notifications (even when app is closed):

1. Go to Firebase Console → https://console.firebase.google.com
2. Select your project: caredose-6b966
3. Click ⚙️ Project Settings (gear icon, top left)
4. Click "Cloud Messaging" tab
5. Under "Web configuration" → "Web Push certificates"
6. Click "Generate key pair" (or "Add new pair")
7. Copy the KEY PAIR string that appears
8. Create a file: /project/.env  (same folder as package.json)
9. Add this line: VITE_FIREBASE_VAPID_KEY=paste_your_key_here
10. Restart: npm run dev

That's it! Push notifications will work on all devices.
  `.trim();
}
