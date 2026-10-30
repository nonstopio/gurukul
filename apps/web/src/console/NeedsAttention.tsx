import { Avatar, Button, Card, EmptyState, useToast } from '@gurukul/ui';
import { useCallback } from 'react';
import type { ReactNode } from 'react';
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
  filters,
}: {
  input: AttentionInput;
  start: Date | null;
  team: string;
  /** The FilterBar that narrows these lists, drawn above them. */
  filters: ReactNode;
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
    <Card title="Needs attention">
      <div className="console-stack">
        {filters}
        <Loaded loadable={members}>
          {(team_) => {
            const emails = team_ && new Set(team_.map((u) => u.email));
            const uids = team_ && new Set(team_.map((u) => u.uid));
            const overdue = overdueEntries(input.open, input.now, start, emails);
            const failed = visibleFailed(input.failed, start, uids);
            const invites = pendingInvites(input.open, start);
            return (
              <div className="console-columns">
                <div>
                  <h3>Overdue</h3>
                  {overdue.length === 0 ? (
                    <EmptyState title="Nobody is overdue" headingAs="h4">
                      Nothing past its due date here.
                    </EmptyState>
                  ) : (
                    <ul className="console-rows">
                      {overdue.map((e) => (
                        <Row
                          key={e.key}
                          name={e.email}
                          reason={`${input.courseTitles.get(e.courseId) ?? e.courseId} was due ${longDate(e.dueAt)}`}
                          action="Nudge"
                          actionLabel={`Nudge ${e.email}`}
                          onAction={() => void remind(e.email, 'Reminder sent')}
                        />
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3>Failed twice</h3>
                  {failed.length === 0 ? (
                    <EmptyState title="Nobody is stuck" headingAs="h4">
                      {`No one has failed a ${t.Quiz} twice.`}
                    </EmptyState>
                  ) : (
                    <ul className="console-rows">
                      {failed.map((e) => {
                        const person = input.people.get(e.uid);
                        const name = person?.displayName || person?.email || e.uid;
                        return (
                          <Row
                            key={e.key}
                            name={name}
                            reason={`${input.quizTitles.get(`${e.courseId}/${e.quizId}`) ?? e.quizId}: ${e.attempts} attempts, not passed`}
                            action="Reset"
                            actionLabel={`Reset ${name}`}
                            onAction={() => void reset(e)}
                          />
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div>
                  <h3>Pending invites</h3>
                  {invites.total === 0 ? (
                    <EmptyState title="No pending invites" headingAs="h4">
                      Everyone assigned has signed in.
                    </EmptyState>
                  ) : (
                    <>
                      <ul className="console-rows">
                        {invites.shown.map((p) => (
                          <Row
                            key={p.email}
                            name={p.email}
                            reason={
                              p.invitedAt ? `Invited ${longDate(p.invitedAt)}` : 'Not signed in yet'
                            }
                            action="Resend"
                            actionLabel={`Resend to ${p.email}`}
                            onAction={() => void remind(p.email, 'Invite sent again')}
                          />
                        ))}
                      </ul>
                      {invites.total > invites.shown.length && (
                        <p className="console-muted">
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
      </div>
    </Card>
  );
}

/** One person in a Needs attention list: who, why, and the one thing to do about it. */
function Row({
  name,
  reason,
  action,
  actionLabel,
  onAction,
}: {
  name: string;
  reason: string;
  action: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <li className="console-row">
      <Avatar name={name} size={34} />
      <span className="console-row__text">
        <strong>{name}</strong>
        <span className="console-muted">{reason}</span>
      </span>
      <Button variant="secondary" size="sm" onClick={onAction} aria-label={actionLabel}>
        {action}
      </Button>
    </li>
  );
}
