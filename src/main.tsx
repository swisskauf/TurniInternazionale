import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Auto-unregister outdated service workers & clear caches to resolve browser caching
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    let unregisteredAny = false;
    for (const registration of registrations) {
      registration.unregister().then((success) => {
        if (success) {
          console.log('Successfully unregistered stale service worker.');
          unregisteredAny = true;
        }
      });
    }
    if (unregisteredAny && window.caches) {
      caches.keys().then((keys) => {
        Promise.all(keys.map(key => caches.delete(key))).then(() => {
          window.location.reload();
        });
      });
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
