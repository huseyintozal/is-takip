# -*- coding: utf-8 -*-
"""İş Takibi'ni kaldırır: kısayollar, Uygulamalar kaydı ve program klasörü silinir.
Veriler (Belgeler\\ZeminEtut\\is_takip) SİLİNMEZ."""
import base64
import os
import subprocess

HEDEF = os.path.dirname(os.path.abspath(__file__))
AD = 'İş Takibi'


def main():
    try:
        import ctypes
        if ctypes.windll.user32.MessageBoxW(None, '%s kaldırılsın mı?\n\nKayıtlı işleriniz Belgeler\\ZeminEtut\\is_takip '
                                            'klasöründe kalır.' % AD, AD, 0x24) != 6:
            return
    except Exception:
        pass
    betik = r'''
foreach ($kl in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  Remove-Item -LiteralPath (Join-Path $kl '%s.lnk') -ErrorAction SilentlyContinue
}''' % AD
    subprocess.run(['powershell', '-NoProfile', '-EncodedCommand', base64.b64encode(betik.encode('utf-16-le')).decode()],
                   capture_output=True)
    try:
        import winreg
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Uninstall\IsTakibi')
    except Exception:
        pass
    # program klasörü, bu betik kapandıktan sonra silinir
    subprocess.Popen('cmd /c timeout /t 2 /nobreak >nul & rmdir /s /q "%s"' % HEDEF, shell=True,
                     creationflags=0x08000000, cwd=os.path.dirname(HEDEF))


if __name__ == '__main__':
    main()
