import { Button, Chip, Dialog, ProgressBar, useToast } from '@gurukul/ui';
import type { Course } from '@gurukul/schema';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import type { CertificateRow } from '../data/types';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { log } from '../log';
import { longDate } from '../quiz/model';
import { useConsole } from './ConsoleProvider';
import { drawerCourses } from './model';
import type { DrawerCourse, LearnerRow } from './model';
import type { AttemptSummary } from './types';

const percent = (score: number) => `${Math.round(score * 100)}%`;

/** Where an assigned course stands against its deadline, in words. */
function dueText(c: DrawerCourse): string {
  if (!c.assigned) return 'Not assigned';
  const parts = [c.dueAt ? `Due ${longDate(c.dueAt)}` : 'No due date'];
  if (c.mandatory) parts.push('Mandatory');
  return parts.join(' · ');
}

function CourseStatus({ c }: { c: DrawerCourse }) {
  if (c.completed) return <Chip tone="accent">Completed</Chip>;
  if (c.overdue) return <Chip tone="danger">Overdue</Chip>;
  if (c.percent === null) return <Chip tone="warning">Not started</Chip>;
  return <Chip tone="info">In progress</Chip>;
}

/**
 * The learner drawer: every course assigned to this person (started or not, with its due date)
 * and every course they opened, each attempted Quiz by title with its recent attempts, and
 * their certificates. A pending invite shows its assignments. Revoking a certificate asks first.
 */
export function LearnerDrawer({
  row,
  courses,
  now,
  onClose,
}: {
  row: LearnerRow;
  courses: readonly Course[];
  now: Date;
  onClose: () => void;
}) {
  const { data, service } = useConsole();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const result = useAsync(
    useCallback(async () => {
      const uid = row.uid;
      const [assignments, progress, certificates] = await Promise.all([
        data.assignmentsFor(row.email),
        uid ? data.progressFor([uid]) : [],
        uid ? data.certificatesFor(uid) : ([] as CertificateRow[]),
      ]);
      const list = drawerCourses(assignments, progress, courses, now);
      const attempts = new Map<string, AttemptSummary[]>();
      await Promise.all(
        list.flatMap((c) =>
          c.quizzes.map(async (p) => {
            attempts.set(
              `${c.courseId}/${p.id}`,
              await data.attemptsFor(uid as string, c.courseId, p.id),
            );
          }),
        ),
      );
      return { list, attempts, certificates, reload };
    }, [data, row.uid, row.email, courses, now, reload]),
  );
  const act = async (task: () => Promise<unknown>, done: string, action: string) => {
    try {
      await task();
      toast.show(done, { tone: 'success' });
      setReload(reload + 1);
    } catch {
      log.warn('Learner drawer action failed', { uid: row.uid, source: action });
      toast.show('That did not work. Try again.', { tone: 'danger' });
    }
  };

  return (
    <Dialog open onClose={onClose} title={row.name} size="drawer">
      <p>{row.email}</p>
      {row.status === 'invited' ? (
        <p>Pending invite: they have not signed in yet, so there is no progress to show.</p>
      ) : null}
      <Loaded loadable={result}>
        {({ list, attempts, certificates }) => (
          <>
            <h3>Courses</h3>
            {list.length === 0 ? (
              <p>No courses assigned or started.</p>
            ) : (
              <ul className="course-list">
                {list.map((c) => (
                  <li key={c.courseId} className="drawer-course">
                    <span className="course-row__title">{c.title}</span>
                    <span className="course-row__meta">
                      <CourseStatus c={c} />
                      <span className="items__kind">{dueText(c)}</span>
                    </span>
                    {c.percent === null ? null : (
                      <ProgressBar value={c.percent} label={`${c.title} progress`} />
                    )}
                    {c.quizzes.map((p) => (
                      <section key={p.id} aria-label={`${p.title} attempts`}>
                        <p>
                          <strong>{p.title}</strong> · {p.attempts}{' '}
                          {p.attempts === 1 ? 'attempt' : 'attempts'} · best {percent(p.best)} ·{' '}
                          {p.passed ? 'Passed' : 'Not passed yet'}
                        </p>
                        <ol className="drawer-attempts">
                          {(attempts.get(`${c.courseId}/${p.id}`) as AttemptSummary[]).map((a) => (
                            <li key={a.id}>
                              {a.at ? longDate(a.at) : 'Date unknown'}: {percent(a.score)},{' '}
                              {a.passed ? 'passed' : 'not passed'}
                            </li>
                          ))}
                        </ol>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            void act(
                              () =>
                                service.resetCooldown({
                                  uid: row.uid as string,
                                  courseId: c.courseId,
                                  quizId: p.id,
                                }),
                              'Retake opened',
                              'resetCooldown',
                            )
                          }
                        >
                          Reset cooldown for {p.title}
                        </Button>
                      </section>
                    ))}
                  </li>
                ))}
              </ul>
            )}
            <h3>Certificates</h3>
            {certificates.length === 0 ? (
              <p>None yet.</p>
            ) : (
              <ul className="course-list">
                {certificates.map((cert) => (
                  <li key={cert.id}>
                    <Link to={`/certificates/${cert.id}`}>{cert.courseTitle}</Link> · {cert.id}
                    {cert.revoked ? ' · Revoked' : null}{' '}
                    {confirming === cert.id ? (
                      <div role="group" aria-label={`Confirm revoking ${cert.id}`}>
                        <p>
                          Revoke this certificate? Its public page will say it is revoked until
                          someone restores it.
                        </p>
                        <Button
                          onClick={() => {
                            setConfirming(null);
                            void act(
                              () => service.revokeCertificate({ id: cert.id, revoked: true }),
                              'Certificate revoked',
                              'revokeCertificate',
                            );
                          }}
                        >
                          Revoke certificate
                        </Button>{' '}
                        <Button variant="secondary" onClick={() => setConfirming(null)}>
                          Keep it
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          cert.revoked
                            ? void act(
                                () => service.revokeCertificate({ id: cert.id, revoked: false }),
                                'Certificate restored',
                                'restoreCertificate',
                              )
                            : setConfirming(cert.id)
                        }
                      >
                        {cert.revoked ? 'Restore' : 'Revoke'}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Loaded>
    </Dialog>
  );
}
