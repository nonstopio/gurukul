import JSZip from 'jszip';

/** Tiny real Word, Excel and PDF files, built in the test with invented content. */

const zip = async (files: Record<string, string>): Promise<Buffer> => {
  const z = new JSZip();
  for (const [name, body] of Object.entries(files)) z.file(name, body);
  return z.generateAsync({ type: 'nodebuffer' });
};

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** A Word file with one heading and the given paragraphs. */
export function docx(heading: string, paragraphs: string[]): Promise<Buffer> {
  const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const p = (text: string, style?: string) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;
  return zip({
    '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': `${XML}<w:document xmlns:w="${w}"><w:body>${p(heading, 'Heading1')}${paragraphs.map((t) => p(t)).join('')}</w:body></w:document>`,
  });
}

/** An Excel file with these sheets, each a list of rows of strings and numbers. */
export function xlsx(sheets: Record<string, (string | number)[][]>): Promise<Buffer> {
  const names = Object.keys(sheets);
  const cell = (v: string | number, r: number, c: number) => {
    const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
    return typeof v === 'number'
      ? `<c r="${ref}"><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
  };
  const sheetXml = (rows: (string | number)[][]) =>
    `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r, c)).join('')}</row>`)
      .join('')}</sheetData></worksheet>`;
  const files: Record<string, string> = {
    '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
  };
  names.forEach((n, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheets[n] as (string | number)[][]);
  });
  return zip(files);
}

/** A one-page PDF that says `text` (letters, digits and spaces only). */
export function pdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
