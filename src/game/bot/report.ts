/**
 * Renders a deep run as the per-depth table docs/progression/findings.md asks
 * for. Pure string formatting, so the test and the script print the same
 * thing and nothing here needs a console.
 *
 * Read it, do not tune toward it: see the header of `harness.ts`.
 */
import type { DepthRecord } from './harness.ts'
import { runEnding } from './harness.ts'

/** A monster mix as `rat×2 bat ghost×3`, preserving table order. */
function mix(names: string[]): string {
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  return [...counts].map(([name, n]) => (n > 1 ? `${name}×${n}` : name)).join(' ')
}

const COLUMNS: { title: string; cell: (r: DepthRecord) => string; align: 'left' | 'right' }[] = [
  { title: 'depth', cell: (r) => String(r.depth), align: 'right' },
  { title: 'outcome', cell: (r) => r.outcome, align: 'left' },
  { title: 'turns', cell: (r) => String(r.turns), align: 'right' },
  { title: 'hp', cell: (r) => `${r.hpStart}→${r.hpEnd}/${r.hpMax}`, align: 'right' },
  { title: 'dmg', cell: (r) => String(r.damageTaken), align: 'right' },
  { title: 'hits', cell: (r) => String(r.hitsTaken), align: 'right' },
  { title: 'armour', cell: (r) => String(r.armour), align: 'right' },
  { title: 'weapons', cell: (r) => String(r.weapons), align: 'right' },
  { title: 'xp', cell: (r) => String(r.xp), align: 'right' },
  { title: 'kills', cell: (r) => String(r.kills), align: 'right' },
  { title: 'pack', cell: (r) => String(r.items), align: 'right' },
  // Armour at or above the level's hardest possible blow is immunity to it.
  { title: 'maxhit', cell: (r) => `${r.maxHit}${r.armour >= r.maxHit ? '*' : ''}`, align: 'right' },
  { title: 'monsters', cell: (r) => mix(r.monsters), align: 'left' },
]

/** The first depth at which armour covers the level's hardest blow, or null. */
export const firstImmuneDepth = (records: DepthRecord[]): number | null =>
  records.find((r) => r.armour >= r.maxHit)?.depth ?? null

/** Total turns, so the sweep can be compared with a break at one move a second. */
const totalTurns = (records: DepthRecord[]): number => records.reduce((n, r) => n + r.turns, 0)

export function formatDepthTable(title: string, records: DepthRecord[]): string {
  const rows = records.map((r) => COLUMNS.map((c) => c.cell(r)))
  const widths = COLUMNS.map((c, i) =>
    Math.max(c.title.length, ...rows.map((row) => row[i]!.length)),
  )
  const line = (cells: string[]): string =>
    cells
      .map((cell, i) =>
        COLUMNS[i]!.align === 'right' ? cell.padStart(widths[i]!) : cell.padEnd(widths[i]!),
      )
      .join('  ')
      .trimEnd()

  const ending = runEnding(records)
  const immune = firstImmuneDepth(records)
  const summary = [
    `${ending.outcome} at depth ${ending.depth}`,
    `${totalTurns(records)} turns in all (${(totalTurns(records) / 60).toFixed(0)} min at one move a second)`,
    immune === null
      ? 'never immune to a level'
      : `immune to the level from depth ${immune} (* marks armour ≥ maxhit)`,
  ].join('; ')

  return [
    title,
    line(COLUMNS.map((c) => c.title)),
    line(widths.map((w) => '-'.repeat(w))),
    ...rows.map(line),
    summary,
  ].join('\n')
}
