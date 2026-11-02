/**
 * A small valid PDF made in the test, so no binary file is committed: one empty page. `padding`
 * adds a comment of that many bytes after the document, which a reader ignores, so a size can be
 * chosen without a second library.
 */
export function makePdf(options: { padding?: number } = {}): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const pad = options.padding ? `%${'x'.repeat(options.padding - 2)}\n` : '';
  return Buffer.from(body + pad, 'latin1');
}
