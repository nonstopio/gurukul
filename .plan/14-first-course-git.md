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

## NonStop-specific content to supply

- Branch naming convention and PR template used across NonStop teams.
- Code review expectations (who reviews, turnaround).
- Release tagging and changelog practice.
- A practice repository (`conflict-lab`) learners can fork.

## Sample questions (Quiz II)

1. What is a branch in Git? → *A movable pointer to a commit.*
2. Which command creates a branch and switches to it? → `git switch -c feature/x`
3. Two branches changed the same line; what does `git merge` do? → *Pauses and writes both versions with conflict markers.*
4. When does Git fast-forward? → *When the target branch has no new commits since your branch was created.*
5. You removed the conflict markers; what next? → `git add <file>` then `git commit`
6. What does HEAD usually point to? → *The branch you have checked out.*

## Note on analytics in the designs

The designs show a drop-off at Chapter 4 and a hard question on fast-forward
merges. These were illustrative sample data, not findings.
