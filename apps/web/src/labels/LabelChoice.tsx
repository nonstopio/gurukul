import { useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Mascot,
  OptionCard,
  OptionCardGroup,
  OptionCardRow,
  Page,
  PageHeader,
  useToast,
} from '@gurukul/ui';
import type { MascotExpression } from '@gurukul/ui';
import type { LabelSet } from '@gurukul/schema';
import { useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import { log } from '../log';
import { DICTIONARY } from './terms';

export const LABEL_OPTIONS: Array<{ set: LabelSet; title: string; text: string }> = [
  {
    set: 'gurukul',
    title: 'Gurukul labels',
    text: 'Labels from the forest schools of the Mahabharata.',
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

const FACE: Record<LabelSet | 'none', MascotExpression> = {
  none: 'happy',
  gurukul: 'excited',
  generic: 'happy',
};
const SAYS: Record<LabelSet | 'none', string> = {
  none: 'Pranam! Before we begin, which words should I use?',
  gurukul: 'Lovely. I will call things by their Gurukul labels.',
  generic: 'Plain English it is. Simple and clear.',
};
// One row for the column title, then per group a label row and a row per term, then the call to action.
const ROWS = 2 + DICTIONARY.reduce((n, g) => n + 1 + g.rows.length, 0);

/**
 * Shown once, after the first sign-in, in place of every page until the person picks which labels
 * the app uses: the Gurukul ones or plain English. The two columns of one dictionary are the two
 * choices (each a button that saves on click, its rows aligned with the other's); the profile and
 * the sidebar change it later.
 */
export function LabelChoicePage() {
  const save = useSaveLabels();
  const [preview, setPreview] = useState<LabelSet | null>(null);
  const side = preview ?? 'none';
  return (
    // Outside the shell (it comes before the first page), so it owns its `main`.
    <main id="content">
      <Page>
        <PageHeader
          title="Which labels should Gurukul use?"
          lead="Gurukul comes from the forest schools of the Mahabharata. Pick the words you'd like to read, in Sanskrit or plain English. You can switch any time from the sidebar or your profile."
        />
        <div className="label-choice__owl">
          <Mascot expression={FACE[side]} size={96} />
          <p className="label-choice__says">{SAYS[side]}</p>
        </div>
        <div
          className="label-choice__dictionary"
          role="group"
          aria-label="Labels to use"
          style={{ '--rows': ROWS } as CSSProperties}
        >
          {LABEL_OPTIONS.map(({ set, title }) => (
            <OptionCard
              key={set}
              title={title}
              cta={`Select ${title}`}
              bodyId={`label-choice-${set}`}
              rows={ROWS}
              active={preview === set}
              onSelect={() => void save(set)}
              // Hover or focus previews a side without choosing it.
              onPreview={(on) => setPreview(on ? set : null)}
            >
              {DICTIONARY.map(({ group, rows }) => [
                <OptionCardGroup key={group}>{group}</OptionCardGroup>,
                ...rows.map((row) => (
                  <OptionCardRow key={row.generic} title={row[set]} note={row.meaning?.[set]} />
                )),
              ])}
            </OptionCard>
          ))}
        </div>
      </Page>
    </main>
  );
}
