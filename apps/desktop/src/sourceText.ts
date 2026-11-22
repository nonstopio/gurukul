import path from 'node:path';
import mammoth from 'mammoth';
import readXlsxFile from 'read-excel-file/node';
import { getDocumentProxy } from 'unpdf';
import { MAX_SOURCE_TEXT_CHARS, type SOURCE_IMAGE_MIME_TYPES } from './bridge';

/**
 * What the agent can read from the Sources folder besides plain text (`sources.read`): Word,
 * Excel and PDF are turned into text here, in the main process; pictures are handed on as they
 * are (`sources.readImage`). Nothing here logs a name or a byte of content.
 */

/** The converted file types, lower case. `.xls` is not read: its format needs a heavier library. */
export const SOURCE_WORD_EXTENSIONS: readonly string[] = ['.docx'];
export const SOURCE_SHEET_EXTENSIONS: readonly string[] = ['.xlsx'];
export const SOURCE_PDF_EXTENSIONS: readonly string[] = ['.pdf'];
/** Picture types and the media type each is sent as. */
export const SOURCE_IMAGE_TYPES: Readonly<
  Record<string, (typeof SOURCE_IMAGE_MIME_TYPES)[number]>
> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** Most rows and columns of one sheet that are written out. */
export const MAX_SHEET_ROWS = 2000;
export const MAX_SHEET_COLUMNS = 50;

/** Most pages of a PDF read, and most entries and declared uncompressed bytes of a Word or Excel file. */
export const MAX_PDF_PAGES = 500;
export const MAX_ZIP_ENTRIES = 10_000;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

export type ConvertedKind = 'word' | 'sheet' | 'pdf';

/** Which converter a file name needs, or null for any other type. */
export function convertedKind(name: string): ConvertedKind | null {
  const ext = path.extname(name).toLowerCase();
  if (SOURCE_WORD_EXTENSIONS.includes(ext)) return 'word';
  if (SOURCE_SHEET_EXTENSIONS.includes(ext)) return 'sheet';
  if (SOURCE_PDF_EXTENSIONS.includes(ext)) return 'pdf';
  return null;
}

/** The picture's media type, or null when the name is not a picture type. */
export function imageType(name: string): (typeof SOURCE_IMAGE_MIME_TYPES)[number] | null {
  return SOURCE_IMAGE_TYPES[path.extname(name).toLowerCase()] ?? null;
}

// Mammoth's own typings leave `convertToMarkdown` out; it is in the library (headings as `#`).
const toMarkdown = (
  mammoth as unknown as {
    convertToMarkdown(input: { buffer: Buffer }): Promise<{ value: string }>;
  }
).convertToMarkdown;

export const csvCell = (value: unknown): string => {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** Every sheet as `## Sheet: name` and CSV rows, bounded by `MAX_SHEET_ROWS` and `MAX_SHEET_COLUMNS`. */
async function sheetText(bytes: Buffer): Promise<string> {
  const sheets = await readXlsxFile(bytes);
  return sheets
    .map(({ sheet, data }) => {
      const rows = data
        .slice(0, MAX_SHEET_ROWS)
        .map((row) => row.slice(0, MAX_SHEET_COLUMNS).map(csvCell).join(','));
      const more =
        data.length > MAX_SHEET_ROWS ? [`(${data.length - MAX_SHEET_ROWS} more rows)`] : [];
      return [`## Sheet: ${sheet}`, ...rows, ...more].join('\n');
    })
    .join('\n\n');
}

/**
 * Throws when a Word or Excel file (a ZIP) declares more entries or more uncompressed bytes than
 * is sane, so a small "bomb" never reaches the library. Reads only the central directory. A
 * ZIP64 size reads as 0xFFFFFFFF, which is over the cap too.
 * ponytail: a file can declare less than it expands to. Upgrade path: run the conversion in a
 * worker thread or `utilityProcess` with `resourceLimits` and a timeout.
 */
function checkZip(bytes: Buffer): void {
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip');
  const count = bytes.readUInt16LE(eocd + 10);
  if (count > MAX_ZIP_ENTRIES) throw new Error('too many entries');
  let at = bytes.readUInt32LE(eocd + 16);
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(at) !== 0x02014b50) throw new Error('bad directory');
    total += bytes.readUInt32LE(at + 24);
    if (total > MAX_ZIP_UNCOMPRESSED_BYTES) throw new Error('too much data');
    at +=
      46 + bytes.readUInt16LE(at + 28) + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
  }
}

/** A PDF's text, page by page, stopping at `MAX_PDF_PAGES` or once there is more than `MAX_SOURCE_TEXT_CHARS`. */
async function pdfText(bytes: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  const pages: string[] = [];
  let length = 0;
  for (
    let n = 1;
    n <= Math.min(pdf.numPages, MAX_PDF_PAGES) && length < MAX_SOURCE_TEXT_CHARS;
    n++
  ) {
    const content = await (await pdf.getPage(n)).getTextContent();
    // Without `includeMarkedContent` every item is a text item.
    const text = (content.items as { str: string; hasEOL: boolean }[])
      .map((item) => item.str + (item.hasEOL ? '\n' : ''))
      .join('');
    pages.push(text);
    length += text.length;
  }
  // The same tidy-up unpdf's `mergePages` does: one space, at most one blank line.
  return pages
    .join('\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * The text of a Word, Excel or PDF file. Rejects when the file is damaged, protected or has no
 * text; the caller turns that into one fixed sentence, so nothing of the library's message (which
 * may name content) goes further.
 */
export async function convertSource(kind: ConvertedKind, bytes: Buffer): Promise<string> {
  let text: string;
  if (kind === 'pdf') text = await pdfText(bytes);
  else {
    checkZip(bytes);
    text = kind === 'word' ? (await toMarkdown({ buffer: bytes })).value : await sheetText(bytes);
  }
  if (text.trim() === '') throw new Error('no text');
  return text;
}

/** `text` cut to `MAX_SOURCE_TEXT_CHARS` with a note saying so. */
export function boundText(text: string): string {
  return text.length <= MAX_SOURCE_TEXT_CHARS
    ? text
    : `${text.slice(0, MAX_SOURCE_TEXT_CHARS)}\n\n[The rest of this file was left out: it has more text than can be read.]`;
}
