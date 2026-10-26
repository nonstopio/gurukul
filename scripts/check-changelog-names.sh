#!/usr/bin/env sh
# Checks the names of staged changelog entries. Run by .husky/pre-commit.
ENTRIES_DIR="apps/web/src/changelog/entries"
status=0
for f in $(git diff --cached --name-only --diff-filter=AR -- "$ENTRIES_DIR/*.ts"); do
  name=$(basename "$f")
  if ! echo "$name" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}-([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]-[a-z0-9-]+\.ts$'; then
    echo "x $f: name must be YYYY-MM-DD-HHMMSS-lowercase-words.ts (India time it was written)" >&2
    status=1
    continue
  fi
  day=$(echo "$name" | cut -c1-10)
  if ! git show ":$f" | grep -Eq "^[[:space:]]*date:[[:space:]]*['\"]$day['\"]"; then
    echo "x $f: the file name says $day but the entry's date: field does not" >&2
    status=1
  fi
  clashes=$(git ls-files -- "$ENTRIES_DIR/$(echo "$name" | cut -c1-17)-*" | grep -vx "$f" || true)
  if [ -n "$clashes" ]; then
    echo "x $f: another entry already uses that day and time: $clashes. Pick a different second." >&2
    status=1
  fi
done
if [ "$status" -ne 0 ]; then
  echo "Get the name with: TZ=Asia/Kolkata date +%Y-%m-%d-%H%M%S" >&2
fi
exit "$status"
