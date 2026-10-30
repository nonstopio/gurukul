import {
  Button,
  Card,
  Chip,
  EmptyState,
  FilterBar,
  Input,
  Page,
  PageHeader,
  useToast,
} from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { toastError } from '../errors';
import { useSession, useUser } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { ConfirmDialog } from './ConfirmDialog';
import { KIND_LABELS, matchBank } from './questionEdit';
import { useStudio } from './StudioProvider';
import type { BankQuestion } from './types';

/** `/studio/bank`: every question saved for reuse, searchable; the creator or an Admin may delete one. */
export function QuestionBankPage() {
  const { data } = useStudio();
  const { uid } = useUser();
  const { roles } = useSession();
  const toast = useToast();
  const t = useTerms();
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<BankQuestion | null>(null);
  const bank = useAsync(
    useCallback(() => {
      void reload;
      return data.questionBank();
    }, [data, reload]),
  );
  const admin = roles.includes('admin');

  const remove = async (entry: BankQuestion) => {
    setDeleting(null);
    try {
      await data.removeFromBank(entry.id);
      log.info('Question removed from the bank', { questionId: entry.question.id });
      toast.show('Removed from the question bank', { tone: 'success' });
      setReload((n) => n + 1);
    } catch (e) {
      log.error('Removing a question from the bank failed', e, { questionId: entry.question.id });
      toastError(toast, e, "Couldn't remove the question. Try again.", () => void remove(entry));
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={t.Studio}
        title="Question bank"
        lead={`Questions saved from any ${t.Quiz}, ready to reuse. To change one, save the question again from the ${t.Quiz} where you edited it.`}
      />
      <Loaded loadable={bank}>
        {(all) => {
          if (all.length === 0) {
            return (
              <EmptyState headingAs="h2" title="The question bank is empty">
                {`Open ${article(t.Quiz)} and choose Save to question bank on a question to add it here.`}
              </EmptyState>
            );
          }
          const found = matchBank(all, search);
          return (
            <>
              <FilterBar
                label="Filter questions"
                count={`${found.length} of ${all.length}`}
                canClear={search !== ''}
                onClear={() => setSearch('')}
              >
                <Input
                  label="Search by text or tag"
                  hideLabel
                  type="search"
                  placeholder="Search by text or tag"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </FilterBar>
              {found.length === 0 ? (
                <EmptyState headingAs="h2" title="Nothing matches">
                  Try another word or tag.
                </EmptyState>
              ) : (
                <Card>
                  <ul className="sc-rows" aria-label="Bank questions">
                    {found.map((entry) => (
                      <li key={entry.id} className="sc-row sc-bank__row">
                        <p className="sc-bank__prompt">{entry.question.prompt}</p>
                        <p className="sc-chips">
                          <Chip>{KIND_LABELS[entry.question.kind]}</Chip>
                          {entry.tags.map((tag) => (
                            <Chip key={tag} tone="info">
                              {tag}
                            </Chip>
                          ))}
                          <span className="sc-help">
                            Added by {entry.createdBy === uid ? 'you' : 'a colleague'}
                          </span>
                        </p>
                        <details>
                          <summary>Show answers</summary>
                          <ul>
                            {entry.question.options.map((o) => (
                              <li key={o.id}>
                                {o.text}
                                {entry.answers.includes(o.id) ? ' (correct)' : ''}
                              </li>
                            ))}
                          </ul>
                        </details>
                        {entry.createdBy === uid || admin ? (
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(entry)}>
                            Delete
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          );
        }}
      </Loaded>
      {deleting ? (
        <ConfirmDialog
          title="Delete this question from the bank?"
          confirmLabel="Delete question"
          onClose={() => setDeleting(null)}
          onConfirm={() => void remove(deleting)}
        >
          {`${t.Quizzes} that already use a copy keep it. Only the bank entry is removed.`}
        </ConfirmDialog>
      ) : null}
    </Page>
  );
}
