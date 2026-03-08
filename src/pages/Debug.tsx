// src/pages/Debug.tsx
import React, { useEffect } from 'react';
import { getApps, getApp } from 'firebase/app';

// Add this type assertion at the top of the file
declare global {
  interface Window {
    __FIREBASE_INITIALIZED__?: boolean;
  }
}

export const Debug = () => {
  useEffect(() => {
    console.log('=== FIREBASE DEBUG INFO ===');
    console.log('Apps count:', getApps().length);
    console.log('Apps:', getApps().map(app => ({
      name: app.name,
      projectId: app.options.projectId,
      apiKey: app.options.apiKey?.substring(0, 10) + '...'
    })));
    
    try {
      const app = getApp();
      console.log('Default app config:', {
        projectId: app.options.projectId,
        apiKey: app.options.apiKey?.substring(0, 10) + '...'
      });
    } catch (e) {
      console.log('No default app found');
    }
    
    // Use type assertion here
    console.log('Window initialized flag:', (window as any).__FIREBASE_INITIALIZED__);
    console.log('=========================');
  }, []);
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Firebase Debug</h1>
      <p>Check the console for Firebase initialization info.</p>
      <button 
        onClick={() => window.location.reload()}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Reload Page
      </button>
    </div>
  );
};