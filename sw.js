/* İş Takibi — çevrimdışı açılış için uygulama dosyalarını saklar. Önce ağ (güncellemeler hemen gelsin), ağ yoksa saklanan. */
const ONBELLEK = 'is-takip-v3';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(adlar => Promise.all(adlar.filter(a => a !== ONBELLEK).map(a => caches.delete(a))))
    .then(() => self.clients.claim())
    // eski sürümle açık kalmış sayfaları yeni sürümle yeniden yükle
    .then(() => self.clients.matchAll({ type: 'window' })).then(l => Promise.all(l.map(c => c.navigate(c.url).catch(() => {}))))));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;     // Supabase istekleri saklanmaz
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(y => {          // tarayıcı önbelleğini atla, her açılışta sunucuya sor
    const kopya = y.clone();
    caches.open(ONBELLEK).then(c => c.put(e.request, kopya));
    return y;
  }).catch(() => caches.match(e.request).then(y => y || caches.match('./index.html'))));
});
