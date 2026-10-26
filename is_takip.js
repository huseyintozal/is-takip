'use strict';
/* Zemin Etüt Rapor Stüdyosu — İş takibi ("İşler" bölümü)
 *
 * Kullandığı ortak yardımcılar (uygulama.js içinde zaten var):
 *   IKON, ikon, ikonlariDoldur, $, $$, esc, api, bildir, hataGoster, onayla, tarihYaz, dosyaSec, birakmaAlani, sayfaYaz, D
 * Ana uygulamaya eklerken:
 *   - index.html: <link rel="stylesheet" href="is_takip.css"> ve uygulama.js'ten SONRA <script src="is_takip.js">
 *   - git() içinde:  if (await isTakipYonlendir(sayfa, rest)) return;
 *   - hashchange içinde: await isTakipAyrilirken();
 *   - menü: <a href="#/isler" data-sayfa="isler"><i data-i="liste"></i>İşler</a>
 */

Object.assign(IKON, {
  liste: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  mesaj: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/>',
  kopyala: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
  ara: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  saat: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  deney: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
  musteri: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  el: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5V4a1.5 1.5 0 0 1 3 0v8M14 11.5V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 4 16.5L2.8 13a1.5 1.5 0 0 1 2.7-1.2L8 15"/>',
});

// ------------------------------------------------------------------ istemci kancaları
/* Bulut (web) sürümü window.ISTEMCI ile şunları değiştirir; masaüstü / Rapor Stüdyosu'nda tanımsızdır:
 *   iceAktar(dosya, guncelle, sayfa) -> {toplam, eklenen, guncellenen, ayni}
 *   csvIndir(isveren)   aktarSayfasiSonra()   kenarEk() -> html */
const istemci = () => window.ISTEMCI || {};
const saltOkunur = () => !!(D.durum && D.durum.salt_okunur);

// ------------------------------------------------------------------ durum
const IT = { isler: null, projeler: null, firmalar: null, form: null, degisti: false, kopyalar: [] };
const DURUM_ALANLARI = ['mimari', 'evrak', 'zemin_degeri', 'geo', 'sondaj', 'sondaja_atildi', 'laba_atildi', 'lab', 'riskli_rapor', 'rapor_yazildi', 'imza_cd', 'lab_taramasi'];
/* Tamamlanan işin (lab sonucu geldikten sonra) kapanış adımları, bu sırayla */
const BITIS_ALANLARI = ['rapor_yazildi', 'imza_cd', 'lab_taramasi'];
const ALAN = {
  mimari:       { ad: 'Mimari',       kisa: 'Mimari', soru: 'Mimari proje geldi mi?',               e: 'Var',     h: 'Yok', ornek: '3.20 İNECEK' },
  evrak:        { ad: 'Evrak',        kisa: 'Evrak',  soru: 'Evraklar geldi mi?',                   e: 'Var',     h: 'Yok', ornek: 'TAPU EKSİK' },
  zemin_degeri: { ad: 'Zemin değeri', kisa: 'Z.D.',   soru: 'Müşteriye zemin değeri verildi mi?',   e: 'Verildi', h: 'Verilmedi', ornek: 'İYİLEŞTİRME ÇIKABİLİR' },
  geo:          { ad: 'Geo',          kisa: 'Geo',    soru: 'Müşteriden geo geldi mi?',             e: 'Var',     h: 'Yok', ornek: 'GELECEK HAFTA' },
  bina_yikildi: { ad: 'Bina yıkıldı', kisa: 'Bina',   soru: 'Müşteri binanın yıkıldığını bildirdi mi?', ornek: 'YIKIM BAŞLADI' },
  sondaj:       { ad: 'Sondaj',       kisa: 'Sondaj', soru: 'Sondajcıya verildi mi, yapıldı mı?',   e: 'Yapıldı', h: 'Yapılmadı', ornek: 'ÖMERE ATILDI' },
  sondaja_atildi: { ad: 'Sondaja atıldı', kisa: 'Sondaja', soru: '',                                 e: 'Atıldı',  h: 'Atılmadı' },
  laba_atildi:  { ad: 'Laba atıldı',  kisa: 'Laba',   soru: 'Numuneler laboratuvara gönderildi mi?', e: 'Atıldı',  h: 'Atılmadı', ornek: 'NİHAT ABİ' },
  lab:          { ad: 'Lab sonucu',   kisa: 'Lab',    soru: 'Laboratuvar sonuçları geldi mi?',      e: 'Geldi',   h: 'Gelmedi', ornek: 'PAZARTESİ GELİR' },
  riskli_rapor: { ad: 'Riskli rapor', kisa: 'Riskli', soru: 'Bilgi amaçlı, iş akışını etkilemez',  e: 'Var',     h: 'Yok', ornek: '(ZC BİZ ZD)' },
  rapor_yazildi: { ad: 'Rapor yazıldı', kisa: 'Rapor',  soru: 'Lab sonucundan sonra rapor yazıldı mı?', e: 'Yazıldı', h: 'Yazılmadı', ornek: 'KONTROLDE' },
  imza_cd:       { ad: 'İmza-CD',       kisa: 'İmza-CD', soru: 'İmzalar atıldı, CD hazırlandı mı?',  e: 'Tamam',   h: 'Bekliyor',  ornek: 'MÜH. İMZASI EKSİK' },
  lab_taramasi:  { ad: 'Lab taraması',  kisa: 'Tarama', soru: 'Lab föyleri tarandı mı?',             e: 'Tarandı', h: 'Taranmadı', ornek: '' },
};
const KIMDE = {
  musteri: { ad: 'Müşteriden bekleniyor', renk: 'sari',    ikon: 'musteri' },
  biz:     { ad: 'Bizde',                 renk: 'turuncu', ikon: 'el' },
  sondaj:  { ad: 'Sondajda',              renk: '',        ikon: 'saat' },
  lab:     { ad: 'Laboratuvarda',         renk: 'vurgu',   ikon: 'deney' },
  tamam:   { ad: 'Tamamlandı',            renk: 'yesil',   ikon: 'tamam' },
};

/* Sondaj yapıldıysa (ya da sondajcıya verildiyse) bina yıkılmış demektir */
const binaSondajdan = i => !!(i.sondaj || i.sondaja_atildi);
const binaYikik = i => i.bina_yikildi === 'evet' || binaSondajdan(i);

/* "Bütün durumlar" listesindeki aşama süzgeçleri */
const SUZGECLER = {
  geo:     { ad: 'Yalnızca geo bekleyenler',  f: (i, d) => !d.zdIcin && d.istenen.join() === 'geo' },
  bina:    { ad: 'Bina yıkımı bekleyenler',   f: (i, d) => !!d.soru },
  sondaja: { ad: 'Sondaja atılanlar',         f: (i, d) => d.sondajBekliyor },
  sondajyap: { ad: 'Sondaj yapılacaklar (bina yıkıldı)', f: (i, d) => d.biz.includes('sondaj') },
  me:      { ad: 'Mimari / evrak bekleyenler', f: (i, d) => d.zdIcin },
  zd:      { ad: 'Zemin değeri verilecekler', f: (i, d) => d.biz.includes('zd') },
  labat:   { ad: 'Laba atılacaklar',          f: (i, d) => d.biz.includes('lab_at') },
  // Tamamlananlar (lab sonucu gelmiş işler) içinde kapanış adımları
  rapor:   { grup: 'tamam', ad: 'Rapor yazılacaklar',       f: (i, d) => d.kimde[0] === 'tamam' && !i.rapor_yazildi },
  imza:    { grup: 'tamam', ad: 'İmza-CD bekleyenler',      f: (i, d) => d.kimde[0] === 'tamam' && !i.imza_cd },
  tarama:  { grup: 'tamam', ad: 'Lab taraması bekleyenler', f: (i, d) => d.kimde[0] === 'tamam' && !i.lab_taramasi },
  bitti:   { grup: 'tamam', ad: 'Tamamen bitenler',          f: (i, d) => d.bitti },
};

/* İş akışı:  mimari + evrak → zemin değeri (biz) → geo (müşteri) → bina yıkıldı (müşteri bildirir)
 *            → sondaj (biz) → laba atılır (biz) → lab sonucu (laboratuvar)
 * Kurallar (kullanıcının tarifi):
 *  1-3) Zemin değeri verildiyse: eksik olan mimari / evrak / geo müşteriden istenir.
 *  2)   Zemin değeri verilmedi, mimari + evrak var  → "zemin değeri verilmesi gerekiyor" (bizde, en sonda).
 *  4)   Zemin değeri verilmedi, mimari ya da evrak yok → "zemin değeri vermek için" eksikler istenir (geo henüz istenmez).
 *  5)   Zemin değeri verildi, sondaj yapılmadı → "sondaj için bina yıkıldı mı?" diye sorulur
 *       (müşteri yıkıldığını bildirdiyse soru yerine "sondaj yapılacak" bizde görünür).
 *  6)   Sondaj yapıldı, laba atılmadı → "laba atılmadı" (bizde). Atıldı, sonuç gelmedi → "lab bekliyor" (laboratuvar). */
function isDurumu(i) {
  const d = { istenen: [], zdIcin: false, soru: '', biz: [], labBekliyor: false, sondajBekliyor: false, kimde: [] };
  // sondajcıya verildi (ÖMERE ATILDI, AYGÜN ABİYLE YAPILACAK…) ama sondaj henüz yapılmadı
  if (!i.sondaj && i.sondaja_atildi) d.sondajBekliyor = true;
  const eksikME = ['mimari', 'evrak'].filter(a => !i[a]);
  if (!i.zemin_degeri) {
    if (eksikME.length) { d.istenen = eksikME; d.zdIcin = true; }          // kural 4
    else d.biz.push('zd');                                                  // kural 2
  } else {
    d.istenen = [...eksikME, ...(i.geo ? [] : ['geo'])];                     // kural 1, 3
  }
  // kural 5: sondajı yapılmamış ve yıkıldığı bilinmeyen HER bina için ayrıca sorulur
  // (zemin değeri verilmemiş olsa da: bazen zemin değeri için sondaj bekleniyor)
  if (!i.sondaj && !d.sondajBekliyor) {
    if (i.bina_yikildi === 'evet') d.biz.push('sondaj');
    else d.soru = 'sondaj için bina yıkıldı mı?';
  }
  if (i.sondaj) {
    if (!i.laba_atildi) d.biz.push('lab_at');                               // kural 6
    else if (!i.lab) d.labBekliyor = true;
  }
  if (d.istenen.length || d.soru) d.kimde.push('musteri');
  if (d.biz.length) d.kimde.push('biz');
  if (d.sondajBekliyor) d.kimde.push('sondaj');
  if (d.labBekliyor) d.kimde.push('lab');
  if (!d.kimde.length) d.kimde.push('tamam');
  d.bitisEksik = d.kimde[0] === 'tamam' ? BITIS_ALANLARI.filter(a => !i[a]) : [];
  d.bitti = d.kimde[0] === 'tamam' && !d.bitisEksik.length;
  d.asama = asama(i, d);
  return d;
}
function bekleniyor(liste) {          // ['mimari'] -> "Mimari bekleniyor", ['evrak','geo'] -> "Evrak ve geo bekleniyor"
  const a = liste.map(x => ISTENEN_AD[x]);
  const metin = a.length > 1 ? a.slice(0, -1).join(', ') + ' ve ' + a[a.length - 1] : a[0];
  return metin.charAt(0).toLocaleUpperCase('tr') + metin.slice(1) + ' bekleniyor';
}
function asama(i, d) {
  const A = (sira, ad, kimde) => ({ sira, ad, kimde, renk: KIMDE[kimde].renk });
  if (d.kimde[0] === 'tamam') {
    if (d.bitti) return A(9.9, 'Tamamlandı', 'tamam');
    const ilk = d.bitisEksik[0];
    return A(9 + BITIS_ALANLARI.indexOf(ilk) / 10, { rapor_yazildi: 'Rapor yazılacak', imza_cd: 'İmza-CD bekliyor', lab_taramasi: 'Lab taraması bekliyor' }[ilk], 'tamam');
  }
  if (!i.zemin_degeri) {
    if (d.zdIcin) return A(1, bekleniyor(d.istenen), 'musteri');
    if (d.biz.includes('sondaj')) return A(5, 'Sondaj yapılacak', 'biz');
    if (d.sondajBekliyor) return A(5.5, 'Sondaja atıldı', 'sondaj');
    return A(2, 'Zemin değeri verilecek', 'biz');
  }
  if (!i.sondaj) {
    if (d.sondajBekliyor) return A(5.5, 'Sondaja atıldı', 'sondaj');
    if (i.bina_yikildi === 'evet') return A(5, 'Sondaj yapılacak', 'biz');
    if (d.istenen.length) return A(3, bekleniyor(d.istenen), 'musteri');
    return A(4, 'Bina yıkımı bekleniyor', 'musteri');
  }
  if (!i.laba_atildi) return A(6, 'Laba atılacak', 'biz');
  if (!i.lab) return A(7, 'Lab bekleniyor', 'lab');
  return A(8, bekleniyor(d.istenen), 'musteri');
}

// ------------------------------------------------------------------ metinler
function adaParsel(i) {
  if (i.ada && i.parsel) return `${i.ada}/${i.parsel}`;
  if (i.parsel) return `${i.parsel} parsel`;
  return i.ada ? `${i.ada} ada` : 'ada/parsel yok';
}
function kimlik(i) {
  const ad = i.mal_sahibi || (i.mahalle ? `${i.mahalle} MAH.` : 'MAL SAHİBİ YOK');
  return `${ad} (${adaParsel(i)})`;
}
const ISTENEN_AD = { mimari: 'mimari', evrak: 'evrak', geo: 'geo' };
/* Bir işin bütün mesaj satırları. tur: musteri | biz | lab ; grup rapordaki başlığı belirler. */
function isMesajlari(i, d = isDurumu(i)) {
  const k = kimlik(i), m = [];
  const ist = `istenen (${d.istenen.map(a => ISTENEN_AD[a]).join(', ')})`;
  if (d.zdIcin) m.push({ tur: 'musteri', grup: 'zd', metin: `${k} ${ist}` });
  else if (d.istenen.length) m.push({ tur: 'musteri', grup: 'belge', metin: `${k} ${ist}` });
  // bina sorusu ayrı satır; raporda kendi başlığı altında yalnızca mal sahibi (ada/parsel) yazılır
  if (d.soru) m.push({ tur: 'musteri', grup: 'soru', metin: `${k} ${d.soru}`, rapor: k });
  if (d.biz.includes('zd')) m.push({ tur: 'biz', grup: 'zd', metin: `${k} zemin değeri verilmesi gerekiyor` });
  if (d.biz.includes('sondaj')) m.push({ tur: 'biz', grup: 'sondaj', metin: `${k} bina yıkıldı, sondaj yapılacak` });
  if (d.biz.includes('lab_at')) m.push({ tur: 'biz', grup: 'lab_at', metin: `${k} laba atılmadı` });
  if (d.sondajBekliyor) {
    const n = (i.alan_notlari || {}).sondaj;
    m.push({ tur: 'sondaj', grup: 'sondaj', metin: `${k} sondaj bekliyor${n ? ` (${n})` : ''}` });
  }
  if (d.labBekliyor) m.push({ tur: 'lab', grup: 'lab', metin: `${k} lab bekliyor` });
  return m;
}
const GRUP_BASLIK = {
  musteri: { zd: 'Zemin değeri vermek için istenenler', belge: 'İstenen belgeler', soru: 'Sondaj için bina yıkıldı mı?' },
  biz: { zd: 'Zemin değeri verilecek', sondaj: 'Sondaj yapılacak', lab_at: 'Laba atılacak' },
  sondaj: { sondaj: 'Sondaj sonucu beklenenler' },
  lab: { lab: 'Lab sonucu beklenenler' },
};
const bugun = () => new Date().toLocaleDateString('tr-TR');
const trSirala = (a, b) => a.localeCompare(b, 'tr');

// ------------------------------------------------------------------ yardımcılar
function katla(s) {          // arama için: büyük harf, Türkçe karakter farkını yok say
  return String(s || '').toLocaleUpperCase('tr').replace(/[ÇĞİIÖŞÜ]/g, c => ({ Ç: 'C', Ğ: 'G', İ: 'I', I: 'I', Ö: 'O', Ş: 'S', Ü: 'U' }[c]));
}
function depoOku(ad, vars) { try { const v = localStorage.getItem('isTakip.' + ad); return v === null ? vars : JSON.parse(v); } catch (e) { return vars; } }
function depoYaz(ad, v) { try { localStorage.setItem('isTakip.' + ad, JSON.stringify(v)); } catch (e) { /* önemsiz */ } }
async function kopyala(metin, mesaj = 'Kopyalandı') {
  try { await navigator.clipboard.writeText(metin); }
  catch (e) {
    const t = document.createElement('textarea');
    t.value = metin; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
  }
  bildir(mesaj);
}
function kopyaDugmesi(metin, sinif = 'kopya', yazi = '') {
  IT.kopyalar.push(metin);
  return `<button class="${sinif}" data-kopya="${IT.kopyalar.length - 1}" title="Kopyala">${ikon('kopyala')}${yazi}</button>`;
}
function kopyaBagla() {
  icerik().onclick = e => {
    const b = e.target.closest('[data-kopya]');
    if (b) { e.stopPropagation(); kopyala(IT.kopyalar[+b.dataset.kopya]); }
  };
}
async function islerYukle(zorla = false) {
  if (!IT.isler || zorla) {
    IT.isler = (await api('GET', 'is_takip/isler')).isler || [];
    kenarYaz();
  }
  return IT.isler;
}
function kenarYaz() {
  if (!D.durum || !D.durum.tek_basina || !$('#kenarFirma') || !IT.isler) return;
  const n = isverenler().length;
  $('#kenarFirma').innerHTML = `<b>${IT.isler.length} iş</b>${n} işveren${istemci().kenarEk ? istemci().kenarEk() : ''}<div style="margin-top:8px;opacity:.7">Sürüm ${esc(D.durum.surum)}</div>`;
}
/* İşveren adı nasıl yazıldıysa öyle saklanır ("Bıyıklı", "BIYIKLI "); gruplama bu anahtarla yapılır. */
const ik = s => String(s || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr');
function isverenAdi(anahtar) {         // en çok kullanılan yazılışı
  const say = {};
  (IT.isler || []).filter(i => ik(i.isveren) === anahtar).forEach(i => { const a = i.isveren.trim(); say[a] = (say[a] || 0) + 1; });
  return Object.entries(say).sort((a, b) => b[1] - a[1])[0]?.[0] || anahtar;
}
const isverenler = () => [...new Set(IT.isler.map(i => ik(i.isveren)))].sort(trSirala);
const isHash = i => `#/is/${encodeURIComponent(i.id)}`;

// ------------------------------------------------------------------ yönlendirme
async function isTakipYonlendir(sayfa, rest) {
  if (sayfa === 'isler') {
    if (rest[0] === 'rapor') { await raporSayfasi(ik(rest[1])); return true; }
    if (rest[0] === 'aktar') { await aktarSayfasi(); return true; }
    await islerSayfasi(ik(rest[0])); return true;
  }
  if (sayfa === 'is') { await isSayfasi(rest[0] || 'yeni', rest[1] || ''); return true; }
  return false;
}
async function isTakipAyrilirken() {           // kaydedilmemiş iş formu kaybolmasın
  hucreMenusuKapat();
  if (IT.form && IT.degisti && IT.form.isveren) {
    try { await isKaydet(true); } catch (e) { /* hata bildirildi */ }
  }
  IT.form = null; IT.degisti = false;
}

// ================================================================== işler listesi
function suzgec() {
  return Object.assign({ kimde: '', ara: '', gizle: true, sira: 'isveren' }, depoOku('suzgec', {}));
}
async function islerSayfasi(isveren) {
  await islerYukle(true);
  IT.kopyalar = [];
  const s = suzgec();
  const tum = IT.isler;
  const kapsam = isveren ? tum.filter(i => ik(i.isveren) === isveren) : tum;
  const say = { musteri: 0, biz: 0, sondaj: 0, lab: 0, tamam: 0 };
  const fSay = {};
  kapsam.forEach(i => { const d = isDurumu(i); Object.entries(SUZGECLER).forEach(([k, v]) => { if (v.f(i, d)) fSay[k] = (fSay[k] || 0) + 1; }); });
  kapsam.forEach(i => isDurumu(i).kimde.forEach(k => say[k]++));
  const iSay = {}; tum.forEach(i => { iSay[ik(i.isveren)] = (iSay[ik(i.isveren)] || 0) + 1; });

  sayfaYaz(`
    <div class="ust"><div><h1>${isveren ? esc(isverenAdi(isveren)) : 'İşler'}</h1>
      <div class="alt">${isveren ? `${kapsam.length} iş` : `${tum.length} iş · ${isverenler().length} işveren`}</div></div>
      <div class="bosluk"></div>
      <button class="dugme" id="isAraDugme" title="Ctrl+K">${ikon('ara')}İş ara</button>
      <a class="dugme" href="#/isler/rapor/${encodeURIComponent(isveren)}">${ikon('mesaj')}${isveren ? 'Rapor al' : 'Bütün işverenlerin raporu'}</a>
      ${saltOkunur() ? '' : `<a class="dugme ana" href="#/is/yeni/${encodeURIComponent(isveren)}">${ikon('arti')}Yeni iş</a>`}</div>
    <div class="ozet-kutular">
      ${Object.entries(KIMDE).map(([k, v]) => `<button class="kart ozet-kutu ${s.kimde === k ? 'secili' : ''}" data-kimde="${k}">
        <div class="simge ${v.renk}">${ikon(v.ikon)}</div><div><div class="sayi">${say[k]}</div><div class="baslik">${v.ad}</div></div></button>`).join('')}
    </div>
    <div class="cipler">
      <button class="cip ${!isveren ? 'secili' : ''}" data-isveren="">Tümü <b>${tum.length}</b></button>
      ${isverenler().map(a => `<button class="cip ${a === isveren ? 'secili' : ''}" data-isveren="${esc(a)}">${esc(isverenAdi(a))} <b>${iSay[a]}</b></button>`).join('')}
    </div>
    <div class="kart">
      <div class="suzgec-satiri yapiskan" id="suzgecSatiri">
        <div class="ara">${ikon('ara')}<input class="girdi" id="ara" placeholder="Mal sahibi, mahalle, ada, parsel ya da not ara" value="${esc(s.ara)}"></div>
        <select class="girdi" id="kimde"><option value="">Bütün durumlar</option>
          <optgroup label="Kimde bekliyor">${Object.entries(KIMDE).map(([k, v]) => `<option value="${k}" ${s.kimde === k ? 'selected' : ''}>${v.ad} (${say[k]})</option>`).join('')}</optgroup>
          <optgroup label="Aşama">${Object.entries(SUZGECLER).filter(([, v]) => !v.grup).map(([k, v]) => `<option value="${k}" ${s.kimde === k ? 'selected' : ''}>${v.ad} (${fSay[k] || 0})</option>`).join('')}</optgroup>
          <optgroup label="Tamamlananlar">${Object.entries(SUZGECLER).filter(([, v]) => v.grup === 'tamam').map(([k, v]) => `<option value="${k}" ${s.kimde === k ? 'selected' : ''}>${v.ad} (${fSay[k] || 0})</option>`).join('')}</optgroup></select>
        <select class="girdi" id="sira">
          ${[['isveren', 'İşverene göre'], ['asama', 'İş akışı aşamasına göre'], ['guncel', 'Son güncellenen üstte'], ['ada', 'Ada / parsele göre']]
            .map(([k, v]) => `<option value="${k}" ${s.sira === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <label class="secim"><input type="checkbox" id="gizle" ${s.gizle ? 'checked' : ''}> Tamamlananları gizle</label>
      </div>
      <div id="tablo"></div>
    </div>`);
  kopyaBagla();
  // aşağı kaydırınca süzgeç satırı ve sütun başlıkları (Mimari, Evrak…) üstte kalsın
  const ss = $('#suzgecSatiri');
  const tabloKutu = $('#tablo');
  const ustAyarla = () => tabloKutu.style.setProperty('--baslik-ust', ss.offsetHeight + 'px');
  ustAyarla();
  if (window.ResizeObserver) new ResizeObserver(ustAyarla).observe(ss);
  $('#isAraDugme').onclick = isAra;
  const yenile = () => tabloCiz(isveren);
  const kaydetS = deg => { depoYaz('suzgec', Object.assign(suzgec(), deg)); };
  $$('.cip').forEach(b => b.onclick = () => { location.hash = '#/isler' + (b.dataset.isveren ? '/' + encodeURIComponent(b.dataset.isveren) : ''); });
  $$('.ozet-kutu').forEach(b => b.onclick = () => {
    const k = suzgec().kimde === b.dataset.kimde ? '' : b.dataset.kimde;
    kaydetS({ kimde: k }); $('#kimde').value = k;
    $$('.ozet-kutu').forEach(x => x.classList.toggle('secili', x.dataset.kimde === k)); yenile();
  });
  $('#kimde').onchange = e => { kaydetS({ kimde: e.target.value }); $$('.ozet-kutu').forEach(x => x.classList.toggle('secili', x.dataset.kimde === e.target.value)); yenile(); };
  $('#sira').onchange = e => { kaydetS({ sira: e.target.value }); yenile(); };
  $('#gizle').onchange = e => { kaydetS({ gizle: e.target.checked }); yenile(); };
  $('#ara').oninput = e => { kaydetS({ ara: e.target.value }); yenile(); };
  yenile();
}

function hucre(i, alan, d) {
  const not = (i.alan_notlari || {})[alan];
  const ek = not ? ` notlu" data-not="${esc(not)}` : '';
  const notBaslik = not ? ` — ${esc(not)}` : '';
  if (alan === 'bina_yikildi') {
    if (binaSondajdan(i))
      return `<button class="dd var${ek}" data-dd="bina_yikildi" data-kilitli="1" title="Bina yıkılmış (${i.sondaj ? 'sondaj yapıldı' : 'sondaja atıldı'})${notBaslik}">${ikon('tamam')}</button>`;
    const v = i.bina_yikildi;
    const ilgili = !i.sondaj && !i.sondaja_atildi;
    const [sinif, ic] = v === 'evet' ? ['var', ikon('tamam')] : v === 'hayir' ? ['yok', ikon('carpi')] : [ilgili ? 'soru' : 'bos', ilgili ? '?' : '·'];
    return `<button class="dd ${sinif}${ek}" data-dd="bina_yikildi" title="Bina yıkıldı: ${v || 'bilinmiyor'}${notBaslik} (tıklayın)">${ic}</button>`;
  }
  if (alan === 'sondaj' && !i.sondaj && i.sondaja_atildi)
    return `<button class="dd atildi${ek}" data-dd="sondaj" title="Sondaja atıldı, sonucu bekleniyor${notBaslik} (tıklayın)">${ikon('saat')}</button>`;
  const beklenen = {          // eksikse kırmızı görünsün mü? (henüz sırası gelmeyen adım gri kalır)
    mimari: true, evrak: true, zemin_degeri: i.mimari && i.evrak, geo: i.zemin_degeri, sondaj: i.bina_yikildi === 'evet',
    laba_atildi: i.sondaj, lab: i.laba_atildi, riskli_rapor: false,
    rapor_yazildi: d.kimde[0] === 'tamam', imza_cd: d.kimde[0] === 'tamam', lab_taramasi: d.kimde[0] === 'tamam',
  }[alan];
  const bosHucre = !i[alan] && (i.bos_alanlar || []).includes(alan);     // Excel'de boş bırakılmış
  const sinif = i[alan] ? 'var' : beklenen && !bosHucre ? 'yok' : 'bos';
  const ic = i[alan] ? ikon('tamam') : beklenen && !bosHucre ? ikon('carpi') : '–';
  return `<button class="dd ${sinif}${ek}" data-dd="${alan}" title="${ALAN[alan].ad}: ${i[alan] ? ALAN[alan].e : bosHucre ? 'boş' : ALAN[alan].h}${notBaslik} (tıklayın)">${ic}</button>`;
}
function notSatirlari(i) {          // Excel'de hücreye yazılan yazılar, aynen
  const n = i.alan_notlari || {};
  const s = SUTUNLAR.filter(a => n[a]).map(a => `<div class="ms-not"><b>${esc(ALAN[a].ad)}:</b> ${esc(n[a])}</div>`);
  if (i.notlar) s.push(`<div class="ms-not"><b>Not:</b> ${esc(i.notlar)}</div>`);
  return s.join('');
}
const SONDAJ_DEGER = { yok: { sondaj: false, sondaja_atildi: false }, atildi: { sondaj: false, sondaja_atildi: true }, yapildi: { sondaj: true, sondaja_atildi: false } };
const SONDAJ_YAZI = { yok: 'Yapılmadı', atildi: 'Sondaja atıldı', yapildi: 'Yapıldı' };
const SUTUNLAR = ['mimari', 'evrak', 'zemin_degeri', 'geo', 'bina_yikildi', 'sondaj', 'laba_atildi', 'lab', 'riskli_rapor', 'rapor_yazildi', 'imza_cd', 'lab_taramasi'];

function tabloCiz(isveren) {
  const s = suzgec();
  const q = katla(s.ara.trim());
  let liste = IT.isler.filter(i => !isveren || ik(i.isveren) === isveren).map(i => ({ i, d: isDurumu(i) }));
  if (SUZGECLER[s.kimde]) liste = liste.filter(x => SUZGECLER[s.kimde].f(x.i, x.d));
  else if (KIMDE[s.kimde]) liste = liste.filter(x => x.d.kimde.includes(s.kimde));
  else if (s.gizle) liste = liste.filter(x => !x.d.bitti);          // rapor/imza/tarama bekleyenler görünmeye devam eder
  if (q) liste = liste.filter(({ i }) => katla([i.mal_sahibi, i.mahalle, i.ada, i.parsel, `${i.ada}/${i.parsel}`, i.isveren, i.notlar, ...Object.values(i.alan_notlari || {})].join(' ')).includes(q));
  const ap = i => [parseInt(i.ada) || 0, parseInt(i.parsel) || 0];
  const sira = {
    isveren: (a, b) => trSirala(ik(a.i.isveren), ik(b.i.isveren)) || a.d.asama.sira - b.d.asama.sira || trSirala(a.i.mal_sahibi || '~', b.i.mal_sahibi || '~'),
    asama: (a, b) => a.d.asama.sira - b.d.asama.sira || trSirala(ik(a.i.isveren), ik(b.i.isveren)),
    guncel: (a, b) => (b.i.guncelleme || '').localeCompare(a.i.guncelleme || ''),
    ada: (a, b) => ap(a.i)[0] - ap(b.i)[0] || ap(a.i)[1] - ap(b.i)[1],
  }[s.sira] || (() => 0);
  liste.sort(sira);
  const kutu = $('#tablo');
  if (!liste.length) {
    kutu.innerHTML = `<div class="tablo-bos">${IT.isler.length ? 'Bu süzgece uyan iş yok.' : 'Henüz iş yok. <a href="#/is/yeni">Yeni iş ekleyin</a> ya da <a href="#/isler/aktar">Excel\'den aktarın</a>.'}</div>`;
    return;
  }
  kutu.innerHTML = `<table class="veri isler"><thead><tr>
      <th>Mal sahibi</th><th>Ada/Parsel</th>${isveren ? '' : '<th>İşveren</th>'}
      ${SUTUNLAR.map(a => `<th class="o" title="${esc(ALAN[a].ad)}">${esc(ALAN[a].kisa)}</th>`).join('')}
      <th>Durum</th></tr></thead><tbody>
    ${liste.map(({ i, d }) => {
      const m = isMesajlari(i, d);
      return `<tr data-id="${esc(i.id)}" class="${d.bitti ? 'tamam' : ''}">
        <td class="h-ms"><div class="ms">${esc(i.mal_sahibi || '—')}</div><div class="ms-alt">${esc(i.mahalle || '')}${istemci().dosyaRozeti ? istemci().dosyaRozeti(i) : ''}</div>${notSatirlari(i)}</td>
        <td class="h-ap" style="white-space:nowrap">${esc(adaParsel(i))}</td>
        ${isveren ? '' : `<td class="kucuk-yazi h-isv">${esc(i.isveren)}</td>`}
        ${SUTUNLAR.map(a => `<td class="o" data-k="${esc(ALAN[a].kisa)}">${hucre(i, a, d)}</td>`).join('')}
        <td class="h-durum"><span class="etiket ${d.asama.renk}">${esc(d.asama.ad)}</span>
          ${m.length > 1 ? `<div class="sonraki">${m.length} bekleyen adım</div>` : ''}</td></tr>`;
    }).join('')}</tbody></table>`;
  ikonlariDoldur(kutu);
  $$('tr[data-id]', kutu).forEach(tr => tr.onclick = async e => {
    const b = e.target.closest('[data-dd]');
    const is_ = IT.isler.find(x => x.id === tr.dataset.id);
    if (!b) { location.hash = isHash(is_); return; }
    e.stopPropagation();
    hucreMenusu(b, is_, b.dataset.dd, isveren);
  });
}

/* Tablodaki durum hücresine tıklayınca açılan küçük pencere: durumu seç, not yaz, Kaydet. */
function hucreMenusuKapat() {
  const m = $('#hucreMenu'); if (m) m.remove();
  document.removeEventListener('mousedown', hucreMenusuDis, true);
  icerik().removeEventListener('scroll', hucreMenusuKapat);
}
function hucreMenusuDis(e) { if (!e.target.closest('#hucreMenu')) hucreMenusuKapat(); }
function hucreSecenekleri(i, alan) {
  if (alan === 'bina_yikildi') return { simdi: i.bina_yikildi || '', liste: [['evet', 'Yıkıldı', 'var', 'tamam'], ['hayir', 'Yıkılmadı', 'yok'], ['', 'Bilinmiyor', 'soru']],
    govde: v => ({ bina_yikildi: v }) };
  if (alan === 'sondaj') return { simdi: i.sondaj ? 'yapildi' : i.sondaja_atildi ? 'atildi' : 'yok',
    liste: [['yapildi', 'Yapıldı', 'var', 'tamam'], ['atildi', 'Sondaja atıldı', 'soru', 'saat'], ['yok', 'Yapılmadı', 'yok']], govde: v => SONDAJ_DEGER[v] };
  return { simdi: i[alan] ? 'e' : 'h', liste: [['e', ALAN[alan].e, 'var', 'tamam'], ['h', ALAN[alan].h, 'yok']], govde: v => ({ [alan]: v === 'e' }) };
}
function hucreMenusu(btn, is_, alan, isveren) {
  hucreMenusuKapat();
  if (saltOkunur()) { bildir('Yalnızca görüntüleme yetkiniz var'); return; }
  const t = ALAN[alan];
  const kilitli = alan === 'bina_yikildi' && binaSondajdan(is_);
  const sc = hucreSecenekleri(is_, alan);
  const bos = alan !== 'bina_yikildi' && (is_.bos_alanlar || []).includes(alan) && sc.simdi !== 'yapildi' && sc.simdi !== 'atildi' && sc.simdi !== 'e';
  let secili = bos ? null : sc.simdi;
  const eskiNot = (is_.alan_notlari || {})[alan] || '';
  const m = document.createElement('div');
  m.id = 'hucreMenu'; m.className = 'hucre-menu';
  m.innerHTML = `<div class="hm-bas"><b>${esc(t.ad)}</b><span>${esc(kimlik(is_))}</span></div>
    ${kilitli ? `<div class="kucuk-yazi soluk" style="margin-bottom:8px">Bina yıkılmış sayılıyor (${is_.sondaj ? 'sondaj yapıldı' : 'sondaja atıldı'}).</div>`
      : `<div class="secenekler hm-sec">${sc.liste.map(([v, yazi, sinif, ik]) => `<button data-v="${v}" class="${sinif} ${secili === v ? 'secili' : ''}">${ik ? ikon(ik) : ''}${esc(yazi)}</button>`).join('')}</div>`}
    <label class="hm-etiket">Not</label>
    <input class="girdi" id="hmNot" value="${esc(eskiNot)}" placeholder="Örn. ${esc(t.ornek || 'İYİLEŞTİRME ÇIKABİLİR')}">
    <div class="hm-dugmeler"><button class="dugme kucuk hayalet" id="hmVazgec">Vazgeç</button>
      <a class="dugme kucuk hayalet" href="${isHash(is_)}">İşi aç</a>
      <button class="dugme kucuk ana" id="hmKaydet">${ikon('kaydet')}Kaydet</button></div>`;
  document.body.appendChild(m);
  // konum: hücrenin altına, ekrana sığacak şekilde
  const r = btn.getBoundingClientRect();
  const g = m.offsetWidth, y = m.offsetHeight;
  let sol = Math.min(Math.max(8, r.left + r.width / 2 - g / 2), window.innerWidth - g - 8);
  let ust = r.bottom + 6;
  if (ust + y > window.innerHeight - 8) ust = Math.max(8, r.top - y - 6);
  m.style.left = sol + 'px'; m.style.top = ust + 'px';
  $$('.hm-sec button', m).forEach(x => x.onclick = () => {
    secili = x.dataset.v;
    $$('.hm-sec button', m).forEach(y2 => y2.classList.toggle('secili', y2 === x));
  });
  const kaydet = async () => {
    const yeniNot = $('#hmNot', m).value.trim();
    const govde = {};
    if (!kilitli && secili !== null && (secili !== sc.simdi || bos)) {
      Object.assign(govde, sc.govde(secili));
      if (alan !== 'bina_yikildi') govde.bos_alanlar = (is_.bos_alanlar || []).filter(x => x !== alan);
    }
    if (yeniNot !== eskiNot) govde.alan_notlari = Object.assign({}, is_.alan_notlari, { [alan]: yeniNot });
    hucreMenusuKapat();
    if (!Object.keys(govde).length) return;
    try {
      const yanit = await api('PUT', `is_takip/isler/${encodeURIComponent(is_.id)}`, govde);
      Object.assign(is_, yanit);
      tabloCiz(isveren);
      const secYazi = secili !== null ? (sc.liste.find(x => x[0] === secili) || [])[1] : '';
      bildir(`${is_.mal_sahibi || adaParsel(is_)}: ${t.ad}${govde.bos_alanlar || govde.bina_yikildi !== undefined || govde.sondaj !== undefined ? ' → ' + secYazi : ''}${govde.alan_notlari ? (yeniNot ? ' · not kaydedildi' : ' · not silindi') : ''}`);
    } catch (err) { hataGoster(err); }
  };
  $('#hmKaydet', m).onclick = kaydet;
  $('#hmVazgec', m).onclick = hucreMenusuKapat;
  $('a', m).onclick = hucreMenusuKapat;
  m.onkeydown = e => { if (e.key === 'Enter') kaydet(); if (e.key === 'Escape') hucreMenusuKapat(); };
  setTimeout(() => { document.addEventListener('mousedown', hucreMenusuDis, true); icerik().addEventListener('scroll', hucreMenusuKapat); }, 0);
  (kilitli ? $('#hmNot', m) : $('.hm-sec button.secili', m) || $('.hm-sec button', m)).focus();
}

// ================================================================== iş ara (her yerden: menü, düğme, Ctrl+K)
function aramaMetni(i) {
  return katla([i.mal_sahibi, i.mahalle, i.isveren, i.ada, i.parsel, `${i.ada}/${i.parsel}`, `${i.ada} ${i.parsel}`,
    i.notlar, ...Object.values(i.alan_notlari || {})].join(' | '));
}
function isAraSonuclari(q) {
  const parcalar = katla(q).split(/\s+/).filter(Boolean);
  if (!parcalar.length) return [];
  const qk = katla(q.trim());
  return IT.isler.filter(i => { const m = aramaMetni(i); return parcalar.every(p => m.includes(p)); })
    .map(i => {
      const ap = katla(`${i.ada}/${i.parsel}`), ms = katla(i.mal_sahibi);
      const puan = ap === qk || katla(i.parsel) === qk || katla(i.ada) === qk ? 0 : ms.startsWith(qk) ? 1 : ms.includes(qk) ? 2 : 3;
      return { i, puan };
    })
    .sort((a, b) => a.puan - b.puan || trSirala(a.i.mal_sahibi || '~', b.i.mal_sahibi || '~'))
    .slice(0, 60).map(x => x.i);
}
async function isAra() {
  hucreMenusuKapat();
  try { await islerYukle(); } catch (e) { return hataGoster(e); }
  const p = $('#perde');
  p.innerHTML = `<div class="pencere ara-pencere">
    <div class="ara-girdi">${ikon('ara')}<input class="girdi" id="isAraGirdi" type="search" name="is_arama" enterkeyhint="search" placeholder="Mal sahibi, ada/parsel (örn. 2163/10), mahalle, işveren ya da not" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></div>
    <div class="ara-sonuc" id="isAraSonuc"><div class="ara-bos">Yazmaya başlayın. ${IT.isler.length} iş içinde, süzgeçlerden bağımsız aranır.</div></div>
    <div class="ara-alt"><span>↑ ↓ seç · Enter aç · Esc kapat</span></div></div>`;
  ikonlariDoldur(p);
  p.classList.remove('gizli');
  const g = $('#isAraGirdi'), kutu = $('#isAraSonuc');
  let liste = [], secili = 0;
  const kapat = () => { p.classList.add('gizli'); p.innerHTML = ''; };
  const ac = i => { kapat(); location.hash = isHash(i); };
  const ciz = () => {
    const q = g.value.trim();
    liste = isAraSonuclari(q); secili = 0;
    if (!q) { kutu.innerHTML = `<div class="ara-bos">Yazmaya başlayın. ${IT.isler.length} iş içinde, süzgeçlerden bağımsız aranır.</div>`; return; }
    if (!liste.length) { kutu.innerHTML = `<div class="ara-bos">"${esc(q)}" ile eşleşen iş yok.</div>`; return; }
    kutu.innerHTML = liste.map((i, n) => {
      const d = isDurumu(i);
      return `<div class="ara-satir ${n === 0 ? 'secili' : ''}" data-n="${n}">
        <div class="ara-ad"><b>${esc(i.mal_sahibi || '—')}</b><span>${esc([i.mahalle, isverenAdi(ik(i.isveren))].filter(Boolean).join(' · '))}</span></div>
        <div class="ara-ap">${esc(adaParsel(i))}</div>
        <span class="etiket ${d.asama.renk}">${esc(d.asama.ad)}</span></div>`;
    }).join('') + (liste.length === 60 ? '<div class="ara-bos">İlk 60 sonuç gösteriliyor, aramayı daraltın.</div>' : '');
    $$('.ara-satir', kutu).forEach(r => {
      r.onclick = () => ac(liste[+r.dataset.n]);
      r.onmousemove = () => sec(+r.dataset.n, false);
    });
  };
  const sec = (n, kaydir = true) => {
    if (!liste.length) return;
    secili = (n + liste.length) % liste.length;
    $$('.ara-satir', kutu).forEach(r => r.classList.toggle('secili', +r.dataset.n === secili));
    if (kaydir) { const r = $(`.ara-satir[data-n="${secili}"]`, kutu); if (r) r.scrollIntoView({ block: 'nearest' }); }
  };
  g.oninput = ciz;
  g.onkeydown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sec(secili + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sec(secili - 1); }
    else if (e.key === 'Enter' && liste[secili]) ac(liste[secili]);
    else if (e.key === 'Escape') kapat();
  };
  p.onclick = e => { if (e.target === p) kapat(); };
  g.focus();
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && ['k', 'f'].includes(e.key.toLowerCase()) && !IT.form) { e.preventDefault(); isAra(); }
});
document.addEventListener('click', e => {
  const a = e.target.closest('[data-is-ara]');
  if (a) { e.preventDefault(); isAra(); }
});

// ================================================================== iş sayfası (yeni / düzenle)
async function yanVerileri() {
  if (IT.projeler === null) { try { IT.projeler = (await api('GET', 'projeler')).projeler || []; } catch (e) { IT.projeler = []; } }
  if (IT.firmalar === null) { try { IT.firmalar = (await api('GET', 'firmalar')).firmalar || []; } catch (e) { IT.firmalar = []; } }
}
async function isSayfasi(iid, onIsveren) {
  await islerYukle();
  await yanVerileri();
  const yeni = iid === 'yeni';
  let kayit;
  if (yeni) {
    kayit = { id: '', isveren: onIsveren ? isverenAdi(onIsveren) : '', alan_notlari: {}, mahalle: '', mal_sahibi: '', ada: '', parsel: '', notlar: '', proje_id: '', firma_id: '', bina_yikildi: '', gecmis: [] };
    if (IT.firmalar.length === 1) kayit.firma_id = IT.firmalar[0].id;
    DURUM_ALANLARI.forEach(a => { kayit[a] = false; });
  } else {
    kayit = await api('GET', `is_takip/isler/${encodeURIComponent(iid)}`);
  }
  IT.form = JSON.parse(JSON.stringify(kayit)); IT.degisti = false; IT.kopyalar = [];
  const f = IT.form;
  const dl = (id, liste) => `<datalist id="${id}">${liste.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
  const mahalleler = [...new Set(IT.isler.map(i => i.mahalle).filter(Boolean))].sort(trSirala);
  const projeAlani = IT.projeler.length
    ? `<select class="girdi" data-a="proje_id"><option value="">— Bağlı değil —</option>
        ${IT.projeler.map(p => `<option value="${esc(p.id)}" ${p.id === f.proje_id ? 'selected' : ''}>${esc(p.ad)}</option>`).join('')}
        ${f.proje_id && !IT.projeler.some(p => p.id === f.proje_id) ? `<option value="${esc(f.proje_id)}" selected>${esc(f.proje_id)} (bulunamadı)</option>` : ''}</select>`
    : `<input class="girdi" data-a="proje_id" value="${esc(f.proje_id)}" placeholder="Proje klasör adı">`;
  const firmaAlani = IT.firmalar.length
    ? `<select class="girdi" data-a="firma_id"><option value="">—</option>
        ${IT.firmalar.map(x => `<option value="${esc(x.id)}" ${x.id === f.firma_id ? 'selected' : ''}>${esc(x.ad)}</option>`).join('')}</select>`
    : `<input class="girdi" data-a="firma_id" value="${esc(f.firma_id)}" placeholder="Firma klasör adı">`;
  const studyo = D.durum && !D.durum.tek_basina;

  sayfaYaz(`
    <div class="ust"><button class="geri" id="geri" title="Geri">${ikon('geri')}</button>
      <div><h1 id="baslik"></h1><div class="alt" id="altBaslik"></div></div>
      <div class="bosluk"></div>
      ${!yeni ? `<button class="dugme hayalet tehlike" id="sil">${ikon('sil')}Sil</button>` : ''}
      ${studyo && f.proje_id ? `<a class="dugme hayalet" href="#/proje/${encodeURIComponent(f.proje_id)}/belgeler">${ikon('klasor')}Projeyi aç</a>` : ''}
      ${studyo && !f.proje_id && !yeni ? `<button class="dugme hayalet" id="projeAc">${ikon('klasor')}Proje aç</button>` : ''}
      ${yeni ? `<button class="dugme" id="kaydetYeni">${ikon('arti')}Kaydet ve yeni ekle</button>` : ''}
      <button class="dugme ana" id="kaydet">${ikon('kaydet')}Kaydet</button></div>
    <div class="adimlar salt" id="adimCubugu"></div>
    <div class="is-duzen">
      <div class="yigin">
        <div class="kart"><div class="kart-bas"><h2>İş bilgileri</h2></div>
          <div class="kart-ic"><div class="form-izgara">
            <div class="alan"><label>İşveren</label><input class="girdi" data-a="isveren" list="dlIsveren" value="${esc(f.isveren)}" placeholder="Örn. BIYIKLI">
              <div class="ipucu">Listeden seçin ya da yeni işveren adı yazın</div></div>
            <div class="alan"><label>Mahalle</label><input class="girdi" data-a="mahalle" list="dlMahalle" value="${esc(f.mahalle)}"></div>
            <div class="alan genis"><label>Mal sahibi</label><input class="girdi" data-a="mal_sahibi" value="${esc(f.mal_sahibi)}"></div>
            <div class="alan"><label>Ada</label><input class="girdi" data-a="ada" value="${esc(f.ada)}"></div>
            <div class="alan"><label>Parsel</label><input class="girdi" data-a="parsel" value="${esc(f.parsel)}"></div>
            <div class="alan"><label>Rapor Stüdyosu projesi</label>${projeAlani}<div class="ipucu">proje_id: Rapor Stüdyosu'ndaki proje</div></div>
            <div class="alan"><label>Raporu hazırlayan firma</label>${firmaAlani}<div class="ipucu">firma_id</div></div>
            <div class="alan genis"><label>Notlar</label><textarea class="girdi" data-a="notlar" rows="2">${esc(f.notlar)}</textarea></div>
          </div>${dl('dlIsveren', isverenler().map(isverenAdi))}${dl('dlMahalle', mahalleler)}</div></div>
        <div class="kart"><div class="kart-bas"><h2>İş akışı</h2><span class="aciklama">Mimari ve evrak → zemin değeri → geo → bina yıkımı → sondaj → lab</span></div>
          <div id="durumlar"></div></div>
      </div>
      <div class="yan yigin">
        <div class="kart"><div class="kart-bas"><h2>Sonraki adım</h2><div class="bosluk" style="flex:1"></div><span id="asamaEtiket"></span></div>
          <div class="kart-ic" id="sonraki"></div></div>
        ${!yeni ? `<div class="kart"><div class="kart-bas"><h2>Geçmiş</h2></div><div class="kart-ic" id="gecmisKutu">${gecmisHtml(kayit)}</div></div>` : ''}
      </div>
    </div>`);
  kopyaBagla();
  if (!yeni) { const ak = $('#durumlar').closest('.kart'); ak.parentNode.prepend(ak); }   // kayıtlı işte önce iş akışı
  durumlariCiz();
  ozetCiz();
  if (istemci().isSayfasiSonra) istemci().isSayfasiSonra(kayit, yeni);      // bulutta: dosyalar kartı
  $$('[data-a]').forEach(g => {
    g.oninput = g.onchange = () => { if (IT.form !== f) return; f[g.dataset.a] = g.value; IT.degisti = true; ozetCiz(); };
  });
  $('#geri').onclick = () => { history.length > 1 ? history.back() : (location.hash = '#/isler'); };
  if (saltOkunur()) {             // yalnızca görüntüleme yetkisi: düzenleme denetimleri kapalı
    ['#kaydet', '#kaydetYeni', '#sil', '#projeAc'].forEach(x => { const b = $(x); if (b) b.remove(); });
    $$('.sayfa input, .sayfa textarea, .sayfa select, #durumlar button').forEach(x => { x.disabled = true; });
    IT.form = null;
    return;
  }
  $('#kaydet').onclick = () => isKaydet();
  if ($('#kaydetYeni')) $('#kaydetYeni').onclick = () => isKaydet(false, true);
  if ($('#sil')) $('#sil').onclick = async () => {
    if (!await onayla('İş silinsin mi?', `<b>${esc(kimlik(f))}</b> kaydı silinecek. Bu işlem geri alınamaz.`, 'Sil', true)) return;
    try {
      await api('DELETE', `is_takip/isler/${encodeURIComponent(f.id)}`);
      IT.form = null; IT.isler = null; bildir('İş silindi');
      location.hash = '#/isler/' + encodeURIComponent(ik(f.isveren));
    } catch (e) { hataGoster(e); }
  };
  if ($('#projeAc')) $('#projeAc').onclick = projeAc;
  document.onkeydown = e => { if (IT.form && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); isKaydet(); } };
  if (yeni) $('[data-a="' + (f.isveren ? 'mahalle' : 'isveren') + '"]').focus();
}

function durumlariCiz() {
  const f = IT.form;
  const bos = a => !f[a] && (f.bos_alanlar || []).includes(a);       // Excel'de boş: hiçbiri seçili görünmez
  const sec = (a, deger, yazi, sinif, ik) => `<button data-s="${a}" data-v="${deger}" class="${sinif} ${String(f[a]) === String(deger) && !bos(a) ? 'secili' : ''}">${ik ? ikon(ik) : ''}${yazi}</button>`;
  const satir = a => {
    const t = ALAN[a];
    const sd = f.sondaj ? 'yapildi' : f.sondaja_atildi ? 'atildi' : 'yok';
    const sSec = (deger, yazi, sinif, ik) => `<button data-sondaj="${deger}" class="${sinif} ${sd === deger && !bos('sondaj') ? 'secili' : ''}">${ik ? ikon(ik) : ''}${yazi}</button>`;
    const secenek = a === 'bina_yikildi' && binaSondajdan(f)
      ? `<button class="var secili" disabled title="${f.sondaj ? 'Sondaj yapıldı' : 'Sondaja atıldı'}, bina yıkılmış">${ikon('tamam')}Yıkıldı (${f.sondaj ? 'sondaj yapıldı' : 'sondaja atıldı'})</button>`
      : a === 'bina_yikildi'
      ? sec(a, 'evet', 'Yıkıldı', 'var', 'tamam') + sec(a, 'hayir', 'Yıkılmadı', 'yok') + sec(a, '', 'Bilinmiyor', 'soru')
      : a === 'sondaj'
      ? sSec('yapildi', 'Yapıldı', 'var', 'tamam') + sSec('atildi', 'Sondaja atıldı', 'soru', 'saat') + sSec('yok', 'Yapılmadı', 'yok')
      : sec(a, 'true', t.e, 'var', 'tamam') + sec(a, 'false', t.h, 'yok');
    return `<div class="durum-satir"><div><b>${esc(t.ad)}</b><span>${esc(t.soru)}</span></div>
      <input class="girdi alan-not" data-not="${a}" value="${esc((f.alan_notlari || {})[a] || '')}" placeholder="Not yaz (örn. ${esc(t.ornek || 'İYİLEŞTİRME ÇIKABİLİR')})">
      <div class="secenekler">${secenek}</div></div>`;
  };
  $('#durumlar').innerHTML = ['mimari', 'evrak', 'zemin_degeri', 'geo', 'bina_yikildi', 'sondaj', 'laba_atildi', 'lab', 'riskli_rapor', ...BITIS_ALANLARI].map(satir).join('');
  ikonlariDoldur($('#durumlar'));
  $$('#durumlar [data-not]').forEach(g => g.oninput = () => {
    if (IT.form !== f) return;
    f.alan_notlari = Object.assign({}, f.alan_notlari, { [g.dataset.not]: g.value });
    IT.degisti = true;
  });
  $$('#durumlar [data-sondaj]').forEach(b => b.onclick = () => {
    Object.assign(f, SONDAJ_DEGER[b.dataset.sondaj]);
    f.bos_alanlar = (f.bos_alanlar || []).filter(x => x !== 'sondaj');
    IT.degisti = true; durumlariCiz(); ozetCiz();
  });
  $$('#durumlar [data-s]').forEach(b => b.onclick = () => {
    const a = b.dataset.s;
    f[a] = a === 'bina_yikildi' ? b.dataset.v : b.dataset.v === 'true';
    f.bos_alanlar = (f.bos_alanlar || []).filter(x => x !== a);
    IT.degisti = true; durumlariCiz(); ozetCiz();
  });
}

function adimCubugu(i) {
  const A = [
    ['Mimari ve evrak', 'Müşteriden', i.mimari && i.evrak],
    ['Zemin değeri', 'Bizden', i.zemin_degeri],
    ['Geo', 'Müşteriden', i.geo],
    ['Sondaj', i.sondaja_atildi && !i.sondaj ? 'Sondaja atıldı' : binaYikik(i) ? 'Bina yıkıldı' : 'Bina yıkılınca', i.sondaj],
    ['Lab', i.laba_atildi ? 'Laboratuvarda' : 'Laba gönderilir', i.laba_atildi && i.lab],
    ['Rapor ve teslim', BITIS_ALANLARI.filter(a => i[a]).length + '/3 · rapor, imza-CD, tarama', BITIS_ALANLARI.every(a => i[a])],
  ];
  const etkin = A.findIndex(x => !x[2]);
  return A.map(([ad, alt, tamam], n) => `<div class="adim ${tamam ? 'tamam' : ''} ${n === etkin ? 'etkin' : ''}">
    <span class="no">${tamam ? ikon('tamam').replace('<i ', '<i style="width:14px;height:14px" ') : n + 1}</span>
    <span>${esc(ad)}<span class="adim-alt">${esc(alt)}</span></span></div>`).join('');
}

function ozetCiz() {
  const f = IT.form;
  if (!f || !$('#sonraki')) return;
  const d = isDurumu(f);
  $('#baslik').textContent = f.mal_sahibi || (f.id ? adaParsel(f) : 'Yeni iş');
  $('#altBaslik').textContent = [f.isveren || 'İşveren seçilmedi', f.mahalle, (f.ada || f.parsel) ? adaParsel(f) : '',
    f.guncelleme ? tarihYaz(f.guncelleme) + ' güncellendi' : ''].filter(Boolean).join(' · ');
  $('#adimCubugu').innerHTML = adimCubugu(f);
  ikonlariDoldur($('#adimCubugu'));
  $('#asamaEtiket').innerHTML = `<span class="etiket ${d.asama.renk}">${esc(d.asama.ad)}</span>`;
  IT.kopyalar = [];
  const m = isMesajlari(f, d);
  const grup = (tur, baslik, ik) => {
    const s = m.filter(x => x.tur === tur);
    return s.length ? `<div class="mesaj-grup"><h4>${ikon(ik)}${baslik}</h4>
      ${s.map(x => `<div class="mesaj ${tur}"><div class="m">${esc(x.metin)}</div>${kopyaDugmesi(x.metin)}</div>`).join('')}</div>` : '';
  };
  $('#sonraki').innerHTML = m.length
    ? grup('musteri', 'Müşteriye yazılacak', 'musteri') + grup('sondaj', 'Sondajcıdan', 'saat') + grup('lab', 'Laboratuvardan', 'deney') + grup('biz', 'Bizde', 'el')
    : d.bitti ? `<div class="mesaj tamam"><div class="m">İş tamamen bitti: rapor yazıldı, imza-CD ve lab taraması tamam.</div></div>`
    : `<div class="mesaj-grup"><h4>${ikon('el')}Kapanış</h4>${d.bitisEksik.map(a => `<div class="mesaj biz"><div class="m">${esc(kimlik(f))} ${esc({ rapor_yazildi: 'rapor yazılacak', imza_cd: 'imza-CD bekliyor', lab_taramasi: 'lab taraması yapılacak' }[a])}</div></div>`).join('')}</div>`;
  ikonlariDoldur($('#sonraki'));
}

function gecmisHtml(i) {
  const g = (i.gecmis || []).slice().reverse();
  const zamanKim = x => {          // tarih, saat ve (bulutta) değiştiren kişi
    const z = new Date(x.zaman);
    return esc(z.toLocaleDateString('tr-TR') + ' ' + z.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })) +
      (x.kim ? `<br><span title="${esc(x.kim)}">${esc(x.kim.split('@')[0])}</span>` : '');
  };
  const satir = x => {
    const t = ALAN[x.alan] || { ad: x.alan, e: 'evet', h: 'hayır' };
    if ('not' in x) return `<li><span><b style="font-weight:580;color:var(--metin)">${esc(t.ad)} notu</b> → ${x.not ? esc(x.not) : '<i>silindi</i>'}</span><span class="z">${zamanKim(x)}</span></li>`;
    const deger = x.alan === 'bina_yikildi' ? ({ evet: 'yıkıldı', hayir: 'yıkılmadı' }[x.deger] || 'bilinmiyor') : (x.deger ? t.e : t.h).toLocaleLowerCase('tr');
    return `<li><span><b style="font-weight:580;color:var(--metin)">${esc(t.ad)}</b> → ${esc(deger)}</span><span class="z">${zamanKim(x)}</span></li>`;
  };
  return `<ul class="gecmis">${g.slice(0, 30).map(satir).join('')}
    <li><span>Kayıt açıldı${i.kaynak === 'excel' ? ' (Excel\'den aktarıldı)' : ''}</span><span class="z">${esc(i.olusturma ? new Date(i.olusturma).toLocaleDateString('tr-TR') : '')}</span></li></ul>`;
}

async function isKaydet(sessiz = false, yeniyeGec = false) {
  const f = IT.form;
  if (!f) return;
  if (!String(f.isveren || '').trim()) { bildir('İşveren adını yazın', 'hata'); $('[data-a="isveren"]').focus(); return; }
  if (!f.mal_sahibi && !f.parsel) { bildir('Mal sahibi ya da parsel girin', 'hata'); return; }
  const govde = {};
  ['proje_id', 'firma_id', 'isveren', 'mahalle', 'mal_sahibi', 'ada', 'parsel', 'notlar', 'bina_yikildi', 'alan_notlari', 'bos_alanlar', ...DURUM_ALANLARI].forEach(a => { govde[a] = f[a]; });
  try {
    const g = f.id ? await api('PUT', `is_takip/isler/${encodeURIComponent(f.id)}`, govde) : await api('POST', 'is_takip/isler', govde);
    IT.degisti = false; IT.isler = null;
    if (sessiz) return g;
    bildir(f.id ? 'Kaydedildi' : 'İş eklendi');
    if (yeniyeGec) {
      IT.form = null;
      await isSayfasi('yeni', ik(g.isveren));
      const ff = IT.form; ff.mahalle = g.mahalle; ff.firma_id = g.firma_id; $('[data-a="mahalle"]').value = g.mahalle;
      $('[data-a="mal_sahibi"]').focus();
      return g;
    }
    if (!f.id) { IT.form = null; location.hash = '#/isler/' + encodeURIComponent(ik(g.isveren)); return g; }
    Object.assign(f, g);
    ozetCiz();
    if ($('#gecmisKutu')) $('#gecmisKutu').innerHTML = gecmisHtml(f);
    return g;
  } catch (e) { hataGoster(e); throw e; }
}

async function projeAc() {            // yalnızca Rapor Stüdyosu içinde: iş için proje klasörü açar
  const f = IT.form;
  const ad = `${f.mal_sahibi || f.mahalle} ${f.ada ? f.ada + ' Ada ' : ''}${f.parsel ? f.parsel + ' Parsel' : ''}`.trim();
  if (!await onayla('Proje açılsın mı?', `Rapor Stüdyosu'nda <b>${esc(ad)}</b> adıyla proje açılacak ve bu işe bağlanacak.`, 'Proje aç')) return;
  try {
    const p = await api('POST', 'projeler', { ad, firma: f.firma_id || undefined });
    f.proje_id = p.id; IT.degisti = true; IT.projeler = null;
    await isKaydet(true);
    location.hash = `#/proje/${encodeURIComponent(p.id)}/belgeler`;
  } catch (e) { hataGoster(e); }
}

// ================================================================== işveren raporu
function raporMetinleri(isler, isveren, baslikli) {
  const sonuc = { musteri: [], lab: '', biz: '' };
  const tumu = isler.map(i => ({ i, m: isMesajlari(i) }));
  const bolumle = (tur, mesajlar, ekIsveren) => {
    const parca = [];
    Object.entries(GRUP_BASLIK[tur]).forEach(([g, baslik]) => {
      const s = mesajlar.filter(x => x.m.grup === g)
        .sort((a, b) => trSirala(ik(a.i.isveren), ik(b.i.isveren)) || trSirala(a.m.metin, b.m.metin))
        .map(x => `- ${x.m.rapor || x.m.metin}${ekIsveren ? ` – ${isverenAdi(ik(x.i.isveren))}` : ''}`);
      if (s.length) parca.push((tur === 'lab' || tur === 'sondaj' ? '' : baslik + (baslik.endsWith('?') ? '\n' : ':\n')) + s.join('\n'));
    });
    return parca.join('\n\n');
  };
  const duz = tur => tumu.flatMap(({ i, m }) => m.filter(x => x.tur === tur).map(x => ({ i, m: x })));
  // işverene gidecekler: her işveren ayrı
  const adlar = isveren ? [isveren] : [...new Set(isler.map(i => ik(i.isveren)))].sort(trSirala);
  adlar.forEach(a => {
    const ms = duz('musteri').filter(x => ik(x.i.isveren) === a);
    if (!ms.length) return;
    const govde = bolumle('musteri', ms, false);
    sonuc.musteri.push({ isveren: isverenAdi(a), sayi: ms.length, metin: (baslikli ? `${isverenAdi(a)} – ${bugun()}\n\n` : '') + govde });
  });
  const sondaj = duz('sondaj');
  if (sondaj.length) sonuc.sondaj = (baslikli ? `Sondaj sonucu beklenenler – ${bugun()}\n\n` : '') + bolumle('sondaj', sondaj, !isveren);
  sonuc.sondajSayi = sondaj.length;
  const lab = duz('lab');
  // laboratuvara doğrudan gönderilecek kısa liste: yalnızca "694 ADA 8 PARSEL"
  const sayi = v => parseInt(v) || 0;
  sonuc.labKisa = lab.map(x => x.i)
    .sort((a, b) => sayi(a.ada) - sayi(b.ada) || sayi(a.parsel) - sayi(b.parsel))
    .map(i => [i.ada && i.ada !== '-' ? `${i.ada} ADA` : '', i.parsel ? `${i.parsel} PARSEL` : ''].filter(Boolean).join(' '))
    .join('\n');
  if (lab.length) sonuc.lab = (baslikli ? `Lab sonucu beklenenler – ${bugun()}\n\n` : '') + bolumle('lab', lab, !isveren);
  const biz = duz('biz');
  if (biz.length) sonuc.biz = bolumle('biz', biz, !isveren);
  sonuc.labSayi = lab.length; sonuc.bizSayi = biz.length;
  return sonuc;
}

async function raporSayfasi(isveren) {
  await islerYukle(true);
  IT.kopyalar = [];
  const baslikli = depoOku('raporBaslik', true);
  const isler = isveren ? IT.isler.filter(i => ik(i.isveren) === isveren) : IT.isler;
  const r = raporMetinleri(isler, isveren, baslikli);
  const hepsi = [...r.musteri.map(x => x.metin), r.sondaj, r.lab, r.biz ? 'BİZDE:\n\n' + r.biz : ''].filter(Boolean).join('\n\n— — —\n\n');
  const bolumKart = (baslik, aciklama, metin, sinif = '') => `<div class="kart rapor-bolum">
      <div class="kart-bas"><div><h2>${baslik}</h2><div class="aciklama">${aciklama}</div></div><div class="bosluk"></div>
        ${kopyaDugmesi(metin, 'dugme kucuk' + (sinif ? ' ' + sinif : ''), 'Kopyala')}</div>
      <div class="kart-ic"><pre class="rapor-metin">${esc(metin)}</pre></div></div>`;
  const bos = !r.musteri.length && !r.lab && !r.biz && !r.sondaj;
  sayfaYaz(`
    <div class="ust">${isveren ? `<a class="geri" href="#/isler/${encodeURIComponent(isveren)}" title="İşlere dön">${ikon('geri')}</a>` : ''}
      <div><h1>${isveren ? esc(isverenAdi(isveren)) + ' raporu' : 'İşveren raporu'}</h1>
      <div class="alt">${isler.length} iş · ${bugun()} · müşteriye, laboratuvara ve kendinize gidecek listeler</div></div>
      <div class="bosluk"></div>
      <select class="girdi" id="raporIsveren" style="width:auto;min-width:200px"><option value="">Bütün işverenler</option>
        ${isverenler().map(a => `<option value="${esc(a)}" ${a === isveren ? 'selected' : ''}>${esc(isverenAdi(a))}</option>`).join('')}</select>
      ${!bos ? kopyaDugmesi(hepsi, 'dugme ana', 'Tümünü kopyala') : ''}</div>
    <div class="kart" style="margin-bottom:16px"><div class="kart-ic rapor-secenek">
      <label class="secim"><input type="checkbox" id="baslikli" ${baslikli ? 'checked' : ''}> Mesajın başına işveren adı ve tarih yaz</label>
      <span class="soluk kucuk-yazi">Sıra: önce işverene gidecekler, sonra sondaj ve laboratuvar, en sonda bizde olanlar.</span></div></div>
    ${bos ? `<div class="kutu basari">${ikon('tamam')}<div>${isveren ? esc(isverenAdi(isveren)) + ' için' : 'Hiçbir işte'} bekleyen bir şey yok. Bütün işler tamam.</div></div>` : ''}
    ${r.musteri.map(x => bolumKart(`${esc(x.isveren)} <span class="etiket sari" style="margin-left:6px">işverene</span>`,
      `${x.sayi} iş için istenenler ve sorular. Kopyalayıp işverene gönderin.`, x.metin)).join('')}
    ${r.sondaj ? bolumKart(`Sondaj <span class="etiket" style="margin-left:6px">${r.sondajSayi}</span>`, 'Sondajcıya verilmiş (ÖMERE ATILDI gibi) ama sondajı yapılmamış işler', r.sondaj) : ''}
    ${r.lab ? bolumKart(`Laboratuvar <span class="etiket vurgu" style="margin-left:6px">${r.labSayi}</span>`, 'Sondajı yapılmış, laba atılmış ama sonucu gelmemiş işler', r.lab) : ''}
    ${r.labKisa ? bolumKart(`Laboratuvara gönder <span class="etiket vurgu" style="margin-left:6px">${r.labSayi}</span>`, 'Yalnızca ada / parsel, kopyalayıp doğrudan laboratuvara gönderin', r.labKisa) : ''}
    ${r.biz ? bolumKart(`Bizde <span class="etiket turuncu" style="margin-left:6px">${r.bizSayi}</span>`, 'Sizin yapacaklarınız: zemin değeri, sondaj, laba gönderme', r.biz) : ''}`);
  kopyaBagla();
  $('#raporIsveren').onchange = e => { location.hash = '#/isler/rapor/' + encodeURIComponent(e.target.value); };
  $('#baslikli').onchange = e => { depoYaz('raporBaslik', e.target.checked); raporSayfasi(isveren); };
}

// ================================================================== Excel aktar
async function aktarSayfasi() {
  await islerYukle(true);
  IT.kopyalar = [];
  sayfaYaz(`
    <div class="ust"><div><h1>Excel aktar</h1><div class="alt">Takip Excel'inden işleri alın ya da listeyi Excel'e verin</div></div></div>
    <div class="yigin">
      <div class="kart"><div class="kart-bas"><h2>Excel'den içe aktar</h2><span class="aciklama">İŞVEREN, MAHALLE, MAL SAHİBİ, ADA, PARSEL, MİMARİ, EVRAK, GEO, LAB, ZEMİN DEĞERİ VERİLDİ, LABA ATILDI, RİSKLİ RAPOR, SONDAJ</span></div>
        <div class="kart-ic yigin">
          <div class="form-izgara">
            <div class="alan"><label>Sayfa adı</label><input class="girdi" id="sayfaAdi" value="TAKİP"><div class="ipucu">Excel'deki sekmenin adı</div></div>
            <div class="alan"><label>Zaten kayıtlı işler</label>
              <label class="secim" style="height:34px"><input type="checkbox" id="guncelle"> Excel'deki durumla güncelle</label>
              <div class="ipucu">İşaretli değilse yalnızca yeni işler eklenir. Aynı iş ada/parsel ile tanınır.</div></div>
          </div>
          <div class="birak" id="birak"><b>Excel dosyasını buraya bırakın</b>ya da tıklayıp seçin (.xlsx)</div>
          <div id="aktarSonuc"></div>
          <div class="kutu bilgi">${ikon('bilgi')}<div>"+" var, "YOK / VERİLMEDİ / ATILMADI / YAPILMADI" yok sayılır. Hücrede başka bir yazı varsa (örn. "İYİLEŞTİRME ÇIKABİLİR", "ÖMERE ATILDI") hiç değiştirilmeden o hücrenin notu olarak saklanır; Excel'e verirken de aynen geri yazılır.</div></div>
        </div></div>
      <div class="kart"><div class="kart-bas"><h2>Excel'e ver</h2><span class="aciklama">Excel'de açılan CSV dosyası, takip Excel'iyle aynı sütunlar</span></div>
        <div class="kart-ic" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <select class="girdi" id="csvIsveren" style="width:auto;min-width:200px"><option value="">Bütün işverenler</option>
            ${isverenler().map(a => `<option value="${esc(a)}">${esc(isverenAdi(a))}</option>`).join('')}</select>
          <button class="dugme" id="csvIndir">${ikon('indir')}CSV indir</button>
          <span class="soluk kucuk-yazi">${IT.isler.length} iş kayıtlı${D.durum && D.durum.veri_klasoru ? ' · veri: ' + esc(D.durum.veri_klasoru) : ''}</span></div></div>
    </div>`);
  const isle = async dosyalar => {
    const d = dosyalar.find(x => /\.xlsx$/i.test(x.name));
    if (!d) return bildir('Bir .xlsx dosyası seçin', 'hata');
    const guncelle = $('#guncelle').checked ? 1 : 0;
    const sayfa = encodeURIComponent($('#sayfaAdi').value.trim() || 'TAKİP');
    try {
      let v;
      if (istemci().iceAktar) v = await istemci().iceAktar(d, !!guncelle, decodeURIComponent(sayfa));
      else {
        const r = await fetch(`/api/is_takip/ice_aktar?guncelle=${guncelle}&sayfa=${sayfa}`, { method: 'POST', body: d });
        v = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(v.hata || 'Aktarılamadı');
      }
      IT.isler = null;
      $('#aktarSonuc').innerHTML = `<div class="kutu basari">${ikon('tamam')}<div><b>${esc(d.name)}</b> okundu: ${v.toplam} satır.
        <b>${v.eklenen}</b> yeni iş eklendi${guncelle ? `, <b>${v.guncellenen}</b> iş güncellendi` : ''}, ${v.ayni} iş zaten vardı.
        <a href="#/isler">İşlere git</a></div></div>`;
      ikonlariDoldur($('#aktarSonuc'));
      bildir('Excel aktarıldı');
    } catch (e) { hataGoster(e); }
  };
  const b = $('#birak');
  birakmaAlani(b, isle);
  b.onclick = async () => isle(await dosyaSec(false, '.xlsx'));
  $('#csvIndir').onclick = () => {
    if (istemci().csvIndir) return istemci().csvIndir($('#csvIsveren').value);
    location.href = '/api/is_takip/disa_aktar.csv?isveren=' + encodeURIComponent($('#csvIsveren').value);
  };
  if (istemci().aktarSayfasiSonra) istemci().aktarSayfasiSonra();
}
