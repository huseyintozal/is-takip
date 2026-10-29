# İş Takibi: kurulum ve Rapor Stüdyosu'na ekleme

## Windows'a kurulum
`kur.bat` dosyasına çift tıklayın. Program `%LOCALAPPDATA%\Programs\IsTakibi` klasörüne kurulur, masaüstüne ve
Başlat menüsüne **İş Takibi** kısayolu gelir, Ayarlar > Uygulamalar listesinden kaldırılabilir. Tarayıcı açılmaz:
uygulama kendi penceresinde açılır (pywebview; o kurulamazsa Edge'in uygulama penceresi).
Python yoksa kur.bat winget ile kurar, sonra kur.bat bir kez daha çalıştırılır.

Veriler `Belgeler\ZeminEtut\is_takip\isler.json` dosyasındadır (Rapor Stüdyosu'nun veri kökü). Her gün ilk
kayıtta `yedek\` klasörüne bir kopya alınır. İlk açılışta takip Excel'inin TAKİP sayfasından aktarılmış 81 iş
(`baslangic\isler.json`) yüklenir. Yeniden kurmak ya da kaldırmak verilere dokunmaz.

## Güncelleme
Sistem > Güncelleme yükle: gönderilen zip (tam paket ya da yalnızca değişen dosyalar) program klasörüne açılır,
eski dosyalar `Belgeler\ZeminEtut\is_takip\yedek\guncelleme_<tarih>` klasörüne alınır, `baslangic/` ve veriler
yazılmaz. Sürüm `surum.txt` dosyasındadır; açık olan ile kurulu sürüm farklıysa Sistem sayfası "yeniden açın" uyarısı verir.
Bu sayfa (`sistemSayfasi`, `/api/guncelle`, `/api/veri_ac`) yalnızca tek başına sürümdedir; Rapor Stüdyosu'nda kendi Sistem sayfası kullanılır.

## Excel'deki yazılar
Hiçbir yazı değiştirilmez: işveren, mahalle, mal sahibi, ada, parsel yazıldığı gibi saklanır (yalnızca baştaki/sondaki
boşluk atılır). İşverenler büyük/küçük harf farkı gözetmeden gruplanır ("Bıyıklı" ile "BIYIKLI" tek işveren).
Durum hücresinde "+ / YOK / VERİLMEDİ / ATILMADI / YAPILDI / YAPILMADI" dışında bir yazı varsa (İYİLEŞTİRME ÇIKABİLİR,
ÖMERE ATILDI, NİHAT ABİ…) aynen `alan_notlari` içinde o alana bağlı saklanır, boş hücreler `bos_alanlar`da boş kalır.
"Excel'e ver" çıktısı TAKİP sayfasıyla hücre hücre aynıdır (81 satırın hepsi denetlendi).

## Dosyalar
| Dosya | Görev |
|---|---|
| `is_takip_api.py` | Veri katmanı ve `/api/is_takip/...` uçları. `isle(yontem, yol, sorgu, govde)` |
| `xlsx_okuyucu.py` | Standart kütüphaneyle .xlsx okuma (openpyxl gerekmez) |
| `sunucu.py` | Yerel sunucu (tek başına sürüm). Ana uygulamada kullanılmaz |
| `uygulama.pyw` | Sunucuyu başlatıp kendi penceresinde açar (kısayol bunu çalıştırır) |
| `kur.bat`, `kur.py`, `kaldir.py`, `simge.ico` | Windows kurulumu / kaldırma |
| `baslangic/isler.json` | İlk açılışta yüklenen, Excel'den aktarılmış işler |
| `arayuz/is_takip.js` | Bütün iş takibi arayüzü ve durum algoritması (`isDurumu`, `isMesajlari`) |
| `arayuz/is_takip.css` | `stil.css`'e ek sınıflar (yalnızca oradaki renk değişkenleri) |
| `arayuz/ortak.js` | `uygulama.js`'teki yardımcıların kopyası + küçük yönlendirici. Ana uygulamada kullanılmaz |
| `arayuz/stil.css` | Rapor Stüdyosu'nunkiyle birebir aynı, değiştirilmedi |

## API
- `GET  /api/is_takip/isler` → `{surum, isler:[...]}`
- `POST /api/is_takip/isler` → yeni iş
- `GET | PUT | DELETE /api/is_takip/isler/<id>` (PUT kısmi alan kabul eder, değişen durumları `gecmis`e yazar)
- `POST /api/is_takip/ice_aktar?sayfa=TAKİP&guncelle=0|1` gövde: .xlsx dosyası
- `GET  /api/is_takip/disa_aktar.csv?isveren=...`

## İş kaydı
```json
{ "id": "is_…", "proje_id": "", "firma_id": "", "isveren": "BIYIKLI", "mahalle": "CEBECİ",
  "mal_sahibi": "…", "ada": "2302", "parsel": "13",
  "mimari": true, "evrak": true, "zemin_degeri": true, "geo": false,
  "bina_yikildi": "" | "evet" | "hayir", "sondaj": false, "laba_atildi": false, "lab": false,
  "riskli_rapor": false, "notlar": "",
  "alan_notlari": {"zemin_degeri": "İYİLEŞTİRME ÇIKABİLİR"}, "bos_alanlar": ["geo"], "olusturma": "…", "guncelleme": "…", "gecmis": [{"zaman","alan","deger"}] }
```

## Rapor Stüdyosu'na ekleme (Rehber §3)
1. `is_takip_api.py` ve `xlsx_okuyucu.py` dosyalarını `uygulama/` yanına koyun. `sunucu.py` içinde:
   ```python
   import is_takip_api
   is_takip_api.VERI_KLASORU = os.path.join(VERI_KOKU, 'is_takip')   # Belgeler/ZeminEtut/is_takip
   # istek işleyicide, /api/ yönlendirmesinden önce:
   if yol.startswith('/api/is_takip/'):
       kod, govde, tur = is_takip_api.isle(yontem, yol, parse_qs(sorgu), ham_govde)
   ```
   Veri zaten `Belgeler\\ZeminEtut\\is_takip` altında olduğu için taşımaya gerek yok.
2. `index.html`: `<link rel="stylesheet" href="is_takip.css">`, `uygulama.js`'ten sonra `<script src="is_takip.js"></script>`,
   menüye `<a href="#/isler" data-sayfa="isler"><i data-i="liste"></i>İşler</a>`.
3. `uygulama.js` → `git()` içinde `if (await isTakipYonlendir(sayfa, rest)) return;`, menü vurgusu için
   `sayfa === 'is'` durumunda da `isler` etkin olsun. `hashchange` içinde `await isTakipAyrilirken();`.
4. `D.durum.tek_basina` gelmediği için iş sayfasında **Projeyi aç** ve **Proje aç** düğmeleri kendiliğinden görünür;
   proje listesi `GET /api/projeler`, firmalar `GET /api/firmalar` uçlarından okunur, proje `POST /api/projeler` ile açılır.
