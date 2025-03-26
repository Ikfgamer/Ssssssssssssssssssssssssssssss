
// Tournament Hub Service Worker
const CACHE_NAME = 'tournament-hub-v4'; // Updated version number for new Firebase project
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/admin.css',
  '/admin.js',
  '/admin.html',
  '/manifest.json',
  '/offline.html',
  '/offline.css'
];

// Install event - cache the essential files
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Cache installation failed:', error);
      })
  );
});

// Fetch event - use network-first approach with fallback to cache
self.addEventListener('fetch', event => {
  // Special handling for Firebase requests
  if (event.request.url.includes('firestore.googleapis.com') ||
      event.request.url.includes('firebase') ||
      event.request.url.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(JSON.stringify({
            error: 'offline',
            message: 'No internet connection'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // Don't try to handle non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    // Try network first
    fetch(event.request)
      .then(response => {
        // If we got a valid response, return it
        if (response && response.status === 200 && response.type === 'basic') {
          // Clone the response since we need to use it twice
          const responseToCache = response.clone();
          
          // Update the cache with the fresh version
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try the cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // Check if this is a navigation request
            if (event.request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
            
            // For images/assets, return a default
            if (event.request.url.match(/\.(jpg|jpeg|png|gif|svg)$/)) {
              return caches.match('/generated-icon.png');
            }
            
            // Return a 404 for other assets
            return new Response('Not found', {
              status: 404,
              statusText: 'Not found'
            });
          });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Immediately claim clients so the page doesn't need to be refreshed
      return self.clients.claim();
    })
  );
});

// Handle messages from clients
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
