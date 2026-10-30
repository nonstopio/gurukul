import { Page, PageHeader, useToast } from '@gurukul/ui';
import type { LabelSet } from '@gurukul/schema';
import { useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import { log } from '../log';
import { terms } from './terms';

export const LABEL_OPTIONS: Array<{ set: LabelSet; title: string; text: string }> = [
  {
    set: 'gurukul',
    title: 'Gurukul names',
    text: 'Names from the forest schools of the Mahabharata.',
  },
  { set: 'generic', title: 'Plain English', text: 'The everyday words for each role and part.' },
];

/** Saves a label set. Not awaited: the profile snapshot updates from the local cache at once. */
export function useSaveLabels() {
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
 * the app uses: the Gurukul ones or plain English. The account menu and the profile change it later.
 */
export function LabelChoicePage() {
  const save = useSaveLabels();
  return (
    // Outside the shell (it comes before the first page), so it owns its `main`.
    <main id="content">
      <Page width="reading">
        <PageHeader
          title="Which names should Gurukul use?"
          lead="You can switch at any time from the account menu or your profile."
        />
        <div className="label-choice__options">
          {LABEL_OPTIONS.map(({ set, title, text }) => {
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
      </Page>
    </main>
  );
}
