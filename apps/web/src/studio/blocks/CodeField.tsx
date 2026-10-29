import { Textarea } from '@gurukul/ui';
import { lazy, Suspense, useImperativeHandle, useRef } from 'react';
import type { CodeFieldHandle, CodeFieldProps } from './codeFieldTypes';

// CodeMirror is its own chunk: the Studio editors pay for it, nobody else does.
const CodeMirrorView = lazy(() => import('./CodeMirrorView'));

/** The plain textarea shown while CodeMirror loads, and the same control the toolbar talks to. */
function PlainField({ label, value, onChange, rows, tone, handleRef }: CodeFieldProps) {
  const wrap = useRef<HTMLDivElement>(null);
  useImperativeHandle(handleRef, (): CodeFieldHandle => {
    const el = () =>
      (wrap.current as HTMLDivElement).querySelector('textarea') as HTMLTextAreaElement;
    return {
      getSelection: () => ({ start: el().selectionStart, end: el().selectionEnd }),
      select: (start, end) => {
        el().focus();
        el().setSelectionRange(start, end);
      },
    };
  }, []);
  return (
    <div ref={wrap}>
      <Textarea
        label={label}
        className={tone === 'code' ? 'studio-mono' : undefined}
        spellCheck={tone === 'prose'}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * A text field for markdown or code: syntax colour, bracket-aware editing and undo through
 * CodeMirror 6, a textarea until it loads.
 */
export function CodeField(props: CodeFieldProps) {
  return (
    <Suspense fallback={<PlainField {...props} />}>
      <CodeMirrorView {...props} />
    </Suspense>
  );
}
