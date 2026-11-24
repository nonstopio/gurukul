import { Textarea } from '@gurukul/ui';
import { lazy, Suspense, useState } from 'react';
import type { ReactNode } from 'react';

// Milkdown is its own chunk: Studio pays for it, learners never do.
const VisualMarkdownView = lazy(() => import('./VisualMarkdownView'));

export const LOSSY_WARNING =
  'This text uses formatting the visual editor cannot keep, so it is shown as Markdown.';

/**
 * A formatted-text field: the visual editor and nothing else. Text the visual editor could not write
 * back unchanged (raw HTML, an unsafe link) is shown in `children`, a plain Markdown editor, with a
 * warning, so it is never rewritten silently. That is automatic, not a choice the Educator makes.
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
  const [lossy, setLossy] = useState(false);
  return (
    <div className="studio-text">
      {lossy ? (
        <>
          <p role="status" className="studio-muted">
            {LOSSY_WARNING}
          </p>
          {children}
        </>
      ) : (
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
            onLossy={() => setLossy(true)}
          />
        </Suspense>
      )}
    </div>
  );
}
