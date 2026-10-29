# 14 · First course: Git, the NonStop Way

Course id `git-the-nonstop-way`, level Foundation, ~3 h 10 min, sequential,
pass mark 70%, certificate on. Educator: to be named. Video content to be
recorded; this outline is the authoring brief.

| Chapter | Items | Quiz |
|---|---|---|
| 1 · Why version control | What Git solves (video) · Install and configure Git (reading + code) · Your first repository (video + code) | — |
| 2 · Snapshots and history | Staging and committing · Writing good commit messages · Reading history with `git log` · `.gitignore` | **Quiz I** (6) |
| 3 · Branching | What a branch really is · Create and switch branches · Merging · Resolving merge conflicts | **Quiz II** (6) |
| 4 · Remotes and collaboration | Remotes, clone and fetch · Push and pull · Pull requests at NonStop · Code review etiquette | — |
| 5 · Undoing things safely | `restore` and `reset` · `revert` · `stash` · `reflog`: the safety net | — |
| 6 · The NonStop team workflow | Rebase vs merge · Branch naming and conventions · Release tags | **Final Quiz** (8) |

22 lessons, 3 Quizzes.

## How it teaches

The course follows one person through her first weeks: **Meera**, a new joiner, looks after
`chai-corner`, a one-file project (`menu.md`, the office tea counter's menu) with her teammates
**Arjun** and **Ravi** (her lead). Every command runs against that project, so nobody needs to know
a programming language to follow along.

- **One idea per lesson, one picture for it.** Each idea has an everyday metaphor (save points in a
  game, packing a box before shipping, a bookmark in an album, a correction printed in a
  newspaper) and, where it helps, a diagram.
- **Do, then explain.** "Try it" steps show the command and what Git prints back, then "What just
  happened" says it in plain English. Git's error messages are translated, not just quoted.
- **One way first.** The modern command (`switch`, `restore`) is taught; the older `checkout` is
  named once so learners recognise it. One name per idea: "staging area", with "index" mentioned
  once.
- **Simple English.** Short sentences, no jargon before it is explained, encouraging but not cute.
- Video lessons work without their video: the text carries the lesson until the recordings exist.

Diagrams are SVG files in `apps/web/public/courses/git/`, served by Hosting. Image blocks need an
absolute URL, so the seed builds them from `SITE_URL` (the live site by default; the end-to-end
setup passes the local preview's address).

## NonStop-specific content to supply

- Branch naming convention and PR template used across NonStop teams.
- Code review expectations (who reviews, turnaround).
- Release tagging and changelog practice.
- A practice repository (`conflict-lab`) learners can fork.

## Sample questions (Quiz II)

1. What is a branch in Git? → *A label that points at a commit, and moves forward as you commit.*
2. Which command makes a new branch called `cold-drinks` and moves you onto it? → `git switch -c cold-drinks`
3. Meera and Arjun changed the same line on two branches; what does `git merge` do? → *Stops and writes both versions into the file, between markers, for a person to choose.*
4. When can Git fast-forward a merge? → *When main has no new commits since the branch was made.*
5. Meera picked the right price and deleted the conflict markers; what next? → `git add menu.md`, then `git commit`
6. What does HEAD usually point to? → *The branch you are on right now.*

## Note on analytics in the designs

The designs show a drop-off at Chapter 4 and a hard question on fast-forward
merges. These were illustrative sample data, not findings.
