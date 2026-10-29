import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { Annotation, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { Field } from '@gurukul/ui';
import { useId, useLayoutEffect, useRef } from 'react';
import type { CodeFieldProps } from './codeFieldTypes';

const LANGUAGES: Record<string, () => Extension> = {
  markdown: () => markdown(),
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  json: () => json(),
  python: () => python(),
  java: () => java(),
  html: () => html(),
  css: () => css(),
  sql: () => sql(),
  yaml: () => yaml(),
};

/** Marks a change that came from the `value` prop, so it is not reported back as an edit. */
const fromProp = Annotation.define<boolean>();

function themeFor(tone: 'code' | 'prose', rows: number): Extension {
  const code = tone === 'code';
  return EditorView.theme(
    {
      '&': {
        backgroundColor: code ? 'var(--code-bg)' : 'var(--surface)',
        color: code ? 'var(--code-text)' : 'var(--text)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
      },
      '&.cm-focused': { outline: 'none', boxShadow: 'var(--focus-ring)' },
      '.cm-scroller': {
        fontFamily: code ? 'var(--font-mono)' : 'var(--font-ui)',
        fontSize: 'var(--text-md)',
        lineHeight: '1.5',
        minHeight: `${rows * 1.5}em`,
        maxHeight: `${rows * 2.5}em`,
        overflow: 'auto',
      },
      '.cm-content': {
        padding: 'var(--space-3)',
        caretColor: code ? 'var(--code-text)' : 'var(--text)',
      },
      '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
        { backgroundColor: 'var(--accent-decor)', opacity: '0.35' },
      '.cm-cursor': { borderLeftColor: code ? 'var(--code-text)' : 'var(--text)' },
    },
    { dark: code },
  );
}

/** CodeMirror 6 as a labelled, controlled field. Loaded lazily: it is the one heavy part of the editors. */
export default function CodeMirrorView({
  label,
  value,
  onChange,
  language,
  tone,
  rows,
  handleRef,
}: CodeFieldProps) {
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(onChange);
  const current = useRef(value);

  // Read by the effects below, which must not restart the editor for a new callback or value.
  useLayoutEffect(() => {
    latest.current = onChange;
    current.current = value;
  });

  useLayoutEffect(() => {
    const lang = LANGUAGES[language];
    const v = new EditorView({
      parent: host.current as HTMLDivElement,
      state: EditorState.create({
        doc: current.current,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          themeFor(tone, rows),
          ...(lang ? [lang()] : []),
          EditorView.contentAttributes.of({ id, 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            const external = update.transactions.some((t) => t.annotation(fromProp));
            if (update.docChanged && !external) latest.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    if (handleRef) {
      handleRef.current = {
        getSelection: () => ({
          start: v.state.selection.main.from,
          end: v.state.selection.main.to,
        }),
        select: (start, end) => {
          v.dispatch({ selection: { anchor: start, head: end } });
          v.focus();
        },
      };
    }
    return () => {
      if (handleRef) handleRef.current = null;
      v.destroy();
      view.current = null;
    };
  }, [language, tone, rows, label, id, handleRef]);

  // A new value from outside (a toolbar edit, an undo of the draft) replaces the document.
  useLayoutEffect(() => {
    const v = view.current as EditorView;
    if (v.state.doc.toString() !== value) {
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: value },
        annotations: fromProp.of(true),
      });
    }
  }, [value, language, tone, rows, label, id, handleRef]);

  return (
    <Field label={label} id={id}>
      {() => <div ref={host} className="studio-cm" />}
    </Field>
  );
}
