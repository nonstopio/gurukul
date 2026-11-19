import { describe, expect, it } from 'vitest';
import {
  EXCERPT_CHARS,
  WORN_PHRASES,
  excerptOf,
  isTitleCase,
  lintCourse,
  lintText,
  maskCode,
} from '../src/writingLint';
import type { WritingField, WritingFinding, WritingRule } from '../src/writingLint';
import type { Block, Course, Lesson, Question, Quiz } from '../src';
import { makeCourse } from './fixtures';

const rules = (findings: WritingFinding[]) => findings.map((f) => f.rule);
const rulesOf = (text: string, field: WritingField = 'md') => rules(lintText(text, field));

/** `n` plain words and a full stop. */
const words = (n: number) =>
  Array.from({ length: n }, (_, i) => (i === 0 ? 'Word' : 'word')).join(' ') + '.';

describe('maskCode', () => {
  it('keeps the length and hides fenced code, inline code, link targets, addresses and image bangs', () => {
    const text =
      'Run `git rebase`.\n```sh\nrobust!\n```\nSee [docs](https://example.com) or https://a.b/c ![x](y.png)';
    const masked = maskCode(text);
    expect(masked).toHaveLength(text.length);
    expect(masked).not.toContain('git rebase');
    expect(masked).not.toContain('robust');
    expect(masked).not.toContain('example.com');
    expect(masked).not.toContain('a.b/c');
    expect(masked).not.toContain('!');
    expect(masked).toContain('[docs]');
  });

  it('ends a fence only on a matching fence of at least the same length', () => {
    const masked = maskCode('~~~~\n~~~\nrobust\n````\nstill code\n~~~~\nprose');
    expect(masked).not.toContain('robust');
    expect(masked).not.toContain('still code');
    expect(masked.endsWith('prose')).toBe(true);
  });

  it('masks an unclosed fence to the end, and leaves an unmatched backtick alone', () => {
    expect(maskCode('```\nrobust')).not.toContain('robust');
    expect(maskCode('a ` robust')).toContain('robust');
    expect(maskCode('a ``robust`')).toContain('robust');
  });
});

describe('excerptOf', () => {
  it('collapses whitespace and cuts long text with an ellipsis', () => {
    expect(excerptOf('  a \n b  ')).toBe('a b');
    const cut = excerptOf('x'.repeat(EXCERPT_CHARS + 10));
    expect(cut).toHaveLength(EXCERPT_CHARS);
    expect(cut.endsWith('…')).toBe(true);
    expect(excerptOf('y'.repeat(EXCERPT_CHARS))).toHaveLength(EXCERPT_CHARS);
  });
});

describe('worn phrases', () => {
  /** One sample per entry: it fires that entry and nothing else. */
  const SAMPLES: Record<string, string> = {
    "in today's fast-paced": "In today's fast-paced world, teams ship daily.",
    'fast-paced': 'Teams work at a fast-paced rhythm.',
    'ever-changing': 'The ever-changing rules.',
    landscape: 'The development landscape shifts.',
    delve: 'We delve into hooks.',
    leverage: 'Leverage the cache.',
    seamlessly: 'It merges seamlessly.',
    'it is crucial to': 'It is crucial to pull first.',
    'it is important to note': 'It’s worth noting that tags move.',
    "let's dive in": "Let's dive in.",
    unlock: 'Unlock faster reviews.',
    robust: 'A robust script.',
    powerful: 'A powerful command.',
    'game-changer': 'This is a game-changer.',
    'cutting-edge': 'A state-of-the-art build.',
    'harness the power of': 'Harness the power of hooks.',
    'in the realm of': 'In the realm of testing, mocks help.',
    tapestry: 'A rich tapestry of tools.',
    'embark on': 'Embark on your first commit.',
    'navigate the complexities': 'Navigate the complexities of merging.',
    utilise: 'Utilise the stash.',
    'in order to': 'Pull in order to update.',
    'a plethora of': 'A plethora of flags.',
    paradigm: 'A paradigm shift in testing.',
    synergy: 'Synergy between teams.',
    holistic: 'A holistic view.',
    empower: 'Hooks empower teams.',
    'elevate your': 'Elevate your reviews.',
    supercharge: 'Supercharge your builds.',
    revolutionise: 'It will revolutionize testing.',
    streamline: 'Streamline the pipeline.',
    'at the end of the day': 'At the end of the day, tests pass.',
    'it goes without saying': 'Needless to say, back up first.',
    'in conclusion': 'In conclusion, rebase often.',
    "whether you're a beginner": "Whether you're a beginner or not, read on.",
    'a testament to': 'A testament to good design.',
    'plays a crucial role': 'Tests play a vital role here.',
    pivotal: 'A pivotal step.',
    'in this lesson, you will learn': "In this lesson, we'll cover tags.",
    "let's explore": "Let's explore tags.",
    foster: 'Reviews foster trust.',
    'learning journey': 'Your journey starts here.',
    'happy coding': 'Happy coding!',
  };

  it('has a sample for every entry in the list', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(WORN_PHRASES.map((w) => w.phrase).sort());
  });

  it.each(WORN_PHRASES.map((w) => [w.phrase, w] as const))('fires on "%s"', (phrase, w) => {
    const found = lintText(SAMPLES[phrase] as string, 'md');
    expect(rules(found)).toEqual(['worn-phrase']);
    expect(found[0]?.message).toContain(w.instead);
    expect(found[0]?.message).toContain(`"${found[0]?.excerpt}"`);
  });

  it.each([
    'Use the landscape layout for the screenshot.',
    'Run it with elevated privileges.',
    'Raise 2 to the power of 8.',
    'The unlockable door stays shut.',
    'Order the list by date.',
    '`leverage` is a variable name.',
    'Read https://example.com/leverage-robust first.',
    'Read [the docs](https://example.com/delve).',
    '```js\nconst robust = true;\n```',
    'Rebase before you open a pull request.',
  ])('does not fire on %j', (text) => {
    expect(rulesOf(text)).toEqual([]);
  });

  it('reports each phrase once where two overlap, in the order they appear', () => {
    const text =
      "In today's fast-paced development landscape, it is crucial to leverage Git's powerful rebasing capabilities to seamlessly maintain a clean commit history.";
    expect(lintText(text, 'md').map((f) => f.excerpt)).toEqual([
      "In today's fast-paced development",
      'it is crucial to',
      'leverage',
      'powerful',
      'seamlessly',
    ]);
  });

  it('reports every occurrence', () => {
    expect(rulesOf('A robust plan. A robust test.')).toEqual(['worn-phrase', 'worn-phrase']);
  });
});

describe('long sentences', () => {
  it.each([
    ['31 words', words(31), ['long-sentence']],
    ['30 words', words(30), []],
    ['two sentences of 20', `${words(20)} ${words(20)}`, []],
    ['a 31-word list item', `- ${words(31)}`, ['long-sentence']],
    ['a 31-word numbered item', `1. ${words(31)}`, ['long-sentence']],
    ['a 31-word heading', `# ${words(31).toLowerCase()}`, []],
    ['a 31-word table row', `| ${words(31)} |`, []],
    ['31 words broken by e.g.', `${words(15).slice(0, -1)} e.g. ${words(15)}`, ['long-sentence']],
    [
      'inline code counts as one word',
      `${words(28).slice(0, -1)} \`git rebase --onto main topic\`.`,
      [],
    ],
    ['fenced code is not counted', `${words(20)}\n\`\`\`\n${words(40)}\n\`\`\``, []],
    ['a question and an exclamation end sentences', `${words(20)}? ${words(20)}! Ok`, []],
  ])('%s', (_, text, expected) => {
    expect(rulesOf(text as string)).toEqual(expected);
  });

  it('says how many words and quotes the sentence', () => {
    const [f] = lintText(`Short one. ${words(31)}`, 'caption');
    expect(f).toMatchObject({ field: 'caption', rule: 'long-sentence' });
    expect(f?.message).toContain('31 words');
    expect(f?.excerpt.startsWith('Word word')).toBe(true);
  });
});

describe('long paragraphs', () => {
  const six = 'One. Two. Three. Four. Five. Six.';
  it.each([
    ['six sentences', six, ['long-paragraph']],
    ['five sentences', 'One. Two. Three. Four. Five.', []],
    ['six sentences over two lines', 'One. Two. Three.\nFour. Five. Six.', ['long-paragraph']],
    ['two paragraphs of three', 'One. Two. Three.\n\nFour. Five. Six.', []],
    ['split by a rule', 'One. Two. Three.\n---\nFour. Five. Six.', []],
    ['split by fenced code', 'One. Two. Three.\n```\nx\n```\nFour. Five. Six.', []],
    ['six list items', '- One.\n- Two.\n- Three.\n- Four.\n- Five.\n- Six.', []],
    ['a list item with six sentences', `- ${six}`, []],
    ['a heading ends a paragraph', 'One. Two. Three.\n## Next\nFour. Five. Six.', []],
    ['a table ends a paragraph', 'One. Two. Three.\n| a |\nFour. Five. Six.', []],
    [
      'abbreviations do not end sentences',
      'One, e.g. this. Two, i.e. that. Three. Four. Five.',
      [],
    ],
  ])('%s', (_, text, expected) => {
    expect(rulesOf(text as string)).toEqual(expected);
  });

  it('says how many sentences', () => {
    expect(lintText(six, 'description')[0]?.message).toContain('6 sentences');
  });
});

describe('exclamation marks in one text', () => {
  it.each([
    ['two', 'Great! Done!', ['exclamations']],
    ['one', 'Great, done!', []],
    ['in code', 'Use `a != b` and `!x`. Done!', []],
    ['in fenced code', '```\nwow!\n```\nDone!', []],
    ['an image', '![A diagram](d.png) Done!', []],
  ])('%s', (_, text, expected) => {
    expect(rulesOf(text as string)).toEqual(expected);
  });

  it('counts them all and quotes up to the second', () => {
    const [f] = lintText('Great! Done! Again!', 'summary');
    expect(f?.message).toContain('3 exclamation marks');
    expect(f?.excerpt).toBe('Great! Done!');
  });
});

describe('title case', () => {
  it.each([
    ['Rebasing Before You Push', true],
    ['Rebasing before you push', false],
    ['Becoming a Gurukul Educator', false],
    ['Educators And Learners', false],
    ['Writing Quizzes Right Away', true],
    ['Working with GitHub Actions', false],
    ['Git Basics', false],
    ['CI and API Design', false],
    ['Rebase: A Guide To Merging', true],
    ['Rebase: a guide', false],
    ['Using Node.js For Real Projects', true],
    ['Step 2 Of Many', false],
    ['Run `Git Rebase` Now', false],
    ['Rebase Your Branch then merge', false],
    ['What I Learned', false],
    ['Git’s Branches Explained', true],
    ['Rebase — The Basics Explained', true],
    ['', false],
  ])('%j is Title Case: %s', (heading, expected) => {
    expect(isTitleCase(maskCode(heading))).toBe(expected);
  });

  it('checks a title field as a heading, and only its case', () => {
    expect(rulesOf('Rebasing Before You Push', 'title')).toEqual(['title-case']);
    expect(rulesOf(`Rebasing before you push ${words(40)}`, 'title')).toEqual([]);
    expect(lintText('  Rebasing Before You Push', 'title')[0]?.excerpt).toBe(
      'Rebasing Before You Push',
    );
  });

  it('checks the headings inside markdown', () => {
    const found = lintText('## Why Rebase Matters ##\n\nText.\n\n### Why rebase matters', 'md');
    expect(rules(found)).toEqual(['title-case']);
    expect(found[0]?.excerpt).toBe('Why Rebase Matters');
    expect(found[0]?.message).toContain('sentence case');
  });

  it('leaves a Title Case line that is not a heading alone', () => {
    expect(rulesOf('Rebasing Before You Push', 'md')).toEqual([]);
  });
});

describe('Quiz options', () => {
  it.each([
    ['All of the above', ['above-option']],
    ['None of the above.', ['above-option']],
    ['Above all, rebase', []],
    ['`all of the above`', []],
    ['Rebase', []],
  ])('%j', (text, expected) => {
    expect(rulesOf(text as string, 'option')).toEqual(expected);
  });

  it('does not apply option rules to other fields', () => {
    expect(rulesOf('All of the above', 'md')).toEqual([]);
  });
});

describe('explanations', () => {
  it.each([
    ['', ['empty-explanation']],
    ['   ', ['empty-explanation']],
    ['Correct.', ['bare-explanation']],
    ["That's right!", ['bare-explanation']],
    ['That’s right.', ['bare-explanation']],
    ['B is correct.', ['bare-explanation', 'option-by-letter']],
    ['This is the correct answer.', ['bare-explanation']],
    ['`git rebase` is the correct answer.', ['bare-explanation']],
    [
      'Option B is correct because rebasing is the best practice in this scenario.',
      ['option-by-letter'],
    ],
    ['Option B is correct.', ['bare-explanation', 'option-by-letter']],
    ['Answer 2 is wrong: it deletes the branch.', ['option-by-letter']],
    ['(Choice C) keeps history.', ['option-by-letter']],
    ['B is correct because rebasing is the best practice in this scenario.', ['option-by-letter']],
    ['(C) was the trap: reset drops the commits.', ['option-by-letter']],
    ['Reset drops commits. D is wrong for that reason.', ['option-by-letter']],
    ['Answer: B is right, rebase keeps history linear.', ['option-by-letter']],
    ['The second option is correct because rebasing keeps history linear.', ['option-by-letter']],
    ['The first one is right: it keeps history linear.', ['option-by-letter']],
    ['The last answer deletes the branch.', ['option-by-letter']],
    ['A rebase is correct here because it keeps history linear.', []],
    ['Rebase keeps history linear. A merge is fine too.', []],
    ['Push the first commit after the rebase.', []],
    [
      'Rebase puts your commits after the newest ones on main. Merge also works, but it adds a merge commit the reviewer has to read past.',
      [],
    ],
    ['The `-b` option creates a branch.', []],
    ['The option bar is hidden.', []],
    ['Rebase is correct.', []],
  ])('%j', (text, expected) => {
    expect(rulesOf(text as string, 'explanation')).toEqual(expected);
  });

  it('names what to do', () => {
    expect(lintText('', 'explanation')[0]).toMatchObject({ excerpt: '', field: 'explanation' });
    expect(lintText('Correct.', 'explanation')[0]?.message).toContain('why');
  });

  it('does not apply explanation rules to other fields', () => {
    expect(rulesOf('', 'md')).toEqual([]);
    expect(rulesOf('Option B is correct.', 'md')).toEqual([]);
  });
});

describe('negative questions', () => {
  it.each([
    ['Which command does not rewrite history?', ['unmarked-negative']],
    ['Which command does **not** rewrite history?', []],
    ['Which command is _not_ safe?', []],
    ['Which command is NOT safe?', []],
    ["Which one isn't safe?", ['unmarked-negative']],
    ['All of the following are safe except', ['unmarked-negative']],
    ['Never rebase which branch?', ['unmarked-negative']],
    ['Which one is _not', ['unmarked-negative']],
    ['What happens if you do not pull first?', []],
    ['Which command rewrites history?', []],
    ['Which flag means `--not`?', []],
  ])('%j', (text, expected) => {
    expect(rulesOf(text as string, 'prompt')).toEqual(expected);
  });

  it('shows how to mark the word it found', () => {
    expect(lintText("Which one isn't safe?", 'prompt')[0]?.message).toContain("**isn't** or ISN'T");
  });

  it('does not apply to other fields', () => {
    expect(rulesOf('Which command does not rewrite history?', 'md')).toEqual([]);
  });
});

// ─── The course ──────────────────────────────────────────────────────────────────────────────────

const lesson = (id: string, blocks: Block[], title = 'A lesson'): Lesson => ({
  type: 'lesson',
  id,
  title,
  minutes: 5,
  layout: 'stacked',
  completeWhen: 'manual',
  blocks,
});

const question = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  kind: 'single',
  prompt: 'Which command replays commits?',
  options: [
    { id: 'a', text: 'Rebase' },
    { id: 'b', text: 'Merge' },
    { id: 'c', text: 'Reset' },
  ],
  explanation: 'Rebase replays your commits on top of main.',
  ...over,
});

const quiz = (id: string, questions: Question[], title = 'Check'): Quiz => ({
  type: 'quiz',
  id,
  title,
  questionsShown: 1,
  shuffleOptions: true,
  cooldownMinutes: 0,
  revealAnswers: 'each',
  blocksNext: true,
  questions,
});

/** A course with clean text everywhere, then `items` in chapter p1. */
function course(items: (Lesson | Quiz)[], over: Partial<Course> = {}): { course: Course } {
  return {
    course: makeCourse({
      title: 'Git for teams',
      summary: 'Branches, rebases and reviews.',
      description: 'You will rebase a branch.',
      outcomes: ['Rebase a branch'],
      certificate: { title: 'Git for teams' },
      chapters: [{ id: 'p1', title: 'Basics', items }],
      ...over,
    }),
  };
}

/** A finding's place: everything but what it says. */
const where = (f: WritingFinding): Partial<WritingFinding> =>
  Object.fromEntries(
    Object.entries(f).filter(([key]) => !['rule', 'excerpt', 'message'].includes(key)),
  );

describe('lintCourse', () => {
  it('finds nothing in clean text', () => {
    expect(lintCourse(course([lesson('l1', []), quiz('q1', [question('k1')])]))).toEqual([]);
  });

  it('places course and landing findings by field', () => {
    const found = lintCourse(
      course([], {
        title: 'Git For Busy Teams',
        summary: 'A robust start.',
        certificate: { title: 'Robust Git' },
        description: 'Leverage git.',
        outcomes: ['Rebase', 'Unlock reviews'],
      }),
    );
    expect(found.map((f) => [f.rule, where(f)])).toEqual([
      ['title-case', { field: 'title' }],
      ['worn-phrase', { field: 'summary' }],
      ['worn-phrase', { field: 'certificate.title' }],
      ['worn-phrase', { field: 'description' }],
      ['worn-phrase', { field: 'outcome', index: 1 }],
    ]);
  });

  it('counts exclamation marks in each course text on its own', () => {
    expect(rules(lintCourse(course([], { summary: 'Go! Now!', description: 'Yes!' })))).toEqual([
      'exclamations',
    ]);
  });

  it('places block findings by block and field, and never lints code', () => {
    const blocks: Block[] = [
      {
        type: 'video',
        id: 'v',
        provider: 'youtube',
        url: 'https://youtu.be/x',
        captions: true,
        title: 'A Robust Demo',
        caption: 'Robust.',
      },
      { type: 'video', id: 'v2', provider: 'youtube', url: 'https://youtu.be/y', captions: true },
      { type: 'markdown', id: 'm', md: 'Leverage it.' },
      { type: 'callout', id: 'c', tone: 'tip', title: 'Use It Like This', md: 'Delve in.' },
      { type: 'callout', id: 'c2', tone: 'note', md: 'Fine.' },
      {
        type: 'image',
        id: 'i',
        url: 'https://x.test/a.png',
        alt: 'A robust chart',
        caption: 'Robust.',
      },
      { type: 'image', id: 'i2', url: 'https://x.test/b.png', alt: 'A chart' },
      { type: 'embed', id: 'e', url: 'https://x.test/e', title: 'Robust board' },
      { type: 'file', id: 'f', url: 'https://x.test/f.pdf', label: 'Robust notes' },
      {
        type: 'code',
        id: 'k',
        lang: 'ts',
        file: 'robust.ts',
        code: 'const robust = 1; // Leverage!!',
        copy: true,
        terminal: false,
      },
    ];
    const found = lintCourse(course([lesson('l1', blocks)]));
    expect(found.map((f) => [f.rule, where(f)])).toEqual([
      ['worn-phrase', { chapterId: 'p1', itemId: 'l1', blockId: 'v', field: 'title' }],
      ['worn-phrase', { chapterId: 'p1', itemId: 'l1', blockId: 'v', field: 'caption' }],
      ['worn-phrase', { chapterId: 'p1', itemId: 'l1', blockId: 'm', field: 'md' }],
      ['title-case', { chapterId: 'p1', itemId: 'l1', blockId: 'c', field: 'title' }],
      ['worn-phrase', { chapterId: 'p1', itemId: 'l1', blockId: 'c', field: 'md' }],
      ['worn-phrase', { chapterId: 'p1', itemId: 'l1', blockId: 'i', field: 'alt' }],
      ['worn-phrase', { chapterId: 'p1', itemId: 'l1', blockId: 'i', field: 'caption' }],
      ['worn-phrase', { chapterId: 'p1', itemId: 'l1', blockId: 'e', field: 'title' }],
      ['worn-phrase', { chapterId: 'p1', itemId: 'l1', blockId: 'f', field: 'label' }],
    ]);
  });

  it('applies the Quiz rules to a check block', () => {
    const check: Block = {
      type: 'check',
      id: 'ch',
      prompt: 'Which command does not rewrite history?',
      options: ['Merge', 'Rebase', 'All of the above, and also a very long option'],
      explanation: 'Merge is correct.',
    };
    const found = lintCourse(course([lesson('l1', [check])]));
    const at = { chapterId: 'p1', itemId: 'l1', blockId: 'ch' };
    expect(found.map((f) => [f.rule, where(f)])).toEqual([
      ['unmarked-negative', { ...at, field: 'prompt' }],
      ['above-option', { ...at, field: 'option', index: 2 }],
      ['bare-explanation', { ...at, field: 'explanation' }],
      ['long-option', { ...at, field: 'option', index: 2 }],
    ]);
  });

  it('counts exclamation marks across a whole lesson, once, at the first one too many', () => {
    const blocks: Block[] = [
      { type: 'markdown', id: 'm1', md: 'Nice!' },
      { type: 'markdown', id: 'm2', md: 'Done! Really!' },
    ];
    const found = lintCourse(course([lesson('l1', blocks, 'Wow!')]));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'exclamations', blockId: 'm1', field: 'md' });
    expect(found[0]?.message).toContain('This lesson has 4 exclamation marks');
    expect(rules(lintCourse(course([lesson('l1', blocks.slice(0, 1))])))).toEqual([]);
  });

  it('places Quiz findings by question and field', () => {
    const q = question('k1', {
      prompt: 'Which is not a robust choice?',
      options: [
        { id: 'a', text: 'Rebase' },
        { id: 'b', text: 'Merge' },
        { id: 'c', text: 'Reset' },
        { id: 'd', text: 'None of the above, because every one of them works' },
      ],
      explanation: 'Option D is correct!!',
    });
    const found = lintCourse(course([quiz('q1', [q], 'Quick Check Here!!')]));
    const at = { chapterId: 'p1', itemId: 'q1' };
    const kq = { ...at, questionId: 'k1' };
    expect(found.map((f) => [f.rule, where(f)])).toEqual([
      ['title-case', { ...at, field: 'title' }],
      ['exclamations', { ...at, field: 'title' }],
      ['worn-phrase', { ...kq, field: 'prompt' }],
      ['unmarked-negative', { ...kq, field: 'prompt' }],
      ['above-option', { ...kq, field: 'option', index: 3 }],
      ['bare-explanation', { ...kq, field: 'explanation' }],
      ['option-by-letter', { ...kq, field: 'explanation' }],
      ['long-option', { ...kq, field: 'option', index: 3 }],
      ['exclamations', { ...kq, field: 'explanation' }],
    ]);
  });

  it('removes the option texts before deciding an explanation is bare', () => {
    const q = question('k1', { explanation: 'Rebase is correct.' });
    expect(rules(lintCourse(course([quiz('q1', [q])])))).toEqual(['bare-explanation']);
    const blank = question('k1', {
      options: [
        { id: 'a', text: ' ' },
        { id: 'b', text: 'Merge' },
      ],
      explanation: 'Merge keeps both histories.',
    });
    expect(rules(lintCourse(course([quiz('q1', [blank])])))).toEqual([]);
  });

  it.each([
    ['three options, one long', ['Rebase', 'Merge', 'Cherry-pick then squash'], 2],
    ['four options, one long', ['abc', 'abcd', 'abcde', 'a very long option text'], 3],
    ['three options of similar length', ['Rebase', 'Merge', 'Cherry-pick'], null],
    ['two options', ['Yes', 'No, because it rewrites every commit'], null],
    ['blank options left out of the median', ['', '', 'Rebase'], null],
    ['one option with text', ['', 'Rebase'], null],
    ['blank options with a long one', ['', 'Ab', 'Cd', 'Efghij'], 3],
  ])('long option: %s', (_, texts, index) => {
    const q = question('k1', {
      options: (texts as string[]).map((text, i) => ({ id: `o${i}`, text })),
    });
    const found = lintCourse(course([quiz('q1', [q])])).filter((f) => f.rule === 'long-option');
    expect(found.map((f) => f.index)).toEqual(index === null ? [] : [index]);
  });

  it('says how much longer the long option is', () => {
    const q = question('k1', {
      options: ['Ab', 'Cd', 'Efghij'].map((text, i) => ({ id: `o${i}`, text })),
    });
    expect(lintCourse(course([quiz('q1', [q])]))[0]?.message).toContain('3.0 times');
  });

  it('places a chapter title finding by chapter', () => {
    const found = lintCourse(
      course([], { chapters: [{ id: 'p9', title: 'Rebase Done Right', items: [] }] }),
    );
    expect(found.map(where)).toEqual([{ chapterId: 'p9', field: 'title' }]);
  });

  describe('scope', () => {
    const messy = () =>
      course(
        [
          lesson('l1', [{ type: 'markdown', id: 'm', md: 'Robust.' }]),
          quiz('q1', [question('k1', { explanation: '' })]),
        ],
        {
          title: 'Git For Busy Teams',
          description: 'Leverage git.',
          chapters: [],
        },
      );
    const scoped = (scope: string[]) => {
      const c = messy();
      c.course.chapters = [
        {
          id: 'p1',
          title: 'Rebase Done Right',
          items: [
            lesson('l1', [{ type: 'markdown', id: 'm', md: 'Robust.' }]),
            quiz('q1', [question('k1', { explanation: '' })]),
          ],
        },
      ];
      return lintCourse(c, scope).map((f) => `${f.itemId ?? f.chapterId ?? 'course'}:${f.field}`);
    };

    it.each([
      [['course'], ['course:title']],
      [['landing'], ['course:description']],
      [['p1'], ['p1:title']],
      [['l1'], ['l1:md']],
      [['q1'], ['q1:explanation']],
      [
        ['l1', 'q1'],
        ['l1:md', 'q1:explanation'],
      ],
      [[], []],
      [['unknown'], []],
    ])('%j', (scope, expected) => {
      expect(scoped(scope as string[])).toEqual(expected);
    });

    it('lints everything without a scope', () => {
      expect(lintCourse(messy())).toHaveLength(2);
    });
  });

  it('runs on the plan’s before and after examples', () => {
    const before =
      "In today's fast-paced development landscape, it is crucial to leverage Git's powerful rebasing capabilities to seamlessly maintain a clean commit history.";
    const after =
      'Rebase before you open a pull request. It replays your commits on top of the latest main, so the reviewer sees only your changes.';
    const rulesFor = (md: string, explanation: string): WritingRule[] =>
      rules(
        lintCourse(
          course([
            lesson('l1', [{ type: 'markdown', id: 'm', md }]),
            quiz('q1', [question('k1', { explanation })]),
          ]),
        ),
      );
    expect(
      rulesFor(
        before,
        'Option B is correct because rebasing is the best practice in this scenario.',
      ),
    ).toEqual([...Array<WritingRule>(5).fill('worn-phrase'), 'option-by-letter']);
    expect(
      rulesFor(
        after,
        'Rebase puts your commits after the newest ones on main. Merge also works, but it adds a merge commit the reviewer has to read past.',
      ),
    ).toEqual([]);
  });
});
