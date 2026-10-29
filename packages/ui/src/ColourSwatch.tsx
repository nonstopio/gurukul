import { useId } from 'react';
import { cx } from './cx';
import { CheckIcon } from './Icon';
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
              {checked ? <CheckIcon className="g-swatch__check" size={14} strokeWidth={2} /> : null}
            </span>
            <span className="g-swatch__name">{theme.name}</span>
          </label>
        );
      })}
    </div>
  );
}
