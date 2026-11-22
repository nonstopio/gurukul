import { describe, expect, it } from 'vitest';
import { MAX_SOURCE_TEXT_CHARS } from '../src/bridge';
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  boundText,
  convertSource,
  convertedKind,
  csvCell,
  imageType,
} from '../src/sourceText';
import { docx, pdf, xlsx } from './support/officeFiles';

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

  it.each(['word', 'sheet', 'pdf'] as const)('rejects a damaged %s file', async (kind) => {
    await expect(convertSource(kind, Buffer.from('not a real file'))).rejects.toThrow();
  });

  it('rejects a file with no text in it', async () => {
    await expect(convertSource('word', await docx('', []))).rejects.toThrow('no text');
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
