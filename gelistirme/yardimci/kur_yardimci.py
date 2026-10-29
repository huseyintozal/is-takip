# -*- coding: utf-8 -*-
"""İş Takibi Dosya Yardımcısı kurulumu (KUR.bat çalıştırır). Yönetici izni gerekmez.
 - %LOCALAPPDATA%\\Programs\\IsTakibiYardimci klasörüne kopyalar
 - Windows açılınca kendiliğinden başlasın diye Başlangıç klasörüne kısayol koyar
 - hemen başlatır"""
import base64
import os
import shutil
import subprocess
import sys

KAYNAK = os.path.dirname(os.path.abspath(__file__))
HEDEF = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), 'Programs', 'IsTakibiYardimci')


def powershell(betik):
    kod = base64.b64encode(betik.encode('utf-16-le')).decode()
    return subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', kod],
                          capture_output=True, text=True)


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
    powershell(r"""Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*yardimci.pyw*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }""")
    time.sleep(1)
    os.makedirs(HEDEF, exist_ok=True)
    for d in ('yardimci.pyw', 'kaldir_yardimci.py'):
        shutil.copy2(os.path.join(KAYNAK, d), os.path.join(HEDEF, d))
    hedef = os.path.join(HEDEF, 'yardimci.pyw')
    q = lambda s: s.replace("'", "''")
    r = powershell(r'''
$k = New-Object -ComObject WScript.Shell
$s = $k.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'İş Takibi Dosya Yardımcısı.lnk'))
$s.TargetPath = '%s'
$s.Arguments = '"%s"'
$s.WorkingDirectory = '%s'
$s.Description = 'İş Takibi: proje klasörlerine erişim'
$s.Save()
''' % (q(pythonw), q(hedef), q(HEDEF)))
    if r.returncode != 0:
        print('  ! Başlangıç kısayolu açılamadı:', r.stderr.strip()[:300])
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
