'use strict';
/* İş Takibi — bulut sürümü (Supabase)
 *  - mail + şifre ile giriş, yetkililer listesi ve roller (yonetici / duzenle / goruntule)
 *  - bütün işler tek bir ortak veritabanında; biri değiştirince herkesin ekranı kendiliğinden yenilenir
 *  - is_takip.js'in çağırdığı api('GET', 'is_takip/isler') gibi istekler burada Supabase'e çevrilir,
 *    böylece arayüz kodu masaüstü sürümüyle aynı kalır. */

const WEB_SURUM = 'B1.0.0';
const D = { durum: null, firmalar: null };
const BULUT = { sb: null, eposta: '', rol: '', isler: new Map(), canli: 'bekliyor', tazeleZaman: null, bekleyenTazele: false };

function sayfaYaz(html) { icerik().innerHTML = `<div class="sayfa">${html}</div>`; ikonlariDoldur(icerik()); icerik().scrollTop = 0; }

// ------------------------------------------------------------------ bağlantı ayarı
function baglantiAyari() {
  const a = window.IS_TAKIP_AYAR || {};
  let yerel = {};
  try { yerel = JSON.parse(localStorage.getItem('isTakip.baglanti') || '{}'); } catch (e) { /* yok */ }
  return { url: (a.supabaseUrl || yerel.url || '').trim(), anahtar: (a.supabaseAnahtar || yerel.anahtar || '').trim() };
}
function sbHata(e) {
  if (!e) return new Error('Bilinmeyen hata');
  const m = e.message || String(e);
  if (/row-level security|permission denied|violates row-level/i.test(m)) return new Error('Bu işlem için yetkiniz yok');
  if (/Invalid login credentials/i.test(m)) return new Error('Mail ya da şifre hatalı');
  if (/Email not confirmed/i.test(m)) return new Error('Önce mailinize gelen onay bağlantısına tıklayın');
  if (/User already registered/i.test(m)) return new Error('Bu mail ile zaten kayıt var, Giriş yapın');
  if (/Password should be at least/i.test(m)) return new Error('Şifre en az 6 karakter olmalı');
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return new Error('İnternet bağlantısı yok ya da sunucuya ulaşılamıyor');
  return new Error(m);
}

// ------------------------------------------------------------------ veri
const isSirala = (a, b) => (a.olusturma || '').localeCompare(b.olusturma || '') || (a.sira || 0) - (b.sira || 0) || a.id.localeCompare(b.id);
const tumIsler = () => [...BULUT.isler.values()].sort(isSirala);

async function isleriIndir() {
  const liste = [];
  for (let bas = 0; ; bas += 1000) {
    const { data, error } = await BULUT.sb.from('isler').select('id, veri').range(bas, bas + 999);
    if (error) throw sbHata(error);
    liste.push(...data);
    if (data.length < 1000) break;
  }
  BULUT.isler = new Map(liste.map(r => [r.id, isGoc(Object.assign({}, r.veri, { id: r.id }))]));
}
async function isGuncelleBulut(id, govde) {
  const eski = BULUT.isler.get(id);
  if (!eski) throw new Error('İş bulunamadı (silinmiş olabilir)');
  const { is: yeni, gecmisEk } = isTemizle(govde, eski, BULUT.eposta);
  const alanlar = { guncelleme: yeni.guncelleme };
  Object.keys(govde).forEach(a => { if (a in yeni && a !== 'gecmis' && a !== 'id') alanlar[a] = yeni[a]; });
  alanlar.bos_alanlar = yeni.bos_alanlar;
  if ('alan_notlari' in govde) alanlar.alan_notlari = yeni.alan_notlari;
  const { data, error } = await BULUT.sb.rpc('is_guncelle', { p_id: id, p_alanlar: alanlar, p_gecmis: gecmisEk });
  if (error) throw sbHata(error);
  const son = isGoc(Object.assign({}, data, { id }));
  BULUT.isler.set(id, son);
  return son;
}

/* is_takip.js'in sunucu istekleri (masaüstünde /api/... ; burada Supabase) */
async function api(yontem, yol, govde) {
  const p = yol.split('/').filter(Boolean);
  if (yol === 'durum') return D.durum;
  if (yol === 'projeler') return { projeler: [] };
  if (yol === 'firmalar') return { firmalar: [], varsayilan: '' };
  if (p[0] === 'is_takip' && p[1] === 'isler') {
    if (p.length === 2 && yontem === 'GET') return { surum: 1, isler: tumIsler() };
    if (p.length === 2 && yontem === 'POST') {
      const { is: yeni } = isTemizle(govde || {}, null, BULUT.eposta);
      yeni.sira = Date.now();
      const { error } = await BULUT.sb.from('isler').insert({ id: yeni.id, veri: yeni, guncelleyen: BULUT.eposta });
      if (error) throw sbHata(error);
      BULUT.isler.set(yeni.id, yeni);
      return yeni;
    }
    const id = decodeURIComponent(p[2] || '');
    if (yontem === 'GET') {
      if (BULUT.isler.has(id)) return BULUT.isler.get(id);
      const { data, error } = await BULUT.sb.from('isler').select('id, veri').eq('id', id).maybeSingle();
      if (error) throw sbHata(error);
      if (!data) throw new Error('İş bulunamadı (silinmiş olabilir)');
      return isGoc(Object.assign({}, data.veri, { id }));
    }
    if (yontem === 'PUT' || yontem === 'PATCH') return isGuncelleBulut(id, govde || {});
    if (yontem === 'DELETE') {
      const { error } = await BULUT.sb.from('isler').delete().eq('id', id);
      if (error) throw sbHata(error);
      BULUT.isler.delete(id);
      return { silindi: id };
    }
  }
  throw new Error('Bu işlem bulut sürümünde yok: ' + yol);
}

// ------------------------------------------------------------------ canlı güncelleme
function canliBaslat() {
  if (BULUT.kanal) BULUT.sb.removeChannel(BULUT.kanal);
  BULUT.kanal = BULUT.sb.channel('isler-degisim')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'isler' }, olay => {
      if (olay.eventType === 'DELETE') {
        const id = olay.old && olay.old.id;
        if (id && BULUT.isler.delete(id)) ekraniTazele(id);
        return;
      }
      const r = olay.new; if (!r || !r.id) return;
      const yeni = isGoc(Object.assign({}, r.veri, { id: r.id }));
      const eski = BULUT.isler.get(r.id);
      if (eski && JSON.stringify(eski) === JSON.stringify(yeni)) return;     // kendi kaydımızın yankısı
      BULUT.isler.set(r.id, yeni);
      ekraniTazele(r.id, r.guncelleyen);
    })
    .subscribe(durum => { BULUT.canli = durum === 'SUBSCRIBED' ? 'canli' : (durum === 'CLOSED' ? 'kapali' : 'bekliyor'); kenarYaz(); });
}
function ekraniTazele(id, kim) {
  clearTimeout(BULUT.tazeleZaman);
  BULUT.tazeleZaman = setTimeout(() => tazeleUygula(id, kim), 300);
}
function tazeleUygula(id, kim) {
  if (!IT.isler && !location.hash.startsWith('#/is')) return;
  IT.isler = tumIsler(); kenarYaz();
  // açık bir pencere, seçim menüsü ya da yazılan arama varken ekranı bozma; az sonra tekrar dene
  if ($('#hucreMenu') || !$('#perde').classList.contains('gizli')) { BULUT.tazeleZaman = setTimeout(() => tazeleUygula(id, kim), 1500); return; }
  const h = location.hash.replace(/^#\/?/, '') || 'isler';
  const [sayfa, ...rest] = h.split('/').map(decodeURIComponent);
  const kaydirma = icerik().scrollTop;
  const geriKoy = () => { icerik().scrollTop = kaydirma; };
  if (sayfa === 'is') {
    if (rest[0] !== id) return;
    if (IT.form && IT.degisti) { bildir(`Bu işi ${kim || 'başka biri'} az önce değiştirdi. Kaydederseniz sizin değişiklikleriniz de yazılır.`, 'hata'); return; }
    IT.form = null; git().then(geriKoy);
    return;
  }
  if (sayfa === 'isler' && !['rapor', 'aktar'].includes(rest[0]) && document.activeElement && document.activeElement.id === 'ara') {
    tabloCiz(ik(rest[0])); return;          // arama kutusuna yazılırken yalnızca tablo yenilenir
  }
  if (sayfa === 'isler' || sayfa === 'hesap') git().then(geriKoy);
}

// ------------------------------------------------------------------ istemci kancaları (is_takip.js)
window.ISTEMCI = {
  kenarEk() {
    const r = { canli: ['#4ade80', 'Canlı'], bekliyor: ['#fbbf24', 'Bağlanıyor'], kapali: ['#f87171', 'Bağlantı yok'] }[navigator.onLine ? BULUT.canli : 'kapali'];
    return `<div style="margin-top:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:99px;background:${r[0]};margin-right:6px"></span>${r[1]}</div>
      <div style="margin-top:4px;word-break:break-all">${esc(BULUT.eposta)}</div>`;
  },
  async iceAktar(dosya, guncelle, sayfa) {
    const buf = await dosya.arrayBuffer();
    const satirlar = await xlsxSayfaOku(buf, sayfa || 'TAKİP');
    const { eklenecek, guncellenecek, sonuc } = excelPlani(excelSatirlari(satirlar, sayfa), tumIsler(), guncelle, BULUT.eposta);
    for (let n = 0; n < eklenecek.length; n += 200) {
      const parca = eklenecek.slice(n, n + 200);
      const { error } = await BULUT.sb.from('isler').insert(parca.map(i => ({ id: i.id, veri: i, guncelleyen: BULUT.eposta })));
      if (error) throw sbHata(error);
      parca.forEach(i => BULUT.isler.set(i.id, i));
    }
    for (const g of guncellenecek) {
      const { data, error } = await BULUT.sb.rpc('is_guncelle', { p_id: g.id, p_alanlar: g.alanlar, p_gecmis: g.gecmisEk });
      if (error) throw sbHata(error);
      BULUT.isler.set(g.id, isGoc(Object.assign({}, data, { id: g.id })));
    }
    return sonuc;
  },
  csvIndir(isveren) {
    const liste = tumIsler().filter(i => !isveren || ik(i.isveren) === isveren);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csvUret(liste)], { type: 'text/csv;charset=utf-8' }));
    a.download = 'is_takip' + (isveren ? '_' + isveren : '') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  aktarSayfasiSonra() { tasimaKarti(); },
};

// ------------------------------------------------------------------ eski uygulamadan veri taşıma (isler.json)
function tasimaKarti() {
  if (saltOkunur()) return;
  const yigin = $('.sayfa .yigin'); if (!yigin) return;
  const kart = document.createElement('div');
  kart.className = 'kart';
  kart.innerHTML = `<div class="kart-bas"><h2>Bilgisayardaki uygulamadan taşı</h2><span class="aciklama">Notlar, geçmiş ve bütün işaretlemeler aynen gelir</span></div>
    <div class="kart-ic yigin">
      <div class="kutu bilgi">${ikon('bilgi')}<div>Bilgisayardaki İş Takibi'nde <b>Sistem › Veri klasörü › Aç</b>'a basın. Açılan klasördeki
        <b>isler.json</b> dosyasını buraya bırakın. (Klasör: Belgeler\\ZeminEtut\\is_takip)</div></div>
      <label class="secim"><input type="checkbox" id="tasiUzerine"> Buluttaki aynı işlerin üzerine yaz (işaretli değilse yalnızca eksik işler eklenir)</label>
      <div class="birak" id="tasiBirak"><b>isler.json dosyasını buraya bırakın</b>ya da tıklayıp seçin</div>
      <div id="tasiSonuc"></div></div>`;
  yigin.prepend(kart);
  ikonlariDoldur(kart);
  const isle = async ([d]) => {
    if (!d) return;
    try {
      const veri = JSON.parse(await d.text());
      const gelen = (Array.isArray(veri) ? veri : veri.isler || []).filter(i => i && i.id && i.isveren);
      if (!gelen.length) throw new Error('Dosyada iş bulunamadı');
      const uzerine = $('#tasiUzerine').checked;
      const yeni = gelen.filter(i => uzerine || !BULUT.isler.has(i.id)).map((i, n) => isGoc(Object.assign({ sira: n }, i)));
      for (let n = 0; n < yeni.length; n += 200) {
        const parca = yeni.slice(n, n + 200);
        const { error } = await BULUT.sb.from('isler').upsert(parca.map(i => ({ id: i.id, veri: i, guncelleyen: BULUT.eposta })), { onConflict: 'id' });
        if (error) throw sbHata(error);
        parca.forEach(i => BULUT.isler.set(i.id, i));
      }
      IT.isler = tumIsler();
      $('#tasiSonuc').innerHTML = `<div class="kutu basari">${ikon('tamam')}<div><b>${esc(d.name)}</b>: ${gelen.length} iş okundu,
        <b>${yeni.length}</b> iş buluta ${uzerine ? 'yazıldı' : 'eklendi'}${gelen.length - yeni.length ? `, ${gelen.length - yeni.length} iş zaten vardı` : ''}. <a href="#/isler">İşlere git</a></div></div>`;
      ikonlariDoldur($('#tasiSonuc'));
      bildir('Veriler taşındı');
    } catch (e) { hataGoster(e instanceof SyntaxError ? new Error('Dosya okunamadı, isler.json seçtiğinizden emin olun') : e); }
  };
  const b = $('#tasiBirak');
  birakmaAlani(b, isle);
  b.onclick = async () => isle(await dosyaSec(false, '.json,application/json'));
}

// ------------------------------------------------------------------ giriş ekranları
function girisGoster(html) {
  document.body.classList.add('girisli-degil');
  const g = $('#giris');
  g.innerHTML = `<div class="giris-kart">
    <div class="marka giris-marka"><div class="marka-ikon"><svg viewBox="0 0 32 32"><path d="M6 22h20M6 16h20M6 10h20" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></div>
      <div><div class="marka-ad">Zemin Etüt</div><div class="marka-alt">İş Takibi</div></div></div>${html}</div>`;
  ikonlariDoldur(g);
}
function girisEkrani(sekme = 'giris', mesaj = '') {
  const baslik = { giris: 'Giriş yap', kayit: 'Kayıt ol', unuttum: 'Şifremi unuttum' }[sekme];
  girisGoster(`
    <h1>${baslik}</h1>
    ${mesaj ? `<div class="kutu bilgi" style="margin-bottom:14px">${ikon('bilgi')}<div>${mesaj}</div></div>` : ''}
    <form id="girisForm" class="yigin">
      <div class="alan"><label>Mail adresi</label><input class="girdi" id="gEposta" type="email" autocomplete="username" required value="${esc(depoOkuG('sonEposta'))}"></div>
      ${sekme !== 'unuttum' ? `<div class="alan"><label>Şifre</label><input class="girdi" id="gSifre" type="password" minlength="6" autocomplete="${sekme === 'kayit' ? 'new-password' : 'current-password'}" required>
        ${sekme === 'kayit' ? '<div class="ipucu">En az 6 karakter</div>' : ''}</div>` : ''}
      <button class="dugme ana buyuk" type="submit" style="width:100%;justify-content:center">${{ giris: 'Giriş yap', kayit: 'Kayıt ol', unuttum: 'Sıfırlama bağlantısı gönder' }[sekme]}</button>
    </form>
    <div class="giris-alt">
      ${sekme !== 'giris' ? '<a href="#" data-sekme="giris">Giriş yap</a>' : ''}
      ${sekme !== 'kayit' ? '<a href="#" data-sekme="kayit">Hesabım yok, kayıt ol</a>' : ''}
      ${sekme !== 'unuttum' ? '<a href="#" data-sekme="unuttum">Şifremi unuttum</a>' : ''}
    </div>`);
  $$('[data-sekme]').forEach(a => a.onclick = e => { e.preventDefault(); girisEkrani(a.dataset.sekme); });
  $('#girisForm').onsubmit = async e => {
    e.preventDefault();
    const eposta = $('#gEposta').value.trim(), sifre = ($('#gSifre') || {}).value;
    depoYazG('sonEposta', eposta);
    const dugme = $('#girisForm button'); dugme.disabled = true;
    try {
      const donus = location.origin + location.pathname;
      if (sekme === 'giris') {
        const { data, error } = await BULUT.sb.auth.signInWithPassword({ email: eposta, password: sifre });
        if (error) throw sbHata(error);
        await oturumAc(data.session);
      } else if (sekme === 'kayit') {
        const { data, error } = await BULUT.sb.auth.signUp({ email: eposta, password: sifre, options: { emailRedirectTo: donus } });
        if (error) throw sbHata(error);
        if (data.session) await oturumAc(data.session);
        else girisEkrani('giris', `<b>${esc(eposta)}</b> adresine onay maili gönderildi. Maildeki bağlantıya tıklayın, sonra buradan giriş yapın.`);
      } else {
        const { error } = await BULUT.sb.auth.resetPasswordForEmail(eposta, { redirectTo: donus });
        if (error) throw sbHata(error);
        girisEkrani('giris', `Şifre sıfırlama bağlantısı <b>${esc(eposta)}</b> adresine gönderildi.`);
      }
    } catch (err) { hataGoster(err); dugme.disabled = false; }
  };
  ($('#gEposta').value ? ($('#gSifre') || $('#gEposta')) : $('#gEposta')).focus();
}
function depoOkuG(a) { try { return localStorage.getItem('isTakip.' + a) || ''; } catch (e) { return ''; } }
function depoYazG(a, v) { try { localStorage.setItem('isTakip.' + a, v); } catch (e) { /* önemsiz */ } }

function yeniSifreEkrani() {
  girisGoster(`<h1>Yeni şifre</h1>
    <form id="sifreForm" class="yigin">
      <div class="alan"><label>Yeni şifre</label><input class="girdi" id="ySifre" type="password" minlength="6" autocomplete="new-password" required></div>
      <button class="dugme ana buyuk" type="submit" style="width:100%;justify-content:center">Şifreyi kaydet</button></form>`);
  $('#sifreForm').onsubmit = async e => {
    e.preventDefault();
    const { data, error } = await BULUT.sb.auth.updateUser({ password: $('#ySifre').value });
    if (error) return hataGoster(sbHata(error));
    bildir('Şifre değiştirildi');
    const { data: s } = await BULUT.sb.auth.getSession();
    oturumAc(s.session || data.session);
  };
  $('#ySifre').focus();
}
function yetkisizEkrani() {
  girisGoster(`<h1>Yetki bekleniyor</h1>
    <p class="giris-p">Hesabın açıldı ama yönetici seni henüz eklemedi. Yöneticiye şu mail adresini ver, ekledikten sonra
      <b>Tekrar dene</b>'ye bas:</p>
    <div class="giris-eposta">${esc(BULUT.eposta)}</div>
    <div style="display:flex;gap:8px;margin-top:16px"><button class="dugme ana" id="tekrar">${ikon('yenile')}Tekrar dene</button>
      <button class="dugme hayalet" id="cikis">Çıkış yap</button></div>`);
  $('#tekrar').onclick = async () => { const { data } = await BULUT.sb.auth.getSession(); oturumAc(data.session); };
  $('#cikis').onclick = cikisYap;
}
function ayarEkrani() {
  const a = baglantiAyari();
  girisGoster(`<h1>Bağlantı ayarı</h1>
    <p class="giris-p">Supabase projesinin bilgilerini girin (Project Settings › API). Herkes için kalıcı olması için bu iki bilgiyi
      <b>ayar.js</b> dosyasına yazın.</p>
    <form id="ayarForm" class="yigin">
      <div class="alan"><label>Project URL</label><input class="girdi" id="aUrl" placeholder="https://xxxx.supabase.co" value="${esc(a.url)}" required></div>
      <div class="alan"><label>anon public key</label><input class="girdi" id="aAnahtar" value="${esc(a.anahtar)}" required></div>
      <button class="dugme ana buyuk" type="submit" style="width:100%;justify-content:center">Bağlan</button></form>`);
  $('#ayarForm').onsubmit = e => {
    e.preventDefault();
    try { localStorage.setItem('isTakip.baglanti', JSON.stringify({ url: $('#aUrl').value.trim(), anahtar: $('#aAnahtar').value.trim() })); } catch (x) { /* */ }
    location.reload();
  };
}

async function oturumAc(oturum) {
  if (!oturum) return girisEkrani();
  BULUT.eposta = (oturum.user && oturum.user.email) || '';
  const { data, error } = await BULUT.sb.from('yetkililer').select('rol, ad').eq('email', BULUT.eposta.toLowerCase()).maybeSingle();
  if (error) {
    if (/relation .* does not exist|schema cache/i.test(error.message)) return girisGoster(`<h1>Kurulum eksik</h1><p class="giris-p">Supabase'de <b>kurulum.sql</b> henüz çalıştırılmamış. SQL Editor'de çalıştırıp sayfayı yenileyin.</p>`);
    return hataGoster(sbHata(error));
  }
  if (!data) return yetkisizEkrani();
  BULUT.rol = data.rol;
  D.durum = { surum: WEB_SURUM, tek_basina: true, bulut: true, salt_okunur: data.rol === 'goruntule', rol: data.rol, eposta: BULUT.eposta };
  try { await isleriIndir(); } catch (e) { return hataGoster(e); }
  IT.isler = null;
  document.body.classList.remove('girisli-degil');
  $('#giris').innerHTML = '';
  $$('[data-yonetici]').forEach(a => { a.style.display = data.rol === 'yonetici' ? '' : 'none'; });
  canliBaslat();
  git();
}
async function cikisYap() {
  if (BULUT.kanal) { BULUT.sb.removeChannel(BULUT.kanal); BULUT.kanal = null; }
  await BULUT.sb.auth.signOut();
  BULUT.isler = new Map(); IT.isler = null; D.durum = null;
  girisEkrani();
}

// ------------------------------------------------------------------ hesap ve kullanıcılar
const ROL_ADI = { yonetici: 'Yönetici', duzenle: 'Düzenleyebilir', goruntule: 'Yalnızca görür' };
function hesapSayfasi() {
  sayfaYaz(`<div class="ust"><div><h1>Hesabım</h1><div class="alt">${esc(BULUT.eposta)} · ${esc(ROL_ADI[BULUT.rol] || BULUT.rol)}</div></div></div>
    <div class="yigin">
      <div class="kart"><div class="kart-bas"><h2>Şifre değiştir</h2></div><div class="kart-ic">
        <form id="sifreDegis" style="display:flex;gap:10px;flex-wrap:wrap"><input class="girdi" id="hSifre" type="password" minlength="6" placeholder="Yeni şifre (en az 6 karakter)" autocomplete="new-password" style="flex:1;min-width:200px" required>
        <button class="dugme ana" type="submit">${ikon('kaydet')}Kaydet</button></form></div></div>
      <div class="kart"><div class="kart-bas"><h2>Telefona ekle</h2></div><div class="kart-ic kucuk-yazi" style="line-height:1.6">
        <b>iPhone:</b> Bu sayfayı Safari'de açın › alttaki <b>Paylaş</b> düğmesi › <b>Ana Ekrana Ekle</b>.<br>
        <b>Android:</b> Chrome'da açın › sağ üstteki ⋮ › <b>Uygulamayı yükle</b> (ya da Ana ekrana ekle).</div></div>
      <div class="kart"><div class="kart-ic" style="display:flex;align-items:center;gap:12px">
        <div style="flex:1" class="soluk kucuk-yazi">Sürüm ${esc(WEB_SURUM)} · ${BULUT.isler.size} iş</div>
        <button class="dugme tehlike" id="cikisYap">Çıkış yap</button></div></div></div>`);
  $('#cikisYap').onclick = cikisYap;
  $('#sifreDegis').onsubmit = async e => {
    e.preventDefault();
    const { error } = await BULUT.sb.auth.updateUser({ password: $('#hSifre').value });
    if (error) return hataGoster(sbHata(error));
    $('#hSifre').value = ''; bildir('Şifre değiştirildi');
  };
}
async function kullanicilarSayfasi() {
  if (BULUT.rol !== 'yonetici') { location.hash = '#/isler'; return; }
  const { data, error } = await BULUT.sb.from('yetkililer').select('*').order('eklenme');
  if (error) return hataGoster(sbHata(error));
  const yoneticiSayisi = data.filter(k => k.rol === 'yonetici').length;
  sayfaYaz(`<div class="ust"><div><h1>Kullanıcılar</h1><div class="alt">${data.length} kişi uygulamayı kullanabilir</div></div></div>
    <div class="yigin">
      <div class="kart"><div class="kart-bas"><h2>Kişi ekle</h2><span class="aciklama">Eklediğin kişi uygulamayı açıp aynı mail ile "Kayıt ol" demeli</span></div>
        <div class="kart-ic"><form id="kEkle" class="kul-form">
          <input class="girdi" id="kEposta" type="email" placeholder="mail@ornek.com" required>
          <input class="girdi" id="kAd" placeholder="Ad (isteğe bağlı)">
          <select class="girdi" id="kRol">${Object.entries(ROL_ADI).map(([k, v]) => `<option value="${k}" ${k === 'duzenle' ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <button class="dugme ana" type="submit">${ikon('arti')}Ekle</button></form></div></div>
      <div class="kart"><ul class="liste kul-liste">${data.map(k => `<li>
        <div class="dosya-ikon">${ikon('kisi')}</div>
        <div class="ad"><div>${esc(k.ad || k.email)}</div><div class="kucuk-yazi">${esc(k.email)}${k.email.toLowerCase() === BULUT.eposta.toLowerCase() ? ' · sen' : ''}</div></div>
        <select class="girdi" data-rol="${esc(k.email)}" style="width:auto">${Object.entries(ROL_ADI).map(([r, v]) => `<option value="${r}" ${r === k.rol ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="dugme kucuk hayalet tehlike" data-kaldir="${esc(k.email)}" title="Kaldır">${ikon('sil')}</button></li>`).join('')}</ul></div>
      <div class="kutu bilgi">${ikon('bilgi')}<div><b>Yönetici</b> her şeyi yapar ve kişi ekler. <b>Düzenleyebilir</b> iş ekler, işaretler, not yazar.
        <b>Yalnızca görür</b> listeleri ve raporları görür, değiştiremez.</div></div></div>`);
  const kendim = e => e.toLowerCase() === BULUT.eposta.toLowerCase();
  $('#kEkle').onsubmit = async e => {
    e.preventDefault();
    const satir = { email: $('#kEposta').value.trim().toLowerCase(), ad: $('#kAd').value.trim(), rol: $('#kRol').value };
    const { error: h } = await BULUT.sb.from('yetkililer').upsert(satir, { onConflict: 'email' });
    if (h) return hataGoster(sbHata(h));
    bildir(`${satir.email} eklendi`); kullanicilarSayfasi();
  };
  $$('[data-rol]').forEach(s => s.onchange = async () => {
    if (kendim(s.dataset.rol) && s.value !== 'yonetici' && yoneticiSayisi < 2) { bildir('En az bir yönetici kalmalı', 'hata'); s.value = 'yonetici'; return; }
    const { error: h } = await BULUT.sb.from('yetkililer').update({ rol: s.value }).eq('email', s.dataset.rol);
    if (h) return hataGoster(sbHata(h));
    bildir('Yetki değişti');
  });
  $$('[data-kaldir]').forEach(b => b.onclick = async () => {
    if (kendim(b.dataset.kaldir)) return bildir('Kendinizi kaldıramazsınız', 'hata');
    if (!await onayla('Kişi kaldırılsın mı?', `<b>${esc(b.dataset.kaldir)}</b> artık uygulamaya giremeyecek. İşlere dokunulmaz.`, 'Kaldır', true)) return;
    const { error: h } = await BULUT.sb.from('yetkililer').delete().eq('email', b.dataset.kaldir);
    if (h) return hataGoster(sbHata(h));
    kullanicilarSayfasi();
  });
}

// ------------------------------------------------------------------ yönlendirme
async function git() {
  if (!D.durum) return;
  const h = location.hash.replace(/^#\/?/, '') || 'isler';
  const [sayfa, ...rest] = h.split('/').map(decodeURIComponent);
  const etkin = sayfa === 'is' ? 'isler' : sayfa + (sayfa === 'isler' && ['rapor', 'aktar'].includes(rest[0]) ? '/' + rest[0] : '');
  $$('.menu a').forEach(a => a.classList.toggle('etkin', a.dataset.sayfa === etkin));
  try {
    if (sayfa === 'hesap') return hesapSayfasi();
    if (sayfa === 'kullanicilar') return await kullanicilarSayfasi();
    if (await isTakipYonlendir(sayfa, rest)) return;
    location.hash = '#/isler';
  } catch (e) { hataGoster(e); }
}
window.addEventListener('hashchange', async () => {
  document.body.classList.remove('menu-acik');
  if (!D.durum) return;
  await isTakipAyrilirken(); git();
});
window.addEventListener('online', () => { kenarYaz(); if (D.durum) { isleriIndir().then(() => ekraniTazele('')).catch(() => {}); } });
window.addEventListener('offline', kenarYaz);
document.addEventListener('visibilitychange', () => {       // telefon uykudan dönünce verileri tazele
  if (document.visibilityState === 'visible' && D.durum) isleriIndir().then(() => ekraniTazele('')).catch(() => {});
});

// ------------------------------------------------------------------ başlat
window.addEventListener('DOMContentLoaded', async () => {
  ikonlariDoldur();
  $('#menuAc').onclick = () => document.body.classList.toggle('menu-acik');
  $('#menuPerde').onclick = () => document.body.classList.remove('menu-acik');
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  const a = baglantiAyari();
  if (!a.url || !a.anahtar || !window.supabase) return ayarEkrani();
  BULUT.sb = window.supabase.createClient(a.url, a.anahtar, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  let sifreYenileme = /type=recovery/.test(location.hash);
  BULUT.sb.auth.onAuthStateChange((olay, oturum) => {
    if (olay === 'PASSWORD_RECOVERY') { sifreYenileme = true; yeniSifreEkrani(); }
    if (olay === 'SIGNED_OUT') { D.durum = null; girisEkrani(); }
    if (olay === 'TOKEN_REFRESHED' && oturum && BULUT.kanal) BULUT.sb.realtime.setAuth(oturum.access_token);
  });
  const { data } = await BULUT.sb.auth.getSession();
  if (sifreYenileme) return yeniSifreEkrani();
  if (data.session) oturumAc(data.session); else girisEkrani();
});
