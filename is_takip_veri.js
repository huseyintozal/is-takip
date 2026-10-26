'use strict';
/* İş takibi — veri kuralları (masaüstü sürümdeki is_takip_api.py'nin tarayıcı karşılığı, birebir aynı kurallar)
 *   isTemizle(gelen, eski, kim) -> { is, gecmisEk }   alan doğrulama + değişiklik geçmişi
 *   excelSatirlari(satirlar)    -> takip Excel'inin satırlarından iş kayıtları (yazılar hiç değiştirilmez)
 *   isAnahtar(i)                -> aynı işi tanımak için (ada/parsel)
 *   csvUret(isler)              -> Excel'de açılan CSV (TAKİP sayfasıyla aynı sütunlar)
 *   isGoc(i)                    -> eski kayıtları yeni alanlara tamamlar */

const VERI_DURUM = ['mimari', 'evrak', 'zemin_degeri', 'geo', 'sondaj', 'sondaja_atildi', 'laba_atildi', 'lab', 'riskli_rapor', 'rapor_yazildi', 'imza_cd', 'lab_taramasi'];
const VERI_METIN = ['proje_id', 'firma_id', 'isveren', 'mahalle', 'mal_sahibi', 'ada', 'parsel', 'notlar', 'klasor'];   // klasor: bilgisayardaki proje klasörü
const VERI_ALAN_ADI = {
  mimari: 'Mimari', evrak: 'Evrak', zemin_degeri: 'Zemin değeri', geo: 'Geo', sondaj: 'Sondaj', sondaja_atildi: 'Sondaja atıldı',
  laba_atildi: 'Laba atıldı', lab: 'Lab sonucu', riskli_rapor: 'Riskli rapor', bina_yikildi: 'Bina yıkıldı',
  rapor_yazildi: 'Rapor yazıldı', imza_cd: 'İmza-CD', lab_taramasi: 'Lab taraması',
};

const simdiIso = () => { const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
const trBuyuk = s => String(s ?? '').toLocaleUpperCase('tr').replace(/\s+/g, ' ').trim();
function metinAl(v) {             // hücredeki yazı OLDUĞU GİBİ; yalnızca baştaki/sondaki boşluk atılır
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isInteger(v)) return String(v);
  return String(v).trim();
}
function adaParselAnahtar(v) { const s = metinAl(v); return ['-', '—', '0'].includes(s) ? '' : s; }
function yeniId() {
  const b = new Uint8Array(5); (crypto || window.crypto).getRandomValues(b);
  return 'is_' + [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
function bosIsKaydi() {
  const i = { id: yeniId() };
  VERI_METIN.forEach(a => { i[a] = ''; });
  VERI_DURUM.forEach(a => { i[a] = false; });
  i.bina_yikildi = ''; i.alan_notlari = {}; i.bos_alanlar = [];
  i.olusturma = i.guncelleme = simdiIso(); i.gecmis = [];
  return i;
}
function isGoc(i) {
  i = Object.assign({}, i);
  VERI_METIN.forEach(a => { if (i[a] === undefined || i[a] === null) i[a] = ''; });
  VERI_DURUM.forEach(a => { if (i[a] === undefined) i[a] = false; });
  if (!('sondaja_atildi' in i) || i.sondaja_atildi === undefined)
    i.sondaja_atildi = !!(!i.sondaj && (i.alan_notlari || {}).sondaj);
  if (!i.alan_notlari) i.alan_notlari = {};
  if (!i.bos_alanlar) i.bos_alanlar = [];
  if (!i.gecmis) i.gecmis = [];
  if (i.bina_yikildi === undefined) i.bina_yikildi = '';
  return i;
}

/* Kayda gelen alanları uygular. eski yoksa yeni kayıt. kim: değişikliği yapanın maili (geçmişe yazılır). */
function isTemizle(gelen, eski, kim = '') {
  const i = eski ? Object.assign({}, eski) : bosIsKaydi();
  const zaman = simdiIso();
  const degisen = [];
  const ekle = x => degisen.push(kim ? Object.assign(x, { kim }) : x);
  VERI_METIN.forEach(a => { if (a in gelen) i[a] = metinAl(gelen[a]); });
  const bos = new Set('bos_alanlar' in gelen ? (gelen.bos_alanlar || []) : (i.bos_alanlar || []));
  VERI_DURUM.forEach(a => {
    if (!(a in gelen)) return;
    const v = !!gelen[a];
    if (eski && !!eski[a] !== v) { ekle({ zaman, alan: a, deger: v }); bos.delete(a); }
    i[a] = v;
  });
  i.bos_alanlar = VERI_DURUM.filter(a => bos.has(a));
  if ('bina_yikildi' in gelen) {
    const v = ['', 'evet', 'hayir'].includes(gelen.bina_yikildi) ? gelen.bina_yikildi : '';
    if (eski && (eski.bina_yikildi || '') !== v) ekle({ zaman, alan: 'bina_yikildi', deger: v });
    i.bina_yikildi = v;
  }
  if ('alan_notlari' in gelen) {
    const eskiNot = Object.assign({}, i.alan_notlari || {}), yeniNot = {};
    Object.entries(gelen.alan_notlari || {}).forEach(([a, v]) => {
      if (VERI_DURUM.includes(a) || a === 'bina_yikildi') { v = metinAl(v); if (v) yeniNot[a] = v; }
    });
    if (eski) new Set([...Object.keys(eskiNot), ...Object.keys(yeniNot)]).forEach(a => {
      if ((eskiNot[a] || '') !== (yeniNot[a] || '')) ekle({ zaman, alan: a, not: yeniNot[a] || '' });
    });
    i.alan_notlari = yeniNot;
  }
  if (!i.alan_notlari) i.alan_notlari = {};
  i.gecmis = [...(i.gecmis || []), ...degisen].slice(-200);
  i.guncelleme = zaman;
  if (!i.isveren) throw new Error('İşveren boş olamaz');
  return { is: i, gecmisEk: degisen };
}

// ------------------------------------------------------------------ Excel
const HUCRE_HAYIR = new Set(['', 'YOK', 'ATILMADI', 'VERİLMEDİ', 'YAPILMADI', '-', 'HAYIR', 'YIKILMADI']);
const HUCRE_EVET = new Set(['+', 'VAR', 'YAPILDI', 'EVET', 'VERİLDİ', 'ATILDI', 'GELDİ', 'YIKILDI']);
function hucreCoz(v, alan) {       // -> [değer, alan notu]; standart dışı yazı hiç değiştirilmeden not olur
  const ham = metinAl(v), s = trBuyuk(ham);
  if (HUCRE_HAYIR.has(s)) return [false, ''];
  if (HUCRE_EVET.has(s)) return [true, ''];
  if (s.startsWith('+')) return [true, ham];
  if (alan === 'zemin_degeri' || alan === 'laba_atildi') return [true, ham];   // İYİLEŞTİRME ÇIKABİLİR, NİHAT ABİ
  return [false, ham];                                                         // ÖMERE ATILDI, (ZC BİZ ZD)
}
const BASLIK_ESLES = {
  'İŞVEREN': 'isveren', 'MAHALLE': 'mahalle', 'MAL SAHİBİ': 'mal_sahibi', 'ADA': 'ada', 'PARSEL': 'parsel',
  'MİMARİ': 'mimari', 'EVRAK': 'evrak', 'GEO': 'geo', 'LAB': 'lab', 'ZEMİN DEĞERİ VERİLDİ': 'zemin_degeri',
  'ZEMİN DEĞERİ': 'zemin_degeri', 'LABA ATILDI': 'laba_atildi', 'RİSKLİ RAPOR': 'riskli_rapor', 'SONDAJ': 'sondaj',
  'BİNA YIKILDI': 'bina_yikildi', 'NOTLAR': 'notlar', 'NOT': 'notlar',
  'RAPOR YAZILDI': 'rapor_yazildi', 'K RAPOR YAZILDI': 'rapor_yazildi', 'İMZA-CD': 'imza_cd', 'İMZA CD': 'imza_cd', 'LAB TARAMASI': 'lab_taramasi',
};
function excelSatirlari(satirlar, sayfa = 'TAKİP') {
  if (!satirlar.length) return [];
  const basliklar = satirlar[0].map(b => (b === null || b === undefined) ? null : (BASLIK_ESLES[trBuyuk(b)] || null));
  if (!basliklar.includes('isveren')) throw new Error(`"${sayfa}" sayfasında İŞVEREN başlığı bulunamadı`);
  const kayitlar = [];
  satirlar.slice(1).forEach(satir => {
    const ham = {}, notlar = [];
    satir.forEach((v, n) => {
      const alan = basliklar[n];
      if (alan) ham[alan] = v; else if (metinAl(v)) notlar.push(metinAl(v));
    });
    if (!metinAl(ham.isveren)) return;
    const k = {};
    ['isveren', 'mahalle', 'mal_sahibi', 'ada', 'parsel'].forEach(a => { k[a] = metinAl(ham[a]); });
    k.alan_notlari = {};
    k.bos_alanlar = VERI_DURUM.filter(a => basliklar.includes(a) && !metinAl(ham[a]));
    VERI_DURUM.forEach(a => { const [v, n] = hucreCoz(ham[a], a); k[a] = v; if (n) k.alan_notlari[a] = n; });
    k.sondaja_atildi = !!(!k.sondaj && k.alan_notlari.sondaj);
    const [by, bn] = hucreCoz(ham.bina_yikildi, 'bina_yikildi');
    k.bina_yikildi = by ? 'evet' : (['HAYIR', 'YIKILMADI'].includes(trBuyuk(ham.bina_yikildi)) ? 'hayir' : '');
    if (bn) k.alan_notlari.bina_yikildi = bn;
    if (metinAl(ham.notlar)) notlar.unshift(metinAl(ham.notlar));
    k.notlar = notlar.join('\n');
    kayitlar.push(k);
  });
  return kayitlar;
}
function isAnahtar(i) {
  const ada = adaParselAnahtar(i.ada), parsel = adaParselAnahtar(i.parsel);
  return ada ? `${ada}|${parsel}` : `-|${parsel}|${trBuyuk(i.mal_sahibi)}`;
}
/* Excel kayıtlarını mevcut işlerle karşılaştırır. -> { eklenecek:[iş], guncellenecek:[{id, alanlar, gecmisEk, is}], sonuc } */
function excelPlani(gelen, mevcut, guncelle, kim) {
  const sonuc = { eklenen: 0, guncellenen: 0, ayni: 0, toplam: gelen.length };
  const dizin = new Map(mevcut.map(i => [isAnahtar(i), i]));
  const eklenecek = [], guncellenecek = [];
  const karsilastir = [...VERI_DURUM, ...VERI_METIN, 'alan_notlari', 'bina_yikildi', 'bos_alanlar'];
  let sira = Date.now();
  gelen.forEach(k => {
    const a = isAnahtar(k), eski = dizin.get(a);
    if (eski) {
      if (!guncelle) { sonuc.ayni++; return; }
      const k2 = Object.assign({}, k);
      if (eski.notlar && k2.notlar && !eski.notlar.includes(k2.notlar)) k2.notlar = eski.notlar + '\n' + k2.notlar;
      else if (eski.notlar) k2.notlar = eski.notlar;
      if (!k2.bina_yikildi) k2.bina_yikildi = eski.bina_yikildi || '';
      const { is: yeni, gecmisEk } = isTemizle(k2, eski, kim);
      const alanlar = {};
      karsilastir.forEach(x => { if (JSON.stringify(yeni[x] ?? null) !== JSON.stringify(eski[x] ?? null)) alanlar[x] = yeni[x]; });
      if (Object.keys(alanlar).length) { alanlar.guncelleme = yeni.guncelleme; guncellenecek.push({ id: eski.id, alanlar, gecmisEk, is: yeni }); sonuc.guncellenen++; }
      else sonuc.ayni++;
      return;
    }
    const { is: yeni } = isTemizle(k, null, kim);
    yeni.kaynak = 'excel'; yeni.sira = sira++;
    eklenecek.push(yeni); dizin.set(a, yeni); sonuc.eklenen++;
  });
  return { eklenecek, guncellenecek, sonuc };
}

// ------------------------------------------------------------------ CSV
function csvUret(isler) {
  const h = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const satirlar = [['İŞVEREN', 'MAHALLE', 'MAL SAHİBİ', 'ADA', 'PARSEL', 'MİMARİ', 'EVRAK', 'GEO', 'LAB',
    'ZEMİN DEĞERİ VERİLDİ', 'LABA ATILDI', 'RİSKLİ RAPOR', 'SONDAJ', 'BİNA YIKILDI', 'NOTLAR', 'RAPOR YAZILDI', 'İMZA-CD', 'LAB TARAMASI']];
  isler.forEach(i => {
    const n = i.alan_notlari || {}, bos = i.bos_alanlar || [];
    const ev = (a, e = '+', hh = 'YOK') => n[a] || (bos.includes(a) ? '' : (i[a] ? e : hh));
    satirlar.push([i.isveren, i.mahalle, i.mal_sahibi, i.ada, i.parsel, ev('mimari'), ev('evrak'), ev('geo'), ev('lab'),
      ev('zemin_degeri', '+', 'VERİLMEDİ'), ev('laba_atildi', '+', 'ATILMADI'), ev('riskli_rapor'),
      n.sondaj || (bos.includes('sondaj') ? '' : i.sondaj ? 'YAPILDI' : i.sondaja_atildi ? 'SONDAJA ATILDI' : 'YAPILMADI'),
      n.bina_yikildi || ({ evet: 'EVET', hayir: 'HAYIR' }[i.bina_yikildi] || ''), i.notlar || '',
      ev('rapor_yazildi'), ev('imza_cd'), ev('lab_taramasi')]);
  });
  return '﻿' + satirlar.map(r => r.map(h).join(';')).join('\r\n') + '\r\n';
}
