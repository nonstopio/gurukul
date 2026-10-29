import { Button, EmptyState, Input, Toggle, useToast } from '@gurukul/ui';
import type { OrgConfig } from '@gurukul/schema';
import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { useAsync } from '../data/useAsync';
import { log } from '../log';
import { Loaded } from '../learn/ui';
import { useConsole } from './ConsoleProvider';
import { addTeam } from './model';

/** `/kulapati/settings`: the teams learners pick from and whether the daily reminders run. */
export function SettingsPage() {
  const { data } = useConsole();
  const result = useAsync(useCallback(() => data.orgSettings(), [data]));

  return (
    <main className="page console">
      <p className="article__kicker">Kulapati</p>
      <h1 className="page__title">Org settings</h1>
      <Loaded loadable={result}>{(saved) => <SettingsForm saved={saved} />}</Loaded>
    </main>
  );
}

function SettingsForm({ saved: initial }: { saved: OrgConfig }) {
  const { data } = useConsole();
  const toast = useToast();
  const [saved, setSaved] = useState(initial);
  const [teams, setTeams] = useState(initial.teams);
  const [reminders, setReminders] = useState(initial.reminders.enabled);
  const [signName, setSignName] = useState(initial.signatory.name);
  const [signRole, setSignRole] = useState(initial.signatory.role);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const signatory = { name: signName.trim(), role: signRole.trim() };
  const signatoryValid = signatory.name !== '' && signatory.role !== '';
  const dirty =
    reminders !== saved.reminders.enabled ||
    teams.join('\n') !== saved.teams.join('\n') ||
    signatory.name !== saved.signatory.name ||
    signatory.role !== saved.signatory.role;

  const add = (e: FormEvent) => {
    e.preventDefault();
    const next = addTeam(teams, name);
    if ('error' in next) {
      setError(next.error);
      return;
    }
    setTeams(next.teams);
    setName('');
    setError(undefined);
  };

  const save = async () => {
    const settings: OrgConfig = { ...saved, teams, reminders: { enabled: reminders }, signatory };
    setSaving(true);
    try {
      await data.saveOrgSettings(settings);
      setSaved(settings);
      toast.show('Settings saved', { tone: 'success' });
    } catch (e) {
      log.error('Saving org settings failed', e, { count: teams.length });
      toast.show('Could not save the settings. Try again.', { tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section aria-labelledby="teams-title" className="home-section">
        <h2 id="teams-title">Teams</h2>
        <p>
          Learners pick their team from this list. Learners filters by it, and Assign courses can
          assign a whole team. Removing a team leaves it on the profiles that already have it.
        </p>
        {teams.length === 0 ? (
          <EmptyState title="No teams yet">Add the first team below.</EmptyState>
        ) : (
          <ul className="course-list" aria-label="Teams">
            {teams.map((t) => (
              <li key={t} className="settings-team">
                <span>{t}</span>
                <Button
                  variant="secondary"
                  aria-label={`Remove ${t}`}
                  onClick={() => setTeams(teams.filter((x) => x !== t))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form className="settings-add" onSubmit={add}>
          <Input
            label="New team"
            value={name}
            maxLength={80}
            error={error}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Add team
          </Button>
        </form>
      </section>

      <section aria-labelledby="reminders-title" className="home-section">
        <h2 id="reminders-title">Reminders</h2>
        <p>
          A daily run at 04:00 UTC (09:30 in India) sends the reminders each mandatory course was
          assigned with, weekly or before it is due, as at most one email per person a day. Off,
          nobody is reminded automatically; you can still remind people from Learners.
        </p>
        <Toggle
          label="Send daily reminders"
          checked={reminders}
          onChange={(e) => setReminders(e.target.checked)}
        />
      </section>

      <section aria-labelledby="signatory-title" className="home-section">
        <h2 id="signatory-title">Certificate signatory</h2>
        <p>
          The name and role printed at the foot of every certificate. A certificate keeps the
          signatory it was issued with, so changing this affects only certificates issued from now
          on.
        </p>
        <Input
          label="Signatory name"
          value={signName}
          maxLength={120}
          onChange={(e) => setSignName(e.target.value)}
        />
        <Input
          label="Signatory role"
          value={signRole}
          maxLength={120}
          onChange={(e) => setSignRole(e.target.value)}
        />
        {signatoryValid ? null : <p role="alert">Enter both a name and a role to save.</p>}
      </section>

      <div className="settings-actions">
        <Button disabled={!dirty || !signatoryValid || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
        {dirty ? <p>You have unsaved changes.</p> : null}
      </div>
    </>
  );
}
