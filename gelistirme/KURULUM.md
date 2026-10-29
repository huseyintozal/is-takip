# İş Takibi (bulut sürümü): kurulum

Bir kez yapılır, yaklaşık 15 dakika sürer. Hepsi ücretsiz.

## 1. Supabase (veritabanı ve giriş)
1. https://supabase.com → **Start your project** → GitHub ya da mail ile üye ol.
2. **New project**: ad `is-takip`, bir veritabanı şifresi belirle (bir yere not et), **Region: Central EU (Frankfurt)** → Create.
3. Sol menü **SQL Editor** → **New query** → `kurulum.sql` dosyasının tamamını yapıştır → **Run**.
   (Sondaki satırda ilk yönetici olarak `YONETICI_MAILI@ornek.com` yazıyor. Başka mail kullanacaksan önce onu değiştir.)
4. **Authentication › URL Configuration › Site URL**: 3. adımda alacağın GitHub adresini yaz
   (örn. `https://kullaniciadin.github.io/is-takip/`). Aynı adresi **Redirect URLs**'e de ekle.
5. **Project Settings › API**: **Project URL** ve **anon public** anahtarını kopyala.

## 2. ayar.js
`github_yukle/ayar.js` dosyasını Not Defteri ile aç, iki tırnağın içine 5. adımdaki bilgileri yapıştır:
```js
supabaseUrl: 'https://xxxxxxxx.supabase.co',
supabaseAnahtar: 'eyJhbGciOi...',
```
(anon anahtarı herkese açık olabilir; verileri kurulum.sql'deki kurallar korur. **service_role** anahtarını asla yazma.)

## 3. GitHub Pages (uygulamanın adresi)
1. https://github.com → üye ol → sağ üst **+** → **New repository** → ad `is-takip`, **Public** → Create.
2. **uploading an existing file** bağlantısına tıkla → `github_yukle` klasörünün **içindeki her şeyi** (vendor klasörü dahil) sürükle → **Commit changes**.
3. **Settings › Pages** → Source: **Deploy from a branch**, Branch: **main** / **(root)** → Save.
4. 1-2 dakika sonra adres hazır: `https://kullaniciadin.github.io/is-takip/`

## 4. İlk giriş ve verileri taşıma
1. Adresi aç → **Hesabım yok, kayıt ol** → yönetici mailin ve bir şifre → maile gelen onay bağlantısına tıkla → giriş yap.
2. **Excel aktar › Bilgisayardaki uygulamadan taşı**: bilgisayardaki İş Takibi'nde **Sistem › Veri klasörü › Aç** →
   `isler.json` dosyasını buraya bırak. Bütün işler, notlar ve geçmiş aynen gelir.
3. Taşıdıktan sonra bilgisayardaki eski uygulamada değişiklik yapma; iki ayrı yerde farklı kayıt oluşur.

## 5. Kişi eklemek
**Kullanıcılar** (yalnızca yönetici görür) → mail + yetki → Ekle. Kişi aynı adresi açıp aynı mail ile **Kayıt ol** der.
- **Yönetici**: her şey + kişi ekler
- **Düzenleyebilir**: iş ekler, işaretler, not yazar
- **Yalnızca görür**: liste ve raporlar, değiştiremez

## 6. iPhone'a yüklemek
Adresi **Safari**'de aç → alttaki **Paylaş** düğmesi → **Ana Ekrana Ekle** → Ekle.
Ana ekranda İş Takibi simgesi çıkar, tam ekran uygulama gibi açılır. (Android: Chrome › ⋮ › Uygulamayı yükle.)

## Güncelleme
Yeni sürüm geldiğinde GitHub'da reponun ana sayfasında **Add file › Upload files** ile yeni dosyaları yükle (aynı adlı
dosyaların üzerine yazar). **ayar.js'i tekrar yükleme**, yoksa bağlantı bilgileri silinir. Telefonlar uygulamayı bir sonraki
açılışta kendiliğinden günceller.

## Notlar
- Biri bir şeyi değiştirince açık olan bütün ekranlar birkaç saniye içinde kendiliğinden yenilenir (sol altta yeşil **Canlı**).
- Her değişiklik işin **Geçmiş** kartında saatiyle ve kimin yaptığıyla görünür.
- Aynı anda iki kişi aynı işin farklı adımlarını değiştirirse ikisinin değişikliği de korunur.
- Supabase ücretsiz projesi 1 hafta hiç kullanılmazsa uykuya geçer; panelden **Restore** ile açılır, veriler kaybolmaz.
- Yedek: **Excel aktar › Excel'e ver** ile istediğin zaman CSV olarak indirebilirsin.

## Dosyalar (B1.2.0)
1. Supabase › SQL Editor › New query › `kurulum_dosyalar.sql` › Run (bir kez).
2. Her bilgisayarda bir kez: İş Takibi › **Dosyalar** › `dosya_yardimcisi.zip`'i indir › içindeki **KUR.bat**.
   Sonra **Tekrar dene** (tarayıcı izin sorarsa İzin ver) › **Seç…** ile proje klasörlerinin ana klasörünü seç.
3. **Klasörleri tara**: adındaki ada-parsel ile işler otomatik eşleşir; eşleşmeyenleri listeden seçersin.
4. İşin sayfasındaki **Dosyalar** kartında dosyayı ilgili bölüme (Mimari, Evrak, Geo…) sürükle:
   bilgisayardaki proje klasörüne ve buluta kaydedilir; tıklayınca bilgisayardaki programla açılır.
   Bulut dolarsa (1 GB) ya da dosya 50 MB'tan büyükse yalnızca bilgisayara kaydedilir.
5. Yeni bir bilgisayarda giriş yapınca buluttaki dosyaları o bilgisayara indirmek için izin ister.

## Mali takip (B1.3.0)
1. Supabase › SQL Editor › `kurulum_mali.sql` › Run (bir kez). Mali bilgileri yalnızca yöneticiler görür.
2. **Mali takip › İşverenler**: her işverenin iş başı fiyatını yaz. İşe özel fiyat iş sayfasındaki **Ücret** kartından
   ya da işverenin hesap sayfasından girilir. Fiyat değişince eski işler eski fiyatta kalabilir (sorar).
3. **Ödeme al**: işverenden gelen ödemeyi tarih ve açıklamayla gir; kalan alacak kendiliğinden düşer.
4. **Laboratuvar ve sondaj**: lab'ları ve sondajcıları iş başı ücretleriyle ekle. Numune laba atılınca lab'a,
   sondaj yapılınca sondajcıya borç yazılır; **Ödeme yap** ile düşülür.
5. Sistemden önceki eski işlerin parası ödendiyse "devir" açıklamasıyla bir ödeme girerek bakiyeyi sıfırlayabilirsin.

## Ödeme yöntemi, çek, dekont (B1.8.0)
Supabase › SQL Editor › `kurulum_mali2.sql` › Run (bir kez).

## Özalit ve diğer tedarikçiler (B1.10.0)
Supabase › SQL Editor › `kurulum_mali3.sql` › Run (bir kez).
