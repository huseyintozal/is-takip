# -*- coding: utf-8 -*-
"""İş takibi: veri katmanı ve /api/is_takip/... uçları.

Ana uygulamaya (Zemin Etüt Rapor Stüdyosu) eklerken sunucu.py içinde:

    import is_takip_api
    is_takip_api.VERI_KLASORU = <veri kökü>/is_takip
    ...
    if yol.startswith('/api/is_takip/'):
        kod, govde, tur = is_takip_api.isle(yontem, yol, sorgu, ham_govde)

Veri: VERI_KLASORU/isler.json  ->  {"surum": 1, "isler": [ {...}, ... ]}
"""
import csv
import io
import json
import os
import re
import shutil
import threading
import uuid
import zipfile
from datetime import datetime, date

import xlsx_okuyucu

def belgeler_klasoru():
    """Windows'ta gerçek Belgeler klasörü (OneDrive'a taşınmış olsa da), diğerlerinde ~/Documents."""
    if os.name == 'nt':
        try:
            import ctypes
            tampon = ctypes.create_unicode_buffer(260)
            if ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, tampon) == 0 and tampon.value:
                return tampon.value
        except Exception:
            pass
    return os.path.join(os.path.expanduser('~'), 'Documents')


# Veri: Belgeler/ZeminEtut/is_takip (Rapor Stüdyosu'nun veri kökünün altında). IS_TAKIP_VERI ile değiştirilebilir.
VERI_KLASORU = os.environ.get('IS_TAKIP_VERI') or os.path.join(belgeler_klasoru(), 'ZeminEtut', 'is_takip')
# İlk açılışta veri yoksa buradaki başlangıç verisi kopyalanır (Excel'den aktarılmış işler)
BASLANGIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'baslangic', 'isler.json')
_KILIT = threading.Lock()

# Evet/hayır alanları (iş akışı sırasıyla)
DURUM_ALANLARI = ['mimari', 'evrak', 'zemin_degeri', 'geo', 'sondaj', 'sondaja_atildi', 'laba_atildi', 'lab', 'riskli_rapor',
                  'rapor_yazildi', 'imza_cd', 'lab_taramasi']
METIN_ALANLARI = ['proje_id', 'firma_id', 'isveren', 'mahalle', 'mal_sahibi', 'ada', 'parsel', 'notlar', 'klasor']
BINA_DEGERLERI = ('', 'evet', 'hayir')
ALAN_ADI = {
    'mimari': 'Mimari', 'evrak': 'Evrak', 'zemin_degeri': 'Zemin değeri', 'geo': 'Geo',
    'sondaj': 'Sondaj', 'sondaja_atildi': 'Sondaja atıldı', 'laba_atildi': 'Laba atıldı', 'lab': 'Lab sonucu', 'riskli_rapor': 'Riskli rapor',
    'bina_yikildi': 'Bina yıkıldı', 'rapor_yazildi': 'Rapor yazıldı', 'imza_cd': 'İmza-CD', 'lab_taramasi': 'Lab taraması',
}


# ------------------------------------------------------------------ yardımcılar
def simdi():
    return datetime.now().isoformat(timespec='seconds')


def tr_buyuk(s):
    s = str(s or '').replace('i', 'İ').replace('ı', 'I')
    return re.sub(r'\s+', ' ', s.upper()).strip()


def metin(v):
    """Hücredeki yazıyı OLDUĞU GİBİ alır; yalnızca baştaki/sondaki boşluk atılır, 229.0 -> 229."""
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def ada_parsel_duzelt(v):          # yalnızca karşılaştırma (anahtar) için
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).strip()
    return '' if s in ('-', '—', '0') else s


def _dosya():
    return os.path.join(VERI_KLASORU, 'isler.json')


def oku():
    yol = _dosya()
    if not os.path.exists(yol):
        if os.path.exists(BASLANGIC):
            os.makedirs(VERI_KLASORU, exist_ok=True)
            shutil.copy2(BASLANGIC, yol)
        else:
            return {'surum': 1, 'isler': []}
    with open(yol, encoding='utf-8') as f:
        veri = json.load(f)
    for i in veri.get('isler', []):         # eski kayıtlar: sondaj hücresinde yazı varsa (ÖMERE ATILDI…) sondaja atılmış sayılır
        if 'sondaja_atildi' not in i:
            i['sondaja_atildi'] = bool(not i.get('sondaj') and (i.get('alan_notlari') or {}).get('sondaj'))
        for a in ('rapor_yazildi', 'imza_cd', 'lab_taramasi'):   # kapanış adımları (1.6.0)
            i.setdefault(a, False)
    return veri


def yaz(veri):
    os.makedirs(VERI_KLASORU, exist_ok=True)
    yol = _dosya()
    # günde bir yedek
    if os.path.exists(yol):
        yedek_kl = os.path.join(VERI_KLASORU, 'yedek')
        os.makedirs(yedek_kl, exist_ok=True)
        yedek = os.path.join(yedek_kl, 'isler_%s.json' % date.today().strftime('%Y%m%d'))
        if not os.path.exists(yedek):
            shutil.copy2(yol, yedek)
    gecici = yol + '.tmp'
    with open(gecici, 'w', encoding='utf-8') as f:
        json.dump(veri, f, ensure_ascii=False, indent=1)
    os.replace(gecici, yol)


def bos_is():
    i = {'id': 'is_' + uuid.uuid4().hex[:10]}
    for a in METIN_ALANLARI:
        i[a] = ''
    for a in DURUM_ALANLARI:
        i[a] = False
    i['bina_yikildi'] = ''
    i['alan_notlari'] = {}          # {"zemin_degeri": "İYİLEŞTİRME ÇIKABİLİR", ...} Excel'de hücreye yazılan yazı
    i['olusturma'] = i['guncelleme'] = simdi()
    i['gecmis'] = []
    return i


def temizle(gelen, eski=None):
    """İstemciden gelen alanları doğrular, eski kayda uygular. Değişen durumları geçmişe yazar."""
    i = dict(eski) if eski else bos_is()
    zaman = simdi()
    for a in METIN_ALANLARI:
        if a in gelen:
            i[a] = metin(gelen[a])          # yazıldığı gibi saklanır, büyük harfe çevrilmez
    degisen = []
    bos = set(gelen['bos_alanlar']) if 'bos_alanlar' in gelen else set(i.get('bos_alanlar') or [])
    for a in DURUM_ALANLARI:
        if a in gelen:
            v = bool(gelen[a])
            if eski is not None and bool(eski.get(a)) != v:
                degisen.append({'zaman': zaman, 'alan': a, 'deger': v})
                bos.discard(a)              # Excel'de boş olan hücre artık işaretlendi
            i[a] = v
    i['bos_alanlar'] = [a for a in DURUM_ALANLARI if a in bos]
    if 'bina_yikildi' in gelen:
        v = gelen['bina_yikildi'] if gelen['bina_yikildi'] in BINA_DEGERLERI else ''
        if eski is not None and eski.get('bina_yikildi', '') != v:
            degisen.append({'zaman': zaman, 'alan': 'bina_yikildi', 'deger': v})
        i['bina_yikildi'] = v
    if 'alan_notlari' in gelen:
        eski_not = dict(i.get('alan_notlari') or {})
        yeni_not = {}
        for a, v in (gelen['alan_notlari'] or {}).items():
            if a in DURUM_ALANLARI or a == 'bina_yikildi':
                v = metin(v)
                if v:
                    yeni_not[a] = v
        if eski is not None:
            for a in set(eski_not) | set(yeni_not):
                if eski_not.get(a, '') != yeni_not.get(a, ''):
                    degisen.append({'zaman': zaman, 'alan': a, 'not': yeni_not.get(a, '')})
        i['alan_notlari'] = yeni_not
    i.setdefault('alan_notlari', {})
    i['gecmis'] = (list(i.get('gecmis') or []) + degisen)[-200:]
    i['guncelleme'] = zaman
    if not i['isveren']:
        raise ValueError('İşveren boş olamaz')
    return i


# ------------------------------------------------------------------ Excel içe aktarma
# Hücrede bu yazılar varsa (büyük/küçük harf farkı önemsiz) standart değerdir, not tutulmaz
_HAYIR = {'', 'YOK', 'ATILMADI', 'VERİLMEDİ', 'YAPILMADI', '-', 'HAYIR', 'YIKILMADI'}
_EVET = {'+', 'VAR', 'YAPILDI', 'EVET', 'VERİLDİ', 'ATILDI', 'GELDİ', 'YIKILDI'}


def hucre_coz(v, alan):
    """Excel hücresi -> (değer, alan notu). Standart dışı yazı hiç değiştirilmeden alan notu olur."""
    ham = metin(v)
    s = tr_buyuk(ham)
    if s in _HAYIR:
        return False, ''
    if s in _EVET:
        return True, ''
    if s.startswith('+'):
        return True, ham
    if alan in ('zemin_degeri', 'laba_atildi'):   # "İYİLEŞTİRME ÇIKABİLİR", "NİHAT ABİ" -> verilmiş / atılmış sayılır
        return True, ham
    return False, ham                               # sondaj "ÖMERE ATILDI", riskli "(ZC BİZ ZD)" -> yapılmamış sayılır


BASLIK_ESLES = {
    'İŞVEREN': 'isveren', 'MAHALLE': 'mahalle', 'MAL SAHİBİ': 'mal_sahibi', 'ADA': 'ada', 'PARSEL': 'parsel',
    'MİMARİ': 'mimari', 'EVRAK': 'evrak', 'GEO': 'geo', 'LAB': 'lab', 'ZEMİN DEĞERİ VERİLDİ': 'zemin_degeri',
    'ZEMİN DEĞERİ': 'zemin_degeri', 'LABA ATILDI': 'laba_atildi', 'RİSKLİ RAPOR': 'riskli_rapor', 'SONDAJ': 'sondaj',
    'BİNA YIKILDI': 'bina_yikildi', 'NOTLAR': 'notlar', 'NOT': 'notlar',
    'RAPOR YAZILDI': 'rapor_yazildi', 'K RAPOR YAZILDI': 'rapor_yazildi', 'İMZA-CD': 'imza_cd', 'İMZA CD': 'imza_cd',
    'LAB TARAMASI': 'lab_taramasi',
}


def excel_satirlari(icerik, sayfa='TAKİP'):
    satirlar = xlsx_okuyucu.sayfa_oku(icerik, sayfa)
    if not satirlar:
        return []
    basliklar = [BASLIK_ESLES.get(tr_buyuk(b)) if b is not None else None for b in satirlar[0]]
    if 'isveren' not in basliklar:
        raise ValueError('"%s" sayfasında İŞVEREN başlığı bulunamadı' % sayfa)
    kayitlar = []
    for satir in satirlar[1:]:
        ham, notlar = {}, []
        for i, v in enumerate(satir):
            alan = basliklar[i] if i < len(basliklar) else None
            if alan:
                ham[alan] = v
            elif metin(v):
                notlar.append(metin(v))             # başlıksız sütunlara yazılan notlar, aynen
        if not metin(ham.get('isveren')):
            continue
        k = {a: metin(ham.get(a)) for a in ('isveren', 'mahalle', 'mal_sahibi', 'ada', 'parsel')}
        k['alan_notlari'] = {}
        k['bos_alanlar'] = [a for a in DURUM_ALANLARI if a in basliklar and not metin(ham.get(a))]
        for a in DURUM_ALANLARI:
            k[a], n = hucre_coz(ham.get(a), a)
            if n:
                k['alan_notlari'][a] = n
        # sondaj hücresindeki yazı (ÖMERE ATILDI, AYGÜN ABİYLE YAPILACAK…) = sondajcıya verildi, sonucu gelmedi
        k['sondaja_atildi'] = bool(not k['sondaj'] and k['alan_notlari'].get('sondaj'))
        by, n = hucre_coz(ham.get('bina_yikildi'), 'bina_yikildi')
        k['bina_yikildi'] = 'evet' if by else ('hayir' if tr_buyuk(ham.get('bina_yikildi')) in ('HAYIR', 'YIKILMADI') else '')
        if n:
            k['alan_notlari']['bina_yikildi'] = n
        if metin(ham.get('notlar')):
            notlar.insert(0, metin(ham['notlar']))
        k['notlar'] = '\n'.join(notlar)
        kayitlar.append(k)
    return kayitlar


def anahtar(i):
    ada = ada_parsel_duzelt(i.get('ada'))
    parsel = ada_parsel_duzelt(i.get('parsel'))
    if ada:
        return '%s|%s' % (ada, parsel)
    return '-|%s|%s' % (parsel, tr_buyuk(i.get('mal_sahibi')))


def ice_aktar(icerik, guncelle=False, sayfa='TAKİP'):
    gelen = excel_satirlari(icerik, sayfa)
    sonuc = {'eklenen': 0, 'guncellenen': 0, 'ayni': 0, 'toplam': len(gelen)}
    with _KILIT:
        veri = oku()
        dizin = {anahtar(i): n for n, i in enumerate(veri['isler'])}
        for k in gelen:
            a = anahtar(k)
            if a in dizin:
                if guncelle:
                    eski = veri['isler'][dizin[a]]
                    k2 = dict(k)
                    # uygulamada yazılmış genel notu koru
                    if eski.get('notlar') and k2.get('notlar') and k2['notlar'] not in eski['notlar']:
                        k2['notlar'] = eski['notlar'] + '\n' + k2['notlar']
                    elif eski.get('notlar'):
                        k2['notlar'] = eski['notlar']
                    if not k2.get('bina_yikildi'):
                        k2['bina_yikildi'] = eski.get('bina_yikildi', '')
                    yeni = temizle(k2, eski)
                    if any(yeni.get(x) != eski.get(x) for x in DURUM_ALANLARI + METIN_ALANLARI + ['alan_notlari', 'bina_yikildi', 'bos_alanlar']):
                        veri['isler'][dizin[a]] = yeni
                        sonuc['guncellenen'] += 1
                    else:
                        sonuc['ayni'] += 1
                else:
                    sonuc['ayni'] += 1
                continue
            yeni = temizle(k)
            yeni['kaynak'] = 'excel'
            veri['isler'].append(yeni)
            dizin[a] = len(veri['isler']) - 1
            sonuc['eklenen'] += 1
        yaz(veri)
    return sonuc


# ------------------------------------------------------------------ dışa aktarma
def csv_uret(isveren=''):
    veri = oku()
    isler = veri['isler']
    if isveren:
        isler = [i for i in isler if tr_buyuk(i['isveren']) == tr_buyuk(isveren)]
    f = io.StringIO()
    w = csv.writer(f, delimiter=';')
    w.writerow(['İŞVEREN', 'MAHALLE', 'MAL SAHİBİ', 'ADA', 'PARSEL', 'MİMARİ', 'EVRAK', 'GEO', 'LAB',
                'ZEMİN DEĞERİ VERİLDİ', 'LABA ATILDI', 'RİSKLİ RAPOR', 'SONDAJ', 'BİNA YIKILDI', 'NOTLAR',
                'RAPOR YAZILDI', 'İMZA-CD', 'LAB TARAMASI'])
    for i in isler:                                   # kayıt sırası = Excel'deki sıra
        n = i.get('alan_notlari') or {}
        bos = i.get('bos_alanlar') or []
        ev = lambda a, e='+', h='YOK': n.get(a) or ('' if a in bos else (e if i[a] else h))
        w.writerow([i['isveren'], i['mahalle'], i['mal_sahibi'], i['ada'], i['parsel'],
                    ev('mimari'), ev('evrak'), ev('geo'), ev('lab'),
                    ev('zemin_degeri', '+', 'VERİLMEDİ'), ev('laba_atildi', '+', 'ATILMADI'),
                    ev('riskli_rapor'), n.get('sondaj') or ('' if 'sondaj' in bos else 'YAPILDI' if i['sondaj'] else 'SONDAJA ATILDI' if i.get('sondaja_atildi') else 'YAPILMADI'),
                    n.get('bina_yikildi') or {'evet': 'EVET', 'hayir': 'HAYIR'}.get(i.get('bina_yikildi'), ''),
                    i.get('notlar', ''), ev('rapor_yazildi'), ev('imza_cd'), ev('lab_taramasi')])
    return ('﻿' + f.getvalue()).encode('utf-8')


# ------------------------------------------------------------------ uçlar
def _json(kod, nesne):
    return kod, json.dumps(nesne, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8'


def isle(yontem, yol, sorgu, govde):
    """yol: '/api/is_takip/...'; sorgu: dict (parse_qs sonucu); govde: bytes. -> (kod, bytes, içerik türü)"""
    parca = [p for p in yol.split('/') if p][2:]          # ['isler', '<id>'] gibi
    try:
        if parca == ['isler'] and yontem == 'GET':
            return _json(200, oku())
        if parca == ['isler'] and yontem == 'POST':
            gelen = json.loads(govde or b'{}')
            with _KILIT:
                veri = oku()
                yeni = temizle(gelen)
                veri['isler'].append(yeni)
                yaz(veri)
            return _json(200, yeni)
        if len(parca) == 2 and parca[0] == 'isler':
            iid = parca[1]
            with _KILIT:
                veri = oku()
                n = next((k for k, i in enumerate(veri['isler']) if i['id'] == iid), None)
                if n is None:
                    return _json(404, {'hata': 'İş bulunamadı'})
                if yontem == 'GET':
                    return _json(200, veri['isler'][n])
                if yontem in ('PUT', 'PATCH', 'POST'):
                    yeni = temizle(json.loads(govde or b'{}'), veri['isler'][n])
                    veri['isler'][n] = yeni
                    yaz(veri)
                    return _json(200, yeni)
                if yontem == 'DELETE':
                    silinen = veri['isler'].pop(n)
                    yaz(veri)
                    return _json(200, {'silindi': silinen['id']})
        if parca == ['ice_aktar'] and yontem == 'POST':
            guncelle = (sorgu.get('guncelle') or ['0'])[0] == '1'
            sayfa = (sorgu.get('sayfa') or ['TAKİP'])[0]
            if not govde:
                return _json(400, {'hata': 'Dosya gelmedi'})
            try:
                return _json(200, ice_aktar(govde, guncelle, sayfa))
            except KeyError:
                adlar = xlsx_okuyucu.sayfa_adlari(io.BytesIO(govde))
                return _json(400, {'hata': '"%s" sayfası yok. Sayfalar: %s' % (sayfa, ', '.join(adlar)), 'sayfalar': adlar})
            except zipfile.BadZipFile:
                return _json(400, {'hata': 'Dosya .xlsx biçiminde değil'})
        if parca == ['disa_aktar.csv'] and yontem == 'GET':
            isveren = (sorgu.get('isveren') or [''])[0]
            return 200, csv_uret(isveren), 'text/csv; charset=utf-8'
        return _json(404, {'hata': 'Bilinmeyen istek: %s %s' % (yontem, yol)})
    except ValueError as e:
        return _json(400, {'hata': str(e)})

