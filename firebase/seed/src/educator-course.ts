import type { Block, Chapter, Course, Lesson, Quiz } from '@gurukul/schema';
import type { AnswerKeys } from './seed';

/*
 * The second course, "Becoming a Gurukul Educator". An Admin assigns it; finishing it (every
 * lesson, and the Final Quiz passed) makes the learner an Educator, so they can build courses in
 * Studio.
 *
 * - One story runs through it: Kavya, a developer, builds a short course called "Writing good
 *   commit messages" in Studio. Her colleague Rohan is a Learner who takes it.
 * - The reader is not an Educator yet and cannot open Studio, so lessons describe what they will
 *   see. Every claim about Studio matches the app: labels in bold are the ones in
 *   apps/web/src/studio/. Nothing here teaches what is not built (cover image upload, lesson
 *   layout) or promises what learners do not see (video length and captions).
 * - Reading lessons only, no images or videos. Each lesson ends with a check.
 * - `publishedAt` is null here; the seeder stamps it. Answer keys live in `educatorAnswers`, never
 *   in the course object.
 */

type Draft = Block extends infer B ? (B extends unknown ? Omit<B, 'id'> : never) : never;

const lines = (...l: string[]) => l.join('\n');

const md = (...l: string[]): Draft => ({ type: 'markdown', md: lines(...l) });
const tip = (title: string, ...l: string[]): Draft => ({
  type: 'callout',
  tone: 'tip',
  title,
  md: lines(...l),
});
const note = (title: string, ...l: string[]): Draft => ({
  type: 'callout',
  tone: 'note',
  title,
  md: lines(...l),
});
const warn = (title: string, ...l: string[]): Draft => ({
  type: 'callout',
  tone: 'warning',
  title,
  md: lines(...l),
});
/** `correct` is the index of the right option; most checks list it first. */
const check = (prompt: string, options: string[], explanation: string, correct = 0): Draft => ({
  type: 'check',
  prompt,
  options,
  correct,
  explanation,
});

/** Every lesson here is a reading lesson, complete when the learner scrolls to the end. */
const lesson = (id: string, title: string, minutes: number, drafts: Draft[]): Lesson => ({
  type: 'lesson',
  id,
  title,
  minutes,
  layout: 'article',
  completeWhen: 'scrolled',
  kindLabel: 'Reading',
  blocks: drafts.map((d, i) => ({ ...d, id: `${id}-${i + 1}` }) as Block),
});

interface QuestionSpec {
  id: string;
  kind: 'single' | 'multiple' | 'trueFalse';
  prompt: string;
  options: string[];
  /** Zero-based positions of the correct options; option ids are 'a', 'b', 'c', 'd'. */
  correct: number[];
  explanation: string;
  review: string;
}

const OPTION_IDS = ['a', 'b', 'c', 'd'];

const keysOf = (specs: QuestionSpec[]): Record<string, string[]> =>
  Object.fromEntries(specs.map((s) => [s.id, s.correct.map((i) => OPTION_IDS[i] as string)]));

const quiz = (
  id: string,
  title: string,
  specs: QuestionSpec[],
  revealAnswers: Quiz['revealAnswers'],
  cooldownMinutes: number,
): Quiz => ({
  type: 'quiz',
  id,
  title,
  questionsShown: specs.length,
  shuffleOptions: true,
  cooldownMinutes,
  revealAnswers,
  blocksNext: true,
  questions: specs.map((s) => ({
    id: s.id,
    kind: s.kind,
    prompt: s.prompt,
    options: s.options.map((text, i) => ({ id: OPTION_IDS[i] as string, text })),
    explanation: s.explanation,
    reviewItemId: s.review,
  })),
});

// ---------------------------------------------------------------------------------------------
// Chapter 1 · Before you start
// ---------------------------------------------------------------------------------------------

const chapter1: Chapter = {
  id: 'before-you-start',
  title: 'Before you start',
  items: [
    lesson('the-educator-role', 'What an Educator can and cannot do', 3, [
      md(
        '## Meet Kavya',
        '',
        'Kavya is a developer. Every few weeks someone new joins her team, and every few weeks she explains the same thing: how to write a commit message the next person can understand. So she decides to write it down once, properly, as a short course on Gurukul. Her colleague Rohan, who joined last month, will be one of the first to take it.',
        '',
        'To build a course she needs to be an **Educator**. An Admin assigned her this course, the one you are reading. When she finishes every lesson and passes the Final Quiz, Gurukul makes her an Educator on its own. It will do the same for you.',
        '',
        '## Three roles',
        '',
        '- **Learner**: everyone who signs in. Learners take courses, answer Quizzes and earn certificates.',
        '- **Educator**: a Learner who can also open **Studio**, where courses are built.',
        '- **Admin**: looks after Gurukul as a whole: assigns courses, manages roles and teams, and can edit every course.',
        '',
        '## Who can edit a course',
        '',
        'Every Educator sees every course in Studio, but edits only the courses that list them as an Educator. Whoever creates a course becomes its first Educator. To add or remove Educators on a course, ask an Admin: Educators cannot change that list themselves.',
        '',
        "Open a course you are not an Educator of and Studio marks it **View only**, with its Educators' names. You can read it, but not change it.",
      ),
      note(
        'Bring a laptop',
        'Studio does not open on a phone or a narrow window. It asks you to use a laptop or desktop, because building a course needs room. Learners, of course, can take your course on any screen.',
      ),
      check(
        "Kavya, now an Educator, opens her teammate's course in Studio and wants to fix a typo in it. What happens?",
        [
          'She sees it as View only, and asks an Admin to add her as one of its Educators',
          'She fixes it, because every Educator can edit every course',
          'She cannot find it, because Educators see only their own courses',
        ],
        'Educators see every course but edit only the ones that list them. An Admin changes who is on that list.',
      ),
    ]),
    lesson('how-a-course-fits-together', 'How a course fits together', 2, [
      md(
        '## Four pieces',
        '',
        'Every course on Gurukul is built from the same pieces:',
        '',
        '- A **course** has a title, a one-sentence summary, a level and a cover.',
        '- It is divided into **chapters**, each a small topic.',
        '- A chapter holds **lessons** and **Quizzes**, in order.',
        '- A lesson is a column of **blocks**: text, a video, a code sample, an image, a quick question.',
        '',
        'There is room for a lot: up to 30 chapters, 60 items in a chapter, 60 blocks in a lesson and 60 questions in a Quiz. You will rarely want anywhere near that.',
        '',
        '## Draft and published',
        '',
        "Everything you change in Studio goes into the course's **draft**. Learners never see the draft. They see the **published** version, and only that, until you publish again. Each publish makes a new version: v1, v2, v3.",
        '',
        'So Kavya can rewrite a lesson over a week, and Rohan keeps reading the old one until the moment she publishes.',
      ),
      check(
        'Kavya is halfway through rewriting a lesson in a published course. Rohan opens that lesson now. What does he read?',
        [
          'The lesson as it was when Kavya last published',
          'Her half-finished rewrite',
          'A message that the lesson is being edited',
        ],
        'Edits go into the draft. Learners see the last published version until the next publish.',
      ),
    ]),
    lesson('start-from-outcomes', 'Start from what people will be able to do', 3, [
      md(
        '## The question to ask first',
        '',
        'It is tempting to start by writing everything you know. Kavya knows a lot about commit messages: the history of the 50-character rule, three conventions, a few strong opinions. Most of it would not help a new joiner.',
        '',
        'So before she writes a lesson, she answers one question: **when someone finishes this course, what will they be able to do?** Those answers are her **outcomes**.',
        '',
        '**Weak**',
        '',
        '> Understand commit messages',
        '',
        '**Better**',
        '',
        '> Rewrite a vague commit message so a teammate can tell what changed and why',
        '',
        'You cannot see understanding. You can see someone rewrite a message. An outcome is something a person can **do**, and that a Quiz question could check.',
        '',
        '## Outcomes decide the rest',
        '',
        'Each outcome needs a lesson or two that teaches it, and a Quiz question that checks it. Anything that serves no outcome can go, however interesting it is. Kavya ends up with three outcomes and three chapters.',
      ),
      check(
        "Which of these is the strongest outcome for Kavya's course?",
        [
          'Learn about Git history',
          'Write a commit subject line that says what changed, in under 50 characters',
          'Appreciate why commit messages matter',
        ],
        'A strong outcome names something a person can do, and you can check whether they did it. "Learn about" and "appreciate" happen out of sight.',
        1,
      ),
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Chapter 2 · Setting up a course
// ---------------------------------------------------------------------------------------------

const chapter2: Chapter = {
  id: 'setting-up-a-course',
  title: 'Setting up a course',
  items: [
    lesson('new-course', 'Create a course, or copy one', 3, [
      md(
        '## Your way round Studio',
        '',
        'Studio has four pages: **Studio** (your courses), **Teams**, **Question bank** and **Media library**. The courses page has tabs for **All**, **Published** and **Drafts**. Each course card shows its status (such as **Published · v3** or **Draft**), how many chapters, lessons and Quizzes it has, how many unpublished edits are waiting, and when it was last edited.',
        '',
        '## New course',
        '',
        'Choose **New course**. The dialog asks for:',
        '',
        '- **Title**: Kavya types "Writing good commit messages". It can change later.',
        '- **Address**: filled in from the title, here `writing-good-commit-messages`. Lower-case letters, digits and single hyphens only. It appears in links and **cannot change later**, because progress and certificates point at it. If someone already has it, Studio says **That address is taken**.',
        '- **Level**: Foundation, Intermediate or Advanced.',
        '- **Cover theme**: Forest, Sand, Sky or Stone. The cover shows the first letter of the title.',
        '- **Duplicate from**: **Start blank**, or copy a course you can edit.',
        '',
        '**Create course** opens the new course in the course editor.',
        '',
        '## Blank or copied',
        '',
        "A blank course has no chapters and no summary yet, and its certificate is switched off. A copy takes the source's **draft**, including edits nobody has published yet and the Quiz answers. It becomes a new draft, with you as its only Educator. Learners' progress never comes with it.",
      ),
      tip(
        'Pick the address with care',
        'Short and plain wins: `writing-good-commit-messages`, not `kavya-course-final-v2`. You will live with it.',
      ),
      check(
        'Kavya wants a harder follow-up course and picks her first course in Duplicate from. Which of these comes with the copy?',
        [
          'Her unpublished edits to the first course, and its Quiz answers',
          "Rohan's progress through the first course",
          'The address of the first course',
        ],
        'A copy takes the whole draft, answers included. It gets its own address and starts with no learners.',
      ),
    ]),
    lesson('course-details', 'Course details and the landing page', 3, [
      md(
        '## Course details',
        '',
        'Beside the **Structure** tab sits a **Course details** card: **Title**, **Summary**, **Level**, **Pass mark (%)** and **Cover theme**. The address is shown but cannot change. There is an **Upload cover image** button, but uploading covers is not switched on yet, so the cover is the theme and its letter.',
        '',
        'The **Summary** is one sentence shown on the course card. A course cannot be published without one.',
        '',
        '**Weak**',
        '',
        '> This course is about commits and how to do them better, with lots of tips.',
        '',
        '**Better**',
        '',
        '> Write commit messages your teammates can read six months from now.',
        '',
        '## Landing page',
        '',
        'The **Landing page** tab holds the **Description**, which can use Markdown: say who the course is for and what it covers. Below it, **What learners will be able to do** holds your outcomes, up to 12, added with **Add outcome**. Learners read this page before they start.',
        '',
        '## Certificate',
        '',
        'The **Certificate** tab holds the **Certificate title** printed on the certificate. The name signing it is set by an Admin for everyone.',
      ),
      check(
        'Kavya leaves the Summary empty and tries to publish. What happens?',
        [
          'Studio stops the publish and says the course needs a one-sentence summary',
          'The course publishes with a blank card',
          'Studio writes a summary from the description',
        ],
        'An empty summary blocks publishing. It is the one sentence people read before they decide to open the course.',
      ),
    ]),
    lesson('learning-rules', 'Learning rules', 3, [
      md(
        '## Three switches',
        '',
        'The **Learning rules** card has three switches for the whole course.',
        '',
        '**Learners go in order.** Each chapter stays locked until the one before it is passed. A chapter with Quizzes is passed when every Quiz in it is passed; a chapter without one, when every lesson in it is done. Inside an open chapter, learners can read lessons in any order.',
        '',
        '**Issue a certificate.** A learner gets a certificate the moment every lesson is done and every Quiz is passed. Studio will not publish a course with this on unless it has at least one Quiz and a certificate title.',
        '',
        '**Require watching videos.** In every lesson that has a video, learners must watch 90% of each video before the lesson can be marked complete. It does nothing in lessons without a video. You will see how watching is measured in the video lesson.',
        '',
        '## Pass mark',
        '',
        '**Pass mark (%)** is the score each Quiz needs, unless a Quiz sets its own. It must be above 0%, or every attempt would pass. 70% is a sensible start.',
        '',
        'The course length is not a setting: Gurukul adds up the minutes of every lesson when you publish.',
      ),
      check(
        'Kavya turns on Issue a certificate, but her course has no Quiz yet. What does she need before she can publish?',
        [
          'At least one Quiz, and a certificate title',
          'An Admin to approve the certificate',
          'Require watching videos switched on as well',
        ],
        'A certificate has to be earned, so it needs a Quiz. Studio lists both missing pieces before it publishes.',
      ),
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Chapter 3 · Shaping the course
// ---------------------------------------------------------------------------------------------

const chapter3: Chapter = {
  id: 'shaping-the-course',
  title: 'Shaping the course',
  items: [
    lesson('structure-tab', 'Chapters, lessons and Quizzes', 3, [
      md(
        '## The Structure tab',
        '',
        'On **Structure**, **Add chapter** adds a chapter called "New chapter"; type its real name over it. Inside each chapter, **+ Lesson** and **+ Quiz** add an item at the end. Click an item\'s title to open the lesson editor or the Quiz builder.',
        '',
        'Each row shows a small tile for its kind (reading, video, code or Quiz), its minutes or number of questions, and a **New** or **Edited** chip when it differs from the published version. Each row also has **Rename**, **Move to chapter** and **Delete**.',
        '',
        '## Titles that say something',
        '',
        '**Weak**',
        '',
        '> Lesson 3: More on commits',
        '',
        '**Better**',
        '',
        '> Say why, not just what, in the message body',
        '',
        'A learner scanning the outline should know what each lesson teaches before opening it.',
        '',
        '## Moving and deleting',
        '',
        'Drag a row by its grip to reorder it, or use the keyboard: Space or Enter lifts it, the arrow keys move it, Space or Enter drops it, Escape cancels. Lessons reorder inside their chapter; to send one to another chapter, use **Move to chapter**.',
        '',
        'Renaming and moving are always safe: progress is kept by lesson id, which never changes. Deleting asks first, and for a published lesson it says how many learners completed it. They keep their record. Deleting a Quiz also deletes its answers.',
      ),
      check(
        'Rohan finished the lesson "The subject line". Kavya renames it and moves it to another chapter. What happens to his progress?',
        [
          'It stays: progress is matched by lesson id, which renaming and moving keep',
          'It is lost, so he has to read the lesson again',
          'It stays only if Kavya keeps the old title',
        ],
        "Each lesson has a fixed id. Titles and positions can change freely without touching anyone's progress.",
      ),
    ]),
    lesson('one-idea-per-lesson', 'One idea per lesson', 3, [
      md(
        '## Short lessons get finished',
        '',
        'People take courses between other work: after a stand-up, while a build runs. A three-minute lesson gets finished. A twenty-minute one gets left half-read. Keep each lesson to about **one idea** and **2 to 10 minutes**. If a lesson needs two headings that could each stand alone, it is two lessons.',
        '',
        '## Show, then name',
        '',
        "Write the way you would explain it at a colleague's desk: short sentences, everyday words, and an example before the rule.",
        '',
        '**Weak**: a wall of rules',
        '',
        '> A commit message should adequately convey the semantic intent of the changeset. The subject line must not exceed 50 characters, must use the imperative mood, must not end in a full stop, and should be followed by a blank line and a body wrapped at 72 characters that explains motivation and contrasts with previous behaviour.',
        '',
        '**Better**: one idea, shown first',
        '',
        '> Which of these will help you in six months?',
        '>',
        '> - `fix stuff`',
        '> - `Fix the price of ginger chai on the menu`',
        '>',
        '> The second one says what changed. That is the whole job of a subject line.',
        '',
        'The reader sees the point before Kavya names it, and the rule sticks because it explains something they noticed.',
      ),
      check(
        'Kavya\'s lesson "The subject line" has grown to fifteen minutes and also covers the message body. What should she do?',
        [
          'Raise its estimated minutes to fifteen and leave it',
          'Split it into two lessons: one for the subject line, one for the body',
          'Turn it into a Quiz',
        ],
        'Two ideas make two lessons, each short enough to finish in one sitting.',
        1,
      ),
    ]),
    lesson('lesson-settings', 'Lesson settings, and when a lesson is done', 4, [
      md(
        '## Lesson settings',
        '',
        'Below the blocks in the lesson editor is a **Lesson settings** card:',
        '',
        '- **Estimated minutes**: be honest. Count the time it takes to read slowly and answer the check, not the time it takes you.',
        '- **Type label**: a word shown beside the lesson, such as Reading or Hands-on.',
        '- **Completion rule**: **The learner marks it done**, **After 90% of the video**, or **After scrolling to the end**.',
        '',
        'There is no layout setting: every lesson reads as one column.',
        '',
        '## When a lesson counts as done',
        '',
        'The learner always presses **Mark complete** (or **Finish course** on the last item). Before it works, Gurukul checks, in this order:',
        '',
        '1. **Videos.** If the lesson has a video, and either its rule is **After 90% of the video** or the course has **Require watching videos** on, each video must be 90% watched.',
        '2. **Checks.** Every Check block in the lesson must be answered, whatever the completion rule.',
        '3. **Scrolling.** With **After scrolling to the end**, the end of the lesson must have come into view.',
        '',
        'If something is missing, Rohan sees what, for example "Read to the end to mark this lesson complete."',
      ),
      warn(
        'Video rule, no video',
        'A lesson set to **After 90% of the video** that has no Video block waits for nothing. Use the rule only on lessons that hold the video.',
      ),
      check(
        'A lesson\'s rule is "The learner marks it done" and it ends with a Check block. Rohan presses Mark complete without answering the check. What happens?',
        [
          'The lesson completes, because the rule is manual',
          'Gurukul asks him to answer the question first',
          'The check is marked wrong and the lesson completes',
        ],
        'Every Check block must be answered before a lesson completes, under every completion rule.',
        1,
      ),
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Chapter 4 · Writing with blocks
// ---------------------------------------------------------------------------------------------

const blocksSpecs: QuestionSpec[] = [
  {
    id: 'b1',
    kind: 'single',
    prompt:
      'Kavya wants to compare three commit conventions side by side, so she types a Markdown table into a Text block. What will Rohan see, and what should she do?',
    options: [
      'The raw pipes and dashes, because tables do not render; a short list per convention works instead',
      'A neat grid, because Text blocks render tables',
      'A grid, as long as she writes the table in HTML',
      'A grid, if she moves the table into a Callout',
    ],
    correct: [0],
    explanation:
      "Text blocks do not render tables, and raw HTML is dropped. A list with each item's key word in bold, or an image, does the job.",
    review: 'text-blocks',
  },
  {
    id: 'b2',
    kind: 'multiple',
    prompt:
      'Kavya wants Rohan to watch a four-minute YouTube video before he can complete its lesson. Which of these make that happen? Choose all that apply.',
    options: [
      "Set the lesson's Completion rule to After 90% of the video",
      'Turn on Require watching videos in the Learning rules',
      'Tick Captions are available on the Video block',
      'Fill in Length in seconds on the Video block',
    ],
    correct: [0, 1],
    explanation:
      'Either the lesson rule or the course rule makes learners watch 90% of the video. Captions and length are stored, but they change nothing for learners.',
    review: 'video-blocks',
  },
  {
    id: 'b3',
    kind: 'single',
    prompt:
      'Kavya uploads a screenshot of a Git log full of commits titled "fix stuff". Which alt text serves a learner who cannot see it?',
    options: [
      'A Git log in which every commit is titled "fix stuff", so nothing says what changed',
      'Image of a Git log',
      'Screenshot',
      'Nothing, because the caption already explains it',
    ],
    correct: [0],
    explanation:
      'Good alt text says what the picture means, not that it is a picture. An empty one also stops the course from publishing.',
    review: 'image-blocks',
  },
  {
    id: 'b4',
    kind: 'trueFalse',
    prompt:
      'Kavya drags a 3000-pixel, 900 KB PNG into an Image block. Gurukul shrinks it on its own and uploads it.',
    options: ['True', 'False'],
    correct: [1],
    explanation:
      'Studio refuses it as it is and explains why. It shrinks the image only when Kavya chooses Shrink it for me.',
    review: 'image-blocks',
  },
  {
    id: 'b5',
    kind: 'single',
    prompt:
      'Kavya wants learners to try a small runnable example without leaving the lesson. Which block fits?',
    options: [
      'An Embed block with a CodeSandbox or StackBlitz address',
      'A Code block with Terminal style on',
      'A File block linking to the project',
      'A Video block with the project link',
    ],
    correct: [0],
    explanation:
      'Embed shows a page from an allowed site inside the lesson; CodeSandbox and StackBlitz are on that list. A Code block shows code but cannot run it.',
    review: 'files-and-embeds',
  },
];

const chapter4: Chapter = {
  id: 'writing-with-blocks',
  title: 'Writing with blocks',
  items: [
    lesson('the-lesson-editor', 'The lesson editor', 2, [
      md(
        '## A column of blocks',
        '',
        'Open a lesson and you see its title, its blocks, and an **Add a block** palette with eight tiles: **Text**, **Video**, **Code**, **Callout**, **Image**, **Embed**, **File** and **Check**. A new block lands at the end and takes the cursor, ready to type into.',
        '',
        'Each block has a grip to drag it, buttons to duplicate or delete it, and (except Text, which has its own) an **Edit | Preview** switch to see it as a learner will. Deleting a block you have changed asks first. A rail down the side lists every lesson and Quiz in the course, so you can hop between them.',
        '',
        'Anything that would stop the course publishing, such as an empty block, shows right under that block, so you can fix it as you go.',
      ),
      tip(
        'Press / to add a block',
        'Outside a text field, or in an empty one, the **/** key jumps straight to the palette.',
      ),
      check(
        'Kavya sees "A text block is empty." under one of her blocks. What does it mean?',
        [
          'That block would stop the course from publishing until she fills or deletes it',
          'The block has failed to save',
          'Learners will see a warning in that spot',
        ],
        'Studio shows publish problems beside the block that causes them, so they can be fixed while writing.',
      ),
    ]),
    lesson('text-blocks', 'Text: what formatting works', 4, [
      md(
        '## Text is Markdown',
        '',
        'Most of a lesson is **Text**. You write Markdown, and the toolbar helps with **Bold**, **Italic**, **Inline code**, **Link** and **Numbered list**. Its **Preview** button shows the result. Here is what Kavya types:',
      ),
      {
        type: 'code',
        lang: 'text',
        file: 'What Kavya types',
        code: lines(
          '## The subject line',
          '',
          'Say **what** changed, in *one* line. Run `git log --oneline` to see yours.',
          '',
          '1. Start with a verb: Fix, Add, Remove',
          '2. Keep it under 50 characters',
          '',
          '- one bullet',
          '- another bullet',
          '',
          '> A quoted example message',
          '',
          '[Git documentation](https://git-scm.com/doc)',
        ),
        copy: false,
        terminal: false,
      },
      md(
        '## What works',
        '',
        '- Headings (`##`, `###`), paragraphs, **bold** and *italic*',
        '- Numbered and bulleted lists',
        '- `inline code` and fenced code between three backticks',
        '- Quotes, starting with `>`',
        '- Links, which always open in a new tab',
        '',
        '## What does not',
        '',
        '- **Tables** do not render: the pipes and dashes show as typed. Use a short list with the key word of each item in bold, or an image.',
        '- Strikethrough and task-list checkboxes do not render either.',
        '- HTML is removed.',
        '',
        'For a picture, use an **Image** block rather than Markdown image syntax: it requires alt text, can be uploaded, and has layout options. A Text block holds up to 20,000 characters, far more than one idea needs.',
      ),
      check(
        'Kavya wants to show which commit prefixes her team uses, and what each means. Which way will render well?',
        [
          'A Markdown table with two columns',
          'A bulleted list: each prefix in bold, then what it means',
          'An HTML table pasted into the Text block',
        ],
        'Tables and HTML do not render in Text blocks. A list with a bold lead word reads just as clearly.',
        1,
      ),
    ]),
    lesson('callouts-and-code', 'Callouts and code', 3, [
      md(
        '## Callouts',
        '',
        'A **Callout** is a coloured box with a **Tone** (**Note**, **Tip** or **Warning**), an optional title and Markdown text. With no title, it is headed by its tone.',
        '',
        'Use one for the thing a reader must not miss. Three callouts on one page shout over each other, and the reader stops noticing them.',
        '',
        '**Weak**: a warning that says nothing',
        '',
        '> **Warning**: Be careful with commits.',
        '',
        '**Better**: what can go wrong, and what to do',
        '',
        '> **Rewriting history**: `git commit --amend` changes a commit. Never amend one you have already pushed to a shared branch.',
        '',
        '## Code',
        '',
        'A **Code** block has a **Language** (JavaScript, TypeScript, Bash, Python, SQL and others, or plain text), an optional **File name**, and two switches: **Copy button** and **Terminal style**. **Highlight lines** draws the eye to a few lines, written like `2,4-6`. This one has a file name and line 3 highlighted:',
      ),
      {
        type: 'code',
        lang: 'bash',
        file: 'fix-the-menu.sh',
        code: lines(
          'git add menu.md',
          'git commit -m "Fix the price of ginger chai on the menu"',
          'git push',
        ),
        copy: true,
        terminal: false,
        highlight: '3',
      },
      md(
        'Turn on **Terminal style** with the copy button for commands to run. Terminal style without the copy button suits output a learner should read, not paste.',
      ),
      check(
        'Kavya shows what `git log` prints so learners can recognise it. How should she set the Code block?',
        [
          'Terminal style on, Copy button off',
          'Terminal style off, Copy button on',
          'A Callout instead, so it stands out',
        ],
        'Output is for reading, not pasting. Terminal style without a copy button shows it as output.',
      ),
    ]),
    lesson('image-blocks', 'Images: upload or link', 4, [
      md(
        '## Two ways in',
        '',
        'An **Image** block has two tabs: **Upload** and **Link**.',
        '',
        '**Upload** takes a **WebP, PNG or JPEG**, chosen, dropped or pasted. The default limit is **500 KB** (an Admin may set it anywhere up to 1 MB), and the long side can be at most **2000 px**; **1600 px wide is ideal**. Studio checks the file before it uploads: the type, the size and the pixels.',
        '',
        'If the image is too big, Studio says why and offers **Shrink it for me**. That redraws the picture as WebP inside your browser, nothing is sent anywhere, and location and camera details are stripped. Nothing is shrunk unless you ask. A narrow image (under 800 px) gets a warning: choose the Small or Medium layout for it.',
        '',
        "**Link** takes an **Image address** starting with `https://`. **Choose from this course's media** reuses an image already uploaded to this course, without uploading it again.",
      ),
      warn(
        'No personal data',
        'Never upload names, email addresses or faces of people who have not agreed, client names, or secrets such as tokens and keys. Crop or blur them out first.',
      ),
      md(
        '## Alt text, caption and layout',
        '',
        '**Alt text (required)** describes the picture for anyone who cannot see it. Say what it means, not "image of".',
        '',
        '**Weak**',
        '',
        '> image1.png',
        '',
        '**Better**',
        '',
        '> A Git log where every commit says "fix stuff", so you cannot tell which one changed the menu',
        '',
        'Then: an optional **Caption**; **Layout** (**Column**, **Medium** or **Small**); **Open full size**, so a click shows the image at its natural size; and **Border**, a thin frame you can turn off for photos. The preview shows the image at **1280 px** and **390 px**, so you can check it on a phone-sized screen too.',
      ),
      check(
        "Kavya's diagram is a 2400 px wide, 700 KB PNG. What is the quickest way to get it into her lesson?",
        [
          'Choose Shrink it for me when Studio refuses it, then upload the smaller WebP',
          'Rename the file to .jpg and upload it again',
          'Put it in a File block instead',
        ],
        'Shrink it for me redraws the image under the limits in her browser. Renaming does not help: Studio checks what the file really is.',
      ),
    ]),
    lesson('video-blocks', 'Videos, and making learners watch them', 4, [
      md(
        '## Adding a video',
        '',
        'Gurukul does not host videos; a **Video** block points at one. Pick the **Video host** (**YouTube**, **Google Drive** or **Loom**) and paste the **Video link**, starting with `https://`. YouTube accepts `youtu.be/…`, `youtube.com/watch?v=…` and `youtube.com/embed/…` links; Loom takes a share link; Drive takes a file link. Studio shows the video when it recognises the link. If it does not, learners get a plain link to open in a new tab, and the course will not publish until the link is fixed.',
        '',
        'Add a **Title** and a **Caption** if they help. The **Captions are available** switch and **Length in seconds** are stored, but learners do not see them.',
        '',
        '## Making learners watch',
        '',
        'Two settings hold the lesson until the video is watched:',
        '',
        "- this lesson's **Completion rule** set to **After 90% of the video**, or",
        "- the course's **Require watching videos**, which applies to every lesson with a video.",
        '',
        'For YouTube and Loom, Gurukul counts only the seconds actually played. Skipping ahead does not count; watching at double speed does. Rohan sees "Watched N% · 90% needed to finish the lesson" under the video.',
        '',
        'Drive videos cannot be tracked. Neither can a link that will not embed, or a player that does not respond. Then the learner gets an **I have watched the video** switch instead, so they are trusted to tick it.',
      ),
      md(
        '## Put the video in context',
        '',
        '**Weak**: a video and nothing else, titled "Video".',
        '',
        '**Better**: a sentence saying what to watch for ("Notice how the reviewer finds the bug from the commit message alone"), the video, and a check that asks about exactly that.',
      ),
      check(
        "Kavya's course has Require watching videos on, and one lesson uses a Google Drive video. What does Rohan get in that lesson?",
        [
          'An "I have watched the video" switch, because Drive playback cannot be tracked',
          'A lesson he can never complete',
          'Nothing extra: Drive videos count as watched straight away',
        ],
        'Gurukul tracks YouTube and Loom. For Drive it falls back to the learner saying they watched it.',
      ),
    ]),
    lesson('files-and-embeds', 'Files, PDFs and embeds', 3, [
      md(
        '## File',
        '',
        'A **File** block is a link to a handout or cheat sheet, with the same two tabs as images.',
        '',
        '- **Upload** takes a **PDF only**, up to **1 MB** by default. There is no shrinking for PDFs. For a bigger file, put it on GitHub or Google Drive and use **Link**.',
        '- **Link** takes a **File address** starting with `https://`.',
        '- **Label** is the words on the link, and is required. An uploaded PDF starts with its file name; change it to something a reader understands.',
        '',
        '**Weak**: `final_v3_NEW.pdf`. **Better**: "Commit message cheat sheet (one page)".',
        '',
        '## Embed',
        '',
        'An **Embed** block shows a page from another site inside the lesson. Only **YouTube, Loom, Google Drive, CodeSandbox and StackBlitz** are allowed, and Studio tells you if a host is not on the list. CodeSandbox and StackBlitz are handy for a small runnable example. Give it a **Title**: screen readers read it out.',
        '',
        'For a video you want tracked, use a **Video** block, not an Embed.',
      ),
      check(
        'Kavya has a 4 MB PDF style guide. How should she add it?',
        [
          'Upload it to a File block anyway; Studio will compress it',
          "Put it on Google Drive or GitHub and add it with the File block's Link tab",
          'Split it into four Image blocks',
        ],
        'Uploaded PDFs are capped at 1 MB and are not shrunk. Larger files belong on Drive or GitHub, linked.',
        1,
      ),
    ]),
    lesson('inline-checks', 'Inline checks', 3, [
      md(
        '## One quick question',
        '',
        'A **Check** is a single question in the lesson, like the one at the end of this page. It is **not graded** and counts towards no score. It tells the reader whether the idea landed, and it costs them ten seconds.',
        '',
        'Fill in the **Question**, two to six **Answers**, mark which one is right, and write the **Explanation**, which is required. A wrong pick shows "Not quite. Try another answer." and the learner tries again; the right pick shows your explanation.',
        '',
        'Remember: every Check in a lesson must be answered before the lesson can be completed.',
        '',
        '## Ask about the idea, not the wording',
        '',
        '**Weak**',
        '',
        '> How many characters did this lesson say a subject line should have?',
        '',
        '**Better**',
        '',
        '> Rohan\'s subject line is "Updated some files in the menu folder and fixed a few small things". What is the main problem?',
        '',
        'The better one asks the reader to use the idea on something new, so getting it right means they understood it.',
      ),
      check(
        'Which explanation helps most after a reader picks the right answer?',
        [
          'Correct!',
          "One sentence on why that answer is right, tied back to the lesson's idea",
          'A link to the Git documentation',
        ],
        'The explanation is where the learning happens. "Correct!" says nothing the green tick did not.',
        1,
      ),
    ]),
    quiz('quiz-blocks', 'Quiz: Lessons and blocks', blocksSpecs, 'onPass', 10),
  ],
};

// ---------------------------------------------------------------------------------------------
// Chapter 5 · Writing fair Quizzes
// ---------------------------------------------------------------------------------------------

const chapter5: Chapter = {
  id: 'writing-fair-quizzes',
  title: 'Writing fair Quizzes',
  items: [
    lesson('quiz-builder', 'The Quiz builder', 3, [
      md(
        '## Questions',
        '',
        'Open a Quiz from the Structure tab and you are in the Quiz builder. **Add** adds a question. For each one, choose the **Question type**:',
        '',
        '- **Single choice**: one right answer.',
        '- **Multiple choice**: several right answers; learners tick every one.',
        '- **True or false**: a statement to judge.',
        '- **What does this code print?**: a short piece of code and its output.',
        '',
        'Then write the **Question (Markdown)**, optional code, and two to six answers, marking the right one (or ones). Every question needs an **Explanation**, shown to learners after they answer.',
        '',
        '## Send them back to the lesson',
        '',
        '**Revisit link** names the lesson a learner is sent back to when they get the question wrong. Set it on every question: someone who misses it should know exactly where to look.',
        '',
        'Drag questions to reorder them. **Try it as a learner** saves and opens the Quiz in the preview.',
      ),
      note(
        'The answers stay on the server',
        "While you edit, the right answers are kept with your draft. When you publish, Gurukul stores them apart from the course and marks every attempt on its server, so they never reach a learner's browser.",
      ),
      check(
        'Rohan gets a question about subject lines wrong. What lets Gurukul point him at the right lesson?',
        [
          "The question's Revisit link, set to that lesson",
          'The question being in the same chapter as the lesson',
          'The lesson title appearing in the question text',
        ],
        'The Revisit link is set per question. Without it, a learner who misses the question is left guessing where to reread.',
      ),
    ]),
    lesson('fair-questions', 'Writing a fair question', 4, [
      md(
        '## A Quiz is not a trap',
        '',
        'A Quiz answers one question: can this person do what the course promised? So each question tests one outcome, using something the course taught, ideally by putting it to work in a small situation.',
        '',
        '**Weak**: recall, with a joke option and "all of the above"',
        '',
        '> What is the maximum length of a subject line?',
        '> A. 50 characters · B. 72 characters · C. Banana · D. All of the above',
        '',
        'Nobody picks Banana, and "all of the above" cannot be true here, so it is really a choice of two. And it checks memory, not skill.',
        '',
        '**Better**: a situation, with mistakes real people make',
        '',
        '> Rohan is about to commit a fix for the wrong price of ginger chai. Which subject line should he write?',
        '> A. Fix the price of ginger chai on the menu',
        '> B. fix stuff',
        '> C. Fixed it',
        '> D. Changes to menu.md',
        '',
        '## Four habits',
        '',
        '- **Plausible wrong answers**: each one a mistake someone might really make.',
        '- **No trick wording**: no double negatives, no "which is not untrue".',
        '- **Only what was taught**: a question on something the course skipped tests luck.',
        '- **An explanation that teaches**: say why the right answer is right in a sentence or two. People learn most from the questions they get wrong.',
      ),
      check(
        'Kavya\'s draft question has the options "Fix the login timeout", "fix stuff", "asdfgh" and "None of these". What should she change first?',
        [
          'Nothing; four options is right',
          'Replace "asdfgh" and "None of these" with mistakes a real person might make',
          'Make it a True or false question',
        ],
        'A throwaway option shrinks the real choice. Wrong answers should be tempting for the right reasons.',
        1,
      ),
    ]),
    lesson('quiz-settings', 'Quiz settings', 4, [
      md(
        '## The settings card',
        '',
        '- **Quiz title**.',
        "- **Pass mark (%)**: leave it empty to use the course's pass mark.",
        '- **Questions shown**: how many questions each attempt draws, at random, from the ones you wrote. **A new Quiz starts at 1**, so after writing eight questions, raise it, or learners see only one.',
        '- **Cooldown between attempts (minutes)**: how long a learner waits before trying again. Ten minutes nudges people to reread instead of guessing. Retakes are allowed and the best score counts.',
        '- **Shuffle answer order**: mixes the answers for each attempt.',
        '- **Reveal answers**: **After each question** (learners can check each one as they go), **Only after passing**, or **Never**.',
        '',
        '## The lock switch',
        '',
        '**Learners must pass to open the next chapter** sounds bigger than it is. What it does: while the Quiz is not passed, the items **after it in the same chapter** stay locked. If the Quiz is the last item in its chapter, it locks nothing by itself.',
        '',
        'What holds the next chapter shut is the course rule **Learners go in order**: a chapter with a Quiz counts as passed only once its Quizzes are passed. So to gate the next chapter on a Quiz, put the Quiz in the chapter and keep **Learners go in order** on.',
      ),
      check(
        'Kavya writes eight questions in a new Quiz and changes no settings. How many does Rohan see per attempt?',
        ['All eight, in order', 'One, drawn at random', 'Five, the usual number'],
        'A new Quiz shows one question until Questions shown is raised. It always draws at random from the ones written.',
        1,
      ),
    ]),
    lesson('question-bank', 'The Question bank and quality hints', 3, [
      md(
        '## Write once, reuse',
        '',
        'The **Question bank** keeps questions you can add to any Quiz. In a Quiz, **Save to question bank** copies the current question there, with its **Tags for the question bank** (such as `git, commits`). **Import from question bank** searches by text or tag and adds a copy with **Add to this Quiz**. The copy has no Revisit link, so set one for this course.',
        '',
        'The **Question bank** page has **New question** and **Import from a Quiz**, and shows where each question is used. Only the person who saved a bank question, or an Admin, can edit or delete it. Deleting it from the bank leaves Quizzes that use a copy untouched.',
        '',
        '## Quality hints',
        '',
        'Once learners take the Quiz, each question shows its first-try score, such as **62% first try**. A question fewer than half get right first time (after at least three tries) is marked **Low first-try score**, and its editor says **Learners find this hard**.',
        '',
        'That is rarely careless learners. Usually the question is unclear, or the lesson it points to does not quite teach it. Reread both and fix the weaker one.',
      ),
      check(
        'Kavya imports a question from the bank into her Quiz. What must she set again for it?',
        [
          'Its Revisit link, because the copy arrives without one',
          'Its right answer, because the bank does not keep answers',
          'Its explanation, because the bank drops it',
        ],
        'The copy keeps its text, answers and explanation, but the lesson to revisit belongs to each course.',
      ),
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Chapter 6 · Saving, previewing and publishing
// ---------------------------------------------------------------------------------------------

const chapter6: Chapter = {
  id: 'saving-and-publishing',
  title: 'Saving, previewing and publishing',
  items: [
    lesson('save-and-preview', 'Saving and previewing', 3, [
      md(
        '## Your draft saves itself',
        '',
        "About a second after you stop typing, the draft saves. The top of the page says where it stands: **Draft v3 · saving…**, **Draft v3 · unsaved changes**, or **Draft v3 · saved just now**. **Save now** is there if you are in a hurry. If a save fails, it says **Couldn't save — retry**; edits that could not be saved are kept on your computer and offered back next time with **Restore edits**.",
        '',
        '## Two people, one draft',
        '',
        'If another Educator saves the same course while you are editing, Studio stops and says someone else saved it, with a **Reload** button. Your edits since your last save are lost; nothing is merged. Agree who is editing which lesson before you both start.',
        '',
        '## Preview as learner',
        '',
        '**Preview as learner** opens your draft the way Rohan would see it. Nothing you do there is recorded. Read every lesson once in the preview: typos and broken lists are easier to spot there than in the editor.',
        '',
        'The preview is not the whole experience. Video watching and the Mark complete conditions are not enforced there, and a Quiz preview walks through every question in order, without the random draw, shuffle or cooldown.',
      ),
      check(
        'Kavya and her teammate both edit the same course. Her teammate saves first. What happens to Kavya?',
        [
          'Studio asks her to reload, and her edits since her last save are lost',
          'Studio merges both sets of edits',
          "Her save wins and overwrites her teammate's",
        ],
        'Drafts are never merged. The second person to save must reload, so agree who edits what.',
      ),
    ]),
    lesson('publishing', 'Publishing, and who can open it', 4, [
      md(
        '## Publish',
        '',
        'The **Publish** button names the version you are about to make, such as **Publish v4**. It saves first, then opens a dialog with three parts.',
        '',
        '**What changes for learners** lists lessons and Quizzes added, edited or removed since the last version, with how many learners completed anything removed.',
        '',
        '**Who can open this course** sets visibility:',
        '',
        '- **Public**: every signed-in learner sees it in the catalogue.',
        '- **Team only**: only people on the teams you pick.',
        '- **Educators and Admins**: learners do not see it. Useful while you try a course out.',
        '',
        '**Fix these first** lists anything that blocks publishing, each with a link that opens the lesson or Quiz to fix. The usual ones: an empty summary or block, an image with no alt text, a video or embed link Gurukul does not support, a Quiz question with no right answer marked or no explanation, a certificate with no Quiz. While anything is listed, the button stays off.',
        '',
        'When it works: "Published v4. Learners see it now."',
      ),
      tip(
        'Starter blocks fail on purpose',
        'A new Video block starts with a bare `https://www.youtube.com/` link, and a new Image or File block starts with no alt text or label. Each blocks publishing until you replace it, so nothing half-made goes live.',
      ),
      check(
        'Kavya wants to try her course on two teammates before everyone sees it. Which visibility fits?',
        [
          'Public, and ask everyone else to ignore it',
          'Team only, with a team of those two teammates',
          'Leave it unpublished and send them the draft',
        ],
        'Team only limits the course to the teams picked. Drafts are never shown to learners.',
        1,
      ),
    ]),
    lesson('versions', 'Versions and roll back', 2, [
      md(
        '## Every publish is kept',
        '',
        'The **Versions** tab lists every published version, with **Live** beside the current one. **Roll back** publishes an older version again, as a new version. If v4 broke something and v3 was fine, rolling back to v3 makes v5, identical to v3, live straight away.',
        '',
        'Rolling back also resets your draft to that version, so **unpublished edits are replaced**. Studio warns you first. Learners keep their progress, matched by lesson id.',
        '',
        'Retiring a course is not yours to do: only an Admin can archive one.',
      ),
      check(
        'Kavya has an hour of unpublished edits in her draft when she rolls back to v3. What happens to those edits?',
        [
          'They are replaced by v3, so she should copy anything she wants to keep first',
          'They are kept and published along with v3',
          'They move into a separate draft',
        ],
        'Roll back resets the draft to the chosen version. Studio warns that unpublished edits are replaced.',
      ),
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Chapter 7 · After you publish
// ---------------------------------------------------------------------------------------------

const finalSpecs: QuestionSpec[] = [
  {
    id: 'q1',
    kind: 'single',
    prompt:
      'Kavya adds a lesson to her published course. Studio says "Draft v9 · saved just now". What does Rohan see when he opens the course?',
    options: [
      'The last published version, without the new lesson',
      'The new lesson, because the draft has saved',
      'The new lesson, marked as a draft',
      'Nothing: the course is closed while it is edited',
    ],
    correct: [0],
    explanation:
      'A saved draft is not a published course. Learners see the last published version until Kavya publishes again.',
    review: 'publishing',
  },
  {
    id: 'q2',
    kind: 'multiple',
    prompt:
      "Kavya reviews a colleague's Quiz question. Which changes make it fairer? Choose all that apply.",
    options: [
      'Replace the joke option with a mistake a real person might make',
      'Add "All of the above" as a last option',
      'Add an explanation of why the right answer is right',
      'Reword it as a double negative, so learners read carefully',
    ],
    correct: [0, 2],
    explanation:
      'Plausible wrong answers and a clear explanation make a question fair and useful. Catch-all options and trick wording test something other than the course.',
    review: 'fair-questions',
  },
  {
    id: 'q3',
    kind: 'trueFalse',
    prompt:
      'A course has "Learners go in order" off. A Quiz in the middle of chapter 2 has "Learners must pass to open the next chapter" on. Rohan can still open chapter 3 before passing that Quiz.',
    options: ['True', 'False'],
    correct: [0],
    explanation:
      'The Quiz switch locks only the items after it in its own chapter. Locking the next chapter comes from "Learners go in order".',
    review: 'quiz-settings',
  },
  {
    id: 'q4',
    kind: 'single',
    prompt:
      'Rohan says a lesson in Kavya\'s course is "a wall of rules I could not get through". What change is most likely to help?',
    options: [
      'Split it to one idea, and open with an example before stating the rule',
      'Add more rules so nothing is missing',
      'Put every rule in a Warning callout',
      'Raise its estimated minutes',
    ],
    correct: [0],
    explanation:
      'One idea per lesson, shown with an example first, is what gets read and remembered.',
    review: 'one-idea-per-lesson',
  },
  {
    id: 'q5',
    kind: 'single',
    prompt:
      'The publish dialog lists "An image needs alt text for people who cannot see it." and Publish is off. What is the quickest fix?',
    options: [
      'Follow the link beside the problem, write alt text describing the image, then publish',
      'Switch the image to the Link tab',
      'Turn off Issue a certificate',
      'Publish as Educators and Admins, which skips the check',
    ],
    correct: [0],
    explanation:
      'Each problem links to where it is. Alt text is required for every image, whatever the visibility.',
    review: 'image-blocks',
  },
  {
    id: 'q6',
    kind: 'single',
    prompt:
      'Kavya published v4 with a broken lesson; v3 was fine. Her draft also holds some unfinished edits. What is the safest next step?',
    options: [
      'Note the edits she wants to keep, then roll back to v3, which goes live as v5',
      'Delete the course and create it again',
      'Ask every learner to skip the broken lesson',
      'Roll back to v3; her unfinished edits will be published with it',
    ],
    correct: [0],
    explanation:
      'Roll back republishes v3 as a new version and resets the draft, so unpublished edits are replaced.',
    review: 'versions',
  },
  {
    id: 'q7',
    kind: 'single',
    prompt: 'One of Kavya\'s Quiz questions shows "Low first-try score". What should she do first?',
    options: [
      'Reread the question and the lesson it points to, and fix whichever is unclear',
      'Delete the question so the average goes up',
      'Lower the pass mark of the Quiz',
      'Lengthen the cooldown so learners study longer',
    ],
    correct: [0],
    explanation:
      'A question most people miss first time usually means the question is unclear or the lesson does not teach it well. Fix the cause.',
    review: 'question-bank',
  },
  {
    id: 'q8',
    kind: 'multiple',
    prompt:
      'Kavya creates "Commit messages, advanced" with Duplicate from set to her first course. Which of these are true? Choose all that apply.',
    options: [
      "Unpublished edits in the first course's draft come with the copy",
      'The Quiz answers come with the copy',
      "The copy keeps the first course's address",
      'Learners who finished the first course start the copy as finished',
    ],
    correct: [0, 1],
    explanation:
      "A copy takes the whole draft, answers included, under its own new address. Nobody's progress carries over.",
    review: 'new-course',
  },
  {
    id: 'q9',
    kind: 'single',
    prompt:
      'Kavya wants Rohan to watch a YouTube video properly before completing a lesson, and the course has "Require watching videos" off. What should she do?',
    options: [
      "Set that lesson's Completion rule to After 90% of the video",
      'Tick Captions are available',
      'Enter the video length in seconds',
      'Put the video in an Embed block',
    ],
    correct: [0],
    explanation:
      'The lesson rule tracks how much of the video was really played. Captions and length are not used for that, and an Embed is not tracked.',
    review: 'video-blocks',
  },
  {
    id: 'q10',
    kind: 'single',
    prompt:
      'Kavya wants to add a new joiner to the team "Platform", which her colleague Neha created. Kavya is an Educator, not an Admin. What can she do?',
    options: [
      'Ask Neha or an Admin, because Educators edit only teams they created',
      'Edit the team herself, because every Educator edits every team',
      'Delete the team and create it again with the new joiner',
      'Add the new joiner as an Educator of her course instead',
    ],
    correct: [0],
    explanation: 'An Educator edits only the teams they created, and only an Admin deletes a team.',
    review: 'media-and-teams',
  },
];

const chapter7: Chapter = {
  id: 'after-you-publish',
  title: 'After you publish',
  items: [
    lesson('reading-analytics', 'Reading your Analytics', 3, [
      md(
        '## Is it working?',
        '',
        'A month after publishing, Kavya opens the **Analytics** tab. Four numbers sit at the top:',
        '',
        '- **Assigned**: people an Admin assigned the course to.',
        '- **Started** and **Completed**: people who began it, and people who finished.',
        '- **Certified**: people who earned the certificate.',
        '',
        "Below is a table of the learners who started, with each one's progress and when they were last active. Before the first publish, the tab just says it is not published yet.",
        '',
        'Pair it with the first-try scores in the Quiz builder. Numbers tell you **where** to look. To find out **why**, ask a few people who took the course.',
      ),
      check(
        "Kavya's Analytics show 40 Started and 12 Completed. What is a sensible next step?",
        [
          'Ask a few people who started but did not finish where they stopped, and why',
          'Lower the pass mark to 30% so more people finish',
          'Switch visibility to Educators and Admins until the numbers improve',
        ],
        'The numbers show that people stop, not why. A few short conversations usually point at the lesson or question that needs work.',
      ),
    ]),
    lesson('media-and-teams', 'The Media library and Teams', 3, [
      md(
        '## Media library',
        '',
        'The **Media library** lists every video, image, PDF and embed your courses use, and which lessons use them. Search by name, link or course, or pick **Uploaded** to see only files uploaded to Gurukul. Open one to see where it is used, or **Copy link** to reuse it.',
        '',
        'You add media in a lesson, not here: the library cannot upload, rename or delete. An uploaded file that no version of any course uses any more is cleaned up after about 30 days.',
        '',
        '## Teams',
        '',
        'A team is a name and a list of people, used for **Team only** courses and by Admins to assign a course to a whole group. On the **Teams** page, **Create team** asks for a **Team name** and **Members**: search by name, or paste emails. People who have not signed in yet are marked invited and join the moment they do.',
        '',
        'An Educator can edit only the teams they created. Only an Admin can delete a team, because deleting one shuts its members out of the courses only that team can open.',
      ),
      check(
        'Kavya wants to remove an image she uploaded and no longer uses. What happens?',
        [
          'She removes it from the lesson; once nothing uses it, Gurukul cleans it up after about 30 days',
          'She deletes it from the Media library',
          'She asks an Admin to delete it from the Media library',
        ],
        'The Media library only lists files. Unused uploads are cleaned up on their own.',
      ),
    ]),
    lesson('shortcuts-and-tips', 'Shortcuts and tips', 2, [
      md(
        '## Keys worth knowing',
        '',
        '- **?** shows the list of shortcuts, anywhere.',
        '- **Ctrl K** (or **⌘K** on a Mac) searches every page you can open.',
        '- In the lesson editor, **/** jumps to **Add a block**.',
        '- Reordering rows: Space or Enter lifts, the arrows move, Space or Enter drops, Escape cancels.',
        '- When you take a course: **J** and **K** go to the next and previous item; in a Quiz, **1–4** or **A–D** pick an answer and Enter moves on. Try your own course with the keyboard.',
        '',
        '## Feature tips',
        '',
        'Gurukul marks a few easy-to-miss features with a small dot. In the lesson editor, one points at uploading an image: drop, paste or choose it, and Gurukul checks it before uploading. You can turn tips off, or back on, on your Profile.',
        '',
        '## That is Studio',
        '',
        'You have followed Kavya from an idea to a published course: outcomes first, one idea per lesson, the right blocks, fair Quizzes, a careful publish, and a course that keeps getting better. One Quiz to go, and Studio is yours.',
      ),
      check(
        'Kavya is in the lesson editor with her cursor outside any text field. Which key takes her straight to the block palette?',
        ['/', '?', 'J'],
        '/ jumps to Add a block. ? lists the shortcuts, and J moves to the next item when taking a course.',
      ),
    ]),
    quiz('quiz-final', 'Final Quiz: Becoming a Gurukul Educator', finalSpecs, 'onPass', 10),
  ],
};

// ---------------------------------------------------------------------------------------------

const chapters: Chapter[] = [chapter1, chapter2, chapter3, chapter4, chapter5, chapter6, chapter7];

const estimatedMinutes = chapters
  .flatMap((p) => p.items)
  .reduce((sum, item) => sum + (item.type === 'lesson' ? item.minutes : 0), 0);

export const educatorCourse: Course = {
  schemaVersion: 3,
  id: 'educator-onboarding',
  title: 'Becoming a Gurukul Educator',
  summary:
    'An Admin assigns you this course. Finish every lesson and pass the Final Quiz to become an Educator who builds courses in Studio, and earn a certificate.',
  description: lines(
    'An Admin assigns this course to people who will build courses. Finishing it makes you an Educator on Gurukul: complete every lesson and pass the Final Quiz, and Studio opens to you. You can then create courses, write lessons and Quizzes, and publish them for your colleagues. You also earn the Gurukul Educator certificate.',
    '',
    'It covers all of Studio: creating or copying a course, its details and learning rules, chapters and lessons, every kind of block (text, callouts, code, images, videos, files, embeds and checks), the Quiz builder and Question bank, saving, previewing, publishing and rolling back, Analytics, the Media library and Teams. Along the way you see weak and better examples of each.',
    '',
    'It takes a little over an hour, in short lessons. You will follow Kavya, a developer, as she builds a course called "Writing good commit messages" for her colleague Rohan and everyone after him. Each lesson ends with a quick question to check the idea landed. You read it here; Studio itself opens on a laptop or desktop once you are an Educator.',
  ),
  level: 'foundation',
  cover: { theme: 'sky', glyph: 'Edu' },
  outcomes: [
    'Plan a course from outcomes, in chapters of short, one-idea lessons',
    'Create or copy a course in Studio and set its details, landing page and learning rules',
    'Build lessons with the right blocks: text, callouts, code, images, videos, files, embeds and checks',
    'Make learners watch a video before moving on, and know exactly when a lesson counts as done',
    'Write fair Quiz questions and choose sensible Quiz settings',
    'Preview, publish to the right people, roll back, and improve a course from its Analytics',
  ],
  educatorIds: [],
  educatorNames: {},
  status: 'published',
  version: 1,
  publishedAt: null,
  rules: { sequential: true, passMark: 0.7, certificate: true, requireVideoWatch: false },
  certificate: { title: 'Gurukul Educator' },
  chapters,
  estimatedMinutes,
};

/** Answer keys, as option ids, for both Quizzes. Seeded to `courses/{id}/private/answers`. */
export const educatorAnswers: AnswerKeys = {
  'quiz-blocks': keysOf(blocksSpecs),
  'quiz-final': keysOf(finalSpecs),
};
