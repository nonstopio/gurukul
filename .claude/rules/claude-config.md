---
paths:
  - '.claude/**'
  - '**/CLAUDE.md'
---

# Claude configuration: CLAUDE.md, rules, skills and hooks

These files steer every agent session in this repository, and the repository is public. Treat
them as code: reviewed, tested where they run, and kept short.

- **Hooks are Node `.mjs` with no dependencies** (Node 22), in `.claude/hooks/`, registered in
  `.claude/settings.json` as `node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/<name>.mjs"`. Not bash
  and jq: jq is not on every contributor's machine. Shared plumbing lives in `hooks/lib.mjs`.
- **Hooks fail open.** Read the payload from stdin, always exit 0, print JSON only when there is
  something to say. A nudge says nothing on an unreadable payload; a production guard asks
  instead. Fire once per session (marker files in `os.tmpdir()`), not once per edit.
- **Each hook opens with a header comment** saying why it exists, what it does and what it does
  not do.
- **Hooks are tested** in `.claude/hooks/test/*.test.mjs` with `node:test`, spawning the hook with
  real payloads against throwaway git repositories. Cover the silent path and the speaking path.
  Run `npm run test:tooling` (CI runs it in the `quality` job).
- **A new rule, skill or hook updates the root `CLAUDE.md` map** in the same change, so the next
  reader knows it exists.
- **Rules carry `paths:`** unless they truly apply to every session. Skills follow the shape in
  `updating-claude-md`: frontmatter `description` starting "Use when…", then Overview, When to
  Use, Quick Reference, Common Mistakes, Red Flags.
- No client names, internal process or secrets in any of these files: see `open-source.md`.
