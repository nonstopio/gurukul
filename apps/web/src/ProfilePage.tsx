import {
  Avatar,
  Button,
  Card,
  Chip,
  LogOutIcon,
  Page,
  PageHeader,
  SegmentedControl,
  Select,
  StatCard,
  useToast,
} from '@gurukul/ui';
import type { LabelSet, Role } from '@gurukul/schema';
import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { useLabelSet, useSession, useUser } from './auth/AuthProvider';
import { topRole } from './Shell';
import { useLearnerData } from './data/DataProvider';
import { useAsync } from './data/useAsync';
import { LABEL_OPTIONS, useSaveLabels } from './labels/LabelChoice';
import type { Terms } from './labels/terms';
import { useTerms } from './labels/useTerms';
import { Loaded } from './learn/ui';
import { log } from './log';
import { THEME_CHOICES, useTheme } from './theme';
import type { ThemeChoice } from './theme';

/** What each role lets a person do, in their own label set. */
function roleRows(t: Terms): Record<Role, { name: string; can: string }> {
  return {
    learner: { name: t.Learner, can: `Takes courses and ${t.quizzes}, and earns certificates.` },
    educator: { name: t.Educator, can: `Writes and publishes courses in ${t.Studio}.` },
    admin: {
      name: t.Admin,
      can: 'Assigns courses, manages people and roles, and sets up the org.',
    },
  };
}

/**
 * `/profile`: who you are (from Google, read only), your roles, the team and label set you can
 * change, and your learning in three numbers. Reached from the account menu.
 */
export function ProfilePage() {
  const { roles, signOut } = useSession();
  const user = useUser();
  const t = useTerms();
  // Signed-in accounts always have an email (only @nonstopio.com ones get in).
  const name = user.displayName ?? String(user.email);
  const rows = roleRows(t);
  const tone = topRole(roles);

  return (
    <Page width="reading">
      <PageHeader
        eyebrow="Your profile"
        title={name}
        lead={user.email}
        actions={
          <Button variant="secondary" icon={<LogOutIcon />} onClick={() => void signOut()}>
            Sign out
          </Button>
        }
      />
      <Card title="Account">
        <div className="profile__who">
          <Avatar name={name} tone={tone} size={48} />
          <p className="profile__note">
            Your name and email come from your NonStop Google account; certificates print that name.
            Change them in Google and sign in again.
          </p>
        </div>
        <ul className="profile__roles" aria-label="Your roles">
          {roles.map((role) => (
            <li key={role}>
              <Chip tone={role === 'learner' ? 'neutral' : 'accent'}>{rows[role].name}</Chip>
              <span>{rows[role].can}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Preferences">
        <div className="profile__prefs">
          <TeamForm />
          <LabelsChoice />
          <ThemeChoiceControl />
        </div>
      </Card>
      <Learning />
    </Page>
  );
}

/** The team: picked from `config/org.teams`, saved on its own button. */
function TeamForm() {
  const { uid } = useUser();
  const { team: saved } = useSession();
  const data = useLearnerData();
  const toast = useToast();
  const t = useTerms();
  const teams = useAsync(useCallback(() => data.orgTeams(), [data]));
  const [team, setTeam] = useState(saved ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await data.setTeam(uid, team === '' ? null : team);
      toast.show('Team saved', { tone: 'success' });
    } catch (err) {
      log.error('Saving team failed', err, { uid });
      toast.show('Could not save your team. Try again.', { tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Loaded loadable={teams} skeleton={1}>
      {(list) =>
        list.length === 0 ? (
          <p className="profile__note">
            {`No teams yet: your ${t.admin} adds them in Org settings.`}
          </p>
        ) : (
          <form className="profile__team" onSubmit={(e) => void save(e)}>
            <Select
              label="Team"
              hint="Used to assign courses to a whole team."
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              <option value="">No team</option>
              {list.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
            <Button
              type="submit"
              variant="secondary"
              loading={saving}
              disabled={team === (saved ?? '')}
            >
              Save team
            </Button>
          </form>
        )
      }
    </Loaded>
  );
}

/** Which names the app uses; saved at once, like the account menu's switch. */
function LabelsChoice() {
  const labels = useLabelSet();
  const save = useSaveLabels();
  return (
    <div className="profile__labels">
      <p className="profile__label">Names</p>
      <SegmentedControl<LabelSet>
        label="Names"
        value={labels}
        options={LABEL_OPTIONS.map((o) => ({ value: o.set, label: o.title }))}
        onChange={(set) => void save(set)}
      />
    </div>
  );
}

const THEME_TITLE: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/** Light, Dark, or follow the device; applied at once and remembered on this device. */
function ThemeChoiceControl() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="profile__labels">
      <p className="profile__label">Appearance</p>
      <SegmentedControl<ThemeChoice>
        label="Appearance"
        value={theme}
        options={THEME_CHOICES.map((c) => ({ value: c, label: THEME_TITLE[c] }))}
        onChange={setTheme}
      />
    </div>
  );
}

/** Courses in progress, completed, and certificates, from the person's own progress. */
function Learning() {
  const { uid } = useUser();
  const data = useLearnerData();
  const summary = useAsync(
    useCallback(async () => {
      const [progress, certificates] = await Promise.all([
        data.myProgress(uid),
        data.myCertificates(uid),
      ]);
      return {
        started: progress.filter((p) => p.completedAt === null).length,
        completed: progress.filter((p) => p.completedAt !== null).length,
        certificates: certificates.filter((c) => !c.revoked).length,
      };
    }, [data, uid]),
  );
  return (
    <Card title="Your learning" actions={<Link to="/certificates">Your certificates</Link>}>
      <Loaded loadable={summary} skeleton={1}>
        {(s) => (
          <div className="profile__stats">
            <StatCard label="In progress" value={s.started} />
            <StatCard label="Completed" value={s.completed} />
            <StatCard label="Certificates" value={s.certificates} />
          </div>
        )}
      </Loaded>
    </Card>
  );
}
