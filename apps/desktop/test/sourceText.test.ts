import { describe, expect, it } from 'vitest';
import { MAX_SOURCE_TEXT_CHARS } from '../src/bridge';
import {
  MAX_PDF_PAGES,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  boundText,
  convertSource,
  convertedKind,
  csvCell,
  imageType,
} from '../src/sourceText';
import { docx, pdf, pdfPages, xlsx } from './support/officeFiles';

describe('names', () => {
  it('tells the converter or picture type by extension, in any case', () => {
    expect(convertedKind('Plan.DOCX')).toBe('word');
    expect(convertedKind('Budget.xlsx')).toBe('sheet');
    expect(convertedKind('Slides.pdf')).toBe('pdf');
    expect(convertedKind('Old.xls')).toBeNull();
    expect(imageType('Shot.JPG')).toBe('image/jpeg');
    expect(imageType('a.png')).toBe('image/png');
    expect(imageType('a.svg')).toBeNull();
  });
});

describe('convertSource', () => {
  it('turns a Word file into Markdown', async () => {
    const text = await convertSource('word', await docx('Rebase', ['Rebase rewrites history.']));
    expect(text).toContain('# Rebase');
    expect(text).toContain('Rebase rewrites history');
  });

  it('writes each sheet under a heading as CSV, quoting commas, dates and gaps', async () => {
    const text = await convertSource(
      'sheet',
      await xlsx({
        Plan: [
          ['topic', 'a,b "c"'],
          [1, 2.5],
        ],
        Notes: [['only']],
      }),
    );
    expect(text).toBe('## Sheet: Plan\ntopic,"a,b ""c"""\n1,2.5\n\n## Sheet: Notes\nonly');
  });

  it('bounds the rows and columns of a sheet', async () => {
    const wide = Array.from({ length: MAX_SHEET_COLUMNS + 5 }, (_, i) => i);
    const rows = Array.from({ length: MAX_SHEET_ROWS + 3 }, () => wide);
    const text = await convertSource('sheet', await xlsx({ Big: rows }));
    const lines = text.split('\n');
    expect(lines).toHaveLength(1 + MAX_SHEET_ROWS + 1);
    expect(lines[1]?.split(',')).toHaveLength(MAX_SHEET_COLUMNS);
    expect(lines.at(-1)).toBe('(3 more rows)');
  });

  it('reads the text of a PDF', async () => {
    expect(await convertSource('pdf', pdf('Hello rebase'))).toContain('Hello rebase');
  });

  it('keeps the line breaks of a PDF', async () => {
    expect(await convertSource('pdf', pdf('first ) Tj 0 -30 Td (second'))).toBe('first\nsecond');
  });

  it.each(['word', 'sheet', 'pdf'] as const)('rejects a damaged %s file', async (kind) => {
    await expect(convertSource(kind, Buffer.from('not a real file'))).rejects.toThrow();
  });

  it('rejects a file with no text in it', async () => {
    await expect(convertSource('word', await docx('', []))).rejects.toThrow('no text');
  });
});

describe('resource limits', () => {
  /** The central directory header of the first entry, and the end record. */
  const headerAt = (zip: Buffer) => zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const eocdAt = (zip: Buffer) => zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));

  it.each(['word', 'sheet'] as const)(
    'refuses a %s file that declares a huge size',
    async (kind) => {
      const zip = kind === 'word' ? await docx('A', ['b']) : await xlsx({ S: [['a']] });
      zip.writeUInt32LE(0x7fffffff, headerAt(zip) + 24);
      await expect(convertSource(kind, zip)).rejects.toThrow('too much data');
      zip.writeUInt32LE(0xffffffff, headerAt(zip) + 24); // ZIP64 marker
      await expect(convertSource(kind, zip)).rejects.toThrow('too much data');
    },
  );

  it('refuses a file with too many entries or a directory that is not there', async () => {
    const zip = await docx('A', ['b']);
    zip.writeUInt16LE(10_001, eocdAt(zip) + 10);
    await expect(convertSource('word', zip)).rejects.toThrow('too many entries');
    zip.writeUInt16LE(3, eocdAt(zip) + 10);
    zip.writeUInt32LE(0, eocdAt(zip) + 16);
    await expect(convertSource('word', zip)).rejects.toThrow('bad directory');
  });

  it('stops a PDF at the page limit', async () => {
    const pages = Array.from({ length: MAX_PDF_PAGES + 1 }, (_, i) => `page${i + 1}x`);
    const text = await convertSource('pdf', pdfPages(pages));
    expect(text).toContain(`page${MAX_PDF_PAGES}x`);
    expect(text).not.toContain(`page${MAX_PDF_PAGES + 1}x`);
  });

  it('stops a PDF once it has more text than is kept', async () => {
    // text that runs off the page is dropped, so every piece goes back to the start.
    const big = `${'abcd ) Tj 1 0 0 1 20 100 Tm ('.repeat(MAX_SOURCE_TEXT_CHARS * 0.15)}end`;
    const text = await convertSource('pdf', pdfPages([big, big, 'lastpage']));
    expect(text.length).toBeGreaterThan(MAX_SOURCE_TEXT_CHARS);
    expect(text).not.toContain('lastpage');
  });
});

describe('csvCell', () => {
  it('writes dates as days, gaps as nothing and quotes what needs it', () => {
    expect(csvCell(new Date('2026-03-04T10:00:00Z'))).toBe('2026-03-04');
    expect(csvCell(null)).toBe('');
    expect(csvCell(true)).toBe('true');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });
});

describe('boundText', () => {
  it('keeps short text and cuts long text with a note', () => {
    expect(boundText('short')).toBe('short');
    const cut = boundText('a'.repeat(MAX_SOURCE_TEXT_CHARS + 10));
    expect(cut.startsWith('a'.repeat(MAX_SOURCE_TEXT_CHARS))).toBe(true);
    expect(cut).toContain('left out');
    expect(boundText('a'.repeat(MAX_SOURCE_TEXT_CHARS))).toHaveLength(MAX_SOURCE_TEXT_CHARS);
  });
});
