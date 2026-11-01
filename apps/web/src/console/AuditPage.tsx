import {
  DataTable,
  DEFAULT_PAGE_SIZE,
  EmptyState,
  Page,
  PageHeader,
  Pagination,
} from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { useTerms } from '../labels/useTerms';
import { useConsole } from './ConsoleProvider';
import { auditDetail, auditLabel, dateTime } from './model';
import type { AuditCursor, AuditRow } from './types';

/**
 * `/admin/audit`: Admin and Educator actions, newest first, read-only, 25 to a page with the day
 * and time of each. Entries come from functions. Each page is read from Firestore by cursor; the
 * cursor of every page already visited is kept, so Previous never re-reads a page.
 */
export function AuditPage() {
  const { data } = useConsole();
  const t = useTerms();
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<Array<AuditCursor | null>>([null]);
  const result = useAsync(
    useCallback(async () => {
      const [total, entries] = await Promise.all([
        data.auditCount(),
        data.auditPage(cursors[page - 1] ?? null, DEFAULT_PAGE_SIZE),
      ]);
      return { total, ...entries };
    }, [data, page, cursors]),
  );

  const goTo = (next: number, nextCursor: AuditCursor | null) => {
    if (next > page && nextCursor !== null) {
      setCursors((c) => {
        const copy = [...c];
        copy[page] = nextCursor;
        return copy;
      });
    }
    setPage(next);
  };

  return (
    <Page width="wide">
      <PageHeader
        eyebrow={t.Admin}
        title="Audit log"
        lead="Every recorded action, newest first. Nothing here can be edited."
      />
      <Loaded loadable={result}>
        {({ rows, total, nextCursor }) => (
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
              {
                id: 'when',
                header: 'When',
                rowHeader: true,
                cell: (r) => (r.at ? dateTime(r.at) : '—'),
              },
              { id: 'who', header: 'Who', cell: (r) => r.by },
              { id: 'what', header: 'Action', cell: (r) => auditLabel(r.action, t) },
              { id: 'target', header: 'Target', cell: (r) => r.target ?? '—' },
              {
                id: 'detail',
                header: 'Detail',
                cell: (r) => auditDetail(r.action, r.detail, t) ?? '—',
              },
            ]}
            footer={
              total > DEFAULT_PAGE_SIZE ? (
                <Pagination
                  page={page}
                  total={total}
                  onPageChange={(next) => goTo(next, nextCursor)}
                />
              ) : undefined
            }
          />
        )}
      </Loaded>
    </Page>
  );
}
