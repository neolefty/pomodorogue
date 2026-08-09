# Deploying

Pomodorogue is a **static client with no server**. `pnpm build` produces a
`dist/` of HTML, one JS bundle, and the sprite SVGs; deploying is copying that
directory somewhere a web server can read it. There is no backend, no database,
and no configuration — phase 9's optional content service
([docs/port/09-server.md](port/09-server.md)) is deferred and only exists as a
seam.

Live at <https://pomodorogue.com>, served by Caddy from `calcite`.

## How it deploys

[`scripts/deploy.sh`](../scripts/deploy.sh) is a pull-based GitOps loop, run by
cron every five minutes on the serving host. It compares `HEAD` to
`origin/main`, and on a difference resets to the remote, runs `pnpm install
--frozen-lockfile && pnpm build`, and rsyncs `dist/` into the web root.
Unchanged means it exits silently.

Nothing pushes to the server — no inbound SSH, no CI secrets, no webhook. Merge
to `main` and the site follows within five minutes.

Deploy log: `~/deploy-pomodorogue.log` on the serving host.

To deploy a branch other than `main`, set `DEPLOY_BRANCH` in the cron entry —
the same override the other services on that host use.

### Why there is a stamp file

The idle check compares the remote commit against `.deployed` — an untracked
file in the checkout holding the commit whose build actually reached the web
root — rather than against `HEAD`.

The distinction is not academic. The reset happens *before* the build, so a
build that fails leaves `HEAD` already matching the remote while the web root
still serves the old bundle. Keyed on `HEAD`, that state reads as "nothing to
do" on every subsequent run, and the site stays stale indefinitely. Keyed on
what was last published, the same failure simply retries five minutes later.

The stamp is written after `rsync` and nowhere else, so every failure path
leaves it stale on purpose.

### The script updates itself one cycle late

A cron run executes the version of `deploy.sh` that was checked out *before* it
fetched. So a commit that changes the script is deployed by the previous
version of the script.

This is normally harmless and occasionally not: the npm→pnpm migration reset
the checkout, deleting `package-lock.json`, and then the still-running old
script invoked `npm ci`, which had nothing to install from. It failed, and
because the reset had already happened, the following run picked up the new
pnpm script and recovered on its own — which is precisely the self-healing the
stamp file exists to guarantee.

Worth knowing when a change to the deploy machinery itself lands: expect the
first tick to fail and the second to succeed, and check the log rather than
assuming the first failure is permanent.

## One-time host setup

Assumes Node, pnpm, and Caddy are already present.

pnpm is not optional and not interchangeable with npm here — there is no
`package-lock.json` in the repo, so `npm ci` has nothing to install from. If the
host only has npm:

```bash
# Either install pnpm standalone...
curl -fsSL https://get.pnpm.io/install.sh | sh -
# ...or, if the host's Node ships corepack (Node <25):
corepack enable pnpm
```

Plain `corepack enable` writes its shims next to `node`, which on a
distro-packaged Node means `/usr/bin` and therefore root. `--install-directory`
keeps the whole thing in your home directory, which is how calcite is set up:

```bash
mkdir -p ~/.local/bin
corepack enable --install-directory ~/.local/bin pnpm
```

The shim reads `packageManager` from `package.json` and provisions exactly that
pnpm version, so the host tracks the repo rather than the other way around.

`deploy.sh` runs from cron, which does **not** source `.bashrc` or `.profile` —
so neither `~/.local/bin` nor the `PATH` line the standalone installer appends
is visible to it. Give the cron entry an explicit `PATH`, as calcite does:

```
*/5 * * * * PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 $HOME/source/pomodorogue/scripts/deploy.sh >> $HOME/deploy-pomodorogue.log 2>&1
```

Inline rather than a bare `PATH=` line, because a `PATH=` assignment in a
crontab applies to every job below it — fine today, a trap the moment someone
reorders the file. `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` matters because corepack
otherwise waits for a confirmation that cron can never supply, the first time a
`packageManager` bump asks it to fetch a new pnpm.

Alternatively, symlink the binary somewhere already on cron's `PATH`:

```bash
sudo ln -s "$(command -v pnpm)" /usr/local/bin/pnpm
```

The script checks for pnpm up front and logs the effective `PATH` when it is
missing, so this failure names itself in `~/deploy-pomodorogue.log`.

```bash
git clone git@github.com:neolefty/pomodorogue.git ~/source/pomodorogue

# Web root. Owned by the deploying user so deploy.sh needs no privileges;
# world-readable so Caddy can serve it.
sudo mkdir -p /var/www/pomodorogue
sudo chown "$USER:$USER" /var/www/pomodorogue
sudo chmod 755 /var/www/pomodorogue
```

The web root lives under `/var/www` rather than in the home directory because
`/home/bbaker` is mode 750 — the `caddy` user cannot traverse it.

Add to `/etc/caddy/Caddyfile`:

```caddyfile
pomodorogue.com {
	root * /var/www/pomodorogue
	encode zstd gzip
	file_server

	# Vite emits content-hashed asset filenames, so they are safe to cache
	# permanently. The entry page must not be, or a deploy never reaches
	# anyone. Caddy path matchers are exact without a wildcard, so the page
	# has to be named both ways — visitors request `/`, not `/index.html`.
	@immutable path /assets/*
	header @immutable Cache-Control "public, max-age=31536000, immutable"
	@entry path / /index.html
	header @entry Cache-Control "no-cache"
}
```

Then `sudo systemctl reload caddy`. Caddy provisions the TLS certificate on the
first request, so the apex A record must already resolve to this host.

Finally, add the cron entry:

```
*/5 * * * * $HOME/source/pomodorogue/scripts/deploy.sh >> $HOME/deploy-pomodorogue.log 2>&1
```

## No SPA fallback yet

The Caddy block above serves files and nothing else, because the game is a
single page with no router. If a phase ever introduces client-side routes, this
becomes necessary:

```caddyfile
try_files {path} /index.html
```

It is left out deliberately — with it, a typo'd asset path returns the HTML page
with a 200 instead of a 404, which is a genuinely annoying thing to debug.

## The AGPL obligation

Hosting this publicly triggers **AGPL-3.0 §13**: players must be offered the
complete corresponding source of the version they are running. The repository
being public at <https://github.com/neolefty/pomodorogue> satisfies the
availability half; the offer has to be reachable *from the running instance*,
which is why the page carries a source link. See [NOTICE.md](../NOTICE.md).

Do not remove that link, and keep it pointing at the deployed revision's source.
