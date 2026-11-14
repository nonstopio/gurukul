import type { LabelSet } from '@gurukul/schema';

/**
 * The names the app shows for its roles and areas, in each label set. Code, data, routes and
 * claims always use the generic names; only what a person reads changes. This file is the one
 * place the Gurukul names live.
 *
 * Keyed by the generic word, singular and plural. Generic names are lower-cased mid-sentence
 * ("assign to learners"); Gurukul names are proper nouns and keep their capital ("assign to
 * Shishyas").
 */
const NAMES = {
  learner: {
    generic: 'Learner',
    gurukul: 'Shishya',
    group: 'People',
    meaning: { gurukul: 'A student of the forest school', generic: 'Anyone who signs in to learn' },
  },
  learners: { generic: 'Learners', gurukul: 'Shishyas' },
  educator: {
    generic: 'Educator',
    gurukul: 'Acharya',
    group: 'People',
    meaning: { gurukul: 'A teacher who guides', generic: 'Builds and teaches courses' },
  },
  educators: { generic: 'Educators', gurukul: 'Acharyas' },
  manager: {
    generic: 'Manager',
    gurukul: 'Adhyaksha',
    group: 'People',
    meaning: { gurukul: 'One who oversees a group', generic: 'Looks after a team' },
  },
  managers: { generic: 'Managers', gurukul: 'Adhyakshas' },
  admin: {
    generic: 'Admin',
    gurukul: 'Kulapati',
    group: 'People',
    meaning: { gurukul: 'Head of the whole Kula', generic: 'Runs the whole platform' },
  },
  admins: { generic: 'Admins', gurukul: 'Kulapatis' },
  course: {
    generic: 'Course',
    gurukul: 'Grantha',
    group: 'Learning',
    meaning: { gurukul: 'A text studied end to end', generic: 'A set of chapters to finish' },
  },
  courses: { generic: 'Courses', gurukul: 'Granthas' },
  chapter: {
    generic: 'Chapter',
    gurukul: 'Parva',
    group: 'Learning',
    meaning: { gurukul: 'A book of the Mahabharata', generic: 'A part of a course' },
  },
  chapters: { generic: 'Chapters', gurukul: 'Parvas' },
  lesson: {
    generic: 'Lesson',
    gurukul: 'Adhyaya',
    group: 'Learning',
    meaning: { gurukul: 'A section of a Parva', generic: 'One step inside a chapter' },
  },
  lessons: { generic: 'Lessons', gurukul: 'Adhyayas' },
  quiz: {
    generic: 'Quiz',
    gurukul: 'Pariksha',
    group: 'Learning',
    meaning: { gurukul: 'A test of what you learnt', generic: 'Checks what you learnt' },
  },
  quizzes: { generic: 'Quizzes', gurukul: 'Parikshas' },
  certificate: {
    generic: 'Certificate',
    gurukul: 'Pramanapatra',
    group: 'Learning',
    meaning: { gurukul: 'Proof of learning', generic: 'Earned when you finish a course' },
  },
  certificates: { generic: 'Certificates', gurukul: 'Pramanapatras' },
  home: {
    generic: 'Home',
    gurukul: 'Ashram',
    group: 'Places',
    meaning: { gurukul: "Where a Shishya's day starts", generic: 'Where your day starts' },
  },
  catalogue: {
    generic: 'Catalogue',
    gurukul: 'Granthalaya',
    group: 'Places',
    meaning: { gurukul: 'The library of Granthas', generic: 'Every course you can take' },
  },
  studio: {
    generic: 'Studio',
    gurukul: 'Karyashala',
    group: 'Places',
    meaning: {
      gurukul: 'The workshop where Granthas are made',
      generic: 'Where courses are built',
    },
  },
  questionBank: {
    generic: 'Question bank',
    gurukul: 'Prashna Kosha',
    group: 'Places',
    meaning: { gurukul: 'A store of questions', generic: 'Questions to reuse in quizzes' },
  },
  analytics: {
    generic: 'Analytics',
    gurukul: 'Sanjaya',
    group: 'Places',
    meaning: { gurukul: 'The seer who tells how things stand', generic: 'How learning is going' },
  },
  team: {
    generic: 'Team',
    gurukul: 'Kula',
    group: 'Places',
    meaning: { gurukul: 'The group you belong to', generic: 'The people you work with' },
  },
  teams: { generic: 'Teams', gurukul: 'Kulas' },
} as const satisfies Record<
  string,
  Record<LabelSet, string> & {
    group?: 'People' | 'Learning' | 'Places';
    meaning?: Record<LabelSet, string>;
  }
>;

type Name = keyof typeof NAMES;

/** `t.Learners` starts a sentence or names a heading; `t.learners` sits mid-sentence. */
export type Terms = Record<Name | Capitalize<Name>, string>;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function terms(set: LabelSet): Terms {
  const out: Record<string, string> = {};
  for (const [key, names] of Object.entries(NAMES)) {
    const name = names[set];
    out[key] =
      set === 'generic' && key !== 'studio' && key !== 'analytics' ? name.toLowerCase() : name;
    out[cap(key)] = name;
  }
  return out as Terms;
}

/** "a" or "an" before a name, by its first letter: "an Admin", "a Kulapati", "an Acharya". */
export function article(name: string): string {
  return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`;
}

type Entry = {
  generic: string;
  gurukul: string;
  group?: string;
  meaning?: Record<LabelSet, string>;
};

/** The dictionary as the choice screen shows it: singular entries, grouped, in the order above. */
export const DICTIONARY = (['People', 'Learning', 'Places'] as const).map((group) => ({
  group,
  rows: (Object.values(NAMES) as Entry[]).filter((e) => e.group === group),
}));
