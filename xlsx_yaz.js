'use strict';
/* Tarayıcıda .xlsx yazma (kütüphane yok): sıkıştırmasız zip + en sade OOXML.
 *   const blob = xlsxYaz([{ ad: 'Sayfa', genislik: [12, 50], satirlar: [[{ v: 'Başlık', s: 'baslik' }, 123, new Date()]] }])
 * Hücre: düz değer (metin/sayı/Date/null) ya da { v, s } — s: 'baslik' | 'para' | 'kalin' | 'kalinPara' | 'tarih' | 'metin' */

const XLSX_STIL = { metin: 1, baslik: 2, para: 3, tarih: 4, kalin: 5, kalinPara: 6 };

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
    y.setUint32(0, 0x04034b50, true); y.setUint16(4, 20, true); y.setUint16(6, 0x0800, true); y.setUint16(8, 0, true);
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

function xlsxYaz(sayfalar) {
  const te = new TextEncoder();
  const adlar = new Set();
  const sayfaAdi = a => { let s = String(a || 'Sayfa').replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sayfa'; let x = s, n = 2; while (adlar.has(x)) x = s.slice(0, 28) + ' ' + n++; adlar.add(x); return x; };
  const dosyalar = [];
  const ekle = (ad, metin) => dosyalar.push({ ad, veri: te.encode(metin) });
  const adList = sayfalar.map(s => sayfaAdi(s.ad));
  ekle('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sayfalar.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  ekle('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  ekle('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${adList.map((a, i) => `<sheet name="${xmlKac(a)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  ekle('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sayfalar.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sayfalar.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  const kenar = '<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border>';
  ekle('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0 &quot;TL&quot;"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${kenar}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  sayfalar.forEach((sf, i) => {
    const satirXml = sf.satirlar.map((satir, r) => `<row r="${r + 1}">${satir.map((h, c) => {
      if (h === null || h === undefined || h === '') return '';
      const o = (h && typeof h === 'object' && !(h instanceof Date)) ? h : { v: h };
      let v = o.v; const ref = sutunHarf(c) + (r + 1);
      let stil = o.s ? XLSX_STIL[o.s] : (v instanceof Date ? XLSX_STIL.tarih : typeof v === 'number' ? XLSX_STIL.para : XLSX_STIL.metin);
      if (v instanceof Date) { v = excelTarih(v); if (!o.s) stil = XLSX_STIL.tarih; }
      if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${stil}"/>`;
      return typeof v === 'number' ? `<c r="${ref}" s="${stil}"><v>${v}</v></c>` : `<c r="${ref}" s="${stil}" t="inlineStr"><is><t xml:space="preserve">${xmlKac(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const cols = sf.genislik ? `<cols>${sf.genislik.map((g, k) => `<col min="${k + 1}" max="${k + 1}" width="${g}" customWidth="1"/>`).join('')}</cols>` : '';
    ekle(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${satirXml}</sheetData></worksheet>`);
  });
  return new Blob([zipYap(dosyalar)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function blobIndir(blob, ad) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = u; a.download = ad; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}
