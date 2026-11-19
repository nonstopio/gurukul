import { useId } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './button.css';
import './sidebar.css';

export interface NavActionProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'type'
> {
  /** What the click does, as a sidebar label: "Update ready". */
  children: ReactNode;
  /** A second, quieter line: "Restart to install 0.2.0". The button's accessible description. */
  detail?: ReactNode;
  /** Leading icon, decorative: hidden from assistive tech. Drawn in the chrome accent. */
  icon?: ReactNode;
  /** Waiting on the click: disabled, `aria-busy`, a spinner in place of the icon, label kept. */
  loading?: boolean;
}

/**
 * A 44px sidebar button for an action that is not a page, such as installing a downloaded update.
 * It sits among `NavItem`s with their shape and states; its accent icon sets it apart from them.
 */
export function NavAction({
  children,
  detail,
  icon,
  loading = false,
  disabled,
  className,
  ...rest
}: NavActionProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const detailId = `${id}-detail`;
  return (
    <button
      type="button"
      className={cx('g-nav-item', 'g-nav-item--action', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      // With a detail line, the label alone names the button and the line describes it.
      aria-labelledby={detail ? labelId : undefined}
      aria-describedby={detail ? detailId : undefined}
      {...rest}
    >
      {loading ? (
        <span className="g-btn__spinner" aria-hidden="true" />
      ) : icon ? (
        <span className="g-nav-item__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="g-nav-item__text">
        <span id={labelId}>{children}</span>
        {detail ? (
          <span className="g-nav-item__detail" id={detailId}>
            {detail}
          </span>
        ) : null}
      </span>
    </button>
  );
}
