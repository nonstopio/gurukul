import { EDUCATOR_COURSE_ID, estimateMinutes, itemsOf } from '@gurukul/schema';
import {
  Breadcrumb,
  Button,
  Callout,
  Card,
  Certificate,
  Chip,
  CourseTile,
  EmptyState,
  Page,
  PageHeader,
  Pagination,
  StatCard,
  buttonClass,
  useToast,
} from '@gurukul/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSession, useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import type { CertificateRow, ProgressRow } from '../data/types';
import { useAsync } from '../data/useAsync';
import { durationLabel, nextAssigned } from '../learn/model';
import type { AssignedCourse } from '../learn/model';
import { Loaded, LoadedPage } from '../learn/ui';
import { linkedInUrl, longDate } from '../quiz/model';
import { TrackClick, useTrackOnMount } from '../analytics/react/Track';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { pageFor } from '../paging';
import { useAudience } from '../data/useAudience';

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

/** Copies a certificate's public verify link, and says whether it worked. */
function useCopyVerifyLink() {
  const toast = useToast();
  return async (id: string) => {
    try {
      await navigator.clipboard.writeText(verifyUrl(id));
      toast.show('Link copied');
    } catch {
      log.warn('Copy link failed', { credentialId: id });
      toast.show('Could not copy the link.', { tone: 'danger' });
    }
  };
}

/** `/certificates/:id` for the owner: the certificate, Download PDF, LinkedIn and copy-link actions. */
/** Counts one certificate opened. A component of its own because the page renders its body from a callback. */
function TrackCertificateView({ id }: { id: string }) {
  useTrackOnMount('certificate_view', { certificate_id: id });
  return null;
}

/** Counts one completion page opened for a finished course. */
function TrackCourseComplete({ courseId }: { courseId: string }) {
  useTrackOnMount('course_complete', { course_id: courseId });
  return null;
}

export function CertificatePage() {
  const { id = '' } = useParams();
  const data = useLearnerData();
  const copy = useCopyVerifyLink();
  const result = useAsync(useCallback(() => data.getCertificate(id), [data, id]));
  return (
    <LoadedPage loadable={result}>
      {(c) => (
        <Page>
          {c === null ? (
            <PageHeader
              title="Certificate not found"
              lead="Check the address, or open it from your certificates."
              actions={
                <Link className={buttonClass('secondary')} to="/certificates">
                  Your certificates
                </Link>
              }
            />
          ) : (
            <>
              <TrackCertificateView id={c.id} />
              <PageHeader
                breadcrumb={
                  <Breadcrumb
                    items={[
                      {
                        label: 'Certificates',
                        render: (p) => <Link to="/certificates" {...(p as object)} />,
                      },
                      { label: c.id },
                    ]}
                  />
                }
                title={c.courseTitle}
                meta={c.revoked ? <Chip tone="danger">Revoked</Chip> : undefined}
                lead={`Issued ${longDate(c.issuedAt)}. Anyone with the verify link can check it is genuine.`}
                actions={
                  <>
                    <Button variant="secondary" onClick={() => void copy(c.id)}>
                      Copy verify link
                    </Button>
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
                    <TrackClick event="certificate_download" params={{ certificate_id: c.id }}>
                      <Button onClick={() => window.print()}>Download PDF</Button>
                    </TrackClick>
                  </>
                }
              />
              <CertificateSheet c={c} />
            </>
          )}
        </Page>
      )}
    </LoadedPage>
  );
}

/** `/verify/:id`: public, signed out, no email, `noindex`. Valid or revoked, or not found. */
export function VerifyPage() {
  const { id = '' } = useParams();
  const data = useLearnerData();
  const result = useAsync(useCallback(() => data.getCertificate(id), [data, id]));
  useNoIndex();
  const eyebrow = 'NonStop Gurukul · Certificate check';
  // No shell here (anyone may open it, signed in or not), so the page owns its `main`.
  return (
    <main id="content">
      <LoadedPage loadable={result}>
        {(c) =>
          c === null ? (
            <Page>
              <PageHeader
                eyebrow={eyebrow}
                title="Certificate not found"
                lead={`No certificate has the id ${id}. Check it was typed correctly.`}
              />
            </Page>
          ) : (
            <Page>
              <PageHeader eyebrow={eyebrow} title={c.revoked ? 'Revoked' : 'Valid'} />
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
            </Page>
          )
        }
      </LoadedPage>
    </main>
  );
}

/** A grid of certificates fits 12 (four rows of three at 1280px); each one is a full drawing. */
const CERTIFICATES_PER_PAGE = 12;

/** `/certificates`: mine, newest first, as a gallery. */
export function CertificatesPage() {
  const data = useLearnerData();
  const t = useTerms();
  const uid = useUser().uid;
  const [page, setPage] = useState(1);
  const result = useAsync(useCallback(() => data.myCertificates(uid), [data, uid]));
  return (
    <Page>
      <PageHeader
        title="Certificates"
        lead="Every certificate you have earned, newest first. Each one has a public verify link."
      />
      <Loaded loadable={result}>
        {(list) => {
          const paged = pageFor(list, page, CERTIFICATES_PER_PAGE);
          return list.length === 0 ? (
            <EmptyState
              title="No certificates yet"
              headingAs="h2"
              action={
                <Link className={buttonClass('secondary')} to="/courses">
                  Browse the catalogue
                </Link>
              }
            >
              {`Finish a course and pass its ${t.Quizzes} to earn one.`}
            </EmptyState>
          ) : (
            <>
              <ul className="learn-cards">
                {paged.rows.map((c) => (
                  <CourseTile
                    key={c.id}
                    as="li"
                    title={c.courseTitle}
                    theme="stone"
                    heading={<Link to={`/certificates/${c.id}`}>{c.courseTitle}</Link>}
                    cover={
                      <div inert>
                        <CertificateSheet c={c} />
                      </div>
                    }
                    chips={c.revoked ? <Chip tone="danger">Revoked</Chip> : undefined}
                    meta={`${c.id} · ${longDate(c.issuedAt)}`}
                  />
                ))}
              </ul>
              <Pagination
                label="Certificates"
                page={paged.page}
                pageSize={CERTIFICATES_PER_PAGE}
                total={list.length}
                onPageChange={setPage}
              />
            </>
          );
        }}
      </Loaded>
    </Page>
  );
}

/** The real certificate, scaled down and linked: what the learner just earned. */
function CertificateThumb({ id }: { id: string }) {
  const data = useLearnerData();
  const result = useAsync(useCallback(() => data.getCertificate(id), [data, id]));
  if (result.state !== 'ready' || result.value === null) return null;
  return (
    <Card title="Your certificate">
      <Link className="certificate-thumb" to={`/certificates/${id}`}>
        <span className="sr-only">Open the certificate for {result.value.courseTitle}</span>
        <div aria-hidden="true" inert>
          <CertificateSheet c={result.value} />
        </div>
      </Link>
    </Card>
  );
}

/** The next unfinished assigned course, or a way to browse when there is none. */
function UpNextCard({ courseId }: { courseId: string }) {
  const data = useLearnerData();
  const uid = useUser().uid;
  const audience = useAudience();
  const result = useAsync(
    useCallback(async () => {
      const [assignments, progress, courses] = await Promise.all([
        data.myAssignments(uid),
        data.myProgress(uid),
        data.listCourses(audience),
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
    }, [data, uid, courseId, audience]),
  );
  if (result.state !== 'ready') return null;
  const next = result.value;
  return (
    <Card title="Up next in your queue">
      <div className="learn-stack">
        {next ? (
          <>
            <p className="learn-display">{next.course.title}</p>
            <div className="learn-buttons">
              <Link className={buttonClass('secondary')} to={`/courses/${next.course.id}`}>
                {next.progress ? 'Continue' : 'Start'}
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="learn-muted">Nothing else is assigned to you.</p>
            <div className="learn-buttons">
              <Link className={buttonClass('secondary')} to="/courses">
                Browse more courses
              </Link>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * Finishing the Educator course grants the role in the progress trigger; the session picks the
 * new claim up when the profile's `roles` mirror changes, so this waits for it.
 */
function EducatorWelcome({ certificateId }: { certificateId: string | null }) {
  const { roles } = useSession();
  const t = useTerms();
  const data = useLearnerData();
  const uid = useUser().uid;
  const educator = roles.includes('educator');
  // Only someone an Admin assigned the course to is made an Educator; anyone else gets the
  // certificate alone, so promising them the role would leave this message up for good.
  const assigned = useAsync(
    useCallback(
      async () =>
        educator || (await data.myAssignments(uid)).some((a) => a.courseId === EDUCATOR_COURSE_ID),
      [data, uid, educator],
    ),
  );
  if (assigned.state !== 'ready' || !assigned.value) return null;
  // The role is granted just before the certificate: once it is issued, no grant is coming.
  if (!educator && certificateId !== null) return null;
  if (!educator) {
    return (
      <Callout title={`Making you ${article(t.Educator)}…`} role="status">
        This takes a few seconds.
      </Callout>
    );
  }
  return (
    <Callout tone="tip" title={`You are now ${article(t.Educator)}.`} role="status">
      <p>
        Congratulations. You can build your own courses in {t.Studio}, and your certificate shows
        you earned it.
      </p>
      <Link className={buttonClass('secondary')} to="/studio">
        Open {t.Studio}
      </Link>
    </Callout>
  );
}

/** `/courses/:courseId/complete`: the Completion screen, reached after the last item. */
export function CompletePage() {
  const { courseId = '' } = useParams();
  const data = useLearnerData();
  const uid = useUser().uid;
  const copy = useCopyVerifyLink();
  const t = useTerms();
  const [progress, setProgress] = useState<ProgressRow | null | undefined>(undefined);
  const result = useAsync(useCallback(() => data.getCourse(courseId), [data, courseId]));
  useEffect(() => data.watchProgress(uid, courseId, setProgress), [data, uid, courseId]);

  return (
    <LoadedPage loadable={result}>
      {(course) => {
        if (!course || !progress?.completedAt) {
          return (
            <Page>
              <PageHeader title={course ? course.title : 'Course not found'} />
              <EmptyState
                title="Not finished yet"
                headingAs="h2"
                action={
                  <Link className={buttonClass('secondary')} to={`/courses/${courseId}`}>
                    Back to the course
                  </Link>
                }
              >
                {`Finish every lesson and pass every ${t.Quiz} to complete the course.`}
              </EmptyState>
            </Page>
          );
        }
        const quizzes = itemsOf(course).filter((i) => i.type === 'quiz');
        const best = quizzes.map((p) => progress.quiz[p.id]?.best ?? 0);
        const average = best.length
          ? Math.round((best.reduce((a, b) => a + b, 0) / best.length) * 100)
          : null;
        const certificateId = course.rules.certificate ? progress.certificateId : null;
        return (
          <Page>
            <TrackCourseComplete courseId={courseId} />
            <PageHeader
              eyebrow="Course complete"
              title={`${course.title}, done.`}
              actions={
                certificateId ? (
                  <>
                    <Button variant="secondary" onClick={() => void copy(certificateId)}>
                      Copy verify link
                    </Button>
                    <a
                      className={buttonClass('secondary')}
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
                    <Link className={buttonClass('primary')} to={`/certificates/${certificateId}`}>
                      View and download certificate
                    </Link>
                  </>
                ) : undefined
              }
            />
            {courseId === EDUCATOR_COURSE_ID ? (
              <EducatorWelcome certificateId={progress.certificateId} />
            ) : null}
            {course.rules.certificate && !certificateId ? (
              <p role="status" className="learn-muted">
                Preparing your certificate…
              </p>
            ) : null}
            <div className="learn-stats">
              <StatCard label="Completed on" value={longDate(progress.completedAt)} />
              {average !== null ? (
                <StatCard label={`${t.Quiz} average`} value={`${average}%`} />
              ) : null}
              <StatCard label="Time invested" value={durationLabel(estimateMinutes(course))} />
            </div>
            <div className="complete-grid">
              {certificateId ? <CertificateThumb id={certificateId} /> : null}
              <UpNextCard courseId={course.id} />
            </div>
          </Page>
        );
      }}
    </LoadedPage>
  );
}
