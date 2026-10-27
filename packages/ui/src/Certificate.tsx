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
const NAME_FULL_SIZE_CHARS = 28;
const NAME_MAX_PX = 66;
const NAME_MIN_PX = 44;

/** The learner name's font size in px: 66 up to 28 characters, then shrinking, never below 44. */
export function nameFontSize(name: string): number {
  const length = name.trim().length;
  if (length <= NAME_FULL_SIZE_CHARS) return NAME_MAX_PX;
  return Math.max(NAME_MIN_PX, Math.floor((NAME_MAX_PX * NAME_FULL_SIZE_CHARS) / length));
}

/**
 * The A4 landscape completion certificate. It is designed at 1123x794 and scaled to the width of
 * its container with CSS only; all text is real, selectable text.
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
        <div className="g-cert__inner">
          <span className="g-cert__corner g-cert__corner--tl" aria-hidden="true" />
          <span className="g-cert__corner g-cert__corner--tr" aria-hidden="true" />
          <span className="g-cert__corner g-cert__corner--bl" aria-hidden="true" />
          <span className="g-cert__corner g-cert__corner--br" aria-hidden="true" />
          {revoked ? (
            <p className="g-cert__revoked">Revoked: this certificate is no longer valid</p>
          ) : null}
          <p className="g-cert__badge">Gurukul</p>
          <p className="g-cert__title">Certificate of completion</p>
          <p className="g-cert__line">This certifies that</p>
          <p className="g-cert__name" style={{ fontSize: `${nameFontSize(learnerName)}px` }}>
            {learnerName}
          </p>
          <p className="g-cert__line">has completed the course</p>
          <p className="g-cert__course">{courseTitle}</p>
          <div className="g-cert__footer">
            <div className="g-cert__signature">
              <span className="g-cert__sign-rule" />
              <p className="g-cert__sign-name">{signatoryName}</p>
              <p className="g-cert__sign-role">{signatoryRole}</p>
            </div>
            <Seal
              label={`Seal of ${organisation}`}
              ringText={`${organisation.toUpperCase()} · CERTIFIED · `}
            />
            <dl className="g-cert__meta">
              <div>
                <dt>Certified by</dt>
                <dd>{organisation}</dd>
              </div>
              <div>
                <dt>Issued on</dt>
                <dd>{issuedOn}</dd>
              </div>
              <div>
                <dt>Credential ID</dt>
                <dd className="g-cert__mono">{credentialId}</dd>
              </div>
              <div>
                <dt>Verify at</dt>
                <dd className="g-cert__mono">{verifyUrl}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
