// src/types/window.d.ts
export {};

declare global {
  interface Window {
    __FIREBASE_INITIALIZED__?: boolean;
    __CAREDOSE_FIREBASE_LOCK?: boolean;
    firebase?: any;
    _firebase?: any;
  }
}