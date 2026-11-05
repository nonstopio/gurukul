import type { Team } from '@gurukul/schema';
import {
  Button,
  Chip,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  Page,
  PageHeader,
  Pagination,
  useToast,
} from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { useSession } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { pageFor } from '../paging';
import { Loaded } from '../learn/ui';
import { useConsole } from './ConsoleProvider';
import { TeamDialog } from './TeamDialog';

export const members = (n: number) =>
  n === 0 ? 'No members yet' : `${n} ${n === 1 ? 'member' : 'members'}`;

/**
 * `/studio/teams`: every team with its members and managers. An Admin creates and edits teams in
 * one dialog (a name, member emails and up to 10 managers) and deletes one after typing its name: a
 * course can be limited to a team, and deleting it shuts everyone on it out. Educators read the
 * list (Studio's course access picks teams) but no longer change it: Managers keep their own teams
 * in the Team area (`.plan/21-managers.md`). Writes go straight to Firestore under the rules.
 */
export function TeamsPage() {
  const { data } = useConsole();
  const t = useTerms();
  const isAdmin = useSession().roles.includes('admin');
  const [typed, setTyped] = useState('');
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Team | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const result = useAsync(
    useCallback(async () => {
      return { teams: await data.teamList(), reload };
    }, [data, reload]),
  );

  const remove = async (team: Team) => {
    setBusy(true);
    try {
      await data.deleteTeam(team);
      toast.show(`Deleted ${team.name}`, { tone: 'success' });
      setDeleting(null);
      setReload(reload + 1);
    } catch (e) {
      log.error('Deleting a team failed', e, { teamId: team.id });
      toast.show('Could not delete the team. Try again.', { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={t.Studio}
        title="Teams"
        lead={
          isAdmin
            ? `Groups of people you can assign courses to together, and their ${t.managers}. ${t.Learners} see the teams they are on on their profile.`
            : `Groups of people courses are assigned to together. ${t.Managers} and ${t.Admins} keep them; you can limit a course to a team.`
        }
        actions={isAdmin ? <Button onClick={() => setEditing('new')}>Create team</Button> : null}
      />
      <Loaded loadable={result}>
        {({ teams }) => {
          const paged = pageFor(teams, page);
          return (
            <>
              <DataTable<Team>
                caption="Teams"
                rows={paged.rows}
                footer={
                  teams.length === 0 ? undefined : (
                    <Pagination
                      label="Teams"
                      page={paged.page}
                      total={teams.length}
                      onPageChange={setPage}
                    />
                  )
                }
                rowKey={(team) => team.id}
                empty={
                  <EmptyState
                    title="No teams yet"
                    action={
                      isAdmin ? (
                        <Button onClick={() => setEditing('new')}>Create team</Button>
                      ) : undefined
                    }
                  >
                    A team is a name and the people on it, so a whole group can be assigned a course
                    at once.
                  </EmptyState>
                }
                columns={[
                  { id: 'name', header: 'Team', rowHeader: true, cell: (team) => team.name },
                  {
                    id: 'members',
                    header: 'Members',
                    cell: (team) => members(team.memberEmails.length),
                  },
                  {
                    id: 'managers',
                    header: t.Managers,
                    cell: (team) => {
                      const managers = team.managerEmails ?? [];
                      return managers.length === 0 ? (
                        <Chip>{`No ${t.manager}`}</Chip>
                      ) : (
                        managers.join(', ')
                      );
                    },
                  },
                  // Educators read the list; only an Admin changes a team.
                  ...(isAdmin
                    ? [
                        {
                          id: 'actions',
                          header: <span className="sr-only">Actions</span>,
                          align: 'end' as const,
                          cell: (team: Team) => (
                            <span className="console-row__chips">
                              <Button
                                variant="secondary"
                                size="sm"
                                aria-label={`Edit ${team.name}`}
                                onClick={() => setEditing(team)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                aria-label={`Delete ${team.name}`}
                                onClick={() => {
                                  setTyped('');
                                  setDeleting(team);
                                }}
                              >
                                Delete
                              </Button>
                            </span>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
              {editing ? (
                <TeamDialog
                  team={editing === 'new' ? null : editing}
                  teams={teams}
                  managerField
                  onClose={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    setReload(reload + 1);
                  }}
                />
              ) : null}
              <Dialog
                open={deleting !== null}
                onClose={() => setDeleting(null)}
                title={`Delete ${deleting?.name ?? ''}?`}
                footer={
                  <>
                    <Button variant="secondary" onClick={() => setDeleting(null)}>
                      Keep team
                    </Button>
                    <Button
                      variant="danger"
                      loading={busy}
                      disabled={typed.trim() !== deleting?.name}
                      onClick={() => void remove(deleting as Team)}
                    >
                      {`Delete ${deleting?.name ?? ''}`}
                    </Button>
                  </>
                }
              >
                <p>
                  Everyone on it loses the courses that only this team can open. Courses already
                  assigned stay assigned. This cannot be undone.
                </p>
                <Input
                  label={`Type ${deleting?.name ?? ''} to delete it`}
                  value={typed}
                  autoComplete="off"
                  onChange={(e) => setTyped(e.target.value)}
                />
              </Dialog>
            </>
          );
        }}
      </Loaded>
    </Page>
  );
}
