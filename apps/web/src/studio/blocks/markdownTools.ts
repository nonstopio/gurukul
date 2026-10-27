/** A new text value and where the selection sits in it. */
export interface TextEdit {
  text: string;
  start: number;
  end: number;
}

/**
 * Wraps the selection in `before` and `after`. With nothing selected it inserts `placeholder`
 * between them and selects it, so typing replaces it.
 */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): TextEdit {
  const inner = start === end ? placeholder : text.slice(start, end);
  const next = text.slice(0, start) + before + inner + after + text.slice(end);
  return { text: next, start: start + before.length, end: start + before.length + inner.length };
}

export const bold = (text: string, start: number, end: number): TextEdit =>
  wrapSelection(text, start, end, '**', '**', 'bold text');

export const italic = (text: string, start: number, end: number): TextEdit =>
  wrapSelection(text, start, end, '*', '*', 'italic text');

export const inlineCode = (text: string, start: number, end: number): TextEdit =>
  wrapSelection(text, start, end, '`', '`', 'code');

/** Turns the selection into a link's label and selects the address placeholder to type over. */
export function link(text: string, start: number, end: number): TextEdit {
  const label = start === end ? 'link text' : text.slice(start, end);
  const url = 'https://';
  const next = `${text.slice(0, start)}[${label}](${url})${text.slice(end)}`;
  const urlStart = start + label.length + 3;
  return { text: next, start: urlStart, end: urlStart + url.length };
}

/** Numbers every line the selection touches (`1. `, `2. `, ...) and selects those lines. */
export function numberedList(text: string, start: number, end: number): TextEdit {
  const lineStart = text.slice(0, start).lastIndexOf('\n') + 1;
  const nextBreak = text.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const numbered = lines.map((line, i) => `${i + 1}. ${line}`).join('\n');
  return {
    text: text.slice(0, lineStart) + numbered + text.slice(lineEnd),
    start: lineStart,
    end: lineStart + numbered.length,
  };
}
