#!/bin/bash
# GitOps deploy for the static site. Run from cron on the host that serves it:
#   */5 * * * * $HOME/source/pomodorogue/scripts/deploy.sh >> $HOME/deploy-pomodorogue.log 2>&1
#
# Pomodorogue is a pure static client — no backend, no env, no container. The
# whole deploy is "build, then swap the files Caddy serves". See docs/deploy.md.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${DEPLOY_BRANCH:-main}"
WEB_ROOT="${WEB_ROOT:-/var/www/pomodorogue}"
# Records the commit whose build actually reached the web root. Untracked, and
# deliberately outside WEB_ROOT so `rsync --delete` cannot eat it and so it is
# never served.
STAMP="${STAMP:-$REPO_DIR/.deployed}"

cd "$REPO_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

if [ ! -d "$WEB_ROOT" ]; then
    log "ERROR: $WEB_ROOT does not exist. See docs/deploy.md for the one-time setup."
    exit 1
fi

# cron gets a minimal PATH that usually excludes pnpm's install dir, so this
# fails as "command not found" long before it looks like a PATH problem. Checked
# alongside WEB_ROOT rather than at the install step: both are "the host is set
# up wrong" faults, and both should keep complaining until someone fixes them.
if ! command -v pnpm >/dev/null 2>&1; then
    log "ERROR: pnpm not on PATH (PATH=$PATH). See docs/deploy.md for the one-time setup."
    exit 1
fi

git fetch origin "$BRANCH" --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

# "Is the checkout current" and "is the site current" are different questions.
# A build that fails after the reset leaves HEAD matching the remote while the
# web root still serves the previous bundle — so keying the idle check on HEAD
# alone makes a failed deploy look like "nothing to do" forever, and the site
# stays stale until some unrelated commit happens along. Key it on what was
# last published instead, and a failure simply retries on the next tick.
DEPLOYED=$(cat "$STAMP" 2>/dev/null || true)

# Nothing new and the published bundle is current — exit silently so cron does
# not spam the log every five minutes.
if [ "$LOCAL" = "$REMOTE" ] && [ "$DEPLOYED" = "$REMOTE" ]; then
    exit 0
fi

log "Deploying ${LOCAL:0:7} -> ${REMOTE:0:7} (branch $BRANCH)"

# reset --hard, not pull: this is a deploy target, not a place anyone edits.
git reset --hard "origin/$BRANCH" --quiet

log "Installing dependencies..."
pnpm install --frozen-lockfile

log "Building..."
pnpm build

# Build into place atomically enough that a request mid-deploy still gets a
# coherent page: write the new files first, delete the stale ones after.
log "Publishing to $WEB_ROOT..."
rsync -a --delete --delay-updates dist/ "$WEB_ROOT/"

# Last, so that any failure above leaves the stamp stale and the next run retries.
echo "$REMOTE" > "$STAMP"

log "Deploy complete: ${REMOTE:0:7}"
