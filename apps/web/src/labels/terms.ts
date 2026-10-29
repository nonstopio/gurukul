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
  learner: { generic: 'Learner', gurukul: 'Shishya' },
  learners: { generic: 'Learners', gurukul: 'Shishyas' },
  educator: { generic: 'Educator', gurukul: 'Acharya' },
  educators: { generic: 'Educators', gurukul: 'Acharyas' },
  admin: { generic: 'Admin', gurukul: 'Kulapati' },
  admins: { generic: 'Admins', gurukul: 'Kulapatis' },
  chapter: { generic: 'Chapter', gurukul: 'Parva' },
  chapters: { generic: 'Chapters', gurukul: 'Parvas' },
  quiz: { generic: 'Quiz', gurukul: 'Pariksha' },
  quizzes: { generic: 'Quizzes', gurukul: 'Parikshas' },
  studio: { generic: 'Studio', gurukul: 'Vyasa Studio' },
  analytics: { generic: 'Analytics', gurukul: 'Sanjaya' },
} as const satisfies Record<string, Record<LabelSet, string>>;

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
