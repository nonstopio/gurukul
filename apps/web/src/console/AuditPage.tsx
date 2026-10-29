import { Button, DataTable, EmptyState } from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { longDate } from '../quiz/model';
import { useConsole } from './ConsoleProvider';
import { auditDetail, auditLabel } from './model';
import type { AuditCursor, AuditRow } from './types';

const PAGE_SIZE = 50;

/** `/admin/audit`: Admin and Educator actions, newest first, read-only. Entries come from functions. */
export function AuditPage() {
  const { data } = useConsole();
  const t = useTerms();
  const first = useAsync(useCallback(() => data.auditPage(null, PAGE_SIZE), [data]));
  const [later, setLater] = useState<{ rows: AuditRow[]; cursor: AuditCursor | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadMore = async (from: AuditCursor) => {
    setLoading(true);
    setFailed(false);
    try {
      const page = await data.auditPage(from, PAGE_SIZE);
      setLater((prev) => ({
        rows: [...(prev?.rows ?? []), ...page.rows],
        cursor: page.nextCursor,
      }));
    } catch (e) {
      log.error('Audit page failed to load', e);
      setFailed(true);
    }
    setLoading(false);
  };

  return (
    <main className="page console">
      <p className="article__kicker">{t.Admin}</p>
      <h1 className="page__title">Audit log</h1>
      <p>Every recorded action, newest first. Nothing here can be edited.</p>
      <Loaded loadable={first}>
        {(page) => {
          const rows = [...page.rows, ...(later?.rows ?? [])];
          const next = later === null ? page.nextCursor : later.cursor;
          return (
            <>
              <DataTable<AuditRow>
                caption="Audit log"
                rows={rows}
                rowKey={(r) => r.id}
                empty={
                  <EmptyState title="Nothing recorded yet">
                    Assignments, role changes, reminders and course publishing appear here.
                  </EmptyState>
                }
                columns={[
                  { id: 'when', header: 'When', cell: (r) => (r.at ? longDate(r.at) : '—') },
                  { id: 'who', header: 'Who', cell: (r) => r.by },
                  { id: 'what', header: 'Action', cell: (r) => auditLabel(r.action, t) },
                  { id: 'target', header: 'Target', cell: (r) => r.target ?? '—' },
                  {
                    id: 'detail',
                    header: 'Detail',
                    cell: (r) => auditDetail(r.action, r.detail, t) ?? '—',
                  },
                ]}
              />
              {failed && (
                <p role="alert">
                  Could not load more entries. Check your connection and try again.
                </p>
              )}
              {next !== null && (
                <Button variant="secondary" disabled={loading} onClick={() => void loadMore(next)}>
                  {loading ? 'Loading…' : 'Load older entries'}
                </Button>
              )}
            </>
          );
        }}
      </Loaded>
    </main>
  );
}
