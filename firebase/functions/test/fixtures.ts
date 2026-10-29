export const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });

export const question = (id: string, kind = 'single', over: object = {}) => ({
  id,
  kind,
  prompt: id,
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ],
  explanation: `why ${id}`,
  ...over,
});

export const quiz = (over: object = {}) => ({
  type: 'quiz',
  id: 'pk',
  title: 'Check',
  questionsShown: 2,
  shuffleOptions: false,
  cooldownMinutes: 10,
  revealAnswers: 'each',
  blocksNext: false,
  questions: [question('q1'), question('q2', 'multiple'), question('q3', 'trueFalse')],
  ...over,
});

export const course = (quizOver: object = {}, over: object = {}) => ({
  schemaVersion: 3,
  id: 'git-basics',
  title: 'Git basics',
  summary: '',
  description: '',
  level: 'foundation',
  cover: { theme: 'forest', glyph: 'G' },
  outcomes: [],
  educatorIds: [],
  educatorNames: {},
  status: 'published',
  version: 3,
  publishedAt: ts(1),
  rules: { sequential: false, passMark: 0.7, certificate: true, requireVideoWatch: false },
  certificate: { title: 'Git' },
  chapters: [{ id: 'p1', title: 'P', items: [quiz(quizOver)] }],
  estimatedMinutes: 2,
  ...over,
});

export const answerKey = { pk: { q1: ['a'], q2: ['a', 'b'], q3: ['c'] } };

export const progress = (pk: object | undefined = undefined, over: object = {}) => ({
  uid: 'u',
  courseId: 'git-basics',
  courseVersion: 3,
  startedAt: ts(1),
  lastItemId: null,
  lastActiveAt: ts(1),
  completedItemIds: [],
  quiz: pk === undefined ? {} : { pk },
  percent: 0,
  completedAt: null,
  certificateId: null,
  ...over,
});
