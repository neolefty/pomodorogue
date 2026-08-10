/**
 * The source link, and the build stamp beside it.
 *
 * **The link is a licence obligation, not decoration.** AGPL-3.0 §13 requires a
 * hosted instance to offer its source to the people using it, and `NOTICE.md`
 * commits to discharging that from the game's own interface. It appeared in
 * `main.tsx` before there was a UI to put it in; do not drop it on the way past.
 *
 * The build stamp is the original's `[:p.build "Build: " build-id]`, which sat
 * in exactly these two places — the help modal and the tombstone. It answers
 * "is the page I'm looking at the commit I just pushed?", since deploys happen
 * on a cron tick with nothing else to say they landed. See docs/deploy.md.
 */

const BUILD_STAMP = `${__BUILD_COMMIT__} · ${__BUILD_SUBJECT__} · built ${new Date(
  __BUILD_TIME__,
).toLocaleString()}`

export function Attribution() {
  return (
    <>
      <p className="build">
        <a href="https://github.com/neolefty/pomodorogue">Source</a> (AGPL-3.0) — a port of{' '}
        <a href="https://rogule.com">Rogule</a> by Chris McCormick.
      </p>
      <p className="build">{BUILD_STAMP}</p>
    </>
  )
}
