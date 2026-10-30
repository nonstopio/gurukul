import { classifyEmails, parseCsvEmails, teamId } from '@gurukul/schema';
import type { ClassifiedEmail, Team } from '@gurukul/schema';
import {
  Button,
  ChoiceCard,
  Dialog,
  EmptyState,
  Input,
  PlusIcon,
  SegmentedControl,
  UserIcon,
  UsersIcon,
  useToast,
} from '@gurukul/ui';
import { useState } from 'react';
import { toastError } from '../errors';
import type { Loadable } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { PeopleField } from './PeopleField';
import { MAX_MEMBERS, checkTeamName } from './model';
import type { ConsoleData } from './types';

export type AudienceMode = 'teams' | 'people';

/** How many teams or people show before "Show more". */
export const PAGE = 10;

const MODES = [
  { value: 'teams', label: 'Teams' },
  { value: 'people', label: 'People' },
] as const;

const stamp = () => Date.now();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** A new team's chips say something only when an address cannot be a member. */
const newTeamClassifier = (email: string) => {
  const [c] = classifyEmails([email], { signedIn: new Set(), assigned: new Set() });
  return c?.status === 'rejected' ? c : null;
};

/**
 * Step two of Assign: who gets the courses, either whole teams or a list of people, never both.
 * Switching asks first when something is already picked. Teams: search, pick many, make a new one
 * on the spot. People: search or browse, pick many, paste or import emails of people who have not
 * signed in yet.
 */
export function AudienceStep({
  data,
  mode,
  onMode,
  teamList,
  onTeamCreated,
  teamNames,
  onTeamNames,
  emails,
  onEmails,
  classify,
  summary,
}: {
  data: ConsoleData;
  mode: AudienceMode;
  /** Called after the switch is confirmed; the page clears what was picked. */
  onMode: (mode: AudienceMode) => void;
  teamList: Loadable<Team[]>;
  onTeamCreated: (team: Team) => void;
  teamNames: string[];
  onTeamNames: (names: string[]) => void;
  emails: string[];
  onEmails: (emails: string[]) => void;
  classify: (email: string) => ClassifiedEmail;
  /** The sentence under the picker: who will be assigned. */
  summary: string;
}) {
  const [asking, setAsking] = useState<AudienceMode | null>(null);
  const picked = mode === 'teams' ? teamNames.length : emails.length;

  const requestMode = (next: AudienceMode) => {
    if (next === mode) return;
    if (picked === 0) onMode(next);
    else setAsking(next);
  };

  return (
    <>
      <SegmentedControl
        label="Assign to"
        value={mode}
        options={[
          {
            value: 'teams',
            label: (
              <>
                <UsersIcon /> {MODES[0].label}
              </>
            ),
          },
          {
            value: 'people',
            label: (
              <>
                <UserIcon /> {MODES[1].label}
              </>
            ),
          },
        ]}
        onChange={requestMode}
      />
      {mode === 'teams' ? (
        <TeamsPicker
          data={data}
          teamList={teamList}
          onTeamCreated={onTeamCreated}
          teamNames={teamNames}
          onTeamNames={onTeamNames}
        />
      ) : (
        <PeopleMode data={data} emails={emails} onEmails={onEmails} classify={classify} />
      )}
      <p className="console-muted" aria-live="polite">
        {summary}
      </p>
      {asking ? (
        <Dialog
          open
          onClose={() => setAsking(null)}
          title={`Switch to ${asking}?`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAsking(null)}>
                {`Keep ${mode}`}
              </Button>
              <Button
                onClick={() => {
                  onMode(asking);
                  setAsking(null);
                }}
              >
                {`Switch to ${asking}`}
              </Button>
            </>
          }
        >
          <p>
            {mode === 'teams'
              ? `You picked ${plural(teamNames.length, 'team', 'teams')}. `
              : `You picked ${plural(emails.length, 'person', 'people')}. `}
            A course goes to teams or to people, not both, so switching clears them.
          </p>
        </Dialog>
      ) : null}
    </>
  );
}

function TeamsPicker({
  data,
  teamList,
  onTeamCreated,
  teamNames,
  onTeamNames,
}: {
  data: ConsoleData;
  teamList: Loadable<Team[]>;
  onTeamCreated: (team: Team) => void;
  teamNames: string[];
  onTeamNames: (names: string[]) => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (team: string, on: boolean) =>
    onTeamNames(on ? [...teamNames, team] : teamNames.filter((n) => n !== team));

  const create = async (teams: Team[]) => {
    const named = checkTeamName(teams, name, null);
    if ('error' in named) return setProblem(named.error);
    if (teams.some((x) => x.id === teamId(named.name))) {
      return setProblem('A team with a very similar name exists. Use a different name.');
    }
    if (members.length === 0) return setProblem('Add at least one member.');
    if (members.some((m) => newTeamClassifier(m)?.status === 'rejected')) {
      return setProblem('Fix or remove the addresses marked rejected.');
    }
    if (members.length > MAX_MEMBERS)
      return setProblem(`A team holds at most ${MAX_MEMBERS} people.`);
    setBusy(true);
    const team: Team = {
      id: teamId(named.name),
      name: named.name,
      memberEmails: members,
      createdAt: stamp(),
    };
    try {
      await data.saveTeam(team, null);
      onTeamCreated(team);
      onTeamNames([...teamNames, team.name]);
      toast.show(`Team ${team.name} created`, { tone: 'success' });
      setCreating(false);
      setName('');
      setMembers([]);
      setProblem(null);
    } catch (e) {
      toastError(toast, e, 'Could not create the team. Try again.');
    }
    setBusy(false);
  };

  return (
    <Loaded loadable={teamList}>
      {(teams) => {
        const text = query.trim().toLowerCase();
        const matches = teams.filter((x) => x.name.toLowerCase().includes(text));
        const shown = matches.slice(0, limit);
        return (
          <>
            <div className="console-pick-head">
              <Input
                label="Search teams"
                hideLabel
                type="search"
                placeholder="Search teams"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
              />
              <Button
                variant="secondary"
                icon={<PlusIcon />}
                aria-expanded={creating}
                onClick={() => setCreating(!creating)}
              >
                New team
              </Button>
            </div>
            {creating ? (
              <div className="console-new-team">
                <Input label="Team name" value={name} onChange={(e) => setName(e.target.value)} />
                <PeopleField
                  data={data}
                  label="Members"
                  emails={members}
                  onEmails={setMembers}
                  classify={newTeamClassifier}
                  placeholder="Search by name, or paste emails"
                />
                {problem ? (
                  <p role="alert" className="console-problem">
                    {problem}
                  </p>
                ) : null}
                <div className="console-flow-nav">
                  <Button variant="secondary" onClick={() => setCreating(false)}>
                    Cancel
                  </Button>
                  <Button loading={busy} onClick={() => void create(teams)}>
                    Create team
                  </Button>
                </div>
              </div>
            ) : null}
            <p className="console-muted" aria-live="polite" hidden={teams.length === 0 && creating}>
              {text
                ? `${plural(matches.length, 'team matches', 'teams match')} of ${teams.length}`
                : `Showing ${shown.length} of ${plural(teams.length, 'team', 'teams')}`}
              {teamNames.length > 0 ? ` · ${teamNames.length} selected` : ''}
            </p>
            {teams.length === 0 && creating ? null : teams.length === 0 ? (
              <EmptyState title="No teams yet">
                Use New team to make the first one, then pick it here.
              </EmptyState>
            ) : matches.length === 0 ? (
              <EmptyState title={`No team matches “${query.trim()}”`}>
                Try a shorter search, or make a new team.
              </EmptyState>
            ) : (
              <ul className="console-choice-grid">
                {shown.map((x) => (
                  <ChoiceCard
                    key={x.id}
                    icon={<UsersIcon />}
                    title={x.name}
                    meta={plural(x.memberEmails.length, 'member', 'members')}
                    selected={teamNames.includes(x.name)}
                    onSelectedChange={(on) => toggle(x.name, on)}
                  />
                ))}
              </ul>
            )}
            {matches.length > shown.length ? (
              <Button variant="ghost" onClick={() => setLimit(limit + PAGE)}>
                {`Show ${Math.min(PAGE, matches.length - shown.length)} more`}
              </Button>
            ) : null}
          </>
        );
      }}
    </Loaded>
  );
}

function PeopleMode({
  data,
  emails,
  onEmails,
  classify,
}: {
  data: ConsoleData;
  emails: string[];
  onEmails: (emails: string[]) => void;
  classify: (email: string) => ClassifiedEmail;
}) {
  const [dragging, setDragging] = useState(false);
  const readCsv = async (file: File | undefined) => {
    if (file) onEmails([...new Set([...emails, ...parseCsvEmails(await file.text())])]);
  };
  return (
    <>
      <PeopleField
        data={data}
        label="Add people"
        emails={emails}
        onEmails={onEmails}
        classify={classify}
        placeholder="Search by name or email, or paste a list of emails"
      />
      <p className="console-muted">
        Pick people from the list, or paste emails to invite people who have not signed in yet:
        commas, spaces or new lines all work.
      </p>
      <div className={dragging ? 'console-dropzone console-dropzone--over' : 'console-dropzone'}>
        <p>Drop a CSV file here, or choose one.</p>
        <Input
          label="CSV file (emails in the first column)"
          type="file"
          accept=".csv,text/csv"
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDrop={() => setDragging(false)}
          onChange={(e) => void readCsv(e.target.files?.[0])}
        />
      </div>
    </>
  );
}
