// Commit-message rules, run by .husky/commit-msg on every commit.
//
// Conventional Commits v1.0.0, "type(scope): description", with the scope REQUIRED and taken
// from the list below. Gurukul has no ticket ids: the scope is the area of the codebase.
//   ✓ feat(search): courses appear in global search
//   ✓ chore(claude): hooks have tests
//   ✗ feat: add search            — no scope
//   ✗ Fix(web): Search works      — capitalised type and description
//   ✓ fix(web): sign in with GitHub works — capitals later in the description are fine
//   ✗ feat(frontend): …           — not an area on the list
//
// Unlike a codebase with years of free-form history, this one starts clean, so every rule is
// enforced from the first commit rather than written down and hoped for.
//
// The same type and scope lists are configured on the pull-request title check in
// .github/workflows/ci.yml (squash merges make the PR title the commit on main). Change both
// together, and the table in .claude/skills/writing-commit-messages/reference.md.

export const TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

export const SCOPES = [
  'web',
  'ui',
  'functions',
  'rules',
  'changelog',
  'search',
  'ci',
  'plan',
  'claude',
  'deps',
  'repo',
];

/** Trailers this project does not use, by the maintainer's choice. */
const FORBIDDEN_TRAILERS = /^(co-authored-by|signed-off-by|generated-by):/im;

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-trailers': ({ raw }) => [
          !FORBIDDEN_TRAILERS.test(raw ?? ''),
          'no trailers here: remove Co-Authored-By, Signed-off-by and Generated-by lines',
        ],
      },
    },
  ],
  rules: {
    'type-enum': [2, 'always', TYPES],
    'scope-enum': [2, 'always', SCOPES],
    'scope-empty': [2, 'never'],
    'scope-case': [2, 'always', 'lower-case'],
    // Rejects a capitalised start ("Add …", "Fix …") but allows proper nouns later: "add GitHub login".
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0],
    'no-trailers': [2, 'always'],
  },
};
