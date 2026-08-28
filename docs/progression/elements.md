# Sixteen times a day — an element catalog

**Nothing here is decided.** This is a creative brainstorm recorded 2026-08-22, a companion to [arcs.md](arcs.md). That document proposes the *structure* — arcs of four levels with intro/escalate/shop/boss beats. This one is the *deck of elements* that structure would deal from: terrain, monster behaviors, room types, uses for loot, and — the section that matters most — mechanics only a pomodoro game can have. No code has been written against any of it.

**The one-paragraph conclusion:** the game's variety budget should come from *combinations of small elements introduced one at a time*, not from bigger numbers or more art. Rogule taught its whole vocabulary by letting you walk into things; the extension is a curriculum of walk-into-able elements, dealt one per level, so that every level has one new thing and the fifth week of play is still producing first encounters. And the single most promising design space is the one no other roguelike has: **a real 25-minute clock between plays**. Things that grow, hatch, proof, and ferment while you work turn the work interval itself into a game resource — and make the player *look forward to the next pomodoro*, which is the actual product.

---

## Operating facts

| | |
|---|---|
| Scope | Candidate game elements for depth 2+. Depth 1 stays byte-identical (hash-pinned in `generator.test.ts`). |
| Status | Brainstorm. Nothing scheduled, nothing decided. |
| Companion docs | [arcs.md](arcs.md) — arcs, beats, shop. [ingredients.md](ingredients.md) — the balance and economy levers. [findings.md](findings.md) — why the old ramp ran out. This doc fills that structure with content. |
| Input vocabulary | Four arrow keys. Every idea here must be expressible as *walking into something*. |
| Level budget | ~5 minutes of play; a level may freeze and span breaks, but should not be designed to. |
| Mechanism seams | `EntityKind` union + engine `switch` (`src/game/types.ts`), `TILE` codes (`types.ts`), `ContentProvider` (`src/game/content/types.ts`), overlay pass (unbuilt seam — see [design.md](../design.md#4-generation-is-a-base-pass-with-a-named-overlay-seam)) |
| Sprite pool | Twemoji, ~3,700 available, 32 used (`src/game/sprites.ts`). Curated, never generated — see [ingredients.md](ingredients.md#generated-sprites-and-monsters). |
| Hard constraints | `GameState` round-trips through JSON; base pass is pure in `(runSeed, depth)`; overlay may not change geometry; `src/game/` has no DOM. |

**Terms:**

- **element** — one learnable mechanic: a tile type, a monster behavior, a room type, or an item use. The unit of novelty.
- **curriculum** — the order elements are introduced across depths. One new element per level is the working rule.
- **cost class** — what an element costs to build, from the taxonomy below. Used to rank ideas by decision-per-mechanism.

---

## Two design laws every idea must pass

Stated once here so each idea below doesn't re-argue them.

**1. Every verb is a walk.** The player's entire input is four arrow keys, and every choice in the game is a position on the map ([design.md](../design.md#11-every-choice-is-a-position-on-the-map) states this as an invariant; the shop is where it bites hardest). So: planting is walking onto a plot while holding a seed. Paying a toll is walking into the troll while holding a gem. Pushing a rock is walking into the rock. Any idea that needs a menu, a "use" button, a drop command, or a target selector is a different game, and it fails here regardless of how good it is. This law is also the *cheapness* guarantee — no new input handling, no new UI surface, just new consequences for the one verb that exists.

**2. One new element per level, introduced alone before it composes.** Classic progressive unfoldment: the level that introduces ice has ice and nothing else new; three levels later ice appears *with* the pack-hunting wolves and now sliding past them is a plan. The arc structure in [arcs.md](arcs.md) gives this a natural home — the **intro beat is where the arc's new element is taught**, the escalate beat is where it composes. A curriculum also solves the pacing problem that pure random modifiers have: the player is never asked to learn two things at once, and the designer always knows what the player already knows.

The math this serves: a committed player sees up to 16 levels a day, ~80 a week. No fixed content survives that; only *combination space* does. Six themes × a dozen elements × four beats is thousands of meaningfully distinct levels from a few dozen hand-built parts.

---

## Cost taxonomy

Every idea below is tagged with what it costs. Cheap-and-deep beats expensive-and-deep; expensive-and-shallow is listed only to be argued against.

| tag | meaning | examples of the seam it uses |
|---|---|---|
| `content` | New table rows + sprites only. An afternoon. | `ContentProvider`, `gen-sprites.ts` |
| `ai-flag` | New monster movement/activation rule; a field on `MonsterTemplate`, a branch in `monsters.ts` | wolf packs, sleepers, fleeing |
| `kind` | New `EntityKind` + engine `switch` case. A day-ish each; they accrete, so ration them. | troll, plot, locked door |
| `tile` | New `TILE` code + movement/render rules. Touches pathfinding and the generator. | ice, water, hole |
| `x-break` | State that changes across work intervals; lives on `Run`, touches persistence. | farm growth, egg hatching |
| `overlay` | Needs the (unbuilt) overlay pass — depends on run history. | bones, rival monsters |

---

## The pomodoro-native mechanics

**This is the flagship section.** Every roguelike has terrain and monsters; no other roguelike has a guaranteed, known-length, real-time interval between plays during which the player is *doing something virtuous*. Time-away is a resource. Spend it.

The shared mechanism for all of these: a counter of **completed work intervals**, which `Run` can already almost express, ticked once per cycle. Everything below is "N intervals elapsed → transform" — one mechanism, many skins. All are `x-break` and all are inert in fixed mode by construction, because a fresh run has no elapsed intervals — the same trick the whole descend design uses. That counter is also the *only* form in which time may enter `src/game/`: a count, computed in `src/pomodoro/` and passed as data, never a timestamp or a clock (invariant 6's lint rule stays intact) — which makes every mechanic in this section testable by handing the game layer an integer.

### The garden — plant during a break, harvest two breaks later

A garden room (a beat variant, or a room that appears on some levels) has tilled plots 🟫. Walk onto a plot while carrying a seed 🌱 and the seed is planted — the plot becomes a seedling, and it matures after two completed work intervals into whatever the seed grows: 🌾 wheat (→ bread), 🍄 mushrooms, 🍅 **a tomato** (the pomodoro growing pomodoros is the game's whole thesis in one sprite). Come back — *if your descents bring you back past a garden, which they do if gardens recur every arc* — and walk over it to harvest.

Why this is the best idea in the document: it converts the work interval from a wall between plays into a *bridge* between them. The player plants, then **wants the next 25 minutes to pass** — and the only way through is to do the work. No other mechanic here aligns the game's incentives with the productivity tool's incentives this exactly. It also gives loot a use (seeds), gives the shop something to sell (rare seeds), and produces the game's first *investment* decision: spend the mushroom now as shop currency, or plant it and get three back tomorrow?

Design note: the simplest version needs no room persistence at all — the *plot travels with you*. A potted plant 🪴 in inventory is the garden: whatever's planted in it matures on the interval counter and is harvested at the next level's start. Zero map persistence, same emotional loop. Start there.

### Eggs hatch

An egg 🥚 is loot. Carry it for two completed work intervals and it hatches 🐣 into a companion that follows you and pecks anything adjacent. Deeper eggs hatch into better company. A companion that can die — permanently — is the cheapest attachment mechanic in games, and attachment is what makes 16-a-day sticky. (`x-break` + `ai-flag` for the follow behavior.)

### Dough proofs, wine ages

Item transformation on the same counter: dough → 🍞 bread (the heal, per [ingredients.md](ingredients.md#max-hp-should-have-a-curve)) after one interval; 🍇 grapes → 🍷 wine after three, worth triple at the shop. Wine is the interesting one: **loot that appreciates** creates a reason not to spend, which makes spending a real decision instead of a reflex. Pure `content` + the shared counter.

### The work interval is the heal

Already proposed in [ingredients.md](ingredients.md#the-work-interval-is-the-heal) ("you rest while you work"); listed here because it is the *floor* of this whole section — the minimum viable pomodoro-native mechanic, and the one to build first to prove the counter plumbing.

### The candle level

A level element rather than a cross-break one: on a candle level 🕯️, sight radius shrinks slowly as the break clock runs. Finish efficiently and you barely notice; dawdle and the dark closes in. Urgency without a hard fail — the level can still freeze and resume (the candle resets: the fiction is you lit a new one). This is the only idea in the doc that couples play to the break clock, and it should stay rare for exactly that reason. (`tile`-adjacent render work, no new tile.)

---

## Terrain

New tiles are the highest-leverage `tile`-class work because they recombine with *everything* — every monster, every theme, every beat. Ordered by bang-per-buck:

| element | sprite | rule | the decision it creates |
|---|---|---|---|
| **Ice** | 🧊 | Step onto ice and you slide until you hit something. Monsters too. | Route planning becomes a puzzle with zero new input. A slide that ends adjacent to a wolf was *your* choice. Five-minute ice rooms are a proven form (sokoban-ice). |
| **Water** | 🌊 | Impassable to you; swimmers (octopus 🐙, crocodile 🐊) cross freely. | Terrain that is cover for you and highway for them. Makes the deep-sea theme mechanically distinct, not just re-skinned. |
| **Fire / embers** | 🔥 | Passable, costs 1 HP per step. | A toll shortcut: pay HP to skip the long way. The first time the player *chooses* damage. |
| **Crumbling floor** | 🕳️ | Becomes a hole when you step off it. | One-way paths; you can see the loot but taking it changes your exits. Commitment as terrain. |
| **Tall grass** | 🌿 | Conceals whatever's on it until adjacent — items *and* monsters. | Re-uses the cover mechanic as terrain. Every step into grass is a small bet. |
| **Web** | 🕸️ | Entering costs an extra turn (stuck); spiders 🕷️ ignore it. | The spider theme's home terrain. Getting webbed with a spider two tiles away is self-inflicted tension. |
| **Locked door + key** | 🔒 🗝️ | Door is wall until you've picked up the key; walking in while holding it opens it (key consumed). | The cheapest topology puzzle there is, and the first *key item* — loot whose use is a place. `kind`, not `tile`, and worth doing early. |
| **Portal pair** | 🌀 | Step on one, emerge at the other. | Geometry games in a 5-minute box; also the generator's escape hatch for making big-feeling small levels. |

One deliberate exclusion: **a pickaxe that digs walls** (⛏️) is charming but breaks the invariant that geometry is what two players on a seed share, and it invalidates the pathfinding assumptions everything sits on. If it ever happens it is a deliberate exception; don't back into it.

## Monster behaviors and groups

All `ai-flag` class — a field on `MonsterTemplate`, a branch in `monsters.ts`, no new kinds. The current AI has exactly one behavior (activate within range, then chase), so each of these roughly doubles the space of encounters:

- **Packs.** Wolves share activation: wake one, wake all within k tiles. Groups were in Bill's prompt and this is the whole implementation — the *feel* of a pack falls out of simultaneous chase. Bees 🐝 are the small-and-many version; a boar sounder the mid-size one.
- **Guards.** Never chase; stand on a doorway or an item. Turns some fights into *purchases* — you fight exactly when what's behind the guard is worth it. (The troll toll below is a guard with a price.)
- **Sleepers.** 😴 marker; wake only when adjacent. Sneak past, or take the free first hit. The player's first stealth verb, at zero input cost.
- **The thief.** 🦝 A raccoon that runs *toward* you until adjacent, steals one item, then flees with it; kill it to get the item back. Loss-aversion chase in a five-minute box. (Small `kind` flavor on top of the flag: it needs the steal.)
- **Spawners.** A hive 🐝 or rat nest emits one monster every N turns until destroyed. The only element here that creates *turn* pressure — the longer you route around it, the worse it gets. Rations urgency into an otherwise patient game.
- **Chargers.** The boar moves two tiles when charging in a straight line. Positioning around lanes; pairs beautifully with ice.
- **Healers.** A fairy 🧚 that heals the nearest wounded monster each turn. The player's first *priority target* decision.
- **Necromancer.** 🧙 Adjacent corpses stand back up as zombies. Suddenly corpse *positions* matter — the undead theme's signature.
- **Mimic.** A cover (`potted plant`) that is secretly a monster. Use sparingly — it taxes the pickup habit, and trust once spent is hard to re-earn. Funniest as the *shop's* anti-theft device.

## Rooms with a purpose

[arcs.md](arcs.md#the-shop) establishes the shop as "a room where walking is buying." That pattern — **a room whose floor layout is an offer** — generalizes:

- **The forge.** 🔨 An anvil tile; walk your pack onto it and your weapons fuse ([fusion](ingredients.md#fusion--the-stairs-melt-your-pack-down), but *chosen at a position* rather than applied silently at the stairs). Making fusion a place answers its one weakness — that automatic melting can feel like theft. Offer it; the stairs can still enforce it.
- **The menagerie.** A caged animal; walking to the cage 🔓 frees it and it fights alongside you for this level. What's in the cage is themed, and freeing the t-rex in a machines arc is a story someone shares.
- **The hot spring.** ♨️ Full heal, once, and it's at the *far* end of the room past the monsters. Heal as position.
- **The gambling den.** 🎲 A row of face-down covers, one great, rest junk, priced per flip in gems. The shop's disreputable cousin; same mechanism, opposite risk profile.
- **The graveyard.** 🪦 Where [bones](ingredients.md#bones) surface when the overlay pass exists — your previous run's skull with part of its pack. Listed here so room-types and overlay-tenants stay one list.
- **Two shrines.** The most Rogule-flavored idea in this section: a level with a near shrine and a far shrine. Near one ends the level plainly; far one — past the worst of it — ends it with a bonus. **Choosing your exit is choosing your difficulty**, expressed purely as which way you walk. This could quietly become the answer to [what finishing early earns](../threads.md#what-does-finishing-a-level-early-earn): the fast player has break left to *attempt the far shrine*.

## Uses for loot

The economy problem ("nothing is ever consumed") wants several small sinks, not one big one. The shop is the anchor sink; these are the character sinks:

- **Feeding.** Walk into a boar while carrying a chestnut: it eats the chestnut and goes passive for the level. Bone 🦴 pacifies the wolf; cheese 🧀 the rats. Suddenly forage is *diplomacy* — every animal encounter has a fight/feed/flee triangle, and the cost of feeding is exactly the shop value you gave up. Probably the highest decision-per-mechanism idea in the whole doc: one `ai-flag` (sated) plus a `content` column (what each species eats).
- **The troll toll.** 🧌 A guard on a bridge or door; walk into it holding a gem and it takes the gem and steps aside. Fight it and keep the gem — it's a hard fight. Pay-or-fight, walkably.
- **Keys** (terrain section) — loot whose use is a door.
- **Seeds** (pomodoro section) — loot whose use is time.
- **Offerings.** Walk onto the shrine's flanking tile 🕯️ holding treasure to sacrifice it for +1 max HP. The premium sink [max HP](ingredients.md#max-hp-should-have-a-curve) wants, without waiting for the shop.
- **Liabilities.** Meat 🍖 is valuable *and* predators activate at double range while you carry it. Loot that is also a risk profile — the pack decision stops being "always pick up."

## Meta: what accumulates across runs

Sixteen-a-day needs long-arc goals that death cannot touch. Two cheap ones:

- **The bestiary.** 📒 First kill (and first death-by) of each species is recorded forever — a sticker album over a 60-species table. `Statistics` already persists; this is a `Record<string, true>` and a screen. Collection pressure is the cheapest known driver of "one more run," and it makes [expanding the monster table](ingredients.md#curate-more-twemoji) *visible* to the player instead of ambient.
- **The rival.** A named monster that, once it has killed you, appears again in later runs — same name, slightly stronger, fled-to-deeper-levels fiction. Genuinely `overlay` class (it is history), listed as the emotional payload the overlay pass would justify itself with, alongside bones.

One honest tension to flag: **lifetime unlocks vs shared seeds.** Gating the element curriculum on lifetime `levelsPlayed` (so week 3 still has first encounters) would make `ContentProvider` impure — two players on one seed would see different levels, which breaks the [shared-levels](../shared-seeds.md) contract and the determinism test. If lifetime pacing is wanted, it has to ride *outside* the base pass — e.g. the curriculum indexes on depth (pure) and lifetime stats only pick which *theme families* enter the run-seed pool at run start (impure exactly once, at the moment a seed is minted, which sharing already treats as the boundary). Decide this before building any unlock; it is the kind of thing that's trivial early and a rewrite late.

## Sprite-mining notes

A pass over untapped twemoji, grouped by the direction each suggests (extends the [theme table](ingredients.md#curate-more-twemoji) rather than repeating it):

| direction | sprites |
|---|---|
| farming / growth | 🌱 🌾 🍅 🍞 🥚 🐣 🍇 🍷 🫘 🌻 |
| locks & information | 🗝️ 🔒 🧭 🗺️ 🔦 🔮 📜 |
| terrain | 🧊 🌊 🔥 🕳️ 🌿 🕸️ 🌀 🪜 |
| tools of the room | 🔨 ⚗️ 🎲 ♨️ 🪤 ⚖️ 🛎️ |
| social monsters | 🧌 🧚 🦝 🐝 🕷️ 🐍 🦂 🐢 🧙 |
| food-as-diplomacy | 🧀 🦴 🍖 🍯 🥕 |
| companions | 🐕 🐈 🐣 🦜 |
| meta / flavor | 📒 🪦 ⏳ 🏆 🎁 |

The honey pot 🍯 deserves a special mention: it is bait (bears want it), food (heals), currency (valuable), *and* terrain (a spilled one is a web that isn't a web) — one sprite, four elements, pick one and save the rest.

## A shortlist, if five things get built

Ranked by decision-created per mechanism-built, taking [the arc structure](arcs.md) as given:

1. **Feeding** — one flag, one table column, and every animal encounter becomes a three-way choice.
2. **The traveling garden pot** — the pomodoro-native loop at its minimum viable size; proves the interval counter everything else in that section reuses.
3. **Packs + sleepers** — two `ai-flag`s that between them make the existing monster table feel twice its size.
4. **Locked door + key** — the first key item and the cheapest level-shape variety.
5. **Two shrines** — exit choice as difficulty choice, and a candidate answer to [what finishing early earns](../threads.md#what-does-finishing-a-level-early-earn) that costs one extra entity.

Ice is sixth and first among the tiles — it's the best of the terrain ideas but `tile`-class work touches pathfinding, so it waits until a theme (deep sea? machines?) wants it as a signature.
