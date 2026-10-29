#!/usr/bin/env sh
# =================================================================================================
#  Before a push: the checks CI would fail on, scoped to what this push actually changes.
#
#  WHY HERE AS WELL AS CI
#
#  CI is the gate. This is the minute or two that saves a red pull request and a round trip.
#  A hook slow enough to resent gets bypassed with --no-verify, and a bypassed hook is worse than
#  none, so it runs only what the pushed commits touch: a docs-only push still takes seconds.
#
#  WHAT THIS PUSH CHANGES
#
#  scripts/pushed-files.sh reads the refs git is actually pushing from stdin, so
#  `git push origin other-branch` checks other-branch, not whatever is checked out. If git cannot
#  answer, everything runs: failing safe.
#
#  THE JOBS `npm run check` LEAVES TO CI
#
#  A green `check` said nothing about CI's emulator and bundle jobs, and that is where pull
#  requests kept going red on their first push: a renamed label a Playwright spec still looked
#  for, a video lesson that waited on real YouTube, a bundle over its budget. So when a push
#  touches what those jobs cover, this runs them too:
#
#    - the end-to-end specs (`npm run e2e`, about a minute) for the app, UI, schema, functions,
#      rules, seed and e2e paths (.claude/rules/end-to-end.md);
#    - the Firestore rules tests (`npm run test:rules`) for the rules and their tests;
#    - the trigger tests (`npm run test:triggers`) for the functions' src and emulator-test;
#    - the web build and its size budget (`npm run check:bundle`) for the app, UI and schema.
#
#  The emulator jobs need Java 21. Without it the push is refused rather than skipped: skipping
#  is how the red runs got through. Lighthouse and CodeQL stay CI-only.
#
#  WHAT IT DOES NOT RUN
#
#  The production build of every workspace (CI's `build` job builds them all; this builds only
#  the web app, for its budget).
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

# CI's emulator and bundle jobs, for the pushes they would judge. Paths match the e2e rule's.
app='^(apps/web/src/|packages/ui/src/|packages/schema/src/)'
e2e='^(apps/web/src/|packages/ui/src/|packages/schema/src/|firebase/functions/src/|firebase/firestore\.rules$|firebase/seed/|e2e/)'
rules='^(firebase/firestore\.rules$|firebase/rules/)'
triggers='^firebase/functions/(src|emulator-test)/'
if touches "$e2e" || touches "$triggers" || touches "$rules" || touches "$everything"; then
  command -v java >/dev/null 2>&1 ||
    fail "Java check (the emulator tests need Java 21)" "install Java 21, then git push again"
fi
if touches "$rules" || touches "$everything"; then
  echo "pre-push: Firestore rules tests"
  npm run -s test:rules >/dev/null 2>&1 || fail "Firestore rules tests" "npm run test:rules"
fi
if touches "$triggers" || touches "$everything"; then
  echo "pre-push: trigger tests against the emulator"
  npm run -s test:triggers >/dev/null 2>&1 || fail "trigger tests" "npm run test:triggers"
fi
if touches "$app" || touches "$everything"; then
  echo "pre-push: web build and bundle budget"
  npm run -s build -w @gurukul/web >/dev/null 2>&1 || fail "web build" "npm run build -w @gurukul/web"
  npm run -s check:bundle || fail "bundle budget" "npm run build -w @gurukul/web && npm run check:bundle"
fi
if touches "$e2e" || touches "$everything"; then
  echo "pre-push: end-to-end specs (about a minute)"
  npm run -s e2e >/dev/null 2>&1 || fail "end-to-end specs" "npm run e2e"
fi

echo "pre-push: ok"
