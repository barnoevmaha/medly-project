#!/usr/bin/env bash
#
# Refresh the full source of backend/ and frontend/ into this umbrella
# repository, so one GitHub link shows the whole project.
#
# Why this is needed at all: backend/ and frontend/ are separate git
# repositories with their own remotes, and that is what Railway and Vercel
# deploy from. Git refuses to descend into a directory that contains a .git,
# so a plain `git add` here stages a bare commit pointer — a "gitlink" — and a
# clone of this repository would get two empty directories.
#
# So each nested .git is renamed aside for the duration of the add and put
# straight back. The rename stays inside the same directory, which is a rename
# and not a delete, so nothing can be lost. A trap restores both even if the
# add fails or the script is interrupted.
#
# Deploys are untouched: this never commits or pushes in the sub-repositories.
#
# Usage:  ./tools/sync-monorepo.sh  [commit message]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SUBS=(backend frontend)
HIDDEN=".git-nested-hidden"

restore() {
  local status=$?
  for sub in "${SUBS[@]}"; do
    if [ -d "$sub/$HIDDEN" ]; then
      mv "$sub/$HIDDEN" "$sub/.git"
      echo "  restored $sub/.git"
    fi
  done
  exit "$status"
}
trap restore EXIT INT TERM

echo "==> hiding nested .git directories"
for sub in "${SUBS[@]}"; do
  [ -d "$sub/.git" ] || { echo "  $sub has no .git — skipping"; continue; }
  mv "$sub/.git" "$sub/$HIDDEN"
  echo "  hid $sub/.git"
done

echo "==> staging"
# Any gitlink left over from a previous `git add .` has to go before the real
# files can take its place at the same path.
for sub in "${SUBS[@]}"; do
  git rm --cached -q "$sub" 2>/dev/null || true
done
git add -A

echo "==> refusing to continue if a secret got staged"
if git diff --cached --name-only | grep -Eq '(^|/)\.env$|(^|/)\.env\.[^e]'; then
  echo "  ABORT: an .env file is staged" >&2
  git diff --cached --name-only | grep -E '(^|/)\.env' >&2
  exit 1
fi
echo "  none"

echo "==> staged summary"
for sub in "${SUBS[@]}"; do
  printf '  %-9s %s file(s)\n' "$sub" "$(git diff --cached --name-only -- "$sub" | wc -l | tr -d ' ')"
done

if git diff --cached --quiet; then
  echo "==> nothing changed"
else
  git commit -qm "${1:-Sync backend and frontend source into the monorepo}"
  echo "==> committed: $(git log -1 --format='%h %s')"
fi

echo "==> done. Push with: git push"
