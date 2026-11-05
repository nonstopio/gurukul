import type { Team } from '@gurukul/schema';
import {
  Button,
  DataTable,
  EmptyState,
  Page,
  PageHeader,
  Pagination,
  UsersIcon,
  buttonClass,
} from '@gurukul/ui';
import { useState } from 'react';
import { Link } from 'react-router';
import { useSession, useUser } from '../auth/AuthProvider';
import { TeamDialog } from '../console/TeamDialog';
import { members } from '../console/TeamsPage';
import { Loaded } from '../learn/ui';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { pageFor } from '../paging';
import { editableHere, useMyTeams } from './useMyTeams';

/**
 * `/team`: the teams I manage (every team, for an Admin), with member counts. Each opens its report.
 * Create team is the Teams page's dialog with the managers fixed to me; Edit changes a team's name
 * and members and never its managers, which only an Admin sets (`/studio/teams`).
 */
export function TeamHomePage() {
  const t = useTerms();
  const admin = useSession().roles.includes('admin');
  const email = String(useUser().email);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Team | 'new' | null>(null);
  const result = useMyTeams(reload);
  const create = <Button onClick={() => setEditing('new')}>Create team</Button>;

  return (
    <Page>
      <PageHeader
        eyebrow="Team"
        title="My teams"
        lead={
          admin
            ? `Every team, since you are one of the ${t.Admins}. Open one to see who is behind, change due dates and send reminders.`
            : 'The teams you manage. Open one to see who is behind, change due dates and send reminders.'
        }
        actions={
          <>
            <Link className={buttonClass('secondary')} to="/team/assign">
              Assign courses
            </Link>
            {create}
          </>
        }
      />
      <Loaded loadable={result}>
        {(teams) => {
          const paged = pageFor(teams, page);
          return (
            <>
              <DataTable<Team>
                caption="My teams"
                rows={paged.rows}
                rowKey={(team) => team.id}
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
                empty={
                  <EmptyState title="No teams yet" icon={<UsersIcon />} action={create}>
                    {admin
                      ? 'Create a team, then assign it courses and follow how its people get on.'
                      : `Create a team of the people you look after, or ask ${article(t.Admin)} to name you on one.`}
                  </EmptyState>
                }
                columns={[
                  {
                    id: 'name',
                    header: 'Team',
                    rowHeader: true,
                    cell: (team) => (
                      <Link className="team-link" to={`/team/${encodeURIComponent(team.id)}`}>
                        {team.name}
                      </Link>
                    ),
                  },
                  {
                    id: 'members',
                    header: 'Members',
                    cell: (team) => members(team.memberEmails.length),
                  },
                  {
                    id: 'actions',
                    header: <span className="sr-only">Actions</span>,
                    align: 'end',
                    cell: (team) =>
                      editableHere(team, admin) ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`Edit ${team.name}`}
                          onClick={() => setEditing(team)}
                        >
                          Edit
                        </Button>
                      ) : null,
                  },
                ]}
              />
              {editing ? (
                <TeamDialog
                  team={editing === 'new' ? null : editing}
                  teams={teams}
                  newManagers={[email]}
                  // A Manager cannot read a team that does not list them (see `SaveTeamOptions`).
                  checkTaken={admin}
                  onClose={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    setReload(reload + 1);
                  }}
                />
              ) : null}
            </>
          );
        }}
      </Loaded>
    </Page>
  );
}
