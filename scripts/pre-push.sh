#!/usr/bin/env sh
# =================================================================================================
#  Before a push: the checks CI would fail on, scoped to what this push actually changes.
#
#  WHY HERE AS WELL AS CI
#
#  CI is the gate. This is the thirty seconds that saves a red pull request and a round trip.
#  A hook slow enough to resent gets bypassed with --no-verify, and a bypassed hook is worse than
#  none, so it runs only what the pushed commits touch.
#
#  WHAT THIS PUSH CHANGES
#
#  scripts/pushed-files.sh reads the refs git is actually pushing from stdin, so
#  `git push origin other-branch` checks other-branch, not whatever is checked out. If git cannot
#  answer, everything runs: failing safe.
#
#  WHAT IT DOES NOT RUN
#
#  The Firestore rules tests (they need Java and the emulator; CI's `rules` job runs them) and the
#  production build of every workspace (CI's `build` job). Typecheck, the navigation validator and
#  the hook tests are cheap and always run.
# =================================================================================================
set -eu

if [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; then
  echo "Skipping pre-push during a rebase"
  exit 0
fi

changed=$(sh "$(dirname "$0")/pushed-files.sh")
touches() {
  [ "$changed" = "UNKNOWN" ] && return 0
  echo "$changed" | grep -Eq "$1"
}

fail() {
  echo "" >&2
  echo "x pre-push: $1 failed — push refused." >&2
  echo "  Reproduce: $2" >&2
  echo "  To bypass in an emergency (CI will still check): git push --no-verify" >&2
  exit 1
}

echo "pre-push: typecheck, navigation, hooks"
npm run -s typecheck >/dev/null 2>&1 || fail "typecheck" "npm run typecheck"
npm run -s validate:navigation -- --quiet || fail "navigation validator" "npm run validate:navigation"
if touches '^(\.claude/hooks/|scripts/|apps/web/scripts/|\.plan/tracker\.md$)'; then
  npm run -s test:tooling >/dev/null 2>&1 || fail "hook and script tests" "npm run test:tooling"
fi

# 100% coverage per workspace, only for the workspaces this push touched. A change to the root
# config or the lockfile can affect any of them, so it runs them all.
everything='^(package\.json|package-lock\.json|tsconfig\.base\.json)$'
for ws in apps/web:@gurukul/web packages/ui:@gurukul/ui firebase/functions:@gurukul/functions; do
  dir=${ws%%:*}
  name=${ws#*:}
  if touches "^$dir/" || touches "$everything"; then
    echo "pre-push: $name tests at 100% coverage"
    npm run -s coverage -w "$name" >/dev/null 2>&1 || fail "$name coverage" "npm run coverage -w $name"
  fi
done

echo "pre-push: ok"
