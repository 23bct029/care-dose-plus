import './lib/firebase-patcher';
import './lib/firebase';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerSW } from './lib/offline';

registerSW();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
