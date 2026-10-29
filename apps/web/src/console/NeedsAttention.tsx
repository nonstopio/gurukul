import { Button, EmptyState, useToast } from '@gurukul/ui';
import { useCallback } from 'react';
import { useAsync } from '../data/useAsync';
import { useTerms } from '../labels/useTerms';
import { Loaded } from '../learn/ui';
import { longDate } from '../quiz/model';
import { useConsole } from './ConsoleProvider';
import { overdueEntries, pendingInvites, visibleFailed } from './model';
import type { FailedEntry } from './model';
import type { AssignmentFull, UserRow } from './types';

export interface AttentionInput {
  open: AssignmentFull[];
  failed: FailedEntry[];
  /** Profiles of the people in `failed`, by uid. */
  people: Map<string, UserRow>;
  courseTitles: Map<string, string>;
  /** `courseId/quizId` to the Quiz's title. */
  quizTitles: Map<string, string>;
  now: Date;
}

/**
 * Who needs a nudge: the longest-overdue assignments, Quizzes failed twice and pending invites,
 * five of each. The date range and team narrow all three; a pending invite has no team yet, so
 * the team filter leaves that list alone.
 */
export function NeedsAttention({
  input,
  start,
  team,
}: {
  input: AttentionInput;
  start: Date | null;
  team: string;
}) {
  const { data, service } = useConsole();
  const t = useTerms();
  const toast = useToast();
  const loadMembers = useCallback(
    async () => (team === '' ? null : data.usersInTeam(team)),
    [data, team],
  );
  const members = useAsync(loadMembers);

  const remind = (email: string, done: string) =>
    service.remindLearners({ emails: [email] }).then(
      (r) =>
        toast.show(r.sent > 0 ? done : 'Already reminded today.', {
          tone: r.sent > 0 ? 'success' : 'info',
        }),
      () => toast.show('Could not send that. Try again.', { tone: 'danger' }),
    );
  const reset = (entry: FailedEntry) =>
    service.resetCooldown({ uid: entry.uid, courseId: entry.courseId, quizId: entry.quizId }).then(
      () => toast.show('Retake opened', { tone: 'success' }),
      () => toast.show('Could not open the retake. Try again.', { tone: 'danger' }),
    );

  return (
    <section aria-labelledby="attention-title" className="home-section">
      <h2 id="attention-title">Needs attention</h2>
      <Loaded loadable={members}>
        {(team_) => {
          const emails = team_ && new Set(team_.map((u) => u.email));
          const uids = team_ && new Set(team_.map((u) => u.uid));
          const overdue = overdueEntries(input.open, input.now, start, emails);
          const failed = visibleFailed(input.failed, start, uids);
          const invites = pendingInvites(input.open, start);
          return (
            <div className="attention">
              <div>
                <h3>Overdue</h3>
                {overdue.length === 0 ? (
                  <EmptyState title="Nobody is overdue">Nothing past its due date here.</EmptyState>
                ) : (
                  <ul className="attention__list">
                    {overdue.map((e) => (
                      <li key={e.key}>
                        <span>
                          <strong>{e.email}</strong>
                          <span className="attention__reason attention__reason--danger">
                            {input.courseTitles.get(e.courseId) ?? e.courseId} was due{' '}
                            {longDate(e.dueAt)}
                          </span>
                        </span>
                        <Button
                          variant="secondary"
                          onClick={() => void remind(e.email, 'Reminder sent')}
                          aria-label={`Nudge ${e.email}`}
                        >
                          Nudge
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3>Failed twice</h3>
                {failed.length === 0 ? (
                  <EmptyState title="Nobody is stuck">{`No one has failed a ${t.Quiz} twice.`}</EmptyState>
                ) : (
                  <ul className="attention__list">
                    {failed.map((e) => {
                      const person = input.people.get(e.uid);
                      const name = person?.displayName || person?.email || e.uid;
                      return (
                        <li key={e.key}>
                          <span>
                            <strong>{name}</strong>
                            <span className="attention__reason attention__reason--warning">
                              {input.quizTitles.get(`${e.courseId}/${e.quizId}`) ?? e.quizId}:{' '}
                              {e.attempts} attempts, not passed
                            </span>
                          </span>
                          <Button
                            variant="secondary"
                            onClick={() => void reset(e)}
                            aria-label={`Reset ${name}`}
                          >
                            Reset
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <h3>Pending invites</h3>
                {invites.total === 0 ? (
                  <EmptyState title="No pending invites">
                    Everyone assigned has signed in.
                  </EmptyState>
                ) : (
                  <>
                    <ul className="attention__list">
                      {invites.shown.map((p) => (
                        <li key={p.email}>
                          <span>
                            <strong>{p.email}</strong>
                            <span className="attention__reason">
                              {p.invitedAt
                                ? `Invited ${longDate(p.invitedAt)}`
                                : 'Not signed in yet'}
                            </span>
                          </span>
                          <Button
                            variant="secondary"
                            onClick={() => void remind(p.email, 'Invite sent again')}
                            aria-label={`Resend to ${p.email}`}
                          >
                            Resend
                          </Button>
                        </li>
                      ))}
                    </ul>
                    {invites.total > invites.shown.length && (
                      <p className="attention__more">
                        and {invites.total - invites.shown.length} more
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        }}
      </Loaded>
    </section>
  );
}
