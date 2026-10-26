#!/usr/bin/env sh
# Creates a changelog entry with the right name and date.
#   npm run changelog:new -- "a few words about it"
set -eu
words=${1:-}
if [ -z "$words" ]; then
  echo 'Usage: npm run changelog:new -- "a few words about the change"' >&2
  exit 1
fi
slug=$(printf '%s' "$words" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-//' -e 's/-$//' | cut -c1-60 | sed 's/-$//')
if [ -z "$slug" ]; then
  echo "Those words have no letters or digits to name the file with. Use plain words." >&2
  exit 1
fi
stamp=$(TZ=Asia/Kolkata date +%Y-%m-%d-%H%M%S)
day=$(echo "$stamp" | cut -c1-10)
file="apps/web/src/changelog/entries/$stamp-$slug.ts"
cat > "$file" <<ENTRY
import type { ChangelogEntry } from '../types';

export default {
  date: '$day',
  id: 'GH-0000',
  title: 'What is now true, as the user would say it',
  area: 'PLATFORM',
  kind: 'feature',
  why: 'The reason, said out loud. Not the title again.',
  detail: ['What someone will notice.'],
} satisfies ChangelogEntry;
ENTRY
echo "$file"
