// src/main.tsx
import './lib/firebase-patcher'; // MUST be first!
import './lib/firebase';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

console.log('🔥 Main.tsx loaded');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);