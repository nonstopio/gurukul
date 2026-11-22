import path from 'node:path';
import mammoth from 'mammoth';
import readXlsxFile from 'read-excel-file/node';
import { extractText, getDocumentProxy } from 'unpdf';
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
 * The text of a Word, Excel or PDF file. Rejects when the file is damaged, protected or has no
 * text; the caller turns that into one fixed sentence, so nothing of the library's message (which
 * may name content) goes further.
 */
export async function convertSource(kind: ConvertedKind, bytes: Buffer): Promise<string> {
  let text: string;
  if (kind === 'word') text = (await toMarkdown({ buffer: bytes })).value;
  else if (kind === 'sheet') text = await sheetText(bytes);
  else {
    const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
    text = (await extractText(pdf, { mergePages: true })).text;
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
