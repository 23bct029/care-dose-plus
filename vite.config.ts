import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Increase warning limit to 1000kB (optional)
    chunkSizeWarningLimit: 1000,
    
    // Manual chunk splitting for better performance
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor libraries into separate chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
          'ui-vendor': ['lucide-react', 'react-day-picker', 'clsx', 'tailwind-merge'],
        },
      },
    },
  },
});