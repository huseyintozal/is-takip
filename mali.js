'use strict';
/* İş Takibi — MALİ TAKİP (yalnızca yönetici)
 *  İşveren:  her işin bir bedeli var (işverenin sabit fiyatı; işe özel fiyat girilirse o). İş açılınca alacağa yazılır.
 *            Alınan ödemeler (tahsilat) düşülür → kalan alacak.
 *  Lab / sondajcı: iş başı maliyet (carinin sabit fiyatı; işe özel girilebilir). Numune laba atılınca lab'a,
 *            sondaj yapılınca sondajcıya borç yazılır. Yapılan ödemeler düşülür → kalan borç.
 *  Veriler: cariler, is_ucretleri, hareketler tabloları (kurulum_mali.sql). */

Object.assign(IKON, {
  para: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  lira: '<path d="M9 4v15a6 6 0 0 0 6-6M6 11l8-3.5M6 15l8-3.5"/>',
});

const MALI = { cariler: new Map(), ucretler: new Map(), hareketler: new Map(), yuklu: false, kurulumYok: false, kanal: null, sekme: 'isveren' };
const CARI_TUR = { isveren: 'İşveren', lab: 'Laboratuvar', sondaj: 'Sondajcı', ozalit: 'Özalit', diger: 'Diğer tedarikçi' };
const TEDARIK_TURLERI = ['lab', 'sondaj', 'ozalit', 'diger'];
const isliTedarik = tur => tur === 'lab' || tur === 'sondaj';      // borcu işlerden kendiliğinden yazılanlar
const maliYetki = () => BULUT.rol === 'yonetici';
const tl = n => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ₺';
const YONTEM = { havale: 'Havale/EFT', nakit: 'Nakit', cek: 'Çek' };
const trTarih = t => t ? new Date(t).toLocaleDateString('tr-TR') : '';
/* Ödemenin yöntemi, çek vadesi ve dekontu (kısa yazı) */
function hareketDetay(h, html = true) {
  const p = [];
  if (h.yontem && YONTEM[h.yontem]) p.push(YONTEM[h.yontem] + (h.yontem === 'cek' && h.cek_vade ? ` (vade ${trTarih(h.cek_vade)})` : ''));
  if (h.aciklama) p.push(h.aciklama);
  const i = h.is_id && BULUT.isler.get(h.is_id); if (i) p.push(kimlik(i));
  let m = html ? p.map(esc).join(' · ') : p.join(' · ');
  if (html && h.dekont) m += ` · <a href="#" data-dekont="${esc(h.dekont)}">${ikon('atac')}dekont</a>`;
  return m;
}
async function dekontAc(yol) {
  const pencere = window.open('', '_blank');
  const { data, error } = await BULUT.sb.storage.from('dosyalar').createSignedUrl(yol, 600);
  if (error) { if (pencere) pencere.close(); return hataGoster(sbHata(error)); }
  if (pencere) pencere.location = data.signedUrl; else location.href = data.signedUrl;
}
const dekontBagla = (kok = document) => $$('[data-dekont]', kok).forEach(a => a.onclick = e => { e.preventDefault(); dekontAc(a.dataset.dekont); });
/* Bir işe bağlı alınan ödemeler */
const isAlinan = isId => [...MALI.hareketler.values()].filter(h => h.tur === 'tahsilat' && h.is_id === isId && !devirMi(h)).reduce((t, h) => t + Number(h.tutar), 0);
function tutarOku(s) {                       // "12.500", "12500", "12.500,50", "12500.5" -> sayı
  s = String(s ?? '').replace(/[^\d.,-]/g, '').trim();
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const bugunIso = () => new Date().toLocaleDateString('sv-SE');

// ------------------------------------------------------------------ veri
async function maliIndir() {
  const tablo = async ad => {
    const { data, error } = await BULUT.sb.from(ad).select('*');
    if (error) { if (/does not exist|schema cache/i.test(error.message)) { MALI.kurulumYok = true; return []; } throw sbHata(error); }
    return data;
  };
  const [c, u, h] = await Promise.all([tablo('cariler'), tablo('is_ucretleri'), tablo('hareketler')]);
  if (MALI.kurulumYok) return;
  MALI.cariler = new Map(c.map(r => [r.id, r]));
  MALI.ucretler = new Map(u.map(r => [r.is_id, r]));
  MALI.hareketler = new Map(h.map(r => [r.id, r]));
  const deneme = await BULUT.sb.from('hareketler').select('id, yontem, cek_vade, dekont').range(0, 0);
  MALI.yontemYok = !!deneme.error;          // kurulum_mali2.sql çalıştırılmamış
  MALI.yuklu = true;
}
function maliCanliBaslat() {
  if (MALI.kanal) BULUT.sb.removeChannel(MALI.kanal);
  let k = BULUT.sb.channel('mali-degisim');
  [['cariler', 'cariler', 'id'], ['is_ucretleri', 'ucretler', 'is_id'], ['hareketler', 'hareketler', 'id']].forEach(([tablo, alan, anahtar]) => {
    k = k.on('postgres_changes', { event: '*', schema: 'public', table: tablo }, o => {
      if (o.eventType === 'DELETE') { if (o.old) MALI[alan].delete(o.old[anahtar]); }
      else if (o.new) MALI[alan].set(o.new[anahtar], o.new);
      maliEkranTazele();
    });
  });
  MALI.kanal = k.subscribe();
}
let maliZaman = null;
function maliEkranTazele() {
  clearTimeout(maliZaman);
  maliZaman = setTimeout(() => {
    if (!$('#perde').classList.contains('gizli')) return maliEkranTazele();
    if (location.hash.startsWith('#/mali')) { const y = icerik().scrollTop; git().then(() => { icerik().scrollTop = y; }); }
    else if ($('#ucretKarti')) maliIsKartiCiz($('#ucretKarti').dataset.is);
  }, 400);
}

const carilerTur = tur => [...MALI.cariler.values()].filter(c => c.tur === tur).sort((a, b) => trSirala(a.ad, b.ad));
const isverenCari = anahtar => [...MALI.cariler.values()].find(c => c.tur === 'isveren' && c.anahtar === anahtar);
async function isverenCariAl(anahtar) {          // yoksa oluştur
  let c = isverenCari(anahtar);
  if (c) return c;
  const { data, error } = await BULUT.sb.from('cariler').upsert({ tur: 'isveren', ad: isverenAdi(anahtar), anahtar }, { onConflict: 'tur,anahtar' }).select().single();
  if (error) throw sbHata(error);
  MALI.cariler.set(data.id, data);
  return data;
}
function varsayilanTedarikci(tur) {
  const l = carilerTur(tur);
  return l.find(c => c.varsayilan) || (l.length === 1 ? l[0] : null);
}

/* İşe ayrıca seçilmemişse sondajcı/lab adını işin notlarından bulur: "ÖMERE ATILDI", "AYGÜN YAPTI" … */
function nottanTedarikci(i, tur) {
  const l = carilerTur(tur); if (!l.length) return null;
  const n = i.alan_notlari || {};
  const metin = katla((tur === 'sondaj' ? [n.sondaj, n.sondaja_atildi] : [n.laba_atildi, n.lab]).filter(Boolean).join(' '));
  if (!metin) return null;
  const bul = l.filter(c => { const ad = katla(c.ad).trim(); return ad && new RegExp('(^|[^A-Z0-9])' + ad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(metin); });
  return bul.length === 1 ? bul[0] : null;
}
/* Sondajı yapılmış / laba atılmış ama kime yapıldığı belli olmayan işler: buradan tek tek seçilir */
function atanmamisKart() {
  const gruplar = [['sondaj', 'sondajci_id', 'Sondajcısı seçilmemiş işler', i => i.sondaj || i.sondaja_atildi],
                   ['lab', 'lab_id', 'Laboratuvarı seçilmemiş işler', i => i.laba_atildi]]
    .filter(([tur]) => carilerTur(tur).length > 1)
    .map(([tur, alan, baslik, kosul]) => ({ tur, alan, baslik, isler: maliIsler().filter(i => kosul(i) && !isMali(i)[tur].cari) }))
    .filter(g => g.isler.length);
  return gruplar.map(g => `<div class="kart"><div class="kart-bas"><h2>${esc(g.baslik)} (${g.isler.length})</h2>
      <span class="aciklama">Seçtiğin kişiye borç yazılır. İş notunda adı geçiyorsa ("ÖMERE ATILDI" gibi) kendiliğinden bulunur.</span></div>
    <div class="tablo-kap"><table class="veri mali-tablo"><tbody>${g.isler.map(i => `<tr>
      <td><a class="ms" href="${isHash(i)}">${esc(i.mal_sahibi || i.mahalle || '—')}</a><div class="kucuk-yazi soluk">${esc(isverenAdi(ik(i.isveren)))} · ${esc(adaParsel(i))}</div></td>
      <td class="kucuk-yazi">${g.tur === 'sondaj' ? (i.sondaj ? 'Sondaj yapıldı' : 'Sondaja atıldı') : 'Laba atıldı'}</td>
      <td style="width:220px"><select class="girdi" data-ata="${esc(i.id)}" data-alan="${g.alan}"><option value="">— seçin —</option>
        ${carilerTur(g.tur).map(c => `<option value="${esc(c.id)}">${esc(c.ad)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div></div>`).join('');
}
/* Bir işin bedeli ve maliyetleri */
function isMali(i) {
  const u = MALI.ucretler.get(i.id) || {};
  const ic = isverenCari(ik(i.isveren));
  const bedel = u.ucret !== null && u.ucret !== undefined ? { tutar: Number(u.ucret), kaynak: 'ozel' }
    : ic && Number(ic.varsayilan_ucret) ? { tutar: Number(ic.varsayilan_ucret), kaynak: 'varsayilan' } : { tutar: 0, kaynak: 'yok' };
  const tedarik = (tur, idAlan, ucretAlan, yapildi) => {
    if (i.mali_kayit) return { cari: null, tutar: 0, yapildi: false, kaynak: 'yok' };     // geçmiş iş: lab/sondaj borcu yazılmaz
    const c = (u[idAlan] && MALI.cariler.get(u[idAlan])) || nottanTedarikci(i, tur) || varsayilanTedarikci(tur);
    if (!c) return { cari: null, tutar: 0, yapildi, kaynak: 'yok' };
    const ozel = u[ucretAlan] !== null && u[ucretAlan] !== undefined;
    return { cari: c, tutar: ozel ? Number(u[ucretAlan]) : Number(c.varsayilan_ucret) || 0, yapildi, kaynak: ozel ? 'ozel' : 'varsayilan', secili: !!u[idAlan] };
  };
  return { bedel, lab: tedarik('lab', 'lab_id', 'lab_ucret', !!i.laba_atildi), sondaj: tedarik('sondaj', 'sondajci_id', 'sondaj_ucret', !!i.sondaj) };
}
const cariHareketleri = id => [...MALI.hareketler.values()].filter(h => h.cari_id === id).sort((a, b) => (a.tarih || '').localeCompare(b.tarih || '') || (a.eklenme || '').localeCompare(b.eklenme || ''));
// Programdan önceki alacaklar (devir): 'tahsilat' türünde EKSİ tutarlı hareket olarak tutulur (ek tablo gerekmesin diye)
const devirMi = h => h.tur === 'tahsilat' && Number(h.tutar) < 0;
// Tedarikçiye önceki borç / elle eklenen borç (özalit faturası vb.): 'odeme' türünde EKSİ tutar
const borcEkMi = h => h.tur === 'odeme' && Number(h.tutar) < 0;
const tumIsverenler = () => [...new Set([...isverenler(), ...carilerTur('isveren').map(c => c.anahtar)])].sort(trSirala);
function isverenOzet(anahtar) {
  const isler = maliIsler().filter(i => ik(i.isveren) === anahtar);
  const c = isverenCari(anahtar);
  const bedel = isler.reduce((t, i) => t + isMali(i).bedel.tutar, 0);
  const fiyatsiz = isler.filter(i => isMali(i).bedel.kaynak === 'yok').length;
  const hr = c ? cariHareketleri(c.id).filter(h => h.tur === 'tahsilat') : [];
  const alinan = hr.filter(h => !devirMi(h)).reduce((t, h) => t + Number(h.tutar), 0);
  const devir = hr.filter(devirMi).reduce((t, h) => t - Number(h.tutar), 0);
  return { anahtar, ad: (c && !isler.length) ? c.ad : isverenAdi(anahtar), cari: c, isler, isBedeli: bedel, devir, bedel: bedel + devir, alinan, kalan: bedel + devir - alinan, fiyatsiz };
}
function tedarikciOzet(c) {
  const alan = c.tur === 'lab' ? 'lab' : 'sondaj';
  const isler = isliTedarik(c.tur) ? maliIsler().map(i => ({ i, m: isMali(i)[alan] })).filter(x => x.m.cari && x.m.cari.id === c.id) : [];
  const yapilan = isler.filter(x => x.m.yapildi);
  const hr = cariHareketleri(c.id).filter(h => h.tur === 'odeme');
  const ekBorc = hr.filter(borcEkMi).reduce((t, h) => t - Number(h.tutar), 0);
  const borc = yapilan.reduce((t, x) => t + x.m.tutar, 0) + ekBorc;
  const odenen = hr.filter(h => !borcEkMi(h)).reduce((t, h) => t + Number(h.tutar), 0);
  return { cari: c, isler, yapilan, bekleyen: isler.length - yapilan.length, ekBorc, borc, odenen, kalan: borc - odenen };
}

// ------------------------------------------------------------------ yazma
async function isUcretKaydet(isId, alanlar) {
  const eski = MALI.ucretler.get(isId) || { is_id: isId };
  const satir = Object.assign({}, eski, alanlar, { is_id: isId, guncelleme: new Date().toISOString() });
  const { data, error } = await BULUT.sb.from('is_ucretleri').upsert(satir, { onConflict: 'is_id' }).select().single();
  if (error) throw sbHata(error);
  MALI.ucretler.set(isId, data);
  return data;
}
async function cariGuncelle(id, alanlar) {
  const { data, error } = await BULUT.sb.from('cariler').update(alanlar).eq('id', id).select().single();
  if (error) throw sbHata(error);
  MALI.cariler.set(id, data);
  return data;
}
async function isverenFiyatDegistir(anahtar, yeni) {
  const c = await isverenCariAl(anahtar);
  const eski = Number(c.varsayilan_ucret) || 0;
  if (eski === yeni) return;
  const etkilenen = maliIsler().filter(i => ik(i.isveren) === anahtar && isMali(i).bedel.kaynak !== 'ozel');
  if (eski && etkilenen.length) {
    const secim = await ikiSecenek('Eski işler ne olsun?', `<b>${esc(c.ad)}</b> fiyatı ${tl(eski)} → <b>${tl(yeni)}</b> oluyor.
      Fiyatı ayrıca girilmemiş <b>${etkilenen.length}</b> iş var.`, `Hepsi yeni fiyattan (${tl(yeni)})`, `Eski işler ${tl(eski)}'de kalsın`);
    if (secim === null) return false;
    if (secim === 2) for (const i of etkilenen) await isUcretKaydet(i.id, { ucret: eski });
  }
  await cariGuncelle(c.id, { varsayilan_ucret: yeni });
  bildir(`${c.ad}: iş başı ${tl(yeni)}`);
  return true;
}
function ikiSecenek(baslik, metin, bir, iki) {
  return new Promise(coz => {
    const p = $('#perde');
    p.innerHTML = `<div class="pencere"><h3>${esc(baslik)}</h3><p>${metin}</p>
      <div class="yigin" style="gap:8px"><button class="dugme ana" data-c="1">${esc(bir)}</button><button class="dugme" data-c="2">${esc(iki)}</button>
      <button class="dugme hayalet" data-c="0">Vazgeç (fiyat değişmesin)</button></div></div>`;
    p.classList.remove('gizli');
    p.onclick = e => { const c = e.target.closest('[data-c]'); if (c || e.target === p) { p.classList.add('gizli'); coz(c && c.dataset.c !== '0' ? +c.dataset.c : null); } };
  });
}
/* İşverenin özel fiyat girilmiş işlerini iş başı fiyata döndürür */
async function ozelFiyatlariKaldir(anahtar) {
  const c = isverenCari(anahtar);
  const l = maliIsler().filter(i => ik(i.isveren) === anahtar && isMali(i).bedel.kaynak === 'ozel');
  if (!l.length || !c) return;
  if (!await onayla('Hepsine iş başı fiyat uygulansın mı?', `<b>${esc(c.ad)}</b>: özel fiyat girilmiş <b>${l.length}</b> işin fiyatı silinecek, hepsi <b>${tl(c.varsayilan_ucret)}</b> üzerinden hesaplanacak.`, 'Uygula')) return;
  for (const i of l) await isUcretKaydet(i.id, { ucret: null });
  bildir(`${l.length} iş ${tl(c.varsayilan_ucret)} üzerinden hesaplanıyor`);
}
function hareketPenceresi({ cari, tur, isler = [], isId = '' }) {
  return new Promise(coz => {
    const p = $('#perde');
    p.innerHTML = `<div class="pencere"><h3>${tur === 'tahsilat' ? 'Ödeme al' : 'Ödeme yap'} — ${esc(cari.ad)}</h3>
      <form id="hForm" class="yigin">
        <div class="form-izgara">
          <div class="alan"><label>Tutar (₺)</label><input class="girdi" id="hTutar" inputmode="decimal" placeholder="örn. 25.000" required></div>
          <div class="alan"><label>Tarih</label><input class="girdi" id="hTarih" type="date" value="${bugunIso()}" required></div>
          ${MALI.yontemYok ? `<div class="alan genis kucuk-yazi" style="color:var(--turuncu)">Ödeme yöntemi, çek tarihi ve dekont için Supabase'de <b>kurulum_mali2.sql</b>'i bir kez çalıştırın.</div>` : `
          <div class="alan"><label>Ödeme yöntemi</label><select class="girdi" id="hYontem"><option value="havale">Havale/EFT</option><option value="nakit">Nakit</option><option value="cek">Çek</option></select></div>
          <div class="alan" id="hCekAlan" style="display:none"><label>Çekin tarihi (vade)</label><input class="girdi" id="hCek" type="date"></div>
          <div class="alan" id="hDekontAlan"><label>Dekont (isteğe bağlı)</label><input class="girdi" id="hDekont" type="file" accept="image/*,application/pdf"></div>`}
          <div class="alan genis"><label>Açıklama</label><input class="girdi" id="hAciklama" placeholder="örn. banka, çek no"></div>
          ${isler.length ? `<div class="alan genis"><label>Hangi iş için? (isteğe bağlı)</label><select class="girdi" id="hIs"><option value="">— Genel ödeme (işe bağlı değil) —</option>
            ${isler.map(i => `<option value="${esc(i.id)}" ${i.id === isId ? 'selected' : ''}>${esc(kimlik(i))}${tur === 'tahsilat' ? ' · ' + tl(isMali(i).bedel.tutar) : ''}</option>`).join('')}</select></div>` : ''}
        </div>
        <div class="dugmeler"><button type="button" class="dugme hayalet" data-c="0">Vazgeç</button><button class="dugme ana" type="submit">${ikon('kaydet')}Kaydet</button></div></form></div>`;
    p.classList.remove('gizli'); ikonlariDoldur(p);
    const kapat = v => { p.classList.add('gizli'); p.innerHTML = ''; coz(v); };
    $('[data-c="0"]', p).onclick = () => kapat(null);
    p.onclick = e => { if (e.target === p) kapat(null); };
    if ($('#hYontem')) {
      const yGoster = () => { const v = $('#hYontem').value; $('#hCekAlan').style.display = v === 'cek' ? '' : 'none'; $('#hDekontAlan').style.display = v === 'havale' ? '' : 'none'; };
      $('#hYontem').onchange = yGoster; yGoster();
    }
    $('#hForm').onsubmit = async e => {
      e.preventDefault();
      const tutar = tutarOku($('#hTutar').value);
      if (!tutar || tutar <= 0) return bildir('Geçerli bir tutar yazın', 'hata');
      const satir = { cari_id: cari.id, tur, tutar, tarih: $('#hTarih').value, aciklama: $('#hAciklama').value.trim(), is_id: ($('#hIs') || {}).value || null, ekleyen: BULUT.eposta };
      if ($('#hYontem')) {
        satir.yontem = $('#hYontem').value;
        if (satir.yontem === 'cek') { if (!$('#hCek').value) return bildir('Çekin tarihini girin', 'hata'); satir.cek_vade = $('#hCek').value; }
        const f = satir.yontem === 'havale' && $('#hDekont').files[0];
        if (f) {
          const dugme = $('#hForm button[type=submit]'); dugme.disabled = true; dugme.textContent = 'Dekont yükleniyor…';
          const yol = `dekont/${Date.now()}-${Math.random().toString(16).slice(2)}.${uzantiAl(f.name) || 'pdf'}`;
          const { error } = await BULUT.sb.storage.from('dosyalar').upload(yol, f, { contentType: f.type || 'application/octet-stream' });
          if (error) { dugme.disabled = false; dugme.textContent = 'Kaydet'; return hataGoster(sbHata(error)); }
          satir.dekont = yol;
        }
      }
      const { data, error } = await BULUT.sb.from('hareketler').insert(satir).select().single();
      if (error) return hataGoster(sbHata(error));
      MALI.hareketler.set(data.id, data);
      bildir(`${tl(tutar)} ${tur === 'tahsilat' ? 'tahsilat' : 'ödeme'} kaydedildi`);
      kapat(data);
    };
    $('#hTutar').focus();
  });
}
/* Programdan önceki alacakları firma firma tek seferde girer */
function devirPenceresi(liste) {
  return new Promise(coz => {
    const p = $('#perde');
    p.innerHTML = `<div class="pencere genis"><h3>Mevcut alacakları gir</h3>
      <p class="kucuk-yazi soluk">Programdaki işler dışında, şu an firmalardan alacağın tutarları yaz. Boş bırakılanlara dokunulmaz.
        Kalan alacağa eklenir; sonra gelen ödemeleri her zamanki gibi "Ödeme al" ile girersin.</p>
      <form id="dForm" class="yigin">
        <div class="form-izgara">
          <div class="alan"><label>Tarih</label><input class="girdi" id="dTarih" type="date" value="${bugunIso()}" required></div>
          <div class="alan"><label>Açıklama</label><input class="girdi" id="dAciklama" value="Önceki alacak (devir)"></div></div>
        <div class="tablo-kap" style="max-height:50vh"><table class="veri mali-tablo"><thead><tr><th>Firma</th><th class="sag">Şu anki kalan</th><th style="width:160px">Eklenecek alacak (₺)</th></tr></thead>
          <tbody>${liste.map(x => `<tr><td>${esc(x.ad)}${x.devir ? `<div class="kucuk-yazi soluk">${tl(x.devir)} devir girilmiş</div>` : ''}</td><td class="sag">${tl(Math.max(0, x.kalan))}</td>
            <td><input class="girdi fiyat-girdi" data-devir="${esc(x.anahtar)}" inputmode="decimal" placeholder="₺"></td></tr>`).join('')}
            <tr><td><input class="girdi" id="dYeniAd" placeholder="Listede olmayan firma adı"></td><td></td><td><input class="girdi fiyat-girdi" id="dYeniTutar" inputmode="decimal" placeholder="₺"></td></tr></tbody></table></div>
        <div class="dugmeler"><button type="button" class="dugme hayalet" data-c="0">Vazgeç</button><button class="dugme ana" type="submit">${ikon('kaydet')}Kaydet</button></div></form></div>`;
    p.classList.remove('gizli'); ikonlariDoldur(p);
    const kapat = v => { p.classList.add('gizli'); p.innerHTML = ''; coz(v); };
    $('[data-c="0"]', p).onclick = () => kapat(false);
    p.onclick = e => { if (e.target === p) kapat(false); };
    $('#dForm').onsubmit = async e => {
      e.preventDefault();
      const girilen = $$('[data-devir]', p).map(g => ({ anahtar: g.dataset.devir, deger: g.value.trim() })).filter(x => x.deger);
      const yeniAd = $('#dYeniAd').value.trim(), yeniT = $('#dYeniTutar').value.trim();
      if (yeniAd && yeniT) girilen.push({ anahtar: ik(yeniAd), ad: yeniAd, deger: yeniT });
      for (const x of girilen) { const n = tutarOku(x.deger); if (!n || n <= 0) return bildir(`Geçerli bir tutar yazın: ${x.deger}`, 'hata'); x.tutar = n; }
      if (!girilen.length) return kapat(false);
      const dugme = $('#dForm button[type=submit]'); dugme.disabled = true;
      try {
        for (const x of girilen) {
          let c = isverenCari(x.anahtar);
          if (!c && x.ad) {
            const { data, error } = await BULUT.sb.from('cariler').upsert({ tur: 'isveren', ad: x.ad.toLocaleUpperCase('tr'), anahtar: x.anahtar }, { onConflict: 'tur,anahtar' }).select().single();
            if (error) throw sbHata(error);
            MALI.cariler.set(data.id, data); c = data;
          }
          if (!c) c = await isverenCariAl(x.anahtar);
          const { data, error } = await BULUT.sb.from('hareketler').insert({ cari_id: c.id, tur: 'tahsilat', tutar: -x.tutar, tarih: $('#dTarih').value,
            aciklama: $('#dAciklama').value.trim(), is_id: null, ekleyen: BULUT.eposta }).select().single();
          if (error) throw sbHata(error);
          MALI.hareketler.set(data.id, data);
        }
        bildir(`${girilen.length} firmaya toplam ${tl(girilen.reduce((t, x) => t + x.tutar, 0))} alacak eklendi`);
        kapat(true);
      } catch (x2) { dugme.disabled = false; hataGoster(x2); }
    };
  });
}
/* Mali takibe, iş takibinde görünmeyen geçmiş/dış iş ekler (durumu "Bitti") */
function gecmisIsPenceresi(anahtar) {
  return new Promise(coz => {
    const c = isverenCari(anahtar);
    const p = $('#perde');
    p.innerHTML = `<div class="pencere"><h3>Geçmiş iş ekle — ${esc(c ? c.ad : isverenAdi(anahtar))}</h3>
      <p class="kucuk-yazi soluk">Yalnızca mali takipte görünür, iş takibi listesine girmez. Durumu "Bitti" olur.</p>
      <form id="gForm" class="yigin"><div class="form-izgara">
        <div class="alan genis"><label>Mal sahibi</label><input class="girdi" id="gMs" required></div>
        <div class="alan genis"><label>Mahalle (isteğe bağlı)</label><input class="girdi" id="gMah"></div>
        <div class="alan"><label>Ada</label><input class="girdi" id="gAda" inputmode="numeric"></div>
        <div class="alan"><label>Parsel</label><input class="girdi" id="gParsel" required></div>
        <div class="alan genis"><label>Bedel (₺)</label><input class="girdi" id="gBedel" inputmode="decimal" placeholder="${c && Number(c.varsayilan_ucret) ? 'boş = iş başı fiyat (' + tl(c.varsayilan_ucret) + ')' : 'örn. 60.000'}"></div>
        <div class="alan genis"><label class="secim"><input type="checkbox" id="gDevam"> Kaydettikten sonra yeni iş ekle</label></div>
      </div><div class="dugmeler"><button type="button" class="dugme hayalet" data-c="0">Kapat</button><button class="dugme ana" type="submit">${ikon('kaydet')}Kaydet</button></div></form></div>`;
    p.classList.remove('gizli'); ikonlariDoldur(p);
    let eklenen = 0;
    const kapat = () => { p.classList.add('gizli'); p.innerHTML = ''; coz(eklenen); };
    $('[data-c="0"]', p).onclick = kapat;
    p.onclick = e => { if (e.target === p) kapat(); };
    $('#gMs').focus();
    $('#gForm').onsubmit = async e => {
      e.preventDefault();
      const bedel = $('#gBedel').value.trim() ? tutarOku($('#gBedel').value) : null;
      if ($('#gBedel').value.trim() && !bedel) return bildir('Geçerli bir bedel yazın', 'hata');
      try {
        const cari = await isverenCariAl(anahtar);
        const govde = { isveren: cari.ad, mal_sahibi: $('#gMs').value.trim().toLocaleUpperCase('tr'), mahalle: $('#gMah').value.trim().toLocaleUpperCase('tr'),
          ada: $('#gAda').value.trim(), parsel: $('#gParsel').value.trim() };
        VERI_DURUM.forEach(a => { govde[a] = true; }); govde.bina_yikildi = 'evet';
        const { is: yeni } = isTemizle(govde, null, BULUT.eposta);
        yeni.mali_kayit = true; yeni.sira = Date.now();
        const { error } = await BULUT.sb.from('isler').insert({ id: yeni.id, veri: yeni, guncelleyen: BULUT.eposta });
        if (error) throw sbHata(error);
        BULUT.isler.set(yeni.id, yeni);
        if (bedel) await isUcretKaydet(yeni.id, { ucret: bedel });
        eklenen++; bildir(`${yeni.mal_sahibi} eklendi`);
        if ($('#gDevam').checked) { ['#gMs', '#gMah', '#gAda', '#gParsel', '#gBedel'].forEach(k => { $(k).value = ''; }); $('#gMs').focus(); }
        else kapat();
      } catch (x2) { hataGoster(x2); }
    };
  });
}
/* Müşteriye gönderilecek cari hesap ekstresi: yazdır › "PDF olarak kaydet" */
function cariEkstre(anahtar) {
  const x = isverenOzet(anahtar);
  const hr = x.cari ? cariHareketleri(x.cari.id).filter(h => h.tur === 'tahsilat') : [];
  const devirler = hr.filter(devirMi), odemeler = hr.filter(h => !devirMi(h));
  const satirIs = x.isler.map((i, n) => { const m = isMali(i); const al = isAlinan(i.id);
    return `<tr><td>${n + 1}</td><td>${esc(i.mal_sahibi || '—')}</td><td>${esc(i.mahalle || '')}</td><td>${esc(adaParsel(i))}</td>
      <td>${i.mali_kayit || isDurumu(i).bitti ? 'Bitti' : esc(isDurumu(i).asama.ad)}</td><td class="s">${tl(m.bedel.tutar)}</td><td class="s">${al ? tl(al) : ''}</td></tr>`; }).join('');
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(x.ad)} cari ekstre ${bugun()}</title><style>
    @page { size: A4; margin: 14mm; } body { font: 12px/1.45 "Segoe UI", Arial, sans-serif; color: #111; margin: 0; }
    h1 { font-size: 20px; margin: 0 0 2px; } .alt { color: #555; margin-bottom: 14px; } h2 { font-size: 14px; margin: 18px 0 6px; }
    table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #ddd; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 600; } .s { text-align: right; white-space: nowrap; } tfoot td { font-weight: 700; border-top: 2px solid #111; }
    .ozet { display: flex; gap: 10px; margin: 10px 0 4px; } .ozet div { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; }
    .ozet b { display: block; font-size: 16px; } .kalan { border-color: #111 !important; }
  </style></head><body>
    <h1>${esc(x.ad)} — Cari hesap ekstresi</h1><div class="alt">Tarih: ${bugun()}</div>
    <div class="ozet"><div>Toplam bedel<b>${tl(x.bedel)}</b></div><div>Alınan<b>${tl(x.alinan)}</b></div><div class="kalan">${x.kalan < 0 ? 'Fazla ödenen' : 'Kalan borç'}<b>${tl(Math.abs(x.kalan))}</b></div></div>
    ${devirler.length ? `<h2>Önceki bakiye (devir)</h2><table><thead><tr><th>Tarih</th><th>Açıklama</th><th class="s">Tutar</th></tr></thead><tbody>
      ${devirler.map(h => `<tr><td>${trTarih(h.tarih)}</td><td>${esc(h.aciklama)}</td><td class="s">${tl(-h.tutar)}</td></tr>`).join('')}</tbody></table>` : ''}
    <h2>İşler (${x.isler.length})</h2><table><thead><tr><th>#</th><th>Mal sahibi</th><th>Mahalle</th><th>Ada/Parsel</th><th>Durum</th><th class="s">Bedel</th><th class="s">Bu işe ödenen</th></tr></thead>
      <tbody>${satirIs || '<tr><td colspan="7">İş yok</td></tr>'}</tbody><tfoot><tr><td colspan="5">Toplam</td><td class="s">${tl(x.isBedeli)}</td><td></td></tr></tfoot></table>
    <h2>Alınan ödemeler (${odemeler.length})</h2><table><thead><tr><th>Tarih</th><th>Yöntem</th><th>Açıklama</th><th class="s">Tutar</th></tr></thead>
      <tbody>${odemeler.map(h => { const i = h.is_id && BULUT.isler.get(h.is_id);
        return `<tr><td>${trTarih(h.tarih)}</td><td>${esc(YONTEM[h.yontem] || '')}${h.yontem === 'cek' && h.cek_vade ? ' (vade ' + trTarih(h.cek_vade) + ')' : ''}</td>
          <td>${esc([h.aciklama, i ? kimlik(i) : ''].filter(Boolean).join(' · '))}</td><td class="s">${tl(h.tutar)}</td></tr>`; }).join('') || '<tr><td colspan="4">Ödeme yok</td></tr>'}</tbody>
      <tfoot><tr><td colspan="3">Toplam alınan</td><td class="s">${tl(x.alinan)}</td></tr></tfoot></table>
    <h2>Özet</h2><table><tbody>
      ${x.devir ? `<tr><td>Önceki bakiye</td><td class="s">${tl(x.devir)}</td></tr>` : ''}
      <tr><td>İş bedelleri toplamı</td><td class="s">${tl(x.isBedeli)}</td></tr><tr><td>Alınan ödemeler</td><td class="s">− ${tl(x.alinan)}</td></tr></tbody>
      <tfoot><tr><td>${x.kalan < 0 ? 'Fazla ödenen' : 'Kalan borç'}</td><td class="s">${tl(Math.abs(x.kalan))}</td></tr></tfoot></table>
  </body></html>`;
  // telefonda yeni sekmede, bilgisayarda gizli çerçevede yazdır (Yazdır › "PDF olarak kaydet")
  if (/iPhone|iPad|Android/i.test(navigator.userAgent)) {
    const w = window.open('', '_blank'); if (!w) return bildir('Açılır pencereye izin verin', 'hata');
    w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); return;
  }
  let f = $('#ekstreCerceve'); if (f) f.remove();
  f = document.createElement('iframe'); f.id = 'ekstreCerceve';
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(f);
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); }, 300);
  bildir('Yazdır penceresinde "PDF olarak kaydet"i seçin');
}
/* Tedarikçilere (sondajcı, lab, özalit…) geçmişten gelen borçları tek seferde girer */
function tedarikBorcPenceresi(liste) {
  return new Promise(coz => {
    const p = $('#perde');
    p.innerHTML = `<div class="pencere genis"><h3>Mevcut borçları gir</h3>
      <p class="kucuk-yazi soluk">Programdaki işler dışında, şu an tedarikçilere olan borcunu yaz. Boş bırakılanlara dokunulmaz. Sonraki ödemeleri "Ödeme yap" ile girersin.</p>
      <form id="tbForm" class="yigin">
        <div class="form-izgara">
          <div class="alan"><label>Tarih</label><input class="girdi" id="tbTarih" type="date" value="${bugunIso()}" required></div>
          <div class="alan"><label>Açıklama</label><input class="girdi" id="tbAciklama" value="Önceki borç (devir)"></div></div>
        <div class="tablo-kap" style="max-height:50vh"><table class="veri mali-tablo"><thead><tr><th>Tedarikçi</th><th>Tür</th><th class="sag">Şu anki borç</th><th style="width:160px">Eklenecek borç (₺)</th></tr></thead>
          <tbody>${liste.map(x => `<tr><td>${esc(x.cari.ad)}${x.ekBorc ? `<div class="kucuk-yazi soluk">${tl(x.ekBorc)} önceki borç girilmiş</div>` : ''}</td><td class="kucuk-yazi">${esc(CARI_TUR[x.cari.tur])}</td>
            <td class="sag">${tl(Math.max(0, x.kalan))}</td><td><input class="girdi fiyat-girdi" data-tborc="${esc(x.cari.id)}" inputmode="decimal" placeholder="₺"></td></tr>`).join('')}
            <tr><td><input class="girdi" id="tbYeniAd" placeholder="Listede olmayan (örn. özalitçi adı)"></td>
              <td><select class="girdi" id="tbYeniTur"><option value="ozalit">Özalit</option><option value="sondaj">Sondajcı</option><option value="lab">Laboratuvar</option><option value="diger">Diğer</option></select></td>
              <td></td><td><input class="girdi fiyat-girdi" id="tbYeniTutar" inputmode="decimal" placeholder="₺"></td></tr></tbody></table></div>
        <div class="dugmeler"><button type="button" class="dugme hayalet" data-c="0">Vazgeç</button><button class="dugme ana" type="submit">${ikon('kaydet')}Kaydet</button></div></form></div>`;
    p.classList.remove('gizli'); ikonlariDoldur(p);
    const kapat = v => { p.classList.add('gizli'); p.innerHTML = ''; coz(v); };
    $('[data-c="0"]', p).onclick = () => kapat(false);
    p.onclick = e => { if (e.target === p) kapat(false); };
    $('#tbForm').onsubmit = async e => {
      e.preventDefault();
      const girilen = $$('[data-tborc]', p).filter(g => g.value.trim()).map(g => ({ id: g.dataset.tborc, deger: g.value.trim() }));
      const yeniAd = $('#tbYeniAd').value.trim(), yeniT = $('#tbYeniTutar').value.trim();
      if (yeniAd && yeniT) girilen.push({ yeniAd, tur: $('#tbYeniTur').value, deger: yeniT });
      for (const x of girilen) { const n = tutarOku(x.deger); if (!n || n <= 0) return bildir(`Geçerli bir tutar yazın: ${x.deger}`, 'hata'); x.tutar = n; }
      if (!girilen.length) return kapat(false);
      const d = $('#tbForm button[type=submit]'); d.disabled = true;
      try {
        for (const x of girilen) {
          let id = x.id;
          if (!id) {
            const { data, error } = await BULUT.sb.from('cariler').upsert({ tur: x.tur, ad: x.yeniAd.toLocaleUpperCase('tr'), anahtar: ik(x.yeniAd) }, { onConflict: 'tur,anahtar' }).select().single();
            if (error) throw /check constraint|violates check/i.test(error.message) ? new Error("Özalit ve diğer tedarikçiler için Supabase'de kurulum_mali3.sql'i bir kez çalıştırın") : sbHata(error);
            MALI.cariler.set(data.id, data); id = data.id;
          }
          const { data, error } = await BULUT.sb.from('hareketler').insert({ cari_id: id, tur: 'odeme', tutar: -x.tutar, tarih: $('#tbTarih').value,
            aciklama: $('#tbAciklama').value.trim(), is_id: null, ekleyen: BULUT.eposta }).select().single();
          if (error) throw sbHata(error);
          MALI.hareketler.set(data.id, data);
        }
        bildir(`${girilen.length} tedarikçiye toplam ${tl(girilen.reduce((t, x) => t + x.tutar, 0))} borç eklendi`);
        kapat(true);
      } catch (x2) { d.disabled = false; hataGoster(x2); }
    };
  });
}
/* Tek bir tedarikçiye borç ekler (özalit faturası, ek iş…) */
function borcEklePenceresi(c) {
  return new Promise(coz => {
    const p = $('#perde');
    p.innerHTML = `<div class="pencere"><h3>Borç ekle — ${esc(c.ad)}</h3>
      <form id="beForm" class="yigin"><div class="form-izgara">
        <div class="alan"><label>Tutar (₺)</label><input class="girdi" id="beTutar" inputmode="decimal" required></div>
        <div class="alan"><label>Tarih</label><input class="girdi" id="beTarih" type="date" value="${bugunIso()}" required></div>
        <div class="alan genis"><label>Açıklama</label><input class="girdi" id="beAciklama" placeholder="örn. ekim ayı özalit, önceki borç"></div></div>
        <div class="dugmeler"><button type="button" class="dugme hayalet" data-c="0">Vazgeç</button><button class="dugme ana" type="submit">${ikon('kaydet')}Kaydet</button></div></form></div>`;
    p.classList.remove('gizli'); ikonlariDoldur(p); $('#beTutar').focus();
    const kapat = v => { p.classList.add('gizli'); p.innerHTML = ''; coz(v); };
    $('[data-c="0"]', p).onclick = () => kapat(false);
    p.onclick = e => { if (e.target === p) kapat(false); };
    $('#beForm').onsubmit = async e => {
      e.preventDefault();
      const n = tutarOku($('#beTutar').value); if (!n || n <= 0) return bildir('Geçerli bir tutar yazın', 'hata');
      const { data, error } = await BULUT.sb.from('hareketler').insert({ cari_id: c.id, tur: 'odeme', tutar: -n, tarih: $('#beTarih').value,
        aciklama: $('#beAciklama').value.trim() || 'Borç', is_id: null, ekleyen: BULUT.eposta }).select().single();
      if (error) return hataGoster(sbHata(error));
      MALI.hareketler.set(data.id, data); bildir(`${tl(n)} borç eklendi`); kapat(true);
    };
  });
}
/* Firma firma mali hesap Excel'i (her firma bir sayfa, ilk sayfa özet) — eski Excel'lerle aynı düzen */
function isRaporMetni(i) {
  const mah = String(i.mahalle || '').toLocaleUpperCase('tr').replace(/\s*(MAHALLESİ|MAH\.?)$/, '').trim();
  const ap = i.ada && !/^(-|0)$/.test(String(i.ada).trim()) ? `${i.ada} ADA ${i.parsel} PARSEL` : `${i.parsel} PARSEL`;
  return [mah ? mah + ' MAH' : '', i.parsel ? ap : '', i.mal_sahibi || ''].filter(Boolean).join(' ');
}
function maliExcel(anahtarlar, dosyaAdi) {
  const tarihD = t => { if (!t) return null; const d = new Date(String(t).length <= 10 ? t + 'T12:00:00' : t); return isNaN(d) ? null : d; };
  const ozet = [[{ v: 'FİRMA', s: 'baslik' }, { v: 'İŞ SAYISI', s: 'baslik' }, { v: 'TOPLAM BEDEL', s: 'baslik' }, { v: 'ALINAN', s: 'baslik' }, { v: 'KALAN BORÇ', s: 'baslik' }]];
  const sayfalar = [];
  let tB = 0, tA = 0, tK = 0;
  for (const a of anahtarlar) {
    const x = isverenOzet(a);
    if (!x.isler.length && !x.bedel && !x.alinan) continue;
    const hr = x.cari ? cariHareketleri(x.cari.id).filter(h => h.tur === 'tahsilat') : [];
    const kayitlar = [];
    hr.filter(devirMi).forEach(h => kayitlar.push({ sira: 0, t: tarihD(h.tarih), m: h.aciklama || 'ESKİ HESAPTAN KALAN', b: -Number(h.tutar), a: null }));
    x.isler.forEach(i => { const m = isMali(i); kayitlar.push({ sira: 1, t: tarihD(i.olusturma), m: isRaporMetni(i) + (i.mali_kayit || isDurumu(i).bitti ? '' : ` (${isDurumu(i).asama.ad})`), b: m.bedel.tutar || null, a: null }); });
    hr.filter(h => !devirMi(h)).forEach(h => kayitlar.push({ sira: 1, t: tarihD(h.tarih), m: hareketDetay(h, false) || 'ÖDEME', b: null, a: Number(h.tutar) }));
    kayitlar.sort((p, q) => p.sira - q.sira || (p.t && q.t ? p.t - q.t : p.t ? 1 : q.t ? -1 : 0));
    const satirlar = [[{ v: 'TARİH', s: 'baslik' }, { v: 'RAPOR BİLGİLERİ', s: 'baslik' }, { v: 'RAPOR BEDELİ', s: 'baslik' }, { v: 'ALINAN', s: 'baslik' }],
      ...kayitlar.map(k => [k.t ? { v: k.t, s: 'tarih' } : { v: '', s: 'metin' }, { v: k.m, s: 'metin' }, { v: k.b, s: 'para' }, { v: k.a, s: 'para' }]),
      [], [null, null, { v: 'TOPLAM', s: 'kalin' }, { v: 'ALINAN TOP.', s: 'kalin' }],
      [null, null, { v: x.bedel, s: 'kalinPara' }, { v: x.alinan, s: 'kalinPara' }], [],
      [null, null, { v: x.kalan < 0 ? 'FAZLA ÖDEME' : 'BORÇ', s: 'kalin' }, { v: Math.abs(x.kalan), s: 'kalinPara' }]];
    sayfalar.push({ ad: x.ad, genislik: [13, 70, 16, 16], satirlar });
    ozet.push([{ v: x.ad, s: 'metin' }, { v: x.isler.length, s: 'metin' }, { v: x.bedel, s: 'para' }, { v: x.alinan, s: 'para' }, { v: x.kalan, s: 'para' }]);
    tB += x.bedel; tA += x.alinan; tK += x.kalan;
  }
  if (!sayfalar.length) return bildir('Aktarılacak mali kayıt yok', 'hata');
  if (sayfalar.length > 1) { ozet.push([{ v: 'TOPLAM', s: 'kalin' }, null, { v: tB, s: 'kalinPara' }, { v: tA, s: 'kalinPara' }, { v: tK, s: 'kalinPara' }]); sayfalar.unshift({ ad: 'ÖZET', genislik: [30, 11, 18, 18, 18], satirlar: ozet }); }
  blobIndir(xlsxYaz(sayfalar), dosyaAdi);
  bildir('Excel indirildi');
}
async function hareketSil(id) {
  const h = MALI.hareketler.get(id); if (!h) return;
  if (!await onayla('Kayıt silinsin mi?', `${esc(new Date(h.tarih).toLocaleDateString('tr-TR'))} tarihli <b>${tl(Math.abs(h.tutar))}</b> ${devirMi(h) ? 'devir alacak' : borcEkMi(h) ? 'borç kaydı' : h.tur === 'tahsilat' ? 'tahsilat' : 'ödeme'} silinecek.`, 'Sil', true)) return false;
  const { error } = await BULUT.sb.from('hareketler').delete().eq('id', id);
  if (error) { hataGoster(sbHata(error)); return false; }
  MALI.hareketler.delete(id); return true;
}

// ------------------------------------------------------------------ sayfalar
const kalanEtiket = (n, alacak = true) => n > 0.004 ? `<span class="etiket ${alacak ? 'turuncu' : 'kirmizi'}">${tl(n)}</span>`
  : n < -0.004 ? `<span class="etiket vurgu" title="Fazla ödeme">${tl(-n)} fazla</span>` : '<span class="etiket yesil">Kapandı</span>';
function maliKurulumKutusu() {
  return `<div class="kutu uyari">${ikon('uyari')}<div><b>Mali takip henüz kurulmamış.</b> Supabase'de SQL Editor'de <b>kurulum_mali.sql</b>'i çalıştırıp sayfayı yenileyin.</div></div>`;
}
async function maliSayfasi(rest) {
  if (!maliYetki()) { location.hash = '#/isler'; return; }
  if (!MALI.yuklu && !MALI.kurulumYok) await maliIndir();
  if (MALI.kurulumYok) return sayfaYaz(`<div class="ust"><div><h1>Mali takip</h1></div></div>${maliKurulumKutusu()}`);
  IT.isler = tumIsler(); IT.kopyalar = [];
  if (rest[0] === 'aktar') return maliAktarSayfasi();
  if (rest[0] === 'isveren' && rest[1]) return isverenHesapSayfasi(ik(rest[1]));
  if (rest[0] === 'cari' && rest[1]) return tedarikciSayfasi(rest[1]);
  const isverenler_ = tumIsverenler().map(isverenOzet).sort((a, b) => b.kalan - a.kalan || trSirala(a.ad, b.ad));
  const tedarik = TEDARIK_TURLERI.flatMap(t => carilerTur(t)).map(tedarikciOzet);
  const toplamAlacak = isverenler_.reduce((t, x) => t + Math.max(0, x.kalan), 0);
  // alınan ödemeler: seçilen döneme göre (bu ay, geçen ay, son 3 ay, bu yıl, geçen yıl, tümü)
  const DONEMLER = { buay: 'Bu ay', gecenay: 'Geçen ay', son3: 'Son 3 ay', buyil: 'Bu yıl', gecenyil: 'Geçen yıl', tumu: 'Toplam (tümü)' };
  const donem = DONEMLER[depoOku('maliDonem', 'buay')] ? depoOku('maliDonem', 'buay') : 'buay';
  const bt = new Date(), iso = d => d.toISOString().slice(0, 10), yil = bt.getFullYear(), ayNo = bt.getMonth();
  const aralik = { buay: [iso(new Date(Date.UTC(yil, ayNo, 1))), '9999'], gecenay: [iso(new Date(Date.UTC(yil, ayNo - 1, 1))), iso(new Date(Date.UTC(yil, ayNo, 0)))],
    son3: [iso(new Date(Date.UTC(yil, ayNo - 2, 1))), '9999'], buyil: [yil + '-01-01', '9999'], gecenyil: [(yil - 1) + '-01-01', (yil - 1) + '-12-31'], tumu: ['', '9999'] }[donem];
  const alinanDonem = [...MALI.hareketler.values()].filter(h => h.tur === 'tahsilat' && !devirMi(h) && (h.tarih || '') >= aralik[0] && (h.tarih || '') <= aralik[1]).reduce((t, h) => t + Number(h.tutar), 0);
  const borc = t => tedarik.filter(x => x.cari.tur === t).reduce((s, x) => s + Math.max(0, x.kalan), 0);
  const fiyatsiz = isverenler_.reduce((t, x) => t + x.fiyatsiz, 0);
  const sekme = MALI.sekme;
  sayfaYaz(`<div class="ust"><div><h1>Mali takip</h1><div class="alt">İşveren alacakları, laboratuvar ve sondajcı borçları</div></div>
      <div class="bosluk"></div><button class="dugme" id="maliExcelVer">${ikon('indir')}Firma hesaplarını Excel'e ver</button><a class="dugme" href="#/mali/aktar">${ikon('yukle')}Excel hesaplarını aktar</a></div>
    <div class="ozet-kutular mali-kutular">
      <div class="kart ozet-kutu"><div class="simge turuncu">${ikon('lira')}</div><div><div class="sayi">${tl(toplamAlacak)}</div><div class="baslik">İşverenlerden alacak</div></div></div>
      <div class="kart ozet-kutu"><div class="simge yesil">${ikon('para')}</div><div><div class="sayi">${tl(alinanDonem)}</div><div class="baslik"><select id="maliDonem" class="donem-sec" title="Dönem">${Object.entries(DONEMLER).map(([k, v]) => `<option value="${k}" ${k === donem ? 'selected' : ''}>${v} alınan</option>`).join('')}</select></div></div></div>
      <div class="kart ozet-kutu"><div class="simge vurgu">${ikon('deney')}</div><div><div class="sayi">${tl(borc('lab'))}</div><div class="baslik">Laboratuvara borç</div></div></div>
      <div class="kart ozet-kutu"><div class="simge">${ikon('saat')}</div><div><div class="sayi">${tl(borc('sondaj'))}</div><div class="baslik">Sondajcıya borç</div></div></div>
      ${tedarik.some(x => !isliTedarik(x.cari.tur)) ? `<div class="kart ozet-kutu"><div class="simge">${ikon('belge')}</div><div><div class="sayi">${tl(borc('ozalit') + borc('diger'))}</div><div class="baslik">Özalit ve diğer borç</div></div></div>` : ''}
    </div>
    ${fiyatsiz ? `<div class="kutu uyari" style="margin-bottom:14px">${ikon('uyari')}<div><b>${fiyatsiz} işin fiyatı yok.</b> İşverenlerin iş başı fiyatını aşağıdaki tabloda yazın; işe özel fiyat iş sayfasından girilir.</div></div>` : ''}
    <div class="secenekler mali-sekme" style="margin-bottom:14px">
      <button data-sekme="isveren" class="${sekme === 'isveren' ? 'secili' : ''}">${ikon('musteri')}İşverenler</button>
      <button data-sekme="tedarik" class="${sekme === 'tedarik' ? 'secili' : ''}">${ikon('deney')}Laboratuvar ve sondaj</button>
      <button data-sekme="hareket" class="${sekme === 'hareket' ? 'secili' : ''}">${ikon('liste')}Hareketler</button></div>
    <div id="maliIcerik"></div>`);
  $$('[data-sekme]').forEach(b => b.onclick = () => { MALI.sekme = b.dataset.sekme; maliSayfasi([]); });
  $('#maliExcelVer').onclick = () => maliExcel(tumIsverenler().map(isverenOzet).sort((a, b) => trSirala(a.ad, b.ad)).map(x => x.anahtar), `Mali takip ${bugun()}.xlsx`);
  $('#maliDonem').onchange = e => { depoYaz('maliDonem', e.target.value); maliSayfasi([]); };
  const kutu = $('#maliIcerik');
  if (sekme === 'isveren') {
    kutu.innerHTML = `<div class="kart"><div class="kart-bas"><h2>İşverenler</h2><span class="aciklama">Programa girmemiş eski alacakları "Mevcut alacakları gir" ile ekleyin</span>
        <div style="flex:1"></div><button class="dugme" id="devirGir">${ikon('arti')}Mevcut alacakları gir</button></div>
      <div class="tablo-kap"><table class="veri mali-tablo"><thead><tr>
        <th>İşveren</th><th class="sag">İş</th><th style="width:150px">İş başı fiyat</th><th class="sag">Toplam bedel</th><th class="sag">Alınan</th><th class="sag">Kalan</th><th></th></tr></thead>
      <tbody>${isverenler_.map(x => `<tr data-isveren="${esc(x.anahtar)}">
        <td><a href="#/mali/isveren/${encodeURIComponent(x.anahtar)}" class="ms">${esc(x.ad)}</a>${x.fiyatsiz ? `<div class="kucuk-yazi" style="color:var(--turuncu)">${x.fiyatsiz} iş fiyatsız</div>` : ''}</td>
        <td class="sag">${x.isler.length}</td>
        <td><input class="girdi fiyat-girdi" data-fiyat="${esc(x.anahtar)}" inputmode="decimal" value="${x.cari && Number(x.cari.varsayilan_ucret) ? esc(String(Number(x.cari.varsayilan_ucret))) : ''}" placeholder="₺">${(() => { const n = x.isler.filter(i => isMali(i).bedel.kaynak === 'ozel').length; return n && x.cari && Number(x.cari.varsayilan_ucret) ? `<div class="kucuk-yazi soluk">${n} iş özel fiyatta · <a href="#" data-hepsine="${esc(x.anahtar)}">hepsine uygula</a></div>` : ''; })()}</td>
        <td class="sag">${tl(x.bedel)}${x.devir ? `<div class="kucuk-yazi soluk">${tl(x.devir)} devir dahil</div>` : ''}</td><td class="sag">${tl(x.alinan)}</td><td class="sag">${!x.bedel && !x.alinan ? '<span class="soluk">—</span>' : kalanEtiket(x.kalan)}</td>
        <td class="sag"><button class="dugme kucuk" data-tahsil="${esc(x.anahtar)}">${ikon('arti')}Ödeme al</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td><b>Toplam</b></td><td class="sag">${isverenler_.reduce((t, x) => t + x.isler.length, 0)}</td><td></td>
        <td class="sag"><b>${tl(isverenler_.reduce((t, x) => t + x.bedel, 0))}</b></td><td class="sag"><b>${tl(isverenler_.reduce((t, x) => t + x.alinan, 0))}</b></td>
        <td class="sag"><b>${tl(isverenler_.reduce((t, x) => t + x.kalan, 0))}</b></td><td></td></tr></tfoot></table></div></div>`;
    $$('[data-fiyat]', kutu).forEach(g => g.onchange = async () => {
      const n = tutarOku(g.value);
      if (g.value.trim() && n === null) return bildir('Geçerli bir fiyat yazın', 'hata');
      try { await isverenFiyatDegistir(g.dataset.fiyat, n || 0); maliSayfasi([]); } catch (e) { hataGoster(e); }
    });
    $('#devirGir').onclick = async () => { if (await devirPenceresi(isverenler_)) maliSayfasi([]); };
    $$('[data-hepsine]', kutu).forEach(a => a.onclick = async e => {
      e.preventDefault();
      try { await ozelFiyatlariKaldir(a.dataset.hepsine); maliSayfasi([]); } catch (x2) { hataGoster(x2); }
    });
    $$('[data-tahsil]', kutu).forEach(b => b.onclick = async () => {
      const c = await isverenCariAl(b.dataset.tahsil);
      if (await hareketPenceresi({ cari: c, tur: 'tahsilat', isler: maliIsler().filter(i => ik(i.isveren) === b.dataset.tahsil) })) maliSayfasi([]);
    });
  } else if (sekme === 'tedarik') {
    kutu.innerHTML = `<div class="yigin">
      <div class="kart"><div class="kart-bas"><h2>Tedarikçiler</h2><span class="aciklama">Numune laba atılınca lab'a, sondaj yapılınca sondajcıya borç yazılır</span>
        <div style="flex:1"></div><button class="dugme" id="borcGir">${ikon('arti')}Mevcut borçları gir</button></div>
        ${tedarik.length ? `<div class="tablo-kap"><table class="veri mali-tablo"><thead><tr><th>Ad</th><th>Tür</th><th class="sag">İş başı</th><th class="sag">Yapılan iş</th>
          <th class="sag">Toplam borç</th><th class="sag">Ödenen</th><th class="sag">Kalan</th><th></th></tr></thead>
          <tbody>${tedarik.map(x => `<tr><td><a class="ms" href="#/mali/cari/${esc(x.cari.id)}">${esc(x.cari.ad)}</a>${x.cari.varsayilan ? ' <span class="etiket">varsayılan</span>' : ''}</td>
            <td>${esc(CARI_TUR[x.cari.tur])}</td><td class="sag">${isliTedarik(x.cari.tur) ? tl(x.cari.varsayilan_ucret) : '<span class="soluk">—</span>'}</td>
            <td class="sag">${isliTedarik(x.cari.tur) ? x.yapilan.length + (x.bekleyen ? ` <span class="soluk kucuk-yazi">(+${x.bekleyen} bekliyor)</span>` : '') : '<span class="soluk">—</span>'}</td>
            <td class="sag">${tl(x.borc)}${x.ekBorc ? `<div class="kucuk-yazi soluk">${tl(x.ekBorc)} önceki/ek borç dahil</div>` : ''}</td><td class="sag">${tl(x.odenen)}</td><td class="sag">${kalanEtiket(x.kalan, false)}</td>
            <td class="sag"><button class="dugme kucuk" data-ode="${esc(x.cari.id)}">${ikon('arti')}Ödeme yap</button></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="kart-ic soluk">Henüz laboratuvar, sondajcı ya da özalitçi eklenmedi.</div>'}</div>
      ${atanmamisKart()}
      <div class="kart"><div class="kart-bas"><h2>Yeni ekle</h2></div><div class="kart-ic">
        <form id="cariEkle" class="mali-form">
          <select class="girdi" id="cTur"><option value="lab">Laboratuvar</option><option value="sondaj">Sondajcı</option><option value="ozalit">Özalit</option><option value="diger">Diğer tedarikçi</option></select>
          <input class="girdi" id="cAd" placeholder="Ad (örn. NİHAT ABİ, ÖMER)" required>
          <input class="girdi" id="cUcret" inputmode="decimal" placeholder="İş başı ücret ₺">
          <label class="secim"><input type="checkbox" id="cVars"> Varsayılan</label>
          <button class="dugme ana" type="submit">${ikon('arti')}Ekle</button></form>
        <div class="ipucu" style="margin-top:8px">Varsayılan: işe ayrıca seçilmezse bu kullanılır. Tek laboratuvar varsa kendiliğinden varsayılandır.</div></div></div></div>`;
    $('#cariEkle').onsubmit = async e => {
      e.preventDefault();
      const ad = $('#cAd').value.trim(), tur = $('#cTur').value;
      const satir = { tur, ad, anahtar: ik(ad), varsayilan_ucret: tutarOku($('#cUcret').value) || 0, varsayilan: $('#cVars').checked };
      try {
        if (satir.varsayilan) for (const c of carilerTur(tur).filter(c => c.varsayilan)) await cariGuncelle(c.id, { varsayilan: false });
        const { data, error } = await BULUT.sb.from('cariler').insert(satir).select().single();
        if (error) throw sbHata(error);
        MALI.cariler.set(data.id, data); bildir(`${ad} eklendi`); maliSayfasi([]);
      } catch (x) { hataGoster(/duplicate|unique/i.test(x.message) ? new Error('Bu adla zaten kayıt var') : /check constraint|violates check/i.test(x.message) ? new Error("Özalit ve diğer tedarikçiler için Supabase'de kurulum_mali3.sql'i bir kez çalıştırın") : x); }
    };
    $$('[data-ata]', kutu).forEach(sel => sel.onchange = async () => {
      try { await isUcretKaydet(sel.dataset.ata, { [sel.dataset.alan]: sel.value || null }); bildir('Kaydedildi'); maliSayfasi([]); } catch (x2) { hataGoster(x2); }
    });
    $('#borcGir').onclick = async () => { if (await tedarikBorcPenceresi(tedarik)) maliSayfasi([]); };
    $$('[data-ode]', kutu).forEach(b => b.onclick = async () => {
      const x = tedarik.find(t => t.cari.id === b.dataset.ode);
      if (await hareketPenceresi({ cari: x.cari, tur: 'odeme', isler: x.yapilan.map(y => y.i) })) maliSayfasi([]);
    });
  } else {
    const liste = [...MALI.hareketler.values()].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '') || (b.eklenme || '').localeCompare(a.eklenme || ''));
    kutu.innerHTML = `<div class="kart">${liste.length ? `<div class="tablo-kap"><table class="veri mali-tablo"><thead><tr><th>Tarih</th><th>Cari</th><th>Tür</th><th class="sag">Tutar</th><th>Açıklama</th><th></th></tr></thead>
      <tbody>${liste.map(h => { const c = MALI.cariler.get(h.cari_id) || {}; const i = h.is_id && BULUT.isler.get(h.is_id);
        return `<tr><td>${esc(new Date(h.tarih).toLocaleDateString('tr-TR'))}</td>
          <td><a href="${c.tur === 'isveren' ? '#/mali/isveren/' + encodeURIComponent(c.anahtar) : '#/mali/cari/' + c.id}">${esc(c.ad || '?')}</a></td>
          <td>${devirMi(h) ? '<span class="etiket turuncu">Devir alacak</span>' : borcEkMi(h) ? '<span class="etiket turuncu">Önceki/ek borç</span>' : h.tur === 'tahsilat' ? '<span class="etiket yesil">Alınan</span>' : '<span class="etiket kirmizi">Ödenen</span>'}</td>
          <td class="sag"><b>${tl(Math.abs(h.tutar))}</b></td><td class="kucuk-yazi">${hareketDetay(h)}<div class="soluk">${esc((h.ekleyen || '').split('@')[0])}</div></td>
          <td class="sag"><button class="dugme kucuk hayalet tehlike" data-hsil="${esc(h.id)}">${ikon('sil')}</button></td></tr>`; }).join('')}</tbody></table></div>`
      : '<div class="kart-ic soluk">Henüz ödeme kaydı yok.</div>'}</div>`;
    $$('[data-hsil]', kutu).forEach(b => b.onclick = async () => { if (await hareketSil(b.dataset.hsil)) maliSayfasi([]); });
    dekontBagla(kutu);
  }
  ikonlariDoldur(kutu);
}

function isverenHesapSayfasi(anahtar) {
  const x = isverenOzet(anahtar);
  IT.kopyalar = [];
  const hareket = x.cari ? cariHareketleri(x.cari.id).filter(h => h.tur === 'tahsilat' && !devirMi(h)) : [];
  const devirler = x.cari ? cariHareketleri(x.cari.id).filter(devirMi) : [];
  const ozetMetin = [`${x.ad} – Hesap özeti (${bugun()})`, '',
    `İş sayısı: ${x.isler.length}`, `Toplam iş bedeli: ${tl(x.bedel)}`, `Alınan: ${tl(x.alinan)}`, `Kalan: ${tl(Math.max(0, x.kalan))}`, '',
    ...(devirler.length ? ['Önceki alacak (devir):', ...devirler.map(h => `- ${new Date(h.tarih).toLocaleDateString('tr-TR')}: ${tl(-h.tutar)}${h.aciklama ? ' (' + h.aciklama + ')' : ''}`), ''] : []),
    'İşler:', ...x.isler.map(i => `- ${kimlik(i)}: ${tl(isMali(i).bedel.tutar)}`),
    ...(hareket.length ? ['', 'Ödemeler:', ...hareket.map(h => `- ${trTarih(h.tarih)}: ${tl(h.tutar)}${hareketDetay(h, false) ? ' (' + hareketDetay(h, false) + ')' : ''}`)] : [])].join('\n');
  sayfaYaz(`<div class="ust"><a class="geri" href="#/mali">${ikon('geri')}</a><div><h1>${esc(x.ad)}</h1><div class="alt">${x.isler.length} iş · bedel ${tl(x.bedel)} · alınan ${tl(x.alinan)}</div></div>
      <div class="bosluk"></div>${kopyaDugmesi(ozetMetin, 'dugme', 'Hesap özetini kopyala')}
      <button class="dugme" id="ekstre">${ikon('indir')}Cari ekstre (PDF)</button>
      <button class="dugme" id="ekstreExcel">${ikon('indir')}Excel</button>
      <button class="dugme ana" id="tahsil">${ikon('arti')}Ödeme al</button></div>
    <div class="ozet-kutular mali-kutular" style="grid-template-columns:repeat(3,1fr)">
      <div class="kart ozet-kutu"><div class="simge">${ikon('liste')}</div><div><div class="sayi">${tl(x.bedel)}</div><div class="baslik">Toplam iş bedeli</div></div></div>
      <div class="kart ozet-kutu"><div class="simge yesil">${ikon('para')}</div><div><div class="sayi">${tl(x.alinan)}</div><div class="baslik">Alınan</div></div></div>
      <div class="kart ozet-kutu"><div class="simge turuncu">${ikon('lira')}</div><div><div class="sayi">${tl(Math.max(0, x.kalan))}</div><div class="baslik">${x.kalan < 0 ? tl(-x.kalan) + ' fazla ödendi' : 'Kalan alacak'}</div></div></div></div>
    <div class="is-duzen">
      <div class="kart"><div class="kart-bas"><h2>İşler</h2><span class="aciklama">Boş bırakılan fiyat iş başı fiyattan gelir</span><div style="flex:1"></div>
        <label class="kucuk-yazi soluk" style="display:flex;gap:6px;align-items:center">İş başı <input class="girdi fiyat-girdi" id="vFiyat" inputmode="decimal" style="width:120px" value="${x.cari && Number(x.cari.varsayilan_ucret) ? Number(x.cari.varsayilan_ucret) : ''}" placeholder="₺"></label>
        ${(() => { const n = x.isler.filter(i => isMali(i).bedel.kaynak === 'ozel').length; return n && x.cari && Number(x.cari.varsayilan_ucret) ? `<span class="kucuk-yazi soluk">${n} iş özel fiyatta · <a href="#" id="vHepsine">hepsine uygula</a></span>` : ''; })()}</div>
        <div class="tablo-kap"><table class="veri mali-tablo"><thead><tr><th>Mal sahibi</th><th>Ada/Parsel</th><th>Durum</th><th style="width:150px">Bedel</th><th class="sag">Bu işe alınan</th><th></th></tr></thead>
        <tbody>${x.isler.map(i => { const m = isMali(i); const d = isDurumu(i); const al = isAlinan(i.id);
          return `<tr><td>${i.mali_kayit ? `<span class="ms">${esc(i.mal_sahibi || i.mahalle || '—')}</span>` : `<a class="ms" href="${isHash(i)}">${esc(i.mal_sahibi || i.mahalle || '—')}</a>`}${i.mahalle ? `<div class="kucuk-yazi soluk">${esc(i.mahalle)}</div>` : ''}</td><td>${esc(adaParsel(i))}</td>
            <td>${i.mali_kayit || d.bitti ? '<span class="etiket">Bitti</span>' : `<span class="etiket ${d.asama.renk}">${esc(d.asama.ad)}</span>`}</td>
            <td><input class="girdi fiyat-girdi ${m.bedel.kaynak === 'ozel' ? 'ozel' : ''}" data-isucret="${esc(i.id)}" inputmode="decimal"
              value="${m.bedel.kaynak === 'ozel' ? Number(m.bedel.tutar) : ''}" placeholder="${m.bedel.kaynak === 'varsayilan' ? tl(m.bedel.tutar) : 'fiyat yok'}">
              ${m.bedel.kaynak === 'varsayilan' && x.isler.some(j => isMali(j).bedel.kaynak === 'ozel') ? '<div class="kucuk-yazi" style="color:var(--turuncu)">iş başı fiyattan</div>' : ''}</td>
            <td class="sag">${al ? (m.bedel.tutar && al >= m.bedel.tutar - 0.004 ? `<span class="etiket yesil">${tl(al)} · ödendi</span>` : tl(al)) : '<span class="soluk">—</span>'}</td>
            <td class="sag" style="white-space:nowrap"><button class="dugme kucuk hayalet" data-isode="${esc(i.id)}" title="Yalnızca bu işin ödemesini al">${ikon('arti')}Ödeme</button>
              ${i.mali_kayit ? `<button class="dugme kucuk hayalet tehlike" data-maliissil="${esc(i.id)}" title="Bu kaydı sil">${ikon('sil')}</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
        <div class="kart-ic"><button class="dugme" id="gecmisEkle">${ikon('arti')}Geçmiş / programda olmayan iş ekle</button>
          <span class="kucuk-yazi soluk"> Yalnızca burada görünür, iş takibinde çıkmaz; durumu "Bitti" olur.</span></div></div>
      <div class="yan yigin">${devirler.length ? `<div class="kart"><div class="kart-bas"><h2>Önceki alacak (devir)</h2></div>
        <ul class="liste mali-liste">${devirler.map(h => `<li><div class="ad"><div><b>${tl(-h.tutar)}</b></div>
          <div class="kucuk-yazi">${esc(new Date(h.tarih).toLocaleDateString('tr-TR'))}${h.aciklama ? ' · ' + esc(h.aciklama) : ''}</div></div>
          <button class="dugme kucuk hayalet tehlike" data-hsil="${esc(h.id)}">${ikon('sil')}</button></li>`).join('')}</ul></div>` : ''}
        <div class="kart"><div class="kart-bas"><h2>Alınan ödemeler</h2></div>
        ${hareket.length ? `<ul class="liste mali-liste">${hareket.slice().reverse().map(h => `<li><div class="ad"><div><b>${tl(h.tutar)}</b></div>
          <div class="kucuk-yazi">${esc(trTarih(h.tarih))}${hareketDetay(h) ? ' · ' + hareketDetay(h) : ''}</div></div>
          <button class="dugme kucuk hayalet tehlike" data-hsil="${esc(h.id)}">${ikon('sil')}</button></li>`).join('')}</ul>` : '<div class="kart-ic soluk kucuk-yazi">Henüz ödeme alınmadı.</div>'}</div></div></div>`);
  kopyaBagla(); dekontBagla();
  $('#tahsil').onclick = async () => { const c = await isverenCariAl(anahtar); if (await hareketPenceresi({ cari: c, tur: 'tahsilat', isler: x.isler })) isverenHesapSayfasi(anahtar); };
  $$('[data-isode]').forEach(b => b.onclick = async () => { const c = await isverenCariAl(anahtar); if (await hareketPenceresi({ cari: c, tur: 'tahsilat', isler: x.isler, isId: b.dataset.isode })) isverenHesapSayfasi(anahtar); });
  $('#ekstre').onclick = () => cariEkstre(anahtar);
  $('#ekstreExcel').onclick = () => maliExcel([anahtar], `${x.ad} hesap ${bugun()}.xlsx`);
  $('#gecmisEkle').onclick = async () => { if (await gecmisIsPenceresi(anahtar)) isverenHesapSayfasi(anahtar); };
  $$('[data-maliissil]').forEach(b => b.onclick = async () => {
    const i = BULUT.isler.get(b.dataset.maliissil); if (!i) return;
    if (!await onayla('Kayıt silinsin mi?', `<b>${esc(kimlik(i))}</b> mali kaydı silinecek. Bu işe bağlı ödemeler genel ödeme olarak kalır.`, 'Sil', true)) return;
    try { await api('DELETE', `is_takip/isler/${encodeURIComponent(i.id)}`); MALI.ucretler.delete(i.id); bildir('Silindi'); isverenHesapSayfasi(anahtar); } catch (e) { hataGoster(e); }
  });
  $('#vFiyat').onchange = async e => { try { await isverenFiyatDegistir(anahtar, tutarOku(e.target.value) || 0); isverenHesapSayfasi(anahtar); } catch (x2) { hataGoster(x2); } };
  if ($('#vHepsine')) $('#vHepsine').onclick = async e => { e.preventDefault(); try { await ozelFiyatlariKaldir(anahtar); isverenHesapSayfasi(anahtar); } catch (x2) { hataGoster(x2); } };
  $$('[data-isucret]').forEach(g => g.onchange = async () => {
    const n = tutarOku(g.value);
    if (g.value.trim() && n === null) return bildir('Geçerli bir fiyat yazın', 'hata');
    try { await isUcretKaydet(g.dataset.isucret, { ucret: g.value.trim() ? n : null }); isverenHesapSayfasi(anahtar); bildir('Fiyat kaydedildi'); } catch (e) { hataGoster(e); }
  });
  $$('[data-hsil]').forEach(b => b.onclick = async () => { if (await hareketSil(b.dataset.hsil)) isverenHesapSayfasi(anahtar); });
}

function tedarikciSayfasi(id) {
  const c = MALI.cariler.get(id); if (!c) { location.hash = '#/mali'; return; }
  const x = tedarikciOzet(c);
  const alan = c.tur === 'lab' ? ['lab_ucret', 'Laba atıldı'] : ['sondaj_ucret', 'Sondaj yapıldı'];
  const odemeler = cariHareketleri(id).filter(h => h.tur === 'odeme' && !borcEkMi(h));
  const ekBorclar = cariHareketleri(id).filter(borcEkMi);
  const isli = isliTedarik(c.tur);
  sayfaYaz(`<div class="ust"><a class="geri" href="#/mali">${ikon('geri')}</a><div><h1>${esc(c.ad)}</h1><div class="alt">${esc(CARI_TUR[c.tur])}${isli ? ` · ${x.yapilan.length} iş yapıldı${x.bekleyen ? ', ' + x.bekleyen + ' bekliyor' : ''}` : ''}</div></div>
      <div class="bosluk"></div><button class="dugme tehlike hayalet" id="cariSil">${ikon('sil')}Sil</button><button class="dugme" id="borcEkle">${ikon('arti')}Borç ekle</button><button class="dugme ana" id="ode">${ikon('arti')}Ödeme yap</button></div>
    <div class="ozet-kutular mali-kutular" style="grid-template-columns:repeat(3,1fr)">
      <div class="kart ozet-kutu"><div class="simge">${ikon('liste')}</div><div><div class="sayi">${tl(x.borc)}</div><div class="baslik">Toplam borç</div></div></div>
      <div class="kart ozet-kutu"><div class="simge yesil">${ikon('para')}</div><div><div class="sayi">${tl(x.odenen)}</div><div class="baslik">Ödenen</div></div></div>
      <div class="kart ozet-kutu"><div class="simge kirmizi">${ikon('lira')}</div><div><div class="sayi">${tl(Math.max(0, x.kalan))}</div><div class="baslik">${x.kalan < 0 ? tl(-x.kalan) + ' fazla ödendi' : 'Kalan borç'}</div></div></div></div>
    <div class="kart" style="margin-bottom:16px"><div class="kart-ic mali-form">
      <label class="alan"><span class="kucuk-yazi soluk">Ad</span><input class="girdi" id="tAd" value="${esc(c.ad)}"></label>
      ${isli ? `<label class="alan"><span class="kucuk-yazi soluk">İş başı ücret</span><input class="girdi" id="tUcret" inputmode="decimal" value="${Number(c.varsayilan_ucret) || ''}"></label>
      <label class="secim"><input type="checkbox" id="tVars" ${c.varsayilan ? 'checked' : ''}> Varsayılan ${esc(CARI_TUR[c.tur].toLocaleLowerCase('tr'))}</label>` : ''}</div></div>
    <div class="is-duzen">
      <div class="yigin">${ekBorclar.length || !isli ? `<div class="kart"><div class="kart-bas"><h2>Önceki ve eklenen borçlar</h2></div>
        ${ekBorclar.length ? `<ul class="liste mali-liste">${ekBorclar.slice().reverse().map(h => `<li><div class="ad"><div><b>${tl(-h.tutar)}</b></div>
          <div class="kucuk-yazi">${esc(trTarih(h.tarih))}${h.aciklama ? ' · ' + esc(h.aciklama) : ''}</div></div>
          <button class="dugme kucuk hayalet tehlike" data-hsil="${esc(h.id)}">${ikon('sil')}</button></li>`).join('')}</ul>` : '<div class="kart-ic soluk kucuk-yazi">Henüz borç girilmedi. "Borç ekle" ile özalit faturası gibi borçları girin.</div>'}</div>` : ''}
      ${isli ? `<div class="kart"><div class="kart-bas"><h2>İşler</h2><span class="aciklama">${esc(alan[1])} olanlar borca yazılır</span></div>
        <div class="tablo-kap"><table class="veri mali-tablo"><thead><tr><th>İş</th><th>İşveren</th><th>Durum</th><th style="width:150px">Ücret</th></tr></thead>
        <tbody>${x.isler.map(({ i, m }) => `<tr class="${m.yapildi ? '' : 'soluk'}"><td><a class="ms" href="${isHash(i)}">${esc(kimlik(i))}</a></td><td class="kucuk-yazi">${esc(isverenAdi(ik(i.isveren)))}</td>
          <td>${m.yapildi ? `<span class="etiket yesil">${esc(alan[1])}</span>` : '<span class="etiket">bekliyor</span>'}</td>
          <td><input class="girdi fiyat-girdi ${m.kaynak === 'ozel' ? 'ozel' : ''}" data-tucret="${esc(i.id)}" inputmode="decimal" value="${m.kaynak === 'ozel' ? m.tutar : ''}" placeholder="${tl(c.varsayilan_ucret)}"></td></tr>`).join('') || '<tr><td colspan="4" class="soluk">İş yok</td></tr>'}</tbody></table></div></div>` : ''}</div>
      <div class="yan"><div class="kart"><div class="kart-bas"><h2>Yapılan ödemeler</h2></div>
        ${odemeler.length ? `<ul class="liste mali-liste">${odemeler.slice().reverse().map(h => `<li><div class="ad"><div><b>${tl(h.tutar)}</b></div>
          <div class="kucuk-yazi">${esc(trTarih(h.tarih))}${hareketDetay(h) ? ' · ' + hareketDetay(h) : ''}</div></div>
          <button class="dugme kucuk hayalet tehlike" data-hsil="${esc(h.id)}">${ikon('sil')}</button></li>`).join('')}</ul>` : '<div class="kart-ic soluk kucuk-yazi">Henüz ödeme yapılmadı.</div>'}</div></div></div>`);
  dekontBagla();
  $('#ode').onclick = async () => { if (await hareketPenceresi({ cari: c, tur: 'odeme', isler: x.yapilan.map(y => y.i) })) tedarikciSayfasi(id); };
  $('#tAd').onchange = async e => { try { await cariGuncelle(id, { ad: e.target.value.trim(), anahtar: ik(e.target.value) }); bildir('Kaydedildi'); } catch (x2) { hataGoster(x2); } };
  $('#borcEkle').onclick = async () => { if (await borcEklePenceresi(c)) tedarikciSayfasi(id); };
  $('#cariSil').onclick = cariSilOnay;
  if ($('#tUcret')) $('#tUcret').onchange = async e => { try { await cariGuncelle(id, { varsayilan_ucret: tutarOku(e.target.value) || 0 }); tedarikciSayfasi(id); } catch (x2) { hataGoster(x2); } };
  if ($('#tVars')) $('#tVars').onchange = async e => {
    try {
      if (e.target.checked) for (const d of carilerTur(c.tur).filter(d => d.varsayilan && d.id !== id)) await cariGuncelle(d.id, { varsayilan: false });
      await cariGuncelle(id, { varsayilan: e.target.checked }); tedarikciSayfasi(id);
    } catch (x2) { hataGoster(x2); }
  };
  async function cariSilOnay() {
    if (!await onayla(`${c.ad} silinsin mi?`, 'Bu kayıt ve ona yapılan ödeme kayıtları silinir. İşlere dokunulmaz.', 'Sil', true)) return;
    const { error } = await BULUT.sb.from('cariler').delete().eq('id', id);
    if (error) return hataGoster(sbHata(error));
    MALI.cariler.delete(id); location.hash = '#/mali';
  };
  $$('[data-tucret]').forEach(g => g.onchange = async () => {
    const n = tutarOku(g.value);
    try { await isUcretKaydet(g.dataset.tucret, { [alan[0]]: g.value.trim() ? n : null }); tedarikciSayfasi(id); bildir('Ücret kaydedildi'); } catch (e) { hataGoster(e); }
  });
  $$('[data-hsil]').forEach(b => b.onclick = async () => { if (await hareketSil(b.dataset.hsil)) tedarikciSayfasi(id); });
}

// ------------------------------------------------------------------ iş sayfasındaki "Ücret" kartı
function maliIsKartiCiz(isId) {
  const kart = $('#ucretKarti'); if (!kart || kart.dataset.is !== isId) return;
  const i = BULUT.isler.get(isId); if (!i) return;
  const m = isMali(i), u = MALI.ucretler.get(isId) || {};
  const secim = (tur, alanId, sec) => `<select class="girdi" data-tsec="${alanId}"><option value="">${nottanTedarikci(i, tur) ? 'Nottan: ' + esc(nottanTedarikci(i, tur).ad) : varsayilanTedarikci(tur) ? 'Varsayılan: ' + esc(varsayilanTedarikci(tur).ad) : '— seçin —'}</option>
    ${carilerTur(tur).map(c => `<option value="${esc(c.id)}" ${sec === c.id ? 'selected' : ''}>${esc(c.ad)}</option>`).join('')}</select>`;
  kart.innerHTML = `<div class="kart-bas"><h2>Ücret</h2><div style="flex:1"></div><a class="kucuk-yazi" href="#/mali/isveren/${encodeURIComponent(ik(i.isveren))}">Hesap</a></div>
    <div class="kart-ic yigin mali-is">
      <div class="alan"><label>İş bedeli</label><input class="girdi ${m.bedel.kaynak === 'ozel' ? 'ozel' : ''}" data-ualan="ucret" inputmode="decimal"
        value="${u.ucret !== null && u.ucret !== undefined ? Number(u.ucret) : ''}" placeholder="${m.bedel.kaynak === 'varsayilan' ? tl(m.bedel.tutar) + ' (iş başı fiyat)' : 'İşverenin iş başı fiyatı yok'}">
        <div class="ipucu">Boş bırakılırsa işverenin iş başı fiyatı kullanılır</div></div>
      <div class="alan"><label>Laboratuvar ${m.lab.yapildi ? '<span class="etiket yesil">borca yazıldı</span>' : ''}</label>
        <div class="mali-ikili">${secim('lab', 'lab_id', u.lab_id)}<input class="girdi" data-ualan="lab_ucret" inputmode="decimal" value="${u.lab_ucret !== null && u.lab_ucret !== undefined ? Number(u.lab_ucret) : ''}" placeholder="${m.lab.cari ? tl(m.lab.cari.varsayilan_ucret) : '₺'}"></div></div>
      <div class="alan"><label>Sondajcı ${m.sondaj.yapildi ? '<span class="etiket yesil">borca yazıldı</span>' : ''}</label>
        <div class="mali-ikili">${secim('sondaj', 'sondajci_id', u.sondajci_id)}<input class="girdi" data-ualan="sondaj_ucret" inputmode="decimal" value="${u.sondaj_ucret !== null && u.sondaj_ucret !== undefined ? Number(u.sondaj_ucret) : ''}" placeholder="${m.sondaj.cari ? tl(m.sondaj.cari.varsayilan_ucret) : '₺'}"></div></div>
      <div class="mali-net kucuk-yazi">Bedel ${tl(m.bedel.tutar)} − lab ${tl(m.lab.cari ? m.lab.tutar : 0)} − sondaj ${tl(m.sondaj.cari ? m.sondaj.tutar : 0)} = <b>${tl(m.bedel.tutar - (m.lab.cari ? m.lab.tutar : 0) - (m.sondaj.cari ? m.sondaj.tutar : 0))}</b></div>
      ${!carilerTur('lab').length || !carilerTur('sondaj').length ? `<div class="ipucu">Laboratuvar ve sondajcıları <a href="#/mali" onclick="MALI.sekme='tedarik'">Mali takip › Laboratuvar ve sondaj</a>'dan ekleyin.</div>` : ''}
    </div>`;
  $$('[data-ualan]', kart).forEach(g => g.onchange = async () => {
    const n = tutarOku(g.value);
    if (g.value.trim() && n === null) return bildir('Geçerli bir tutar yazın', 'hata');
    try { await isUcretKaydet(isId, { [g.dataset.ualan]: g.value.trim() ? n : null }); maliIsKartiCiz(isId); bildir('Kaydedildi'); } catch (e) { hataGoster(e); }
  });
  $$('[data-tsec]', kart).forEach(s => s.onchange = async () => {
    try { await isUcretKaydet(isId, { [s.dataset.tsec]: s.value || null }); maliIsKartiCiz(isId); bildir('Kaydedildi'); } catch (e) { hataGoster(e); }
  });
}

// ------------------------------------------------------------------ kancalar
window.maliSayfasi = maliSayfasi;
window.maliOturum = async () => {
  $$('[data-yonetici]').forEach(a => { a.style.display = maliYetki() ? '' : 'none'; });
  if (!maliYetki()) return;
  await maliIndir();
  if (!MALI.kurulumYok) maliCanliBaslat();
};
(() => {
  const onceki = window.ISTEMCI.isSayfasiSonra;
  window.ISTEMCI.isSayfasiSonra = (kayit, yeni) => {
    if (onceki) onceki(kayit, yeni);
    if (!maliYetki() || yeni || !MALI.yuklu) return;
    const yan = $('.is-duzen .yan'); if (!yan) return;
    const kart = document.createElement('div');
    kart.className = 'kart'; kart.id = 'ucretKarti'; kart.dataset.is = kayit.id;
    const gecmis = $('#gecmisKutu') && $('#gecmisKutu').closest('.kart');
    if (gecmis) gecmis.before(kart); else yan.appendChild(kart);
    maliIsKartiCiz(kayit.id);
  };
})();
