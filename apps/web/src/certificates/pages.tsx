import { itemsOf } from '@gurukul/schema';
import {
  Button,
  Callout,
  Card,
  Certificate,
  EmptyState,
  StatCard,
  buttonClass,
  useToast,
} from '@gurukul/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import type { CertificateRow, ProgressRow } from '../data/types';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { linkedInUrl, longDate } from '../pariksha/model';
import { log } from '../log';

/** The public address that proves a certificate is real. */
export function verifyUrl(id: string, origin: string = window.location.origin): string {
  return `${origin}/verify/${id}`;
}

function CertificateSheet({ c }: { c: CertificateRow }) {
  return (
    <Certificate
      learnerName={c.learnerName}
      courseTitle={c.courseTitle}
      issuedOn={longDate(c.issuedAt)}
      credentialId={c.id}
      verifyUrl={verifyUrl(c.id)}
      signatoryName={c.signatoryName}
      signatoryRole={c.signatoryRole}
      revoked={c.revoked}
    />
  );
}

/** Keeps search engines off a page that carries a person's name. */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

/** `/certificates/:id` for the owner: the certificate, Download PDF, LinkedIn and copy-link actions. */
export function CertificatePage() {
  const { id = '' } = useParams();
  const data = useLearnerData();
  const toast = useToast();
  const result = useAsync(useCallback(() => data.getCertificate(id), [data, id]));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl(id));
      toast.show('Link copied');
    } catch {
      log.warn('Copy link failed', { credentialId: id });
      toast.show('Could not copy the link.', { tone: 'danger' });
    }
  };
  return (
    <main className="page cert-page">
      <Loaded loadable={result}>
        {(c) =>
          c === null ? (
            <EmptyState title="Certificate not found">
              Check the address, or open it from your certificates.
            </EmptyState>
          ) : (
            <>
              <div className="cert-actions">
                <Button onClick={() => window.print()}>Download PDF</Button>
                <a
                  className={buttonClass('secondary')}
                  href={linkedInUrl({
                    title: c.courseTitle,
                    credentialId: c.id,
                    verifyUrl: verifyUrl(c.id),
                    issuedAt: c.issuedAt,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Add to LinkedIn
                </a>
                <Button variant="secondary" onClick={() => void copy()}>
                  Copy verify link
                </Button>
              </div>
              <CertificateSheet c={c} />
            </>
          )
        }
      </Loaded>
    </main>
  );
}

/** `/verify/:id`: public, signed out, no email, `noindex`. Valid or revoked, or not found. */
export function VerifyPage() {
  const { id = '' } = useParams();
  const data = useLearnerData();
  const result = useAsync(useCallback(() => data.getCertificate(id), [data, id]));
  useNoIndex();
  return (
    <main className="page verify">
      <p className="article__kicker">NonStop Gurukul · Certificate check</p>
      <Loaded loadable={result}>
        {(c) =>
          c === null ? (
            <>
              <h1 className="page__title">Certificate not found</h1>
              <p>No certificate has the id {id}. Check it was typed correctly.</p>
            </>
          ) : (
            <>
              <h1 className="page__title">{c.revoked ? 'Revoked' : 'Valid'}</h1>
              <Callout
                tone={c.revoked ? 'warning' : 'tip'}
                title={
                  c.revoked ? 'This certificate has been revoked' : 'This certificate is genuine'
                }
              >
                <p>
                  Issued {longDate(c.issuedAt)} to {c.learnerName} for {c.courseTitle} (version{' '}
                  {c.courseVersion}).
                </p>
              </Callout>
              <CertificateSheet c={c} />
            </>
          )
        }
      </Loaded>
    </main>
  );
}

/** `/certificates`: mine, newest first. */
export function CertificatesPage() {
  const data = useLearnerData();
  const uid = useUser().uid;
  const result = useAsync(useCallback(() => data.myCertificates(uid), [data, uid]));
  return (
    <main className="page">
      <h1 className="page__title">Certificates</h1>
      <Loaded loadable={result}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState title="No certificates yet">
              Finish a course and pass its Parikshas to earn one.
            </EmptyState>
          ) : (
            <ul className="course-list">
              {list.map((c) => (
                <li key={c.id}>
                  <Link className="course-row" to={`/certificates/${c.id}`}>
                    <span className="course-row__title">{c.courseTitle}</span>
                    <span className="course-row__meta">
                      {c.id} · {longDate(c.issuedAt)}
                      {c.revoked ? ' · Revoked' : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
    </main>
  );
}

/** `/courses/:courseId/complete`: the Siddhi screen, reached after the last item. */
export function CompletePage() {
  const { courseId = '' } = useParams();
  const data = useLearnerData();
  const uid = useUser().uid;
  const toast = useToast();
  const [progress, setProgress] = useState<ProgressRow | null | undefined>(undefined);
  const result = useAsync(useCallback(() => data.getCourse(courseId), [data, courseId]));
  useEffect(() => data.watchProgress(uid, courseId, setProgress), [data, uid, courseId]);
  const copy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(verifyUrl(id));
      toast.show('Link copied');
    } catch {
      log.warn('Copy link failed', { credentialId: id });
      toast.show('Could not copy the link.', { tone: 'danger' });
    }
  };

  return (
    <main className="page complete">
      <Loaded loadable={result}>
        {(course) => {
          if (!course || !progress?.completedAt) {
            return (
              <EmptyState
                title="Not finished yet"
                action={
                  <Link className={buttonClass('secondary')} to={`/courses/${courseId}`}>
                    Back to the course
                  </Link>
                }
              >
                Finish every lesson and pass every Pariksha to complete the course.
              </EmptyState>
            );
          }
          const parikshas = itemsOf(course).filter((i) => i.type === 'pariksha');
          const best = parikshas.map((p) => progress.pariksha[p.id]?.best ?? 0);
          const average = best.length
            ? Math.round((best.reduce((a, b) => a + b, 0) / best.length) * 100)
            : null;
          return (
            <>
              <p className="article__kicker">Siddhi · Course complete</p>
              <h1 className="page__title">{course.title}, done.</h1>
              <div className="stats">
                <StatCard label="Completed on" value={longDate(progress.completedAt)} />
                {average !== null ? (
                  <StatCard label="Pariksha average" value={`${average}%`} />
                ) : null}
                <StatCard
                  label="Lessons"
                  value={String(itemsOf(course).filter((i) => i.type === 'lesson').length)}
                />
              </div>
              {course.rules.certificate ? (
                progress.certificateId ? (
                  <Card className="continue">
                    <h2>Your certificate</h2>
                    <div className="continue__actions">
                      <Link
                        className={buttonClass('primary')}
                        to={`/certificates/${progress.certificateId}`}
                      >
                        View and download certificate
                      </Link>
                      <Button
                        variant="secondary"
                        onClick={() => void copy(progress.certificateId as string)}
                      >
                        Copy verify link
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <p role="status">Preparing your certificate…</p>
                )
              ) : null}
              <Link className={buttonClass('secondary')} to="/courses">
                Browse more courses
              </Link>
            </>
          );
        }}
      </Loaded>
    </main>
  );
}
