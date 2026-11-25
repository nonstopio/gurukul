import {
  Button,
  Callout,
  Chip,
  DataTable,
  EmptyState,
  FilterBar,
  Input,
  Page,
  PageHeader,
  PageSkeleton,
  Pagination,
  Select,
  StateCard,
  buttonClass,
} from '@gurukul/ui';
import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useUser } from '../../auth/AuthProvider';
import { useAsync } from '../../data/useAsync';
import { useDesktop } from '../../desktop/bridge';
import { useTerms } from '../../labels/useTerms';
import { log } from '../../log';
import { pageFor } from '../../paging';
import { filterRows, historyRows, spanLabel, statusCounts, whenLabel } from './sessionHistory';
import type { HistoryRow, HistoryStatus } from './sessionHistory';
import { SESSION_FILES_DAYS } from '@gurukul/schema';
import { createSessionStore, sessionPath } from './store';

const STATUSES: readonly HistoryStatus[] = ['all', 'open', 'saved', 'discarded'];
const STATUS_WORDS = {
  open: { tone: 'accent', label: 'Open' },
  saved: { tone: 'neutral', label: 'Saved' },
  discarded: { tone: 'warning', label: 'Discarded' },
} as const;

/**
 * `/studio/sessions` in the desktop app: every session this person has done on this computer, open,
 * saved or discarded, newest first, with its name, summary, course, when it started and ended, how
 * many turns and changes it made, and its goals. A session still on disk opens its workspace and
 * chat; once its files are removed (30 days after it closed) its record stays here. Local files
 * only: no Firestore read, nothing leaves the computer (`.plan/22-desktop-studio.md`, Session
 * history).
 */
export function SessionHistoryPage() {
  const desktop = useDesktop();
  const { uid } = useUser();
  const t = useTerms();
  const header = (
    <PageHeader
      eyebrow={t.Studio}
      title="Session history"
      lead="Every AI session you have done on this computer, kept here and nowhere else."
      actions={
        <Link className={buttonClass('secondary')} to="/studio">
          Back to the courses
        </Link>
      }
    />
  );
  if (desktop.status === 'checking') return <PageSkeleton width="wide" label="Reading sessions" />;
  if (desktop.status !== 'ready') {
    return (
      <Page width="wide">
        {header}
        <StateCard
          variant="error"
          title={
            desktop.status === 'needs_update' ? 'Update Gurukul Studio' : 'The app did not answer'
          }
        >
          {desktop.status === 'needs_update'
            ? 'This version of the app cannot read sessions. Update the app, then restart it.'
            : 'Close Gurukul Studio and open it again. Your sessions are kept on this computer.'}
        </StateCard>
      </Page>
    );
  }
  return (
    <Page width="wide">
      {header}
      <History desktop={desktop.desktop} uid={uid} />
    </Page>
  );
}

function History({
  desktop,
  uid,
}: {
  desktop: Parameters<typeof createSessionStore>[0]['desktop'];
  uid: string;
}) {
  const store = useMemo(() => createSessionStore({ desktop, uid }), [desktop, uid]);
  const result = useAsync(
    useCallback(async () => {
      try {
        return historyRows(await store.list());
      } catch (error) {
        log.error('Session history failed', error);
        throw error;
      }
    }, [store]),
  );
  if (result.state === 'loading') return <PageSkeleton width="wide" label="Reading sessions" />;
  if (result.state === 'error') {
    return (
      <Callout
        tone="warning"
        title="Your sessions on this computer could not be read"
        role="alert"
        mascot="error"
      >
        <p>Nothing was removed. Try again, or close Gurukul Studio and open it again.</p>
        <div className="load-actions">
          <Button variant="secondary" onClick={result.retry}>
            Try again
          </Button>
        </div>
      </Callout>
    );
  }
  return <HistoryTable rows={result.value} />;
}

function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  const [params, setParams] = useSearchParams();
  const named = params.get('status');
  const status = STATUSES.find((s) => s === named) ?? 'all';
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const counts = statusCounts(rows);
  const shown = filterRows(rows, status, query);
  const paged = pageFor(shown, page);
  const setStatus = (next: HistoryStatus) => {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === 'all') copy.delete('status');
        else copy.set('status', next);
        return copy;
      },
      { replace: true },
    );
    setPage(1);
  };
  const clear = () => {
    setQuery('');
    setStatus('all');
  };
  if (rows.length === 0) {
    return (
      <EmptyState title="No sessions yet" headingAs="h2" mascot="notFound">
        A session starts when you choose New course with AI or Edit with AI in Studio. Each one is
        listed here, with what it did, once you have started it.
      </EmptyState>
    );
  }
  return (
    <>
      <FilterBar
        label="Filter sessions"
        count={`${shown.length} of ${rows.length}`}
        canClear={query !== '' || status !== 'all'}
        onClear={clear}
      >
        <Input
          label="Search sessions"
          hideLabel
          type="search"
          value={query}
          placeholder="Search names, summaries and courses"
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label="Status"
          hideLabel
          value={status}
          onChange={(e) => setStatus(e.target.value as HistoryStatus)}
        >
          <option value="all">{`Any status (${counts.all})`}</option>
          <option value="open">{`Open (${counts.open})`}</option>
          <option value="saved">{`Saved (${counts.saved})`}</option>
          <option value="discarded">{`Discarded (${counts.discarded})`}</option>
        </Select>
      </FilterBar>
      <DataTable
        caption="Sessions on this computer"
        stack
        rows={paged.rows}
        rowKey={(r) => r.id}
        columns={[
          { id: 'name', header: 'Session', rowHeader: true, cell: (r) => <SessionName row={r} /> },
          {
            id: 'status',
            header: 'Status',
            cell: (r) => (
              <Chip tone={STATUS_WORDS[r.status].tone}>{STATUS_WORDS[r.status].label}</Chip>
            ),
          },
          {
            id: 'course',
            header: 'Course',
            cell: (r) => r.course ?? (r.kind === 'new' ? 'New course' : 'Edit (course not kept)'),
          },
          { id: 'started', header: 'Started', cell: (r) => whenLabel(r.startedAt) },
          {
            id: 'ended',
            header: 'Last activity',
            cell: (r) => (
              <>
                {whenLabel(r.endedAt)}
                <br />
                <span className="sh-muted">{spanLabel(r.startedAt, r.endedAt)}</span>
              </>
            ),
          },
          {
            id: 'work',
            header: 'Work',
            cell: (r) =>
              `${r.turns} ${r.turns === 1 ? 'turn' : 'turns'} · ${r.changes} ${r.changes === 1 ? 'change' : 'changes'}`,
          },
          {
            id: 'goals',
            header: 'Goals',
            cell: (r) =>
              r.goals === 0
                ? 'None set'
                : `${r.goalsDone} of ${r.goals} done${r.todosLeft > 0 ? ` · ${r.todosLeft} left for you` : ''}`,
          },
        ]}
        empty={
          <EmptyState
            title="No session matches"
            headingAs="h2"
            action={
              <Button variant="secondary" onClick={clear}>
                Show every session
              </Button>
            }
          >
            Nothing matches the search and status together.
          </EmptyState>
        }
        footer={
          <Pagination
            label="Sessions"
            page={paged.page}
            total={shown.length}
            onPageChange={setPage}
          />
        }
      />
    </>
  );
}

function SessionName({ row }: { row: HistoryRow }) {
  return (
    <>
      {row.removed ? (
        <strong>{row.title}</strong>
      ) : (
        <Link to={sessionPath(row.id)}>{row.title}</Link>
      )}
      {row.summary === '' ? null : <p className="sh-summary">{row.summary}</p>}
      {row.removed ? (
        <p className="sh-muted">{`Chat and files removed ${SESSION_FILES_DAYS} days after it closed; this record is kept.`}</p>
      ) : null}
    </>
  );
}
