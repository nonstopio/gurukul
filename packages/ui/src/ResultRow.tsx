import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { CheckIcon, XIcon } from './Icon';
import type { NavItemRenderProps } from './NavItem';
import './result-row.css';

export interface ResultRowRevisit {
  href?: string;
  /** Link text, e.g. "Revisit lesson: Resolving merge conflicts". */
  label: ReactNode;
  /** Draws the anchor yourself so a router owns navigation, as `NavItem` does. */
  render?: (props: NavItemRenderProps) => ReactNode;
}

export interface ResultRowProps extends Omit<HTMLAttributes<HTMLLIElement>, 'children'> {
  /** Whether the learner answered correctly. */
  passed: boolean;
  /** The question text. */
  question: ReactNode;
  /** What the learner answered. Struck through when `passed` is false. */
  yourAnswer: ReactNode;
  /** The right answer. Omit it when the Pariksha does not reveal answers. */
  correctAnswer?: ReactNode;
  /** The explanation slot. Omit it when there is none. */
  children?: ReactNode;
  /** A link back to the lesson that teaches this. */
  revisit?: ResultRowRevisit;
}

/** One question in the Pariksha review. A list item: put rows inside a `<ul>`. */
export function ResultRow({
  passed,
  question,
  yourAnswer,
  correctAnswer,
  children,
  revisit,
  className,
  ...rest
}: ResultRowProps) {
  const linkProps: NavItemRenderProps = { className: 'g-result__link', children: revisit?.label };
  return (
    <li
      className={cx('g-result', passed ? 'g-result--pass' : 'g-result--fail', className)}
      {...rest}
    >
      <span className="g-result__icon" aria-hidden="true">
        {passed ? <CheckIcon strokeWidth={1.75} /> : <XIcon strokeWidth={1.75} />}
      </span>
      <div className="g-result__body">
        <p className="g-result__question">
          <span className="g-result__sr">{passed ? 'Correct. ' : 'Incorrect. '}</span>
          {question}
        </p>
        <dl className="g-result__answers">
          <div>
            <dt>Your answer</dt>
            <dd className={cx('g-result__yours', !passed && 'g-result__yours--wrong')}>
              {passed ? yourAnswer : <s>{yourAnswer}</s>}
            </dd>
          </div>
          {correctAnswer === undefined ? null : (
            <div>
              <dt>Correct answer</dt>
              <dd>{correctAnswer}</dd>
            </div>
          )}
        </dl>
        {children ? <div className="g-result__explanation">{children}</div> : null}
        {revisit ? (
          revisit.render ? (
            revisit.render({ ...linkProps, href: revisit.href })
          ) : (
            <a className="g-result__link" href={revisit.href}>
              {revisit.label}
            </a>
          )
        ) : null}
      </div>
    </li>
  );
}
