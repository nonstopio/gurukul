import {
  Breadcrumb,
  Button,
  Chip,
  DataTable,
  Dialog,
  EmptyState,
  ClockIcon,
  IconButton,
  LockIcon,
  TrashIcon,
  Page,
  PageHeader,
  Pagination,
  Select,
  StatCard,
  buttonClass,
  useToast,
} from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiClientError } from '../api';
import { useSession } from '../auth/AuthProvider';
import { DueDateDialog, RemoveAssignmentDialog } from '../console/AssignmentDialogs';
import { useConsole } from '../console/ConsoleProvider';
import { dueDay } from '../console/model';
import type { TeamReport, TeamReportAssignment } from '../console/types';
import { useAsync } from '../data/useAsync';
import { toastError } from '../errors';
import { useTerms } from '../labels/useTerms';
import { LoadedPage } from '../learn/ui';
import { pageFor } from '../paging';
import { reportCounts, reportCourses, reportRows, statusOf } from './model';
import type { ReportRow } from './model';

/** The assignment on a report row, as the shared dialogs take it. */
const targetOf = (row: ReportRow) => {
  const a = row.assignment as TeamReportAssignment;
  return {
    assignmentId: a.assignmentId,
    courseTitle: a.courseTitle,
    dueAt: a.dueAt,
    name: row.name,
  };
};

/** Codes that mean "not a team you may see": missing, or not one you manage. */
const NOT_YOURS = new Set(['VAL_1003', 'AUTH_2001']);

/**
 * `/team/:teamId`: one team's members and their assignments (course, status, due date, percent),
 * overdue first, from the `teamReport` callable. A Manager changes the due date of, or removes, an
 * assignment made through this team (the row's icon buttons); an Admin any. Remind team emails everyone on it who has an
 * unfinished course (or one course), through `remindLearners` with the team's id.
 */
export function TeamReportPage() {
  const teamId = useParams().teamId as string;
  const { service } = useConsole();
  const [reload, setReload] = useState(0);
  const result = useAsync(
    useCallback(async () => {
      void reload;
      return service.teamReport({ teamId });
    }, [service, teamId, reload]),
  );
  if (
    result.state === 'error' &&
    result.error instanceof ApiClientError &&
    NOT_YOURS.has(result.error.code)
  ) {
    return (
      <Page width="reading">
        <PageHeader eyebrow="Team" title="This team is not one you manage" />
        <EmptyState
          title="Nothing to show"
          headingAs="h2"
          icon={<LockIcon size={24} />}
          action={
            <Link className={buttonClass('secondary')} to="/team">
              Go to My teams
            </Link>
          }
        >
          It may have been deleted, or someone else looks after it.
        </EmptyState>
      </Page>
    );
  }
  return (
    <LoadedPage loadable={result}>
      {(report) => <Report report={report} onChanged={() => setReload(reload + 1)} />}
    </LoadedPage>
  );
}

function Report({ report, onChanged }: { report: TeamReport; onChanged: () => void }) {
  const t = useTerms();
  const admin = useSession().roles.includes('admin');
  const [now] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  const [dating, setDating] = useState<ReportRow | null>(null);
  const [removing, setRemoving] = useState<ReportRow | null>(null);
  const [reminding, setReminding] = useState(false);
  const rows = reportRows(report, now);
  const paged = pageFor(rows, page);
  const counts = reportCounts(report, now);
  // A Manager may change only what was assigned through this team; the function checks the same.
  const mayChange = (a: TeamReportAssignment) => admin || a.teamId === report.teamId;

  return (
    <Page>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[
              { label: `My ${t.teams}`, render: (p) => <Link to="/team" {...(p as object)} /> },
              { label: report.name },
            ]}
          />
        }
        eyebrow="Team"
        title={report.name}
        lead="Who has what, and who is behind. Overdue courses come first."
        actions={
          <>
            <Button
              variant="secondary"
              className="team-remind"
              disabled={counts.assigned === counts.completed}
              onClick={() => setReminding(true)}
            >
              Remind team
            </Button>
            <Link
              className={buttonClass('primary')}
              to="/team/assign"
              state={{ teamNames: [report.name] }}
            >
              Assign courses
            </Link>
          </>
        }
      />
      <div className="console-stats">
        <StatCard label="Members" value={String(counts.members)} />
        <StatCard label="Overdue" value={String(counts.overdue)} sub="Past the due date" />
        <StatCard
          label="Completed"
          value={`${counts.completed} of ${counts.assigned}`}
          sub="Assigned courses finished"
        />
      </div>
      <DataTable<ReportRow>
        caption={`${report.name}: members and their courses`}
        rows={paged.rows}
        rowKey={(r) => r.key}
        footer={
          rows.length === 0 ? undefined : (
            <Pagination
              label="Report"
              page={paged.page}
              total={rows.length}
              onPageChange={setPage}
            />
          )
        }
        empty={
          <EmptyState
            title="Nobody on this team yet"
            action={
              <Link className={buttonClass('secondary')} to="/team">
                Go to My teams
              </Link>
            }
          >
            Add people to the team from My teams, then assign them courses.
          </EmptyState>
        }
        columns={[
          {
            id: 'person',
            header: 'Person',
            rowHeader: true,
            cell: (r) => (
              <span className="console-row__text">
                <strong>{r.name}</strong>
                {r.name === r.email ? null : <span className="console-muted">{r.email}</span>}
              </span>
            ),
          },
          {
            id: 'course',
            header: 'Course',
            cell: (r) => r.assignment?.courseTitle ?? 'No courses assigned',
          },
          {
            id: 'status',
            header: 'Status',
            cell: (r) => {
              if (!r.assignment) return null;
              const s = statusOf(r.assignment, now);
              return <Chip tone={s.tone}>{s.label}</Chip>;
            },
          },
          {
            id: 'due',
            header: 'Due',
            cell: (r) =>
              r.assignment === null
                ? null
                : r.assignment.dueAt === null
                  ? 'No due date'
                  : dueDay(r.assignment.dueAt),
          },
          {
            id: 'percent',
            header: 'Progress',
            align: 'end',
            cell: (r) => (r.assignment ? `${r.assignment.percent}%` : null),
          },
          {
            id: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'end',
            cell: (r) =>
              r.assignment && mayChange(r.assignment) ? (
                // Icon buttons, not a Menu: a menu's panel is clipped by the table's scroll box.
                <span className="console-row__chips">
                  <IconButton
                    label={`Change due date of ${r.assignment.courseTitle} for ${r.name}`}
                    tip="Change due date"
                    onClick={() => setDating(r)}
                  >
                    <ClockIcon />
                  </IconButton>
                  <IconButton
                    label={`Remove ${r.assignment.courseTitle} from ${r.name}`}
                    tip="Remove"
                    tone="danger"
                    onClick={() => setRemoving(r)}
                  >
                    <TrashIcon />
                  </IconButton>
                </span>
              ) : null,
          },
        ]}
      />
      {dating ? (
        <DueDateDialog
          target={targetOf(dating)}
          onClose={() => setDating(null)}
          onSaved={() => {
            setDating(null);
            onChanged();
          }}
        />
      ) : null}
      {removing ? (
        <RemoveAssignmentDialog
          target={targetOf(removing)}
          onClose={() => setRemoving(null)}
          onRemoved={() => {
            setRemoving(null);
            onChanged();
          }}
        />
      ) : null}
      {reminding ? (
        <RemindDialog
          report={report}
          onClose={() => setReminding(false)}
          onSent={() => setReminding(false)}
        />
      ) : null}
    </Page>
  );
}

/** Reminds everyone on the team with an unfinished course, or only about one course. */
function RemindDialog({
  report,
  onClose,
  onSent,
}: {
  report: TeamReport;
  onClose: () => void;
  onSent: () => void;
}) {
  const { service } = useConsole();
  const toast = useToast();
  const courses = reportCourses(report);
  const [courseId, setCourseId] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const { sent, skipped } = await service.remindLearners({
        teamId: report.teamId,
        ...(courseId ? { courseId } : {}),
      });
      toast.show(
        `Reminded ${sent} ${sent === 1 ? 'person' : 'people'}${skipped > 0 ? `, skipped ${skipped} reminded in the last day` : ''}`,
        { tone: 'success' },
      );
      onSent();
    } catch (e) {
      toastError(toast, e, 'Could not send the reminders. Try again.');
      setSending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Remind ${report.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={sending} onClick={() => void send()}>
            Send reminders
          </Button>
        </>
      }
    >
      <p>
        Everyone on the team with a course still to finish gets one email listing it. Nobody is
        reminded twice in a day.
      </p>
      <Select label="About" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
        <option value="">Every unfinished course</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </Select>
    </Dialog>
  );
}
