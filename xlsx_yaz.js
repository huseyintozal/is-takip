'use strict';
/* Tarayıcıda .xlsx yazma (kütüphane yok): sıkıştırmasız zip + OOXML.
 *   xlsxYaz([{ ad, genislik: [..], satirlar: [[hücre..]..], birlestir: ['A1:E1'], yukseklik: { 1: 34 }, sekmeRengi: '0F766E',
 *              dondur: 5, veriCubugu: [{ ref: 'E6:E20', renk: 'F59E0B' }], grafik: { baslik, kategori: 'A6:A20', deger: 'E6:E20', etiketler, degerler, konum: [c1, r1, c2, r2], renk } }])
 * Hücre: düz değer (metin/sayı/Date/null) ya da { v, s } — s: stil adı (XLSX_STILLER) ya da stil nesnesi
 *   stil nesnesi: { b, i, sz, renk, dolgu, kenar: 'ince'|'yok'|'alt', fmt: 'para'|'tarih'|'sayi', hiza: 'left'|'center'|'right', sar } */

const XLSX_STILLER = {
  metin: { kenar: 'ince', sar: true },
  baslik: { b: true, renk: 'FFFFFF', dolgu: '0F766E', kenar: 'ince', hiza: 'center' },
  para: { fmt: 'para', kenar: 'ince' },
  tarih: { fmt: 'tarih', kenar: 'ince', hiza: 'center' },
  kalin: { b: true, kenar: 'ince', hiza: 'center' },
  kalinPara: { b: true, fmt: 'para', kenar: 'ince' },
};

function crc32(b) {
  let t = crc32.t;
  if (!t) { t = crc32.t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipYap(dosyalar) {           // [{ ad, veri: Uint8Array }] -> Uint8Array (stored)
  const te = new TextEncoder(); const parcalar = []; const merkez = []; let ofs = 0;
  for (const d of dosyalar) {
    const ad = te.encode(d.ad), crc = crc32(d.veri), n = d.veri.length;
    const y = new DataView(new ArrayBuffer(30));
    y.setUint32(0, 0x04034b50, true); y.setUint16(4, 20, true); y.setUint16(6, 0x0800, true);
    y.setUint32(14, crc, true); y.setUint32(18, n, true); y.setUint32(22, n, true); y.setUint16(26, ad.length, true);
    parcalar.push(new Uint8Array(y.buffer), ad, d.veri);
    const m = new DataView(new ArrayBuffer(46));
    m.setUint32(0, 0x02014b50, true); m.setUint16(4, 20, true); m.setUint16(6, 20, true); m.setUint16(8, 0x0800, true);
    m.setUint32(16, crc, true); m.setUint32(20, n, true); m.setUint32(24, n, true); m.setUint16(28, ad.length, true); m.setUint32(42, ofs, true);
    merkez.push(new Uint8Array(m.buffer), ad);
    ofs += 30 + ad.length + n;
  }
  const mBoy = merkez.reduce((t, p) => t + p.length, 0);
  const s = new DataView(new ArrayBuffer(22));
  s.setUint32(0, 0x06054b50, true); s.setUint16(8, dosyalar.length, true); s.setUint16(10, dosyalar.length, true);
  s.setUint32(12, mBoy, true); s.setUint32(16, ofs, true);
  const hepsi = [...parcalar, ...merkez, new Uint8Array(s.buffer)];
  const out = new Uint8Array(hepsi.reduce((t, p) => t + p.length, 0)); let p = 0;
  hepsi.forEach(x => { out.set(x, p); p += x.length; });
  return out;
}
const xmlKac = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const sutunHarf = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const excelTarih = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;

/* Stil nesnelerini styles.xml'e çevirir, her farklı stil için bir numara verir */
function stilKayit() {
  const fontlar = ['<font><sz val="11"/><name val="Calibri"/></font>'], dolgular = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const kenarlar = ['<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>',
    '<border><left/><right/><top/><bottom style="medium"><color rgb="FF0F766E"/></bottom><diagonal/></border>',
    '<border><left style="medium"><color rgb="FF0F766E"/></left><right/><top/><bottom/><diagonal/></border>'];
  const xf = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const harita = new Map();
  const bul = (dizi, x) => { let i = dizi.indexOf(x); if (i < 0) { dizi.push(x); i = dizi.length - 1; } return i; };
  return {
    no(st) {
      if (!st) return 0;
      if (typeof st === 'string') st = XLSX_STILLER[st] || {};
      const anahtar = JSON.stringify(st);
      if (harita.has(anahtar)) return harita.get(anahtar);
      const f = bul(fontlar, `<font>${st.b ? '<b/>' : ''}${st.i ? '<i/>' : ''}<sz val="${st.sz || 11}"/>${st.renk ? `<color rgb="FF${st.renk}"/>` : ''}<name val="Calibri"/></font>`);
      const d = st.dolgu ? bul(dolgular, `<fill><patternFill patternType="solid"><fgColor rgb="FF${st.dolgu}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const k = { ince: 1, alt: 2, sol: 3, yok: 0 }[st.kenar || 'yok'];
      const fmt = { para: 164, tarih: 165, sayi: 3, yuzde: 9 }[st.fmt] || 0;
      const hiza = st.hiza || st.sar || st.dikey !== false ? `<alignment${st.hiza ? ` horizontal="${st.hiza}"` : ''} vertical="center"${st.sar ? ' wrapText="1"' : ''}/>` : '';
      xf.push(`<xf numFmtId="${fmt}" fontId="${f}" fillId="${d}" borderId="${k}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${hiza}</xf>`);
      harita.set(anahtar, xf.length - 1);
      return xf.length - 1;
    },
    xml() {
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0 &quot;₺&quot;;[Red]-#,##0 &quot;₺&quot;"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy"/></numFmts>
<fonts count="${fontlar.length}">${fontlar.join('')}</fonts><fills count="${dolgular.length}">${dolgular.join('')}</fills><borders count="${kenarlar.length}">${kenarlar.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xf.length}">${xf.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    },
  };
}

function grafikXml(g, sayfaAdi) {
  const ref = r => `'${sayfaAdi.replace(/'/g, "''")}'!${r.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}`;
  const kat = g.etiketler.map((e, i) => `<c:pt idx="${i}"><c:v>${xmlKac(e)}</c:v></c:pt>`).join('');
  const deg = g.degerler.map((e, i) => `<c:pt idx="${i}"><c:v>${Number(e) || 0}</c:v></c:pt>`).join('');
  const yazi = (sz, b, renk = '374151') => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b ? 1 : 0}"><a:solidFill><a:srgbClr val="${renk}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="tr-TR"/></a:p></c:txPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="tr-TR" sz="1400" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>${xmlKac(g.baslik)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>
<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${xmlKac(g.seri || 'Kalan')}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="${g.renk || 'F59E0B'}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>
<c:dLbls><c:numFmt formatCode="#,##0 &quot;₺&quot;" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${yazi(900, true, '0F172A')}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>
<c:cat><c:strRef><c:f>${ref(g.kategori)}</c:f><c:strCache><c:ptCount val="${g.etiketler.length}"/>${kat}</c:strCache></c:strRef></c:cat>
<c:val><c:numRef><c:f>${ref(g.deger)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${g.degerler.length}"/>${deg}</c:numCache></c:numRef></c:val></c:ser>
<c:gapWidth val="45"/><c:axId val="11"/><c:axId val="12"/></c:barChart>
<c:catAx><c:axId val="11"/><c:scaling><c:orientation val="maxMin"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:solidFill><a:srgbClr val="D1D5DB"/></a:solidFill></a:ln></c:spPr>${yazi(1000, true)}<c:crossAx val="12"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
<c:valAx><c:axId val="12"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="t"/><c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="EEF0F3"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${yazi(900, false, '6B7280')}<c:crossAx val="11"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>
<c:spPr><a:noFill/></c:spPr></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>
<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
}

function xlsxYaz(sayfalar) {
  const te = new TextEncoder();
  const adlar = new Set();
  const sayfaAdi = a => { let s = String(a || 'Sayfa').replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sayfa'; let x = s, n = 2; while (adlar.has(x)) x = s.slice(0, 28) + ' ' + n++; adlar.add(x); return x; };
  const dosyalar = [];
  const ekle = (ad, metin) => dosyalar.push({ ad, veri: te.encode(metin) });
  const adList = sayfalar.map(s => sayfaAdi(s.ad));
  const stil = stilKayit();
  let grafikNo = 0; const ekTurler = [];
  const sayfaXmlleri = sayfalar.map((sf, i) => {
    const satirXml = sf.satirlar.map((satir, r) => {
      const yk = sf.yukseklik && sf.yukseklik[r + 1];
      return `<row r="${r + 1}"${yk ? ` ht="${yk}" customHeight="1"` : ''}>${(satir || []).map((h, c) => {
        if (h === null || h === undefined) return '';
        const o = (typeof h === 'object' && !(h instanceof Date)) ? h : { v: h };
        let v = o.v; const ref = sutunHarf(c) + (r + 1);
        let s = o.s !== undefined ? o.s : (v instanceof Date ? 'tarih' : typeof v === 'number' ? 'para' : 'metin');
        const sn = stil.no(s);
        if (v instanceof Date) v = excelTarih(v);
        if (v === null || v === undefined || v === '') return sn ? `<c r="${ref}" s="${sn}"/>` : '';
        return typeof v === 'number' ? `<c r="${ref}" s="${sn}"><v>${v}</v></c>` : `<c r="${ref}" s="${sn}" t="inlineStr"><is><t xml:space="preserve">${xmlKac(v)}</t></is></c>`;
      }).join('')}</row>`;
    }).join('');
    const cols = sf.genislik ? `<cols>${sf.genislik.map((g, k) => `<col min="${k + 1}" max="${k + 1}" width="${g}" customWidth="1"/>`).join('')}</cols>` : '';
    const dondur = sf.dondur ? `<pane ySplit="${sf.dondur}" topLeftCell="A${sf.dondur + 1}" activePane="bottomLeft" state="frozen"/>` : '';
    const birlestir = sf.birlestir && sf.birlestir.length ? `<mergeCells count="${sf.birlestir.length}">${sf.birlestir.map(r => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>` : '';
    const cubuk = (sf.veriCubugu || []).map((v, k) => `<conditionalFormatting sqref="${v.ref}"><cfRule type="dataBar" priority="${k + 1}"><dataBar><cfvo type="num" val="0"/><cfvo type="max"/><color rgb="FF${v.renk || 'F59E0B'}"/></dataBar></cfRule></conditionalFormatting>`).join('');
    let cizim = '';
    if (sf.grafik && sf.grafik.etiketler.length) {
      grafikNo++;
      const [c1, r1, c2, r2] = sf.grafik.konum;
      ekle(`xl/charts/chart${grafikNo}.xml`, grafikXml(sf.grafik, adList[i]));
      ekle(`xl/drawings/drawing${grafikNo}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>${c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${grafikNo + 1}" name="Grafik ${grafikNo}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`);
      ekle(`xl/drawings/_rels/drawing${grafikNo}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${grafikNo}.xml"/></Relationships>`);
      ekle(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${grafikNo}.xml"/></Relationships>`);
      ekTurler.push(`<Override PartName="/xl/charts/chart${grafikNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing${grafikNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      cizim = '<drawing r:id="rId1"/>';
    }
    const sekme = `<sheetPr>${sf.sekmeRengi ? `<tabColor rgb="FF${sf.sekmeRengi}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr>`;   // yazdırırken sayfa genişliğine sığdır
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${sekme}<sheetViews><sheetView workbookViewId="0"${sf.izgaraYok ? ' showGridLines="0"' : ''}${i === 0 ? ' tabSelected="1"' : ''}>${dondur}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18" customHeight="1"/>${cols}<sheetData>${satirXml}</sheetData>${birlestir}${cubuk}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${sf.yatay ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>${cizim}</worksheet>`;
  });
  sayfaXmlleri.forEach((x, i) => ekle(`xl/worksheets/sheet${i + 1}.xml`, x));
  ekle('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sayfalar.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${ekTurler.join('')}</Types>`);
  ekle('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  ekle('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${adList.map((a, i) => `<sheet name="${xmlKac(a)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  ekle('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sayfalar.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sayfalar.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  ekle('xl/styles.xml', stil.xml());
  return new Blob([zipYap(dosyalar)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function blobIndir(blob, ad) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = u; a.download = ad; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}
