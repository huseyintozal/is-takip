# -*- coding: utf-8 -*-
"""İş Takibi Dosya Yardımcısı kurulumu (KUR.bat çalıştırır). Yönetici izni gerekmez.
 - %LOCALAPPDATA%\\Programs\\IsTakibiYardimci klasörüne kopyalar
 - Windows açılınca kendiliğinden başlasın diye kullanıcının "Run" kaydına ekler
   (PowerShell kullanmaz: antivirüsler gizli PowerShell komutlarını tehdit sanıp engelliyor)
 - hemen başlatır"""
import os
import shutil
import subprocess
import sys

KAYNAK = os.path.dirname(os.path.abspath(__file__))
HEDEF = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), 'Programs', 'IsTakibiYardimci')


RUN_ANAHTARI = r'Software\Microsoft\Windows\CurrentVersion\Run'
ESKI_KISAYOL = os.path.join(os.environ.get('APPDATA') or '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'İş Takibi Dosya Yardımcısı.lnk')


def main():
    if os.name != 'nt':
        print('Bu kurulum Windows içindir.')
        return 1
    pythonw = os.path.join(os.path.dirname(sys.executable), 'pythonw.exe')
    if not os.path.isfile(pythonw):
        pythonw = sys.executable
    # çalışan bütün eski kopyaları kapat (yenisi başlayabilsin)
    import time
    import urllib.request
    for _ in range(5):
        try:
            urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8767/kapat', data=b'', method='POST'), timeout=3)
            time.sleep(1)
        except Exception:
            break
    time.sleep(1)
    os.makedirs(HEDEF, exist_ok=True)
    for d in ('yardimci.pyw', 'kaldir_yardimci.py'):
        shutil.copy2(os.path.join(KAYNAK, d), os.path.join(HEDEF, d))
    hedef = os.path.join(HEDEF, 'yardimci.pyw')
    try:                                   # Windows açılınca başlasın
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_ANAHTARI, 0, winreg.KEY_SET_VALUE) as k:
            winreg.SetValueEx(k, 'IsTakibiDosyaYardimcisi', 0, winreg.REG_SZ, '"%s" "%s"' % (pythonw, hedef))
        if os.path.exists(ESKI_KISAYOL):   # eski sürümün başlangıç kısayolu (iki kez başlamasın)
            os.remove(ESKI_KISAYOL)
    except Exception as e:
        print('  ! Otomatik başlatma ayarlanamadı:', e)
    subprocess.Popen([pythonw, hedef], cwd=HEDEF)
    surum = '?'
    for _ in range(10):
        time.sleep(1)
        try:
            import json
            surum = json.loads(urllib.request.urlopen('http://127.0.0.1:8767/durum', timeout=3).read()).get('surum')
            break
        except Exception:
            pass
    print('Dosya Yardımcısı kuruldu ve çalışıyor (sürüm %s). Windows her açıldığında kendiliğinden başlar.' % surum)
    print('Şimdi İş Takibi > Dosyalar sayfasına dönün.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
