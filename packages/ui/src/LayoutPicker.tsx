import type { ReactNode } from 'react';
import { cx } from './cx';
import './layout-picker.css';

export type BlockLayout = 'stacked' | 'split' | 'article';

export interface LayoutPickerProps {
  value: BlockLayout;
  onChange: (value: BlockLayout) => void;
  /** Accessible name of the group, e.g. "Layout". */
  label: string;
}

const LAYOUTS: Array<{ value: BlockLayout; name: string; diagram: ReactNode }> = [
  {
    value: 'stacked',
    name: 'Stacked',
    diagram: (
      <>
        <rect x="4" y="4" width="40" height="14" rx="2" />
        <rect x="4" y="22" width="40" height="14" rx="2" />
      </>
    ),
  },
  {
    value: 'split',
    name: 'Split',
    diagram: (
      <>
        <rect x="4" y="4" width="19" height="32" rx="2" />
        <rect x="25" y="4" width="19" height="32" rx="2" />
      </>
    ),
  },
  {
    value: 'article',
    name: 'Article',
    diagram: (
      <>
        <rect x="14" y="4" width="20" height="4" rx="2" />
        <rect x="14" y="12" width="20" height="4" rx="2" />
        <rect x="14" y="20" width="20" height="4" rx="2" />
        <rect x="14" y="28" width="20" height="4" rx="2" />
      </>
    ),
  },
];

/** Three tiles that choose how a lesson's blocks are laid out. Each is a toggle button with a diagram and a name. */
export function LayoutPicker({ value, onChange, label }: LayoutPickerProps) {
  return (
    <div className="g-layouts" role="group" aria-label={label}>
      {LAYOUTS.map((layout) => (
        <button
          key={layout.value}
          type="button"
          className={cx('g-layouts__tile', value === layout.value && 'g-layouts__tile--on')}
          aria-pressed={value === layout.value}
          onClick={() => onChange(layout.value)}
        >
          <svg viewBox="0 0 48 40" width="48" height="40" fill="currentColor" aria-hidden="true">
            {layout.diagram}
          </svg>
          <span className="g-layouts__name">{layout.name}</span>
        </button>
      ))}
    </div>
  );
}
