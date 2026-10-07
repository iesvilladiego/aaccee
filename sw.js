const CACHE_NAME = 'ace-villadiego-v2.25';

// Versión de la app derivada del nombre de la caché (p. ej. 'v25')
const APP_VERSION = (CACHE_NAME.match(/v[\w.]+$/i) || ['desconocida'])[0];

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:wght@600;700&display=swap',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.log('Error de cache:', err))
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => cacheName !== CACHE_NAME && cacheName.startsWith('ace-villadiego-'))
          .map(cacheName => caches.delete(cacheName))
      );
    })
  );
  self.clients.claim().then(() => broadcastVersion());
});

// ==================== VERSIÓN DE LA APP ====================
// Responde a las peticiones GET_VERSION de la página (chip de versión)
self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'GET_VERSION') return;

  const payload = { type: 'VERSION', version: APP_VERSION, cache: CACHE_NAME };

  // Responder por el MessageChannel del solicitante si existe
  if (event.ports && event.ports[0]) {
    try { event.ports[0].postMessage(payload); } catch (err) { /* port cerrado */ }
  } else if (event.source) {
    try { event.source.postMessage(payload); } catch (err) { /* source no disponible */ }
  }
});

// Notifica la versión a todas las ventanas abiertas (se llama al activarse un SW nuevo)
function broadcastVersion() {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then(clients => {
      clients.forEach(client => {
        try {
          client.postMessage({ type: 'VERSION', version: APP_VERSION, cache: CACHE_NAME });
        } catch (err) { /* cliente no disponible */ }
      });
    })
    .catch(err => console.log('Error difundiendo versión:', err));
}

// Fetch event - Network first, fallback to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip GitHub API calls (they need fresh data)
  if (event.request.url.includes('api.github.com')) return;
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone the response
        const responseClone = response.clone();
        
        // Cache successful responses
        if (response.status === 200) {
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, responseClone));
        }
        
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request)
          .then(response => {
            if (response) return response;
            
            // Return offline page for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// Background sync for GitHub backups
self.addEventListener('sync', event => {
  if (event.tag === 'sync-backups') {
    event.waitUntil(syncBackups());
  }
});

async function syncBackups() {
  // This would sync pending changes when back online
  console.log('Background sync triggered');
}