/**
 * The item strip along the bottom. Ports `component-inventory` from
 * original/src/rogule/ui.cljs.
 */
import type { Entity } from '../game/types.ts'
import { Tile } from './Tile.tsx'

export function Inventory({ items }: { items: readonly Entity[] }) {
  // Sorted by rarity then name, so the strip keeps a stable order as it fills
  // rather than reshuffling on every pickup (`ui.cljs:70`).
  const sorted = [...items].sort(
    (a, b) => (a.value ?? 0) - (b.value ?? 0) || a.name.localeCompare(b.name),
  )

  return (
    <div id="inventory">
      <ul>
        {sorted.map((entity) => (
          // Keyed by id, not by index as the original was: an item inserting
          // into the middle of a sorted list shifts every index after it, and
          // index keys would pop the whole tail as though it were all new.
          <li className="pop" key={entity.id}>
            <Tile sprite={entity.sprite} title={entity.name} />
          </li>
        ))}
      </ul>
    </div>
  )
}
