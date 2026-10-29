# -*- coding: utf-8 -*-
"""İş Takibi Windows kurulumu (kur.bat çalıştırır).

- Programı  %LOCALAPPDATA%\\Programs\\IsTakibi  klasörüne kopyalar (yönetici izni gerekmez)
- pywebview'i kurar (olmazsa Edge penceresi kullanılır)
- Masaüstüne ve Başlat menüsüne "İş Takibi" kısayolu açar
- Ayarlar > Uygulamalar listesine ekler (oradan kaldırılabilir)
Veriler programla değil  Belgeler\\ZeminEtut\\is_takip  klasöründe durur; yeniden kurmak ya da
kaldırmak verilere dokunmaz.
"""
import base64
import os
import shutil
import subprocess
import sys

KAYNAK = os.path.dirname(os.path.abspath(__file__))
HEDEF = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), 'Programs', 'IsTakibi')
DOSYALAR = ['uygulama.pyw', 'sunucu.py', 'is_takip_api.py', 'xlsx_okuyucu.py', 'kaldir.py', 'simge.ico', 'ENTEGRASYON.md', 'surum.txt']
KLASORLER = ['arayuz', 'baslangic']
AD = 'İş Takibi'
SURUM = open(os.path.join(KAYNAK, 'surum.txt'), encoding='utf-8').read().strip()


def powershell(betik):
    kod = base64.b64encode(betik.encode('utf-16-le')).decode()
    return subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', kod],
                          capture_output=True, text=True)


def kisayollar(pythonw):
    hedef = os.path.join(HEDEF, 'uygulama.pyw')
    simge = os.path.join(HEDEF, 'simge.ico')
    betik = r'''
$k = New-Object -ComObject WScript.Shell
foreach ($kl in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $s = $k.CreateShortcut((Join-Path $kl '%s.lnk'))
  $s.TargetPath = '%s'
  $s.Arguments = '"%s"'
  $s.WorkingDirectory = '%s'
  $s.IconLocation = '%s'
  $s.Description = 'Zemin etüt iş takibi'
  $s.Save()
}
''' % tuple(x.replace("'", "''") for x in (AD, pythonw, hedef, HEDEF, simge))
    r = powershell(betik)
    if r.returncode != 0:
        print('  ! Kısayol açılamadı:', r.stderr.strip()[:300])
        return False
    return True


def kayit_defteri(python):
    try:
        import winreg
        a = winreg.CreateKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Uninstall\IsTakibi')
        for ad, deger in [('DisplayName', AD), ('DisplayVersion', SURUM), ('Publisher', 'Zemin Etüt'),
                          ('DisplayIcon', os.path.join(HEDEF, 'simge.ico')), ('InstallLocation', HEDEF),
                          ('UninstallString', '"%s" "%s"' % (python, os.path.join(HEDEF, 'kaldir.py')))]:
            winreg.SetValueEx(a, ad, 0, winreg.REG_SZ, deger)
        winreg.SetValueEx(a, 'NoModify', 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(a, 'NoRepair', 0, winreg.REG_DWORD, 1)
        winreg.CloseKey(a)
    except Exception as e:
        print('  ! Uygulamalar listesine eklenemedi:', e)


def main():
    if os.name != 'nt':
        print('Bu kurulum Windows içindir.')
        return 1
    python = sys.executable
    pythonw = os.path.join(os.path.dirname(python), 'pythonw.exe')
    if not os.path.isfile(pythonw):
        pythonw = python

    print('1/4  Pencere bileşeni (pywebview) kuruluyor...')
    r = subprocess.run([python, '-m', 'pip', 'install', '--user', '--upgrade', '--quiet', 'pywebview'],
                       capture_output=True, text=True)
    print('     tamam' if r.returncode == 0 else '     kurulamadı, Edge penceresi kullanılacak (sorun değil)')

    print('2/4  Program kopyalanıyor:', HEDEF)
    os.makedirs(HEDEF, exist_ok=True)
    for d in DOSYALAR:
        shutil.copy2(os.path.join(KAYNAK, d), os.path.join(HEDEF, d))
    for k in KLASORLER:
        shutil.copytree(os.path.join(KAYNAK, k), os.path.join(HEDEF, k), dirs_exist_ok=True)

    print('3/4  Masaüstü ve Başlat menüsü kısayolu açılıyor...')
    kisayollar(pythonw)

    print('4/4  Uygulamalar listesine ekleniyor...')
    kayit_defteri(python)

    sys.path.insert(0, HEDEF)
    import is_takip_api
    print()
    print('Kurulum tamam. Masaüstündeki "%s" simgesiyle açın.' % AD)
    print('Veriler: ' + is_takip_api.VERI_KLASORU)
    subprocess.Popen([pythonw, os.path.join(HEDEF, 'uygulama.pyw')], cwd=HEDEF)
    return 0


if __name__ == '__main__':
    sys.exit(main())
