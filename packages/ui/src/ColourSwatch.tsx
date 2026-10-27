import { useId } from 'react';
import { cx } from './cx';
import './colour-swatch.css';

export type CoverTheme = 'forest' | 'sand' | 'sky' | 'stone';

export interface ColourSwatchProps {
  value: CoverTheme;
  onChange: (value: CoverTheme) => void;
  /** Accessible name of the group, e.g. "Cover theme". */
  label: string;
}

const THEMES: Array<{ value: CoverTheme; name: string }> = [
  { value: 'forest', name: 'Forest' },
  { value: 'sand', name: 'Sand' },
  { value: 'sky', name: 'Sky' },
  { value: 'stone', name: 'Stone' },
];

/** The cover theme picker: four radios drawn as swatches. The chosen one has a ring and a check, plus its name. */
export function ColourSwatch({ value, onChange, label }: ColourSwatchProps) {
  const name = useId();
  return (
    <div className="g-swatches" role="radiogroup" aria-label={label}>
      {THEMES.map((theme) => {
        const checked = value === theme.value;
        return (
          <label key={theme.value} className={cx('g-swatch', checked && 'g-swatch--on')}>
            <input
              className="g-swatch__input"
              type="radio"
              name={name}
              value={theme.value}
              checked={checked}
              onChange={() => onChange(theme.value)}
            />
            <span className={cx('g-swatch__chip', `g-swatch__chip--${theme.value}`)}>
              {checked ? (
                <svg
                  className="g-swatch__check"
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              ) : null}
            </span>
            <span className="g-swatch__name">{theme.name}</span>
          </label>
        );
      })}
    </div>
  );
}
