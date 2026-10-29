import { Textarea } from '@gurukul/ui';
import { useImperativeHandle, useRef } from 'react';
import type { CodeFieldProps } from '../src/studio/blocks/codeFieldTypes';

/**
 * Stands in for `CodeField` in the editor tests: jsdom cannot type into a contenteditable the way
 * a browser does, so those tests drive a textarea. `codefield.test.tsx` runs the real thing.
 */
export function CodeField({ label, value, onChange, rows, handleRef }: CodeFieldProps) {
  const wrap = useRef<HTMLDivElement>(null);
  useImperativeHandle(handleRef, () => {
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
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
