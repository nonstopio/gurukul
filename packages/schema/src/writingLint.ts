import type { Block, Course, Lesson, Question, Quiz } from './course';

/*
 * The writing lint: the third layer of the humanizer (`.plan/22-desktop-studio.md`, "Writing
 * quality: the humanizer"). Plain rules in code, no AI, so an agent cannot talk its way past them.
 * The agent calls it as `lint_writing` before it writes text, and Review's Writing check shows what
 * it finds on changed text. Findings inform; none of them stops a save.
 *
 * Markdown code, fenced and inline, is never linted, and neither are link targets or bare
 * addresses. Spelling is not linted (British spelling is the house style, but a word list is not
 * this file's job).
 */

/** What a finding is about. */
export type WritingRule =
  /** A phrase from `WORN_PHRASES`. */
  | 'worn-phrase'
  /** A sentence over `MAX_SENTENCE_WORDS` words. */
  | 'long-sentence'
  /** A paragraph over `MAX_PARAGRAPH_SENTENCES` sentences. */
  | 'long-paragraph'
  /** More than `MAX_EXCLAMATIONS` exclamation marks in a lesson (or in one text). */
  | 'exclamations'
  /** A heading or title in Title Case instead of sentence case. */
  | 'title-case'
  /** A Quiz option "all of the above" or "none of the above". */
  | 'above-option'
  /** An option more than `LONG_OPTION_RATIO` times the median option length. */
  | 'long-option'
  /** An explanation with no words in it. */
  | 'empty-explanation'
  /** An explanation that only says the answer "is correct". */
  | 'bare-explanation'
  /** An explanation that names an option by letter or number, which shuffling makes meaningless. */
  | 'option-by-letter'
  /** A "Which… not" question whose negative is not marked (NOT, **not**). */
  | 'unmarked-negative';

/**
 * Which text a finding sits in. Names follow the course object (`md`, `caption`, `prompt`), with
 * `outcome` and `option` for one entry of a list (`index` says which).
 */
export type WritingField =
  | 'title'
  | 'summary'
  | 'certificate.title'
  | 'description'
  | 'outcome'
  | 'md'
  | 'caption'
  | 'alt'
  | 'label'
  | 'prompt'
  | 'option'
  | 'explanation';

/** One thing the lint found. The ids say where; ids that do not apply are absent. */
export interface WritingFinding {
  chapterId?: string;
  itemId?: string;
  blockId?: string;
  questionId?: string;
  field: WritingField;
  /** Position in the list for `outcome` and `option`. */
  index?: number;
  rule: WritingRule;
  /** The words concerned, whitespace collapsed, cut to `EXCERPT_CHARS`. */
  excerpt: string;
  /** One sentence the agent or the Educator can act on. */
  message: string;
}

export const MAX_SENTENCE_WORDS = 30;
export const MAX_PARAGRAPH_SENTENCES = 5;
/** Exclamation marks allowed in a lesson, counted over its title and every block. */
export const MAX_EXCLAMATIONS = 1;
/** An option longer than this many times the median option length gives the answer away. */
export const LONG_OPTION_RATIO = 2;
export const EXCERPT_CHARS = 120;

/** A worn phrase, the pattern that finds it (case-insensitive, whole words) and what to do instead. */
export interface WornPhrase {
  phrase: string;
  pattern: string;
  instead: string;
}

const DROP = 'Drop it and say the plain thing.';

/**
 * Phrases that make text sound written by a brochure or a machine. Listed longest first: where two
 * overlap, the earlier one is reported and the later one is not. Add to it freely; each entry needs
 * a firing and a non-firing case in `writingLint.test.ts`.
 */
export const WORN_PHRASES: readonly WornPhrase[] = [
  {
    phrase: "in today's fast-paced",
    pattern:
      "in today['’]s (?:fast[- ]paced|ever[- ](?:changing|evolving)|digital|modern|rapidly[- ]evolving)(?: \\w+)?",
    instead: 'Start with the point.',
  },
  { phrase: 'fast-paced', pattern: 'fast[- ]paced', instead: DROP },
  { phrase: 'ever-changing', pattern: 'ever[- ](?:changing|evolving)', instead: DROP },
  {
    phrase: 'landscape',
    pattern: '(?:digital|development|tech|technology|software|modern) landscape',
    instead: DROP,
  },
  { phrase: 'delve', pattern: 'delv(?:e|es|ed|ing)', instead: 'Say "look at" or "explain".' },
  { phrase: 'leverage', pattern: 'leverag(?:e|es|ed|ing)', instead: 'Say "use".' },
  { phrase: 'seamlessly', pattern: 'seamless(?:ly)?', instead: DROP },
  {
    phrase: 'it is crucial to',
    pattern: "it(?: is|['’]s) (?:crucial|essential|vital|imperative) (?:to|that)",
    instead: 'Give the instruction, and say what goes wrong without it.',
  },
  {
    phrase: 'it is important to note',
    pattern: "it(?: is|['’]s) (?:important to note|worth noting)(?: that)?",
    instead: 'State the fact.',
  },
  {
    phrase: "let's dive in",
    pattern:
      "let['’]s (?:dive|jump|delve)(?: right)? in(?:to)?|dive (?:deep|deeper) into|deep[- ]dive",
    instead: 'Start with the first step.',
  },
  { phrase: 'unlock', pattern: 'unlock(?:s|ed|ing)?', instead: 'Say what the learner can do.' },
  { phrase: 'robust', pattern: 'robust(?:ly|ness)?', instead: 'Say what it withstands.' },
  { phrase: 'powerful', pattern: 'powerful(?:ly)?', instead: 'Say what it does.' },
  { phrase: 'game-changer', pattern: 'game[- ]chang(?:er|ers|ing)', instead: DROP },
  {
    phrase: 'cutting-edge',
    pattern: 'cutting[- ]edge|state[- ]of[- ]the[- ]art|best[- ]in[- ]class|world[- ]class',
    instead: 'Say what is new about it.',
  },
  {
    phrase: 'harness the power of',
    pattern: '(?:harness|unleash)(?:es|ed|ing)? the (?:full )?power of',
    instead: 'Say "use".',
  },
  { phrase: 'in the realm of', pattern: '(?:in|within) the realm of', instead: 'Say "in".' },
  { phrase: 'tapestry', pattern: 'tapestry', instead: DROP },
  { phrase: 'embark on', pattern: 'embark(?:s|ed|ing)? (?:on|upon)', instead: 'Say "start".' },
  {
    phrase: 'navigate the complexities',
    pattern: 'navigat(?:e|es|ed|ing) the complexit(?:y|ies)(?: of)?',
    instead: 'Say "work with".',
  },
  { phrase: 'utilise', pattern: 'utili[sz](?:e|es|ed|ing|ation)', instead: 'Say "use".' },
  { phrase: 'in order to', pattern: 'in order to', instead: 'Say "to".' },
  { phrase: 'a plethora of', pattern: 'a (?:plethora|myriad) of|myriad', instead: 'Say "many".' },
  { phrase: 'paradigm', pattern: 'paradigm(?: shift)?s?', instead: DROP },
  { phrase: 'synergy', pattern: 'synerg(?:y|ies|istic)', instead: DROP },
  { phrase: 'holistic', pattern: 'holistic(?:ally)?', instead: DROP },
  { phrase: 'empower', pattern: 'empower(?:s|ed|ing|ment)?', instead: 'Say "let" or "help".' },
  {
    phrase: 'elevate your',
    pattern: 'elevat(?:e|es|ing) (?:your|the|our)',
    instead: 'Say "improve".',
  },
  { phrase: 'supercharge', pattern: 'supercharg(?:e|es|ed|ing)', instead: 'Say "speed up".' },
  { phrase: 'revolutionise', pattern: 'revolutioni[sz](?:e|es|ed|ing)', instead: 'Say "change".' },
  { phrase: 'streamline', pattern: 'streamlin(?:e|es|ed|ing)', instead: 'Say "simplify".' },
  { phrase: 'at the end of the day', pattern: 'at the end of the day', instead: DROP },
  {
    phrase: 'it goes without saying',
    pattern: 'it goes without saying|needless to say',
    instead: DROP,
  },
  {
    phrase: 'in conclusion',
    pattern: 'in conclusion|to sum up|in summary|to summari[sz]e',
    instead: 'End with the last step; do not repeat the lesson.',
  },
  {
    phrase: "whether you're a beginner",
    pattern: "whether you(?:['’]re| are) (?:a |an )?(?:beginner|seasoned|novice|newcomer|expert)",
    instead: 'Write for the reader in front of you.',
  },
  { phrase: 'a testament to', pattern: 'a testament to', instead: DROP },
  {
    phrase: 'plays a crucial role',
    pattern: 'play(?:s|ed|ing)? an? (?:crucial|vital|pivotal|key|important) role',
    instead: 'Say what it does.',
  },
  { phrase: 'pivotal', pattern: 'pivotal', instead: DROP },
  {
    phrase: 'in this lesson, you will learn',
    pattern:
      "in this (?:lesson|chapter|course),? (?:we|you)(?: will|['’]ll) (?:learn|explore|cover|look at|discover|dive into)",
    instead: 'Start with what the learner does.',
  },
  {
    phrase: "let's explore",
    pattern: "(?:let['’]s|we will|we['’]ll) explore",
    instead: 'Show the thing.',
  },
  { phrase: 'foster', pattern: 'foster(?:s|ed|ing)?', instead: 'Say "build".' },
  {
    phrase: 'learning journey',
    pattern: '(?:learning|coding|your) journey',
    instead: DROP,
  },
  { phrase: 'happy coding', pattern: 'happy coding', instead: DROP },
];

/**
 * Words a heading may capitalise anywhere: Gurukul's own terms (both label sets, see
 * `apps/web/src/labels/`), and names common in NonStop courses. Mixed-case names (GitHub,
 * JavaScript) and acronyms (API, CI) need no entry: the Title Case rule skips them by their shape.
 */
export const HEADING_NAMES: readonly string[] = [
  // Gurukul
  'gurukul',
  'nonstop',
  'learner',
  'educator',
  'manager',
  'admin',
  'studio',
  'quiz',
  'shishya',
  'acharya',
  'adhyaksha',
  'kulapati',
  'pariksha',
  'kula',
  // Tools and languages
  'git',
  'google',
  'docker',
  'kubernetes',
  'react',
  'angular',
  'vue',
  'firebase',
  'firestore',
  'python',
  'java',
  'kotlin',
  'swift',
  'flutter',
  'dart',
  'linux',
  'windows',
  'android',
  'apple',
  'chrome',
  'node',
  'vite',
  'azure',
  'slack',
  'jira',
  'figma',
  'postgres',
  'redis',
  'terraform',
  'jenkins',
  'claude',
  'english',
  'india',
  // Days and months
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'january',
  'february',
  'march',
  'april',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

// ─── Masking: what is not prose ──────────────────────────────────────────────────────────────────

/** Stands for one character of inline code or an address: not a letter, not a space. */
const CODE = '';

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;
const LINK_TARGET = /\]\([^)\s]*(?:\s+"[^"]*")?\)/g;
const IMAGE_BANG = /!(?=\[)/g;
const ADDRESS = /\b(?:https?:\/\/|www\.)\S+/g;

const blank = (s: string) => s.replace(/[^\n]/g, ' ');
const opaque = (s: string) => s.replace(/[^\n]/g, CODE);

/**
 * The text with everything that is not prose hidden, same length so offsets point into the
 * original: fenced code becomes spaces (so it also ends a paragraph), inline code and addresses
 * become one opaque word each, link targets and the `!` of an image disappear.
 */
export function maskCode(text: string): string {
  const lines = text.split('\n');
  let fence: string | null = null;
  const fenced = lines.map((line) => {
    if (fence !== null) {
      const closes = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line);
      if (closes) fence = null;
      return blank(line);
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      fence = open[1] as string;
      return blank(line);
    }
    return line;
  });
  return fenced
    .join('\n')
    .replace(INLINE_CODE, opaque)
    .replace(LINK_TARGET, (m) => ']' + blank(m.slice(1)))
    .replace(ADDRESS, opaque)
    .replace(IMAGE_BANG, ' ');
}

// ─── Units, sentences, words ─────────────────────────────────────────────────────────────────────

interface Span {
  start: number;
  end: number;
}

interface Unit extends Span {
  kind: 'para' | 'item' | 'heading' | 'other';
}

const HEADING = /^ {0,3}#{1,6}(?:[ \t]+|$)/;
const LIST_ITEM = /^\s*(?:[-*+]|\d{1,9}[.)])[ \t]+/;
const TABLE_ROW = /^\s*\|/;
const RULE_LINE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/** Splits masked markdown into paragraphs, list items, headings and the rest (tables, rules). */
function unitsOf(masked: string): Unit[] {
  const units: Unit[] = [];
  let current: Unit | null = null;
  let offset = 0;
  for (const line of masked.split('\n')) {
    const start = offset;
    const end = offset + line.length;
    offset = end + 1;
    if (line.trim() === '' || RULE_LINE.test(line)) {
      current = null;
      continue;
    }
    const heading = HEADING.exec(line);
    const item = LIST_ITEM.exec(line);
    if (heading) {
      units.push({ kind: 'heading', start: start + heading[0].length, end });
      current = null;
    } else if (TABLE_ROW.test(line)) {
      units.push({ kind: 'other', start, end });
      current = null;
    } else if (item) {
      current = { kind: 'item', start: start + item[0].length, end };
      units.push(current);
    } else if (current) {
      current.end = end;
    } else {
      current = { kind: 'para', start, end };
      units.push(current);
    }
  }
  return units;
}

const TERMINATOR = /[.!?]+["')\]”’*_]*(?=\s|$)/g;
const ABBREVIATIONS = new Set(['e.g.', 'i.e.', 'etc.', 'vs.', 'cf.', 'mr.', 'mrs.', 'ms.', 'dr.']);

const WORDLIKE = /[\p{L}\p{N}]/u;
const countWords = (s: string) => s.split(/\s+/).filter((w) => WORDLIKE.test(w)).length;

/** The sentences of a stretch of masked text, as offsets; those with no words are left out. */
function sentencesOf(masked: string, unit: Span): Span[] {
  const body = masked.slice(unit.start, unit.end);
  const out: Span[] = [];
  let from = 0;
  const push = (to: number) => {
    if (countWords(body.slice(from, to)) > 0) {
      const lead = body.slice(from, to).search(/\S/);
      out.push({ start: unit.start + from + lead, end: unit.start + to });
    }
    from = to;
  };
  for (const m of body.matchAll(TERMINATOR)) {
    const end = m.index + m[0].length;
    const word = body.slice(0, end).split(/\s/).pop() as string;
    if (ABBREVIATIONS.has(word.toLowerCase())) continue;
    push(end);
  }
  push(body.length);
  return out;
}

/** Whitespace collapsed and cut to `EXCERPT_CHARS`, ending in an ellipsis when cut. */
export function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_CHARS ? flat.slice(0, EXCERPT_CHARS - 1).trimEnd() + '…' : flat;
}

// ─── Rules on one text ───────────────────────────────────────────────────────────────────────────

/** What a finding says, before the ids that place it. */
type Note = Pick<WritingFinding, 'rule' | 'excerpt' | 'message'>;

const WORN = WORN_PHRASES.map((w) => ({
  ...w,
  regex: new RegExp(`(?<![\\p{L}\\p{N}])(?:${w.pattern})(?![\\p{L}\\p{N}])`, 'giu'),
}));

function wornPhrases(text: string, masked: string): Note[] {
  const taken: Span[] = [];
  const found: (Note & Span)[] = [];
  for (const w of WORN) {
    for (const m of masked.matchAll(w.regex)) {
      const span = { start: m.index, end: m.index + m[0].length };
      if (taken.some((t) => span.start < t.end && t.start < span.end)) continue;
      taken.push(span);
      const excerpt = excerptOf(text.slice(span.start, span.end));
      found.push({
        ...span,
        rule: 'worn-phrase',
        excerpt,
        message: `"${excerpt}" is a worn phrase. ${w.instead}`,
      });
    }
  }
  return found
    .sort((a, b) => a.start - b.start)
    .map(({ rule, excerpt, message }) => ({ rule, excerpt, message }));
}

function sentenceRules(text: string, masked: string, units: Unit[]): Note[] {
  const notes: Note[] = [];
  for (const unit of units) {
    if (unit.kind !== 'para' && unit.kind !== 'item') continue;
    const sentences = sentencesOf(masked, unit);
    if (unit.kind === 'para' && sentences.length > MAX_PARAGRAPH_SENTENCES) {
      notes.push({
        rule: 'long-paragraph',
        excerpt: excerptOf(text.slice(unit.start, unit.end)),
        message: `This paragraph has ${sentences.length} sentences; split it so each has ${MAX_PARAGRAPH_SENTENCES} or fewer.`,
      });
    }
    for (const s of sentences) {
      const words = countWords(masked.slice(s.start, s.end));
      if (words > MAX_SENTENCE_WORDS) {
        notes.push({
          rule: 'long-sentence',
          excerpt: excerptOf(text.slice(s.start, s.end)),
          message: `This sentence has ${words} words; keep to ${MAX_SENTENCE_WORDS} or fewer, one idea per sentence.`,
        });
      }
    }
  }
  return notes;
}

const MINOR_WORDS = new Set(
  (
    'a an the and but or nor for so yet as at by in of off on per to up via with from into onto ' +
    'over than vs is are be it its if how what when why who your you'
  ).split(' '),
);
const NAMES = new Set(HEADING_NAMES);
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * Title Case: at least two words after the first are capitalised and none is in lower case.
 * Short joining words, names in `HEADING_NAMES`, acronyms, mixed-case names, numbers and code
 * do not count either way. The first word after a colon counts as a first word.
 */
export function isTitleCase(heading: string): boolean {
  let capitalised = 0;
  let first = true;
  for (const token of heading.split(/\s+/)) {
    if (!WORDLIKE.test(token)) continue;
    const startsClause = first;
    first = token.endsWith(':');
    const word = token.replace(EDGE_PUNCTUATION, '').replace(/['’]s$/u, '');
    if (startsClause || word.length < 2) continue;
    if (!/^\p{L}[\p{L}'’-]*$/u.test(word)) continue;
    const lower = word.toLowerCase();
    const singular = [lower, lower.replace(/s$/, ''), lower.replace(/z?es$/, '')];
    if (MINOR_WORDS.has(lower) || singular.some((w) => NAMES.has(w))) continue;
    if (/\p{Lu}/u.test(word.slice(1))) continue;
    if (word !== lower) capitalised += 1;
    else return false;
  }
  return capitalised >= 2;
}

const TITLE_CASE_MESSAGE =
  'Write headings in sentence case: a capital for the first word and for names only.';

function titleCase(text: string, masked: string, span: Span): Note[] {
  if (!isTitleCase(masked.slice(span.start, span.end))) return [];
  return [
    {
      rule: 'title-case',
      excerpt: excerptOf(text.slice(span.start, span.end).replace(/[ \t]#+[ \t]*$/, '')),
      message: TITLE_CASE_MESSAGE,
    },
  ];
}

/** Offsets of the exclamation marks in masked text. */
const bangsOf = (masked: string) => [...masked.matchAll(/!/g)].map((m) => m.index);

function exclamationNote(text: string, at: number, count: number, where: string): Note {
  return {
    rule: 'exclamations',
    excerpt: excerptOf(text.slice(Math.max(0, at - EXCERPT_CHARS + 1), at + 1)),
    message: `This ${where} has ${count} exclamation marks; keep at most ${MAX_EXCLAMATIONS}.`,
  };
}

const ABOVE_OPTION = /(?<![\p{L}])(?:all|none) of the above(?![\p{L}])/iu;

function aboveOption(text: string, masked: string): Note[] {
  if (!ABOVE_OPTION.test(masked)) return [];
  return [
    {
      rule: 'above-option',
      excerpt: excerptOf(text),
      message:
        'Options are shuffled, so "of the above" can come first, and it tests the trick, not the idea. Write an option that stands on its own.',
    },
  ];
}

const FILLER_WORDS = new Set(
  (
    "that this it its it's that's is was the a an answer option options choice one correct " +
    'correctly right true yes exactly indeed because so here well done good job great'
  ).split(' '),
);
const OPTION_BY_LETTER =
  /(?<![\p{L}])(?:[Oo]ption|[Aa]nswer|[Cc]hoice|OPTION|ANSWER|CHOICE)\s+\(?(?:[A-H]|[1-8])\)?(?![\p{L}\p{N}])/u;

/**
 * Empty, or nothing but "correct" talk ("Option B is correct.", "That's right!"). Option texts
 * passed in are removed first, so "`git rebase` is the correct answer" also counts as bare.
 */
function explanationRules(text: string, masked: string, options: readonly string[]): Note[] {
  const words = masked.split(/\s+/).filter((w) => WORDLIKE.test(w));
  if (words.length === 0) {
    return [
      {
        rule: 'empty-explanation',
        excerpt: '',
        message: 'Explain why the answer is right, and why the tempting wrong one is wrong.',
      },
    ];
  }
  const notes: Note[] = [];
  let rest = masked.toLowerCase().replace(/’/g, "'");
  for (const option of options) {
    const o = option.trim().toLowerCase();
    if (o) rest = rest.split(o).join(' ');
  }
  const content = rest
    .split(/\s+/)
    .map((w) => w.replace(EDGE_PUNCTUATION, ''))
    .filter((w) => w !== '' && !/^[a-h1-8]$/.test(w) && !FILLER_WORDS.has(w));
  if (content.length === 0) {
    notes.push({
      rule: 'bare-explanation',
      excerpt: excerptOf(text),
      message: 'Say why the answer is right, not only that it is.',
    });
  }
  const letter = OPTION_BY_LETTER.exec(masked);
  if (letter) {
    notes.push({
      rule: 'option-by-letter',
      excerpt: excerptOf(letter[0]),
      message:
        'Options are shuffled, so a letter or number names nothing. Say what the answer does instead.',
    });
  }
  return notes;
}

const SELECTING = /(?<![\p{L}])(?:which|following)(?![\p{L}])/iu;
const NEGATIVE =
  /(?<![\p{L}])(?:not|except|never|cannot|(?:is|are|was|were|does|do|did|can|could|will|would|should|has|have)n['’]t|won['’]t)(?![\p{L}])/giu;

function unmarkedNegative(text: string, masked: string): Note[] {
  if (!SELECTING.test(masked)) return [];
  for (const m of masked.matchAll(NEGATIVE)) {
    const word = m[0];
    const before = masked[m.index - 1];
    const after = masked[m.index + word.length];
    const emphasised = /[*_]/.test(before ?? '') && /[*_]/.test(after ?? '');
    if (word === word.toUpperCase() || emphasised) continue;
    return [
      {
        rule: 'unmarked-negative',
        excerpt: excerptOf(text),
        message: `Mark the negative so nobody misses it: write **${word}** or ${word.toUpperCase()}.`,
      },
    ];
  }
  return [];
}

/** How a text is read: a heading, prose, or one of the Quiz parts with rules of their own. */
type Kind = 'heading' | 'text' | 'prompt' | 'option' | 'explanation';

const KIND_OF: Record<WritingField, Kind> = {
  title: 'heading',
  summary: 'text',
  'certificate.title': 'text',
  description: 'text',
  outcome: 'text',
  md: 'text',
  caption: 'text',
  alt: 'text',
  label: 'text',
  prompt: 'prompt',
  option: 'option',
  explanation: 'explanation',
};

/** Every rule that looks at one text alone; exclamation marks are counted by the caller. */
function lintOne(text: string, kind: Kind, options: readonly string[] = []): Note[] {
  const masked = maskCode(text);
  const notes = wornPhrases(text, masked);
  if (kind === 'heading') {
    const lead = masked.search(/\S|$/);
    return [...titleCase(text, masked, { start: lead, end: masked.length }), ...notes];
  }
  const units = unitsOf(masked);
  for (const u of units) if (u.kind === 'heading') notes.push(...titleCase(text, masked, u));
  notes.push(...sentenceRules(text, masked, units));
  if (kind === 'option') notes.push(...aboveOption(text, masked));
  if (kind === 'prompt') notes.push(...unmarkedNegative(text, masked));
  if (kind === 'explanation') notes.push(...explanationRules(text, masked, options));
  return notes;
}

function exclamations(text: string, where: string): Note[] {
  const bangs = bangsOf(maskCode(text));
  const second = bangs[MAX_EXCLAMATIONS];
  return second === undefined ? [] : [exclamationNote(text, second, bangs.length, where)];
}

/**
 * The lint for one text, without the ids a course gives it: what `lint_writing` runs on a text the
 * agent is about to write. Rules that need the rest of the course (one option against the others,
 * exclamation marks across a lesson) are left to `lintCourse`; here exclamation marks are counted
 * in the text alone.
 */
export function lintText(text: string, field: WritingField): WritingFinding[] {
  return [...lintOne(text, KIND_OF[field]), ...exclamations(text, 'text')].map((n) => ({
    field,
    ...n,
  }));
}

// ─── The course ──────────────────────────────────────────────────────────────────────────────────

type Where = Omit<WritingFinding, 'rule' | 'excerpt' | 'message'>;

/** One text in the course, where it sits, and how to read it. */
interface Text {
  text: string;
  kind: Kind;
  where: Where;
  options?: readonly string[];
}

const place = (where: Where, notes: Note[]): WritingFinding[] =>
  notes.map((n) => ({ ...where, ...n }));

const optionList = (options: readonly string[], base: Omit<Where, 'field'>): Text[] =>
  options.map((text, index) => ({
    text,
    kind: 'option',
    where: { ...base, field: 'option', index },
  }));

/** The longest option against the median: one finding when it is more than twice as long. */
function longOption(options: readonly string[], base: Omit<Where, 'field'>): WritingFinding[] {
  const lengths = options.map((o) => o.trim().length);
  const sorted = [...lengths].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const longest = Math.max(...lengths);
  if (longest <= LONG_OPTION_RATIO * median) return [];
  const index = lengths.indexOf(longest);
  return [
    {
      ...base,
      field: 'option',
      index,
      rule: 'long-option',
      excerpt: excerptOf(options[index] as string),
      message: `This option is ${(longest / median).toFixed(1)} times the median length, and the long one is usually the right one. Make the options about the same length.`,
    },
  ];
}

function blockTexts(block: Block, base: Omit<Where, 'field'>): Text[] {
  const where = { ...base, blockId: block.id };
  const at = (field: WritingField, text: string | undefined, kind: Kind = 'text'): Text[] =>
    text === undefined ? [] : [{ text, kind, where: { ...where, field } }];
  switch (block.type) {
    case 'video':
      return [...at('title', block.title), ...at('caption', block.caption)];
    case 'markdown':
      return at('md', block.md);
    case 'callout':
      return [...at('title', block.title, 'heading'), ...at('md', block.md)];
    case 'image':
      return [...at('alt', block.alt), ...at('caption', block.caption)];
    case 'embed':
      return at('title', block.title);
    case 'file':
      return at('label', block.label);
    case 'check':
      return [
        ...at('prompt', block.prompt, 'prompt'),
        ...optionList(block.options, where),
        {
          text: block.explanation,
          kind: 'explanation',
          where: { ...where, field: 'explanation' },
          options: block.options,
        },
      ];
    case 'code':
      return [];
  }
}

function lintTexts(texts: readonly Text[]): WritingFinding[] {
  return texts.flatMap((t) => place(t.where, lintOne(t.text, t.kind, t.options)));
}

/** Exclamation marks over several texts: one finding, on the text holding the first one too many. */
function lessonExclamations(texts: readonly Text[]): WritingFinding[] {
  const marks = texts.flatMap((t) => bangsOf(maskCode(t.text)).map((at) => ({ t, at })));
  const extra = marks[MAX_EXCLAMATIONS];
  if (!extra) return [];
  return place(extra.t.where, [exclamationNote(extra.t.text, extra.at, marks.length, 'lesson')]);
}

function lintLesson(lesson: Lesson, chapterId: string): WritingFinding[] {
  const base = { chapterId, itemId: lesson.id };
  const texts: Text[] = [
    { text: lesson.title, kind: 'heading', where: { ...base, field: 'title' } },
    ...lesson.blocks.flatMap((b) => blockTexts(b, base)),
  ];
  const long = lesson.blocks.flatMap((b) =>
    b.type === 'check' ? longOption(b.options, { ...base, blockId: b.id }) : [],
  );
  return [...lintTexts(texts), ...long, ...lessonExclamations(texts)];
}

function lintQuestion(q: Question, base: Omit<Where, 'field'>): WritingFinding[] {
  const at = { ...base, questionId: q.id };
  const options = q.options.map((o) => o.text);
  const all: Text[] = [
    { text: q.prompt, kind: 'prompt', where: { ...at, field: 'prompt' } },
    ...optionList(options, at),
    { text: q.explanation, kind: 'explanation', where: { ...at, field: 'explanation' }, options },
  ];
  return [
    ...lintTexts(all),
    ...longOption(options, at),
    ...all.flatMap((t) => place(t.where, exclamations(t.text, 'text'))),
  ];
}

function lintQuiz(quiz: Quiz, chapterId: string): WritingFinding[] {
  const base = { chapterId, itemId: quiz.id };
  const title: Text = { text: quiz.title, kind: 'heading', where: { ...base, field: 'title' } };
  return [
    ...lintTexts([title]),
    ...place(title.where, exclamations(quiz.title, 'text')),
    ...quiz.questions.flatMap((q) => lintQuestion(q, base)),
  ];
}

function lintPlain(texts: readonly Text[]): WritingFinding[] {
  return texts.flatMap((t) =>
    place(t.where, [...lintOne(t.text, t.kind), ...exclamations(t.text, 'text')]),
  );
}

/**
 * Every finding in a course, in course order: course details, landing, then chapter by chapter
 * and item by item. `scope`, when given, limits the lint to the ids of `courseChanges` rows:
 * `course` (title, summary, certificate title), `landing` (description and outcomes), a chapter id
 * (its title only) or a lesson or Quiz id (everything in it). Review passes the changed rows;
 * `lint_writing` on a whole course passes nothing.
 */
export function lintCourse(work: { course: Course }, scope?: Iterable<string>): WritingFinding[] {
  const only = scope === undefined ? null : new Set(scope);
  const wanted = (id: string) => only === null || only.has(id);
  const { course } = work;
  const out: WritingFinding[] = [];
  if (wanted('course')) {
    out.push(
      ...lintPlain([
        { text: course.title, kind: 'heading', where: { field: 'title' } },
        { text: course.summary, kind: 'text', where: { field: 'summary' } },
        { text: course.certificate.title, kind: 'text', where: { field: 'certificate.title' } },
      ]),
    );
  }
  if (wanted('landing')) {
    out.push(
      ...lintPlain([
        { text: course.description, kind: 'text', where: { field: 'description' } },
        ...course.outcomes.map((text, index): Text => ({
          text,
          kind: 'text',
          where: { field: 'outcome', index },
        })),
      ]),
    );
  }
  for (const chapter of course.chapters) {
    if (wanted(chapter.id)) {
      out.push(
        ...lintPlain([
          {
            text: chapter.title,
            kind: 'heading',
            where: { chapterId: chapter.id, field: 'title' },
          },
        ]),
      );
    }
    for (const item of chapter.items) {
      if (!wanted(item.id)) continue;
      out.push(
        ...(item.type === 'lesson' ? lintLesson(item, chapter.id) : lintQuiz(item, chapter.id)),
      );
    }
  }
  return out;
}
