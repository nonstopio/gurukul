import { Button, DataTable, EmptyState, Page, PageHeader, useToast } from '@gurukul/ui';
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
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const loadMore = async (from: AuditCursor) => {
    setLoading(true);
    try {
      const page = await data.auditPage(from, PAGE_SIZE);
      setLater((prev) => ({
        rows: [...(prev?.rows ?? []), ...page.rows],
        cursor: page.nextCursor,
      }));
    } catch (e) {
      log.error('Audit page failed to load', e);
      toast.show('Could not load more entries. Check your connection and try again.', {
        tone: 'danger',
      });
    }
    setLoading(false);
  };

  return (
    <Page width="wide">
      <PageHeader
        eyebrow={t.Admin}
        title="Audit log"
        lead="Every recorded action, newest first. Nothing here can be edited."
      />
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
                  {
                    id: 'when',
                    header: 'When',
                    rowHeader: true,
                    cell: (r) => (r.at ? longDate(r.at) : '—'),
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
              />
              {next !== null && (
                <div>
                  <Button variant="secondary" loading={loading} onClick={() => void loadMore(next)}>
                    Load older entries
                  </Button>
                </div>
              )}
            </>
          );
        }}
      </Loaded>
    </Page>
  );
}
