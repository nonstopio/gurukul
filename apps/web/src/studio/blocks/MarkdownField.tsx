import { SegmentedControl, Textarea } from '@gurukul/ui';
import { lazy, Suspense, useState } from 'react';
import type { ReactNode } from 'react';

// Milkdown is its own chunk: Studio pays for it, learners never do.
const VisualMarkdownView = lazy(() => import('./VisualMarkdownView'));

const MODES = [
  { value: 'visual', label: 'Visual' },
  { value: 'markdown', label: 'Markdown' },
] as const;

export const LOSSY_WARNING =
  'This text uses formatting the visual editor cannot keep, so it stays in Markdown.';

/**
 * A Markdown field with a Visual | Markdown switch. Visual is the default; text the visual editor
 * could not write back unchanged opens in Markdown, with a warning. `children` is the Markdown
 * editor, which each caller draws as it needs (a plain box, or CodeMirror with its own toolbar).
 */
export function MarkdownField({
  label,
  hint,
  error,
  value,
  onChange,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  value: string;
  onChange: (md: string) => void;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<'visual' | 'markdown'>('visual');
  const [lossy, setLossy] = useState(false);
  const pick = (next: 'visual' | 'markdown') => {
    setLossy(false);
    setMode(next);
  };
  return (
    <div className="studio-text">
      <SegmentedControl label={`${label} editor`} value={mode} options={MODES} onChange={pick} />
      {lossy ? (
        <p role="status" className="studio-muted">
          {LOSSY_WARNING}
        </p>
      ) : null}
      {mode === 'visual' ? (
        <Suspense
          fallback={
            <Textarea
              label={label}
              hint={hint}
              error={error}
              rows={6}
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          }
        >
          <VisualMarkdownView
            label={label}
            hint={hint}
            error={error}
            value={value}
            onChange={onChange}
            onLossy={() => {
              setMode('markdown');
              setLossy(true);
            }}
          />
        </Suspense>
      ) : (
        children
      )}
    </div>
  );
}
