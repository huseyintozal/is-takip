'use strict';
/* İş Takibi — MALİ AKTARIM
 * Firma hesap Excel'lerinden hazırlanan mali_aktar.json'u mali takibe aktarır:
 *  - Excel'deki işler, iş takibindeki işlerle ada/parsel'den eşleştirilir (bedel işe özel fiyat olur)
 *  - eşleşmeyenler "geçmiş iş" (yalnızca mali takipte, durumu Bitti) olarak açılır
 *  - eski hesaptan kalanlar devir, alınanlar tahsilat olarak girilir
 *  - başka işverene kayıtlı işler ve Excel'de olmayan işler için uyarı verilir */

const AKTAR = { veri: null, plan: null };

const apNorm = s => String(s || '').toLocaleUpperCase('tr').replace(/\s+/g, '').replace(/^(-|0)$/, '');   // "-" ve "0" ada yok demek
const isAnahtari = (ada, parsel) => apNorm(ada) + '/' + apNorm(parsel);
/* Parselin bütün yazılışları: "46(36)" → 46, 36 ; "21-22" → 21, 22 */
const parseller = p => new Set(apNorm(p).split(/[^0-9A-ZÇĞİÖŞÜ]+/).filter(Boolean));
function apEslesir(i, s) {
  if (apNorm(i.ada) !== apNorm(s.ada)) return false;
  const a = parseller(i.parsel); return [...parseller(s.parsel)].some(x => a.has(x));
}

function firmaAdiTemizle(k) {
  return String(k || '').toLocaleUpperCase('tr').split(/\s+/).filter(w => w && !['YENİ', 'HESAP', 'HESABI'].includes(w) && !/^20\d\d(-20\d\d)?$/.test(w)).join(' ');
}
/* Firma klasörünü programdaki işverenle eşleştir: önce ortak işler, sonra ad benzerliği */
function firmaHedefiBul(f, isler) {
  const sat = f.satirlar.filter(s => s.tur === 'is' && s.parsel);
  const say = {};
  isler.forEach(i => { if (sat.some(s => apEslesir(i, s))) say[ik(i.isveren)] = (say[ik(i.isveren)] || 0) + 1; });
  const enCok = Object.entries(say).sort((a, b) => b[1] - a[1])[0];
  if (enCok && enCok[1] >= 1) return enCok[0];
  const ad = katla(firmaAdiTemizle(f.klasor));
  const adaylar = tumIsverenler();
  const tam = adaylar.find(a => katla(a) === ad);
  if (tam) return tam;
  // kelimelerden biri ötekinin içinde tamamen geçiyorsa (ALPAY ABİ ~ ALPAY, ALİCAN ~ ALİCAN SAMET)
  const kel = x => katla(x).split(' ').filter(w => w.length >= 2 && !['ABI', 'ABLA', 'BEY', 'HANIM', 'VE'].includes(w));
  const fk = kel(ad);
  const benzer = adaylar.filter(a => { const ak = kel(a); return ak.length && fk.length && (ak.every(w => fk.includes(w)) || fk.every(w => ak.includes(w))); });
  if (benzer.length === 1) return benzer[0];
  return '';
}

/* Bir firmanın aktarım planı (hedef işverene göre) */
function firmaPlani(f, hedef, yeniAd) {
  const tum = maliIsler();
  const kullanilan = new Set();
  const satirlar = f.satirlar.map(s => {
    if (s.tur !== 'is') return { s };
    if (!s.parsel) {      // ada/parsel yok: daha önce aktarıldıysa aynı adlı kaydı kullan
      const onceki = hedef && tum.find(i => !kullanilan.has(i.id) && i.mali_kayit && ik(i.isveren) === hedef && !apNorm(i.parsel) && katla(i.mal_sahibi) === katla(s.mal_sahibi || s.metin));
      if (onceki) { kullanilan.add(onceki.id); return { s, durum: 'eslesti', is: onceki }; }
      return { s, durum: 'yeni', uyari: 'ada/parsel yazmıyor, ayrı kayıt açılacak' };
    }
    const ms = katla(s.mal_sahibi || '').split(' ')[0] || '';
    const aday = tum.filter(i => !kullanilan.has(i.id) && apEslesir(i, s))
      .sort((x, y) => (x.mali_kayit ? 1 : 0) - (y.mali_kayit ? 1 : 0))          // önce iş takibindeki iş
      .sort((x, y) => (katla(y.mal_sahibi || '').startsWith(ms) && ms ? 1 : 0) - (katla(x.mal_sahibi || '').startsWith(ms) && ms ? 1 : 0));
    const buFirma = hedef ? aday.filter(i => ik(i.isveren) === hedef) : [];
    if (buFirma.length) { kullanilan.add(buFirma[0].id); return { s, durum: 'eslesti', is: buFirma[0] }; }
    if (aday.length) return { s, durum: 'baska', is: aday[0], secim: 'ayri', uyari: `iş takibinde ${isverenAdi(ik(aday[0].isveren))} işvereninde kayıtlı` };
    return { s, durum: 'yeni' };
  });
  const excelde = new Set(satirlar.filter(x => x.is).map(x => x.is.id));
  const disarida = hedef ? tum.filter(i => ik(i.isveren) === hedef && !excelde.has(i.id) && !i.mali_kayit) : [];
  // önceki aktarımdan kalan ve artık hiçbir Excel satırına denk gelmeyen geçmiş kayıtlar (ör. yazım hatası düzeltildi)
  const artik = hedef ? tum.filter(i => ik(i.isveren) === hedef && !excelde.has(i.id) && i.mali_kayit) : [];
  const cari = hedef ? isverenCari(hedef) : null;
  const mevcutHareket = cari ? cariHareketleri(cari.id).filter(h => h.tur === 'tahsilat') : [];
  return { f, hedef, yeniAd, satirlar, disarida, artik, artikSil: true, cari, mevcutHareket, sil: mevcutHareket.length > 0, aktar: true };
}

async function maliAktarSayfasi() {
  IT.kopyalar = [];
  if (!AKTAR.veri) {
    sayfaYaz(`<div class="ust"><a class="geri" href="#/mali">${ikon('geri')}</a><div><h1>Excel hesaplarını aktar</h1>
        <div class="alt">Firma hesap Excel'lerinden hazırlanan aktarım dosyası (mali_aktar.json)</div></div></div>
      <div class="kart"><div class="kart-ic yigin">
        <div class="birak" id="aktarBirak">${ikon('yukle')}<div><b>mali_aktar.json</b> dosyasını buraya bırakın ya da <a href="#" id="aktarSec">seçin</a></div></div>
        <div class="kucuk-yazi soluk">Aktarmadan önce her firma için ne yapılacağı gösterilir; onaylamadan hiçbir şey kaydedilmez.</div></div></div>`);
    const oku = async l => {
      const f = l[0]; if (!f) return;
      try {
        const v = JSON.parse(await f.text());
        if (v.tur !== 'is-takip-mali-aktar') throw new Error('Bu dosya mali aktarım dosyası değil');
        AKTAR.veri = v; AKTAR.plan = null; maliAktarSayfasi();
      } catch (e) { hataGoster(e); }
    };
    birakmaAlani($('#aktarBirak'), oku);
    $('#aktarSec').onclick = async e => { e.preventDefault(); oku(await dosyaSec(false, '.json,application/json')); };
    return;
  }
  if (!AKTAR.plan) {
    const isler = maliIsler();
    AKTAR.plan = AKTAR.veri.firmalar.map(f => { const h = firmaHedefiBul(f, isler); return firmaPlani(f, h, h ? '' : firmaAdiTemizle(f.klasor)); });
  }
  const P = AKTAR.plan;
  const secenekler = (p) => `<option value="">— Yeni firma: ${esc(p.yeniAd || firmaAdiTemizle(p.f.klasor))} —</option>` +
    tumIsverenler().map(a => `<option value="${esc(a)}" ${a === p.hedef ? 'selected' : ''}>${esc(isverenAdi(a) || a)}</option>`).join('');
  const sayi = (p, d) => p.satirlar.filter(x => x.durum === d).length;
  const toplam = p => {
    const is = p.satirlar.filter(x => x.s.tur === 'is'), d = t => p.satirlar.filter(x => x.s.tur === t).reduce((a, x) => a + x.s.tutar, 0);
    return { bedel: is.reduce((a, x) => a + x.s.bedel, 0), alinan: is.reduce((a, x) => a + (x.s.alinan || 0), 0) + d('odeme') + d('onceden_odeme'), devir: d('devir') };
  };
  const tl0 = n => tl(Math.round(n));
  sayfaYaz(`<div class="ust"><a class="geri" href="#/mali">${ikon('geri')}</a><div><h1>Excel hesaplarını aktar</h1>
      <div class="alt">${P.length} firma · ${P.reduce((t, p) => t + p.satirlar.filter(x => x.s.tur === 'is').length, 0)} iş · ${P.reduce((t, p) => t + p.satirlar.filter(x => x.s.tur === 'odeme').length, 0)} ödeme</div></div>
      <div class="bosluk"></div><button class="dugme hayalet" id="aktarIptal">Vazgeç</button><button class="dugme ana" id="aktarBasla">${ikon('kaydet')}Seçili firmaları aktar</button></div>
    ${MALI.yontemYok ? `<div class="kutu uyari" style="margin-bottom:12px">${ikon('uyari')}<div>Ödeme yöntemleri (havale/nakit/çek) için önce <b>kurulum_mali2.sql</b>'i çalıştırın; çalıştırmazsanız ödemeler yöntemsiz aktarılır.</div></div>` : ''}
    <div class="yigin" id="aktarFirmalar">${P.map((p, n) => { const t = toplam(p);
      const uyarilar = [...p.f.uyarilar, ...p.satirlar.filter(x => x.uyari).map(x => `${x.s.metin} → ${x.uyari}`)];
      return `<div class="kart aktar-firma" data-n="${n}">
        <div class="kart-bas" style="flex-wrap:wrap;gap:8px"><label class="secim"><input type="checkbox" data-aktar="${n}" ${p.aktar ? 'checked' : ''}><h2 style="margin:0">${esc(p.f.klasor)}</h2></label>
          <span class="aciklama">${esc(p.f.dosyalar.join(', '))}</span><div style="flex:1"></div>
          <span class="kucuk-yazi soluk">Programdaki firma:</span><select class="girdi" data-hedef="${n}" style="width:auto;min-width:200px">${secenekler(p)}</select></div>
        <div class="kart-ic yigin" style="gap:8px">
          <div class="cipler" style="margin:0">
            <span class="etiket yesil">${sayi(p, 'eslesti')} iş takipteki işle eşleşti</span>
            <span class="etiket">${sayi(p, 'yeni')} yeni geçmiş iş (Bitti)</span>
            ${sayi(p, 'baska') ? `<span class="etiket sari">${sayi(p, 'baska')} iş başka işverende</span>` : ''}
            <span class="etiket">${p.satirlar.filter(x => x.s.tur === 'odeme' || x.s.tur === 'onceden_odeme').length + p.satirlar.filter(x => x.s.alinan).length} ödeme</span>
            ${t.devir ? `<span class="etiket">devir ${tl0(t.devir)}</span>` : ''}
            <span class="etiket turuncu">Excel'e göre borç ${tl0(p.f.excel_borc ?? p.f.hesap_borc)}</span></div>
          ${p.artik.length ? `<label class="secim kucuk-yazi"><input type="checkbox" data-artiksil="${n}" ${p.artikSil ? 'checked' : ''}> Önceki aktarımdan kalan, artık Excel'deki hiçbir satıra denk gelmeyen <b>${p.artik.length}</b> geçmiş kaydı sil: ${p.artik.map(i => esc(kimlik(i))).join(', ')}</label>` : ''}
          ${p.mevcutHareket.length ? `<label class="secim kucuk-yazi"><input type="checkbox" data-sil="${n}" ${p.sil ? 'checked' : ''}> Bu firmanın programdaki mevcut <b>${p.mevcutHareket.length}</b> ödeme/devir kaydını sil, Excel'dekilerle değiştir (yoksa iki kez sayılır)</label>` : ''}
          ${uyarilar.length ? `<div class="kutu uyari" style="margin:0">${ikon('uyari')}<div><b>Eşleştirilemeyenler / dikkat:</b><ul style="margin:4px 0 0;padding-left:18px">${uyarilar.map(u => `<li>${esc(u)}</li>`).join('')}</ul></div></div>` : ''}
          ${p.satirlar.filter(x => x.durum === 'baska').map((x, k) => `<div class="kucuk-yazi" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <b>${esc(x.s.mal_sahibi || x.s.metin)} (${esc(x.s.ada ? x.s.ada + '/' + x.s.parsel : x.s.parsel)})</b> iş takipte ${esc(isverenAdi(ik(x.is.isveren)))}'de:
            <select class="girdi" style="width:auto" data-baska="${n}:${p.satirlar.indexOf(x)}">
              <option value="ayri" ${x.secim === 'ayri' ? 'selected' : ''}>Bu firmaya ayrı mali kayıt aç (takipteki işe dokunma)</option>
              <option value="tasi" ${x.secim === 'tasi' ? 'selected' : ''}>Takipteki işin işverenini bu firma yap</option>
              <option value="atla" ${x.secim === 'atla' ? 'selected' : ''}>Bu satırı aktarma</option></select></div>`).join('')}
          ${p.disarida.length ? `<div class="kucuk-yazi soluk">${ikon('bilgi')} İş takibinde bu firmada olup Excel'de olmayan <b>${p.disarida.length}</b> iş: ${p.disarida.map(i => esc(kimlik(i))).join(', ')}. Bunların bedeli iş başı fiyattan hesaplanmaya devam eder, bu yüzden programdaki kalan Excel'deki borçtan farklı olabilir.</div>` : ''}
          <details><summary class="kucuk-yazi" style="cursor:pointer">Satırları göster (${p.satirlar.length})</summary>
            <div class="tablo-kap"><table class="veri mali-tablo"><thead><tr><th>Tarih</th><th>Excel'deki satır</th><th>Ne olacak</th><th class="sag">Bedel</th><th class="sag">Alınan</th></tr></thead><tbody>
            ${p.satirlar.map(x => { const s = x.s;
              const ne = s.tur === 'devir' ? 'Önceki alacak (devir)' : s.tur === 'onceden_odeme' ? 'Eski hesaptan alınmış (fazla ödeme)' : s.tur === 'odeme' ? 'Ödeme' + (s.yontem ? ' · ' + YONTEM[s.yontem] : '')
                : x.durum === 'eslesti' ? `<span class="etiket yesil">Eşleşti</span> ${esc(kimlik(x.is))}` : x.durum === 'baska' ? '<span class="etiket sari">Başka işverende</span>' : '<span class="etiket">Yeni geçmiş iş</span>';
              return `<tr><td class="kucuk-yazi">${esc(s.tarih ? trTarih(s.tarih) : '')}</td><td class="kucuk-yazi">${esc(s.metin)}</td><td class="kucuk-yazi">${ne}</td>
                <td class="sag">${s.tur === 'is' ? tl0(s.bedel) : s.tur === 'devir' ? tl0(s.tutar) : ''}</td><td class="sag">${s.tur === 'is' ? (s.alinan ? tl0(s.alinan) : '') : s.tur !== 'devir' ? tl0(s.tutar) : ''}</td></tr>`; }).join('')}
            </tbody></table></div></details>
        </div></div>`; }).join('')}</div>
    <div id="aktarSonuc"></div>`);
  $('#aktarIptal').onclick = () => { AKTAR.veri = AKTAR.plan = null; location.hash = '#/mali'; };
  $$('[data-hedef]').forEach(s => s.onchange = () => { const n = +s.dataset.hedef; const p = P[n]; P[n] = Object.assign(firmaPlani(p.f, s.value, s.value ? '' : firmaAdiTemizle(p.f.klasor)), { aktar: p.aktar }); maliAktarSayfasi(); });
  $$('[data-aktar]').forEach(c => c.onchange = () => { P[+c.dataset.aktar].aktar = c.checked; });
  $$('[data-sil]').forEach(c => c.onchange = () => { P[+c.dataset.sil].sil = c.checked; });
  $$('[data-artiksil]').forEach(c => c.onchange = () => { P[+c.dataset.artiksil].artikSil = c.checked; });
  $$('[data-baska]').forEach(s => s.onchange = () => { const [n, k] = s.dataset.baska.split(':').map(Number); P[n].satirlar[k].secim = s.value; });
  $('#aktarBasla').onclick = aktarimiYap;
}

async function aktarimiYap() {
  const P = AKTAR.plan.filter(p => p.aktar);
  if (!P.length) return bildir('Aktarılacak firma seçin', 'hata');
  const silinecek = P.filter(p => p.sil).reduce((t, p) => t + p.mevcutHareket.length, 0);
  if (!await onayla('Aktarılsın mı?', `<b>${P.length}</b> firma aktarılacak.${silinecek ? ` Mevcut <b>${silinecek}</b> ödeme/devir kaydı silinip Excel'dekiler girilecek.` : ''}`, 'Aktar')) return;
  const d = $('#aktarBasla'); d.disabled = true;
  const sonuc = $('#aktarSonuc'); const rapor = []; const yontemli = !MALI.yontemYok;
  for (const p of P) {
    sonuc.innerHTML = `<div class="kutu">${esc(p.f.klasor)} aktarılıyor…</div>`;
    try {
      // 1) cari
      let cari = p.hedef ? isverenCari(p.hedef) : null;
      if (!cari) {
        const ad = p.hedef ? (isverenAdi(p.hedef) || p.hedef) : p.yeniAd;
        const { data, error } = await BULUT.sb.from('cariler').upsert({ tur: 'isveren', ad, anahtar: ik(ad) }, { onConflict: 'tur,anahtar' }).select().single();
        if (error) throw sbHata(error);
        MALI.cariler.set(data.id, data); cari = data;
      }
      // 2) eski ödeme/devir kayıtları
      if (p.artikSil) for (const i of p.artik) { await api('DELETE', `is_takip/isler/${encodeURIComponent(i.id)}`); MALI.ucretler.delete(i.id); }
      if (p.sil) for (const h of p.mevcutHareket) { const { error } = await BULUT.sb.from('hareketler').delete().eq('id', h.id); if (error) throw sbHata(error); MALI.hareketler.delete(h.id); }
      // 3) işler
      const yeniIsler = [], ucretler = [], hareketler = [];
      const hareket = (s, tutar, aciklama, isId) => {
        const h = { cari_id: cari.id, tur: 'tahsilat', tutar, tarih: s.tarih || bugunIso(), aciklama, is_id: isId || null, ekleyen: BULUT.eposta };
        if (yontemli) h.yontem = s.yontem || '';        // toplu kayıtta bütün satırların alanları aynı olmalı
        hareketler.push(h);
      };
      let esles = 0, yeni = 0, tasinan = 0;
      for (const x of p.satirlar) {
        const s = x.s;
        if (s.tur === 'devir') { hareket(s, -s.tutar, 'Eski hesaptan kalan (Excel)'); continue; }
        if (s.tur === 'onceden_odeme') { hareket(s, s.tutar, 'Eski hesaptan kalan, önceden alınmış (Excel)'); continue; }
        if (s.tur === 'odeme') { hareket(s, s.tutar, s.metin); continue; }
        if (x.durum === 'baska' && x.secim === 'atla') continue;
        let isId;
        if (x.durum === 'eslesti' || (x.durum === 'baska' && x.secim === 'tasi')) {
          isId = x.is.id;
          if (x.durum === 'baska') { await api('PUT', `is_takip/isler/${encodeURIComponent(isId)}`, { isveren: cari.ad }); tasinan++; } else esles++;
        } else {
          const govde = { isveren: cari.ad, mal_sahibi: s.mal_sahibi || s.metin.toLocaleUpperCase('tr'), mahalle: s.mahalle || '', ada: s.ada || '', parsel: s.parsel || '',
            notlar: [s.not, s.ek_not].filter(Boolean).join(' · ') };
          VERI_DURUM.forEach(a => { govde[a] = true; }); govde.bina_yikildi = 'evet';
          const { is: yeniIs } = isTemizle(govde, null, BULUT.eposta);
          yeniIs.mali_kayit = true; yeniIs.sira = Date.now() + yeniIsler.length;
          if (s.tarih) yeniIs.olusturma = s.tarih + 'T12:00:00';
          yeniIsler.push(yeniIs); isId = yeniIs.id; yeni++;
        }
        ucretler.push({ is_id: isId, ucret: s.bedel });
        if (s.alinan) hareket(s, s.alinan, `${s.mal_sahibi || s.metin} ödemesi (Excel)`, isId);
      }
      for (let k = 0; k < yeniIsler.length; k += 200) {
        const parca = yeniIsler.slice(k, k + 200);
        const { error } = await BULUT.sb.from('isler').insert(parca.map(i => ({ id: i.id, veri: i, guncelleyen: BULUT.eposta })));
        if (error) throw sbHata(error);
        parca.forEach(i => BULUT.isler.set(i.id, i));
      }
      for (const u of ucretler) await isUcretKaydet(u.is_id, { ucret: u.ucret });
      if (hareketler.length) {
        const { data, error } = await BULUT.sb.from('hareketler').insert(hareketler).select();
        if (error) throw sbHata(error);
        (data || []).forEach(h => MALI.hareketler.set(h.id, h));
      }
      const oz = isverenOzet(ik(cari.anahtar || cari.ad));
      rapor.push({ ad: p.f.klasor, cari: cari.ad, esles, yeni, tasinan, odeme: hareketler.length, kalan: oz.kalan, excel: p.f.excel_borc });
    } catch (e) { rapor.push({ ad: p.f.klasor, hata: e.message }); }
  }
  AKTAR.veri = AKTAR.plan = null;
  sayfaYaz(`<div class="ust"><a class="geri" href="#/mali">${ikon('geri')}</a><div><h1>Aktarım bitti</h1></div></div>
    <div class="kart"><div class="tablo-kap"><table class="veri mali-tablo"><thead><tr><th>Excel</th><th>Programdaki firma</th><th class="sag">Eşleşen</th><th class="sag">Yeni iş</th><th class="sag">Hareket</th><th class="sag">Programda kalan</th><th class="sag">Excel'de borç</th></tr></thead>
    <tbody>${rapor.map(r => r.hata ? `<tr><td>${esc(r.ad)}</td><td colspan="6" style="color:var(--kirmizi)">Hata: ${esc(r.hata)}</td></tr>`
      : `<tr><td>${esc(r.ad)}</td><td><a href="#/mali/isveren/${encodeURIComponent(ik(r.cari))}">${esc(r.cari)}</a></td><td class="sag">${r.esles + r.tasinan}</td><td class="sag">${r.yeni}</td><td class="sag">${r.odeme}</td>
        <td class="sag">${tl(r.kalan)}</td><td class="sag">${tl(r.excel || 0)} ${Math.abs((r.excel || 0) - r.kalan) > 0.5 ? '<span class="etiket sari">farklı</span>' : '<span class="etiket yesil">tutuyor</span>'}</td></tr>`).join('')}</tbody></table></div>
    <div class="kart-ic kucuk-yazi soluk">"Farklı" çıkanlarda fark genellikle iş takibinde olup Excel'de olmayan işlerden gelir; firmanın hesap sayfasından kontrol edebilirsiniz.</div></div>`);
}
