# İş Takibi (zemin etüdü iş ve mali takip) — geliştirme notları

Kullanıcı: **Üstad** (Hüseyin, zemin etüdü). Türkçe, kısa, net ve samimi cevap ister. Teknik ayrıntıyı değil sonucu ve
"ne yapmam lazım"ı söyle. Her değişiklikten sonra GitHub'a yükle (main), sürümü artır, ona Ctrl+F5 yapmasını söyle.

## Mimari
- **Web uygulaması** (bu repo kökü) GitHub Pages'te yayında: https://huseyintozal.github.io/is-takip/
  Saf HTML + vanilla JS (framework yok), Türkçe adlandırma. Telefona PWA olarak kurulur (manifest, `sw.js`).
- **Veri: Supabase** (`ayar.js`: proje adresi + *publishable* anahtar — bunlar herkese açık olabilir; **service_role/secret anahtar asla repoya girmez**).
  Tablolar ve güvenlik kuralları `gelistirme/sql/` içinde (kullanıcı Supabase SQL Editor'da elle çalıştırır):
  - `kurulum.sql`: `isler` (id, veri jsonb), `yetkililer` (rol: yonetici/duzenle/goruntule), `benim_rolum()`, `is_guncelle` RPC
  - `kurulum_dosyalar.sql`: `dosyalar` tablosu + `dosyalar` depolama kovası (1 GB ücretsiz)
  - `kurulum_mali.sql`: `cariler` (isveren/lab/sondaj/ozalit/diger), `is_ucretleri`, `hareketler` — yalnızca yönetici
  - `kurulum_mali2.sql`: hareketler'e yontem, cek_vade, dekont · `kurulum_mali3.sql`: cariler tür kısıtı (ozalit, diger)
- **Dosya Yardımcısı** (`gelistirme/yardimci/yardimci.pyw`, Python stdlib): kullanıcının Windows bilgisayarında 127.0.0.1:8767'de çalışır;
  proje klasörlerini tarar, dosya yazar/açar, gizli `.istakip` işaret dosyasıyla taşınan klasörü bulur.
  Değiştirince `SURUM`'u artır, `dosya_yardimcisi.zip`'i yeniden paketle (KUR.bat, yardimci.pyw, kur_yardimci.py, kaldir_yardimci.py, BENIOKU.txt),
  `dosyalar.js`'teki "Yeni sürüm var" eşiğini (`y.surum < '1.x.y'`) güncelle. Kullanıcı zip'i indirip KUR.bat çalıştırır.
- `gelistirme/masaustu/`: eski masaüstü sürümü (Python sunucu). Artık web sürümü esas; `is_takip.js` ortak dosyanın güncel hali kökteki.

## Dosyalar (kök)
- `index.html` (script/css etiketlerinde `?v=SÜRÜM`), `bulut.js` (`WEB_SURUM`, giriş, api köprüsü, canlı güncelleme, kullanıcılar, sürüm denetimi)
- `is_takip.js` (işler listesi, iş sayfası, iş akışı kuralları, işveren raporu), `is_takip_veri.js` (kayıt temizleme/göç, CSV), `ortak_web.js`
- `dosyalar.js` (dosya kartı, klasör eşleştirme/tarama, yardımcı ile konuşma), `mali.js` (mali takip, cari ekstre PDF, Excel'e ver),
  `mali_aktar.js` (firma hesap Excel'lerinden hazırlanan mali_aktar.json'u aktarma), `xlsx.js` (xlsx okuma), `xlsx_yaz.js` (stilli xlsx yazma + grafik)
- İş takibinde görünmeyen "geçmiş işler" `veri.mali_kayit = true` ile `isler` tablosunda; `tumIsler()` bunları hariç tutar, `maliIsler()` dahil eder.
- Devir alacak: `tahsilat` türünde eksi tutar; tedarikçi önceki/ek borcu: `odeme` türünde eksi tutar.

## Sürüm yayınlama (her değişiklikte)
1. `bulut.js` → `WEB_SURUM = 'B1.x.y'`; `index.html` → bütün `?v=` değerleri aynı sürüm (`sed -i 's/?v=ESKİ/?v=YENİ/g' index.html`).
2. Test et (aşağıda), sonra commit + `git push origin main`. Pages 1-2 dakikada yayınlar; açık uygulamalarda "Yeni sürüm var — Güncelle" çubuğu çıkar.

## Test
`gelistirme/test/calistir.sh` → http://localhost:8800 (sahte Supabase, veriler localStorage'da). Playwright ile tıklayarak dene;
oturum için `localStorage.sahteOturum = 'usta@ornek.com'` ve `sahteDB.yetkililer`'e o maili `rol: 'yonetici'` ile ekle.
Gerçek Supabase'e buradan erişilmez; canlı veri gerekiyorsa kullanıcıdan Excel aktar › "Excel'e ver" CSV'sini iste.

## Kurallar
- Kişisel veri (mal sahibi adları, isler.json, mali_aktar.json, firma Excel'leri) **repoya girmez** — repo herkese açık.
- Mali bilgiler yalnızca yönetici rolüne görünür (RLS + arayüz).
- SQL değişikliği gerekiyorsa yeni `kurulum_*.sql` yaz, eskisini bozma; kullanıcıya dosyayı gönder ve "Supabase › SQL Editor › Run" de.
- Toplu `insert`'te bütün satırların alanları aynı olmalı (PostgREST "All object keys must match").
