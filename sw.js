/**
 * sw.js - Service Worker
 * オフライン対応のためのキャッシュ戦略
 */

const CACHE_NAME = 'efc-v5';

// ベースパスを動的に検出
const BASE = new URL('./', self.location.href).pathname;

const CORE_ASSETS = [
  './',
  './index.html',
  './css/base.css',
  './css/layout.css',
  './css/flashcard.css',
  './css/components.css',
  './js/app.js',
  './js/flashcard.js',
  './js/session.js',
  './js/srs.js',
  './js/vocab.js',
  './js/store.js',
  './js/stats.js',
  './js/ui.js',
  './js/gestures.js',
  './data/categories.json',
  './data/vocab-level1.json',
  './data/vocab-level2.json',
  './manifest.json',
];

// ─── Install ──────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 同一オリジンの GET リクエストのみ
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;

  // 語彙 JSON は Cache First
  if (url.pathname.includes('/data/vocab-')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      }).catch(() => new Response('[]', { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  // その他: Network First → Cache Fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached =>
          cached || new Response('オフラインです。', { status: 503 })
        )
      )
  );
});
