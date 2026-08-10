/**
 * The board. Ports `component-game`'s grid and `component-cell` from
 * original/src/rogule/ui.cljs.
 *
 * A `2 * VISIBLE_DIST` square window centred on the player, not the whole 32×32
 * map. The opacity gradient *is* the fog of war — there is no separate
 * visibility pass. Re-rendering all ~324 cells every keypress is fine and is
 * what the original does; do not add virtualization.
 */
import { entitiesAt, entitiesByPos } from '../game/entities.ts'
import { tileAt } from '../game/grid.ts'
import { distanceSq, posKey } from '../game/pos.ts'
import { SPRITES } from '../game/sprites.ts'
import type { Entity, EntityId, GameState } from '../game/types.ts'
import { PLAYER_ID, TILE } from '../game/types.ts'
import { Tile } from './Tile.tsx'

/** Half-width of the rendered window, in tiles (`ui.cljs:27-30`). */
const VISIBLE_DIST = 9
const CLEAR_DIST = 7
const VISIBLE_DIST_SQ = VISIBLE_DIST ** 2
const CLEAR_DIST_SQ = CLEAR_DIST ** 2

interface BoardProps {
  state: GameState
  /** Called when a `disposal: 'destroy'` animation finishes. */
  onAnimationEnd: (id: EntityId) => void
}

/**
 * The floor under a cell, or null where nothing is drawn.
 *
 * Only doors and walls get a sprite; rooms and corridors are the page's own
 * background, and rock is the absence of a tile. The original left a commented
 * -out brown square for corridors — not ported, since it was never enabled.
 */
function floorSprite(state: GameState, x: number, y: number) {
  switch (tileAt(state.map, x, y)) {
    case TILE.door:
      return { sprite: SPRITES['white-large-square'], title: 'door' }
    case TILE.wall:
      return { sprite: SPRITES['black-large-square'], title: 'wall' }
    default:
      return null
  }
}

function CellEntity({
  entity,
  onAnimationEnd,
}: {
  entity: Entity
  onAnimationEnd: (id: EntityId) => void
}) {
  const animation = entity.animation
  // Only a `destroy` disposal wants the callback; a bump just ends.
  const expire =
    animation?.disposal === 'destroy' ? () => onAnimationEnd(entity.id) : undefined

  return (
    <span>
      <Tile
        sprite={entity.sprite}
        title={entity.name}
        className={animation?.name}
        onAnimationEnd={expire}
      />
      {/* The number over a monster's head is the most damage it can deal.
          Corpses and the player don't get one (`ui.cljs:66`). */}
      {entity.stats && !entity.dead && entity.id !== PLAYER_ID && (
        <span className="stat">{entity.stats.xp}</span>
      )}
    </span>
  )
}

function Cell({
  state,
  index,
  x,
  y,
  opacity,
  onAnimationEnd,
}: {
  state: GameState
  index: ReturnType<typeof entitiesByPos>
  x: number
  y: number
  opacity: number
  onAnimationEnd: (id: EntityId) => void
}) {
  const floor = opacity > 0 ? floorSprite(state, x, y) : null

  return (
    <span className="grid" style={{ opacity }}>
      {floor && <Tile sprite={floor.sprite} title={floor.title} />}
      {/*
        Entities render even in the dark. They are invisible at opacity 0, but
        their animations still run and still fire `animationend` — which is what
        removes spent smoke puffs and collision markers. Skipping them here
        would leak every effect that expired off-screen.

        `entitiesAt` returns them in layer order with corpses below the living,
        so items sit on top of the body they were dropped by. Don't re-sort.
      */}
      {entitiesAt(index, posKey(x, y)).map((entity) => (
        // `frame` in the key is the animation replay: a repeated bump bumps the
        // frame, the key changes, the element remounts and the CSS restarts.
        <CellEntity
          key={`${entity.id}:${entity.animation?.frame ?? 0}`}
          entity={entity}
          onAnimationEnd={onAnimationEnd}
        />
      ))}
    </span>
  )
}

export function Board({ state, onAnimationEnd }: BoardProps) {
  const player = state.entities[PLAYER_ID]
  if (!player) return null

  const index = entitiesByPos(state.entities)
  const [px, py] = player.pos
  const rows = []

  for (let y = py - VISIBLE_DIST; y < py + VISIBLE_DIST; y++) {
    const cells = []
    for (let x = px - VISIBLE_DIST; x < px + VISIBLE_DIST; x++) {
      // Squared distances throughout, so nothing needs a `sqrt` (`ui.cljs:153`).
      const dist = distanceSq(player.pos, [x, y])
      // The original also passed this opacity down to each entity's own tile,
      // compounding it to 0.5625 in the dim ring. Applied once here instead,
      // which is what the ring is documented to be.
      const opacity = dist > VISIBLE_DIST_SQ ? 0 : dist > CLEAR_DIST_SQ ? 0.75 : 1
      cells.push(
        <Cell
          key={x}
          state={state}
          index={index}
          x={x}
          y={y}
          opacity={opacity}
          onAnimationEnd={onAnimationEnd}
        />,
      )
    }
    rows.push(
      <div className="row" key={y}>
        {cells}
      </div>,
    )
  }

  return <div>{rows}</div>
}
