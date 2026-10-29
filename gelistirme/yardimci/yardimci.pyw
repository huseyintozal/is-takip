# -*- coding: utf-8 -*-
"""İş Takibi — Dosya Yardımcısı

Bilgisayarda arka planda çalışır (pencere açmaz), Windows açılınca kendiliğinden başlar.
İş Takibi web uygulaması (https://huseyintozal.github.io/is-takip/) bilgisayardaki proje klasörlerine
bunun üzerinden ulaşır: klasörleri tarar, dosya yazar/okur ve dosyayı bilgisayardaki programla açar
(PDF → PDF okuyucu, DWG → AutoCAD …).

Yalnızca bu bilgisayardan (127.0.0.1) ve izin verilen sitelerden gelen isteklere cevap verir,
yalnızca seçilen ana klasörün ve kullanıcının pencereden seçtiği klasörlerin içinde çalışır. Python standart kütüphanesi dışında bir şey gerekmez.
"""
import json
import os
import platform
import re
import socket
import subprocess
import sys
import threading
import traceback
from datetime import datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

SURUM = '1.3.1'
PORT = int(os.environ.get('IS_TAKIP_YARDIMCI_PORT', '8767'))
AYAR_KL = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), 'IsTakibi')
AYAR = os.path.join(AYAR_KL, 'yardimci.json')
IZINLI = ['https://huseyintozal.github.io']           # bu siteler dışındaki sayfalar yardımcıya ulaşamaz
YEREL_KOKEN = re.compile(r'^https?://(localhost|127\.0\.0\.1)(:\d+)?$')
YASAK_KARAKTER = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
TARAMA_DERINLIK = 4
ISARET = '.istakip'          # her bağlı proje klasörünün içindeki gizli işaret dosyası: klasör taşınınca bulmak için
ARAMA_DERINLIK = 7
KILIT = threading.Lock()


def ayar_oku():
    try:
        with open(AYAR, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def ayar_yaz(a):
    os.makedirs(AYAR_KL, exist_ok=True)
    with open(AYAR + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(a, f, ensure_ascii=False, indent=1)
    os.replace(AYAR + '.tmp', AYAR)


def gunluk(*m):
    try:
        os.makedirs(AYAR_KL, exist_ok=True)
        with open(os.path.join(AYAR_KL, 'yardimci.log'), 'a', encoding='utf-8') as f:
            f.write(datetime.now().isoformat(timespec='seconds') + ' ' + ' '.join(str(x) for x in m) + '\n')
    except Exception:
        pass


def kok():
    k = ayar_oku().get('kok') or ''
    return k if k and os.path.isdir(k) else ''


def guvenli_ad(ad):
    ad = YASAK_KARAKTER.sub('_', str(ad or '')).strip().rstrip('.')
    return ad[:180] or 'dosya'


def guvenli_yol(*parcalar):
    """Kök klasörün içinde kalan mutlak yol; dışına çıkmaya çalışırsa hata."""
    k = kok()
    if not k:
        raise PermissionError('Ana klasör seçilmemiş')
    goreli = os.path.join(*[p for p in parcalar if p])
    yol = os.path.realpath(os.path.join(k, goreli))
    kr = os.path.realpath(k)
    if yol != kr and not yol.startswith(kr + os.sep):
        raise PermissionError('Ana klasörün dışına erişilemez')
    return yol


def goreli_klasor(v):
    """'A/B' biçimindeki göreli klasörü işletim sistemine uygun hale getirir, her parçayı temizler."""
    parca = [guvenli_ad(p) for p in re.split(r'[\\/]+', str(v or '')) if p and p not in ('.', '..')]
    return os.path.join(*parca) if parca else ''


def dis_mi(v):
    """Ana klasörün dışındaki (mutlak yolla saklanan) klasör mü? Örn. 'D:\\ESKİ İŞLER\\X'"""
    s = str(v or '')
    return bool(re.match(r'^[A-Za-z]:[\\/]', s) or s.startswith('\\\\') or (os.name != 'nt' and s.startswith('/')))


def icinde(yol, taban):
    return yol == taban or yol.startswith(taban.rstrip(os.sep) + os.sep)


def tam_yol(klasor, ad=''):
    """İşin klasörü (göreli ya da pencereden seçilmiş mutlak yol) + dosya adı -> güvenli mutlak yol."""
    if not dis_mi(klasor):
        return guvenli_yol(goreli_klasor(klasor), guvenli_ad(ad) if ad else '')
    taban = os.path.realpath(os.path.normpath(str(klasor)))
    izinli = [os.path.realpath(x) for x in ayar_oku().get('dis_klasorler', [])]
    if not any(icinde(taban, i) for i in izinli):
        # başka bilgisayarda seçilmiş klasör: bu bilgisayarda ana klasörün içinde aynı adla kullanılır
        return guvenli_yol(guvenli_ad(re.split(r'[\\/]+', str(klasor).rstrip('\\/'))[-1]), guvenli_ad(ad) if ad else '')
    yol = os.path.realpath(os.path.join(taban, guvenli_ad(ad))) if ad else taban
    if not icinde(yol, taban):
        raise PermissionError('Klasörün dışına erişilemez')
    return yol


def klasor_bilgi(yol):
    dosyalar = [d for d in os.listdir(yol) if os.path.isfile(os.path.join(yol, d)) and not d.startswith('~$')
                and d.lower() not in ('thumbs.db', 'desktop.ini', ISARET)]
    alt = [d for d in os.listdir(yol) if os.path.isdir(os.path.join(yol, d))]
    boyut = 0
    for d in dosyalar:
        try:
            boyut += os.path.getsize(os.path.join(yol, d))
        except OSError:
            pass
    return {'dosya': len(dosyalar), 'alt': len(alt), 'boyut': boyut}


def isaret_oku(klasor_yolu):
    try:
        with open(os.path.join(klasor_yolu, ISARET), encoding='utf-8') as f:
            return json.load(f).get('is_id')
    except Exception:
        return None


def isaret_yaz(klasor_yolu, is_id):
    """Klasöre gizli işaret dosyasını yazar (zaten aynıysa dokunmaz)."""
    if isaret_oku(klasor_yolu) == is_id:
        return False
    yol = os.path.join(klasor_yolu, ISARET)
    gizle = None
    if os.name == 'nt':
        import ctypes
        gizle = ctypes.windll.kernel32.SetFileAttributesW
        if os.path.exists(yol):
            gizle(yol, 0x80)             # gizli dosyanın üzerine yazılabilsin
    with open(yol, 'w', encoding='utf-8') as f:
        json.dump({'is_id': is_id, 'not': 'İş Takibi bu klasörü bu dosyayla tanır; silmeyin.'}, f, ensure_ascii=False)
    if gizle:
        gizle(yol, 0x02)                 # gizli
    return True


def klasor_degeri(gercek_yol):
    """Bulunan klasörün işte saklanacak hali: ana klasörün içindeyse göreli, dışındaysa mutlak (izinliye eklenir)."""
    gercek_yol = os.path.realpath(gercek_yol)
    k = kok()
    if k and icinde(gercek_yol, os.path.realpath(k)) and gercek_yol != os.path.realpath(k):
        return os.path.relpath(gercek_yol, os.path.realpath(k)).replace(os.sep, '/')
    deger = os.path.normpath(gercek_yol)
    a = ayar_oku(); d = a.get('dis_klasorler', [])
    if deger not in d:
        d.append(deger); a['dis_klasorler'] = d; ayar_yaz(a)
    return deger


def arama_kokleri():
    """Taşınan klasörün aranacağı yerler: ana klasör + dışarıdan seçilmiş klasörlerin iki üstü."""
    yerler = []
    if kok():
        yerler.append(os.path.realpath(kok()))
    for d in ayar_oku().get('dis_klasorler', []):
        ust = os.path.dirname(os.path.dirname(os.path.realpath(d)))
        if ust and os.path.isdir(ust) and os.path.dirname(ust) != ust:      # disk kökünün tamamını tarama
            yerler.append(ust)
    sonuc = []
    for y in sorted(set(yerler), key=len):
        if not any(icinde(y, s) for s in sonuc):
            sonuc.append(y)
    if kok():                                   # önce ana klasörde ara
        k = os.path.realpath(kok())
        sonuc.sort(key=lambda y: 0 if icinde(k, y) or icinde(y, k) else 1)
    return sonuc


def isaret_ara(is_id):
    for taban in arama_kokleri():
        for yol, alt, dosyalar in os.walk(taban):
            derinlik = 0 if yol == taban else os.path.relpath(yol, taban).count(os.sep) + 1
            alt[:] = [a for a in alt if not a.startswith('.') and a.lower() not in ('$recycle.bin', 'system volume information', '_silinenler')]
            if derinlik >= ARAMA_DERINLIK:
                alt[:] = []
            if ISARET in dosyalar and isaret_oku(yol) == is_id:
                return yol
    return None


def benzersiz(yol):
    if not os.path.exists(yol):
        return yol
    kok_, uz = os.path.splitext(yol)
    n = 2
    while os.path.exists('%s (%d)%s' % (kok_, n, uz)):
        n += 1
    return '%s (%d)%s' % (kok_, n, uz)


def ac(yol):
    if os.name == 'nt':
        os.startfile(yol)
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', yol])
    else:
        subprocess.Popen(['xdg-open', yol], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def klasor_sec_penceresi(baslangic='', baslik='İş Takibi: proje klasörlerinin bulunduğu ana klasörü seçin'):
    """Windows klasör seçme penceresi (tkinter). Seçilmezse ''."""
    sonuc = {'yol': ''}

    def calis():
        try:
            import tkinter
            from tkinter import filedialog
            r = tkinter.Tk()
            r.withdraw()
            r.attributes('-topmost', True)
            sonuc['yol'] = filedialog.askdirectory(parent=r, initialdir=baslangic or os.path.expanduser('~'),
                                                   title=baslik) or ''
            r.destroy()
        except Exception:
            gunluk('klasör penceresi açılamadı', traceback.format_exc())
    t = threading.Thread(target=calis)
    t.start()
    t.join(600)
    return os.path.normpath(sonuc['yol']) if sonuc['yol'] else ''


def tara():
    """Ana klasörün altındaki klasörleri (en fazla 4 kat) ve doğrudan içindeki dosya sayısı/boyutunu listeler."""
    k = kok()
    sonuc = []
    if not k:
        return sonuc
    for yol, alt, dosyalar in os.walk(k):
        derinlik = 0 if yol == k else os.path.relpath(yol, k).count(os.sep) + 1
        alt[:] = [a for a in alt if not a.startswith('.') and a.lower() not in ('$recycle.bin', 'system volume information')]
        if derinlik >= TARAMA_DERINLIK:
            alt[:] = []
        if yol == k:
            continue
        gercek = [d for d in dosyalar if not d.startswith('~$') and d.lower() not in ('thumbs.db', 'desktop.ini', ISARET)]
        boyut = 0
        for d in gercek:
            try:
                boyut += os.path.getsize(os.path.join(yol, d))
            except OSError:
                pass
        sonuc.append({'klasor': os.path.relpath(yol, k).replace(os.sep, '/'), 'ad': os.path.basename(yol),
                      'dosya': len(gercek), 'alt': len(alt), 'boyut': boyut})
    return sonuc


def liste(klasor, alt=False):
    """Klasördeki dosyalar. alt=True ise alt klasörlerdekiler de ("ALT/KLASÖR/dosya.pdf" adıyla)."""
    kok_yol = tam_yol(klasor)
    if not os.path.isdir(kok_yol):
        return []
    sonuc = []
    for yol, altlar, dosyalar in os.walk(kok_yol):
        altlar[:] = sorted(a for a in altlar if not a.startswith('.') and a.lower() != '_silinenler') if alt else []
        on = os.path.relpath(yol, kok_yol).replace(os.sep, '/')
        for d in sorted(dosyalar):
            if d.startswith('~$') or d.lower() in ('thumbs.db', 'desktop.ini', ISARET):
                continue
            st = os.stat(os.path.join(yol, d))
            sonuc.append({'ad': d if on == '.' else on + '/' + d, 'boyut': st.st_size,
                          'degisme': datetime.fromtimestamp(st.st_mtime).isoformat(timespec='seconds')})
    return sonuc


class Isleyici(BaseHTTPRequestHandler):
    server_version = 'IsTakipYardimci/' + SURUM

    def log_message(self, *a):
        pass

    def _koken(self):
        o = self.headers.get('Origin') or ''
        if not o:
            return ''
        if o in IZINLI or o in (ayar_oku().get('izinli') or []) or YEREL_KOKEN.match(o):
            return o
        return None

    def _bas(self, kod, tur='application/json; charset=utf-8', uzunluk=None, ek=None):
        self.send_response(kod)
        o = self._koken()
        if o:
            self.send_header('Access-Control-Allow-Origin', o)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.send_header('Access-Control-Expose-Headers', 'X-Dosya-Adi')
        self.send_header('Content-Type', tur)
        self.send_header('Cache-Control', 'no-store')
        if uzunluk is not None:
            self.send_header('Content-Length', str(uzunluk))
        for a, d in (ek or {}).items():
            self.send_header(a, d)
        self.end_headers()

    def _json(self, kod, nesne):
        b = json.dumps(nesne, ensure_ascii=False).encode('utf-8')
        self._bas(kod, uzunluk=len(b))
        self.wfile.write(b)

    def do_OPTIONS(self):
        if self._koken() is None:
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        o = self._koken()
        if o:
            self.send_header('Access-Control-Allow-Origin', o)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()

    def do_GET(self):
        self._isle('GET')

    def do_POST(self):
        self._isle('POST')

    def _isle(self, yontem):
        if self._koken() is None:
            return self._json(403, {'hata': 'Bu siteye izin yok'})
        u = urlparse(self.path)
        q = {a: d[0] for a, d in parse_qs(u.query).items()}
        n = int(self.headers.get('Content-Length') or 0)
        govde = self.rfile.read(n) if n else b''
        try:
            j = json.loads(govde or b'{}') if (self.headers.get('Content-Type') or '').startswith('application/json') else {}
        except ValueError:
            j = {}
        try:
            yol = u.path.rstrip('/') or '/'
            if yol == '/kapat' and yontem == 'POST' and not self.headers.get('Origin'):   # yalnızca kaldırma betiği
                self._json(200, {'kapandi': True})
                threading.Thread(target=self.server.shutdown).start()
                return
            if yol == '/durum':
                return self._json(200, {'surum': SURUM, 'kok': kok(), 'pc': platform.node(), 'isletim': platform.system()})
            if yol == '/kok/sec' and yontem == 'POST':
                secilen = klasor_sec_penceresi(kok())
                if secilen:
                    a = ayar_oku(); a['kok'] = secilen; ayar_yaz(a)
                return self._json(200, {'kok': kok(), 'secildi': bool(secilen)})
            if yol == '/kok' and yontem == 'POST':
                y = os.path.normpath(str(j.get('yol') or '').strip().strip('"'))
                if not os.path.isdir(y):
                    return self._json(400, {'hata': 'Klasör bulunamadı: ' + y})
                a = ayar_oku(); a['kok'] = y; ayar_yaz(a)
                return self._json(200, {'kok': kok()})
            if yol == '/klasor/sec' and yontem == 'POST':   # bilgisayardaki herhangi bir klasörü pencereden seçtirir
                secilen = klasor_sec_penceresi(j.get('baslangic') or kok(), 'İş Takibi: bu işin klasörünü seçin')
                if not secilen or not os.path.isdir(secilen):
                    return self._json(200, {'secildi': False})
                klasor = klasor_degeri(secilen)
                if j.get('is_id'):
                    isaret_yaz(secilen, str(j.get('is_id')))
                b = klasor_bilgi(secilen)
                b.update({'secildi': True, 'klasor': klasor, 'ad': os.path.basename(secilen)})
                return self._json(200, b)
            if yol == '/isaretle' and yontem == 'POST':     # [{klasor, is_id}]: var olan klasörlere işaret koyar
                var = []
                for x in j.get('liste') or []:
                    try:
                        t = tam_yol(x.get('klasor'))
                        if os.path.isdir(t):
                            isaret_yaz(t, str(x.get('is_id')))
                            var.append(x.get('is_id'))
                    except Exception:
                        pass
                return self._json(200, {'var': var})
            if yol == '/bul' and yontem == 'POST':          # işin klasörü yerinde mi? değilse işaretinden bul
                is_id = str(j.get('is_id') or '')
                try:
                    t = tam_yol(j.get('klasor')) if j.get('klasor') else ''
                except PermissionError:
                    t = ''
                if t and os.path.isdir(t):
                    isaret_yaz(t, is_id)
                    return self._json(200, {'durum': 'yerinde', 'klasor': j.get('klasor')})
                bulunan = isaret_ara(is_id)
                if bulunan:
                    return self._json(200, {'durum': 'tasindi', 'klasor': klasor_degeri(bulunan)})
                return self._json(200, {'durum': 'yok'})
            if yol == '/tara':
                return self._json(200, {'kok': kok(), 'klasorler': tara()})
            if yol == '/liste':
                return self._json(200, {'dosyalar': liste(q.get('klasor', ''), q.get('alt') == '1')})
            if yol == '/varlar' and yontem == 'POST':     # [{klasor, ad}] -> [true/false]
                sonuc = []
                for x in j.get('dosyalar') or []:
                    try:
                        sonuc.append(os.path.isfile(tam_yol(x.get('klasor'), x.get('ad'))))
                    except PermissionError:
                        sonuc.append(False)
                return self._json(200, {'var': sonuc})
            if yol == '/oku':
                tam = tam_yol(q.get('klasor'), q.get('ad'))
                if not os.path.isfile(tam):
                    return self._json(404, {'hata': 'Dosya bu bilgisayarda yok'})
                with open(tam, 'rb') as f:
                    veri = f.read()
                self._bas(200, 'application/octet-stream', len(veri))
                self.wfile.write(veri)
                return
            if yol == '/yaz' and yontem == 'POST':          # gövde: dosyanın baytları
                klasor = q.get('klasor') if dis_mi(q.get('klasor')) else goreli_klasor(q.get('klasor'))
                if not klasor:
                    return self._json(400, {'hata': 'Klasör adı yok'})
                with KILIT:
                    hedef_kl = tam_yol(klasor)
                    os.makedirs(hedef_kl, exist_ok=True)
                    tam = tam_yol(klasor, q.get('ad'))
                    if q.get('uzerine') != '1':
                        tam = benzersiz(tam)
                    with open(tam + '.yaziliyor', 'wb') as f:
                        f.write(govde)
                    os.replace(tam + '.yaziliyor', tam)
                return self._json(200, {'ad': os.path.basename(tam), 'klasor': klasor if dis_mi(klasor) else klasor.replace(os.sep, '/'), 'boyut': len(govde)})
            if yol == '/klasor' and yontem == 'POST':       # klasör oluştur
                if dis_mi(j.get('klasor')):
                    os.makedirs(tam_yol(j.get('klasor')), exist_ok=True)
                    return self._json(200, {'klasor': j.get('klasor')})
                klasor = goreli_klasor(j.get('klasor'))
                os.makedirs(guvenli_yol(klasor), exist_ok=True)
                return self._json(200, {'klasor': klasor.replace(os.sep, '/')})
            if yol == '/ac' and yontem == 'POST':           # dosyayı ya da klasörü bilgisayardaki programla aç
                tam = tam_yol(j.get('klasor'), j.get('ad') or '')
                if not os.path.exists(tam):
                    return self._json(404, {'hata': 'Bu bilgisayarda bulunamadı'})
                ac(tam)
                return self._json(200, {'acildi': True})
            if yol == '/sil' and yontem == 'POST':          # dosyayı Geri Dönüşüm yerine "_silinenler" klasörüne taşır
                tam = tam_yol(j.get('klasor'), j.get('ad'))
                if os.path.isfile(tam):
                    hedef = os.path.join(tam_yol(j.get('klasor')), '_silinenler') if dis_mi(j.get('klasor')) else guvenli_yol('_silinenler')
                    os.makedirs(hedef, exist_ok=True)
                    os.replace(tam, benzersiz(os.path.join(hedef, os.path.basename(tam))))
                return self._json(200, {'silindi': True})
            return self._json(404, {'hata': 'Bilinmeyen istek'})
        except PermissionError as e:
            return self._json(403, {'hata': str(e)})
        except Exception as e:
            gunluk('hata', self.path, traceback.format_exc())
            return self._json(500, {'hata': str(e)})


class Sunucu(ThreadingHTTPServer):
    # Windows'ta SO_REUSEADDR aynı porta ikinci bir kopyanın da bağlanmasına izin verir; bunu engelle
    allow_reuse_address = os.name != 'nt'

    def server_bind(self):
        if os.name == 'nt' and hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    try:
        sunucu = Sunucu(('127.0.0.1', PORT), Isleyici)
    except OSError:
        return          # zaten çalışıyor
    gunluk('başladı', SURUM, 'kök:', kok())
    sunucu.serve_forever()


if __name__ == '__main__':
    main()
