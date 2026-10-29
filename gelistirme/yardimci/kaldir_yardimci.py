# -*- coding: utf-8 -*-
"""Dosya Yardımcısını kaldırır (bilgisayardaki proje dosyalarına dokunmaz)."""
import base64, os, subprocess
HEDEF = os.path.dirname(os.path.abspath(__file__))
b = r"Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Startup')) 'İş Takibi Dosya Yardımcısı.lnk') -ErrorAction SilentlyContinue"
subprocess.run(['powershell', '-NoProfile', '-EncodedCommand', base64.b64encode(b.encode('utf-16-le')).decode()], capture_output=True)
try:
    import urllib.request
    urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8767/kapat', data=b'', method='POST'), timeout=3)
except Exception:
    pass
print('Dosya Yardımcısı kapatıldı ve kaldırıldı. Proje dosyalarınıza dokunulmadı.')
