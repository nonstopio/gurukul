import { Button, Card, Chip, EmptyState, Input, useToast } from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { userMessageOf } from '../api';
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
      toast.show(userMessageOf(e, "Couldn't remove the question. Try again."), { tone: 'danger' });
    }
  };

  return (
    <main className="page studio-bank">
      <h1 className="page__title">Question bank</h1>
      <p className="studio-muted">
        {`Questions saved from any ${t.Quiz}, ready to reuse. To change one, save the question again from the ${t.Quiz} where you edited it.`}
      </p>
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
              <Input
                label="Search by text or tag"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {found.length === 0 ? (
                <EmptyState headingAs="h2" title="Nothing matches">
                  Try another word or tag.
                </EmptyState>
              ) : (
                <ul className="studio-bank-list" aria-label="Bank questions">
                  {found.map((entry) => (
                    <li key={entry.id}>
                      <Card className="studio-bank-card">
                        <p className="studio-bank-item__prompt">{entry.question.prompt}</p>
                        <p className="studio-bank-meta">
                          <Chip>{KIND_LABELS[entry.question.kind]}</Chip>
                          {entry.tags.map((t) => (
                            <Chip key={t} tone="info">
                              {t}
                            </Chip>
                          ))}
                          <span className="studio-muted">
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
                          <Button variant="ghost" onClick={() => setDeleting(entry)}>
                            Delete
                          </Button>
                        ) : null}
                      </Card>
                    </li>
                  ))}
                </ul>
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
    </main>
  );
}
