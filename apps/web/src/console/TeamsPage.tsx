import { classifyEmails, teamId } from '@gurukul/schema';
import type { EmailClassification } from '@gurukul/ui';
import type { Team } from '@gurukul/schema';
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  Page,
  PageHeader,
  Pagination,
  useToast,
} from '@gurukul/ui';
import { useCallback, useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useSession, useUser } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { pageFor } from '../paging';
import { Loaded } from '../learn/ui';
import { useConsole } from './ConsoleProvider';
import { PeopleField } from './PeopleField';
import { MAX_MEMBERS, checkTeamName } from './model';

const members = (n: number) =>
  n === 0 ? 'No members yet' : `${n} ${n === 1 ? 'member' : 'members'}`;

/**
 * `/studio/teams`: the teams with their members. A team is created and edited in one dialog (a name
 * and member emails). Only an Admin deletes one, after typing its name: a course can be limited to
 * a team, and deleting it shuts everyone on it out. Writes go straight to Firestore under the rules,
 * like Org settings.
 */
export function TeamsPage() {
  const { data } = useConsole();
  const t = useTerms();
  const isAdmin = useSession().roles.includes('admin');
  const uid = useUser().uid;
  // An Educator edits only the teams they made; the rules hold the same line.
  const mayEdit = (team: Team) => isAdmin || team.createdBy === uid;
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
        lead={`Groups of people you can assign courses to together. ${t.Learners} see the teams they are on on their profile.`}
        actions={<Button onClick={() => setEditing('new')}>Create team</Button>}
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
                    action={<Button onClick={() => setEditing('new')}>Create team</Button>}
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
                    id: 'actions',
                    header: <span className="sr-only">Actions</span>,
                    align: 'end',
                    cell: (team) => (
                      <span className="console-row__chips">
                        {mayEdit(team) ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={`Edit ${team.name}`}
                            onClick={() => setEditing(team)}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {isAdmin ? (
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
                        ) : null}
                      </span>
                    ),
                  },
                ]}
              />
              {editing ? (
                <TeamDialog
                  team={editing === 'new' ? null : editing}
                  teams={teams}
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

/** Create (`team` null) or edit one team: its name and member emails. */
function TeamDialog({
  team,
  teams,
  onClose,
  onSaved,
}: {
  team: Team | null;
  teams: readonly Team[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const uid = useUser().uid;
  const { data } = useConsole();
  const toast = useToast();
  const formId = useId();
  const [name, setName] = useState(team?.name ?? '');
  const [emails, setEmails] = useState<string[]>(team?.memberEmails ?? []);
  const [signedIn, setSignedIn] = useState<ReadonlySet<string>>(new Set());
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void data.knownEmails(emails, []).then((k) => live && setSignedIn(k.signedIn));
    return () => {
      live = false;
    };
  }, [data, emails]);

  // Who has signed in decides "Invited"; an address that is not a NonStop one is invalid.
  const classify = (email: string): EmailClassification => {
    const [c] = classifyEmails([email], { signedIn, assigned: new Set() });
    return c as EmailClassification;
  };
  const invalid = emails.filter((e) => classify(e).status === 'rejected');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNameError(undefined);
    setError(undefined);
    const named = checkTeamName(teams, name, team?.id ?? null);
    if ('error' in named) return setNameError(named.error);
    const id = team?.id ?? teamId(named.name);
    if (!team && teams.some((t) => t.id === id)) {
      return setNameError('A team with a very similar name exists. Use a different name.');
    }
    if (invalid.length > 0) {
      return setError('Fix or remove the addresses marked invalid.');
    }
    if (emails.length > MAX_MEMBERS) return setError(`A team holds at most ${MAX_MEMBERS} people.`);
    // A team with people cannot be emptied; one that was already empty may still be renamed.
    if (emails.length === 0 && (!team || team.memberEmails.length > 0)) {
      return setError('Add at least one member.');
    }
    const saved: Team = {
      id,
      name: named.name,
      memberEmails: emails,
      createdAt: team && team.createdAt > 0 ? team.createdAt : Date.now(),
      // The creator never changes; a team made before creators were recorded keeps none. A name with
      // no document yet (`createdAt` 0) is created now, and a create must name its creator.
      ...(team && team.createdAt > 0
        ? team.createdBy
          ? { createdBy: team.createdBy }
          : {}
        : { createdBy: uid }),
    };
    setSaving(true);
    try {
      await data.saveTeam(saved, team?.name ?? null);
      toast.show(team ? `Saved ${saved.name}` : `Created ${saved.name}`, { tone: 'success' });
      onSaved();
    } catch (err) {
      log.error('Saving a team failed', err, { teamId: saved.id, members: emails.length });
      toast.show('Could not save the team. Try again.', { tone: 'danger' });
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={team ? `Edit ${team.name}` : 'Create team'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {team ? 'Save team' : 'Create team'}
          </Button>
        </>
      }
    >
      <form id={formId} className="console-flow" onSubmit={(e) => void submit(e)}>
        <Input
          label="Team name"
          value={name}
          maxLength={80}
          error={nameError}
          onChange={(e) => setName(e.target.value)}
        />
        <PeopleField
          data={data}
          label="Members"
          emails={emails}
          onEmails={setEmails}
          classify={classify}
          statusWords={{ signedIn: 'signed in', new: 'invited' }}
          placeholder="Search by name, or paste emails"
        />
        <p className="console-muted">
          People who have not signed in yet are marked invited: they join the team the moment they
          do.
        </p>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </Dialog>
  );
}
