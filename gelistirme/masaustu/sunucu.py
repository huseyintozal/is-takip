# -*- coding: utf-8 -*-
"""İş Takibi — tek başına çalışan yerel sunucu (Python standart kütüphanesi).

Normalde uygulama.pyw (masaüstü kısayolu) bunu kendi penceresinde açar.
Elle çalıştırma (geliştirme):  python sunucu.py   ->  http://127.0.0.1:8766/#/isler

Ana uygulamaya eklenince bu dosyaya gerek kalmaz; yalnızca is_takip_api.isle()
ana sunucu.py'den çağrılır (bkz. ENTEGRASYON.md).
"""
import io
import json
import shutil
import subprocess
import zipfile
from datetime import datetime
import mimetypes
import os
import sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

KOK = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, KOK)
import is_takip_api  # noqa: E402

def kurulu_surum():
    try:
        with open(os.path.join(KOK, 'surum.txt'), encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return '?'


SURUM = kurulu_surum()          # açık olan sürüm; güncelleme kurulunca dosyadaki değişir, yeniden açınca eşitlenir
ARAYUZ = os.path.join(KOK, 'arayuz')
PORT = int(os.environ.get('IS_TAKIP_PORT', '8766'))

# Rapor Stüdyosu'nun veri klasörü (varsa projeler ve firmalar okunur, yalnızca okuma)
STUDYO_KOK = os.environ.get('ZEMIN_ETUT_KOK') or os.path.join(is_takip_api.belgeler_klasoru(), 'ZeminEtut')


# Güncelleme zip'inde yazılmasına izin verilen dosyalar (veri dosyaları program klasöründe değil)
GUNCELLENEBILIR = ('.py', '.pyw', '.js', '.css', '.html', '.ico', '.md', '.txt', '.bat', '.json', '.png', '.svg')


def guncelleme_kur(icerik):
    """Birikimli güncelleme zip'ini program klasörüne açar. Eski dosyalar veri klasöründeki yedek'e alınır."""
    try:
        z = zipfile.ZipFile(io.BytesIO(icerik))
    except zipfile.BadZipFile:
        raise ValueError('Dosya geçerli bir zip değil')
    adlar = [a for a in z.namelist() if not a.endswith('/')]
    if not adlar:
        raise ValueError('Zip boş')
    # zip "is_takip/..." gibi tek bir klasörle başlıyorsa o klasör atlanır
    ilk = {a.split('/', 1)[0] for a in adlar}
    onek = (next(iter(ilk)) + '/') if len(ilk) == 1 and all('/' in a for a in adlar) else ''
    yedek = os.path.join(is_takip_api.VERI_KLASORU, 'yedek', 'guncelleme_' + datetime.now().strftime('%Y%m%d_%H%M%S'))
    liste, hatali, atlanan = [], [], []
    for ad in adlar:
        goreli = ad[len(onek):]
        if not goreli or goreli.startswith('/') or '..' in goreli.split('/') or ':' in goreli:
            atlanan.append(ad)
            continue
        if not goreli.lower().endswith(GUNCELLENEBILIR) or goreli.startswith('baslangic/'):
            atlanan.append(goreli)
            continue
        hedef = os.path.normpath(os.path.join(KOK, goreli))
        if not hedef.startswith(KOK + os.sep):
            atlanan.append(goreli)
            continue
        try:
            if os.path.exists(hedef):
                y = os.path.join(yedek, goreli)
                os.makedirs(os.path.dirname(y), exist_ok=True)
                shutil.copy2(hedef, y)
            os.makedirs(os.path.dirname(hedef), exist_ok=True)
            with open(hedef + '.yeni', 'wb') as f:
                f.write(z.read(ad))
            os.replace(hedef + '.yeni', hedef)
            liste.append(goreli)
        except OSError as e:
            hatali.append('%s (%s)' % (goreli, e.strerror or e))
    if not liste and not hatali:
        raise ValueError('Zip içinde güncellenecek dosya yok')
    return {'dosyalar': len(liste), 'liste': liste, 'hatali': hatali, 'atlanan': atlanan,
            'surum': kurulu_surum(), 'klasor': KOK, 'yedek': yedek if liste else ''}


def klasor_ac(yol):
    os.makedirs(yol, exist_ok=True)
    if os.name == 'nt':
        os.startfile(yol)
    else:
        subprocess.Popen(['xdg-open', yol])


def _json_oku(yol):
    try:
        with open(yol, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def firmalar():
    sonuc = []
    kl = os.path.join(STUDYO_KOK, 'firmalar') if STUDYO_KOK else ''
    if kl and os.path.isdir(kl):
        for fid in sorted(os.listdir(kl)):
            p = _json_oku(os.path.join(kl, fid, 'profil.json')) or {}
            ad = p.get('kisa_ad') or p.get('ad') or p.get('unvan') or fid
            sonuc.append({'id': fid, 'ad': ad})
    return {'firmalar': sonuc, 'varsayilan': sonuc[0]['id'] if sonuc else ''}


def projeler():
    sonuc = []
    kl = os.path.join(STUDYO_KOK, 'projeler') if STUDYO_KOK else ''
    if kl and os.path.isdir(kl):
        for pid in sorted(os.listdir(kl)):
            p = _json_oku(os.path.join(kl, pid, 'proje.json'))
            if p is None:
                continue
            sonuc.append({'id': pid, 'ad': p.get('ad') or pid, 'firma': p.get('firma', ''),
                          'guncelleme': p.get('guncelleme', ''), 'rapor_var': bool(p.get('rapor_var')),
                          'adimlar': p.get('adimlar') or {}})
    return {'projeler': sonuc}


class Isleyici(BaseHTTPRequestHandler):
    server_version = 'IsTakip/' + SURUM

    def log_message(self, *a):
        pass

    def _gonder(self, kod, govde, tur, ek=None):
        self.send_response(kod)
        self.send_header('Content-Type', tur)
        self.send_header('Content-Length', str(len(govde)))
        self.send_header('Cache-Control', 'no-store')
        for k, v in (ek or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(govde)

    def _json(self, kod, nesne):
        self._gonder(kod, json.dumps(nesne, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')

    def _isle(self, yontem):
        u = urlparse(self.path)
        yol = unquote(u.path)
        sorgu = parse_qs(u.query)
        n = int(self.headers.get('Content-Length') or 0)
        govde = self.rfile.read(n) if n else b''
        try:
            if yol.startswith('/api/is_takip/'):
                kod, veri, tur = is_takip_api.isle(yontem, yol, sorgu, govde)
                ek = {}
                if tur.startswith('text/csv'):
                    ek['Content-Disposition'] = 'attachment; filename="is_takip.csv"'
                return self._gonder(kod, veri, tur, ek)
            if yol == '/api/durum':
                return self._json(200, {'surum': SURUM, 'kurulu_surum': kurulu_surum(), 'klasor': KOK,
                                        'firma_var': True, 'tek_basina': True,
                                        'studyo_klasoru': STUDYO_KOK, 'veri_klasoru': is_takip_api.VERI_KLASORU})
            if yol == '/api/guncelle' and yontem == 'POST':
                try:
                    return self._json(200, guncelleme_kur(govde))
                except ValueError as e:
                    return self._json(400, {'hata': str(e)})
            if yol == '/api/veri_ac' and yontem == 'POST':
                klasor_ac(is_takip_api.VERI_KLASORU)
                return self._json(200, {'tamam': True})
            if yol == '/api/firmalar':
                return self._json(200, firmalar())
            if yol == '/api/projeler':
                return self._json(200, projeler())
            if yol.startswith('/api/'):
                return self._json(404, {'hata': 'Bu uç tek başına sürümde yok: ' + yol})
            if yontem != 'GET':
                return self._json(405, {'hata': 'İzin yok'})
            # durağan dosyalar
            dosya = os.path.normpath(os.path.join(ARAYUZ, yol.lstrip('/') or 'index.html'))
            if not dosya.startswith(ARAYUZ) or not os.path.isfile(dosya):
                dosya = os.path.join(ARAYUZ, 'index.html')
            with open(dosya, 'rb') as f:
                icerik = f.read()
            tur = mimetypes.guess_type(dosya)[0] or 'application/octet-stream'
            if tur.startswith('text/') or tur.endswith('javascript'):
                tur += '; charset=utf-8'
            self._gonder(200, icerik, tur)
        except Exception as e:  # noqa
            self._json(500, {'hata': 'Sunucu hatası: %s' % e})

    def do_GET(self):
        self._isle('GET')

    def do_POST(self):
        self._isle('POST')

    def do_PUT(self):
        self._isle('PUT')

    def do_PATCH(self):
        self._isle('PATCH')

    def do_DELETE(self):
        self._isle('DELETE')


def sunucu_kur(port=PORT):
    mimetypes.add_type('application/javascript', '.js')
    mimetypes.add_type('text/css', '.css')
    return ThreadingHTTPServer(('127.0.0.1', port), Isleyici)


def main():
    sunucu = sunucu_kur()
    print('İş Takibi çalışıyor: http://127.0.0.1:%d/#/isler' % PORT)
    print('Veri klasörü: ' + is_takip_api.VERI_KLASORU)
    try:
        sunucu.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
