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

cd "$REPO_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

if [ ! -d "$WEB_ROOT" ]; then
    log "ERROR: $WEB_ROOT does not exist. See docs/deploy.md for the one-time setup."
    exit 1
fi

git fetch origin "$BRANCH" --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

# Nothing new, and the web root is already populated — exit silently so cron
# does not spam the log every five minutes.
if [ "$LOCAL" = "$REMOTE" ] && [ -f "$WEB_ROOT/index.html" ]; then
    exit 0
fi

log "Deploying ${LOCAL:0:7} -> ${REMOTE:0:7} (branch $BRANCH)"

# reset --hard, not pull: this is a deploy target, not a place anyone edits.
git reset --hard "origin/$BRANCH" --quiet

log "Installing dependencies..."
npm ci --no-audit --no-fund

log "Building..."
npm run build

# Build into place atomically enough that a request mid-deploy still gets a
# coherent page: write the new files first, delete the stale ones after.
log "Publishing to $WEB_ROOT..."
rsync -a --delete --delay-updates dist/ "$WEB_ROOT/"

log "Deploy complete: ${REMOTE:0:7}"
