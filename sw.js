const CACHE_NAME = 'ace-villadiego-v2.26';
// Rutas RELATIVAS al propio sw.js: la app puede desplegarse en cualquier
// subcarpeta (p. ej. iesvilladiego.github.io/<app>/ o su fork) sin invadir
// el ámbito del portal ni cachear páginas ajenas.
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:wght@600;700&display=swap',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Almacena en caché evitando el error de Cache.put/cache.add con respuestas
// redirigidas (p. ej. cdn.tailwindcss.com responde 302 antes de servir el JS)
async function ponerEnCache(cache, peticion, respuesta) {
  try {
    if (respuesta.type === 'opaqueredirect') return;
    const limpia = respuesta.redirected
      ? new Response(await respuesta.blob(), { headers: respuesta.headers })
      : respuesta;
    await cache.put(peticion, limpia);
  } catch (err) { /* respuesta no almacenable: se ignora sin romper la instalación */ }
}

// Install event: caché recurso a recurso (un fallo puntual no cancela el resto,
// a diferencia de cache.addAll, que es todo-o-nada)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return Promise.all(urlsToCache.map(async url => {
          try {
            await cache.add(url);
          } catch (err) {
            // Reintento manual: sigue la redirección y almacena respuesta "limpia"
            try {
              const resp = await fetch(url);
              if (resp.ok) await ponerEnCache(cache, url, resp);
            } catch (e2) { /* sin conexión con ese recurso */ }
          }
        }));
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
    }).then(() =>
      // Limpia entradas antiguas con ruta absoluta (SW anteriores cachearon la
      // raíz del portal) para que no queden restos ajenos en la caché de la app
      caches.open(CACHE_NAME).then(cache => Promise.all([
        cache.delete('/'),
        cache.delete('/index.html'),
        cache.delete('/manifest.json')
      ]))
    )
  );
  self.clients.claim();
});

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
            .then(cache => ponerEnCache(cache, event.request, responseClone));
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
              return caches.match('./index.html');
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