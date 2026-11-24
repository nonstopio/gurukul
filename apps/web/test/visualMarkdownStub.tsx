import { Textarea } from '@gurukul/ui';

/**
 * Stands in for `VisualMarkdownView` in the editor tests: jsdom cannot type into ProseMirror the way a
 * browser does, so those tests drive a textarea. `studio-visual-markdown.test.tsx` runs the real thing.
 */
export default function VisualMarkdownView({
  label,
  hint,
  error,
  value,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  value: string;
  onChange: (md: string) => void;
}) {
  return (
    <Textarea
      label={label}
      hint={hint}
      error={error}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
