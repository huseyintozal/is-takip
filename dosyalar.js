'use strict';
/* İş Takibi — DOSYALAR
 *  Her işin dosyaları iki yerde tutulur:
 *   - Bulut (Supabase Storage): her cihazdan görülür, açılır.
 *   - Bilgisayardaki proje klasörü ("İŞVEREN MAHALLE MAH MAL SAHİBİ ADA-PARSEL"): Dosya Yardımcısı üzerinden yazılır,
 *     dosya bilgisayardaki programla açılır (PDF okuyucu, AutoCAD …).
 *  Bulut dolarsa ya da dosya çok büyükse dosya yalnızca bilgisayara kaydedilir; listede "yalnızca bilgisayarda" görünür. */

Object.assign(IKON, {
  atac: '<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>',
  bulut: '<path d="M7 18h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 18z"/>',
  pc: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  esle: '<path d="M8 7h11M16 4l3 3-3 3M16 17H5M8 14l-3 3 3 3"/>',
});

const KATEGORI = [
  ['mimari', 'Mimari', 'mimari'], ['evrak', 'Evrak', 'evrak'], ['geo', 'Geo', 'geo'], ['lab', 'Lab sonuçları', 'lab'],
  ['rapor', 'Rapor', 'rapor_yazildi'], ['imza_cd', 'İmza-CD', 'imza_cd'], ['diger', 'Diğer dosyalar', null],
];
const KATEGORI_AD = Object.fromEntries(KATEGORI.map(k => [k[0], k[1]]));
const YARDIMCI = 'http://127.0.0.1:8767';
const BULUT_SINIR = 1024 * 1024 * 1024;        // ücretsiz plan: 1 GB
const DOSYA_SINIR = 50 * 1024 * 1024;           // ücretsiz plan: dosya başına 50 MB
const DOSYA = { satirlar: new Map(), yardimci: null, yardimciZaman: 0, kanal: null, eksikSayi: 0, kullanim: null };

const boyutYaz = b => !b ? '0 KB' : b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(2) + ' GB' : b >= 1024 ** 2 ? (b / 1024 ** 2).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const uzantiAl = ad => ((ad.match(/\.([A-Za-z0-9]{1,8})$/) || [])[1] || '').toLowerCase();
const buCihaz = () => DOSYA.yardimci && DOSYA.yardimci.pc;
const bulutaYuklensin = () => { try { return localStorage.getItem('isTakip.bulutaYukle') !== '0'; } catch (e) { return true; } };

// ------------------------------------------------------------------ Dosya Yardımcısı (bilgisayardaki servis)
async function yardimci(yol, { yontem = 'GET', json, govde, sure = 8000, ham = false } = {}) {
  const k = new AbortController(); const z = setTimeout(() => k.abort(), sure);
  try {
    const ayar = { method: yontem, signal: k.signal };
    if (json !== undefined) { ayar.method = 'POST'; ayar.headers = { 'Content-Type': 'application/json' }; ayar.body = JSON.stringify(json); }
    if (govde !== undefined) { ayar.method = 'POST'; ayar.body = govde; }
    const r = await fetch(YARDIMCI + yol, ayar);
    if (ham) { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).hata || 'Okunamadı'); return r; }
    const v = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(v.hata || 'Dosya Yardımcısı hata verdi'); e.kod = r.status; throw e; }
    return v;
  } finally { clearTimeout(z); }
}
async function yardimciDenetle(zorla = false) {
  if (/iPhone|iPad|Android/i.test(navigator.userAgent)) return (DOSYA.yardimci = null);
  if (!zorla && Date.now() - DOSYA.yardimciZaman < 30000) return DOSYA.yardimci;
  DOSYA.yardimciZaman = Date.now();
  try { DOSYA.yardimci = await yardimci('/durum', { sure: 2500 }); }
  catch (e) { DOSYA.yardimci = null; }
  return DOSYA.yardimci;
}
const yardimciHazir = () => !!(DOSYA.yardimci && DOSYA.yardimci.kok);

// ------------------------------------------------------------------ bulut verisi
async function dosyalariIndir() {
  const liste = [];
  for (let bas = 0; ; bas += 1000) {
    const { data, error } = await BULUT.sb.from('dosyalar').select('*').range(bas, bas + 999);
    if (error) { if (/does not exist|schema cache/i.test(error.message)) { DOSYA.kurulumYok = true; return; } throw sbHata(error); }
    liste.push(...data);
    if (data.length < 1000) break;
  }
  DOSYA.kurulumYok = false;
  DOSYA.satirlar = new Map(liste.map(r => [r.id, r]));
}
function dosyaCanliBaslat() {
  if (DOSYA.kanal) BULUT.sb.removeChannel(DOSYA.kanal);
  DOSYA.kanal = BULUT.sb.channel('dosya-degisim')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dosyalar' }, o => {
      if (o.eventType === 'DELETE') { if (o.old && o.old.id) DOSYA.satirlar.delete(o.old.id); }
      else if (o.new && o.new.id) DOSYA.satirlar.set(o.new.id, o.new);
      const isId = (o.new && o.new.is_id) || (o.old && o.old.is_id);
      dosyaEkranTazele(isId);
    }).subscribe();
}
let dosyaTazeleZaman = null;
function dosyaEkranTazele(isId) {
  clearTimeout(dosyaTazeleZaman);
  dosyaTazeleZaman = setTimeout(() => {
    if ($('#dosyaKarti') && (!isId || $('#dosyaKarti').dataset.is === isId)) dosyaKartiCiz($('#dosyaKarti').dataset.is);
    if (location.hash.startsWith('#/isler') && !location.hash.includes('/rapor') && !location.hash.includes('/aktar') && $('#tablo') && !$('#hucreMenu')) {
      const s = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
      if (!(document.activeElement && document.activeElement.id === 'ara')) tabloCiz(ik(s[1] || ''));
    }
  }, 300);
}
const isDosyalari = isId => [...DOSYA.satirlar.values()].filter(d => d.is_id === isId).sort((a, b) => (a.eklenme || '').localeCompare(b.eklenme || ''));

// ------------------------------------------------------------------ klasör adı
function klasorAdiUret(i) {
  const buyuk = s => String(s || '').trim().toLocaleUpperCase('tr').replace(/\s+/g, ' ');
  const mah = buyuk(i.mahalle).replace(/\.\s+/g, '.').replace(/\s*(MAHALLESİ|MAH\.?)$/, '');
  const ap = [i.ada && i.ada !== '-' ? i.ada : '', i.parsel].filter(Boolean).join('-');
  return [buyuk(i.isveren), mah ? mah + ' MAH' : '', buyuk(i.mal_sahibi), ap]
    .filter(Boolean).join(' ').replace(/[<>:"/\\|?*]/g, '_').trim() || ('IS ' + i.id);
}
async function isKlasoru(i) {        // işin bilgisayardaki klasörü; yoksa adını üretip işe kaydeder
  const guncel = BULUT.isler.get(i.id) || i;
  if (guncel.klasor) return guncel.klasor;
  const ana = (() => { try { return localStorage.getItem('isTakip.yeniKlasorYeri') || ''; } catch (e) { return ''; } })();
  const klasor = (ana ? ana.replace(/[\\/]+$/, '') + '/' : '') + klasorAdiUret(guncel);
  await api('PUT', `is_takip/isler/${encodeURIComponent(i.id)}`, { klasor });
  return klasor;
}

// ------------------------------------------------------------------ dosya işlemleri
function kategoriTahmin(ad) {
  const s = katla(ad), uz = uzantiAl(ad);
  if (/\bLAB|DENEY|ATTERBERG|ELEK|KESME|NOKTA YUK|SPT FOY|FOY/.test(s)) return 'lab';
  if (['dwg', 'dxf'].includes(uz) || /MIMARI|VAZIYET|KESIT|KAT PLAN|RÖLÖVE|ROLEVE/.test(s)) return 'mimari';
  if (/TAPU|RUHSAT|EVRAK|IMAR|KROKI|APLIKASYON|SOZLESME|VEKALET|KIMLIK|TAAHHUT/.test(s)) return 'evrak';
  if (/IMZA|\bCD\b/.test(s)) return 'imza_cd';
  if (/RAPOR/.test(s)) return 'rapor';
  if (/\bGEO|JEOLOJ|JEOFIZ|MASW/.test(s)) return 'geo';
  return 'diger';
}
async function bulutaKoy(isId, blob, ad) {
  if (blob.size > DOSYA_SINIR) return { hata: `dosya ${boyutYaz(DOSYA_SINIR)}'tan büyük` };
  if (DOSYA.kullanim !== null && DOSYA.kullanim + blob.size > BULUT_SINIR) return { hata: 'bulut doldu' };
  const anahtar = `${isId}/${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2)}${uzantiAl(ad) ? '.' + uzantiAl(ad) : ''}`;
  const { error } = await BULUT.sb.storage.from('dosyalar').upload(anahtar, blob, { contentType: blob.type || 'application/octet-stream', upsert: false });
  if (error) return { hata: /exceeded|quota|too large|payload/i.test(error.message) ? 'bulut doldu ya da dosya çok büyük' : error.message };
  if (DOSYA.kullanim !== null) DOSYA.kullanim += blob.size;
  return { yol: anahtar };
}
/* Dosyaları işe ekler: bilgisayara (yardımcı varsa) + buluta (açıksa ve yer varsa) */
async function dosyaEkle(isId, kategori, dosyalar) {
  if (saltOkunur()) return bildir('Yalnızca görüntüleme yetkiniz var', 'hata');
  const i = BULUT.isler.get(isId); if (!i || !dosyalar.length) return;
  await yardimciDenetle();
  const pcde = yardimciHazir();
  const bulut = bulutaYuklensin();
  if (!pcde && !bulut) return bildir('Bu cihazda dosya kaydedilecek yer yok: Dosya Yardımcısı yok ve buluta yükleme kapalı', 'hata');
  let klasor = '';
  if (pcde) { try { klasor = await isKlasoru(i); } catch (e) { return hataGoster(e); } }
  const durum = $('#dosyaDurum');
  let tamam = 0; const uyarilar = [];
  for (const d of dosyalar) {
    if (durum) durum.textContent = `${d.name} yükleniyor… (${tamam + 1}/${dosyalar.length})`;
    let ad = d.name, pcOk = false, yol = null;
    if (pcde) {
      try { const r = await yardimci(`/yaz?klasor=${encodeURIComponent(klasor)}&ad=${encodeURIComponent(d.name)}`, { govde: d, sure: 120000 }); ad = r.ad; pcOk = true; }
      catch (e) { uyarilar.push(`${d.name}: bilgisayara yazılamadı (${e.message})`); }
    }
    if (bulut) {
      const b = await bulutaKoy(isId, d, ad);
      if (b.yol) yol = b.yol; else uyarilar.push(`${d.name}: buluta yüklenmedi (${b.hata})${pcOk ? ', yalnızca bilgisayarda' : ''}`);
    }
    if (!pcOk && !yol) continue;
    const satir = { is_id: isId, kategori, ad, boyut: d.size, tur: d.type || '', bulut_yolu: yol, pc: pcOk ? buCihaz() : '', ekleyen: BULUT.eposta };
    const { data, error } = await BULUT.sb.from('dosyalar').insert(satir).select().single();
    if (error) { uyarilar.push(`${d.name}: listeye eklenemedi (${sbHata(error).message})`); continue; }
    DOSYA.satirlar.set(data.id, data); tamam++;
  }
  if (durum) durum.textContent = '';
  dosyaKartiCiz(isId);
  if (uyarilar.length) bildir(uyarilar.join(' · '), 'hata');
  if (tamam) bildir(`${tamam} dosya eklendi${pcde ? ' (bilgisayara ve ' + (bulut ? 'buluta)' : 'yalnızca bilgisayara)') : ' (buluta)'}`);
  // dosya geldiyse ilgili adım işaretlensin mi?
  const alan = (KATEGORI.find(k => k[0] === kategori) || [])[2];
  const guncel = BULUT.isler.get(isId);
  if (tamam && alan && guncel && !guncel[alan] &&
      await onayla(`${ALAN[alan].ad} işaretlensin mi?`, `${esc(kimlik(guncel))} için ${esc(KATEGORI_AD[kategori].toLocaleLowerCase('tr'))} dosyası eklendi. <b>${esc(ALAN[alan].ad)}: ${esc(ALAN[alan].e)}</b> olarak işaretleyeyim mi?`, 'İşaretle')) {
    try {
      await api('PUT', `is_takip/isler/${encodeURIComponent(isId)}`, { [alan]: true, bos_alanlar: (guncel.bos_alanlar || []).filter(x => x !== alan) });
      if (IT.form && IT.form.id === isId) { IT.form[alan] = true; durumlariCiz(); ozetCiz(); }
      bildir(`${ALAN[alan].ad} işaretlendi`);
    } catch (e) { hataGoster(e); }
  }
}
async function dosyaAc(id) {
  const d = DOSYA.satirlar.get(id); if (!d) return;
  const i = BULUT.isler.get(d.is_id) || {};
  await yardimciDenetle();
  if (yardimciHazir()) {                    // bilgisayarda: bilgisayardaki programla aç
    let klasor = i.klasor;
    if (klasor) {
      try { await yardimci('/ac', { json: { klasor, ad: d.ad } }); return; }
      catch (e) { if (e.kod !== 404) return hataGoster(e); }
    }
    if (d.bulut_yolu) {                     // bu bilgisayarda yok: buluttan indir, klasöre koy, aç
      try {
        bildir('Dosya buluttan bu bilgisayara indiriliyor…');
        klasor = klasor || await isKlasoru(i);
        const { data, error } = await BULUT.sb.storage.from('dosyalar').download(d.bulut_yolu);
        if (error) throw sbHata(error);
        const r = await yardimci(`/yaz?klasor=${encodeURIComponent(klasor)}&ad=${encodeURIComponent(d.ad)}&uzerine=1`, { govde: data, sure: 120000 });
        await yardimci('/ac', { json: { klasor, ad: r.ad } });
        return;
      } catch (e) { return hataGoster(e); }
    }
    return bildir(`Bu dosya yalnızca "${d.pc || 'başka bir'}" bilgisayarında, buluta yüklenmemiş`, 'hata');
  }
  if (!d.bulut_yolu) return bildir(`Bu dosya yalnızca "${d.pc || 'başka bir'}" bilgisayarında, buluta yüklenmemiş`, 'hata');
  const pencere = window.open('', '_blank');          // telefonda açılır pencere engeline takılmasın diye hemen açılır
  const gorunur = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'txt'].includes(uzantiAl(d.ad));
  const { data, error } = await BULUT.sb.storage.from('dosyalar').createSignedUrl(d.bulut_yolu, 600, gorunur ? undefined : { download: d.ad });
  if (error) { if (pencere) pencere.close(); return hataGoster(sbHata(error)); }
  if (pencere) pencere.location = data.signedUrl; else location.href = data.signedUrl;
}
async function dosyaBulutaYukle(id) {
  const d = DOSYA.satirlar.get(id); const i = d && BULUT.isler.get(d.is_id);
  if (!d || !i || d.bulut_yolu) return;
  await yardimciDenetle();
  if (!yardimciHazir() || !i.klasor) return bildir('Dosya bu bilgisayarda değil', 'hata');
  try {
    const r = await yardimci(`/oku?klasor=${encodeURIComponent(i.klasor)}&ad=${encodeURIComponent(d.ad)}`, { ham: true, sure: 120000 });
    const b = await bulutaKoy(i.id, await r.blob(), d.ad);
    if (!b.yol) throw new Error('Buluta yüklenmedi: ' + b.hata);
    const { data, error } = await BULUT.sb.from('dosyalar').update({ bulut_yolu: b.yol }).eq('id', id).select().single();
    if (error) throw sbHata(error);
    DOSYA.satirlar.set(id, data); dosyaKartiCiz(i.id); bildir('Buluta yüklendi');
  } catch (e) { hataGoster(e); }
}
async function dosyaSil(id) {
  const d = DOSYA.satirlar.get(id); if (!d) return;
  const i = BULUT.isler.get(d.is_id) || {};
  if (!await onayla('Dosya silinsin mi?', `<b>${esc(d.ad)}</b> listeden ve buluttan silinecek.${buCihaz() && d.pc === buCihaz() ? ' Bilgisayardaki kopyası proje klasöründen <b>_silinenler</b> klasörüne taşınır.' : ''}`, 'Sil', true)) return;
  try {
    if (d.bulut_yolu) await BULUT.sb.storage.from('dosyalar').remove([d.bulut_yolu]);
    if (yardimciHazir() && i.klasor && d.pc === buCihaz()) await yardimci('/sil', { json: { klasor: i.klasor, ad: d.ad } }).catch(() => {});
    const { error } = await BULUT.sb.from('dosyalar').delete().eq('id', id);
    if (error) throw sbHata(error);
    DOSYA.satirlar.delete(id); dosyaKartiCiz(d.is_id); bildir('Dosya silindi');
  } catch (e) { hataGoster(e); }
}
async function dosyaKategori(id, kategori) {
  const { data, error } = await BULUT.sb.from('dosyalar').update({ kategori }).eq('id', id).select().single();
  if (error) return hataGoster(sbHata(error));
  DOSYA.satirlar.set(id, data); dosyaKartiCiz(data.is_id);
}
window.dosyaIsSilindi = async isId => {
  const yollar = isDosyalari(isId).map(d => d.bulut_yolu).filter(Boolean);
  if (yollar.length) await BULUT.sb.storage.from('dosyalar').remove(yollar).catch(() => {});
};

// ------------------------------------------------------------------ iş sayfasındaki "Dosyalar" kartı
function dosyaKartiCiz(isId) {
  const kart = $('#dosyaKarti'); if (!kart || kart.dataset.is !== isId) return;
  const i = BULUT.isler.get(isId) || {};
  const liste = isDosyalari(isId);
  const yaz = !saltOkunur();
  const rozet = d => [
    d.bulut_yolu ? `<span class="etiket vurgu" title="Bulutta, her cihazdan açılır">${ikon('bulut')}Bulut</span>` : '',
    d.pc ? `<span class="etiket ${d.pc === buCihaz() ? 'yesil' : ''}" title="Bilgisayardaki proje klasöründe">${ikon('pc')}${d.pc === buCihaz() ? 'Bu bilgisayar' : esc(d.pc)}</span>` : '',
    !d.bulut_yolu ? '<span class="etiket sari" title="Diğer cihazlardan açılamaz">yalnızca bilgisayarda</span>' : '',
  ].join('');
  const satir = d => `<li class="dosya-satir" data-dosya="${esc(d.id)}" draggable="${yaz}">
      <div class="dosya-ikon ${esc(uzantiAl(d.ad))}">${esc(uzantiAl(d.ad).toUpperCase().slice(0, 4) || 'DOS')}</div>
      <div class="ad"><a href="#" data-ac="${esc(d.id)}" title="Aç">${esc(d.ad)}</a>
        <div class="kucuk-yazi">${boyutYaz(d.boyut || 0)} · ${esc(new Date(d.eklenme).toLocaleDateString('tr-TR'))}${d.ekleyen ? ' · ' + esc(d.ekleyen.split('@')[0]) : ''} ${rozet(d)}</div></div>
      ${yaz && !d.bulut_yolu && d.pc === buCihaz() ? `<button class="dugme kucuk hayalet" data-bulut="${esc(d.id)}" title="Buluta yükle">${ikon('bulut')}</button>` : ''}
      ${yaz ? `<button class="dugme kucuk hayalet tehlike" data-sil="${esc(d.id)}" title="Sil">${ikon('sil')}</button>` : ''}</li>`;
  kart.innerHTML = `<div class="kart-bas"><h2>Dosyalar</h2><span class="aciklama">${liste.length ? liste.length + ' dosya' : 'Dosyayı ilgili bölüme sürükleyin'}</span>
      <div style="flex:1"></div>
      ${yardimciHazir() && i.klasor ? `<button class="dugme kucuk" id="klasorAc" title="${esc(i.klasor)}">${ikon('klasor')}Klasörü aç</button>` : ''}</div>
    <div class="dosya-bilgi kucuk-yazi">${yardimciHazir()
      ? (i.klasor ? `${ikon('pc')} Klasör: <b>${esc(i.klasor)}</b>` : `${ikon('pc')} İlk dosyada bilgisayarda <b>${esc(klasorAdiUret(i))}</b> klasörü açılır`)
      : (/iPhone|iPad|Android/i.test(navigator.userAgent) ? `${ikon('bulut')} Dosyalar buluta yüklenir, her cihazdan açılır` : `${ikon('bilgi')} Bu bilgisayarda Dosya Yardımcısı yok; dosyalar yalnızca buluta yüklenir. <a href="#/dosyalar">Kur</a>`)}
      <span id="dosyaDurum" class="soluk"></span></div>
    <div class="dosya-katlar">${KATEGORI.map(([k, ad]) => {
      const d = liste.filter(x => (KATEGORI_AD[x.kategori] ? x.kategori : 'diger') === k);
      return `<div class="dosya-kat ${d.length ? '' : 'bos'}" data-kat="${k}">
        <div class="dosya-kat-bas"><b>${esc(ad)}</b>${d.length ? `<span class="etiket">${d.length}</span>` : ''}
          ${yaz ? `<button class="dugme kucuk hayalet" data-ekle="${k}">${ikon('arti')}Ekle</button>` : ''}</div>
        ${d.length ? `<ul class="liste">${d.map(satir).join('')}</ul>` : (yaz ? '<div class="dosya-kat-ipucu">Dosyayı buraya bırakın</div>' : '')}</div>`;
    }).join('')}</div>`;
  ikonlariDoldur(kart);
  $$('[data-ac]', kart).forEach(a => a.onclick = e => { e.preventDefault(); dosyaAc(a.dataset.ac); });
  $$('[data-sil]', kart).forEach(b => b.onclick = () => dosyaSil(b.dataset.sil));
  $$('[data-bulut]', kart).forEach(b => b.onclick = () => dosyaBulutaYukle(b.dataset.bulut));
  if ($('#klasorAc', kart)) $('#klasorAc', kart).onclick = () => yardimci('/ac', { json: { klasor: i.klasor } }).catch(hataGoster);
  if (!yaz) return;
  $$('[data-ekle]', kart).forEach(b => b.onclick = async () => dosyaEkle(isId, b.dataset.ekle, await dosyaSec(true)));
  $$('.dosya-satir', kart).forEach(li => li.ondragstart = e => { e.dataTransfer.setData('text/is-dosya', li.dataset.dosya); });
  $$('.dosya-kat', kart).forEach(kat => {
    kat.ondragover = e => { e.preventDefault(); kat.classList.add('uzerinde'); };
    kat.ondragleave = () => kat.classList.remove('uzerinde');
    kat.ondrop = e => {
      e.preventDefault(); e.stopPropagation(); kat.classList.remove('uzerinde');
      const tasinan = e.dataTransfer.getData('text/is-dosya');
      if (tasinan) return dosyaKategori(tasinan, kat.dataset.kat);           // dosyayı başka bölüme taşı
      dosyaEkle(isId, kat.dataset.kat, [...e.dataTransfer.files]);
    };
  });
}

// ------------------------------------------------------------------ Dosyalar sayfası: bağlantı, eşleştirme, eşitleme
function klasorAyristir(ad) {
  const m = ad.match(/(\d+|-)\s*[-\/_]\s*(\d+(?:\s*\(\s*\d+\s*\))?)\s*$/);
  if (m) return { ada: m[1] === '-' ? '' : m[1], parsel: m[2].replace(/\s+/g, '') };
  const t = ad.match(/(\d+(?:\(\d+\))?)\s*$/);
  return t ? { ada: '', parsel: t[1] } : null;
}
function kelimeler(s) { return new Set(katla(s).split(/[^A-Z0-9]+/).filter(x => x.length >= 3 && !['MAH', 'MAHALLESI'].includes(x))); }
function eslesmeBul(klasor, isler) {
  const ap = klasorAyristir(klasor.ad);
  if (!ap) return { isler: [], neden: 'ada/parsel okunamadı' };
  const pars = s => String(s || '').replace(/\s+/g, '');
  let aday = isler.filter(i => pars(i.parsel) === ap.parsel && (ap.ada ? String(i.ada).trim() === ap.ada : (!i.ada || i.ada === '-')));
  if (!aday.length && ap.ada) aday = isler.filter(i => pars(i.parsel) === ap.parsel && String(i.ada).trim() === ap.ada);
  const k = kelimeler(klasor.ad);
  const puanli = aday.map(i => ({ i, puan: [...kelimeler(`${i.isveren} ${i.mahalle} ${i.mal_sahibi}`)].filter(x => k.has(x)).length }))
    .sort((a, b) => b.puan - a.puan);
  return { isler: puanli, ap };
}
/* Bir işin bir klasöre ne kadar benzediği: ada ve parsel numaraları + mal sahibi / işveren adları */
function klasorPuani(i, k) {
  const sayilar = (k.ad.match(/\d+/g) || []);
  const ada = String(i.ada || '').trim(), pars = String(i.parsel || '').replace(/\s+/g, '');
  const parselNo = (pars.match(/\d+/) || [''])[0];
  let p = 0;
  const ai = ada && ada !== '-' ? sayilar.indexOf(ada) : -1;
  const pi = parselNo ? sayilar.lastIndexOf(parselNo) : -1;
  if (ai >= 0 && pi >= 0 && pi !== ai) p += pi > ai ? 7 : 6;
  else if (pi >= 0 && (!ada || ada === '-')) p += 4;
  else if (ai >= 0 || pi >= 0) p += 1;
  const kk = kelimeler(k.ad);
  p += [...kelimeler(i.mal_sahibi)].filter(x => kk.has(x)).length * 2.5;
  p += [...kelimeler(i.isveren)].filter(x => kk.has(x)).length;
  return p;
}
let TARAMA = null;
async function dosyalarSayfasi() {
  await yardimciDenetle(true);
  if (DOSYA.kurulumYok === undefined) await dosyalariIndir().catch(() => {});
  try { const { data } = await BULUT.sb.rpc('bulut_kullanim'); if (typeof data === 'number') DOSYA.kullanim = data; } catch (e) { /* */ }
  const y = DOSYA.yardimci, mobil = /iPhone|iPad|Android/i.test(navigator.userAgent);
  const kul = DOSYA.kullanim || 0, oran = Math.min(100, kul / BULUT_SINIR * 100);
  const yerel = (() => { try { return localStorage.getItem('isTakip.yeniKlasorYeri') || ''; } catch (e) { return ''; } })();
  sayfaYaz(`<div class="ust"><div><h1>Dosyalar</h1><div class="alt">${DOSYA.satirlar.size} dosya · bulut ${boyutYaz(kul)} / ${boyutYaz(BULUT_SINIR)}</div></div></div>
    <div class="yigin">
    ${DOSYA.kurulumYok ? `<div class="kutu uyari">${ikon('uyari')}<div><b>Dosya özelliği henüz kurulmamış.</b> Supabase'de SQL Editor'de <b>kurulum_dosyalar.sql</b>'i çalıştırıp sayfayı yenileyin.</div></div>` : ''}
    <div class="kart"><div class="kart-bas"><h2>Bulut deposu</h2><span class="aciklama">Her cihazdan açılan dosyalar</span></div>
      <div class="kart-ic yigin">
        <div class="kullanim"><div style="width:${oran.toFixed(1)}%" class="${oran > 90 ? 'dolu' : ''}"></div></div>
        <div class="kucuk-yazi soluk">${boyutYaz(kul)} kullanılıyor, ${boyutYaz(Math.max(0, BULUT_SINIR - kul))} boş. Dosya başına en fazla ${boyutYaz(DOSYA_SINIR)}.
          Bulut dolunca ya da büyük dosyalar yalnızca bilgisayara kaydedilir, listede "yalnızca bilgisayarda" yazar.</div>
        <label class="secim"><input type="checkbox" id="bulutaYukle" ${bulutaYuklensin() ? 'checked' : ''}> Bu cihazdan eklenen dosyaları buluta da yükle</label></div></div>
    ${mobil ? `<div class="kutu bilgi">${ikon('bilgi')}<div>Telefonda dosyalar yalnızca buluta yüklenir ve buradan açılır. Bilgisayardaki klasörlerle çalışmak için bu sayfayı bilgisayardan açın.</div></div>` : `
    <div class="kart"><div class="kart-bas"><h2>Bu bilgisayar</h2><span class="aciklama">Dosya Yardımcısı: proje klasörlerine yazar, dosyaları bilgisayardaki programla açar</span></div>
      <div class="kart-ic yigin">${y ? `
        <div class="sistem-satir" style="padding:0"><div class="durum-ikon ok">${ikon('tamam')}</div>
          <div style="flex:1"><b>Dosya Yardımcısı çalışıyor</b><div class="soluk kucuk-yazi">Bilgisayar: ${esc(y.pc)} · sürüm ${esc(y.surum)}</div></div></div>
        <div class="alan"><label>Ana klasör (proje klasörlerinin bulunduğu yer)</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="girdi" id="kokYol" value="${esc(y.kok || '')}" placeholder="C:\\Users\\...\\ZEMİN ETÜT RAPORLARI" style="flex:1;min-width:260px">
          <button class="dugme" id="kokSec">${ikon('klasor')}Seç…</button><button class="dugme" id="kokKaydet">Kaydet</button></div>
          <div class="ipucu">Durum klasörlerinin (0-1 YAZIMA HAZIR RAPORLAR gibi) içine de bakılır; proje klasörlerinin alt klasörleri listelenmez.</div></div>
        <div class="alan"><label>Yeni proje klasörleri nereye açılsın? (ana klasöre göre, boş = ana klasörün içine)</label>
          <input class="girdi" id="yeniYer" value="${esc(yerel)}" placeholder="örn. 0-1 YAZIMA HAZIR RAPORLAR"></div>`
      : `<div class="kutu uyari">${ikon('uyari')}<div><b>Dosya Yardımcısı bu bilgisayarda çalışmıyor ya da tarayıcı izin vermedi.</b>
          <ol style="margin:6px 0 0;padding-left:18px;line-height:1.7">
            <li><a href="dosya_yardimcisi.zip" download>dosya_yardimcisi.zip</a>'i indirip açın, içindeki <b>KUR.bat</b>'a çift tıklayın (bir kez).</li>
            <li>Bu sayfaya dönüp <b>Tekrar dene</b>'ye basın. Tarayıcı "yerel ağdaki cihazlara / bu cihazdaki uygulamalara erişim" izni sorarsa <b>İzin ver</b> deyin.</li></ol></div></div>
        <div><button class="dugme ana" id="tekrarDene">${ikon('yenile')}Tekrar dene</button></div>`}
      </div></div>
    ${yardimciHazir() ? `
    <div class="kart"><div class="kart-bas"><h2>Eski klasörleri eşleştir</h2><span class="aciklama">Klasör adındaki ada-parsel ile işleri bulur; bulamadıklarını siz seçersiniz</span>
        <div style="flex:1"></div><button class="dugme ana" id="tara">${ikon('ara')}Klasörleri tara</button></div>
      <div class="kart-ic" id="eslesme"><div class="soluk kucuk-yazi">Taramak için düğmeye basın.</div></div></div>
    <div class="kart"><div class="kart-bas"><h2>Bu bilgisayarla eşitle</h2></div>
      <div class="kart-ic yigin" id="esitle"><div class="soluk kucuk-yazi">Kontrol ediliyor…</div></div></div>` : ''}`}
    </div>`);
  $('#bulutaYukle').onchange = e => { try { localStorage.setItem('isTakip.bulutaYukle', e.target.checked ? '1' : '0'); } catch (x) { /* */ } };
  if ($('#tekrarDene')) $('#tekrarDene').onclick = () => dosyalarSayfasi();
  if ($('#kokSec')) $('#kokSec').onclick = async () => {
    bildir('Klasör seçme penceresi açılıyor (görev çubuğuna da bakın)…');
    try { const r = await yardimci('/kok/sec', { yontem: 'POST', sure: 600000 }); if (r.secildi) { bildir('Ana klasör seçildi'); dosyalarSayfasi(); } }
    catch (e) { hataGoster(e); }
  };
  if ($('#kokKaydet')) $('#kokKaydet').onclick = async () => {
    try { await yardimci('/kok', { json: { yol: $('#kokYol').value } }); bildir('Ana klasör kaydedildi'); dosyalarSayfasi(); } catch (e) { hataGoster(e); }
  };
  if ($('#yeniYer')) $('#yeniYer').onchange = e => { try { localStorage.setItem('isTakip.yeniKlasorYeri', e.target.value.trim()); } catch (x) { /* */ } };
  if ($('#tara')) $('#tara').onclick = taramaYap;
  if ($('#esitle')) esitlemeCiz();
}

async function taramaYap() {
  const kutu = $('#eslesme');
  kutu.innerHTML = '<div class="soluk">Taranıyor…</div>';
  let sonuc;
  try { sonuc = await yardimci('/tara', { sure: 120000 }); } catch (e) { kutu.innerHTML = ''; return hataGoster(e); }
  const isler = tumIsler();
  const bagli = new Map(isler.filter(i => i.klasor).map(i => [i.klasor, i]));
  let yoksay = []; try { yoksay = JSON.parse(localStorage.getItem('isTakip.yoksayKlasor') || '[]'); } catch (e) { /* */ }
  // Yalnızca ANA proje klasörleri: kök ya da durum klasörlerinin (0-1 YAZIMA HAZIR RAPORLAR gibi) hemen altındakiler.
  // Proje klasörlerinin içindeki alt klasörler (MİMARİ, FOTO…) hiç gösterilmez.
  const tumu = new Map(sonuc.klasorler.map(k => [k.klasor, k]));
  const hepsi = sonuc.klasorler.filter(k => !bagli.has(k.klasor));
  const grupMu = k => !bagli.has(k.klasor) && k.dosya === 0 && !(klasorAyristir(k.ad) || {}).ada &&
    (k.alt >= 8 || /^\d+\s*[-.)_]/.test(k.ad) || /RAPORLAR|BEKLEYEN|HAZIR|TAMAMLAN|ARŞ[İI]V|B[İI]TEN|[İI]ŞLER|PROJELER|ZEM[İI]N ET[ÜU]T/i.test(k.ad));
  const ustler = yol => { const p = yol.split('/'); return p.slice(0, -1).map((_, n) => p.slice(0, n + 1).join('/')); };
  sonuc.klasorler = sonuc.klasorler.filter(k => !grupMu(k) && ustler(k.klasor).every(u => tumu.has(u) && grupMu(tumu.get(u))));
  const otomatik = [], elle = [], zaten = [];
  sonuc.klasorler.forEach(k => {
    if (bagli.has(k.klasor)) { zaten.push({ k, i: bagli.get(k.klasor) }); return; }
    const ap = klasorAyristir(k.ad);
    if (yoksay.includes(k.klasor)) return;
    const e = eslesmeBul(k, isler);
    const bos = e.isler.filter(x => !x.i.klasor);
    if (bos.length === 1 || (bos.length > 1 && bos[0].puan > bos[1].puan)) otomatik.push({ k, i: bos[0].i, puan: bos[0].puan });
    else elle.push({ k, oneriler: e.isler.map(x => x.i) });
  });
  // klasörü olmayan işler için öneriler (iş tarafından eşleştirme)
  const uygun = sonuc.klasorler.filter(k => !bagli.has(k.klasor) && !yoksay.includes(k.klasor) && true);
  const otoKlasor = new Set(otomatik.map(x => x.k.klasor)), otoIs = new Set(otomatik.map(x => x.i.id));
  const isOneri = isler.filter(i => !i.klasor && !otoIs.has(i.id)).map(i => {
    const adaylar = uygun.map((k, n) => ({ n, k, puan: klasorPuani(i, k) })).filter(x => x.puan >= 2).sort((a, b) => b.puan - a.puan).slice(0, 8);
    const iyi = adaylar[0] && adaylar[0].puan >= 6 && !otoKlasor.has(adaylar[0].k.klasor) && (!adaylar[1] || adaylar[0].puan - adaylar[1].puan >= 2);
    return { i, adaylar, secili: iyi ? adaylar[0].n : null };
  }).sort((a, b) => (b.secili !== null) - (a.secili !== null) || (b.adaylar.length - a.adaylar.length));
  TARAMA = { otomatik, elle, uygun, isOneri, hepsi };
  const klasorSecenek = x => `<option value="">— Klasör seçin —</option>${x.adaylar.map(a => `<option value="${a.n}" ${x.secili === a.n ? 'selected' : ''}>★ ${esc(a.k.ad)}</option>`).join('')}
    <optgroup label="Bütün klasörler">${uygun.map((k, n) => `<option value="${n}">${esc(k.klasor)}</option>`).join('')}</optgroup>`;
  const secenekler = (oneriler) => {
    const sirali = [...oneriler, ...isler.filter(i => !oneriler.includes(i)).sort((a, b) => trSirala(ik(a.isveren), ik(b.isveren)) || trSirala(a.mal_sahibi || '', b.mal_sahibi || ''))];
    return '<option value="">— İş seçin —</option><option value="__yoksay">Bu klasörü yok say</option>' +
      sirali.map((i, n) => `<option value="${esc(i.id)}">${n < oneriler.length ? '★ ' : ''}${esc(isverenAdi(ik(i.isveren)))} · ${esc(i.mal_sahibi || i.mahalle || '—')} (${esc(adaParsel(i))})${i.klasor ? ' · zaten klasörü var' : ''}</option>`).join('');
  };
  kutu.innerHTML = `<div class="yigin">
    <div class="ozet-cubugu"><span class="etiket yesil">${otomatik.length} otomatik eşleşti</span><span class="etiket sari">${elle.length} sizin seçmeniz gerekiyor</span>
      <span class="etiket">${zaten.length} zaten bağlı</span><span class="soluk kucuk-yazi">${sonuc.klasorler.length} klasör tarandı</span></div>
    ${otomatik.length ? `<div><h4 class="esle-bas">Otomatik eşleşenler <span class="soluk kucuk-yazi">(yanlış olanın işaretini kaldırın)</span></h4>
      <table class="veri esle-tablo"><tbody>${otomatik.map((x, n) => `<tr><td><input type="checkbox" data-oto="${n}" checked></td>
        <td><div class="ms">${esc(x.k.ad)}</div><div class="kucuk-yazi soluk">${esc(x.k.klasor)} · ${x.k.dosya} dosya, ${boyutYaz(x.k.boyut)}</div></td>
        <td>${ikon('esle')}</td><td><div class="ms">${esc(x.i.mal_sahibi || x.i.mahalle || '—')} (${esc(adaParsel(x.i))})</div><div class="kucuk-yazi soluk">${esc(isverenAdi(ik(x.i.isveren)))}</div></td></tr>`).join('')}</tbody></table></div>` : ''}
    ${isOneri.length ? `<div><h4 class="esle-bas">Klasörü bulunamayan işler (${isOneri.length}) <span class="soluk kucuk-yazi">— ★ en çok benzeyen klasörler; emin olduklarımı seçili getirdim (${isOneri.filter(x => x.secili !== null).length}), kontrol edin</span></h4>
      <table class="veri esle-tablo"><tbody>${isOneri.map((x, n) => `<tr>
        <td><div class="ms">${esc(x.i.mal_sahibi || x.i.mahalle || '—')} (${esc(adaParsel(x.i))})</div><div class="kucuk-yazi soluk">${esc(isverenAdi(ik(x.i.isveren)))} · ${esc(x.i.mahalle || '')}</div></td>
        <td style="width:52%"><div class="esle-sec"><select class="girdi ${x.secili !== null ? 'onerildi' : ''}" data-isesle="${n}">${klasorSecenek(x)}</select>
          <button class="dugme hayalet kucuk" data-baska="${n}" title="Alt klasörler ve taşınmış klasörler dahil bütün klasörlerden seç">Başka klasör…</button></div></td></tr>`).join('')}</tbody></table></div>` : ''}
    ${elle.length ? `<details><summary class="esle-bas" style="cursor:pointer">İşle eşleşmeyen klasörler (${elle.length}) <span class="soluk kucuk-yazi">— isterseniz buradan da seçebilirsiniz</span></summary>
      <table class="veri esle-tablo"><tbody>${elle.map((x, n) => `<tr>
        <td><div class="ms">${esc(x.k.ad)}</div><div class="kucuk-yazi soluk">${esc(x.k.klasor)} · ${x.k.dosya} dosya, ${boyutYaz(x.k.boyut)}</div></td>
        <td style="width:46%"><select class="girdi" data-elle="${n}">${secenekler(x.oneriler)}</select></td></tr>`).join('')}</tbody></table></details>` : ''}
    ${otomatik.length || elle.length || isOneri.length ? `<div class="esle-alt">
      <label class="secim"><input type="checkbox" id="esleBulut"> Eşleşen klasörlerdeki dosyaları buluta da yükle <span class="soluk" id="esleBoyut"></span></label>
      <button class="dugme ana" id="esleKaydet">${ikon('kaydet')}Eşleştirmeleri kaydet</button></div>` : '<div class="soluk">Eşleştirilecek yeni klasör yok.</div>'}
    <div id="esleSonuc"></div></div>`;
  ikonlariDoldur(kutu);
  const boyutHesap = () => {
    let t = 0;
    otomatik.forEach((x, n) => { if ($(`[data-oto="${n}"]`).checked) t += x.k.boyut; });
    elle.forEach((x, n) => { const v = $(`[data-elle="${n}"]`).value; if (v && v !== '__yoksay') t += x.k.boyut; });
    isOneri.forEach((x, n) => { const v = $(`[data-isesle="${n}"]`).value; if (v !== '') t += uygun[+v].boyut; });
    if ($('#esleBoyut')) $('#esleBoyut').textContent = `(${boyutYaz(t)}${DOSYA.kullanim !== null && DOSYA.kullanim + t > BULUT_SINIR ? ' — bulutta yer yetmez, sığmayanlar yalnızca bilgisayarda kalır' : ''})`;
  };
  $$('[data-oto], [data-elle], [data-isesle]', kutu).forEach(x => x.onchange = () => { x.classList.remove('onerildi'); boyutHesap(); }); boyutHesap();
  $$('[data-baska]', kutu).forEach(d => d.onclick = async () => {
    const x = isOneri[+d.dataset.baska];
    const k = await klasorAra(hepsi, `${x.i.mal_sahibi || x.i.mahalle || ''} ${x.i.ada || ''} ${x.i.parsel || ''}`);
    if (!k) return;
    let n = uygun.indexOf(k);
    if (n < 0) { uygun.push(k); n = uygun.length - 1; }
    const sel = $(`[data-isesle="${d.dataset.baska}"]`);
    if (!sel.querySelector(`option[value="${n}"]`)) sel.insertAdjacentHTML('beforeend', `<option value="${n}">${esc(k.klasor)}</option>`);
    sel.value = String(n); sel.classList.add('onerildi'); boyutHesap();
  });
  if ($('#esleKaydet')) $('#esleKaydet').onclick = eslesmeKaydet;
}
// Bütün taranan klasörlerde (alt ve taşınmış klasörler dahil) arayıp birini seçtirir
function klasorAra(liste, ipucu) {
  return new Promise(coz => {
    const p = $('#perde');
    p.innerHTML = `<div class="pencere genis"><h3>Klasör seç</h3>
      <input class="girdi" id="kaAra" type="search" autocomplete="off" placeholder="Klasör adı, mal sahibi, ada-parsel…">
      <div class="ka-liste" id="kaListe"></div>
      <div class="kucuk-yazi soluk">Klasör listede yoksa Dosya Yardımcısında seçtiğin ana klasörün dışında olabilir (ya da 4 kattan derinde). Önce o klasörün içine taşı, sonra yeniden tara.</div>
      <div class="dugmeler"><button class="dugme hayalet" data-c="0">Vazgeç</button></div></div>`;
    p.classList.remove('gizli');
    const g = $('#kaAra'), l = $('#kaListe');
    const ciz = () => {
      const t = katla(g.value).split(/\s+/).filter(Boolean);
      const s = liste.filter(k => { const a = katla(k.klasor); return t.every(x => a.includes(x)); }).slice(0, 200);
      l.innerHTML = s.length ? s.map(k => `<button class="ka-satir" data-k="${esc(k.klasor)}"><b>${esc(k.ad)}</b><span class="kucuk-yazi soluk">${esc(k.klasor)} · ${k.dosya} dosya</span></button>`).join('') : '<div class="soluk" style="padding:8px">Bulunamadı.</div>';
    };
    const bitir = k => { p.classList.add('gizli'); coz(k); };
    g.oninput = ciz; ciz(); g.focus();
    g.onkeydown = e => { if (e.key === 'Escape') bitir(null); };
    p.onclick = e => {
      const b = e.target.closest('[data-k]');
      if (b) return bitir(liste.find(k => k.klasor === b.dataset.k));
      if (e.target.dataset.c !== undefined || e.target === p) bitir(null);
    };
  });
}
async function eslesmeKaydet() {
  const dugme = $('#esleKaydet'); dugme.disabled = true;
  const ciftler = [];
  TARAMA.otomatik.forEach((x, n) => { if ($(`[data-oto="${n}"]`).checked) ciftler.push({ k: x.k, isId: x.i.id }); });
  const yoksay = [];
  TARAMA.elle.forEach((x, n) => { const v = $(`[data-elle="${n}"]`).value; if (v === '__yoksay') yoksay.push(x.k.klasor); else if (v) ciftler.push({ k: x.k, isId: v }); });
  TARAMA.isOneri.forEach((x, n) => { const v = $(`[data-isesle="${n}"]`).value; if (v !== '') ciftler.push({ k: TARAMA.uygun[+v], isId: x.i.id }); });
  // aynı klasör ya da aynı iş iki kez seçildiyse ilkini al
  const gorulenK = new Set(), gorulenI = new Set();
  const tekil = ciftler.filter(c => { if (gorulenK.has(c.k.klasor) || gorulenI.has(c.isId)) return false; gorulenK.add(c.k.klasor); gorulenI.add(c.isId); return true; });
  ciftler.length = 0; ciftler.push(...tekil);
  try { const eski = JSON.parse(localStorage.getItem('isTakip.yoksayKlasor') || '[]'); localStorage.setItem('isTakip.yoksayKlasor', JSON.stringify([...eski, ...yoksay])); } catch (e) { /* */ }
  const bulut = $('#esleBulut').checked;
  const sonuc = $('#esleSonuc');
  let bag = 0, dosya = 0, bulutta = 0; const hatalar = [];
  for (const c of ciftler) {
    sonuc.innerHTML = `<div class="soluk">${esc(c.k.ad)} işleniyor… (${bag + 1}/${ciftler.length})</div>`;
    try {
      await api('PUT', `is_takip/isler/${encodeURIComponent(c.isId)}`, { klasor: c.k.klasor }); bag++;
      const { dosyalar } = await yardimci(`/liste?klasor=${encodeURIComponent(c.k.klasor)}`);
      const var_ = new Set(isDosyalari(c.isId).map(d => d.ad));
      for (const f of dosyalar.filter(f => !var_.has(f.ad))) {
        let yol = null;
        if (bulut) {
          try {
            const r = await yardimci(`/oku?klasor=${encodeURIComponent(c.k.klasor)}&ad=${encodeURIComponent(f.ad)}`, { ham: true, sure: 120000 });
            const b = await bulutaKoy(c.isId, await r.blob(), f.ad); if (b.yol) { yol = b.yol; bulutta++; }
          } catch (e) { /* bilgisayarda kalır */ }
        }
        const { data, error } = await BULUT.sb.from('dosyalar').insert({ is_id: c.isId, kategori: kategoriTahmin(f.ad), ad: f.ad, boyut: f.boyut,
          tur: '', bulut_yolu: yol, pc: buCihaz(), ekleyen: BULUT.eposta }).select().single();
        if (error) throw sbHata(error);
        DOSYA.satirlar.set(data.id, data); dosya++;
      }
    } catch (e) { hatalar.push(`${c.k.ad}: ${e.message}`); }
  }
  sonuc.innerHTML = `<div class="kutu ${hatalar.length ? 'uyari' : 'basari'}">${ikon(hatalar.length ? 'uyari' : 'tamam')}<div>
    <b>${bag}</b> klasör işe bağlandı, <b>${dosya}</b> dosya listeye eklendi${bulut ? `, ${bulutta} tanesi buluta yüklendi` : ''}.
    Dosyalar işlerin sayfasında "Dosyalar" kartında görünür; kategorisini sürükleyerek değiştirebilirsiniz.
    ${hatalar.length ? '<ul>' + hatalar.map(h => `<li>${esc(h)}</li>`).join('') + '</ul>' : ''}</div></div>`;
  ikonlariDoldur(sonuc);
  dugme.disabled = false;
  esitlemeCiz();
}

/* Buluttaki dosyalardan bu bilgisayarda olmayanlar ve yalnızca bu bilgisayarda olanlar */
async function eksikleriBul() {
  const pc = buCihaz();
  const adaylar = [...DOSYA.satirlar.values()].filter(d => d.bulut_yolu);
  const sorgu = adaylar.map(d => ({ klasor: (BULUT.isler.get(d.is_id) || {}).klasor || '', ad: d.ad }));
  let var_ = [];
  try { var_ = (await yardimci('/varlar', { json: { dosyalar: sorgu }, sure: 60000 })).var; } catch (e) { var_ = adaylar.map(() => true); }
  const eksik = adaylar.filter((d, n) => !sorgu[n].klasor || !var_[n]);
  const yalnizPc = [...DOSYA.satirlar.values()].filter(d => !d.bulut_yolu && d.pc === pc);
  return { eksik, yalnizPc };
}
async function esitlemeCiz() {
  const kutu = $('#esitle'); if (!kutu) return;
  const { eksik, yalnizPc } = await eksikleriBul();
  DOSYA.eksikSayi = eksik.length; kenarYaz();
  const top = l => boyutYaz(l.reduce((t, d) => t + (d.boyut || 0), 0));
  kutu.innerHTML = `
    <div class="sistem-satir" style="padding:0"><div class="durum-ikon ${eksik.length ? 'opsiyon' : 'ok'}">${ikon(eksik.length ? 'indir' : 'tamam')}</div>
      <div style="flex:1"><b>${eksik.length ? `Buluttaki ${eksik.length} dosya bu bilgisayarda yok (${top(eksik)})` : 'Buluttaki bütün dosyalar bu bilgisayarda var'}</b>
        <div class="soluk kucuk-yazi">İndirilenler işlerin klasörlerine konur; klasörü olmayan işler için yeni klasör açılır.</div></div>
      ${eksik.length ? `<button class="dugme ana" id="indirHepsi">${ikon('indir')}Bu bilgisayara indir</button>` : ''}</div>
    <div class="sistem-satir" style="padding:0"><div class="durum-ikon ${yalnizPc.length ? 'opsiyon' : 'ok'}">${ikon(yalnizPc.length ? 'bulut' : 'tamam')}</div>
      <div style="flex:1"><b>${yalnizPc.length ? `Yalnızca bu bilgisayarda ${yalnizPc.length} dosya var (${top(yalnizPc)})` : 'Bu bilgisayardaki dosyaların hepsi bulutta'}</b>
        <div class="soluk kucuk-yazi">Buluta yüklenmeyen dosyalar diğer cihazlarda listede görünür ama açılamaz.</div></div>
      ${yalnizPc.length && !saltOkunur() ? `<button class="dugme" id="yukleHepsi">${ikon('bulut')}Buluta yükle</button>` : ''}</div>
    <div id="esitleDurum" class="soluk kucuk-yazi"></div>`;
  ikonlariDoldur(kutu);
  if ($('#indirHepsi')) $('#indirHepsi').onclick = () => bilgisayaraIndir(eksik);
  if ($('#yukleHepsi')) $('#yukleHepsi').onclick = async () => {
    const d = $('#esitleDurum');
    for (const [n, x] of yalnizPc.entries()) { d.textContent = `${x.ad} yükleniyor (${n + 1}/${yalnizPc.length})…`; await dosyaBulutaYukle(x.id); }
    d.textContent = ''; esitlemeCiz();
  };
}
async function bilgisayaraIndir(eksik) {
  const d = $('#esitleDurum'); let n = 0; const hatalar = [];
  for (const x of eksik) {
    n++; if (d) d.textContent = `${x.ad} indiriliyor (${n}/${eksik.length})…`;
    try {
      const i = BULUT.isler.get(x.is_id); if (!i) continue;
      const klasor = await isKlasoru(i);
      const { data, error } = await BULUT.sb.storage.from('dosyalar').download(x.bulut_yolu);
      if (error) throw sbHata(error);
      await yardimci(`/yaz?klasor=${encodeURIComponent(klasor)}&ad=${encodeURIComponent(x.ad)}&uzerine=1`, { govde: data, sure: 120000 });
    } catch (e) { hatalar.push(`${x.ad}: ${e.message}`); }
  }
  if (d) d.textContent = '';
  bildir(hatalar.length ? `${eksik.length - hatalar.length} dosya indirildi, ${hatalar.length} hata: ${hatalar[0]}` : `${eksik.length} dosya bu bilgisayara indirildi`, hatalar.length ? 'hata' : 'basari');
  if ($('#esitle')) esitlemeCiz();
}

// ------------------------------------------------------------------ bulut.js / is_takip.js kancaları
window.dosyaOturum = async () => {
  await dosyalariIndir();
  if (DOSYA.kurulumYok) return;
  dosyaCanliBaslat();
  try { const { data } = await BULUT.sb.rpc('bulut_kullanim'); if (typeof data === 'number') DOSYA.kullanim = data; } catch (e) { /* */ }
  // yeni bilgisayar: buluttaki dosyalar burada yoksa indirmek için izin iste (oturum başına bir kez)
  setTimeout(async () => {
    if (!(await yardimciDenetle(true)) || !yardimciHazir()) return;
    const { eksik } = await eksikleriBul();
    DOSYA.eksikSayi = eksik.length; kenarYaz();
    let soruldu = false; try { soruldu = sessionStorage.getItem('isTakip.indirSoruldu') === '1'; sessionStorage.setItem('isTakip.indirSoruldu', '1'); } catch (e) { /* */ }
    if (eksik.length && !soruldu && $('#perde').classList.contains('gizli') &&
        await onayla('Dosyalar bu bilgisayara indirilsin mi?', `Buluttaki <b>${eksik.length}</b> dosya (${boyutYaz(eksik.reduce((t, d) => t + (d.boyut || 0), 0))}) bu bilgisayardaki proje klasörlerinde yok. Şimdi indirip ilgili klasörlere koyayım mı?`, 'İndir')) {
      bilgisayaraIndir(eksik);
    }
  }, 1500);
};
window.dosyaKenar = () => DOSYA.eksikSayi ? `<div style="margin-top:4px"><a href="#/dosyalar" style="color:#fbbf24">${DOSYA.eksikSayi} dosya bu bilgisayarda yok</a></div>` : '';
window.dosyalarSayfasi = dosyalarSayfasi;
Object.assign(window.ISTEMCI, {
  isSayfasiSonra(kayit, yeni) {
    const yer = $('#durumlar') && $('#durumlar').closest('.kart'); if (!yer) return;
    const kart = document.createElement('div');
    kart.className = 'kart'; kart.id = 'dosyaKarti'; kart.dataset.is = kayit.id || '';
    if (yeni || DOSYA.kurulumYok) {
      kart.innerHTML = `<div class="kart-bas"><h2>Dosyalar</h2></div><div class="kart-ic soluk kucuk-yazi">${DOSYA.kurulumYok ? 'Dosya özelliği kurulmamış (Dosyalar sayfasına bakın).' : 'İşi kaydettikten sonra dosya ekleyebilirsiniz.'}</div>`;
      yer.after(kart); return;
    }
    yer.after(kart);
    dosyaKartiCiz(kayit.id);
    yardimciDenetle().then(() => dosyaKartiCiz(kayit.id));
  },
  dosyaRozeti(i) {
    const n = isDosyalari(i.id).length;
    return n ? ` · <span class="dosya-rozet" title="${n} dosya">${ikon('atac').replace('<i ', '<i style="width:12px;height:12px;vertical-align:-2px" ')}${n}</span>` : '';
  },
});
