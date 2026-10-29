// TEST İÇİN sahte Supabase: veriler localStorage'da, canlı olaylar BroadcastChannel ile sekmeler arasında.
(function () {
  const DB = 'sahteDB';
  const oku = () => Object.assign({ dosyalar: {}, depo: {}, cariler: {}, is_ucretleri: {}, hareketler: {} }, JSON.parse(localStorage.getItem(DB) || '{"isler":{},"yetkililer":{},"kullanicilar":{}}'));
  const yaz = d => localStorage.setItem(DB, JSON.stringify(d));
  const bc = new BroadcastChannel('sahte-rt');
  let dinleyiciler = [];
  bc.onmessage = e => dinleyiciler.forEach(f => f(e.data));
  const yay = olay => { bc.postMessage(olay); };
  function oturumEposta() { return sessionStorage.getItem('sahteOturum') || localStorage.getItem('sahteOturum'); }
  function rol() { const e = oturumEposta(); const d = oku(); return e && d.yetkililer[e] ? d.yetkililer[e].rol : null; }
  function sonuc(data, error) { return Promise.resolve({ data, error: error ? { message: error } : null }); }
  function sorgu(tablo) {
    const q = { tablo, filtre: [], islem: 'select', tek: false, deger: null, ayar: {} };
    const api = {
      order() { return api; }, range(a, b) { q.range = [a, b]; return api; },
      eq(k, v) { q.filtre.push(r => r[k] === v); return api; },
      ilike(k, v) { q.filtre.push(r => String(r[k]).toLowerCase() === String(v).toLowerCase()); return api; },
      maybeSingle() { q.tek = true; return api; },
      single() { q.tek = true; return api; },
      select() { q.secim = true; return api; },
      insert(v) { q.islem = 'insert'; q.deger = [].concat(v); return api; },
      upsert(v, ayar) { q.islem = 'upsert'; q.deger = [].concat(v); q.ayar = ayar || {}; return api; },
      update(v) { q.islem = 'update'; q.deger = v; return api; },
      delete() { q.islem = 'delete'; return api; },
      then(coz, red) { return calistir(q).then(coz, red); },
    };
    return api;
  }
  function calistir(q) {
    const d = oku(); const r = rol(); const tablo = d[q.tablo];
    const yazabilir = ['isler', 'dosyalar'].includes(q.tablo) ? ['yonetici', 'duzenle'].includes(r) : r === 'yonetici';
    if (['cariler', 'is_ucretleri', 'hareketler'].includes(q.tablo) && r !== 'yonetici') return sonuc(null, 'permission denied for table');
    const satirlar = () => Object.values(tablo).filter(x => q.filtre.every(f => f(x)));
    if (q.islem === 'select' || (q.islem === 'select' && q.secim)) {
      let s = satirlar();
      if (['isler', 'dosyalar'].includes(q.tablo) && !r) s = [];
      if (q.tablo === 'yetkililer' && r !== 'yonetici') s = s.filter(x => x.email === oturumEposta());
      if (q.range) s = s.slice(q.range[0], q.range[1] + 1);
      return sonuc(q.tek ? (s[0] || null) : JSON.parse(JSON.stringify(s)));
    }
    if (!yazabilir) return sonuc(null, 'new row violates row-level security policy');
    const anahtar = q.tablo === 'yetkililer' ? 'email' : q.tablo === 'is_ucretleri' ? 'is_id' : 'id';
    let donen = [];
    if (q.islem === 'insert' || q.islem === 'upsert') {
      if (q.deger.length > 1) { const k0 = Object.keys(q.deger[0]).sort().join(); if (q.deger.some(v => Object.keys(v).sort().join() !== k0)) return sonuc(null, 'All object keys must match'); }
      for (let v of q.deger) {
        if (q.islem === 'upsert' && q.ayar.onConflict && q.ayar.onConflict.includes(',')) {
          const sut = q.ayar.onConflict.split(','); const var_ = Object.values(tablo).find(x => sut.every(c => x[c] === v[c]));
          if (var_) v = Object.assign({}, var_, v);
        }
        if (q.tablo === 'cariler' && q.islem === 'insert' && Object.values(tablo).some(x => x.tur === v.tur && x.anahtar === v.anahtar)) return sonuc(null, 'duplicate key value violates unique constraint');
        if (['dosyalar', 'cariler', 'hareketler'].includes(q.tablo)) v = Object.assign({ id: 'x' + Math.random().toString(16).slice(2), eklenme: new Date().toISOString() }, v);
        if (q.tablo === 'hareketler' && !v.tarih) v.tarih = new Date().toISOString().slice(0, 10);
        donen.push(v);
        if (q.islem === 'insert' && tablo[v[anahtar]]) return sonuc(null, 'duplicate key');
        tablo[v[anahtar]] = Object.assign({}, tablo[v[anahtar]] || {}, v);
        if (q.tablo !== 'yetkililer') yay({ tablo: q.tablo, eventType: 'INSERT', new: tablo[v[anahtar]] });
        donen[donen.length - 1] = tablo[v[anahtar]];
      }
    } else if (q.islem === 'update') {
      satirlar().forEach(x => { Object.assign(x, q.deger); donen.push(x); if (q.tablo !== 'yetkililer' && q.tablo !== 'isler') yay({ tablo: q.tablo, eventType: 'UPDATE', new: x }); });
    } else if (q.islem === 'delete') {
      satirlar().forEach(x => { delete tablo[x[anahtar]]; if (q.tablo !== 'yetkililer') yay({ tablo: q.tablo, eventType: 'DELETE', old: { id: x.id, is_id: x.is_id } }); });
    }
    yaz(d);
    if (q.secim) return sonuc(q.tek ? JSON.parse(JSON.stringify(donen[0] || null)) : JSON.parse(JSON.stringify(donen)));
    return sonuc(null);
  }
  const auth = {
    _dinle: [],
    getSession() { const e = oturumEposta(); return sonuc({ session: e ? { user: { email: e }, access_token: 'x' } : null }); },
    signInWithPassword({ email, password }) {
      const d = oku(); const k = d.kullanicilar[email.toLowerCase()];
      if (!k || k.sifre !== password) return sonuc({}, 'Invalid login credentials');
      localStorage.setItem('sahteOturum', email.toLowerCase());
      return sonuc({ session: { user: { email: email.toLowerCase() } } });
    },
    signUp({ email, password }) {
      const d = oku(); if (d.kullanicilar[email.toLowerCase()]) return sonuc({}, 'User already registered');
      d.kullanicilar[email.toLowerCase()] = { sifre: password }; yaz(d);
      return sonuc({ session: null, user: { email } });
    },
    signOut() { localStorage.removeItem('sahteOturum'); auth._dinle.forEach(f => f('SIGNED_OUT', null)); return sonuc({}); },
    onAuthStateChange(f) { auth._dinle.push(f); return { data: { subscription: { unsubscribe() {} } } }; },
    resetPasswordForEmail() { return sonuc({}); },
    updateUser() { return sonuc({ user: {} }); },
  };
  window.supabase = {
    createClient() {
      return {
        auth, from: sorgu,
        rpc(ad, arg) {
          if (ad === 'bulut_kullanim') { const d = oku(); return sonuc(Object.values(d.dosyalar).filter(x => x.bulut_yolu).reduce((t, x) => t + (x.boyut || 0), 0)); }
          const { p_id, p_alanlar, p_gecmis } = arg;
          const d = oku(); if (!['yonetici', 'duzenle'].includes(rol())) return sonuc(null, 'permission denied');
          const x = d.isler[p_id]; if (!x) return sonuc(null, 'İş bulunamadı ya da düzenleme yetkiniz yok');
          const a = Object.assign({}, p_alanlar); delete a.gecmis; delete a.id;
          x.veri = Object.assign({}, x.veri, a, { gecmis: [...(x.veri.gecmis || []), ...(p_gecmis || [])] });
          x.guncelleyen = oturumEposta(); yaz(d);
          yay({ tablo: 'isler', eventType: 'UPDATE', new: x });
          return sonuc(x.veri);
        },
        channel() {
          const k = { on(_a, b, f) { k.t = b.table; k.f = f; return k; }, subscribe(cb) { dinleyiciler.push(o => { if ((o.tablo || 'isler') === k.t) k.f(o); }); setTimeout(() => cb && cb('SUBSCRIBED'), 50); return k; } };
          return k;
        },
        removeChannel() { },
        storage: { from() { return {
          async upload(yol, blob) { const d = oku(); const b = await new Promise(c => { const r = new FileReader(); r.onload = () => c(r.result); r.readAsDataURL(blob); }); d.depo[yol] = b; yaz(d); return { data: { path: yol }, error: null }; },
          async download(yol) { const d = oku(); if (!d.depo[yol]) return { data: null, error: { message: 'Object not found' } }; return { data: await (await fetch(d.depo[yol])).blob(), error: null }; },
          async createSignedUrl(yol) { const d = oku(); return { data: { signedUrl: d.depo[yol] }, error: null }; },
          async remove(yollar) { const d = oku(); yollar.forEach(y => delete d.depo[y]); yaz(d); return { data: [], error: null }; },
        }; } },
        realtime: { setAuth() {} },
      };
    },
  };
})();
