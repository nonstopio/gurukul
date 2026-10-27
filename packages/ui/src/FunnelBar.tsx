import './funnel-bar.css';

export interface FunnelRow {
  label: string;
  value: number;
}

export interface FunnelBarProps {
  rows: FunnelRow[];
  /** Names the list for assistive tech: "Where learners stop". */
  label: string;
  /** Index of the row to mark in warning tone, usually `largestDrop(values)`. */
  highlight?: number | null;
  /** The words that go with the warning tone. Default: "Largest drop". */
  highlightLabel?: string;
}

/**
 * Index of the step with the biggest drop from the step before it, or null when no step drops
 * (fewer than two steps, or every step is equal or higher). The first of equal drops wins.
 */
export function largestDrop(values: number[]): number | null {
  let best: number | null = null;
  let bestDrop = 0;
  for (let i = 1; i < values.length; i++) {
    const drop = (values[i - 1] as number) - (values[i] as number);
    if (drop > bestDrop) {
      best = i;
      bestDrop = drop;
    }
  }
  return best;
}

/** Rows of label, bar on a sunken track, and the count. Bars are relative to the largest value. */
export function FunnelBar({
  rows,
  label,
  highlight = null,
  highlightLabel = 'Largest drop',
}: FunnelBarProps) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="g-funnel" aria-label={label}>
      {rows.map((row, i) => {
        const marked = i === highlight;
        return (
          <li
            key={`${row.label}-${i}`}
            className={marked ? 'g-funnel__row g-funnel__row--drop' : 'g-funnel__row'}
          >
            <span className="g-funnel__label">
              {row.label}
              {marked ? <span className="g-funnel__note">{highlightLabel}</span> : null}
            </span>
            <span className="g-funnel__track" aria-hidden="true">
              <span className="g-funnel__fill" style={{ width: `${(row.value / max) * 100}%` }} />
            </span>
            <span className="g-funnel__count">{row.value}</span>
          </li>
        );
      })}
    </ul>
  );
}
