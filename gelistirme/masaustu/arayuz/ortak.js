'use strict';
/* Ortak yardımcılar — Zemin Etüt Rapor Stüdyosu uygulama.js'ten AYNEN alındı (satır 4-126).
   Ana uygulamaya eklerken bu dosya KULLANILMAZ; oradaki uygulama.js zaten bunları içeriyor. */

// ------------------------------------------------------------------ ikonlar
const IKON = {
  klasor: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  bina: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/>',
  sablon: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  ayar: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  arti: '<path d="M12 5v14M5 12h14"/>',
  geri: '<path d="M15 18l-6-6 6-6"/>',
  yukle: '<path d="M12 16V4M7 9l5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>',
  sil: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  carpi: '<path d="M6 6l12 12M18 6L6 18"/>',
  tamam: '<path d="M5 12l5 5 9-10"/>',
  uyari: '<path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  bilgi: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  oynat: '<path d="M7 5v14l11-7z"/>',
  simsek: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  ac: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  yenile: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  resim: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  kamera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  belge: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>',
  katman: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  kalem: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  durdur: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  kaydet: '<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 3v5h7M8 21v-7h8v7"/>',
  cetvel: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  indir: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  kisi: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
};
function ikon(ad) { return `<i data-i="${ad}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${IKON[ad] || ''}</svg></i>`; }
function ikonlariDoldur(kok = document) {
  kok.querySelectorAll('i[data-i]:empty').forEach(el => { el.outerHTML = ikon(el.dataset.i); });
}

// ------------------------------------------------------------------ yardımcı
const $ = (s, k = document) => k.querySelector(s);
const $$ = (s, k = document) => [...k.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icerik = () => $('#icerik');

async function api(yontem, yol, govde) {
  const ayar = { method: yontem, headers: {} };
  if (govde !== undefined) { ayar.headers['Content-Type'] = 'application/json'; ayar.body = JSON.stringify(govde); }
  const r = await fetch('/api/' + yol, ayar);
  const veri = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(veri.hata || ('Hata ' + r.status)); e.veri = veri; throw e; }
  return veri;
}
async function yukle(yol, dosya) {
  const r = await fetch('/api/' + yol, { method: 'POST', body: dosya });
  const veri = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(veri.hata || 'Yüklenemedi');
  return veri;
}
function bildir(mesaj, tur = 'basari') {
  const el = document.createElement('div');
  el.className = 'bildirim ' + tur;
  el.innerHTML = ikon(tur === 'hata' ? 'uyari' : 'tamam') + `<div>${esc(mesaj)}</div>`;
  $('#bildirimler').appendChild(el);
  setTimeout(() => el.remove(), tur === 'hata' ? 7000 : 3500);
}
function hataGoster(e) { console.error(e); bildir(e.message || String(e), 'hata'); }
function boyut(b) { return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB'; }
function uzanti(ad) { return (ad.split('.').pop() || '').toLowerCase(); }
function tarihYaz(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' +
    d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
function onayla(baslik, metin, dugme = 'Tamam', tehlike = false) {
  return new Promise(coz => {
    const p = $('#perde');
    p.innerHTML = `<div class="pencere"><h3>${esc(baslik)}</h3><p>${metin}</p>
      <div class="dugmeler"><button class="dugme hayalet" data-c="0">Vazgeç</button>
      <button class="dugme ${tehlike ? 'tehlike' : 'ana'}" data-c="1">${esc(dugme)}</button></div></div>`;
    p.classList.remove('gizli');
    p.onclick = e => { const c = e.target.dataset.c; if (c !== undefined || e.target === p) { p.classList.add('gizli'); coz(c === '1'); } };
  });
}
function sor(baslik, etiket, varsayilan = '') {
  return new Promise(coz => {
    const p = $('#perde');
    p.innerHTML = `<div class="pencere"><h3>${esc(baslik)}</h3>
      <div class="alan"><label>${esc(etiket)}</label><input class="girdi" id="sorGirdi" value="${esc(varsayilan)}"></div>
      <div class="dugmeler"><button class="dugme hayalet" data-c="0">Vazgeç</button><button class="dugme ana" data-c="1">Devam</button></div></div>`;
    p.classList.remove('gizli');
    const g = $('#sorGirdi'); g.focus(); g.select();
    const bitir = ok => { p.classList.add('gizli'); coz(ok ? g.value.trim() : null); };
    g.onkeydown = e => { if (e.key === 'Enter') bitir(true); if (e.key === 'Escape') bitir(false); };
    p.onclick = e => { const c = e.target.dataset.c; if (c !== undefined || e.target === p) bitir(c === '1'); };
  });
}
function resimGoster(src) {
  const p = $('#perde');
  p.innerHTML = `<div class="pencere genis"><img src="${src}"></div>`;
  p.classList.remove('gizli');
  p.onclick = () => p.classList.add('gizli');
}
function dosyaSec(coklu = true, kabul = '') {
  return new Promise(coz => {
    const g = document.createElement('input');
    g.type = 'file'; g.multiple = coklu; if (kabul) g.accept = kabul;
    g.onchange = () => coz([...g.files]);
    g.click();
  });
}
function birakmaAlani(el, isle) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('uzerinde'); });
  el.addEventListener('dragleave', () => el.classList.remove('uzerinde'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('uzerinde'); isle([...e.dataTransfer.files]); });
}


// ------------------------------------------------------------------ tek başına çalışma (uygulama.js'teki git() karşılığı)
const D = { durum: null, firmalar: null };
function sayfaYaz(html) { icerik().innerHTML = `<div class="sayfa">${html}</div>`; ikonlariDoldur(icerik()); icerik().scrollTop = 0; }

async function git() {
  const h = location.hash.replace(/^#\/?/, '') || 'isler';
  const [sayfa, ...rest] = h.split('/').map(decodeURIComponent);
  $$('.menu a').forEach(a => a.classList.toggle('etkin', a.dataset.sayfa === (sayfa === 'is' ? 'isler' : sayfa) + (sayfa === 'isler' && ['rapor', 'aktar'].includes(rest[0]) ? '/' + rest[0] : '')));
  try {
    if (!D.durum) D.durum = await api('GET', 'durum');
    if (await isTakipYonlendir(sayfa, rest)) return;
    if (sayfa === 'sistem') return sistemSayfasi();
    location.hash = '#/isler';
  } catch (e) { hataGoster(e); }
}
// ------------------------------------------------------------------ sistem (Rapor Stüdyosu'ndaki Sistem sayfasının karşılığı)
async function sistemSayfasi() {
  const durum = D.durum = await api('GET', 'durum');
  const farkli = durum.kurulu_surum !== durum.surum;
  sayfaYaz(`<div class="ust"><div><h1>Sistem</h1><div class="alt">Açık olan sürüm ${esc(durum.surum)} · kurulu sürüm ${esc(durum.kurulu_surum)}</div></div></div>
    <div class="yigin">
    ${farkli ? `<div class="kutu uyari">${ikon('uyari')}<div><b>Güncelleme kurulmuş ama uygulama yeniden başlatılmamış.</b>
      Pencereyi kapatıp İş Takibi'ni yeniden açın. Açık olan: ${esc(durum.surum)}, kurulu: ${esc(durum.kurulu_surum)}.</div></div>` : ''}
    <div class="kart"><div class="kart-bas"><h2>Güncelleme yükle</h2><span class="aciklama">Size gönderilen güncelleme zip'ini buraya bırakın</span></div>
      <div class="kart-ic yigin"><div class="birak kucuk" id="guncelBirak">${ikon('yukle')}<b>Güncelleme zip'ini sürükleyin ya da tıklayıp seçin</b>
        Dosyalar yerine konur, eskileri veri klasöründeki "yedek" klasörüne alınır. Kayıtlı işlere dokunulmaz. Sonra uygulamayı kapatıp yeniden açın.</div>
        <div id="guncelSonuc"></div></div></div>
    <div class="kart"><div class="kart-bas"><h2>Veri klasörü</h2></div><div class="kart-ic" style="display:flex;gap:12px;align-items:center">
      <code style="flex:1;background:var(--cizgi2);padding:8px 10px;border-radius:7px">${esc(durum.veri_klasoru)}</code>
      <button class="dugme" id="veriAc">${ikon('klasor')}Aç</button></div>
      <div class="kart-ic soluk kucuk-yazi" style="padding-top:0">İşler (isler.json) ve günlük yedekler burada durur. Yedeklemek için bu klasörü kopyalamanız yeterli.</div></div>
    <div class="kart"><div class="kart-bas"><h2>Program klasörü</h2></div><div class="kart-ic"><code>${esc(durum.klasor)}</code></div></div></div>`);
  $('#veriAc').onclick = () => api('POST', 'veri_ac').catch(hataGoster);
  const gb = $('#guncelBirak');
  const kur = async ([dosya]) => {
    if (!dosya) return;
    if (!/\.zip$/i.test(dosya.name)) return bildir('Güncelleme bir .zip dosyası olmalı', 'hata');
    try {
      const r = await yukle('guncelle', dosya);
      $('#guncelSonuc').innerHTML = (r.hatali && r.hatali.length ? `<div class="kutu uyari">${ikon('uyari')}<div><b>${r.hatali.length} dosya yazılamadı</b> (antivirüs ya da klasör izni olabilir): ${r.hatali.map(esc).join(', ')}</div></div>` : '') +
        `<div class="kutu basari">${ikon('tamam')}<div><b>${r.dosyalar} dosya güncellendi (sürüm ${esc(r.surum)}).</b>
        <b>Şimdi pencereyi kapatıp İş Takibi'ni yeniden açın.</b>
        <div class="soluk kucuk-yazi">Kurulduğu klasör: ${esc(r.klasor)}</div>
        <details style="margin-top:4px"><summary style="cursor:pointer">Dosyalar</summary><ul>${r.liste.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details></div></div>`;
      ikonlariDoldur($('#guncelSonuc'));
      kenarYaz();
    } catch (e) { hataGoster(e); }
  };
  gb.onclick = async () => kur(await dosyaSec(false, '.zip'));
  birakmaAlani(gb, kur);
}

window.addEventListener('hashchange', async () => { await isTakipAyrilirken(); git(); });
window.addEventListener('DOMContentLoaded', () => { ikonlariDoldur(); git(); });
