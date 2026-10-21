'use strict';
/* Tarayıcıda .xlsx okuma (kütüphane yok). Zip'i açar (DecompressionStream), sayfa XML'ini okur.
 *   await xlsxSayfaAdlari(arrayBuffer) -> ['TAKİP', ...]
 *   await xlsxSayfaOku(arrayBuffer, 'TAKİP') -> [[hücre, ...], ...]   (boş satırlar atlanır) */

function zipGirdileri(buf) {
  const v = new DataView(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Dosya .xlsx biçiminde değil');
  const adet = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const girdiler = {};
  const td = new TextDecoder();
  for (let n = 0; n < adet; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const yontem = v.getUint16(p + 10, true), sikisik = v.getUint32(p + 20, true);
    const adUz = v.getUint16(p + 28, true), ekUz = v.getUint16(p + 30, true), yorumUz = v.getUint16(p + 32, true);
    const yerel = v.getUint32(p + 42, true);
    const ad = td.decode(new Uint8Array(buf, p + 46, adUz));
    girdiler[ad] = { yontem, sikisik, yerel };
    p += 46 + adUz + ekUz + yorumUz;
  }
  return girdiler;
}
async function zipOku(buf, girdiler, ad) {
  const g = girdiler[ad];
  if (!g) return null;
  const v = new DataView(buf);
  const bas = g.yerel + 30 + v.getUint16(g.yerel + 26, true) + v.getUint16(g.yerel + 28, true);
  const veri = new Uint8Array(buf, bas, g.sikisik);
  if (g.yontem === 0) return new TextDecoder().decode(veri);
  if (g.yontem !== 8) throw new Error('Desteklenmeyen sıkıştırma');
  const akis = new Blob([veri]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(akis).text();
}
const xmlAyristir = s => new DOMParser().parseFromString(s, 'application/xml');
const xmlAd = el => el.localName;
function xmlAltlar(kok, ad) { return [...kok.getElementsByTagName('*')].filter(e => xmlAd(e) === ad); }

async function xlsxKitap(buf) {
  const g = zipGirdileri(buf);
  const kitap = xmlAyristir(await zipOku(buf, g, 'xl/workbook.xml'));
  const iliski = xmlAyristir(await zipOku(buf, g, 'xl/_rels/workbook.xml.rels'));
  const hedef = {};
  xmlAltlar(iliski, 'Relationship').forEach(r => { hedef[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const sayfalar = {};
  xmlAltlar(kitap, 'sheet').forEach(s => {
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
    let t = (hedef[rid] || '').replace(/^\//, '');
    if (!t.startsWith('xl/')) t = 'xl/' + t;
    sayfalar[s.getAttribute('name')] = t;
  });
  return { g, sayfalar };
}
async function xlsxSayfaAdlari(buf) { return Object.keys((await xlsxKitap(buf)).sayfalar); }

async function xlsxSayfaOku(buf, sayfaAdi = 'TAKİP') {
  const { g, sayfalar } = await xlsxKitap(buf);
  let ad = sayfaAdi in sayfalar ? sayfaAdi
    : Object.keys(sayfalar).find(k => k.trim().toLocaleUpperCase('tr') === sayfaAdi.trim().toLocaleUpperCase('tr'));
  if (!ad) { const e = new Error(`"${sayfaAdi}" sayfası yok. Sayfalar: ${Object.keys(sayfalar).join(', ')}`); e.sayfalar = Object.keys(sayfalar); throw e; }
  const ssMetin = await zipOku(buf, g, 'xl/sharedStrings.xml');
  const ss = ssMetin ? xmlAltlar(xmlAyristir(ssMetin), 'si').map(si => xmlAltlar(si, 't').map(t => t.textContent).join('')) : [];
  const doc = xmlAyristir(await zipOku(buf, g, sayfalar[ad]));
  const sutunNo = ref => { let n = 0; for (const c of ref.match(/[A-Z]+/)[0]) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
  const satirlar = [];
  xmlAltlar(doc, 'row').forEach(r => {
    const hucreler = {};
    xmlAltlar(r, 'c').forEach(c => {
      const tur = c.getAttribute('t');
      const vEl = xmlAltlar(c, 'v')[0];
      let d;
      if (tur === 'inlineStr') d = xmlAltlar(c, 't').map(t => t.textContent).join('');
      else if (!vEl) return;
      else if (tur === 's') d = ss[+vEl.textContent];
      else if (tur === 'str' || tur === 'e') d = vEl.textContent;
      else if (tur === 'b') d = vEl.textContent === '1';
      else { const x = Number(vEl.textContent); d = Number.isNaN(x) ? vEl.textContent : x; }
      if (typeof d === 'string' && !d.trim()) return;
      hucreler[sutunNo(c.getAttribute('r'))] = d;
    });
    const anahtarlar = Object.keys(hucreler).map(Number);
    if (!anahtarlar.length) return;
    const satir = new Array(Math.max(...anahtarlar) + 1).fill(null);
    anahtarlar.forEach(k => { satir[k] = hucreler[k]; });
    satirlar.push(satir);
  });
  return satirlar;
}
