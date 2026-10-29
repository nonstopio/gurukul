import { estimateMinutes, itemsOf } from '@gurukul/schema';
import { Button, Callout, Certificate, EmptyState, buttonClass, useToast } from '@gurukul/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import type { CertificateRow, ProgressRow } from '../data/types';
import { useAsync } from '../data/useAsync';
import { durationLabel, nextAssigned } from '../learn/model';
import type { AssignedCourse } from '../learn/model';
import { Loaded } from '../learn/ui';
import { linkedInUrl, longDate } from '../quiz/model';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';

/** The address links point at: `VITE_SITE_URL` when set (the custom domain), else where the app is open. */
export function siteOrigin(
  configured: string | undefined = import.meta.env['VITE_SITE_URL'] as string | undefined,
  current: string = window.location.origin,
): string {
  return (configured || current).replace(/\/+$/, '');
}

/** The public address that proves a certificate is real. */
export function verifyUrl(id: string, origin: string = siteOrigin()): string {
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
                  c.revoked
                    ? c.revokedAt
                      ? `Revoked on ${longDate(c.revokedAt)}`
                      : 'This certificate has been revoked'
                    : 'This certificate is genuine'
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
  const t = useTerms();
  const uid = useUser().uid;
  const result = useAsync(useCallback(() => data.myCertificates(uid), [data, uid]));
  return (
    <main className="page">
      <h1 className="page__title">Certificates</h1>
      <Loaded loadable={result}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState title="No certificates yet">
              {`Finish a course and pass its ${t.Quizzes} to earn one.`}
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

/** The real certificate, scaled down, tilted and linked: what the learner just earned. */
function CertificateThumb({ id }: { id: string }) {
  const data = useLearnerData();
  const result = useAsync(useCallback(() => data.getCertificate(id), [data, id]));
  if (result.state !== 'ready' || result.value === null) return null;
  return (
    <Link className="complete__thumb" to={`/certificates/${id}`}>
      <span className="sr-only">Open the certificate for {result.value.courseTitle}</span>
      <div aria-hidden="true" inert>
        <CertificateSheet c={result.value} />
      </div>
    </Link>
  );
}

/** The next unfinished assigned course, or a way to browse when there is none. */
function UpNextCard({ courseId }: { courseId: string }) {
  const data = useLearnerData();
  const uid = useUser().uid;
  const result = useAsync(
    useCallback(async () => {
      const [assignments, progress, courses] = await Promise.all([
        data.myAssignments(uid),
        data.myProgress(uid),
        data.listCourses(),
      ]);
      const rows: AssignedCourse[] = assignments.flatMap((assignment) => {
        const course = courses.find((c) => c.id === assignment.courseId);
        return course
          ? [
              {
                assignment,
                course,
                progress: progress.find((p) => p.courseId === course.id) ?? null,
              },
            ]
          : [];
      });
      return nextAssigned(rows, courseId);
    }, [data, uid, courseId]),
  );
  if (result.state !== 'ready') return null;
  const next = result.value;
  return (
    <section className="complete__next" aria-labelledby="complete-next">
      <h2 id="complete-next" className="complete__next-title">
        Up next in your queue
      </h2>
      {next ? (
        <>
          <p className="complete__next-course">{next.course.title}</p>
          <Link className={buttonClass('chrome')} to={`/courses/${next.course.id}`}>
            {next.progress ? 'Continue' : 'Start'} {next.course.title}
          </Link>
        </>
      ) : (
        <>
          <p className="complete__next-course">Nothing else is assigned to you.</p>
          <Link className={buttonClass('chrome')} to="/courses">
            Browse more courses
          </Link>
        </>
      )}
    </section>
  );
}

/** `/courses/:courseId/complete`: the Completion screen, reached after the last item. */
export function CompletePage() {
  const { courseId = '' } = useParams();
  const data = useLearnerData();
  const uid = useUser().uid;
  const toast = useToast();
  const t = useTerms();
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
                {`Finish every lesson and pass every ${t.Quiz} to complete the course.`}
              </EmptyState>
            );
          }
          const quizzes = itemsOf(course).filter((i) => i.type === 'quiz');
          const best = quizzes.map((p) => progress.quiz[p.id]?.best ?? 0);
          const average = best.length
            ? Math.round((best.reduce((a, b) => a + b, 0) / best.length) * 100)
            : null;
          const certificateId = course.rules.certificate ? progress.certificateId : null;
          return (
            <div className="complete__panel">
              <div className="complete__main">
                <p className="complete__kicker">Course complete</p>
                <h1 className="complete__title">{course.title}, done.</h1>
                <dl className="complete__stats">
                  <div>
                    <dt>Completed on</dt>
                    <dd>{longDate(progress.completedAt)}</dd>
                  </div>
                  {average !== null ? (
                    <div>
                      <dt>{`${t.Quiz} average`}</dt>
                      <dd>{`${average}%`}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Time invested</dt>
                    <dd>{durationLabel(estimateMinutes(course))}</dd>
                  </div>
                </dl>
                {course.rules.certificate ? (
                  certificateId ? (
                    <div className="complete__actions">
                      <Link className={buttonClass('chrome')} to={`/certificates/${certificateId}`}>
                        View and download certificate
                      </Link>
                      <a
                        className={buttonClass('ghost')}
                        href={linkedInUrl({
                          title: course.title,
                          credentialId: certificateId,
                          verifyUrl: verifyUrl(certificateId),
                          issuedAt: progress.completedAt,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Add to LinkedIn
                      </a>
                      <Button variant="ghost" onClick={() => void copy(certificateId)}>
                        Copy verify link
                      </Button>
                    </div>
                  ) : (
                    <p role="status">Preparing your certificate…</p>
                  )
                ) : null}
              </div>
              <div className="complete__side">
                {certificateId ? <CertificateThumb id={certificateId} /> : null}
                <UpNextCard courseId={course.id} />
              </div>
            </div>
          );
        }}
      </Loaded>
    </main>
  );
}
