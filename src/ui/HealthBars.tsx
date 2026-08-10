/**
 * Combat health bars. Ports `component-health-bar` and `component-health-bars`
 * from original/src/rogule/ui.cljs.
 *
 * One bar for the player, plus one for everything they traded blows with this
 * turn. `state.combatants` is cleared at the top of each turn, so the bars are
 * a view of *this* exchange, not a running tally.
 */
import { getPlayer } from '../game/entities.ts'
import { SPRITES } from '../game/sprites.ts'
import type { Entity, GameState } from '../game/types.ts'
import { Tile } from './Tile.tsx'

/**
 * One entity's bar: its face, its xp, then one square per point of max health.
 *
 * **Not memoized, deliberately.** The original memoized on the entity value and
 * got away with it because combat re-copied its combatants every round, so the
 * "value" changed with the HP. `combatants` holds stable ids now while HP moves
 * underneath them, so the same trick would render a bar frozen at full health
 * forever. There are a few dozen squares on screen in a turn-based game; the
 * memo was never what made this fast. See "Health bars" in docs/port/06-ui.md.
 */
function HealthBar({ entity }: { entity: Entity }) {
  const stats = entity.stats
  if (!stats) return null

  return (
    <div>
      <Tile sprite={entity.sprite} title={entity.name} />
      <span className="xp">
        <span>{stats.xp}</span>
      </span>
      {Array.from({ length: stats.hp.max }, (_, i) => (
        <Tile
          key={i}
          sprite={i >= stats.hp.cur ? SPRITES['white-large-square'] : SPRITES['green-square']}
          className="pop"
        />
      ))}
    </div>
  )
}

export function HealthBars({ state }: { state: GameState }) {
  const player = getPlayer(state)
  if (!player) return null

  return (
    <div id="health-bars">
      {/* Keyed on HP like the combatants' bars below, so damage replays `pop`. */}
      <HealthBar key={`player:${player.stats?.hp.cur ?? 0}`} entity={player} />
      {Object.keys(state.combatants).map((id) => {
        // Per phase 5: a combatant id can outlive the entity it names — the
        // loser of the exchange is removed, id and all — so a miss here is
        // ordinary, not a bug.
        const entity = state.entities[id]
        if (!entity) return null
        return (
          // The key carries the HP so a hit remounts the bar and replays its
          // `pop`. That fell out of value-memoization in the original; here it
          // has to be asked for. See Tile.tsx on why replays are key changes.
          <span key={`${id}:${entity.stats?.hp.cur ?? 0}`}>
            <HealthBar entity={entity} />
          </span>
        )
      })}
    </div>
  )
}
