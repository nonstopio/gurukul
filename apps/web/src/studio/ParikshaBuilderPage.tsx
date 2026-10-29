import { validateForPublish } from '@gurukul/schema';
import { Button, Card, Chip, DragList, EmptyState, buttonClass, useToast } from '@gurukul/ui';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { userMessageOf } from '../api';
import { useUser } from '../auth/AuthProvider';
import { useConsole } from '../console/ConsoleProvider';
import { useAsync } from '../data/useAsync';
import { log } from '../log';
import { ConfirmDialog } from './ConfirmDialog';
import { DraftGate } from './DraftGate';
import { EditorBar, PreviewLink } from './EditorBar';
import { lessonsOf } from './lessonEdit';
import { ImportDialog } from './questions/ImportDialog';
import { ParikshaSettings } from './questions/ParikshaSettings';
import { QuestionEditor } from './questions/QuestionEditor';
import {
  addQuestion,
  bankEntry,
  findPariksha,
  importFromBank,
  isLowFirstTry,
  moveQuestion,
  newQuestion,
  removeQuestion,
  updatePariksha,
  updateQuestion,
} from './questionEdit';
import type { Keyed } from './questionEdit';
import { useStudio } from './StudioProvider';
import type { BankQuestion, Working } from './types';
import { useDraft } from './useDraft';
import type { DraftApi } from './useDraft';

/** `/studio/courses/:courseId/pariksha/:parikshaId`: question list, question editor and Pariksha settings. */
export function ParikshaBuilderPage() {
  const { courseId = '', parikshaId = '' } = useParams();
  const draft = useDraft(courseId);
  return (
    <main className="page studio-editor">
      <DraftGate draft={draft}>
        {(work) => (
          <Builder draft={draft} work={work} courseId={courseId} parikshaId={parikshaId} />
        )}
      </DraftGate>
    </main>
  );
}

function Builder({
  draft,
  work,
  courseId,
  parikshaId,
}: {
  draft: DraftApi;
  work: Working;
  courseId: string;
  parikshaId: string;
}) {
  const { data } = useStudio();
  const { uid } = useUser();
  const toast = useToast();
  const consoleApi = useConsole();
  const stats = useAsync(
    useCallback(() => consoleApi.data.courseStats(courseId), [consoleApi, courseId]),
  );
  const asked = useSearchParams()[0].get('question');
  const [selectedId, setSelectedId] = useState<string | null>(asked);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const issues = useMemo(() => validateForPublish(work.course, work.answers), [work]);

  const pariksha = findPariksha(work.course, parikshaId);
  const crumbs = [
    { label: 'Studio', render: (p: object) => <Link to="/studio" {...p} /> },
    {
      label: work.course.title,
      render: (p: object) => <Link to={`/studio/courses/${courseId}`} {...p} />,
    },
    { label: pariksha?.title || 'Pariksha' },
  ];
  if (!pariksha) {
    return (
      <>
        <EditorBar crumbs={crumbs} draft={draft} />
        <EmptyState
          headingAs="h2"
          title="This Pariksha does not exist"
          action={
            <Link className={buttonClass('secondary')} to={`/studio/courses/${courseId}`}>
              Back to the course
            </Link>
          }
        >
          It may have been deleted or moved.
        </EmptyState>
      </>
    );
  }

  const firstTry = stats.state === 'ready' ? stats.value : null;
  const current = pariksha.questions.find((q) => q.id === selectedId) ?? pariksha.questions[0];
  const keyed: Keyed | null = current
    ? { question: current, key: work.answers[parikshaId]?.[current.id] ?? [] }
    : null;
  const count = pariksha.questions.length;

  const add = (made: Keyed) => {
    draft.update((w) => addQuestion(w, parikshaId, made));
    setSelectedId(made.question.id);
  };
  const importOne = (bank: BankQuestion) => {
    add(importFromBank(bank));
    setImporting(false);
    toast.show('Added from the question bank', { tone: 'success' });
  };
  const saveToBank = async (entry: Keyed, tags: string[]) => {
    const ids = { courseId, parikshaId, questionId: entry.question.id };
    try {
      await data.addToBank(bankEntry(entry, tags), uid);
      log.info('Question saved to the bank', ids);
      toast.show('Saved to the question bank', { tone: 'success' });
    } catch (e) {
      log.error('Saving a question to the bank failed', e, ids);
      toast.show(userMessageOf(e, "Couldn't save the question to the bank. Try again."), {
        tone: 'danger',
      });
    }
  };

  const insightFor = (questionId: string): string | null => {
    const tries = firstTry?.questionFirstTry[questionId];
    return tries && isLowFirstTry(firstTry, questionId)
      ? `${Math.round((tries.correct / tries.total) * 100)}% of learners got this right first time (${tries.total} tries). Check the wording and the explanation.`
      : null;
  };

  return (
    <>
      <EditorBar
        crumbs={crumbs}
        draft={draft}
        actions={
          <PreviewLink draft={draft} to={`/studio/courses/${courseId}/preview/${parikshaId}`}>
            Try it as a learner
          </PreviewLink>
        }
      />
      <div className="studio-cols">
        <Card as="section" className="studio-qlist" aria-label="Questions">
          <div className="studio-qlist__head">
            <h2 className="studio-qlist__title">
              {count} {count === 1 ? 'question' : 'questions'}
            </h2>
            <Button variant="ghost" onClick={() => add(newQuestion())}>
              + Add
            </Button>
          </div>
          <DragList
            label="Questions"
            items={pariksha.questions}
            itemKey={(q) => q.id}
            itemLabel={(q) => `question: ${q.prompt.slice(0, 40)}`}
            onMove={(from, to) => draft.update((w) => moveQuestion(w, parikshaId, from, to))}
            renderItem={(q, { index, handle }) => (
              <div className="studio-qrow" data-current={q.id === current?.id || undefined}>
                {handle}
                <button
                  type="button"
                  className="studio-qrow__main"
                  aria-current={q.id === current?.id ? 'true' : undefined}
                  onClick={() => setSelectedId(q.id)}
                >
                  <span className="studio-qrow__num">{index + 1}</span>{' '}
                  <span className="studio-qrow__text">{q.prompt}</span>
                </button>
                {isLowFirstTry(firstTry, q.id) ? (
                  <Chip tone="danger">Low first-try score</Chip>
                ) : null}
              </div>
            )}
          />
          <Button variant="secondary" onClick={() => setImporting(true)}>
            Import from question bank
          </Button>
        </Card>

        <Card as="section" className="studio-qeditor" aria-label="Question editor">
          {keyed ? (
            <QuestionEditor
              key={keyed.question.id}
              keyed={keyed}
              lessons={lessonsOf(work.course)}
              issues={issues.filter(
                (i) => i.itemId === parikshaId && i.questionId === keyed.question.id,
              )}
              insight={insightFor(keyed.question.id)}
              onEdit={(edit) =>
                draft.update((w) => updateQuestion(w, parikshaId, keyed.question.id, edit))
              }
              onDelete={() => setDeleting(keyed.question.id)}
              onSaveToBank={(tags) => void saveToBank(keyed, tags)}
            />
          ) : (
            <EmptyState
              headingAs="h2"
              title="No questions yet"
              action={<Button onClick={() => add(newQuestion())}>Add the first question</Button>}
            >
              A Pariksha needs at least one question before it can be published.
            </EmptyState>
          )}
        </Card>

        <Card as="section" className="studio-qsettings" aria-label="Pariksha settings">
          <ParikshaSettings
            pariksha={pariksha}
            coursePassPercent={Math.round(work.course.rules.passMark * 100)}
            onChange={(edit) => draft.update((w) => updatePariksha(w, parikshaId, edit))}
          />
        </Card>
      </div>
      {importing ? <ImportDialog onClose={() => setImporting(false)} onImport={importOne} /> : null}
      {deleting !== null ? (
        <ConfirmDialog
          title="Delete this question?"
          confirmLabel="Delete question"
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            draft.update((w) => removeQuestion(w, parikshaId, deleting));
            setDeleting(null);
          }}
        >
          The question and its answer key are removed from the draft.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
