import { Button, Chip, Dialog, EmptyState, Input } from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { useAsync } from '../../data/useAsync';
import { Loaded } from '../../learn/ui';
import { useTerms } from '../../labels/useTerms';
import { KIND_LABELS, matchBank } from '../questionEdit';
import { useStudio } from '../StudioProvider';
import type { BankQuestion } from '../types';

/** Lists the shared question bank (search by text or tag); adding one copies it into this Quiz with new ids. */
export function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (question: BankQuestion) => void;
}) {
  const { data } = useStudio();
  const t = useTerms();
  const bank = useAsync(useCallback(() => data.questionBank(), [data]));
  const [search, setSearch] = useState('');
  return (
    <Dialog open title="Import from question bank" onClose={onClose}>
      <Input
        label="Search the bank"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Loaded loadable={bank}>
        {(all) => {
          const found = matchBank(all, search);
          if (found.length === 0) {
            return (
              <EmptyState
                headingAs="h3"
                title={all.length === 0 ? 'The bank is empty' : 'Nothing matches'}
              >
                {all.length === 0
                  ? `Save a question from any ${t.Quiz} to reuse it here.`
                  : 'Try another word or tag.'}
              </EmptyState>
            );
          }
          return (
            <ul className="sc-rows" aria-label="Bank questions">
              {found.map((b) => (
                <li key={b.id} className="sc-row">
                  <div className="sc-media__main">
                    <p className="sc-bank__prompt">{b.question.prompt}</p>
                    <p className="sc-chips">
                      <Chip>{KIND_LABELS[b.question.kind]}</Chip>
                      {b.tags.map((tag) => (
                        <Chip key={tag} tone="info">
                          {tag}
                        </Chip>
                      ))}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => onImport(b)}>
                    Add to this {t.Quiz}
                  </Button>
                </li>
              ))}
            </ul>
          );
        }}
      </Loaded>
    </Dialog>
  );
}
