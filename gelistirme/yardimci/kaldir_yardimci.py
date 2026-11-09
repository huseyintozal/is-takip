# -*- coding: utf-8 -*-
"""Dosya Yardımcısını kaldırır (bilgisayardaki proje dosyalarına dokunmaz)."""
import os
try:
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Run', 0, winreg.KEY_SET_VALUE) as k:
        winreg.DeleteValue(k, 'IsTakibiDosyaYardimcisi')
except Exception:
    pass
kisayol = os.path.join(os.environ.get('APPDATA') or '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'İş Takibi Dosya Yardımcısı.lnk')
try:
    os.remove(kisayol)
except Exception:
    pass
try:
    import urllib.request
    urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8767/kapat', data=b'', method='POST'), timeout=3)
except Exception:
    pass
print('Dosya Yardımcısı kapatıldı ve kaldırıldı. Proje dosyalarınıza dokunulmadı.')
