import type { Block, Course, Lesson, Pariksha, Parva } from '@gurukul/schema';
import type { AnswerKeys } from './seed';

/*
 * The first course, "Git, the NonStop Way", as authored in .plan/14-first-course-git.md.
 *
 * - Videos are NOT recorded yet: every video block points at a placeholder URL. Replace the URL
 *   (and durationSec) when the recordings exist.
 * - Content the plan lists as "to supply" (branch naming, PR template, review expectations,
 *   release tagging) is written as generic defaults and flagged with a callout titled
 *   "Replace with NonStop's convention".
 * - `publishedAt` is null here; the seeder stamps it. Answer keys live in `gitAnswers`, never in
 *   the course object.
 */

type Draft = Block extends infer B ? (B extends unknown ? Omit<B, 'id'> : never) : never;

const lines = (...l: string[]) => l.join('\n');

const md = (...l: string[]): Draft => ({ type: 'markdown', md: lines(...l) });
const sh = (...l: string[]): Draft => ({
  type: 'code',
  lang: 'bash',
  code: lines(...l),
  copy: true,
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
const check = (prompt: string, options: string[], explanation: string): Draft => ({
  type: 'check',
  prompt,
  options,
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

const pariksha = (
  id: string,
  title: string,
  specs: QuestionSpec[],
  revealAnswers: Pariksha['revealAnswers'],
  cooldownMinutes: number,
): Pariksha => ({
  type: 'pariksha',
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
// Parva 1 · Why version control
// ---------------------------------------------------------------------------------------------

const parva1: Parva = {
  id: 'why-version-control',
  title: 'Why version control',
  items: [
    lesson('what-git-solves', 'What Git solves', 7, 'video', [
      video(420),
      md(
        '## The problem',
        '',
        'Without version control, work ends up in files called `report_final_v2_REAL.docx`, and two people editing the same file overwrite each other. Git solves three things:',
        '',
        '- **History**: every saved state of the project is kept, with who changed what and why.',
        '- **Safety**: you can try something risky and go back to the last good state.',
        '- **Collaboration**: many people work on the same project in parallel and combine their work.',
      ),
      md(
        '## How Git thinks',
        '',
        'Git is **distributed**: every clone holds the full history, so you can commit, branch and read history offline. A **repository** (repo) is a project folder plus a hidden `.git` folder holding that history. A **commit** is a snapshot of the whole project at a moment, with a message and a pointer to its parent.',
      ),
      check(
        'Which of these does Git give you?',
        [
          'A complete history of the project, kept in every clone',
          'Automatic backups to a cloud server',
          'A way to avoid ever having conflicting edits',
        ],
        'Git keeps full history locally. It is not a backup service (you still push to a remote), and conflicts can still happen: Git helps you resolve them.',
      ),
    ]),
    lesson('install-and-configure-git', 'Install and configure Git', 10, 'read', [
      md('## Install', '', 'Check whether Git is already there:'),
      sh('git --version'),
      md(
        'If not, install it: `brew install git` on macOS, `sudo apt install git` on Debian or Ubuntu, or [Git for Windows](https://git-scm.com/download/win). Any recent version works for this course.',
      ),
      md(
        '## Tell Git who you are',
        '',
        'Every commit records an author. Set your name and email once; `--global` applies it to every repository on this machine.',
      ),
      sh(
        'git config --global user.name "Ada Example"',
        'git config --global user.email "ada@example.com"',
        'git config --global init.defaultBranch main',
        'git config --global core.editor "code --wait"',
      ),
      tip(
        'Use your work email',
        'Use the email address you use for your work Git account, so your commits are linked to you.',
      ),
      md('## Check what is set'),
      sh('git config --list --show-origin', 'git config user.name'),
      note(
        'Three levels of config',
        '`--system` applies to the whole machine, `--global` to you, and `--local` (the default inside a repo) to that one repository. The most specific level wins.',
      ),
      check(
        'You run `git config user.email "ada@example.com"` inside a repository, without `--global`. Where does it apply?',
        ['Every repository on the machine', 'Only that repository'],
        "Without a flag, `git config` writes to the repository's own `.git/config`.",
      ),
    ]),
    lesson('your-first-repository', 'Your first repository', 12, 'video', [
      video(540),
      md(
        '## Follow along',
        '',
        'Create a folder, turn it into a repository, and make your first commit.',
      ),
      sh(
        'mkdir hello-git && cd hello-git',
        'git init',
        'echo "# Hello, Git" > README.md',
        'git status',
        'git add README.md',
        'git commit -m "Add README"',
        'git log',
      ),
      md(
        '`git init` creates the hidden `.git` folder: that folder **is** the repository. Delete it and the history is gone; the files stay.',
        '',
        '`git status` is the command you will run most. It tells you what changed and what is staged. When unsure, run it.',
      ),
      check(
        'What does `git init` create?',
        [
          'A hidden `.git` folder that holds the history',
          'A copy of the project on a remote server',
          'A first commit',
        ],
        '`git init` only creates the `.git` folder. No commit exists until you make one.',
      ),
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Parva 2 · Snapshots and history
// ---------------------------------------------------------------------------------------------

const pariksha1Specs: QuestionSpec[] = [
  {
    id: 'pariksha-i-q1',
    kind: 'trueFalse',
    prompt:
      '`git init` creates a hidden `.git` folder that holds the whole history of the project.',
    options: TRUE_FALSE,
    correct: [0],
    explanation:
      'True. The `.git` folder is the repository; the files around it are your working copy.',
    review: 'your-first-repository',
  },
  {
    id: 'pariksha-i-q2',
    kind: 'single',
    prompt: 'What does `git add notes.md` do?',
    options: [
      'Copies the current version of the file into the staging area for the next commit',
      'Commits the file',
      'Uploads the file to the remote',
      'Creates an empty file called notes.md',
    ],
    correct: [0],
    explanation:
      '`git add` stages a snapshot of the file as it is now. If you edit it again, you must add it again.',
    review: 'staging-and-committing',
  },
  {
    id: 'pariksha-i-q3',
    kind: 'single',
    prompt: 'Which commit message follows good practice?',
    options: [
      'fixed stuff',
      'Fix crash when the cart is empty',
      'Fixes the crash that happened yesterday in the cart page when the cart had nothing in it.',
      'WIP',
    ],
    correct: [1],
    explanation:
      'A short, imperative summary that says what the commit does. Details go in the body, after a blank line.',
    review: 'good-commit-messages',
  },
  {
    id: 'pariksha-i-q4',
    kind: 'codeOutput',
    prompt: 'You run `git commit` now. Which changes end up in the commit?',
    code: lines('$ git status --short', ' M app.js', 'A  notes.md', '?? todo.txt'),
    options: [
      'Only app.js',
      'Only notes.md',
      'app.js and notes.md',
      'app.js, notes.md and todo.txt',
    ],
    correct: [1],
    explanation:
      'The left column is the staging area: `A` means notes.md is staged. app.js is modified but not staged (right column), and todo.txt is untracked.',
    review: 'staging-and-committing',
  },
  {
    id: 'pariksha-i-q5',
    kind: 'single',
    prompt:
      'You add `config.local` to `.gitignore`, but Git was already tracking that file. What happens?',
    options: [
      'Git stops tracking it immediately',
      'Git keeps tracking it until you remove it from the index with `git rm --cached config.local`',
      'Git deletes the file from your disk',
      'Git refuses to commit',
    ],
    correct: [1],
    explanation:
      '`.gitignore` only affects untracked files. To stop tracking a file, run `git rm --cached <file>` and commit.',
    review: 'gitignore',
  },
  {
    id: 'pariksha-i-q6',
    kind: 'single',
    prompt: 'Which command shows the history with one line per commit?',
    options: ['git log --oneline', 'git status --short', 'git show --all', 'git history'],
    correct: [0],
    explanation: '`git log --oneline` prints a short hash and the subject line of each commit.',
    review: 'reading-history-git-log',
  },
];

const parva2: Parva = {
  id: 'snapshots-and-history',
  title: 'Snapshots and history',
  items: [
    lesson('staging-and-committing', 'Staging and committing', 9, 'hands', [
      md(
        '## Three places your files live',
        '',
        '1. **Working directory**: the files you edit.',
        '2. **Staging area** (the index): the snapshot you are preparing.',
        '3. **Repository**: committed history.',
        '',
        'Staging lets you commit part of your work: change five files, commit two now and three later.',
      ),
      sh(
        'git status',
        'git add app.js            # stage one file',
        'git add src/              # stage a folder',
        'git add -p                # choose hunks interactively',
        'git commit -m "Add login form"',
      ),
      md(
        '`git status --short` gives a compact view. The two letters are staging column then working-directory column: `M ` staged modification, ` M` unstaged modification, `A ` newly staged, `??` untracked.',
      ),
      warn(
        'Add again after editing',
        '`git add` stages the file as it is at that moment. Edit it afterwards and the new edits are not staged until you add again.',
      ),
      tip(
        'Skip the editor, keep the habit',
        '`git commit -m "message"` is fine for one-liners. Plain `git commit` opens your editor so you can write a body too.',
      ),
      check(
        'You edited `a.txt`, ran `git add a.txt`, then edited `a.txt` again and ran `git commit`. What does the commit contain?',
        [
          'Both edits',
          'Only the first edit, the one that was staged',
          'Nothing, Git asks you to stage again',
        ],
        'A commit holds what was staged. The second edit stays in the working directory until you add it.',
      ),
    ]),
    lesson('good-commit-messages', 'Writing good commit messages', 7, 'read', [
      md(
        '## Why it matters',
        '',
        'In six months, `git log` is the only explanation of why code changed. A good message saves a good half hour of archaeology.',
        '',
        '## The shape',
      ),
      file(
        'commit message',
        'text',
        'Fix crash when the cart is empty',
        '',
        'The total was computed from items[0], which is undefined for an',
        'empty cart. Return 0 early and cover it with a test.',
      ),
      md(
        '- **Subject**: about 50 characters, imperative mood ("Fix", "Add", "Remove"), no trailing full stop.',
        '- **Blank line**, then an optional **body** wrapped near 72 characters.',
        '- The body explains **why**, not what: the diff already shows what.',
        '- One logical change per commit, so it can be reviewed and reverted on its own.',
      ),
      replace(
        'If NonStop teams use a message format such as Conventional Commits (`type(scope): description`) or ticket references, describe it here with an example.',
      ),
      check(
        'Which subject line is best?',
        ['updates', 'Fixed the bug', 'Fix crash when the cart is empty', 'FIX!!! cart'],
        'Imperative, specific and short. The others say nothing about what changed.',
      ),
    ]),
    lesson('reading-history-git-log', 'Reading history with git log', 8, 'hands', [
      md('`git log` is a time machine with many lenses. Start with these:'),
      sh(
        'git log                          # full detail, newest first',
        'git log --oneline                # one line per commit',
        'git log --oneline --graph --all  # branches as a drawing',
        'git log -n 5                     # last five commits',
        'git log --author="Ada"           # by author',
        'git log -- src/app.js            # only commits touching a file',
        'git log -S"calculateTotal"       # commits that added or removed this text',
      ),
      md('Look inside a commit, or compare two points in history:'),
      sh(
        'git show a1b2c3d             # what one commit changed',
        'git diff                     # unstaged changes',
        'git diff --staged            # staged changes',
        'git diff main..feature/x     # between two branches',
      ),
      sh(
        'a1b2c3d (HEAD -> main) Fix crash when the cart is empty',
        '9f8e7d6 Add cart total',
        '5c4b3a2 Initial commit',
      ),
      note(
        'Hashes can be shortened',
        'A commit id is a long hash. Seven or so characters are enough as long as they are unique in the repository.',
      ),
      check(
        'Which command shows only the commits that touched `src/app.js`?',
        ['git log src/app.js', 'git log -- src/app.js', 'git show src/app.js'],
        'The `--` separates options from paths. It is the safe, unambiguous form.',
      ),
    ]),
    lesson('gitignore', '.gitignore', 7, 'read', [
      md(
        '## Keep generated and secret files out',
        '',
        'Dependencies, build output, editor settings and `.env` files should never be committed. List patterns in a `.gitignore` file at the repository root and commit that file so the whole team shares it.',
      ),
      file(
        '.gitignore',
        'text',
        '# dependencies',
        'node_modules/',
        '',
        '# build output',
        'dist/',
        '*.log',
        '',
        '# secrets and local config',
        '.env',
        '.env.*',
        '!.env.example',
      ),
      md(
        '- `name/` matches a folder; `*.log` matches by extension; `!` negates (re-includes).',
        '- Patterns apply to **untracked** files only. A file already committed stays tracked.',
      ),
      sh(
        'git rm --cached .env      # stop tracking, keep the file on disk',
        'git commit -m "Stop tracking .env"',
      ),
      warn(
        'A secret that was committed is compromised',
        'Removing it in a later commit does not remove it from history. Rotate the secret (create a new one and revoke the old one), then ask a maintainer about cleaning history.',
      ),
      sh('git check-ignore -v .env   # which rule ignores this file?'),
      check(
        'Which pattern ignores every `.log` file in the project?',
        ['*.log', 'log/', '!*.log'],
        '`*.log` matches by extension. `log/` matches a folder named log, and `!` re-includes files.',
      ),
    ]),
    pariksha('pariksha-i', 'Pariksha I: Snapshots and history', pariksha1Specs, 'each', 10),
  ],
};

// ---------------------------------------------------------------------------------------------
// Parva 3 · Branching
// ---------------------------------------------------------------------------------------------

const pariksha2Specs: QuestionSpec[] = [
  {
    id: 'pariksha-ii-q1',
    kind: 'single',
    prompt: 'What is a branch in Git?',
    options: [
      'A movable pointer to a commit',
      'A full copy of the project folder',
      'A backup of the repository',
      'A list of changed files',
    ],
    correct: [0],
    explanation:
      'A branch is just a small file holding a commit id. Creating one is instant because nothing is copied.',
    review: 'what-a-branch-really-is',
  },
  {
    id: 'pariksha-ii-q2',
    kind: 'single',
    prompt: 'Which command creates a branch and switches to it?',
    options: [
      'git switch -c feature/x',
      'git branch feature/x',
      'git merge feature/x',
      'git switch feature/x',
    ],
    correct: [0],
    explanation:
      '`git switch -c` creates and switches. `git branch feature/x` creates without switching; `git switch feature/x` needs the branch to exist already.',
    review: 'create-and-switch-branches',
  },
  {
    id: 'pariksha-ii-q3',
    kind: 'single',
    prompt: 'Two branches changed the same line. What does `git merge` do?',
    options: [
      'Pauses and writes both versions into the file with conflict markers',
      'Keeps the newer version and discards the other',
      'Keeps the version from the branch you are on',
      'Deletes the file',
    ],
    correct: [0],
    explanation:
      'Git never guesses between competing edits. It stops the merge and marks both versions so a person can decide.',
    review: 'resolving-merge-conflicts',
  },
  {
    id: 'pariksha-ii-q4',
    kind: 'single',
    prompt: 'When does Git fast-forward a merge?',
    options: [
      'When the target branch has no new commits since your branch was created',
      'When both branches changed different files',
      'When you pass `--force`',
      'When the branch has only one commit',
    ],
    correct: [0],
    explanation:
      'If history is a straight line, Git just moves the branch pointer forward. No merge commit is needed.',
    review: 'merging',
  },
  {
    id: 'pariksha-ii-q5',
    kind: 'single',
    prompt: 'You removed the conflict markers from the file. What next?',
    options: [
      '`git add <file>` then `git commit`',
      '`git merge --force`',
      '`git branch -d`',
      '`git push` straight away',
    ],
    correct: [0],
    explanation:
      'Adding the file tells Git the conflict is resolved. Committing completes the merge.',
    review: 'resolving-merge-conflicts',
  },
  {
    id: 'pariksha-ii-q6',
    kind: 'single',
    prompt: 'What does HEAD usually point to?',
    options: [
      'The branch you have checked out',
      'The first commit in the repository',
      'The remote repository',
      'The newest tag',
    ],
    correct: [0],
    explanation:
      'HEAD says where you are. Normally it points at a branch, which points at a commit.',
    review: 'what-a-branch-really-is',
  },
];

const parva3: Parva = {
  id: 'branching',
  title: 'Branching',
  items: [
    lesson('what-a-branch-really-is', 'What a branch really is', 7, 'read', [
      md(
        '## A branch is a sticky note on a commit',
        '',
        'Commits form a chain; each one points to its parent. A **branch** is a movable name that points at one commit. When you commit, the current branch moves forward to the new commit.',
        '',
        '**HEAD** is a pointer to where you are. Normally it points at a branch, so "the branch you have checked out" is where your next commit goes.',
      ),
      file(
        'diagram',
        'text',
        '5c4b3a2 <- 9f8e7d6 <- a1b2c3d   <- main   <- HEAD',
        '                          \\',
        '                           e4d3c2b      <- feature/x',
      ),
      md(
        'Because a branch is a pointer (a 41-byte file), creating one costs nothing. That is why Git encourages a branch for every piece of work.',
      ),
      sh(
        'git branch                 # list branches, * marks the current one',
        'git log --oneline --graph --all',
      ),
      check(
        'Creating a new branch copies all the project files.',
        ['True', 'False'],
        'False. A branch is only a pointer to a commit; no files are copied.',
      ),
    ]),
    lesson('create-and-switch-branches', 'Create and switch branches', 8, 'hands', [
      sh(
        'git switch -c feature/login-form   # create and switch',
        'git branch                         # see where you are',
        'git switch main                    # go back',
        'git switch feature/login-form      # and forth',
      ),
      md(
        '`git switch` is the modern command for changing branches. You will still see `git checkout`, which does the same and more; both work.',
        '',
        "When you switch, Git rewrites your working directory to match that branch's latest commit.",
      ),
      sh(
        'git branch -d feature/login-form   # delete a merged branch',
        'git branch -D feature/login-form   # force delete an unmerged one',
      ),
      warn(
        'Commit or stash first',
        'If you have uncommitted changes that clash with the branch you switch to, Git refuses. Commit them, or put them aside with `git stash` (covered later).',
      ),
      check(
        'You are on `main` and want to start new work on a fresh branch called `fix/typo`. Which command do you run?',
        ['git branch fix/typo', 'git switch -c fix/typo', 'git merge fix/typo'],
        '`git switch -c` creates the branch and moves you onto it. `git branch` alone leaves you on main.',
      ),
    ]),
    lesson('merging', 'Merging', 11, 'hands', [
      md(
        '## Bring work back together',
        '',
        'To merge `feature/login-form` into `main`, switch to the branch that should **receive** the changes, then merge.',
      ),
      sh('git switch main', 'git merge feature/login-form'),
      md(
        '## Two kinds of merge',
        '',
        '- **Fast-forward**: `main` has not moved since the branch started, so Git just slides the `main` pointer forward. No new commit.',
        '- **Merge commit**: both branches have new commits, so Git creates a commit with two parents that joins them.',
      ),
      sh(
        'git merge --no-ff feature/login-form   # always make a merge commit',
        'git merge --abort                      # give up a merge in progress',
      ),
      tip(
        'Update, then merge',
        'Before merging your branch, merge `main` into it first (or rebase, later). You fix conflicts on your branch, not on `main`.',
      ),
      check(
        'When can Git fast-forward a merge?',
        [
          'When the target branch has no new commits since your branch was created',
          'Only when you use `--no-ff`',
          'Only when files do not overlap',
        ],
        'If the history is a straight line, Git moves the pointer. Otherwise it needs a merge commit.',
      ),
    ]),
    lesson('resolving-merge-conflicts', 'Resolving merge conflicts', 14, 'hands', [
      md(
        '## Conflicts are normal',
        '',
        'A conflict happens when two branches changed the same lines (or one deleted a file the other edited). Git cannot know which is right, so it stops and asks you.',
      ),
      sh(
        'git merge feature/greeting',
        'CONFLICT (content): Merge conflict in hello.txt',
        'Automatic merge failed; fix conflicts and then commit the result.',
      ),
      md('Open the file. Git marked both versions:'),
      file(
        'hello.txt',
        'text',
        '<<<<<<< HEAD',
        'Hello, world',
        '=======',
        'Namaste, world',
        '>>>>>>> feature/greeting',
      ),
      md(
        '- Between `<<<<<<<` and `=======` is **your** side (the branch you are on, HEAD).',
        '- Between `=======` and `>>>>>>>` is the **incoming** side.',
        '',
        'Edit the file to the final text you want and **delete all three marker lines**. Then:',
      ),
      sh(
        'git status                # lists "both modified" files',
        'git add hello.txt',
        'git commit                # completes the merge',
      ),
      tip(
        'Practice safely',
        'Fork the `conflict-lab` practice repository, then create and resolve a few conflicts there before you meet one in real work.',
      ),
      replace(
        'The `conflict-lab` practice repository is still to be published. Add its URL here, and add any team rule for who resolves conflicts.',
      ),
      note('Bail out any time', '`git merge --abort` returns you to the state before the merge.'),
      check(
        'You have edited the file and removed the markers. What is the next step?',
        [
          '`git add hello.txt`, then `git commit`',
          '`git merge feature/greeting` again',
          '`git push --force`',
        ],
        'Adding marks the conflict resolved; committing finishes the merge.',
      ),
    ]),
    pariksha('pariksha-ii', 'Pariksha II: Branching', pariksha2Specs, 'each', 10),
  ],
};

// ---------------------------------------------------------------------------------------------
// Parva 4 · Remotes and collaboration
// ---------------------------------------------------------------------------------------------

const parva4: Parva = {
  id: 'remotes-and-collaboration',
  title: 'Remotes and collaboration',
  items: [
    lesson('remotes-clone-fetch', 'Remotes, clone and fetch', 9, 'hands', [
      md(
        '## A remote is another copy of the repository',
        '',
        'Usually it lives on a hosting service. Its conventional name is `origin`. **Clone** copies it to your machine and sets `origin` for you.',
      ),
      sh(
        'git clone https://example.com/team/project.git',
        'cd project',
        'git remote -v                 # list remotes and their URLs',
        'git branch -r                 # remote-tracking branches, e.g. origin/main',
      ),
      md(
        '**Fetch** downloads new commits and updates your *remote-tracking* branches (`origin/main`). It never changes your own branches or files, so it is always safe.',
      ),
      sh('git fetch origin', 'git log --oneline main..origin/main   # what you do not have yet'),
      check(
        'What does `git fetch` change?',
        [
          'Your current branch and working files',
          'Only your remote-tracking branches such as `origin/main`',
          'The remote repository',
        ],
        'Fetch only brings data in and moves `origin/*`. To combine it with your work, merge or rebase.',
      ),
    ]),
    lesson('push-and-pull', 'Push and pull', 8, 'hands', [
      sh(
        'git push -u origin feature/login-form   # first push; -u remembers the upstream',
        'git push                                # later pushes',
        'git pull                                # fetch + integrate into the current branch',
      ),
      md(
        '`git pull` is **fetch followed by merge** (or rebase, if configured). Pull before you start work and before you push.',
      ),
      sh(
        '! [rejected]        main -> main (non-fast-forward)',
        'hint: Updates were rejected because the tip of your current branch is behind',
        'hint: its remote counterpart.',
      ),
      md(
        'That rejection means the remote has commits you do not have. Run `git pull`, resolve any conflict, then push again.',
      ),
      warn(
        'Do not reach for --force',
        "A forced push overwrites the remote history and can erase other people's work. If you must, use `git push --force-with-lease`, which refuses when someone else pushed in the meantime.",
      ),
      check(
        'Your push is rejected as non-fast-forward. What does that mean?',
        [
          'The remote has commits you do not have yet',
          'Your branch name is invalid',
          'You have no commits to push',
        ],
        'Integrate the remote work first (pull), then push.',
      ),
    ]),
    lesson('pull-requests-at-nonstop', 'Pull requests at NonStop', 9, 'read', [
      replace(
        'This lesson describes sensible defaults. Replace it with the PR process and template your NonStop teams actually use.',
      ),
      md(
        '## What a pull request is',
        '',
        'A pull request (PR) proposes merging your branch into another, usually `main`. It is where the team reads, discusses and approves a change before it lands.',
        '',
        '## A good PR',
        '',
        '- **Small and focused**: one purpose, easy to review in under half an hour.',
        '- **Explains why**: the reviewer should not have to guess the reason.',
        '- **Shows evidence**: how you tested it; a screenshot for visible changes.',
        '- **Passes checks** before asking for review.',
      ),
      file(
        'PULL_REQUEST_TEMPLATE.md',
        'markdown',
        '## What changed',
        '',
        '## Why',
        '',
        '## How I tested it',
        '',
        '## Checklist',
        '- [ ] Tests added or updated',
        '- [ ] Docs updated if behaviour changed',
        '- [ ] No secrets or personal data',
      ),
      md(
        '## The flow',
        '',
        '1. Branch from an up-to-date `main`.',
        '2. Commit in small steps; push the branch.',
        '3. Open the PR, fill the template, request review.',
        '4. Address feedback with new commits; merge once approved and checks pass.',
        '5. Delete the branch.',
      ),
      check(
        'Which of these belong in a good pull request description?',
        ['What changed and why', 'How it was tested', 'An apology for how long the diff is'],
        'Say what, why and how it was verified. Better still, keep the diff small enough that no apology is needed.',
      ),
    ]),
    lesson('code-review-etiquette', 'Code review etiquette', 7, 'read', [
      replace(
        "Add NonStop's review expectations: who reviews, expected turnaround, and how many approvals are needed. The points below are generic defaults.",
      ),
      md(
        '## As the author',
        '',
        '- Review your own diff first; remove stray debug code.',
        '- Treat comments as feedback on the code, not on you.',
        '- Reply to every comment: change it, or explain why not.',
        '- Do not merge while a comment is unresolved.',
        '',
        '## As the reviewer',
        '',
        '- Respond promptly; a waiting PR blocks someone.',
        '- Ask questions before making demands: "What happens if this is empty?"',
        '- Say why, and suggest an alternative.',
        '- Separate must-fix from preference: prefix optional comments with `nit:`.',
        '- Say what is good. Review is also how people learn.',
      ),
      tip(
        'Reading the code',
        'Check correctness, tests, naming, readability and security, in that order of importance. Leave formatting to automated tools.',
      ),
      check(
        'A reviewer writes "This is wrong." What would make the comment more useful?',
        [
          'Explain what breaks and suggest a fix or ask a question',
          'Mark it with capital letters',
          'Leave it as it is',
        ],
        'Specific, kind comments get fixed faster than vague ones.',
      ),
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Parva 5 · Undoing things safely
// ---------------------------------------------------------------------------------------------

const parva5: Parva = {
  id: 'undoing-things-safely',
  title: 'Undoing things safely',
  items: [
    lesson('restore-and-reset', 'restore and reset', 13, 'hands', [
      md('## Undo uncommitted work: `git restore`'),
      sh(
        'git restore notes.md            # discard edits in the working directory',
        'git restore --staged notes.md   # unstage, keep the edits',
      ),
      warn(
        'Discarded edits are gone',
        '`git restore <file>` throws away uncommitted changes. They were never committed, so Git cannot bring them back.',
      ),
      md(
        '## Move a branch back: `git reset`',
        '',
        '`git reset <commit>` moves the current branch to another commit. The three modes decide what happens to your files:',
        '',
        '- `--soft`: move the branch only. Changes stay **staged**.',
        '- `--mixed` (default): move the branch and unstage. Changes stay in the **working directory**.',
        '- `--hard`: move the branch and **overwrite** the working directory. Uncommitted work is lost.',
      ),
      sh(
        'git reset --soft HEAD~1    # undo the last commit, keep everything staged',
        'git reset --hard HEAD~1    # undo it and throw the changes away',
      ),
      note(
        'Only reset what is yours',
        'Resetting rewrites history. Do it on commits you have not pushed. For pushed commits, use `git revert` (next lesson).',
      ),
      check(
        'Which command unstages a file but keeps your edits?',
        ['git restore --staged file', 'git restore file', 'git reset --hard'],
        '`git restore --staged` only touches the staging area. The other two discard edits.',
      ),
    ]),
    lesson('revert', 'revert', 6, 'hands', [
      md(
        'A pushed commit is shared history, so do not rewrite it. **`git revert`** adds a **new** commit that does the exact opposite of an earlier one. History stays intact and everyone can pull the fix.',
      ),
      sh(
        'git log --oneline',
        'git revert a1b2c3d              # creates a commit that undoes a1b2c3d',
        'git revert HEAD                 # undo the latest commit',
        'git revert -m 1 <merge-commit>  # undo a merge: keep parent 1 (the mainline)',
      ),
      tip(
        'Reset or revert?',
        'Not pushed yet: `reset` is fine. Already pushed or shared: `revert`.',
      ),
      check(
        'A buggy commit is already on the shared `main`. What is the safest way to undo it?',
        [
          'git revert <commit>',
          'git reset --hard and force push',
          'Delete the repository and re-clone',
        ],
        'Revert records the undo as a new commit and does not rewrite shared history.',
      ),
    ]),
    lesson('stash', 'stash', 7, 'hands', [
      md(
        'You are half way through a change and need to switch branches. **Stash** puts uncommitted work on a shelf.',
      ),
      sh(
        'git stash push -m "login form wip"   # shelve tracked changes',
        'git stash push -u                    # include untracked files too',
        'git switch main',
        '# ...fix something, commit, switch back...',
        'git stash list',
        'git stash pop                        # re-apply the latest stash and drop it',
        'git stash apply stash@{1}            # re-apply a specific one, keep it',
      ),
      note(
        'Stashes are local',
        'They live only in your clone and are not pushed. Do not use the stash as long-term storage; commit on a branch instead.',
      ),
      check(
        'You need to switch branches with uncommitted edits. Which is a good approach?',
        ['git stash, switch, work, switch back, git stash pop', 'Delete the files', 'git push'],
        'Stash saves the edits so you can come back to them.',
      ),
    ]),
    lesson('reflog-safety-net', 'reflog: the safety net', 7, 'hands', [
      md(
        'Git records every time `HEAD` moves: commits, resets, merges, switches. That private log is the **reflog**. It is how you find commits that no branch points to any more.',
      ),
      sh(
        'git reflog',
        'a1b2c3d HEAD@{0}: reset: moving to HEAD~2',
        '7e6f5a4 HEAD@{1}: commit: Add cart total',
        '9f8e7d6 HEAD@{2}: commit: Add cart page',
      ),
      md('You reset too far. The commit you want is `HEAD@{1}`:'),
      sh(
        'git reset --hard 7e6f5a4',
        '# or keep the current branch and just rescue it:',
        'git branch rescue 7e6f5a4',
      ),
      warn(
        'Limits of the net',
        'The reflog is local to your clone and entries expire (about 90 days by default). It only knows about **committed** work: edits that were never committed cannot be recovered.',
      ),
      check(
        'You ran `git reset --hard` and lost commits. Where do you look first?',
        ['git reflog', 'git remote -v', 'git config --list'],
        'The reflog lists where HEAD has been, including the commits you just moved away from.',
      ),
    ]),
  ],
};

// ---------------------------------------------------------------------------------------------
// Parva 6 · The NonStop team workflow
// ---------------------------------------------------------------------------------------------

const finalSpecs: QuestionSpec[] = [
  {
    id: 'pariksha-final-q1',
    kind: 'single',
    prompt: 'What is the difference between `git fetch` and `git pull`?',
    options: [
      'Fetch only downloads and updates `origin/*`; pull also merges (or rebases) into your current branch',
      'They are the same',
      'Fetch uploads your commits; pull downloads them',
      'Pull only works on `main`',
    ],
    correct: [0],
    explanation: '`git pull` is `git fetch` followed by an integration step.',
    review: 'remotes-clone-fetch',
  },
  {
    id: 'pariksha-final-q2',
    kind: 'single',
    prompt:
      'You have uncommitted edits and must switch branches to fix an urgent bug. What is a good approach?',
    options: [
      '`git stash`, switch and fix, switch back, `git stash pop`',
      '`git reset --hard`',
      '`git push --force`',
      'Copy the folder and re-clone',
    ],
    correct: [0],
    explanation: 'Stash shelves the work without committing it and gives it back later.',
    review: 'stash',
  },
  {
    id: 'pariksha-final-q3',
    kind: 'multiple',
    prompt: 'Which of these belong in a good pull request? Select all that apply.',
    options: [
      'A small, focused change',
      'A description of what changed and why',
      'Unrelated refactoring bundled in',
      'A note on how it was tested',
    ],
    correct: [0, 1, 3],
    explanation:
      'Small, explained and tested changes are easy to review. Unrelated changes make the review harder and the revert riskier.',
    review: 'pull-requests-at-nonstop',
  },
  {
    id: 'pariksha-final-q4',
    kind: 'single',
    prompt:
      'A buggy commit is already pushed to the shared `main`. What is the safest way to undo it?',
    options: [
      '`git revert <commit>` and push',
      '`git reset --hard` and force push',
      'Delete `main` and recreate it',
      'Ask everyone to re-clone',
    ],
    correct: [0],
    explanation: 'Revert adds a new commit; shared history is not rewritten.',
    review: 'revert',
  },
  {
    id: 'pariksha-final-q5',
    kind: 'trueFalse',
    prompt:
      'Edits you never committed are lost for good if you run `git reset --hard`; the reflog cannot bring them back.',
    options: TRUE_FALSE,
    correct: [0],
    explanation:
      'True. The reflog tracks commits. Work that was never committed has no entry to recover.',
    review: 'restore-and-reset',
  },
  {
    id: 'pariksha-final-q6',
    kind: 'single',
    prompt: 'You ran `git reset --hard HEAD~3` by mistake. How do you find the lost commits?',
    options: [
      '`git reflog`',
      '`git log --all` will always show them',
      '`git fetch`',
      'They are gone',
    ],
    correct: [0],
    explanation:
      'The reflog still records where HEAD was, so you can reset back or branch from it.',
    review: 'reflog-safety-net',
  },
  {
    id: 'pariksha-final-q7',
    kind: 'single',
    prompt: 'When should you NOT rebase a branch?',
    options: [
      'When its commits are already pushed and other people have based work on them',
      'When it has more than one commit',
      'When it has not been merged yet',
      'When you are offline',
    ],
    correct: [0],
    explanation:
      'Rebase creates new commits. Rewriting history others already have causes duplicate commits and painful conflicts.',
    review: 'rebase-vs-merge',
  },
  {
    id: 'pariksha-final-q8',
    kind: 'codeOutput',
    prompt: 'You created the tag below. Which command publishes it to the remote?',
    code: lines('$ git tag -a v1.4.0 -m "Release 1.4.0"'),
    options: [
      'git push origin v1.4.0',
      'git push (plain), tags are always included',
      'git fetch origin v1.4.0',
      'git merge v1.4.0',
    ],
    correct: [0],
    explanation: 'A plain `git push` does not send tags. Push the tag by name, or use `--tags`.',
    review: 'release-tags',
  },
];

const parva6: Parva = {
  id: 'nonstop-team-workflow',
  title: 'The NonStop team workflow',
  items: [
    lesson('rebase-vs-merge', 'Rebase vs merge', 11, 'read', [
      md(
        '## Two ways to combine branches',
        '',
        '**Merge** joins two histories with a merge commit. Nothing is rewritten; the history shows exactly what happened.',
        '',
        '**Rebase** replays your commits on top of another branch, as **new** commits. The history becomes a straight line.',
      ),
      sh(
        'git switch feature/login-form',
        'git rebase main              # replay my commits on top of the latest main',
        '# on conflict: fix, `git add`, then',
        'git rebase --continue        # or: git rebase --abort',
      ),
      sh('git rebase -i HEAD~3        # reorder, squash or reword the last three commits'),
      md(
        '## The golden rule',
        '',
        '**Never rebase commits that others already have.** Rebase rewrites history, so use it on your own, unpushed branch. After rebasing a branch you had already pushed, update it with `git push --force-with-lease`, and only if nobody else uses that branch.',
        '',
        '## A common team habit',
        '',
        '- Rebase your private branch onto `main` to keep it current.',
        '- Merge (or squash-merge) the pull request into `main`.',
      ),
      replace(
        'State whether NonStop teams merge, squash-merge or rebase-merge pull requests, and whether `main` must stay linear.',
      ),
      check(
        'Which is true about rebase?',
        [
          'It rewrites your commits as new ones',
          'It never changes commit ids',
          'It is safe on shared branches',
        ],
        'New parents mean new commit ids. That is why it is only safe on commits nobody else has.',
      ),
    ]),
    lesson('branch-naming-conventions', 'Branch naming and conventions', 6, 'read', [
      replace(
        'The names below are a generic default. Replace them with the convention used across NonStop teams.',
      ),
      md(
        'Good names tell people what a branch is for. A common pattern is `type/short-description`, lower-case, with hyphens:',
      ),
      file(
        'examples',
        'text',
        'feature/login-form',
        'fix/empty-cart-crash',
        'docs/update-readme',
        'chore/upgrade-dependencies',
      ),
      md(
        '- Keep the long-lived branch (`main`) always working; do not commit to it directly.',
        '- One branch per piece of work; delete it after merging.',
        '- If your team tracks tasks with ticket ids, you may include one in the name.',
        '- Pair a branch name with commit and PR titles that follow the same vocabulary.',
      ),
      check(
        'Which is the best branch name under this convention?',
        ['fix/empty-cart-crash', 'MyBranch2', 'wip', 'fix empty cart'],
        'Type prefix, lower-case, hyphens, and it says what the branch does. Spaces are not allowed in branch names.',
      ),
    ]),
    lesson('release-tags', 'Release tags', 7, 'hands', [
      replace(
        'Add how NonStop teams number releases and keep their changelog. This lesson uses semantic versioning as a default.',
      ),
      md(
        'A **tag** is a permanent name for one commit, such as the commit you shipped. Unlike a branch, it never moves. Use **annotated** tags for releases: they record who tagged it, when, and a message.',
      ),
      sh(
        'git tag -a v1.4.0 -m "Release 1.4.0"   # tag the current commit',
        'git tag -l                             # list tags',
        'git show v1.4.0                        # see the tag and its commit',
        'git push origin v1.4.0                 # tags are not pushed by plain `git push`',
        'git switch --detach v1.4.0             # look at the code as released',
      ),
      md(
        '## Semantic versions',
        '',
        '`vMAJOR.MINOR.PATCH`: bump **PATCH** for bug fixes, **MINOR** for new backwards-compatible features, **MAJOR** for breaking changes.',
        '',
        '## Release notes',
        '',
        'Keep a changelog of what each release changed and why, written for the people who will notice, not a dump of commit titles.',
      ),
      check(
        'Your code has a bug fix only, no new features. The last release was v1.4.0. The next version is...',
        ['v1.4.1', 'v1.5.0', 'v2.0.0'],
        'A backwards-compatible fix bumps the patch number.',
      ),
    ]),
    pariksha('pariksha-final', 'Final Pariksha: Git, the NonStop Way', finalSpecs, 'onPass', 10),
  ],
};

// ---------------------------------------------------------------------------------------------

const parvas: Parva[] = [parva1, parva2, parva3, parva4, parva5, parva6];

const estimatedMinutes = parvas
  .flatMap((p) => p.items)
  .reduce((sum, item) => sum + (item.type === 'lesson' ? item.minutes : 0), 0);

export const gitCourse: Course = {
  schemaVersion: 2,
  id: 'git-the-nonstop-way',
  title: 'Git, the NonStop Way',
  summary:
    'From your first commit to the team workflow: branches, pull requests, undoing and releases.',
  description: lines(
    'Git is the shared language of every engineering team at NonStop. This course takes you from "what is a commit?" to working confidently in a team: branching and merging, resolving conflicts, pull requests and review, undoing mistakes safely, and tagging releases.',
    '',
    'There are three Parikshas (checkpoints) along the way, and a certificate when you pass the final one.',
  ),
  level: 'foundation',
  cover: { theme: 'forest', glyph: 'Git' },
  outcomes: [
    'Explain what Git solves and how commits, branches and HEAD fit together',
    'Stage, commit and read history with clear commit messages',
    'Branch, merge and resolve conflicts without fear',
    'Share work through remotes and pull requests, and review code kindly',
    'Undo mistakes safely with restore, reset, revert, stash and reflog',
    'Follow a team workflow with rebase, branch naming and release tags',
  ],
  acharyaIds: [],
  acharyaNames: {},
  status: 'published',
  version: 1,
  publishedAt: null,
  // Videos are not recorded yet, so learners cannot be required to watch them.
  rules: { sequential: true, passMark: 0.7, certificate: true, requireVideoWatch: false },
  certificate: {
    title: 'Git, the NonStop Way',
    signatoryName: 'The Kulapati',
    signatoryRole: 'NonStop Academy',
  },
  parvas,
  estimatedMinutes,
};

/** Answer keys for every Pariksha: option ids. Seeded to `courses/{id}/private/answers`. */
export const gitAnswers: AnswerKeys = {
  'pariksha-i': keysOf(pariksha1Specs),
  'pariksha-ii': keysOf(pariksha2Specs),
  'pariksha-final': keysOf(finalSpecs),
};
