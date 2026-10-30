import type { KeyboardEvent, ReactNode } from 'react';
import './segmented-control.css';

export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group. */
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
}

/** 2–4 mutually exclusive modes as a group of toggle buttons; `aria-pressed` marks the chosen one. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  // Left/Right move focus between the buttons (wrapping); Tab still reaches each one.
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    // The button's parent is always the group below.
    const group = e.currentTarget.parentElement as HTMLElement;
    const buttons = Array.from(group.children) as HTMLElement[];
    const at = buttons.indexOf(e.currentTarget);
    e.preventDefault();
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  };
  return (
    <div className="g-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="g-segmented__btn"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          onKeyDown={onKeyDown}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
