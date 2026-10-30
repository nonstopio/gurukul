import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './toggle-card.css';
import './toggle.css';

export interface ToggleCardProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'title'
> {
  /** What the setting is, on the left. */
  title: string;
  /** One line under the title: what turning it on does. */
  description?: ReactNode;
}

/**
 * A setting as a card: its name and a line about it on the left, the switch at the right edge, and
 * the whole card toggles it. A real `role="switch"` checkbox underneath, named by `title`.
 */
export function ToggleCard({ title, description, className, ...rest }: ToggleCardProps) {
  const id = useId();
  return (
    <label className={cx('g-togglecard', className)}>
      <span className="g-togglecard__text">
        <span className="g-togglecard__title" id={`${id}-title`}>
          {title}
        </span>
        {description ? (
          <span className="g-togglecard__desc" id={`${id}-desc`}>
            {description}
          </span>
        ) : null}
      </span>
      <span className="g-toggle g-togglecard__switch">
        <input
          className="g-toggle__input g-togglecard__input"
          type="checkbox"
          role="switch"
          aria-labelledby={`${id}-title`}
          aria-describedby={description ? `${id}-desc` : undefined}
          {...rest}
        />
        <span className="g-toggle__track" aria-hidden="true" />
      </span>
    </label>
  );
}
