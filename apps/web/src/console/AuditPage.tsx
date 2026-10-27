import { DataTable, EmptyState } from '@gurukul/ui';
import { useCallback } from 'react';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { longDate } from '../pariksha/model';
import { useConsole } from './ConsoleProvider';
import { auditLabel } from './model';
import type { AuditRow } from './types';

/** `/kulapati/audit`: the newest Kulapati and Acharya actions, read-only. Entries come from functions. */
export function AuditPage() {
  const { data } = useConsole();
  const result = useAsync(useCallback(() => data.auditLog(), [data]));

  return (
    <main className="page console">
      <p className="article__kicker">Kulapati</p>
      <h1 className="page__title">Audit log</h1>
      <p>The latest 100 actions, newest first. Nothing here can be edited.</p>
      <Loaded loadable={result}>
        {(rows) => (
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
              { id: 'what', header: 'Action', cell: (r) => auditLabel(r.action) },
              { id: 'target', header: 'Target', cell: (r) => r.target ?? '—' },
            ]}
          />
        )}
      </Loaded>
    </main>
  );
}
