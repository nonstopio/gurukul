/** What a toolbar can ask of a code field, whichever control is showing (the textarea fallback or CodeMirror). */
export interface CodeFieldHandle {
  /** The selection as offsets into the text. */
  getSelection: () => { start: number; end: number };
  /** Focuses the field and selects that range. */
  select: (start: number, end: number) => void;
}

export interface CodeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** A Gurukul code language (`CodeBlock.lang`) or `markdown`. Unknown languages stay plain text. */
  language: string;
  /** `code` is the dark listing look, `prose` the light writing look. */
  tone: 'code' | 'prose';
  /** Visible lines before the field scrolls. */
  rows: number;
  handleRef?: { current: CodeFieldHandle | null };
}
