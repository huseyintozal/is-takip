# -*- coding: utf-8 -*-
"""Yalnızca Python standart kütüphanesiyle .xlsx okuyucu (openpyxl gerekmez).

sayfa_oku(dosya, sayfa_adi) -> [[hücre, ...], ...]  (boş satırlar atlanır)
sayfa_adlari(dosya) -> ['TAKİP', ...]
"""
import io
import re
import zipfile
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS_R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
NS_PR = '{http://schemas.openxmlformats.org/package/2006/relationships}'


def _zip(dosya):
    if isinstance(dosya, (bytes, bytearray)):
        dosya = io.BytesIO(dosya)
    return zipfile.ZipFile(dosya)


def _paylasilan(z):
    if 'xl/sharedStrings.xml' not in z.namelist():
        return []
    sonuc = []
    with z.open('xl/sharedStrings.xml') as f:
        for _, el in ET.iterparse(f):
            if el.tag == NS + 'si':
                sonuc.append(''.join(t.text or '' for t in el.iter(NS + 't')))
                el.clear()
    return sonuc


def _sayfa_yollari(z):
    kitap = ET.fromstring(z.read('xl/workbook.xml'))
    iliski = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    hedef = {r.get('Id'): r.get('Target') for r in iliski.iter(NS_PR + 'Relationship')}
    yollar = {}
    for s in kitap.iter(NS + 'sheet'):
        t = hedef.get(s.get(NS_R + 'id'), '')
        t = t.lstrip('/')
        if not t.startswith('xl/'):
            t = 'xl/' + t
        yollar[s.get('name')] = t
    return yollar


def sayfa_adlari(dosya):
    with _zip(dosya) as z:
        return list(_sayfa_yollari(z))


def _sutun_no(ref):
    harf = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for c in harf:
        n = n * 26 + ord(c) - 64
    return n - 1


def sayfa_oku(dosya, sayfa_adi=None, en_fazla_bos=200):
    """Sayfayı satır listesi olarak döndürür. Art arda `en_fazla_bos` boş satırdan sonra durur."""
    with _zip(dosya) as z:
        yollar = _sayfa_yollari(z)
        if sayfa_adi is None:
            sayfa_adi = next(iter(yollar))
        if sayfa_adi not in yollar:
            # büyük/küçük harf ve boşluk farkını tolere et
            bul = [k for k in yollar if k.strip().upper() == sayfa_adi.strip().upper()]
            if not bul:
                raise KeyError(sayfa_adi)
            sayfa_adi = bul[0]
        ss = _paylasilan(z)
        satirlar, bos = [], 0
        with z.open(yollar[sayfa_adi]) as f:
            for _, el in ET.iterparse(f):
                if el.tag != NS + 'row':
                    continue
                hucreler = {}
                for c in el.iter(NS + 'c'):
                    tur = c.get('t')
                    v = c.find(NS + 'v')
                    if tur == 'inlineStr':
                        deger = ''.join(t.text or '' for t in c.iter(NS + 't'))
                    elif v is None or v.text is None:
                        continue
                    elif tur == 's':
                        deger = ss[int(v.text)]
                    elif tur in ('str', 'e'):
                        deger = v.text
                    elif tur == 'b':
                        deger = v.text == '1'
                    else:
                        try:
                            x = float(v.text)
                            deger = int(x) if x.is_integer() else x
                        except ValueError:
                            deger = v.text
                    if isinstance(deger, str) and not deger.strip():
                        continue
                    hucreler[_sutun_no(c.get('r'))] = deger
                el.clear()
                if hucreler:
                    satir = [None] * (max(hucreler) + 1)
                    for i, d in hucreler.items():
                        satir[i] = d
                    satirlar.append(satir)
                    bos = 0
                else:
                    bos += 1
                    if bos > en_fazla_bos and satirlar:
                        break
        return satirlar
