import type { ReactNode } from 'react';
import { Button } from './Button';
import './filter-bar.css';

export interface FilterBarProps {
  /** Accessible name of the group, for example "Filter learners". */
  label: string;
  /** The filters: `Input`/`Select` with `hideLabel`, and `Toggle`s. The first (search) may grow. */
  children: ReactNode;
  /** What the filters leave, for example "3 of 4". Announced politely when it changes. */
  count?: ReactNode;
  /** Clears every filter. The button shows only while `canClear`. */
  onClear?: () => void;
  canClear?: boolean;
  /** Default: "Clear filters". */
  clearLabel?: string;
}

/** Search and filters above a list, with a Clear button and a live result count. */
export function FilterBar({
  label,
  children,
  count,
  onClear,
  canClear = false,
  clearLabel = 'Clear filters',
}: FilterBarProps) {
  return (
    <div className="g-filter-bar" role="group" aria-label={label}>
      {children}
      <div className="g-filter-bar__end">
        {canClear && onClear ? (
          <Button variant="ghost" onClick={onClear}>
            {clearLabel}
          </Button>
        ) : null}
        {count === undefined ? null : (
          <p className="g-filter-bar__count" role="status">
            {count}
          </p>
        )}
      </div>
    </div>
  );
}
