import type { Block, Course, Lesson, Quiz, Chapter } from '@gurukul/schema';
import type { AnswerKeys } from './seed';

/*
 * The first course, "Git, the NonStop Way", as authored in .plan/14-first-course-git.md.
 *
 * - One story runs through it: Meera, a new joiner, looks after `chai-corner`, a one-file project
 *   (`menu.md`, the office tea counter's menu), with her teammates Arjun and Ravi (her lead).
 * - Diagrams are SVG files in apps/web/public/courses/git/, served by Hosting. Image blocks need
 *   an absolute URL: `gitCourse` points at the live site, `gitCourseAt(site)` at any other.
 * - Videos are NOT recorded yet: every video block points at a placeholder URL, which the player
 *   shows as "Video coming soon". The text around each video carries the lesson on its own.
 * - Content the plan lists as "to supply" (branch naming, PR template, review expectations,
 *   release tagging) is written as generic defaults and flagged with a callout titled
 *   "Replace with NonStop's convention".
 * - `publishedAt` is null here; the seeder stamps it. Answer keys live in `gitAnswers`, never in
 *   the course object.
 */

type Draft = Block extends infer B ? (B extends unknown ? Omit<B, 'id'> : never) : never;

/** Where the diagrams are served from, unless the seed is told otherwise (`gitCourseAt`). */
export const DEFAULT_SITE = 'https://nonstop-gurukul.web.app';

const lines = (...l: string[]) => l.join('\n');

const md = (...l: string[]): Draft => ({ type: 'markdown', md: lines(...l) });
const sh = (...l: string[]): Draft => ({
  type: 'code',
  lang: 'bash',
  code: lines(...l),
  copy: true,
  terminal: true,
});
/** What Git prints back: shown in a terminal frame, not offered for copying. */
const out = (...l: string[]): Draft => ({
  type: 'code',
  lang: 'text',
  code: lines(...l),
  copy: false,
  terminal: true,
});
const file = (name: string, lang: string, ...l: string[]): Draft => ({
  type: 'code',
  lang,
  file: name,
  code: lines(...l),
  copy: true,
  terminal: false,
});
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
const replace = (...l: string[]): Draft => warn("Replace with NonStop's convention", ...l);
const img = (name: string, alt: string, caption: string): Draft => ({
  type: 'image',
  url: `${DEFAULT_SITE}/courses/git/${name}.svg`,
  alt,
  caption,
});
/** `correct` is the index of the right option; most checks list it first. */
const check = (prompt: string, options: string[], explanation: string, correct = 0): Draft => ({
  type: 'check',
  prompt,
  options,
  correct,
  explanation,
});
const video = (durationSec: number): Draft => ({
  type: 'video',
  provider: 'youtube',
  url: 'https://www.youtube.com/watch?v=TODO_RECORD_VIDEO',
  captions: true,
  durationSec,
});

const KINDS = {
  video: { layout: 'split', completeWhen: 'video90', kindLabel: 'Video' },
  read: { layout: 'article', completeWhen: 'scrolled', kindLabel: 'Reading' },
  hands: { layout: 'stacked', completeWhen: 'manual', kindLabel: 'Hands-on' },
} as const;

const lesson = (
  id: string,
  title: string,
  minutes: number,
  kind: keyof typeof KINDS,
  drafts: Draft[],
): Lesson => ({
  type: 'lesson',
  id,
  title,
  minutes,
  ...KINDS[kind],
  blocks: drafts.map((d, i) => ({ ...d, id: `${id}-${i + 1}` }) as Block),
});

interface QuestionSpec {
  id: string;
  kind: 'single' | 'multiple' | 'trueFalse' | 'codeOutput';
  prompt: string;
  code?: string;
  options: string[];
  /** Zero-based positions of the correct options; option ids are 'a', 'b', 'c', 'd'. */
  correct: number[];
  explanation: string;
  review: string;
}

const OPTION_IDS = ['a', 'b', 'c', 'd'];

const questionsOf = (specs: QuestionSpec[]) =>
  specs.map((s) => ({
    id: s.id,
    kind: s.kind,
    prompt: s.prompt,
    ...(s.code === undefined ? {} : { code: s.code }),
    options: s.options.map((text, i) => ({ id: OPTION_IDS[i] as string, text })),
    explanation: s.explanation,
    reviewItemId: s.review,
  }));

const keysOf = (specs: QuestionSpec[]): Record<string, string[]> =>
  Object.fromEntries(specs.map((s) => [s.id, s.correct.map((i) => OPTION_IDS[i] as string)]));

const TRUE_FALSE = ['True', 'False'];

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
  questions: questionsOf(specs),
});

// ---------------------------------------------------------------------------------------------
// Chapter 1 · Why version control
// ---------------------------------------------------------------------------------------------

const chapter1: Chapter = {
  id: 'why-version-control',
  title: 'Why version control',
  items: [
    lesson('what-git-solves', 'What Git solves', 7, 'video', [
      md(
        "## Meera's first task",
        '',
        "It is Meera's first week at NonStop. Her lead, Ravi, gives her a small job: update the menu for the office tea counter. The menu is a text file. She opens the shared folder and finds this:",
      ),
      img(
        'save-points',
        'On the left, four copies of the menu file named menu, menu_final, menu_final_v2 and menu_REALLY_final, with the question "Which one is right?". On the right, a single menu file with a line of four save points: Add the menu, Add prices, Fix a typo, Add cold drinks.',
        'Left: how files usually pile up. Right: one file, with every saved version kept in order.',
      ),
      md(
        'Four copies, and nobody remembers which one is current. Who changed the price of masala chai? Why? Was it on purpose?',
        '',
        'This is the problem Git solves.',
      ),
      video(420),
      md(
        '## Git is a save button with a memory',
        '',
        'Think of a video game. Before a hard level you save, so that if things go wrong you can go back. Git gives your project the same thing. Each save is called a **commit**. A commit remembers:',
        '',
        '- what every file looked like at that moment',
        '- who saved it, and when',
        '- a short note saying why',
        '',
        'You keep **one** copy of each file. Git keeps all the old versions for you, out of sight, in order.',
        '',
        '## What you get',
        '',
        '- **Go back in time.** Made a mess? Return to any earlier save.',
        '- **Know what happened.** See who changed a line, when, and why.',
        '- **Work together.** Ten people can change the same project at once, and Git helps put their work together.',
      ),
      note(
        'Git and GitHub are not the same thing',
        "**Git** is a tool on your laptop that keeps the history. **GitHub** is a website where the team keeps a shared copy, so everyone's work can meet in one place. You can use Git without GitHub, but teams use both. Chapter 4 brings GitHub in.",
      ),
      check(
        'Which of these does Git give you?',
        [
          'Every saved version of the project, with who changed what and why',
          'An automatic backup of your laptop to the cloud',
          'A guarantee that two people will never edit the same line',
        ],
        'Git keeps the full history on your own machine. It is not a backup service, and people can still edit the same line. When they do, Git helps you sort it out (you will see how in chapter 3).',
      ),
    ]),
    lesson('install-and-configure-git', 'Install and configure Git', 10, 'read', [
      md(
        'Before Meera can save anything, Git needs to know who she is. It is like signing the register at the office gate: every commit she makes will carry her name.',
        '',
        '## Open a terminal',
        '',
        'All the commands in this course are typed into a **terminal**, a window where you type instructions instead of clicking. On a Mac, open the **Terminal** app. On Windows, install Git first (below), then open **Git Bash**, which comes with it. Type a command, press Enter, and read what comes back.',
        '',
        '## Is Git installed?',
      ),
      sh('git --version'),
      out('git version 2.47.0'),
      md(
        'Any recent version is fine. If Git is missing:',
        '',
        '- **Mac**: the first time you type `git`, your Mac may offer to install its "command line developer tools". Click Install; Git comes with them.',
        '- **Windows**: download Git for Windows from [git-scm.com](https://git-scm.com/downloads) and accept the defaults.',
        '- **Linux**: `sudo apt install git` on Ubuntu.',
        '',
        'Then open a new terminal and try `git --version` again.',
        '',
        '## Tell Git who you are',
        '',
        'You do this once per laptop. `--global` means "for every project on this machine".',
      ),
      sh(
        'git config --global user.name "Meera Iyer"',
        'git config --global user.email "meera@example.com"',
        'git config --global init.defaultBranch main',
        'git config --global pull.rebase false',
      ),
      md(
        "Use your own name and email. The third line names the main line of work `main`, which is what most teams use today. The last line tells `git pull` how to combine your work with the team's (you will meet it in chapter 4).",
        '',
        'Check it worked:',
      ),
      sh('git config user.name'),
      out('Meera Iyer'),
      tip(
        'Use your work email',
        'Use the same email as your work GitHub account. That is how GitHub links your commits to you.',
      ),
      note(
        'Where am I?',
        'Git works on the folder your terminal is in. If a command says "not a git repository", you are probably in the wrong folder. `pwd` prints where you are, and `cd folder-name` moves you into a folder.',
      ),
      check(
        'Meera runs `git config user.email "meera@example.com"` inside one project, without `--global`. Where does it apply?',
        ['Every project on her laptop', 'Only that one project'],
        'Without `--global`, the setting is saved inside that project only. That is handy if you need a different email for one project.',
        1,
      ),
    ]),
    lesson('your-first-repository', 'Your first repository', 12, 'video', [
      video(540),
      md(
        "Meera decides to start the menu fresh, properly this time. She will make a project called `chai-corner` and save its first version. Follow along on your own laptop, in the same folder from here to the end of chapter 3. You can't break anything.",
        '',
        '## Try it',
        '',
        '**1. Make a folder and step into it.**',
      ),
      sh('mkdir chai-corner', 'cd chai-corner'),
      md('**2. Turn the folder into a Git project.**'),
      sh('git init'),
      out('Initialized empty Git repository in /Users/meera/chai-corner/.git/'),
      md(
        'Git made a hidden folder called `.git`. That folder is where all the saves will live. A folder with a `.git` inside is called a **repository**, or **repo** for short.',
        '',
        '**3. Write the menu.**',
      ),
      sh('echo "# Chai Corner" > menu.md', 'echo "Masala chai: ₹15" >> menu.md', 'cat menu.md'),
      out('# Chai Corner', 'Masala chai: ₹15'),
      md(
        '`echo "text" > menu.md` writes a new file (replacing anything already in it). `>>` adds a line to the end instead. `cat` prints a file. You can also open the folder in any text editor, such as VS Code, and edit `menu.md` there: Git does not mind how a file was changed.',
        '',
        '**4. Ask Git what it sees.**',
      ),
      sh('git status'),
      out(
        'On branch main',
        '',
        'No commits yet',
        '',
        'Untracked files:',
        '  (use "git add <file>..." to include in what will be committed)',
        '\tmenu.md',
        '',
        'nothing added to commit but untracked files present (use "git add" to track)',
      ),
      md(
        'In plain English: "There is a file called menu.md that I am not looking after yet. Use `git add` if you want me to."',
        '',
        '**5. Save it.**',
      ),
      sh('git add menu.md', 'git commit -m "Add the menu"'),
      out(
        '[main (root-commit) 5c4b3a2] Add the menu',
        ' 1 file changed, 2 insertions(+)',
        ' create mode 100644 menu.md',
      ),
      md('**6. Look at the history.**'),
      sh('git log'),
      out(
        'commit 5c4b3a2e8f1d...',
        'Author: Meera Iyer <meera@example.com>',
        'Date:   Tue Nov 3 10:12:44 2026 +0530',
        '',
        '    Add the menu',
      ),
      md(
        '## What just happened',
        '',
        'You made your first save point. Git stored the menu exactly as it is now, with your name, the time and your note "Add the menu". The long code `5c4b3a2...` is the commit\'s id. Every commit has its own.',
      ),
      note(
        'Your screen will look a little different',
        'Ids, dates and folder names will be your own, and some outputs in this course are shortened. If the important lines match, you are on track.',
      ),
      tip(
        'When in doubt, git status',
        '`git status` is the command you will type most. It never changes anything; it only tells you where things stand and usually suggests what to do next.',
      ),
      check(
        'What does `git init` do?',
        [
          'Creates a hidden `.git` folder where the history will be kept',
          'Uploads the folder to GitHub',
          'Saves the first commit',
        ],
        '`git init` only sets up the `.git` folder. Nothing is saved until you `git add` and `git commit`.',
      ),
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Chapter 2 · Snapshots and history
// ---------------------------------------------------------------------------------------------

const quiz1Specs: QuestionSpec[] = [
  {
    id: 'quiz-i-q1',
    kind: 'trueFalse',
    prompt:
      '`git init` creates a hidden `.git` folder that keeps the whole history of the project.',
    options: TRUE_FALSE,
    correct: [0],
    explanation:
      'True. The `.git` folder is the repository. Delete it and the history is gone, though your files stay.',
    review: 'your-first-repository',
  },
  {
    id: 'quiz-i-q2',
    kind: 'single',
    prompt: 'Meera runs `git add menu.md`. What happens?',
    options: [
      'The file, as it is right now, goes into the staging area for the next commit',
      'The file is saved as a commit',
      'The file is uploaded to GitHub',
      'A new empty file called menu.md is created',
    ],
    correct: [0],
    explanation:
      '`git add` packs the file into the box for the next save. If she edits it again afterwards, she has to add it again.',
    review: 'staging-and-committing',
  },
  {
    id: 'quiz-i-q3',
    kind: 'single',
    prompt: 'Which commit message is the most useful to read six months later?',
    options: [
      'changes',
      'Add cold drinks section to the menu',
      'I added the cold drinks because Ravi asked me to on Tuesday in the meeting',
      'WIP',
    ],
    correct: [1],
    explanation:
      'Short and specific, and it finishes the sentence "If applied, this commit will...". The long one belongs in the body of the message, if anywhere.',
    review: 'good-commit-messages',
  },
  {
    id: 'quiz-i-q4',
    kind: 'codeOutput',
    prompt: 'Meera sees this, then runs `git commit`. What goes into the commit?',
    code: lines('$ git status --short', ' M menu.md', 'A  prices.md', '?? notes.txt'),
    options: [
      'Only menu.md',
      'Only prices.md',
      'menu.md and prices.md',
      'menu.md, prices.md and notes.txt',
    ],
    correct: [1],
    explanation:
      'Only what is staged. The letter in the first column means staged: `A` for prices.md. menu.md is changed but not staged (its letter is in the second column), and `??` means notes.txt is new and Git is not looking after it yet.',
    review: 'staging-and-committing',
  },
  {
    id: 'quiz-i-q5',
    kind: 'single',
    prompt:
      'Arjun adds `secrets.txt` to `.gitignore`, but that file was already committed last week. What happens?',
    options: [
      'Git forgets the file straight away',
      'Git keeps tracking it until he runs `git rm --cached secrets.txt` and commits',
      'Git deletes the file from his laptop',
      'Git refuses to make any more commits',
    ],
    correct: [1],
    explanation:
      '`.gitignore` only stops new files from being picked up. A file Git already looks after stays tracked until you remove it with `git rm --cached`. And if it held a real secret, that secret is still in the history: change it.',
    review: 'gitignore',
  },
  {
    id: 'quiz-i-q6',
    kind: 'single',
    prompt: 'Which command shows the history with one short line per commit?',
    options: ['git log --oneline', 'git status --short', 'git show --all', 'git history'],
    correct: [0],
    explanation:
      '`git log --oneline` prints each commit as its short id and its message. (There is no `git history` command.)',
    review: 'reading-history-git-log',
  },
];

const chapter2: Chapter = {
  id: 'snapshots-and-history',
  title: 'Snapshots and history',
  items: [
    lesson('staging-and-committing', 'Staging and committing', 9, 'hands', [
      md(
        "Meera adds ginger chai to the menu. She also jots down a note to herself in `notes.txt`: 'ask Ravi about cold drinks'. The menu change is ready to save. The note is not something the team needs.",
        '',
        'Git lets her save just the menu. This is what the **staging area** is for.',
        '',
        '## Packing a box',
        '',
        'Think of each commit as a box you send to storage. `git add` puts a change into the box. `git commit` seals the box and writes a label on it. Anything you did not put in the box stays on your desk, however close it was.',
      ),
      img(
        'three-places',
        'Three boxes in a row. Working folder holds menu.md and notes.txt. An arrow, git add, leads to the Staging area, which holds only menu.md. An arrow, git commit, leads to History: the saved commits Add menu, Add prices and Fix typo.',
        'Your work moves from left to right: edit, then stage with git add, then save with git commit.',
      ),
      md('## Try it', '', 'In your `chai-corner` folder, change the menu and create a note:'),
      sh(
        'echo "Ginger chai: ₹15" >> menu.md',
        'echo "ask Ravi about cold drinks" > notes.txt',
        'git status --short',
      ),
      out(' M menu.md', '?? notes.txt'),
      md(
        'Two letters per file. The **first** column is the staging area, the **second** is your working folder. ` M` means "changed, not staged yet". `??` means "a new file I am not looking after".',
        '',
        'Now put only the menu in the box, and seal it:',
      ),
      sh('git add menu.md', 'git status --short'),
      out('M  menu.md', '?? notes.txt'),
      md('The `M` moved to the first column: the menu is staged. Now save it.'),
      sh('git commit -m "Add ginger chai"'),
      md(
        '## What just happened',
        '',
        'The commit holds the new menu and nothing else. `notes.txt` is still on your desk, untouched and unsaved.',
        '',
        'You will hear the staging area called the **index** too. It is the same thing.',
      ),
      warn(
        'Add again after editing',
        '`git add` packs the file **as it is at that moment**. If you edit it again afterwards, those new edits are not in the box until you run `git add` again.',
      ),
      tip(
        'Staging everything at once',
        '`git add .` stages every change in the current folder. It is quick, so run `git status` first to make sure you really want all of it.',
      ),
      check(
        'Meera edits `menu.md`, runs `git add menu.md`, edits `menu.md` again, then runs `git commit`. What is in the commit?',
        [
          'Both edits',
          'Only the first edit, the one she staged',
          'Nothing, Git asks her to stage again',
        ],
        'The commit holds what was in the box when she sealed it. The second edit is still in her working folder, waiting to be added.',
        1,
      ),
    ]),
    lesson('good-commit-messages', 'Writing good commit messages', 7, 'read', [
      md(
        'Six months from now, someone will wonder why ginger chai is on the menu. The commit message is the only note they will find. Write it for that person. Very often, that person is you.',
        '',
        '## One simple test',
        '',
        'A good first line finishes this sentence:',
        '',
        '> If applied, this commit will **...**',
        '',
        '- "If applied, this commit will **Add cold drinks section**." Good.',
        '- "If applied, this commit will **Fix price of masala chai**." Good.',
        '- "If applied, this commit will **changes**." Says nothing.',
        '- "If applied, this commit will **WIP**." Says nothing at all.',
        '',
        '## The shape',
      ),
      file(
        'commit message',
        'text',
        'Add ginger chai',
        '',
        'Several people asked for it at the counter last week, and the',
        'canteen team can make it at the same price as masala chai.',
      ),
      md(
        '- **First line**: short (about 50 characters), starts with a verb like Add, Fix, Remove or Update, and has no full stop.',
        '- Then a **blank line**.',
        '- Then, if it helps, a few lines saying **why**. The change itself already shows **what**.',
        '',
        'Keep each commit to one idea. "Fix the price **and** add cold drinks" is two commits. A small commit is easy to check, and easy to undo on its own.',
      ),
      replace(
        'If NonStop teams use a message format such as Conventional Commits (`type(scope): description`) or ticket references, describe it here with an example.',
      ),
      check(
        'Which first line is best?',
        ['updates', 'Fixed stuff', 'Fix price of masala chai', 'FIX!!! menu'],
        'Short, starts with a verb, and says exactly what changed.',
        2,
      ),
    ]),
    lesson('reading-history-git-log', 'Reading history with git log', 8, 'hands', [
      md(
        'By Wednesday the menu has a few saves. Arjun changed something too. Meera wants to see what happened.',
        '',
        '## Your history is a chain',
        '',
        'Each commit points back to the one before it, its **parent**. Follow the arrows backwards and you walk through the life of the project.',
      ),
      img(
        'commit-chain',
        'Three commit cards from oldest to newest: 5c4b3a2 Add the menu by Meera on Monday, 9f8e7d6 Add prices by Meera on Tuesday, a1b2c3d Fix a typo by Arjun on Wednesday. Arrows point from each commit back to the one before it.',
        'A busy project a few days in. Each commit remembers its parent, so the history forms a chain.',
      ),
      md('## Try it'),
      sh('git log --oneline'),
      out('b2c3d4e (HEAD -> main) Add ginger chai', '5c4b3a2 Add the menu'),
      md(
        'Newest at the top. The seven characters on the left are each commit\'s short id, like a fingerprint. Yours will be different: Git makes a new one for every commit. The first seven or so characters are enough to name a commit. `(HEAD -> main)` means "you are on main"; chapter 3 explains it.',
        '',
        'To see exactly what one commit changed, use **your own** id from the list:',
      ),
      sh('git show b2c3d4e'),
      out(
        'commit b2c3d4e...',
        'Author: Meera Iyer <meera@example.com>',
        '',
        '    Add ginger chai',
        '',
        ' # Chai Corner',
        ' Masala chai: ₹15',
        '+Ginger chai: ₹15',
      ),
      md(
        'Lines starting with `+` were added and lines starting with `-` were removed. Here, one line was added.',
        '',
        '## A few more you will use',
      ),
      sh(
        'git log -n 5                 # only the last five commits',
        'git log --author="Arjun"     # only commits by Arjun',
        'git log -- menu.md           # only commits that touched menu.md',
        'git diff                     # what you changed but have not staged',
        'git diff --staged            # what is staged for the next commit',
      ),
      tip(
        'Spot the difference',
        '`git diff` is the "spot the difference" game for your project. Run it before every commit to check you are saving what you meant to save.',
      ),
      check(
        'Which command shows only the commits that touched `menu.md`?',
        ['git status menu.md', 'git log -- menu.md', 'git show menu.md'],
        '`git log` shows history; adding `-- menu.md` narrows it to that file. The `--` tells Git "what follows is a file name".',
        1,
      ),
    ]),
    lesson('gitignore', '.gitignore', 7, 'read', [
      md(
        "Arjun connects the menu to the canteen's payment system. The connection needs a password, which he keeps in a file called `.env`. He nearly commits it. Ravi stops him just in time.",
        '',
        '## The "do not pack" list',
        '',
        'When you move house, you tell the movers which boxes stay behind. `.gitignore` is that list for Git. Any file that matches it is left out, even when you run `git add .`.',
        '',
        'Things that belong on the list:',
        '',
        '- passwords and keys (`.env` files)',
        '- files your tools generate, which anyone can make again',
        "- your editor's personal settings",
        '',
        '## Try it',
        '',
        'Create a file called `.gitignore` in the project folder. Its name starts with a dot, which hides it in Finder and Explorer, so make it from the terminal:',
      ),
      sh(
        'echo ".env" > .gitignore',
        'echo "notes.txt" >> .gitignore',
        'echo "*.log" >> .gitignore',
        'cat .gitignore',
      ),
      out('.env', 'notes.txt', '*.log'),
      sh('git status --short'),
      out('?? .gitignore'),
      md(
        '`notes.txt` has disappeared from the list: Git now ignores it. Commit `.gitignore` itself, so the whole team shares the same list:',
      ),
      sh('git add .gitignore', 'git commit -m "Ignore notes and secrets"'),
      md(
        '',
        '- `notes.txt` matches one file.',
        '- `*.log` matches every file ending in `.log`.',
        '- `build/` matches a whole folder.',
      ),
      warn(
        'It only works for new files',
        'If a file was **already committed**, adding it to `.gitignore` does not stop Git tracking it. Run `git rm --cached .env` (this keeps the file on your laptop) and commit.',
      ),
      warn(
        'A committed secret is no longer secret',
        'Deleting a password in a later commit does not remove it from the history. Anyone with the repository can still find it. Change the password straight away, then tell your lead.',
      ),
      check(
        'Which line in `.gitignore` ignores every file ending in `.log`?',
        ['*.log', 'log/', 'log'],
        '`*` means "anything", so `*.log` matches every name ending in `.log`. `log/` would match a folder named log.',
      ),
    ]),
    quiz('quiz-i', 'Quiz I: Snapshots and history', quiz1Specs, 'each', 10),
  ],
};

// ---------------------------------------------------------------------------------------------
// Chapter 3 · Branching
// ---------------------------------------------------------------------------------------------

const quiz2Specs: QuestionSpec[] = [
  {
    id: 'quiz-ii-q1',
    kind: 'single',
    prompt: 'What is a branch in Git?',
    options: [
      'A label that points at a commit, and moves forward as you commit',
      'A full copy of the project folder',
      'A backup of the repository',
      'A list of changed files',
    ],
    correct: [0],
    explanation:
      'A branch is a sticky label on a commit. Making one is instant because nothing is copied.',
    review: 'what-a-branch-really-is',
  },
  {
    id: 'quiz-ii-q2',
    kind: 'single',
    prompt: 'Which command makes a new branch called `cold-drinks` and moves you onto it?',
    options: [
      'git switch -c cold-drinks',
      'git branch cold-drinks',
      'git merge cold-drinks',
      'git switch cold-drinks',
    ],
    correct: [0],
    explanation:
      '`-c` means create. `git branch cold-drinks` makes the branch but leaves you where you were, and `git switch cold-drinks` only works if the branch already exists.',
    review: 'create-and-switch-branches',
  },
  {
    id: 'quiz-ii-q3',
    kind: 'single',
    prompt: 'Meera and Arjun changed the same line on two branches. What does `git merge` do?',
    options: [
      'Stops and writes both versions into the file, between markers, for a person to choose',
      'Keeps the newer change and throws the other away',
      'Keeps the change from the branch you are on',
      'Deletes the file',
    ],
    correct: [0],
    explanation:
      'Git never guesses between two edits of the same line. It stops, shows both, and waits for you.',
    review: 'resolving-merge-conflicts',
  },
  {
    id: 'quiz-ii-q4',
    kind: 'single',
    prompt: 'When can Git fast-forward a merge?',
    options: [
      'When main has no new commits since the branch was made',
      'When both branches changed different files',
      'When you add `--force`',
      'When the branch has only one commit',
    ],
    correct: [0],
    explanation:
      'If main has not moved, the history is one straight line. Git just slides the main label forward, and no merge commit is needed.',
    review: 'merging',
  },
  {
    id: 'quiz-ii-q5',
    kind: 'single',
    prompt: 'Meera picked the right price and deleted the conflict markers. What next?',
    options: [
      '`git add menu.md`, then `git commit`',
      '`git merge --force`',
      '`git branch -d cold-drinks`',
      '`git push` straight away',
    ],
    correct: [0],
    explanation: '`git add` tells Git the conflict is sorted. `git commit` finishes the merge.',
    review: 'resolving-merge-conflicts',
  },
  {
    id: 'quiz-ii-q6',
    kind: 'single',
    prompt: 'What does HEAD usually point to?',
    options: [
      'The branch you are on right now',
      'The first commit in the repository',
      'The copy on GitHub',
      'The newest tag',
    ],
    correct: [0],
    explanation:
      'HEAD is the "You are here" marker. It points at your current branch, and your next commit goes there.',
    review: 'what-a-branch-really-is',
  },
];

const chapter3: Chapter = {
  id: 'branching',
  title: 'Branching',
  items: [
    lesson('what-a-branch-really-is', 'What a branch really is', 7, 'read', [
      md(
        'Ravi asks Meera to add a cold drinks section. It will take her a few days, and nobody should see a half-finished menu in the meantime.',
        '',
        'So Meera will work on a **branch**: her own line of work, next to the main one.',
        '',
        '## A branch is a bookmark',
        '',
        'Picture the history as a photo album, one commit per page. A **branch** is a bookmark sitting in one of those pages. When you make a new commit, the bookmark you are using moves to the new page.',
        '',
        '- `main` is the bookmark for the version everyone uses.',
        "- `cold-drinks` is the bookmark for Meera's new work.",
        '',
        'And **HEAD** is a small "You are here" pin. It shows which bookmark you are using right now, so Git knows where your next commit goes.',
      ),
      img(
        'branches',
        'A line of commits. One branch, main, is a label on a commit along the bottom line. A second line of two commits grows from the same history to the branch cold-drinks. A dark pin labelled HEAD, You are here, sits on cold-drinks.',
        'Two bookmarks in the same album. HEAD shows which one you are using.',
      ),
      md(
        '## Why branches cost nothing',
        '',
        'A branch is not a copy of your files. It is just a tiny label holding one commit id. That is why making one is instant, and why teams make a new branch for every piece of work, however small.',
      ),
      sh('git branch'),
      out('* main'),
      md(
        'For now there is one branch, and the `*` shows HEAD is on it. In the next lesson you will make a second one.',
      ),
      check(
        'Making a new branch copies all the project files.',
        ['True', 'False'],
        'False. A branch is only a label pointing at a commit. Nothing is copied.',
        1,
      ),
    ]),
    lesson('create-and-switch-branches', 'Create and switch branches', 8, 'hands', [
      md(
        'Time for Meera to start the cold drinks. She makes her branch and moves onto it in one step.',
        '',
        '## Try it',
      ),
      sh('git switch -c cold-drinks'),
      out("Switched to a new branch 'cold-drinks'"),
      md('`-c` means "create". Now add the new section and save it:'),
      sh(
        'echo "## Cold drinks" >> menu.md',
        'echo "Nimbu soda: ₹20" >> menu.md',
        'git add menu.md',
        'git commit -m "Add cold drinks section"',
      ),
      md('Now jump back to `main` and look at the menu:'),
      sh('git switch main', 'cat menu.md'),
      out('# Chai Corner', 'Masala chai: ₹15', 'Ginger chai: ₹15'),
      md('No cold drinks. Switch back and they reappear:'),
      sh('git switch cold-drinks', 'cat menu.md'),
      out(
        '# Chai Corner',
        'Masala chai: ₹15',
        'Ginger chai: ₹15',
        '## Cold drinks',
        'Nimbu soda: ₹20',
      ),
      md(
        '## What just happened',
        '',
        'When you switch branches, Git changes the files in your folder to match that branch. It feels like stepping between two versions of the same room. Your work on `cold-drinks` is safe; it is just not on `main` yet.',
      ),
      note(
        'You will also see git checkout',
        'Older guides use `git checkout cold-drinks` to switch and `git checkout -b` to create. They still work. `git switch` is the newer, clearer command, and the one this course uses.',
      ),
      warn(
        'Save or shelve before you switch',
        'If you have changes that are not committed, and they clash with the other branch, Git refuses to switch rather than lose them. Commit first, or put them aside with `git stash` (chapter 5).',
      ),
      check(
        'Meera is on `main` and wants to start fresh work on a new branch called `fix-typo`. What does she run?',
        ['git branch fix-typo', 'git switch -c fix-typo', 'git merge fix-typo'],
        '`git switch -c` makes the branch and moves her onto it. `git branch fix-typo` makes it but leaves her on main.',
        1,
      ),
    ]),
    lesson('merging', 'Merging', 11, 'hands', [
      md(
        'The cold drinks section is done and Ravi is happy with it. Now it needs to go into `main`, the menu everyone reads. Bringing one branch into another is called **merging**.',
        '',
        '## Try it',
        '',
        'Go to the branch that should **receive** the work, then merge the other one in:',
      ),
      sh('git switch main', 'git merge cold-drinks'),
      out(
        'Updating 7c8d9e0..e4d3c2b',
        'Fast-forward',
        ' menu.md | 2 ++',
        ' 1 file changed, 2 insertions(+)',
      ),
      md(
        '"Fast-forward" means nobody else changed `main` in the meantime, so Git had an easy job.',
        '',
        '## Two kinds of merge',
      ),
      img(
        'merge-kinds',
        'Top: fast-forward. Four commits in a straight line; the main label slides from the second commit to the last one. Bottom: merge commit. Main and a branch have each moved on with their own commits; a new merge commit joins the two lines, and the main label sits on it.',
        'If main has not moved, Git slides its label. If both sides moved, Git ties them together.',
      ),
      md(
        '- **Fast-forward.** Nobody changed `main` while Meera was working. Her commits continue the same line, so Git slides the `main` bookmark forward to her latest commit. No new commit is needed.',
        '- **Merge commit.** Arjun committed to `main` while Meera worked on her branch. Now there are two lines of work. Git makes one new commit that ties them together, like a knot joining two threads. That commit has two parents.',
        '',
        'Either way, you run the same `git merge`. Git picks the right kind.',
      ),
      tip(
        'Practise the merge on your branch first',
        'Before merging into `main`, merge `main` into your branch (`git switch cold-drinks`, then `git merge main`). If anything clashes, you sort it out on your own branch, and `main` stays clean.',
      ),
      check(
        'When can Git fast-forward a merge?',
        [
          'When main has no new commits since the branch was made',
          'Only when you add `--no-ff`',
          'Only when the two branches changed different files',
        ],
        'A fast-forward is only possible when the history is one straight line. Otherwise Git makes a merge commit.',
      ),
    ]),
    lesson('resolving-merge-conflicts', 'Resolving merge conflicts', 14, 'hands', [
      md(
        'A week later, Meera raises masala chai to ₹20 on her `cold-drinks` branch. Meanwhile, Arjun sets it to ₹25 on `main`, the price the canteen team gave him. Both changed **the same line**.',
        '',
        '## Try it: make a conflict on purpose',
        '',
        'Open `menu.md` in your editor for each change. `git commit -am` is a shortcut: it stages every file Git already tracks and commits, in one go.',
      ),
      sh(
        'git switch cold-drinks',
        '# change Masala chai to ₹20 in menu.md, save the file, then:',
        'git commit -am "Raise masala chai to ₹20"',
        'git switch main',
        '# change Masala chai to ₹25 in menu.md, save the file, then:',
        'git commit -am "Set masala chai to the canteen price"',
        'git merge cold-drinks',
      ),
      out(
        'Auto-merging menu.md',
        'CONFLICT (content): Merge conflict in menu.md',
        'Automatic merge failed; fix conflicts and then commit the result.',
      ),
      md(
        'Git is saying: "Two people changed the same line of menu.md. I don\'t know which one is right, so I have stopped. Please decide, then commit."',
        '',
        "This is a **merge conflict**. Git won't guess, so it asks you.",
      ),
      img(
        'conflict',
        'The menu said Masala chai 15 rupees. On main, Arjun changed it to 25; on cold-drinks, Meera changed it to 20. Both lead to the file with conflict markers: a HEAD marker line, Masala chai 25, a line of equals signs, Masala chai 20, and a cold-drinks marker line.',
        'Git writes both versions into the file and lets you choose.',
      ),
      md('## Reading the markers', '', 'Open `menu.md`. Git has written both versions in:'),
      file(
        'menu.md',
        'text',
        '<<<<<<< HEAD',
        'Masala chai: ₹25',
        '=======',
        'Masala chai: ₹20',
        '>>>>>>> cold-drinks',
      ),
      md(
        "- From `<<<<<<< HEAD` to `=======`: the version on the branch you are on (here, `main`, with Arjun's change).",
        "- From `=======` to `>>>>>>>`: the version coming in from the other branch (Meera's).",
        '',
        '## Fixing it, step by step',
        '',
        "**1. Decide.** Meera asks Arjun. They keep ₹25, the canteen team's price.",
        '',
        '**2. Edit the file** so it reads exactly how it should, and delete all three marker lines. That part of the menu becomes:',
      ),
      file('menu.md', 'text', 'Masala chai: ₹25'),
      md('**3. Tell Git it is sorted, and finish the merge:**'),
      sh('git add menu.md', 'git commit -m "Merge cold drinks, keep the canteen price"'),
      md('The cold drinks work is all on `main` now, so the branch can go:'),
      sh('git branch -d cold-drinks   # tidy up: its work is in main now'),
      note(
        'Changed your mind?',
        '`git merge --abort` puts everything back the way it was before the merge started. Nothing is lost.',
      ),
      tip(
        'Talk to the other person',
        'A conflict means two people had different ideas about the same line. Often the quickest fix is a message to the other person.',
      ),
      tip(
        'Practise safely',
        'Make a few conflicts on purpose in the `conflict-lab` practice repository before you meet one in real work.',
      ),
      replace(
        'The `conflict-lab` practice repository is still to be published. Add its URL here, and add any team rule for who resolves conflicts.',
      ),
      check(
        'Meera has chosen the right line and deleted the markers. What is next?',
        [
          '`git add menu.md`, then `git commit`',
          'Run `git merge cold-drinks` again',
          '`git push --force`',
        ],
        '`git add` marks the conflict as sorted; `git commit` finishes the merge.',
      ),
    ]),
    quiz('quiz-ii', 'Quiz II: Branching', quiz2Specs, 'each', 10),
  ],
};

// ---------------------------------------------------------------------------------------------
// Chapter 4 · Remotes and collaboration
// ---------------------------------------------------------------------------------------------

const chapter4: Chapter = {
  id: 'remotes-and-collaboration',
  title: 'Remotes and collaboration',
  items: [
    lesson('remotes-clone-fetch', 'Remotes, clone and fetch', 9, 'hands', [
      md(
        "So far everything has lived on Meera's laptop. But Arjun and Ravi need the menu too. The team keeps a shared copy of the repository on GitHub. A copy that lives somewhere else is called a **remote**, and the usual name for the main one is `origin`.",
      ),
      img(
        'local-and-remote',
        'Two boxes. Your laptop holds your main and origin/main, what you last saw on GitHub. GitHub, called origin, holds the shared main. git push sends commits from the laptop to GitHub; git fetch brings them back into origin/main. git pull is fetch, then merge.',
        'Your copy and the shared copy. Commits travel between them only when you ask.',
      ),
      md(
        '## Try it: put chai-corner on GitHub',
        '',
        "You need a free GitHub account (use your work email). Then, once per laptop, let Git sign in to GitHub. The easiest way is GitHub's own tool: install it from [cli.github.com](https://cli.github.com) and run:",
      ),
      sh('gh auth login'),
      md(
        'Answer the questions (GitHub.com, HTTPS, log in with a web browser). Now, on github.com, click **New repository**, call it `chai-corner`, leave every box unticked, and create it. GitHub shows its address. Connect your project to it and send your work up:',
      ),
      sh(
        'git remote add origin https://github.com/YOUR-NAME/chai-corner.git',
        'git push -u origin main',
      ),
      md(
        'Use your own GitHub name in the address. Refresh the page on GitHub: your menu and its whole history are there.',
      ),
      md(
        '## How a teammate gets a copy: clone',
        '',
        'When Arjun joined, he did not build the project from scratch. He **cloned** it: copied the whole repository, with all its history, from GitHub to his laptop. (You do not need to run this: you already have the project.)',
      ),
      sh('git clone https://github.com/nonstop-example/chai-corner.git'),
      out("Cloning into 'chai-corner'...", 'Receiving objects: 100% (24/24), done.'),
      md('Clone also remembers where the copy came from, under the name `origin`. On your laptop:'),
      sh('git remote -v'),
      out(
        'origin  https://github.com/YOUR-NAME/chai-corner.git (fetch)',
        'origin  https://github.com/YOUR-NAME/chai-corner.git (push)',
      ),
      md(
        '## Checking for news: fetch',
        '',
        '`git fetch` is like checking your post box without opening the letters. It downloads anything new from GitHub and files it under `origin/main`. Your own `main` and your files are not touched.',
      ),
      sh('git fetch', 'git log --oneline main..origin/main'),
      out('8a9b0c1 Add filter coffee'),
      md(
        '`main..origin/main` means "commits on origin/main that my main does not have". Here: Arjun added filter coffee. On your own repository nobody else is pushing, so you will see nothing, which is fine. Fetch is always safe, so run it whenever you want to know what the team has been doing.',
      ),
      check(
        'What does `git fetch` change?',
        [
          'Your current branch and your files',
          'Only `origin/main` and the other `origin/` labels: your record of what GitHub has',
          'The copy on GitHub',
        ],
        'Fetch only brings news in. To combine it with your work, you merge it (or use `git pull`, next lesson).',
        1,
      ),
    ]),
    lesson('push-and-pull', 'Push and pull', 8, 'hands', [
      md(
        'Meera has commits on her laptop that the team has not seen. Arjun has commits on GitHub that she has not seen. Two commands move work between the copies:',
        '',
        '- **push** sends your new commits up to GitHub.',
        "- **pull** brings the team's new commits down and merges them into your branch. It is `git fetch` followed by `git merge`.",
        '',
        '## Try it',
        '',
        'The first time you push a new branch, tell Git where it should go:',
      ),
      sh(
        'git switch -c snacks',
        '# add a snacks section, commit it, then:',
        'git push -u origin snacks',
      ),
      md(
        '`-u` makes Git remember the pairing, so from then on a plain `git push` or `git pull` on this branch is enough.',
        '',
        'A good habit: **pull before you start, and pull before you push.**',
      ),
      sh('git pull'),
      md('## When a push is refused'),
      out(
        ' ! [rejected]        main -> main (fetch first)',
        "error: failed to push some refs to 'https://github.com/nonstop-example/chai-corner.git'",
        'hint: Updates were rejected because the remote contains work that you do not',
        'hint: have locally.',
      ),
      md(
        'Git is saying: "Someone pushed while you were working. Get their work first, then try again." So: `git pull`, sort out any conflict, then `git push`.',
      ),
      warn(
        'Do not reach for --force',
        "`git push --force` makes GitHub's copy match yours exactly, and can wipe out a teammate's commits. If you are ever told to force-push your own branch, use `git push --force-with-lease`, which refuses if someone else has pushed in the meantime.",
      ),
      check(
        'Meera\'s push is rejected because "the remote contains work that you do not have locally". What does she do?',
        [
          'Run `git pull`, sort out any conflict, then push again',
          'Run `git push --force`',
          'Delete her branch and start again',
        ],
        'The rejection means a teammate pushed first. Bring their work in, then push.',
      ),
    ]),
    lesson('pull-requests-at-nonstop', 'Pull requests at NonStop', 9, 'read', [
      replace(
        'This lesson describes sensible defaults. Replace it with the PR process and template your NonStop teams actually use.',
      ),
      md(
        'Meera has pushed her `snacks` branch. She does not merge it into `main` herself. Instead she asks the team to look first. This request is a **pull request**, usually called a **PR**.',
        '',
        'A PR is like asking a colleague to read your email before you send it to the whole company. They might spot a typo, ask a question, or just say "looks good".',
      ),
      img(
        'pull-request-flow',
        'Five steps in a row: 1 Branch, a fresh start from main. 2 Commit, small steps with clear messages. 3 Push your branch to GitHub. 4 Pull request, saying what changed and why. 5 Review and merge, when a teammate says yes.',
        'The life of a change, from a new branch to main.',
      ),
      md(
        '## Opening one',
        '',
        'After you push a branch, GitHub shows a button: **Compare & pull request**. Click it, give the PR a clear title, and fill in the description.',
        '',
        '## What makes a PR easy to say yes to',
        '',
        '- **Small.** One idea. A reviewer should be able to read it over a cup of tea.',
        '- **Explains why.** The reviewer should never have to guess the reason.',
        '- **Shows it works.** How you checked it; a screenshot if something looks different.',
        '- **Passes the automatic checks** before you ask anyone to read it.',
      ),
      file(
        'PULL_REQUEST_TEMPLATE.md',
        'markdown',
        '## What changed',
        '',
        '## Why',
        '',
        '## How I checked it',
        '',
        '## Checklist',
        '- [ ] I checked it myself',
        '- [ ] Docs updated if needed',
        '- [ ] No passwords or personal data',
      ),
      md(
        'Meera\'s PR: **"Add snacks section"**. Why: "Ravi asked for snacks with the evening tea." How checked: "Read the menu on both branches; only the new section differs." Ravi reads it in five minutes.',
      ),
      check(
        'Which of these belongs in a good pull request description?',
        [
          'What changed and why',
          'Nothing: the code speaks for itself',
          'An apology for how big it is',
        ],
        'Say what changed, why, and how you checked it. And keep it small enough that no apology is needed.',
      ),
    ]),
    lesson('code-review-etiquette', 'Code review etiquette', 7, 'read', [
      replace(
        "Add NonStop's review expectations: who reviews, expected turnaround, and how many approvals are needed. The points below are generic defaults.",
      ),
      md(
        "Ravi leaves one comment on Meera's PR. Compare two ways he could have written it:",
        '',
        '> "This is wrong."',
        '',
        '> "Samosa is ₹25 at the counter now, I think. Could you check with the canteen team?"',
        '',
        'Both point at the same line. Only the second one helps.',
        '',
        '## When you review',
        '',
        '- Reply soon. A PR that waits blocks a teammate.',
        '- Ask before you tell: "What happens if the menu is empty?"',
        '- Say why, and suggest a way forward.',
        '- Mark small preferences as optional, for example by starting with `nit:` ("nitpick").',
        '- Say what is good, too.',
        '',
        '## When your work is reviewed',
        '',
        '- Read your own changes first and remove anything left over.',
        '- Comments are about the work, not about you.',
        '- Reply to every comment: change it, or explain why not.',
        '- Merge only when everything is answered and the checks pass.',
      ),
      tip(
        'What to look for',
        'Does it work? Is it tested? Is it easy to read? Is anything unsafe, like a password? Leave spacing and formatting to automatic tools.',
      ),
      check(
        'A reviewer writes "This is wrong." What would make the comment more useful?',
        [
          'Saying what is wrong and suggesting a fix, or asking a question',
          'Writing it in capital letters',
          'Adding more exclamation marks',
        ],
        'Specific, kind comments get fixed faster, and nobody dreads opening them.',
      ),
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Chapter 5 · Undoing things safely
// ---------------------------------------------------------------------------------------------

const chapter5: Chapter = {
  id: 'undoing-things-safely',
  title: 'Undoing things safely',
  items: [
    lesson('restore-and-reset', 'restore and reset', 13, 'hands', [
      md(
        'Everyone makes mistakes with Git. The good news: almost everything can be undone, as long as you pick the right tool. This chapter gives you one for each situation. Keep this picture handy:',
      ),
      img(
        'undo-guide',
        'Two columns, what happened and what to run. I edited a file and want it back: git restore file. I staged something by mistake: git restore --staged file. I committed, but have not pushed: git reset. I already pushed it: git revert commit. I lost a commit, help: git reflog.',
        'Find your situation on the left, run the command on the right.',
      ),
      md(
        '## Undo edits you have not committed: restore',
        '',
        'Meera tries a new layout for the menu, hates it, and wants the file back as it was at her last commit.',
      ),
      sh('git restore menu.md'),
      md(
        'It puts the file back exactly as it was in your last commit. And if she put something in the staging area by mistake, she takes it back out:',
      ),
      sh('git add menu.md', 'git restore --staged menu.md   # out of the box, edits kept'),
      warn(
        'Restored edits are gone for good',
        '`git restore menu.md` throws away the changes in that file. They were never committed, so there is no save point to go back to.',
      ),
      md(
        '## Undo a commit you have not pushed: reset',
        '',
        'Meera commits her snacks section, then notices she forgot the price of samosa. The commit is only on her laptop. She can move her branch back one commit with `git reset`. `HEAD~1` means "one commit before where I am".',
        '',
        'How much should Git keep? That is what the three modes decide:',
        '',
        '- `--soft`: undo the commit, keep the changes **staged**. Ready to commit again.',
        '- `--mixed` (the default): undo the commit, keep the changes in your **working folder**, unstaged.',
        '- `--hard`: undo the commit **and throw the changes away**.',
      ),
      sh(
        'git reset --soft HEAD~1    # undo the last commit, keep the work staged',
        '# add the samosa price to menu.md, then:',
        'git add menu.md',
        'git commit -m "Add snacks section"',
      ),
      note(
        'Only reset what nobody else has',
        'Reset rewrites your history. That is fine for commits that live only on your laptop. Once you have pushed, use `git revert` instead (next lesson).',
      ),
      check(
        'Which command takes a file out of the staging area but keeps your edits?',
        ['git restore --staged menu.md', 'git restore menu.md', 'git reset --hard'],
        '`--staged` only touches the staging area. The other two throw your edits away.',
      ),
    ]),
    lesson('revert', 'revert', 6, 'hands', [
      md(
        "Friday afternoon. Arjun's last commit set nimbu soda to ₹2 instead of ₹20. It is already pushed, and the counter's screen shows the new menu.",
        '',
        '## Print a correction, do not tear out the page',
        '',
        "When a newspaper gets something wrong, it does not pull every copy back from people's homes. It prints a correction in the next issue. `git revert` does the same: it adds a **new** commit that does the exact opposite of the bad one. History stays as it was, and everyone can pull the fix.",
        '',
        '## Try it',
      ),
      sh('git log --oneline -3'),
      out(
        'b7c8d9e (HEAD -> main, origin/main) Update cold drink prices',
        '1a2b3c4 Merge pull request #2 from snacks',
        '8a9b0c1 Add filter coffee',
      ),
      sh('git revert --no-edit b7c8d9e', 'git push'),
      out('[main 1f2e3d4] Revert "Update cold drink prices"'),
      md(
        '`--no-edit` accepts the ready-made message, "Revert ...". The menu is back to how it was, and the history shows both the mistake and the fix.',
      ),
      tip(
        'Reset or revert?',
        'Ask one question: **have I pushed it?** No: `reset` is fine. Yes: use `revert`.',
      ),
      check(
        'A bad commit is already on the shared `main` on GitHub. What is the safest way to undo it?',
        [
          'git revert <commit>, then push',
          'git reset --hard, then git push --force',
          'Delete the repository and clone it again',
        ],
        'Revert adds a correcting commit and leaves the shared history alone, so nobody else is affected.',
      ),
    ]),
    lesson('stash', 'stash', 7, 'hands', [
      md(
        'Meera is halfway through a new breakfast section when Ravi messages: "The price of masala chai is wrong on main, can you fix it now?"',
        '',
        'Her breakfast work is not ready to commit. But she needs a clean desk to fix `main`.',
        '',
        '## Put it in a drawer',
        '',
        '`git stash` sweeps your unfinished changes into a drawer and leaves the desk clean. When you come back, you take them out again.',
        '',
        '## Try it',
      ),
      sh(
        'git switch -c breakfast',
        '# start a breakfast section in menu.md, then:',
        'git stash push -m "breakfast, half done"',
      ),
      out('Saved working directory and index state On breakfast: breakfast, half done'),
      sh('git stash list                # see what is in the drawer'),
      out('stash@{0}: On breakfast: breakfast, half done'),
      sh(
        'git switch main',
        '# fix the price, commit, push',
        'git switch breakfast',
        'git stash pop',
      ),
      md(
        '`git stash pop` takes the most recent stash out of the drawer, puts it back on your desk and removes it from the list. Her breakfast section is back, exactly as she left it.',
      ),
      note(
        'The drawer is on your laptop only',
        'Stashes are never pushed to GitHub. Use them for minutes or hours, not weeks. For anything longer, commit on a branch.',
      ),
      tip(
        'New files too',
        'By default, stash only takes files Git already tracks. Add `-u` to include new files as well: `git stash push -u`.',
      ),
      check(
        'Meera has unfinished, uncommitted work and must switch branches to fix something urgent. What is a good way?',
        [
          '`git stash`, switch and fix, switch back, `git stash pop`',
          'Delete her unfinished files',
          'Push the unfinished work to main',
        ],
        'Stash keeps the work safe without committing it, and gives it back when she returns.',
      ),
    ]),
    lesson('reflog-safety-net', 'reflog: the safety net', 7, 'hands', [
      md(
        'Late on a long day, Meera finishes two breakfast commits and runs `git reset --hard HEAD~2`. She meant `HEAD~1`. Two commits vanish from `git log`.',
        '',
        "Don't panic: Git still has them.",
        '',
        '## Git keeps a diary',
        '',
        'Every time HEAD moves (a commit, a switch, a reset, a merge), Git writes it down in a private diary called the **reflog**. Even when no branch points at a commit any more, the diary still remembers where you were.',
      ),
      sh('git reflog'),
      out(
        '8a9b0c1 HEAD@{0}: reset: moving to HEAD~2',
        'd4e5f6a HEAD@{1}: commit: Add breakfast prices',
        'c3d4e5f HEAD@{2}: commit: Add breakfast section',
        '8a9b0c1 HEAD@{3}: checkout: moving from main to breakfast',
      ),
      md(
        'Read it from the top: the latest move was the reset. Just before it, at `HEAD@{1}`, she was on `d4e5f6a`. That is the commit she wants back.',
      ),
      sh('git reset --hard d4e5f6a'),
      md(
        'Both commits are back.',
        '',
        'If you would rather not move your branch, you can rescue the commit onto a new branch instead:',
      ),
      sh('git branch rescue d4e5f6a'),
      warn(
        'What the diary cannot do',
        'The reflog only remembers **commits**, only on your own laptop, and lost ones for about a month. Changes you never committed cannot be recovered. One more reason to commit early and often.',
      ),
      check(
        'Meera ran `git reset --hard` and lost two commits. Where does she look first?',
        ['git reflog', 'git remote -v', 'git config --list'],
        'The reflog lists everywhere HEAD has been, including the commits she just moved away from.',
      ),
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Chapter 6 · The NonStop team workflow
// ---------------------------------------------------------------------------------------------

const finalSpecs: QuestionSpec[] = [
  {
    id: 'quiz-final-q1',
    kind: 'single',
    prompt: 'What is the difference between `git fetch` and `git pull`?',
    options: [
      'Fetch only downloads news into `origin/main`; pull also merges it into your current branch',
      'There is no difference',
      'Fetch uploads your commits; pull downloads them',
      'Pull only works on `main`',
    ],
    correct: [0],
    explanation: '`git pull` is `git fetch` followed by a merge.',
    review: 'remotes-clone-fetch',
  },
  {
    id: 'quiz-final-q2',
    kind: 'single',
    prompt:
      'You have unfinished, uncommitted work and must switch branches to fix something urgent. What is a good approach?',
    options: [
      '`git stash`, switch and fix, switch back, `git stash pop`',
      '`git reset --hard`',
      '`git push --force`',
      'Copy the folder somewhere and clone again',
    ],
    correct: [0],
    explanation: 'Stash puts the work in a drawer without committing it, and gives it back later.',
    review: 'stash',
  },
  {
    id: 'quiz-final-q3',
    kind: 'multiple',
    prompt: 'Which of these make a pull request easy to review? Select all that apply.',
    options: [
      'A small change with one purpose',
      'A description of what changed and why',
      'A few unrelated clean-ups bundled in',
      'A note on how it was checked',
    ],
    correct: [0, 1, 3],
    explanation:
      'Small, explained and checked changes are quick to review. Unrelated changes make the review longer and an undo riskier.',
    review: 'pull-requests-at-nonstop',
  },
  {
    id: 'quiz-final-q4',
    kind: 'single',
    prompt:
      'A wrong price is already pushed to the shared `main`. What is the safest way to undo it?',
    options: [
      '`git revert <commit>`, then push',
      '`git reset --hard`, then force push',
      'Delete `main` and make it again',
      'Ask everyone to clone again',
    ],
    correct: [0],
    explanation:
      'Revert prints a correction: a new commit. Shared history is not rewritten, so nobody else is affected.',
    review: 'revert',
  },
  {
    id: 'quiz-final-q5',
    kind: 'trueFalse',
    prompt: '`git reflog` can bring back changes you never committed.',
    options: TRUE_FALSE,
    correct: [1],
    explanation:
      'False. The reflog remembers commits. Changes that were never committed have no entry in it, which is why it pays to commit often.',
    review: 'restore-and-reset',
  },
  {
    id: 'quiz-final-q6',
    kind: 'single',
    prompt: 'You ran `git reset --hard HEAD~3` by mistake. How do you find the lost commits?',
    options: [
      '`git reflog`',
      '`git log` will still show them',
      '`git fetch`',
      'You cannot: they are gone',
    ],
    correct: [0],
    explanation:
      "The reflog is Git's diary of where HEAD has been. Find the commit there and reset back to it, or make a branch on it.",
    review: 'reflog-safety-net',
  },
  {
    id: 'quiz-final-q7',
    kind: 'single',
    prompt: 'When should you NOT rebase a branch?',
    options: [
      'When its commits are already pushed and teammates have built on them',
      'When it has more than one commit',
      'When it has not been merged yet',
      'When you are offline',
    ],
    correct: [0],
    explanation:
      'Rebase makes new copies of your commits. If teammates already have the old ones, their history and yours no longer match, and everyone gets confused.',
    review: 'rebase-vs-merge',
  },
  {
    id: 'quiz-final-q8',
    kind: 'codeOutput',
    prompt: 'Meera made the tag below. Which command shares it on GitHub?',
    code: lines('$ git tag -a v1.0.0 -m "First menu for the new counter"'),
    options: [
      'git push origin v1.0.0',
      'git push (on its own), because tags always go with it',
      'git fetch origin v1.0.0',
      'git merge v1.0.0',
    ],
    correct: [0],
    explanation:
      'A plain `git push` does not send tags. Push the tag by name, or push all tags with `git push --tags`.',
    review: 'release-tags',
  },
];

const chapter6: Chapter = {
  id: 'nonstop-team-workflow',
  title: 'The NonStop team workflow',
  items: [
    lesson('rebase-vs-merge', 'Rebase vs merge', 11, 'read', [
      md(
        "Meera's `breakfast` branch is ready for review. While she worked, `main` moved on: Ravi merged a fix to the tea prices. Before her PR, she wants her branch to include the latest `main`. There are two ways to do it.",
      ),
      img(
        'rebase-vs-merge',
        'Top, merge: commits A, B, C on main, with D and E on a branch from B, joined to main by a new merge commit. Bottom, rebase: one straight line A, B, C, then D prime and E prime, new copies of D and E placed after C.',
        'Merge ties the two lines together. Rebase moves your commits to the end of the line.',
      ),
      md(
        '## Merge: keep the real story',
        '',
        '`git merge origin/main` (run on her branch, after `git fetch`) ties the two lines together with a merge commit. Nothing is rewritten. The history shows exactly what happened, knots and all.',
        '',
        '## Rebase: tell it as one straight line',
        '',
        '`git rebase origin/main` lifts her commits off, and replays them one by one on top of the newest `main` from GitHub. It is like rewriting your notes as if you had started today. The history becomes a single straight line, which is easier to read.',
      ),
      sh(
        'git switch breakfast',
        'git fetch',
        'git rebase origin/main',
        '# if there is a conflict: fix it, git add the file, then',
        'git rebase --continue',
        '# or give up and go back to how things were',
        'git rebase --abort',
      ),
      md(
        'The catch: the replayed commits are **new copies** with new ids (`D′` and `E′` in the picture). The old ones are left behind.',
        '',
        '## The golden rule',
        '',
        '**Never rebase commits that other people already have.** If teammates have pulled your old commits, and you replace them with new copies, your history and theirs stop matching. Rebase only your own branch, before others build on it.',
        '',
        'If you rebase a branch you had already pushed, and you are the only one using it, update GitHub with `git push --force-with-lease`.',
        '',
        '## A common team habit',
        '',
        '- Keep your own branch fresh: `git fetch`, then `git rebase origin/main`.',
        '- Bring finished work into `main` through a pull request, with a merge.',
      ),
      replace(
        'State whether NonStop teams merge, squash-merge or rebase-merge pull requests, and whether `main` must stay linear.',
      ),
      check(
        'Which is true about rebase?',
        [
          'It replaces your commits with new copies',
          'It never changes commit ids',
          'It is safe on branches the whole team uses',
        ],
        'New copies mean new ids. That is why rebase is only safe on commits nobody else has.',
      ),
    ]),
    lesson('branch-naming-conventions', 'Branch naming and conventions', 6, 'read', [
      replace(
        'The names below are a generic default. Replace them with the convention used across NonStop teams.',
      ),
      md(
        'Ravi looks at the list of branches on GitHub: `snacks`, `breakfast`, `test`, `meera2` and `final-final`. Some are clear; some nobody can explain. He asks the team to agree on one way of naming them.',
        '',
        'A good name says what the branch is for, at a glance. A common pattern is **type/short-description**, in lower case, with hyphens between words:',
      ),
      file(
        'examples',
        'text',
        'feature/breakfast-menu',
        'fix/masala-chai-price',
        'docs/update-readme',
        'chore/tidy-old-files',
      ),
      md(
        '- `feature/` for something new, `fix/` for a correction, `docs/` for writing, `chore/` for housekeeping.',
        '- One branch for one piece of work. Delete it once it is merged.',
        '- Never commit straight to `main`. It should always work.',
        '- If your team tracks work with ticket numbers, you can add one to the name.',
      ),
      check(
        'Which is the best branch name under this convention?',
        ['fix/masala-chai-price', 'MyBranch2', 'wip', 'fix masala chai price'],
        'A type, then a short description in lower case with hyphens. Branch names cannot contain spaces.',
      ),
    ]),
    lesson('release-tags', 'Release tags', 7, 'hands', [
      replace(
        'Add how NonStop teams number releases and keep their changelog. This lesson uses semantic versioning as a default.',
      ),
      md(
        'The new counter opens on Monday, and the menu is ready. Ravi wants to mark this exact version, so that whatever changes later, the team can always find "the menu we launched with".',
        '',
        '## A tag is a milestone',
        '',
        'A branch is a bookmark that moves forward with your work. A **tag** is a stone marker that never moves: a permanent name for one commit. Teams tag every release.',
        '',
        '## Try it',
      ),
      sh('git tag -a v1.0.0 -m "First menu for the new counter"', 'git push origin v1.0.0'),
      md(
        '`switch --detach` lets you look around an old version without moving any branch: Git calls this "detached HEAD", meaning you are not on a branch. Look, but do not commit there; `git switch main` takes you back.',
        '',
        '`-a` makes an **annotated** tag, which records who tagged it, when, and why. Note the second line: a plain `git push` does **not** send tags, so push the tag by name.',
      ),
      sh(
        'git tag                      # list tags',
        'git show v1.0.0              # see the tag and its commit',
        'git switch --detach v1.0.0   # look at the menu exactly as it was released',
        'git switch main              # and come back',
      ),
      md(
        '## What the numbers mean',
        '',
        'Most teams use three numbers, **MAJOR.MINOR.PATCH**:',
        '',
        '- **PATCH** (1.0.**1**): a small fix. "Corrected the price of ginger chai."',
        '- **MINOR** (1.**1**.0): something new that does not break anything. "Added a breakfast section."',
        '- **MAJOR** (**2**.0.0): a big change people need to know about. "A completely new menu layout."',
        '',
        '## That is the course',
        '',
        'Remember the folder with four copies of the menu? Meera now has one menu, a clear history, and a way back from almost any mistake. You have learned the same things she has.',
        '',
        'One Quiz to go.',
      ),
      check(
        'The menu had a bug fix only, nothing new. The last release was v1.4.0. What is the next version?',
        ['v1.4.1', 'v1.5.0', 'v2.0.0'],
        'A small fix that changes nothing else bumps the last number, the patch.',
      ),
    ]),
    quiz('quiz-final', 'Final Quiz: Git, the NonStop Way', finalSpecs, 'onPass', 10),
  ],
};

// ---------------------------------------------------------------------------------------------

const chapters: Chapter[] = [chapter1, chapter2, chapter3, chapter4, chapter5, chapter6];

const estimatedMinutes = chapters
  .flatMap((p) => p.items)
  .reduce((sum, item) => sum + (item.type === 'lesson' ? item.minutes : 0), 0);

export const gitCourse: Course = {
  schemaVersion: 3,
  id: 'git-the-nonstop-way',
  title: 'Git, the NonStop Way',
  summary:
    'Follow Meera through her first weeks: save your work, branch, team up on GitHub and undo mistakes without panic.',
  description: lines(
    'Git is how every NonStop team keeps its work safe and works together. This course follows Meera, a new joiner, as she looks after a small project: the menu for the office tea counter. You will do everything she does, on your own laptop, one small step at a time.',
    '',
    'No programming needed. Each idea comes with an everyday picture: save points, a group photo, a bookmark, a correction in the newspaper. Short checks in every lesson help it stick, and three Quizzes along the way lead to your certificate.',
  ),
  level: 'foundation',
  cover: { theme: 'forest', glyph: 'Git' },
  outcomes: [
    'Explain what Git does, in plain words, and how commits, branches and HEAD fit together',
    'Save your work in small commits with messages people can understand',
    'Work on a branch, merge it, and sort out a merge conflict calmly',
    'Share work on GitHub with push, pull and pull requests, and review kindly',
    'Undo almost any mistake with restore, reset, revert, stash and reflog',
    'Follow a team workflow: rebase or merge, branch names and release tags',
  ],
  educatorIds: [],
  educatorNames: {},
  status: 'published',
  version: 1,
  publishedAt: null,
  // Videos are not recorded yet, so learners cannot be required to watch them.
  rules: { sequential: true, passMark: 0.7, certificate: true, requireVideoWatch: false },
  certificate: { title: 'Git, the NonStop Way' },
  chapters,
  estimatedMinutes,
};

/**
 * The same course with its diagrams served from `site` instead of the live site: the end-to-end
 * run seeds the emulator with the local preview's address. A trailing slash is ignored.
 */
export function gitCourseAt(site: string): Course {
  const origin = site.replace(/\/+$/, '');
  return {
    ...gitCourse,
    chapters: gitCourse.chapters.map((chapter) => ({
      ...chapter,
      items: chapter.items.map((item) =>
        item.type === 'lesson'
          ? {
              ...item,
              blocks: item.blocks.map((block) =>
                block.type === 'image'
                  ? { ...block, url: block.url.replace(DEFAULT_SITE, origin) }
                  : block,
              ),
            }
          : item,
      ),
    })),
  };
}

/** Answer keys for every Quiz: option ids. Seeded to `courses/{id}/private/answers`. */
export const gitAnswers: AnswerKeys = {
  'quiz-i': keysOf(quiz1Specs),
  'quiz-ii': keysOf(quiz2Specs),
  'quiz-final': keysOf(finalSpecs),
};
