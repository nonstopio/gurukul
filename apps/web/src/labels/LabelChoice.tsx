import { Button, useToast } from '@gurukul/ui';
import type { LabelSet } from '@gurukul/schema';
import { useSession, useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import { log } from '../log';
import { terms } from './terms';

const OPTIONS: Array<{ set: LabelSet; title: string; text: string }> = [
  {
    set: 'gurukul',
    title: 'Gurukul names',
    text: 'Names from the forest schools of the Mahabharata.',
  },
  { set: 'generic', title: 'Plain English', text: 'The everyday words for each role and part.' },
];

/** Saves a label set. Not awaited: the profile snapshot updates from the local cache at once. */
function useSaveLabels() {
  const { uid } = useUser();
  const data = useLearnerData();
  const toast = useToast();
  return (set: LabelSet) =>
    data.setLabels(uid, set).catch((err: unknown) => {
      log.error('Saving label set failed', err, { uid });
      toast.show('Could not save your choice. Try again.', { tone: 'danger' });
    });
}

/**
 * Shown once, after the first sign-in, in place of every page until the person picks which names
 * the app uses: the Gurukul ones or plain English. The sidebar switch changes it later.
 */
export function LabelChoicePage() {
  const save = useSaveLabels();
  return (
    <main className="label-choice" id="content">
      <h1 className="label-choice__title">Which names should Gurukul use?</h1>
      <p>You can switch at any time from the menu.</p>
      <div className="label-choice__options">
        {OPTIONS.map(({ set, title, text }) => {
          const t = terms(set);
          return (
            <button
              key={set}
              type="button"
              className="label-choice__option"
              onClick={() => void save(set)}
            >
              <span className="label-choice__name">{title}</span>
              <span>{text}</span>
              <span className="label-choice__examples">
                {[t.Learner, t.Educator, t.Admin, t.Chapter, t.Quiz].join(' · ')}
              </span>
            </button>
          );
        })}
      </div>
    </main>
  );
}

/** The sidebar switch between the two label sets. */
export function LabelSwitch() {
  const { labels } = useSession();
  const save = useSaveLabels();
  const next: LabelSet = labels === 'gurukul' ? 'generic' : 'gurukul';
  return (
    <Button variant="chrome" onClick={() => void save(next)}>
      {next === 'gurukul' ? 'Use Gurukul names' : 'Use plain English names'}
    </Button>
  );
}
