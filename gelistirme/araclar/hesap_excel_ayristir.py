# Firma hesap Excel'lerini (TARİH | RAPOR BİLGİLERİ | RAPOR BEDELİ | ALINAN) mali_aktar.json'a çevirir
import openpyxl, sys, glob, os, re, json, datetime
kok = sys.argv[1]; cikti = sys.argv[2]
def tarih(v, onceki):
    if isinstance(v, datetime.datetime): return v.date().isoformat()
    if isinstance(v, str):
        m = re.match(r'\s*(\d{1,2})[,./](\d{1,2})[,./](\d{4})', v)
        if m: return f'{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}'
    return onceki
def sayi(v):
    if v is None or v == '': return 0
    if isinstance(v, (int, float)): return float(v)
    s = str(v).replace('.', '').replace(',', '.').strip()
    try: return float(s)
    except: return None
def is_ayir(t):
    t = re.sub(r'\s+', ' ', t).strip()
    m = re.match(r'^(.*?)\s*(\d+)\s*ADA\s*([\d\-/() ]+?)\s*PARSEL\s*(.*)$', t, re.I)
    if m: on, ada, parsel, son = m.groups()
    else:
        m = re.match(r'^(.*?)\s*(\d+)\s*PARSEL\s*(.*)$', t, re.I)
        if not m: return None
        on, parsel, son = m.groups(); ada = ''
    on = re.sub(r'\bMAH(ALLESİ)?\b\.?', '', on, flags=re.I).strip(' .')
    son = re.sub(r'^MAH\.?\s+', '', son.strip(), flags=re.I)
    not_ = ''
    m2 = re.search(r'\((?:R\+Z|Z|R)\)', son)
    if m2: not_ = m2.group(0); son = son.replace(m2.group(0), '')
    for k in ['paletli makinayla yapıldı', 'bina içi sondaj yapıldı']:
        if k.lower() in son.lower(): not_ = (not_ + ' ' + k).strip(); son = re.sub(re.escape(k), '', son, flags=re.I)
    m3 = re.search(r'\(.*\)$', son.strip())
    if m3: not_ = (not_ + ' ' + m3.group(0)).strip(); son = son[:m3.start()]
    return {'mahalle': on.upper(), 'ada': ada.strip(), 'parsel': parsel.replace(' ', ''), 'mal_sahibi': son.strip(' .').upper(), 'not': not_}
def yontem(t):
    u = t.upper()
    if 'ÇEK' in u: return 'cek'
    if 'NAKİT' in u or 'ELDEN' in u: return 'nakit'
    if 'HAVALE' in u or 'HESAB' in u or 'GELDİ' in u or 'ATTI' in u: return 'havale'
    return ''
firmalar = []
for klasor in sorted(os.listdir(kok)):
    yol = os.path.join(kok, klasor)
    if not os.path.isdir(yol): continue
    dosyalar = sorted(glob.glob(os.path.join(yol, '*.xlsx')), key=lambda f: (' - 2' in f, f))
    firma = {'klasor': klasor, 'dosyalar': [], 'satirlar': [], 'excel_borc': None, 'uyarilar': []}
    onceki_borc = None
    for f in dosyalar:
        ws = openpyxl.load_workbook(f, data_only=True).worksheets[0]
        satirlar = list(ws.iter_rows(values_only=True))
        firma['dosyalar'].append(os.path.basename(f))
        son_tarih = None; borc = None
        for n, r in enumerate(satirlar[1:], start=2):
            r = list(r) + [None] * 5
            t, bilgi, bedel, alinan, ek = r[0], r[1], r[2], r[3], r[4]
            if bedel == 'BORÇ': borc = sayi(alinan); continue
            if isinstance(bedel, str) or bilgi is None and bedel is None and alinan is None: continue
            if bilgi is None and isinstance(bedel, (int, float)) and isinstance(alinan, (int, float)): continue   # toplam satırı
            bilgi = str(bilgi or '').strip(); son_tarih = tarih(t, son_tarih)
            b, a = sayi(bedel), sayi(alinan)
            kayit = {'dosya': os.path.basename(f), 'satir': n, 'tarih': son_tarih, 'metin': bilgi, 'ek_not': str(ek or '').strip()}
            if bilgi.upper().startswith('ESKİ HESAPTAN KALAN'):
                if onceki_borc is not None:      # devam dosyası: önceki dosyanın borcu, tekrar sayma
                    deger = (b or 0) - (a or 0)
                    if abs(deger - onceki_borc) > 0.5: firma['uyarilar'].append(f'{os.path.basename(f)}: eski hesaptan kalan {deger:,.0f} ama önceki dosyanın borcu {onceki_borc:,.0f}')
                    continue
                if b: firma['satirlar'].append(dict(kayit, tur='devir', tutar=b))
                if a: firma['satirlar'].append(dict(kayit, tur='onceden_odeme', tutar=a))
                continue
            if b:
                ayr = is_ayir(bilgi)
                firma['satirlar'].append(dict(kayit, tur='is', bedel=b, alinan=a or 0, **(ayr or {'mahalle': '', 'ada': '', 'parsel': '', 'mal_sahibi': bilgi.upper(), 'not': ''}), ayrisamadi=not ayr))
            elif a:
                firma['satirlar'].append(dict(kayit, tur='odeme', tutar=a, yontem=yontem(bilgi)))
        onceki_borc = borc
        firma['excel_borc'] = borc
    # hesap kontrolü
    hesap = sum(s.get('bedel', 0) for s in firma['satirlar'] if s['tur'] == 'is') + sum(s['tutar'] for s in firma['satirlar'] if s['tur'] == 'devir') \
        - sum(s.get('alinan', 0) for s in firma['satirlar'] if s['tur'] == 'is') - sum(s['tutar'] for s in firma['satirlar'] if s['tur'] in ('odeme', 'onceden_odeme'))
    firma['hesap_borc'] = hesap
    if firma['excel_borc'] is not None and abs(hesap - firma['excel_borc']) > 0.5: firma['uyarilar'].append(f'Hesaplanan borç {hesap:,.0f}, Excel\'deki BORÇ {firma["excel_borc"]:,.0f}')
    firmalar.append(firma)
json.dump({'tur': 'is-takip-mali-aktar', 'surum': 1, 'firmalar': firmalar}, open(cikti, 'w'), ensure_ascii=False, indent=1)
for f in firmalar:
    print(f"{f['klasor']:28} işler {sum(1 for s in f['satirlar'] if s['tur']=='is'):3}  ödeme {sum(1 for s in f['satirlar'] if s['tur']=='odeme'):2}  hesap {f['hesap_borc']:>12,.0f}  excel {f['excel_borc'] or 0:>12,.0f}  {f['uyarilar']}")
    for s in f['satirlar']:
        if s['tur']=='is' and (s['ayrisamadi'] or not s['mal_sahibi'] or not s['ada']): print('    ?', s['metin'], '->', s['ada'], s['parsel'], s['mal_sahibi'])
