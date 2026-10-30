import { classifyEmails, parseCsvEmails, teamId } from '@gurukul/schema';
import type { ClassifiedEmail, Team } from '@gurukul/schema';
import {
  Button,
  ChoiceCard,
  Dialog,
  EmailChipInput,
  EmptyState,
  Input,
  PlusIcon,
  SegmentedControl,
  UserIcon,
  UsersIcon,
  useToast,
} from '@gurukul/ui';
import { useEffect, useRef, useState } from 'react';
import { toastError } from '../errors';
import { useDebounced } from '../data/useDebounced';
import type { Loadable } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { MAX_MEMBERS, SEARCH_DELAY_MS, checkTeamName, searchPrefix } from './model';
import type { ConsoleData, UserRow } from './types';

export type AudienceMode = 'teams' | 'people';

/** How many teams or people show before "Show more". */
export const PAGE = 10;

const MODES = [
  { value: 'teams', label: 'Teams' },
  { value: 'people', label: 'People' },
] as const;

const stamp = () => Date.now();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const newTeamClassifier = (email: string) =>
  classifyEmails([email], { signedIn: new Set(), assigned: new Set() })[0] as ClassifiedEmail;

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
        <PeoplePicker data={data} emails={emails} onEmails={onEmails} classify={classify} />
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
                <EmailChipInput
                  label="Members (optional)"
                  value={members}
                  onChange={setMembers}
                  classify={newTeamClassifier}
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

function PeoplePicker({
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
  const [query, setQuery] = useState('');
  const prefix = searchPrefix(useDebounced(query, SEARCH_DELAY_MS));
  const [browse, setBrowse] = useState<{
    rows: UserRow[];
    next: string | null;
    total: number | null;
    failed: boolean;
  }>({ rows: [], next: null, total: null, failed: false });
  const [answer, setAnswer] = useState<{ prefix: string; rows: UserRow[] } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const latest = useRef(0);
  const [dragging, setDragging] = useState(false);

  // The first ten people, and how many there are, before anything is typed.
  useEffect(() => {
    let live = true;
    Promise.all([data.usersPage(null, PAGE), data.userCount()]).then(
      ([page, total]) =>
        live && setBrowse({ rows: page.rows, next: page.nextCursor, total, failed: false }),
      () => live && setBrowse((b) => ({ ...b, failed: true })),
    );
    return () => {
      live = false;
    };
  }, [data]);

  // A typed search answers instead; only the newest question's answer is shown.
  useEffect(() => {
    const mine = ++latest.current;
    if (!prefix) return;
    void data.searchUsers(prefix).then((rows) => {
      if (mine === latest.current) setAnswer({ prefix, rows });
    });
  }, [data, prefix]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const page = await data.usersPage(browse.next, PAGE);
      setBrowse((b) => ({ ...b, rows: [...b.rows, ...page.rows], next: page.nextCursor }));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = (email: string, on: boolean) =>
    onEmails(on ? [...new Set([...emails, email])] : emails.filter((e) => e !== email));
  const readCsv = async (file: File | undefined) => {
    if (file) onEmails([...new Set([...emails, ...parseCsvEmails(await file.text())])]);
  };

  // An answer counts only for the text it was asked about.
  const found = prefix && answer?.prefix === prefix ? answer.rows : null;
  const rows = found ?? browse.rows;
  const searching = found !== null || (query.trim().length >= 2 && prefix === '');
  return (
    <>
      <Input
        label="Search people"
        hideLabel
        type="search"
        placeholder="Search people by name or email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="console-muted" aria-live="polite">
        {found !== null
          ? `${plural(found.length, 'match', 'matches')} for “${query.trim()}”`
          : browse.total === null
            ? browse.failed
              ? 'The list of people did not load. You can still add emails below.'
              : 'Counting people…'
            : `Showing ${rows.length} of ${plural(browse.total, 'person', 'people')}`}
        {emails.length > 0 ? ` · ${emails.length} selected` : ''}
      </p>
      {rows.length === 0 && browse.total !== null && !searching ? (
        <EmptyState title="Nobody has signed in yet">
          Add the emails of the people you want to invite below.
        </EmptyState>
      ) : found !== null && found.length === 0 ? (
        <EmptyState title={`No one matches “${query.trim()}”`}>
          Not signed in yet? Add their email below and they are invited.
        </EmptyState>
      ) : (
        <ul className="console-choice-grid">
          {rows.map((u) => (
            <ChoiceCard
              key={u.uid}
              icon={<UserIcon />}
              title={u.displayName || u.email}
              meta={u.displayName ? u.email : undefined}
              selectLabel={u.email}
              selected={emails.includes(u.email)}
              onSelectedChange={(on) => toggle(u.email, on)}
            />
          ))}
        </ul>
      )}
      {found === null && browse.next ? (
        <Button variant="ghost" loading={loadingMore} onClick={() => void more()}>
          Show more people
        </Button>
      ) : null}
      <EmailChipInput
        label="Email addresses"
        value={emails}
        onChange={onEmails}
        classify={classify}
      />
      <p className="console-muted">
        Everyone you pick appears above. Paste more emails, commas or new lines, to invite people
        who have not signed in yet.
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
