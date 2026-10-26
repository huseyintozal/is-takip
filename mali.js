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
const CARI_TUR = { isveren: 'İşveren', lab: 'Laboratuvar', sondaj: 'Sondajcı' };
const maliYetki = () => BULUT.rol === 'yonetici';
const tl = n => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ₺';
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

/* Bir işin bedeli ve maliyetleri */
function isMali(i) {
  const u = MALI.ucretler.get(i.id) || {};
  const ic = isverenCari(ik(i.isveren));
  const bedel = u.ucret !== null && u.ucret !== undefined ? { tutar: Number(u.ucret), kaynak: 'ozel' }
    : ic && Number(ic.varsayilan_ucret) ? { tutar: Number(ic.varsayilan_ucret), kaynak: 'varsayilan' } : { tutar: 0, kaynak: 'yok' };
  const tedarik = (tur, idAlan, ucretAlan, yapildi) => {
    const c = (u[idAlan] && MALI.cariler.get(u[idAlan])) || varsayilanTedarikci(tur);
    if (!c) return { cari: null, tutar: 0, yapildi, kaynak: 'yok' };
    const ozel = u[ucretAlan] !== null && u[ucretAlan] !== undefined;
    return { cari: c, tutar: ozel ? Number(u[ucretAlan]) : Number(c.varsayilan_ucret) || 0, yapildi, kaynak: ozel ? 'ozel' : 'varsayilan', secili: !!u[idAlan] };
  };
  return { bedel, lab: tedarik('lab', 'lab_id', 'lab_ucret', !!i.laba_atildi), sondaj: tedarik('sondaj', 'sondajci_id', 'sondaj_ucret', !!i.sondaj) };
}
const cariHareketleri = id => [...MALI.hareketler.values()].filter(h => h.cari_id === id).sort((a, b) => (a.tarih || '').localeCompare(b.tarih || '') || (a.eklenme || '').localeCompare(b.eklenme || ''));
function isverenOzet(anahtar) {
  const isler = tumIsler().filter(i => ik(i.isveren) === anahtar);
  const c = isverenCari(anahtar);
  const bedel = isler.reduce((t, i) => t + isMali(i).bedel.tutar, 0);
  const fiyatsiz = isler.filter(i => isMali(i).bedel.kaynak === 'yok').length;
  const alinan = c ? cariHareketleri(c.id).filter(h => h.tur === 'tahsilat').reduce((t, h) => t + Number(h.tutar), 0) : 0;
  return { anahtar, ad: isverenAdi(anahtar), cari: c, isler, bedel, alinan, kalan: bedel - alinan, fiyatsiz };
}
function tedarikciOzet(c) {
  const alan = c.tur === 'lab' ? 'lab' : 'sondaj';
  const isler = tumIsler().map(i => ({ i, m: isMali(i)[alan] })).filter(x => x.m.cari && x.m.cari.id === c.id);
  const yapilan = isler.filter(x => x.m.yapildi);
  const borc = yapilan.reduce((t, x) => t + x.m.tutar, 0);
  const odenen = cariHareketleri(c.id).filter(h => h.tur === 'odeme').reduce((t, h) => t + Number(h.tutar), 0);
  return { cari: c, isler, yapilan, bekleyen: isler.length - yapilan.length, borc, odenen, kalan: borc - odenen };
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
  const etkilenen = tumIsler().filter(i => ik(i.isveren) === anahtar && isMali(i).bedel.kaynak !== 'ozel');
  if (eski && etkilenen.length) {
    const sabitle = await onayla('Eski işler ne olsun?', `<b>${esc(c.ad)}</b> fiyatı ${tl(eski)} → <b>${tl(yeni)}</b> oluyor.<br><br>
      Fiyatı ayrıca girilmemiş <b>${etkilenen.length}</b> iş var. Bu işler <b>eski fiyatta (${tl(eski)}) kalsın</b> mı?<br>
      <span class="soluk kucuk-yazi">"Vazgeç" derseniz bu işler de yeni fiyattan hesaplanır.</span>`, 'Eski fiyatta kalsın');
    if (sabitle) for (const i of etkilenen) await isUcretKaydet(i.id, { ucret: eski });
  }
  await cariGuncelle(c.id, { varsayilan_ucret: yeni });
  bildir(`${c.ad}: iş başı ${tl(yeni)}`);
}
function hareketPenceresi({ cari, tur, isler = [] }) {
  return new Promise(coz => {
    const p = $('#perde');
    p.innerHTML = `<div class="pencere"><h3>${tur === 'tahsilat' ? 'Ödeme al' : 'Ödeme yap'} — ${esc(cari.ad)}</h3>
      <form id="hForm" class="yigin">
        <div class="form-izgara">
          <div class="alan"><label>Tutar (₺)</label><input class="girdi" id="hTutar" inputmode="decimal" placeholder="örn. 25.000" required></div>
          <div class="alan"><label>Tarih</label><input class="girdi" id="hTarih" type="date" value="${bugunIso()}" required></div>
          <div class="alan genis"><label>Açıklama</label><input class="girdi" id="hAciklama" placeholder="örn. havale, elden, çek"></div>
          ${isler.length ? `<div class="alan genis"><label>İş (isteğe bağlı)</label><select class="girdi" id="hIs"><option value="">— Genel ödeme —</option>
            ${isler.map(i => `<option value="${esc(i.id)}">${esc(kimlik(i))}</option>`).join('')}</select></div>` : ''}
        </div>
        <div class="dugmeler"><button type="button" class="dugme hayalet" data-c="0">Vazgeç</button><button class="dugme ana" type="submit">${ikon('kaydet')}Kaydet</button></div></form></div>`;
    p.classList.remove('gizli'); ikonlariDoldur(p);
    const kapat = v => { p.classList.add('gizli'); p.innerHTML = ''; coz(v); };
    $('[data-c="0"]', p).onclick = () => kapat(null);
    p.onclick = e => { if (e.target === p) kapat(null); };
    $('#hForm').onsubmit = async e => {
      e.preventDefault();
      const tutar = tutarOku($('#hTutar').value);
      if (!tutar || tutar <= 0) return bildir('Geçerli bir tutar yazın', 'hata');
      const satir = { cari_id: cari.id, tur, tutar, tarih: $('#hTarih').value, aciklama: $('#hAciklama').value.trim(), is_id: ($('#hIs') || {}).value || null, ekleyen: BULUT.eposta };
      const { data, error } = await BULUT.sb.from('hareketler').insert(satir).select().single();
      if (error) return hataGoster(sbHata(error));
      MALI.hareketler.set(data.id, data);
      bildir(`${tl(tutar)} ${tur === 'tahsilat' ? 'tahsilat' : 'ödeme'} kaydedildi`);
      kapat(data);
    };
    $('#hTutar').focus();
  });
}
async function hareketSil(id) {
  const h = MALI.hareketler.get(id); if (!h) return;
  if (!await onayla('Kayıt silinsin mi?', `${esc(new Date(h.tarih).toLocaleDateString('tr-TR'))} tarihli <b>${tl(h.tutar)}</b> ${h.tur === 'tahsilat' ? 'tahsilat' : 'ödeme'} silinecek.`, 'Sil', true)) return false;
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
  if (rest[0] === 'isveren' && rest[1]) return isverenHesapSayfasi(ik(rest[1]));
  if (rest[0] === 'cari' && rest[1]) return tedarikciSayfasi(rest[1]);
  const isverenler_ = isverenler().map(isverenOzet).sort((a, b) => b.kalan - a.kalan || trSirala(a.ad, b.ad));
  const tedarik = ['lab', 'sondaj'].flatMap(t => carilerTur(t)).map(tedarikciOzet);
  const toplamAlacak = isverenler_.reduce((t, x) => t + Math.max(0, x.kalan), 0);
  const ay = bugunIso().slice(0, 7);
  const buAy = [...MALI.hareketler.values()].filter(h => h.tur === 'tahsilat' && (h.tarih || '').startsWith(ay)).reduce((t, h) => t + Number(h.tutar), 0);
  const borc = t => tedarik.filter(x => x.cari.tur === t).reduce((s, x) => s + Math.max(0, x.kalan), 0);
  const fiyatsiz = isverenler_.reduce((t, x) => t + x.fiyatsiz, 0);
  const sekme = MALI.sekme;
  sayfaYaz(`<div class="ust"><div><h1>Mali takip</h1><div class="alt">İşveren alacakları, laboratuvar ve sondajcı borçları</div></div></div>
    <div class="ozet-kutular mali-kutular">
      <div class="kart ozet-kutu"><div class="simge turuncu">${ikon('lira')}</div><div><div class="sayi">${tl(toplamAlacak)}</div><div class="baslik">İşverenlerden alacak</div></div></div>
      <div class="kart ozet-kutu"><div class="simge yesil">${ikon('para')}</div><div><div class="sayi">${tl(buAy)}</div><div class="baslik">Bu ay alınan</div></div></div>
      <div class="kart ozet-kutu"><div class="simge vurgu">${ikon('deney')}</div><div><div class="sayi">${tl(borc('lab'))}</div><div class="baslik">Laboratuvara borç</div></div></div>
      <div class="kart ozet-kutu"><div class="simge">${ikon('saat')}</div><div><div class="sayi">${tl(borc('sondaj'))}</div><div class="baslik">Sondajcıya borç</div></div></div>
    </div>
    ${fiyatsiz ? `<div class="kutu uyari" style="margin-bottom:14px">${ikon('uyari')}<div><b>${fiyatsiz} işin fiyatı yok.</b> İşverenlerin iş başı fiyatını aşağıdaki tabloda yazın; işe özel fiyat iş sayfasından girilir.</div></div>` : ''}
    <div class="secenekler mali-sekme" style="margin-bottom:14px">
      <button data-sekme="isveren" class="${sekme === 'isveren' ? 'secili' : ''}">${ikon('musteri')}İşverenler</button>
      <button data-sekme="tedarik" class="${sekme === 'tedarik' ? 'secili' : ''}">${ikon('deney')}Laboratuvar ve sondaj</button>
      <button data-sekme="hareket" class="${sekme === 'hareket' ? 'secili' : ''}">${ikon('liste')}Hareketler</button></div>
    <div id="maliIcerik"></div>`);
  $$('[data-sekme]').forEach(b => b.onclick = () => { MALI.sekme = b.dataset.sekme; maliSayfasi([]); });
  const kutu = $('#maliIcerik');
  if (sekme === 'isveren') {
    kutu.innerHTML = `<div class="kart"><div class="tablo-kap"><table class="veri mali-tablo"><thead><tr>
        <th>İşveren</th><th class="sag">İş</th><th style="width:150px">İş başı fiyat</th><th class="sag">Toplam bedel</th><th class="sag">Alınan</th><th class="sag">Kalan</th><th></th></tr></thead>
      <tbody>${isverenler_.map(x => `<tr data-isveren="${esc(x.anahtar)}">
        <td><a href="#/mali/isveren/${encodeURIComponent(x.anahtar)}" class="ms">${esc(x.ad)}</a>${x.fiyatsiz ? `<div class="kucuk-yazi" style="color:var(--turuncu)">${x.fiyatsiz} iş fiyatsız</div>` : ''}</td>
        <td class="sag">${x.isler.length}</td>
        <td><input class="girdi fiyat-girdi" data-fiyat="${esc(x.anahtar)}" inputmode="decimal" value="${x.cari && Number(x.cari.varsayilan_ucret) ? esc(String(Number(x.cari.varsayilan_ucret))) : ''}" placeholder="₺"></td>
        <td class="sag">${tl(x.bedel)}</td><td class="sag">${tl(x.alinan)}</td><td class="sag">${!x.bedel && !x.alinan ? '<span class="soluk">—</span>' : kalanEtiket(x.kalan)}</td>
        <td class="sag"><button class="dugme kucuk" data-tahsil="${esc(x.anahtar)}">${ikon('arti')}Ödeme al</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td><b>Toplam</b></td><td class="sag">${isverenler_.reduce((t, x) => t + x.isler.length, 0)}</td><td></td>
        <td class="sag"><b>${tl(isverenler_.reduce((t, x) => t + x.bedel, 0))}</b></td><td class="sag"><b>${tl(isverenler_.reduce((t, x) => t + x.alinan, 0))}</b></td>
        <td class="sag"><b>${tl(isverenler_.reduce((t, x) => t + x.kalan, 0))}</b></td><td></td></tr></tfoot></table></div></div>`;
    $$('[data-fiyat]', kutu).forEach(g => g.onchange = async () => {
      const n = tutarOku(g.value);
      if (g.value.trim() && n === null) return bildir('Geçerli bir fiyat yazın', 'hata');
      try { await isverenFiyatDegistir(g.dataset.fiyat, n || 0); maliSayfasi([]); } catch (e) { hataGoster(e); }
    });
    $$('[data-tahsil]', kutu).forEach(b => b.onclick = async () => {
      const c = await isverenCariAl(b.dataset.tahsil);
      if (await hareketPenceresi({ cari: c, tur: 'tahsilat', isler: tumIsler().filter(i => ik(i.isveren) === b.dataset.tahsil) })) maliSayfasi([]);
    });
  } else if (sekme === 'tedarik') {
    kutu.innerHTML = `<div class="yigin">
      <div class="kart"><div class="kart-bas"><h2>Laboratuvar ve sondajcılar</h2><span class="aciklama">Numune laba atılınca lab'a, sondaj yapılınca sondajcıya borç yazılır</span></div>
        ${tedarik.length ? `<div class="tablo-kap"><table class="veri mali-tablo"><thead><tr><th>Ad</th><th>Tür</th><th class="sag">İş başı</th><th class="sag">Yapılan iş</th>
          <th class="sag">Toplam borç</th><th class="sag">Ödenen</th><th class="sag">Kalan</th><th></th></tr></thead>
          <tbody>${tedarik.map(x => `<tr><td><a class="ms" href="#/mali/cari/${esc(x.cari.id)}">${esc(x.cari.ad)}</a>${x.cari.varsayilan ? ' <span class="etiket">varsayılan</span>' : ''}</td>
            <td>${esc(CARI_TUR[x.cari.tur])}</td><td class="sag">${tl(x.cari.varsayilan_ucret)}</td>
            <td class="sag">${x.yapilan.length}${x.bekleyen ? ` <span class="soluk kucuk-yazi">(+${x.bekleyen} bekliyor)</span>` : ''}</td>
            <td class="sag">${tl(x.borc)}</td><td class="sag">${tl(x.odenen)}</td><td class="sag">${kalanEtiket(x.kalan, false)}</td>
            <td class="sag"><button class="dugme kucuk" data-ode="${esc(x.cari.id)}">${ikon('arti')}Ödeme yap</button></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="kart-ic soluk">Henüz laboratuvar ya da sondajcı eklenmedi.</div>'}</div>
      <div class="kart"><div class="kart-bas"><h2>Yeni ekle</h2></div><div class="kart-ic">
        <form id="cariEkle" class="mali-form">
          <select class="girdi" id="cTur"><option value="lab">Laboratuvar</option><option value="sondaj">Sondajcı</option></select>
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
      } catch (x) { hataGoster(/duplicate|unique/i.test(x.message) ? new Error('Bu adla zaten kayıt var') : x); }
    };
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
          <td>${h.tur === 'tahsilat' ? '<span class="etiket yesil">Alınan</span>' : '<span class="etiket kirmizi">Ödenen</span>'}</td>
          <td class="sag"><b>${tl(h.tutar)}</b></td><td class="kucuk-yazi">${esc(h.aciklama)}${i ? ` · ${esc(kimlik(i))}` : ''}<div class="soluk">${esc((h.ekleyen || '').split('@')[0])}</div></td>
          <td class="sag"><button class="dugme kucuk hayalet tehlike" data-hsil="${esc(h.id)}">${ikon('sil')}</button></td></tr>`; }).join('')}</tbody></table></div>`
      : '<div class="kart-ic soluk">Henüz ödeme kaydı yok.</div>'}</div>`;
    $$('[data-hsil]', kutu).forEach(b => b.onclick = async () => { if (await hareketSil(b.dataset.hsil)) maliSayfasi([]); });
  }
  ikonlariDoldur(kutu);
}

function isverenHesapSayfasi(anahtar) {
  const x = isverenOzet(anahtar);
  IT.kopyalar = [];
  const hareket = x.cari ? cariHareketleri(x.cari.id).filter(h => h.tur === 'tahsilat') : [];
  const ozetMetin = [`${x.ad} – Hesap özeti (${bugun()})`, '',
    `İş sayısı: ${x.isler.length}`, `Toplam iş bedeli: ${tl(x.bedel)}`, `Alınan: ${tl(x.alinan)}`, `Kalan: ${tl(Math.max(0, x.kalan))}`, '',
    'İşler:', ...x.isler.map(i => `- ${kimlik(i)}: ${tl(isMali(i).bedel.tutar)}`),
    ...(hareket.length ? ['', 'Ödemeler:', ...hareket.map(h => `- ${new Date(h.tarih).toLocaleDateString('tr-TR')}: ${tl(h.tutar)}${h.aciklama ? ' (' + h.aciklama + ')' : ''}`)] : [])].join('\n');
  sayfaYaz(`<div class="ust"><a class="geri" href="#/mali">${ikon('geri')}</a><div><h1>${esc(x.ad)}</h1><div class="alt">${x.isler.length} iş · bedel ${tl(x.bedel)} · alınan ${tl(x.alinan)}</div></div>
      <div class="bosluk"></div>${kopyaDugmesi(ozetMetin, 'dugme', 'Hesap özetini kopyala')}
      <button class="dugme ana" id="tahsil">${ikon('arti')}Ödeme al</button></div>
    <div class="ozet-kutular mali-kutular" style="grid-template-columns:repeat(3,1fr)">
      <div class="kart ozet-kutu"><div class="simge">${ikon('liste')}</div><div><div class="sayi">${tl(x.bedel)}</div><div class="baslik">Toplam iş bedeli</div></div></div>
      <div class="kart ozet-kutu"><div class="simge yesil">${ikon('para')}</div><div><div class="sayi">${tl(x.alinan)}</div><div class="baslik">Alınan</div></div></div>
      <div class="kart ozet-kutu"><div class="simge turuncu">${ikon('lira')}</div><div><div class="sayi">${tl(Math.max(0, x.kalan))}</div><div class="baslik">${x.kalan < 0 ? tl(-x.kalan) + ' fazla ödendi' : 'Kalan alacak'}</div></div></div></div>
    <div class="is-duzen">
      <div class="kart"><div class="kart-bas"><h2>İşler</h2><span class="aciklama">Boş bırakılan fiyat iş başı fiyattan gelir</span><div style="flex:1"></div>
        <label class="kucuk-yazi soluk" style="display:flex;gap:6px;align-items:center">İş başı <input class="girdi fiyat-girdi" id="vFiyat" inputmode="decimal" style="width:120px" value="${x.cari && Number(x.cari.varsayilan_ucret) ? Number(x.cari.varsayilan_ucret) : ''}" placeholder="₺"></label></div>
        <div class="tablo-kap"><table class="veri mali-tablo"><thead><tr><th>Mal sahibi</th><th>Ada/Parsel</th><th>Durum</th><th style="width:150px">Bedel</th></tr></thead>
        <tbody>${x.isler.map(i => { const m = isMali(i); const d = isDurumu(i);
          return `<tr><td><a class="ms" href="${isHash(i)}">${esc(i.mal_sahibi || i.mahalle || '—')}</a></td><td>${esc(adaParsel(i))}</td>
            <td><span class="etiket ${d.asama.renk}">${esc(d.asama.ad)}</span></td>
            <td><input class="girdi fiyat-girdi ${m.bedel.kaynak === 'ozel' ? 'ozel' : ''}" data-isucret="${esc(i.id)}" inputmode="decimal"
              value="${m.bedel.kaynak === 'ozel' ? Number(m.bedel.tutar) : ''}" placeholder="${m.bedel.kaynak === 'varsayilan' ? tl(m.bedel.tutar) : 'fiyat yok'}"></td></tr>`; }).join('')}</tbody></table></div></div>
      <div class="yan yigin"><div class="kart"><div class="kart-bas"><h2>Alınan ödemeler</h2></div>
        ${hareket.length ? `<ul class="liste mali-liste">${hareket.slice().reverse().map(h => `<li><div class="ad"><div><b>${tl(h.tutar)}</b></div>
          <div class="kucuk-yazi">${esc(new Date(h.tarih).toLocaleDateString('tr-TR'))}${h.aciklama ? ' · ' + esc(h.aciklama) : ''}${h.is_id && BULUT.isler.get(h.is_id) ? ' · ' + esc(kimlik(BULUT.isler.get(h.is_id))) : ''}</div></div>
          <button class="dugme kucuk hayalet tehlike" data-hsil="${esc(h.id)}">${ikon('sil')}</button></li>`).join('')}</ul>` : '<div class="kart-ic soluk kucuk-yazi">Henüz ödeme alınmadı.</div>'}</div></div></div>`);
  kopyaBagla();
  $('#tahsil').onclick = async () => { const c = await isverenCariAl(anahtar); if (await hareketPenceresi({ cari: c, tur: 'tahsilat', isler: x.isler })) isverenHesapSayfasi(anahtar); };
  $('#vFiyat').onchange = async e => { try { await isverenFiyatDegistir(anahtar, tutarOku(e.target.value) || 0); isverenHesapSayfasi(anahtar); } catch (x2) { hataGoster(x2); } };
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
  const odemeler = cariHareketleri(id).filter(h => h.tur === 'odeme');
  sayfaYaz(`<div class="ust"><a class="geri" href="#/mali">${ikon('geri')}</a><div><h1>${esc(c.ad)}</h1><div class="alt">${esc(CARI_TUR[c.tur])} · ${x.yapilan.length} iş yapıldı${x.bekleyen ? ', ' + x.bekleyen + ' bekliyor' : ''}</div></div>
      <div class="bosluk"></div><button class="dugme tehlike hayalet" id="cariSil">${ikon('sil')}Sil</button><button class="dugme ana" id="ode">${ikon('arti')}Ödeme yap</button></div>
    <div class="ozet-kutular mali-kutular" style="grid-template-columns:repeat(3,1fr)">
      <div class="kart ozet-kutu"><div class="simge">${ikon('liste')}</div><div><div class="sayi">${tl(x.borc)}</div><div class="baslik">Toplam borç</div></div></div>
      <div class="kart ozet-kutu"><div class="simge yesil">${ikon('para')}</div><div><div class="sayi">${tl(x.odenen)}</div><div class="baslik">Ödenen</div></div></div>
      <div class="kart ozet-kutu"><div class="simge kirmizi">${ikon('lira')}</div><div><div class="sayi">${tl(Math.max(0, x.kalan))}</div><div class="baslik">${x.kalan < 0 ? tl(-x.kalan) + ' fazla ödendi' : 'Kalan borç'}</div></div></div></div>
    <div class="kart" style="margin-bottom:16px"><div class="kart-ic mali-form">
      <label class="alan"><span class="kucuk-yazi soluk">Ad</span><input class="girdi" id="tAd" value="${esc(c.ad)}"></label>
      <label class="alan"><span class="kucuk-yazi soluk">İş başı ücret</span><input class="girdi" id="tUcret" inputmode="decimal" value="${Number(c.varsayilan_ucret) || ''}"></label>
      <label class="secim"><input type="checkbox" id="tVars" ${c.varsayilan ? 'checked' : ''}> Varsayılan ${esc(CARI_TUR[c.tur].toLocaleLowerCase('tr'))}</label></div></div>
    <div class="is-duzen">
      <div class="kart"><div class="kart-bas"><h2>İşler</h2><span class="aciklama">${esc(alan[1])} olanlar borca yazılır</span></div>
        <div class="tablo-kap"><table class="veri mali-tablo"><thead><tr><th>İş</th><th>İşveren</th><th>Durum</th><th style="width:150px">Ücret</th></tr></thead>
        <tbody>${x.isler.map(({ i, m }) => `<tr class="${m.yapildi ? '' : 'soluk'}"><td><a class="ms" href="${isHash(i)}">${esc(kimlik(i))}</a></td><td class="kucuk-yazi">${esc(isverenAdi(ik(i.isveren)))}</td>
          <td>${m.yapildi ? `<span class="etiket yesil">${esc(alan[1])}</span>` : '<span class="etiket">bekliyor</span>'}</td>
          <td><input class="girdi fiyat-girdi ${m.kaynak === 'ozel' ? 'ozel' : ''}" data-tucret="${esc(i.id)}" inputmode="decimal" value="${m.kaynak === 'ozel' ? m.tutar : ''}" placeholder="${tl(c.varsayilan_ucret)}"></td></tr>`).join('') || '<tr><td colspan="4" class="soluk">İş yok</td></tr>'}</tbody></table></div></div>
      <div class="yan"><div class="kart"><div class="kart-bas"><h2>Yapılan ödemeler</h2></div>
        ${odemeler.length ? `<ul class="liste mali-liste">${odemeler.slice().reverse().map(h => `<li><div class="ad"><div><b>${tl(h.tutar)}</b></div>
          <div class="kucuk-yazi">${esc(new Date(h.tarih).toLocaleDateString('tr-TR'))}${h.aciklama ? ' · ' + esc(h.aciklama) : ''}</div></div>
          <button class="dugme kucuk hayalet tehlike" data-hsil="${esc(h.id)}">${ikon('sil')}</button></li>`).join('')}</ul>` : '<div class="kart-ic soluk kucuk-yazi">Henüz ödeme yapılmadı.</div>'}</div></div></div>`);
  $('#ode').onclick = async () => { if (await hareketPenceresi({ cari: c, tur: 'odeme', isler: x.yapilan.map(y => y.i) })) tedarikciSayfasi(id); };
  $('#tAd').onchange = async e => { try { await cariGuncelle(id, { ad: e.target.value.trim(), anahtar: ik(e.target.value) }); bildir('Kaydedildi'); } catch (x2) { hataGoster(x2); } };
  $('#tUcret').onchange = async e => { try { await cariGuncelle(id, { varsayilan_ucret: tutarOku(e.target.value) || 0 }); tedarikciSayfasi(id); } catch (x2) { hataGoster(x2); } };
  $('#tVars').onchange = async e => {
    try {
      if (e.target.checked) for (const d of carilerTur(c.tur).filter(d => d.varsayilan && d.id !== id)) await cariGuncelle(d.id, { varsayilan: false });
      await cariGuncelle(id, { varsayilan: e.target.checked }); tedarikciSayfasi(id);
    } catch (x2) { hataGoster(x2); }
  };
  $('#cariSil').onclick = async () => {
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
  const secim = (tur, alanId, sec) => `<select class="girdi" data-tsec="${alanId}"><option value="">${varsayilanTedarikci(tur) ? 'Varsayılan: ' + esc(varsayilanTedarikci(tur).ad) : '— seçin —'}</option>
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
