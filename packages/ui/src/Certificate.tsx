import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import { Seal } from './Seal';
import './certificate.css';

/**
 * The class that makes a certificate the only thing on the printed page. `Certificate` always
 * carries it. In `@media print` everything else on the page is hidden and the certificate is
 * pinned to the top-left of an A4 landscape page at 1123x794 CSS px, unscaled, with no margin.
 * An app page that wants no blank trailing page should also give its own chrome `display: none`
 * in print; hiding is by `visibility`, so chrome still takes up space unless removed.
 */
export const printCertificateClass = 'g-cert-print';

export interface CertificateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  learnerName: string;
  courseTitle: string;
  /** The issue date, already formatted for display, e.g. "9 November 2026". */
  issuedOn: string;
  credentialId: string;
  /** Shown as text so it survives print, e.g. "gurukul.nonstop.io/verify/abc123". */
  verifyUrl: string;
  signatoryName: string;
  signatoryRole: string;
  /** Adds a REVOKED band. The certificate stays readable. */
  revoked?: boolean;
  /** Default: "NonStop Gurukul". */
  organisation?: string;
}

/** Names longer than this shrink to fit the line. */
const NAME_FULL_SIZE_CHARS = 40;
const NAME_MAX_PX = 32;
const NAME_MIN_PX = 22;

/** Course titles longer than this shrink, then wrap to a second line. */
const COURSE_FULL_SIZE_CHARS = 22;
const COURSE_MAX_PX = 72;
const COURSE_MIN_PX = 40;

function fitFontSize(text: string, fullSizeChars: number, maxPx: number, minPx: number): number {
  const length = text.trim().length;
  if (length <= fullSizeChars) return maxPx;
  return Math.max(minPx, Math.floor((maxPx * fullSizeChars) / length));
}

/** The learner name's font size in px: 32 up to 40 characters, then shrinking, never below 22. */
export function nameFontSize(name: string): number {
  return fitFontSize(name, NAME_FULL_SIZE_CHARS, NAME_MAX_PX, NAME_MIN_PX);
}

/** The course title's font size in px: 72 up to 22 characters, then shrinking, never below 40. */
export function courseFontSize(title: string): number {
  return fitFontSize(title, COURSE_FULL_SIZE_CHARS, COURSE_MAX_PX, COURSE_MIN_PX);
}

/**
 * The A4 landscape completion certificate: paper on a dot grid with rings, the course title as
 * the largest line, and the green wax seal over the details. It is designed at 1123x794 and scaled
 * to the width of its container with CSS only; all text is real, selectable text.
 */
export function Certificate({
  learnerName,
  courseTitle,
  issuedOn,
  credentialId,
  verifyUrl,
  signatoryName,
  signatoryRole,
  revoked = false,
  organisation = 'NonStop Gurukul',
  className,
  ...rest
}: CertificateProps) {
  return (
    <div
      className={cx('g-cert', printCertificateClass, revoked && 'g-cert--revoked', className)}
      {...rest}
    >
      <div className="g-cert__sheet">
        <svg className="g-cert__art" viewBox="0 0 1123 794" aria-hidden="true">
          <circle className="g-cert__ring" cx="110" cy="100" r="230" />
          <circle className="g-cert__ring g-cert__ring--gold" cx="110" cy="100" r="150" />
          <circle className="g-cert__ring" cx="956" cy="588" r="330" />
          <circle className="g-cert__ring g-cert__ring--gold" cx="956" cy="588" r="230" />
          <circle className="g-cert__ring" cx="956" cy="588" r="130" />
          <path className="g-cert__trace" d="M 0 248 H 140" />
          <circle className="g-cert__node" cx="140" cy="248" r="6" />
          <path className="g-cert__trace" d="M 860 0 V 34" />
          <path className="g-cert__node" d="M 846 34 A 14 14 0 0 0 874 34 Z" />
        </svg>
        <div className="g-cert__inner">
          {revoked ? (
            <p className="g-cert__revoked">Revoked: this certificate is no longer valid</p>
          ) : null}
          <p className="g-cert__org">{organisation}</p>
          <p className="g-cert__title">Certificate of completion</p>
          <span className="g-cert__divider" aria-hidden="true" />
          <p className="g-cert__line g-cert__line--lead">This certifies that</p>
          <p className="g-cert__name" style={{ fontSize: `${nameFontSize(learnerName)}px` }}>
            {learnerName}
          </p>
          <p className="g-cert__line">has completed the course</p>
          <p className="g-cert__course" style={{ fontSize: `${courseFontSize(courseTitle)}px` }}>
            {courseTitle}
          </p>
          <div className="g-cert__footer">
            <div className="g-cert__signature">
              <span className="g-cert__sign-rule" />
              <p className="g-cert__sign-name">{signatoryName}</p>
              <p className="g-cert__sign-role">{signatoryRole}</p>
            </div>
            <dl className="g-cert__meta">
              <div>
                <dt>Issued</dt>
                <dd>{issuedOn}</dd>
              </div>
              <div>
                <dt>Credential</dt>
                <dd className="g-cert__mono">{credentialId}</dd>
              </div>
              <div>
                <dt>Verify</dt>
                <dd className="g-cert__mono g-cert__link">{verifyUrl}</dd>
              </div>
            </dl>
            <Seal
              className="g-cert__seal"
              size={180}
              label={`Seal of ${organisation}`}
              ringText={`${organisation.toUpperCase()} · CERTIFIED · `}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
