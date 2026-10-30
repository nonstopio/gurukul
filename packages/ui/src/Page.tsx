import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import './page.css';

export type PageWidth = 'reading' | 'default' | 'wide';

export interface PageProps extends HTMLAttributes<HTMLDivElement> {
  /** `reading` 780 (lessons, Quizzes, profile), `default` 1120, `wide` 1280 (tables, editors). Default: `default`. */
  width?: PageWidth;
  /** A 20rem column beside the main one at ≥ 64rem, stacked after it below. Summary and settings only. */
  aside?: ReactNode;
  children: ReactNode;
}

/** A page's column inside a shell: centred, its width from tokens, sections spaced `--space-6`. */
export function Page({ width = 'default', aside, children, className, ...rest }: PageProps) {
  return (
    <div
      className={cx('g-page', `g-page--${width}`, aside != null && 'g-page--aside', className)}
      {...rest}
    >
      {aside != null ? (
        <>
          <div className="g-page__main">{children}</div>
          <div className="g-page__aside">{aside}</div>
        </>
      ) : (
        children
      )}
    </div>
  );
}
