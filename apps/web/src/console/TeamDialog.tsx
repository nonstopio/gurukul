import { MAX_TEAM_MANAGERS, classifyEmails, teamId } from '@gurukul/schema';
import type { Team } from '@gurukul/schema';
import type { EmailClassification } from '@gurukul/ui';
import { Button, Dialog, Input, useToast } from '@gurukul/ui';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useUser } from '../auth/AuthProvider';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { useConsole } from './ConsoleProvider';
import { PeopleField } from './PeopleField';
import { MAX_MEMBERS, checkTeamName } from './model';

const lower = (emails: readonly string[]) => [
  ...new Set(emails.map((e) => e.trim().toLowerCase())),
];

/**
 * Create (`team` null) or edit one team: its name and member emails, and its managers where the
 * caller may set them. Used by the Teams page (an Admin sets managers with `managerField`) and the
 * Team area (a Manager's new team is managed by `newManagers`, themselves; an edit keeps the
 * managers exactly as they were, because the rules refuse a Manager's change to them).
 */
export function TeamDialog({
  team,
  teams,
  managerField = false,
  newManagers,
  checkTaken = true,
  onClose,
  onSaved,
}: {
  team: Team | null;
  /** The teams the caller can see, for the name checks. */
  teams: readonly Team[];
  /** Shows the Managers field (Admins only). */
  managerField?: boolean;
  /** The managers of a team created here, when there is no Managers field. */
  newManagers?: readonly string[];
  /** See `SaveTeamOptions.checkTaken`. */
  checkTaken?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const uid = useUser().uid;
  const { data } = useConsole();
  const t = useTerms();
  const toast = useToast();
  const formId = useId();
  const [name, setName] = useState(team?.name ?? '');
  const [emails, setEmails] = useState<string[]>(team?.memberEmails ?? []);
  const [managers, setManagers] = useState<string[]>(team?.managerEmails ?? []);
  const [signedIn, setSignedIn] = useState<ReadonlySet<string>>(new Set());
  const [nameError, setNameError] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  /** The field that sent the form with Enter, to focus again once a failed save unlocks it. */
  const resumeFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (saving || !resumeFocus.current) return;
    resumeFocus.current.focus();
    resumeFocus.current = null;
  }, [saving]);
  const everyone = [...emails, ...managers];

  useEffect(() => {
    let live = true;
    void data.knownEmails(everyone, []).then((k) => live && setSignedIn(k.signedIn));
    return () => {
      live = false;
    };
    // `everyone` is rebuilt every render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, everyone.join(',')]);

  // Who has signed in decides "Invited"; an address that is not a NonStop one is invalid.
  const classify = (email: string): EmailClassification => {
    const [c] = classifyEmails([email], { signedIn, assigned: new Set() });
    return c as EmailClassification;
  };
  const invalid = everyone.filter((e) => classify(e).status === 'rejected');

  /** The managers to save: the field's, the fixed ones for a new team, or the team's own. */
  const managerEmails = (): string[] | undefined => {
    if (managerField) {
      return managers.length > 0 || team?.managerEmails !== undefined ? lower(managers) : undefined;
    }
    if (!team && newManagers) return lower(newManagers);
    return team?.managerEmails;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNameError(undefined);
    setError(undefined);
    const named = checkTeamName(teams, name, team?.id ?? null);
    if ('error' in named) return setNameError(named.error);
    const id = team?.id ?? teamId(named.name);
    if (!team && teams.some((x) => x.id === id)) {
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
    if (managers.length > MAX_TEAM_MANAGERS) {
      return setError(`A team has at most ${MAX_TEAM_MANAGERS} ${t.managers}.`);
    }
    const managed = managerEmails();
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
      ...(managed ? { managerEmails: managed } : {}),
    };
    // Enter in a field sends the form, and the field goes inert with it: a failed save gives focus back.
    const active = document.activeElement;
    resumeFocus.current = e.currentTarget.contains(active) ? (active as HTMLElement) : null;
    setSaving(true);
    try {
      await data.saveTeam(saved, team?.name ?? null, { checkTaken });
      toast.show(team ? `Saved ${saved.name}` : `Created ${saved.name}`, { tone: 'success' });
      onSaved();
    } catch (err) {
      log.error('Saving a team failed', err, { teamId: saved.id, count: emails.length });
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
      {/* Locked while it saves: what is stored is what was on screen when Save was pressed. */}
      <form id={formId} className="console-flow" inert={saving} onSubmit={(e) => void submit(e)}>
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
        {managerField ? (
          <>
            <PeopleField
              data={data}
              label={t.Managers}
              emails={managers}
              onEmails={setManagers}
              classify={classify}
              statusWords={{ signedIn: 'signed in', new: 'invited' }}
              placeholder="Search by name, or paste emails"
            />
            <p className="console-muted">
              {`Up to ${MAX_TEAM_MANAGERS}. They assign this team courses and follow its progress once they are ${article(t.Manager)}: grant the role on Roles & access. With nobody here, only ${t.Admins} look after the team.`}
            </p>
          </>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </Dialog>
  );
}
