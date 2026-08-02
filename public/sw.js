// Service worker (PWA). Estratégia "network-first": sempre tenta pegar a versão
// mais NOVA pela internet e, se estiver offline, cai no que estiver salvo.
// Isso garante que atualizações do app cheguem aos usuários sem ficar preso em cache.
const CACHE = 'villa-real-v2';
const ESSENCIAIS = ['manifest.json', 'icon.svg', 'icon.png', 'logo.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) {
    // Dados: sempre rede (nunca cacheia agendamentos)
    e.respondWith(fetch(e.request));
    return;
  }
  // Arquivos do app: rede primeiro, com o cache como reserva pra funcionar offline
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copia = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
