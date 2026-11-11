// Baut docs/Rechnungsvorlage-Beispiel.docx aus Briefpapier.dotx.
// Aufruf: node build-template.js <Briefpapier.dotx> <Ziel.docx> <pfad/zu/pizzip>
const fs = require('fs');
const [, , src, dest, pizzipPath] = process.argv;
const PizZip = require(require('path').resolve(pizzipPath));

const zip = new PizZip(fs.readFileSync(src));

// .dotx → .docx: Inhaltstyp des Hauptdokuments umstellen, Papierkorb-Einträge entfernen
let ct = zip.file('[Content_Types].xml').asText();
ct = ct.replace('wordprocessingml.template.main+xml', 'wordprocessingml.document.main+xml');
zip.file('[Content_Types].xml', ct);
Object.keys(zip.files)
  .filter((n) => n.startsWith('[trash]'))
  .forEach((n) => zip.remove(n));

// Briefpapier-Bild durch Variante mit transparentem Hintergrund ersetzen: Das Original ist ein
// deckend weißes A4-Bild "hinter dem Text". Die Online-PDF-Konvertierung zeichnet es über den Text
// und verdeckt damit den gesamten Inhalt. Erzeugt mit docs/make-transparent.py.
const transparent = require('path').join(__dirname, 'briefpapier-hintergrund.png');
if (fs.existsSync(transparent)) {
  const rels = zip.file('word/_rels/header1.xml.rels').asText();
  const m = /Target="media\/([^"]+\.png)"/.exec(rels);
  if (m) zip.file(`word/media/${m[1]}`, fs.readFileSync(transparent));
}

const doc = zip.file('word/document.xml').asText();
const open = doc.substring(0, doc.indexOf('<w:body>') + '<w:body>'.length);
const sectPr = doc.substring(doc.indexOf('<w:sectPr'), doc.indexOf('</w:body>'))
  // mehr Platz oben (Logo) und unten (Fußzeile des Briefpapiers)
  .replace(/<w:pgMar [^>]*\/>/, '<w:pgMar w:top="2268" w:right="1440" w:bottom="1985" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>');

const TEXT = 9026;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function r(text, o = {}) {
  const rPr =
    (o.bold ? '<w:b/>' : '') +
    (o.color ? `<w:color w:val="${o.color}"/>` : '') +
    (o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : '');
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}
function p(runs, o = {}) {
  const pPr =
    `<w:pPr>${o.keepNext ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.before || 0}" w:after="${o.after === undefined ? 80 : o.after}" w:line="259" w:lineRule="auto"/>` +
    `<w:ind w:left="0" w:hanging="0"/><w:jc w:val="${o.align || 'left'}"/></w:pPr>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}
function tc(width, content, o = {}) {
  const shd = o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shd}<w:vAlign w:val="top"/></w:tcPr>${content}</w:tc>`;
}
function table(widths, rows) {
  const tblPr =
    // Reihenfolge laut Schema: tblW, tblBorders, tblLayout, tblCellMar (Online-Konvertierung ist streng)
    `<w:tblPr><w:tblW w:w="${TEXT}" w:type="dxa"/>` +
    '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:right w:val="nil"/>' +
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E0E0E0"/><w:insideV w:val="nil"/></w:tblBorders>' +
    '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>';
  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  return `<w:tbl>${tblPr}${grid}${rows.join('')}</w:tbl>`;
}
const cellP = (text, align, o = {}) => p(r(text, { size: 18, ...o }), { align, after: 0 });
function headRow(widths, labels, aligns) {
  return `<w:tr><w:trPr><w:tblHeader/></w:trPr>${widths.map((w, i) => tc(w, cellP(labels[i], aligns[i], { bold: true }), { fill: 'F2F2F2' })).join('')}</w:tr>`;
}
// Schleifenzeile: {#positionen} in der ersten, {/positionen} in der letzten Zelle
function loopRow(widths, fields, aligns) {
  const cells = widths.map((w, i) => {
    let text = `{${fields[i]}}`;
    if (i === 0) text = `{#positionen}${text}`;
    if (i === widths.length - 1) text = `${text}{/positionen}`;
    return tc(w, cellP(text, aligns[i], i === 0 ? { bold: true } : {}));
  });
  return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join('')}</w:tr>`;
}

const body = [];
// Empfänger
body.push(p(r('{kundenname}', { bold: true }), { after: 0 }));
body.push(p(r('{kundenadresse}'), { after: 0 }));
body.push(p(r('Kundennummer {kundennummer}', { color: '616161', size: 20 }), { after: 480 }));
// Titel und Bezug
body.push(p(r('{titel}', { bold: true, size: 36 }), { after: 60, keepNext: true }));
body.push(p(r('zu Rechnung {rechnungsnummer} vom {rechnungsdatum}'), { after: 360 }));

// Variante mit Kosten
const wK = [2826, 1150, 1150, 800, 700, 1150, 1250];
const aK = ['left', 'left', 'left', 'right', 'right', 'right', 'right'];
body.push(p(r('{#mitKosten}'), { after: 0 }));
body.push(
  table(wK, [
    headRow(wK, ['Position', 'Von', 'Bis', 'Monate', 'Menge', 'Jahrespreis', 'Betrag'], aK),
    loopRow(wK, ['bezeichnung', 'von', 'bis', 'monate', 'menge', 'einzelpreis', 'betrag'], aK)
  ])
);
// Summen rechtsbündig
const wS = [6526, 2500];
const sumRow = (label, value, bold) =>
  `<w:tr>${tc(wS[0], cellP(label, 'right', { bold }))}${tc(wS[1], cellP(value, 'right', { bold }))}</w:tr>`;
body.push(
  table(wS, [sumRow('Summe netto', '{summeNetto}'), sumRow('USt. {ustSatz} %', '{ust}'), sumRow('Gesamt brutto', '{summeBrutto}', true)])
    .replace('<w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>', '<w:bottom w:val="nil"/>')
    .replace('<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E0E0E0"/>', '<w:insideH w:val="nil"/>')
);
body.push(p(r('{/mitKosten}'), { after: 0 }));

// Variante ohne Kosten
const wO = [4826, 1000, 1600, 1600];
const aO = ['left', 'center', 'left', 'left'];
body.push(p(r('{^mitKosten}'), { after: 0 }));
body.push(
  table(wO, [
    headRow(wO, ['Position', 'Menge', 'Von', 'Bis'], aO),
    loopRow(wO, ['bezeichnung', 'menge', 'von', 'bis'], aO)
  ])
);
body.push(p(r('{/mitKosten}'), { after: 0 }));

// Zeitleiste
body.push(p(r('Zeitleiste', { bold: true, size: 24 }), { before: 360, after: 120, keepNext: true }));
body.push(p(r('{@zeitleiste}'), { after: 0 }));
body.push(
  p(r('Diese Aufstellung ist eine Beilage zur Rechnung {rechnungsnummer}.', { color: '616161', size: 18 }), { before: 360, after: 0 })
);

zip.file('word/document.xml', `${open}${body.join('')}${sectPr}</w:body></w:document>`);
// Ordner-Einträge entfernen: Cloud-Dienste (Office Online, Graph-PDF) lehnen solche Pakete ab
Object.keys(zip.files)
  .filter((n) => zip.files[n].dir)
  .forEach((n) => delete zip.files[n]);
fs.writeFileSync(dest, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('geschrieben:', dest);
