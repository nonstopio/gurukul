import { Button, Card, Select, useToast } from '@gurukul/ui';
import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { log } from '../log';

/**
 * Asks a learner with no team to pick one from `config/org.teams`. Shown only while the profile
 * has no team and the Kulapati has listed some; nothing at all while the list loads or fails.
 * The write is not awaited: the profile snapshot updates from the local cache at once, which
 * hides the card, and a refused write puts it back with a toast.
 */
export function TeamPrompt() {
  const { uid } = useUser();
  const data = useLearnerData();
  const toast = useToast();
  const teams = useAsync(useCallback(() => data.orgTeams(), [data]));
  const [team, setTeam] = useState('');

  if (teams.state !== 'ready' || teams.value.length === 0) return null;

  const save = (e: FormEvent) => {
    e.preventDefault();
    data.setTeam(uid, team).catch((err: unknown) => {
      log.error('Saving team failed', err, { uid });
      toast.show('Could not save your team. Try again.', { tone: 'danger' });
    });
  };

  return (
    <Card as="section" aria-labelledby="team-title" className="team-prompt">
      <h2 id="team-title" className="team-prompt__title">
        Which team are you in?
      </h2>
      <p>Your Kulapati (admin) uses it to assign courses to a whole team.</p>
      <form className="team-prompt__form" onSubmit={save}>
        <Select label="Team" value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">Choose your team</option>
          {teams.value.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={team === ''}>
          Save team
        </Button>
      </form>
    </Card>
  );
}
