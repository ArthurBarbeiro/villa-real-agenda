// Service worker simples: cache dos arquivos estáticos para instalar como app.
// As chamadas de API (/api/...) sempre vão à rede (dados sempre atualizados).
const CACHE = 'barbearia-agenda-v1';
const ARQUIVOS = ['.', 'index.html', 'styles.css', 'app.js', 'manifest.json', 'icon.svg', 'icon.png', 'logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) {
    // Dados: sempre rede
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ erro: 'Sem conexão' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  // Estáticos: cache primeiro
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
