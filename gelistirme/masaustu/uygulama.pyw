# -*- coding: utf-8 -*-
"""İş Takibi masaüstü uygulaması.

Yerel sunucuyu (127.0.0.1) başlatır ve arayüzü KENDİ PENCERESİNDE açar, tarayıcı açılmaz.
Önce pywebview (Rapor Stüdyosu'yla aynı), yoksa Edge'in uygulama penceresi (--app) kullanılır.
Pencere kapanınca sunucu da kapanır. Masaüstündeki "İş Takibi" kısayolu bu dosyayı pythonw ile çalıştırır.
"""
import json
import os
import socket
import subprocess
import sys
import threading
import traceback
import urllib.request

KOK = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, KOK)
os.chdir(KOK)

import is_takip_api  # noqa: E402
import sunucu        # noqa: E402

BASLIK = 'İş Takibi'
YEREL = os.environ.get('LOCALAPPDATA') or os.path.expanduser('~')
PENCERE_PROFILI = os.path.join(YEREL, 'IsTakibi', 'pencere')


def gunluk_ac():
    """pythonw'da konsol yok: çıktılar ve hatalar dosyaya yazılsın."""
    try:
        os.makedirs(is_takip_api.VERI_KLASORU, exist_ok=True)
        f = open(os.path.join(is_takip_api.VERI_KLASORU, 'uygulama.log'), 'a', encoding='utf-8')
        if sys.stdout is None or 'pythonw' in os.path.basename(sys.executable).lower():
            sys.stdout = sys.stderr = f
    except Exception:
        pass


def mesaj(metin):
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, metin, BASLIK, 0x10)
    except Exception:
        print(metin)


def calisan_sunucu(port):
    try:
        with urllib.request.urlopen('http://127.0.0.1:%d/api/durum' % port, timeout=1) as r:
            return json.load(r).get('tek_basina') is True
    except Exception:
        return False


def port_bos(port):
    s = socket.socket()
    try:
        s.bind(('127.0.0.1', port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def pencere_webview(adres):
    try:
        import webview
    except ImportError:
        return False
    try:
        try:
            webview.settings['ALLOW_DOWNLOADS'] = True     # "CSV indir" çalışsın
        except Exception:
            pass
        webview.create_window(BASLIK, adres, width=1400, height=900, min_size=(1000, 640))
        try:
            os.makedirs(PENCERE_PROFILI, exist_ok=True)
            webview.start(private_mode=False, storage_path=PENCERE_PROFILI)   # süzgeç tercihleri hatırlansın
        except TypeError:
            webview.start()
        return True
    except Exception:
        traceback.print_exc()
        return False


def pencere_edge(adres):
    aday = []
    for kok in (os.environ.get('ProgramFiles(x86)'), os.environ.get('ProgramFiles'), os.environ.get('LOCALAPPDATA')):
        if kok:
            aday += [os.path.join(kok, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
                     os.path.join(kok, 'Google', 'Chrome', 'Application', 'chrome.exe')]
    exe = next((a for a in aday if os.path.isfile(a)), None)
    if not exe:
        return False
    os.makedirs(PENCERE_PROFILI, exist_ok=True)
    p = subprocess.Popen([exe, '--app=' + adres, '--user-data-dir=' + PENCERE_PROFILI,
                          '--window-size=1400,900', '--no-first-run', '--no-default-browser-check'])
    p.wait()          # ayrı profil: pencere kapanınca süreç biter
    return True


def main():
    gunluk_ac()
    port, srv = sunucu.PORT, None
    if not calisan_sunucu(port):
        while not port_bos(port) and port < sunucu.PORT + 30:
            port += 1
        srv = sunucu.sunucu_kur(port)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
    adres = 'http://127.0.0.1:%d/#/isler' % port
    try:
        if not (pencere_webview(adres) or pencere_edge(adres)):
            mesaj('Pencere açılamadı. Microsoft Edge ya da pywebview bulunamadı.\n'
                  'kur.bat dosyasını yeniden çalıştırın.')
    finally:
        if srv:
            srv.shutdown()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        traceback.print_exc()
        mesaj('İş Takibi açılırken hata oluştu:\n' + traceback.format_exc()[-800:])
