import {
  Button,
  Chip,
  DataTable,
  EmptyState,
  FilterBar,
  Input,
  Menu,
  Page,
  PageHeader,
  useToast,
} from '@gurukul/ui';
import { useCallback, useMemo, useState } from 'react';
import { userMessageOf } from '../api';
import { useSession, useUser } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { ConfirmDialog } from './ConfirmDialog';
import { BankQuestionDialog } from './questions/BankQuestionDialog';
import { ImportFromQuizDialog } from './questions/ImportFromQuizDialog';
import { KIND_LABELS, bankEntry, bankUsage, matchBank, quizSources } from './questionEdit';
import type { Keyed } from './questionEdit';
import { useStudio } from './StudioProvider';
import type { BankQuestion } from './types';

type Entry = Omit<BankQuestion, 'id' | 'createdBy'>;

/**
 * `/studio/bank`: questions written once, reused in any Quiz. Add one, import some from a Quiz,
 * edit or delete one (its creator or an Admin). Where each is used comes from the courses the
 * Studio already loads, matched by the question's text.
 */
export function QuestionBankPage() {
  const { data } = useStudio();
  const { uid } = useUser();
  const { roles } = useSession();
  const toast = useToast();
  const t = useTerms();
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<'new' | 'import' | null>(null);
  const [editing, setEditing] = useState<BankQuestion | null>(null);
  const [deleting, setDeleting] = useState<BankQuestion | null>(null);
  const bank = useAsync(
    useCallback(() => {
      void reload;
      return data.questionBank();
    }, [data, reload]),
  );
  const admin = roles.includes('admin');
  const courses = useAsync(useCallback(() => data.listCourses(uid, admin), [data, uid, admin]));
  const rows = useMemo(() => (courses.state === 'ready' ? courses.value : []), [courses]);

  const done = (message: string) => {
    toast.show(message, { tone: 'success' });
    setReload((n) => n + 1);
  };

  const create = async (entry: Entry) => {
    try {
      await data.addToBank(entry, uid);
      log.info('Question added to the bank', { questionId: entry.question.id });
      setDialog(null);
      done('Question added to the bank');
    } catch (e) {
      log.error('Adding a question to the bank failed', e, { questionId: entry.question.id });
      toast.show(userMessageOf(e, "Couldn't add the question. Try again."), { tone: 'danger' });
    }
  };

  const update = async (target: BankQuestion, entry: Entry) => {
    try {
      await data.updateInBank(target.id, entry);
      log.info('Question in the bank changed', { questionId: target.question.id });
      setEditing(null);
      done('Question updated');
    } catch (e) {
      log.error('Changing a question in the bank failed', e, { questionId: target.question.id });
      toast.show(userMessageOf(e, "Couldn't save the question. Try again."), { tone: 'danger' });
    }
  };

  const importMany = async (picked: Keyed[], tags: string[]) => {
    try {
      for (const keyed of picked) await data.addToBank(bankEntry(keyed, tags), uid);
      log.info('Questions imported into the bank', { count: picked.length });
      setDialog(null);
      done(`${picked.length} ${picked.length === 1 ? 'question' : 'questions'} added to the bank`);
    } catch (e) {
      log.error('Importing questions into the bank failed', e, { count: picked.length });
      toast.show(userMessageOf(e, "Couldn't import the questions. Try again."), {
        tone: 'danger',
      });
      setReload((n) => n + 1);
    }
  };

  const remove = async (entry: BankQuestion) => {
    setDeleting(null);
    try {
      await data.removeFromBank(entry.id);
      log.info('Question removed from the bank', { questionId: entry.question.id });
      done('Removed from the question bank');
    } catch (e) {
      log.error('Removing a question from the bank failed', e, { questionId: entry.question.id });
      toast.show(userMessageOf(e, "Couldn't remove the question. Try again."), { tone: 'danger' });
    }
  };

  const actions = (
    <>
      <Button
        variant="secondary"
        disabled={courses.state !== 'ready'}
        onClick={() => setDialog('import')}
      >
        {`Import from a ${t.Quiz}`}
      </Button>
      <Button onClick={() => setDialog('new')}>New question</Button>
    </>
  );

  return (
    <Page>
      <PageHeader
        eyebrow={t.Studio}
        title="Question bank"
        lead={`Write a question once, then add it to any ${t.Quiz}.`}
        actions={actions}
      />
      <Loaded loadable={bank}>
        {(all) => {
          if (all.length === 0) {
            return (
              <EmptyState headingAs="h2" title="Write questions once, use them everywhere">
                {`The bank holds questions you can drop into any ${t.Quiz}, so you never retype a good one. Write a new question, or import some from a ${t.Quiz} you already built, using the buttons above.`}
              </EmptyState>
            );
          }
          const found = matchBank(all, search);
          const mine = (e: BankQuestion) => e.createdBy === uid || admin;
          return (
            <>
              <FilterBar
                label="Filter questions"
                count={`${found.length} of ${all.length}`}
                canClear={search !== ''}
                onClear={() => setSearch('')}
              >
                <Input
                  label="Search by text or topic"
                  hideLabel
                  type="search"
                  placeholder="Search by text or topic"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </FilterBar>
              <DataTable
                caption="Bank questions"
                rows={found}
                rowKey={(e) => e.id}
                empty={
                  <EmptyState headingAs="h2" title="Nothing matches">
                    Try another word or topic.
                  </EmptyState>
                }
                columns={[
                  {
                    id: 'question',
                    header: 'Question',
                    rowHeader: true,
                    cell: (e) => <span className="sc-bank__prompt">{e.question.prompt}</span>,
                  },
                  {
                    id: 'type',
                    header: 'Type',
                    cell: (e) => <Chip>{KIND_LABELS[e.question.kind]}</Chip>,
                  },
                  {
                    id: 'topic',
                    header: 'Topic',
                    cell: (e) =>
                      e.tags.length === 0 ? (
                        '—'
                      ) : (
                        <span className="sc-chips">
                          {e.tags.map((tag) => (
                            <Chip key={tag} tone="info">
                              {tag}
                            </Chip>
                          ))}
                        </span>
                      ),
                  },
                  {
                    id: 'used',
                    header: 'Used in',
                    cell: (e) => {
                      if (courses.state !== 'ready') return '—';
                      const used = bankUsage(e.question.prompt, rows);
                      return used.length === 0 ? 'Not used yet' : used.join(', ');
                    },
                  },
                  {
                    id: 'actions',
                    header: <span className="sr-only">Actions</span>,
                    align: 'end',
                    cell: (e) =>
                      mine(e) ? (
                        <Menu
                          label={`Actions for ${e.question.prompt}`}
                          items={[
                            { label: 'Edit', onSelect: () => setEditing(e) },
                            { separator: true },
                            { label: 'Delete', danger: true, onSelect: () => setDeleting(e) },
                          ]}
                        />
                      ) : null,
                  },
                ]}
              />
            </>
          );
        }}
      </Loaded>
      {dialog === 'new' ? (
        <BankQuestionDialog onClose={() => setDialog(null)} onSave={create} />
      ) : null}
      {editing ? (
        <BankQuestionDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(entry) => update(editing, entry)}
        />
      ) : null}
      {dialog === 'import' ? (
        <ImportFromQuizDialog
          sources={quizSources(rows)}
          bankPrompts={
            new Set(
              bank.state === 'ready'
                ? bank.value.map((b) => b.question.prompt.trim().toLowerCase())
                : [],
            )
          }
          onClose={() => setDialog(null)}
          onImport={importMany}
        />
      ) : null}
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
