import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, indexedDBLocalPersistence, initializeAuth, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyDnokm6rJx8OQXuYxPHpUBzVjmCd4bgtq0",
  authDomain: "caredose-6b966.firebaseapp.com",
  projectId: "caredose-6b966",
  storageBucket: "caredose-6b966.firebasestorage.app",
  messagingSenderId: "773546090775",
  appId: "1:773546090775:web:acd360e9197b378ede5752",
  measurementId: "G-YK6X2BMHC7"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence]
});

const db = getFirestore(app);

// Enable offline persistence - remove the cacheSizeBytes option
enableIndexedDbPersistence(db)
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, persistence enabled in first tab only');
    } else if (err.code === 'unimplemented') {
      console.warn('Browser doesn\'t support persistence');
    }
  });

const storage = getStorage(app);
const functions = getFunctions(app);

let analytics = null;
if (typeof window !== 'undefined') {
  isSupported().then(yes => yes && (analytics = getAnalytics(app)));
}

export { app, auth, db, storage, functions, analytics };