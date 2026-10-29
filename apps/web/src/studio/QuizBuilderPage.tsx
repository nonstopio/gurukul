import { validateForPublish } from '@gurukul/schema';
import { Button, Card, Chip, DragList, EmptyState, buttonClass, useToast } from '@gurukul/ui';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { userMessageOf } from '../api';
import { useUser } from '../auth/AuthProvider';
import { useConsole } from '../console/ConsoleProvider';
import { useAsync } from '../data/useAsync';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { ConfirmDialog } from './ConfirmDialog';
import { DraftGate } from './DraftGate';
import { EditorBar, PreviewLink } from './EditorBar';
import { lessonsOf } from './lessonEdit';
import { ImportDialog } from './questions/ImportDialog';
import { QuizSettings } from './questions/QuizSettings';
import { QuestionEditor } from './questions/QuestionEditor';
import {
  addQuestion,
  bankEntry,
  findQuiz,
  firstTryPercent,
  importFromBank,
  isLowFirstTry,
  moveQuestion,
  newQuestion,
  removeQuestion,
  updateQuiz,
  updateQuestion,
} from './questionEdit';
import type { Keyed } from './questionEdit';
import { useStudio } from './StudioProvider';
import type { BankQuestion, Working } from './types';
import { useDraft } from './useDraft';
import type { DraftApi } from './useDraft';

/** `/studio/courses/:courseId/quiz/:quizId`: question list, question editor and Quiz settings. */
export function QuizBuilderPage() {
  const { courseId = '', quizId = '' } = useParams();
  const draft = useDraft(courseId);
  return (
    <main className="page studio-editor">
      <DraftGate draft={draft}>
        {(work) => <Builder draft={draft} work={work} courseId={courseId} quizId={quizId} />}
      </DraftGate>
    </main>
  );
}

function Builder({
  draft,
  work,
  courseId,
  quizId,
}: {
  draft: DraftApi;
  work: Working;
  courseId: string;
  quizId: string;
}) {
  const { data } = useStudio();
  const { uid } = useUser();
  const toast = useToast();
  const t = useTerms();
  const consoleApi = useConsole();
  const stats = useAsync(
    useCallback(() => consoleApi.data.courseStats(courseId), [consoleApi, courseId]),
  );
  const asked = useSearchParams()[0].get('question');
  const [selectedId, setSelectedId] = useState<string | null>(asked);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const issues = useMemo(() => validateForPublish(work.course, work.answers), [work]);

  const quiz = findQuiz(work.course, quizId);
  const crumbs = [
    { label: t.Studio, render: (p: object) => <Link to="/studio" {...p} /> },
    {
      label: work.course.title,
      render: (p: object) => <Link to={`/studio/courses/${courseId}`} {...p} />,
    },
    { label: quiz?.title || t.Quiz },
  ];
  if (!quiz) {
    return (
      <>
        <EditorBar crumbs={crumbs} draft={draft} />
        <EmptyState
          headingAs="h2"
          title={`This ${t.Quiz} does not exist`}
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
  const current = quiz.questions.find((q) => q.id === selectedId) ?? quiz.questions[0];
  const keyed: Keyed | null = current
    ? { question: current, key: work.answers[quizId]?.[current.id] ?? [] }
    : null;
  const count = quiz.questions.length;

  const add = (made: Keyed) => {
    draft.update((w) => addQuestion(w, quizId, made));
    setSelectedId(made.question.id);
  };
  const importOne = (bank: BankQuestion) => {
    add(importFromBank(bank));
    setImporting(false);
    toast.show('Added from the question bank', { tone: 'success' });
  };
  const saveToBank = async (entry: Keyed, tags: string[]) => {
    const ids = { courseId, quizId, questionId: entry.question.id };
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
      ? `${Math.round((tries.correct / tries.total) * 100)}% of ${t.learners} got this right first time (${tries.total} tries). Check the wording and the explanation.`
      : null;
  };

  return (
    <>
      <EditorBar
        crumbs={crumbs}
        draft={draft}
        actions={
          <PreviewLink draft={draft} to={`/studio/courses/${courseId}/preview/${quizId}`}>
            {`Try it as ${article(t.learner)}`}
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
            items={quiz.questions}
            itemKey={(q) => q.id}
            itemLabel={(q) => `question: ${q.prompt.slice(0, 40)}`}
            onMove={(from, to) => draft.update((w) => moveQuestion(w, quizId, from, to))}
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
                {firstTryPercent(firstTry, q.id) !== null ? (
                  <span
                    className="studio-qrow__pct"
                    title={`${t.Learners} who got this right first time`}
                  >
                    {firstTryPercent(firstTry, q.id)}% first try
                  </span>
                ) : null}
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
                (i) => i.itemId === quizId && i.questionId === keyed.question.id,
              )}
              insight={insightFor(keyed.question.id)}
              onEdit={(edit) =>
                draft.update((w) => updateQuestion(w, quizId, keyed.question.id, edit))
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
              {`A ${t.Quiz} needs at least one question before it can be published.`}
            </EmptyState>
          )}
        </Card>

        <Card as="section" className="studio-qsettings" aria-label={`${t.Quiz} settings`}>
          <QuizSettings
            quiz={quiz}
            coursePassPercent={Math.round(work.course.rules.passMark * 100)}
            onChange={(edit) => draft.update((w) => updateQuiz(w, quizId, edit))}
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
            draft.update((w) => removeQuestion(w, quizId, deleting));
            setDeleting(null);
          }}
        >
          The question and its answer key are removed from the draft.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
