import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyDnokm6rJx8OQXuYxPHpUBzVjmCd4bgtq0",
  authDomain: "caredose-6b966.firebaseapp.com",
  projectId: "caredose-6b966",
  storageBucket: "caredose-6b966.firebasestorage.app",
  messagingSenderId: "773546090775",
  appId: "1:773546090775:web:acd360e9197b378ede5752",
  measurementId: "G-YK6X2BMHC7"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);

// FCM - only initialize in browser with SW support
export let messaging: ReturnType<typeof getMessaging> | null = null;

export async function initMessaging() {
  try {
    const supported = await isSupported();
    if (supported) {
      messaging = getMessaging(app);
      return messaging;
    }
  } catch (e) {
    console.warn('[FCM] Not supported in this environment');
  }
  return null;
}

// Get FCM registration token (requires VAPID key from Firebase Console)
// To get your VAPID key: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair
export async function getFCMToken(vapidKey?: string): Promise<string | null> {
  if (!messaging) await initMessaging();
  if (!messaging) return null;
  try {
    const swReg = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: vapidKey || import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    return token || null;
  } catch (e) {
    console.warn('[FCM] Failed to get token:', e);
    return null;
  }
}

// Handle foreground messages
export function onFCMMessage(callback: (payload: any) => void) {
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
