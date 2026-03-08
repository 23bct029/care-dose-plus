import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyDnokm6rJx8OQXuYxPHpUBzVjmCd4bgtq0",
  authDomain: "caredose-6b966.firebaseapp.com",
  projectId: "caredose-6b966",
  storageBucket: "caredose-6b966.firebasestorage.app",
  messagingSenderId: "773546090775",
  appId: "1:773546090775:web:acd360e9197b378ede5752",
  measurementId: "G-YK6X2BMHC7"
};

// Simple check - only initialize if no apps exist
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);