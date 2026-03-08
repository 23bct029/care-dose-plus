// src/lib/firebase-patcher.ts
// This MUST be imported FIRST in your main.tsx

// Override the Firebase initializeApp function to prevent duplicate with wrong config
if (typeof window !== 'undefined') {
  // Store the original function
  const originalInitializeApp = (window as any).firebase?.initializeApp;
  
  // Create a global flag
  (window as any).__CAREDOSE_FIREBASE_LOCK = false;
  
  // Patch firebase if it exists in window
  Object.defineProperty(window, 'firebase', {
    get() {
      return this._firebase;
    },
    set(value) {
      if (value?.initializeApp) {
        const original = value.initializeApp;
        value.initializeApp = function(config: any, ...args: any[]) {
          // Check if this is the wrong config
          if (config?.apiKey === 'AIzaSyB_kIu68jqQO9l9K7kmRMWWvGXw5Z7vxTs') {
            console.warn('🚫 Blocked initialization of wrong Firebase config:', config.apiKey);
            // Return a dummy app or try to return the existing one
            try {
              return (window as any).firebase?.app() || original.apply(this, [{
                apiKey: "AIzaSyDnokm6rJx8OQXuYxPHpUBzVjmCd4bgtq0",
                // ... use correct config
              }, ...args]);
            } catch {
              return null;
            }
          }
          return original.apply(this, [config, ...args]);
        };
      }
      this._firebase = value;
    },
    configurable: true
  });
}

export {};