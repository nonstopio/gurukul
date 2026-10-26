#!/usr/bin/env sh
# Prints the files changed by the commits a push is about to send, one per line, or the single
# line UNKNOWN when git cannot say (then the caller runs everything: failing safe).
#
# Reads git's pre-push stdin: "<local ref> <local sha> <remote ref> <remote sha>" per ref.
#   - an existing remote branch: the commits in <remote sha>..<local sha>;
#   - a new remote branch: the commits no remote has yet (<local sha> --not --remotes);
#   - a deleted branch (local sha all zeros): nothing.
# With no stdin (run by hand), it falls back to HEAD --not --remotes.
# First-parent, a merge counted as its diff against its first parent, so merging main into a
# branch does not count main's own work as this push's.
set -u
zero=0000000000000000000000000000000000000000

files() {
  git log --first-parent -m --name-only --format= "$@" 2>/dev/null || echo UNKNOWN
}

out=""
seen=0
if [ ! -t 0 ]; then
  while read -r _lref lsha _rref rsha; do
    [ -n "${lsha:-}" ] || continue
    seen=1
    [ "$lsha" = "$zero" ] && continue
    if [ "$rsha" = "$zero" ]; then
      out="$out
$(files "$lsha" --not --remotes)"
    else
      out="$out
$(files "$rsha..$lsha")"
    fi
  done
fi
if [ "$seen" -eq 0 ]; then
  out=$(files HEAD --not --remotes)
fi

if echo "$out" | grep -qx UNKNOWN; then
  echo UNKNOWN
else
  echo "$out" | grep -v '^$' | sort -u
fi
