import type { Course } from '../src';

export const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });

export function makeCourse(over: Partial<Course> = {}): Course {
  return {
    schemaVersion: 1,
    id: 'git',
    title: 'Git',
    summary: 'Version control.',
    description: '# Git',
    level: 'foundation',
    cover: { theme: 'forest', glyph: 'G' },
    outcomes: ['Commit'],
    acharyaIds: [],
    status: 'published',
    version: 1,
    publishedAt: ts(1),
    rules: { sequential: true, passMark: 0.7, certificate: true, requireVideoWatch: false },
    certificate: { title: 'Git', signatoryName: 'A', signatoryRole: 'Kulapati' },
    parvas: [
      {
        id: 'p1',
        title: 'Basics',
        items: [
          {
            type: 'lesson',
            id: 'l1',
            title: 'Init',
            minutes: 5,
            layout: 'stacked',
            completeWhen: 'manual',
            blocks: [{ type: 'markdown', id: 'b1', md: 'hi' }],
          },
          {
            type: 'pariksha',
            id: 'q1',
            title: 'Check',
            questionsShown: 1,
            shuffleOptions: true,
            cooldownMinutes: 0,
            revealAnswers: 'each',
            blocksNext: true,
            questions: [
              {
                id: 'k1',
                kind: 'single',
                prompt: 'Which?',
                options: [
                  { id: 'a', text: 'A' },
                  { id: 'b', text: 'B' },
                ],
                explanation: 'Because',
              },
            ],
          },
          {
            type: 'lesson',
            id: 'l2',
            title: 'Commit',
            minutes: 5,
            layout: 'split',
            completeWhen: 'manual',
            blocks: [],
          },
          {
            type: 'lesson',
            id: 'l3',
            title: 'Branch',
            minutes: 5,
            layout: 'article',
            completeWhen: 'scrolled',
            blocks: [],
          },
        ],
      },
    ],
    estimatedMinutes: 15,
    ...over,
  };
}

/** The nth item of the first parva; throws rather than returning undefined. */
export function itemAt(course: Course, index: number) {
  const item = course.parvas[0]?.items[index];
  if (!item) throw new Error(`no item at ${index}`);
  return item;
}
