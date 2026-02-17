# C++ Port Architecture Snapshot (MapleStory-Client)

Date: 2026-02-17
Reference scanned (READ ONLY): `/home/k/Development/Libevm/MapleStory-Client`

> Note: the real path is `MapleStory-Client` (capital **S**), while older notes may mention `Maplestory-Client`.

## Why this snapshot exists
This captures the C++ client architecture relevant to the web completion goal:
- map rendering
- character rendering
- chat bubbles/text
- sounds/music
- effects
- physics/collision
- asset loading patterns that must be supported by the TS web pipeline/API

---

## 1) Codebase shape (high-level)
- ~514 `.cpp/.h` files
- Major modules:
  - `Gameplay/` (Stage, map systems, physics, combat)
  - `Character/` (player, stats, look/composition, inventory)
  - `Graphics/` (OpenGL, texture atlas, text, animation)
  - `Audio/` (BASS, SFX/BGM)
  - `IO/` (window, UI states, UI components)
  - `Net/` (session, packet parsing/dispatch, handlers)
  - `Data/` (item/skill/equip/weapon/bullet caches)
  - `Util/` (NX loading, helpers)

Key entrypoints:
- `MapleStory.cpp`
- `Gameplay/Stage.{h,cpp}`
- `Gameplay/Physics/*`
- `Gameplay/MapleMap/*`
- `Character/Look/*`

---

## 2) Runtime lifecycle (important)
From `MapleStory.cpp`:
1. `Session::init()`
2. `NxFiles::init()` (when `USE_NX`)
3. `Window::init()`
4. `Sound::init()`, `Music::init()`
5. `Char::init()`, `DamageNumber::init()`, `MapPortals::init()`, `Stage::init()`, `UI::init()`

Main loop model:
- fixed timestep (`Constants::TIMESTEP = 8` ms)
- update runs possibly multiple times per frame
- draw interpolates with `alpha = accumulator / timestep`

Update order:
- window events/update
- stage update
- UI update
- network read

Draw order:
- stage draw
- UI draw

Implication for web port: keep fixed-step simulation + interpolated rendering to preserve motion/physics feel.

---

## 3) Core scene architecture: `Stage`
`Stage` is the world orchestrator (`Gameplay/Stage.h`):
- camera
- physics
- player
- map containers:
  - `MapInfo`
  - `MapTilesObjs`
  - `MapBackgrounds`
  - `MapPortals`
  - `MapReactors`
  - `MapNpcs`
  - `MapChars`
  - `MapMobs`
  - `MapDrops`
  - `MapEffect`
- `Combat`

### Map load path
`Stage::load_map(mapid)` builds scene directly from NX nodes:
- map source: `Map002/Map/Map{prefix}/{mapId}.img`
- tiles/objects: `MapTilesObjs(src)`
- backgrounds: `MapBackgrounds(src["back"])`
- physics: `Physics(src["foothold"])`
- map info: `MapInfo(src, walls, borders)`
- portals: `MapPortals(src["portal"], mapid)`

`Stage::respawn(portalid)`:
- BGM from `MapInfo`
- spawn from portal + foothold y-below
- camera bounds from map walls/borders

### Draw layering
`Stage::draw` order:
1. backgrounds (back)
2. loop layers 0..7:
   - tiles/objs
   - reactors
   - npcs
   - mobs
   - other chars
   - player
   - drops
3. combat overlays
4. portals
5. foreground backgrounds
6. map effect

Implication: web renderer should mirror this pass order to avoid depth artifacts.

---

## 4) Physics + collision architecture
Files: `Gameplay/Physics/*`, `Character/PlayerStates.*`

Core types:
- `PhysicsObject` (position/speed/forces/state flags)
- `Foothold` + `FootholdTree` (platform graph + wall/edge/border limits)
- `Physics` (movement integrator by type: NORMAL/FLYING/SWIMMING/FIXATED)

Important constants (`Physics.cpp`):
- gravity/friction/slope/slip values are hardcoded and gameplay-critical

Behavior model:
- foothold id/layer updated from current position
- movement is clamped against walls, edges, and map borders
- ladders/ropes/seats handled via `MapInfo` seat+ladderRope data
- player movement state machine in `PlayerStates.cpp` controls force application and transitions

Implication: for playable web parity, foothold parsing + limit movement + state transitions are non-negotiable.

---

## 5) Map rendering data model
### Scene pieces read from map doc
Observed map keys used by runtime:
- `info` (bgm, swim, VR bounds, etc.)
- `back` (backgrounds/foregrounds)
- `tile`
- `obj`
- `foothold`
- `portal`
- `seat`
- `ladderRope`
- `miniMap`
- `life` (used by helpers/UI)

### Cross-asset lookups
- Tile uses `Map/Tile/<tileset>.img/...`
- Obj uses `Map/Obj/<oS>.img/<l0>/<l1>/<l2>`
- Background uses `Map001/Back/<bS>.img/(ani|back)/<no>`
- Portal animations from `Map/MapHelper.img/portal/game/...`

### Outlink behavior to preserve
- Tile and Texture resolve `_outlink` paths (notably in map assets)
- This must be handled in preprocessing or query resolution.

---

## 6) Character rendering architecture
Files: `Character/Char.*`, `Character/Look/*`

Character = composition of:
- `Body`
- `Hair`
- `Face`
- `CharEquips` (many clothing pieces)
- effects/afterimage/pets/name/chat balloon

`CharLook` controls:
- stance/expression/action/frame interpolation
- attack animation selection (weapon-dependent)
- layered draw order (many layer-specific passes)

Data sources:
- `Character/*.img` for body/hair/face/clothing/weapon visuals
- `String/Eqp.img/...` for display names

Important cache behavior:
- look parts are cached in static maps (hair/face/body/clothing)
- no eviction strategy in C++ implementation

Implication: web asset API should support entity+section retrieval that aligns with this decomposition:
- body draw info
- per-stance frame parts
- equip layers/anchors

---

## 7) Combat/effects/audio architecture
### Combat
Files: `Gameplay/Combat/*`
- `Combat` queues attack results, bullet effects, damage effects
- `Skill` composes behavior via strategy-like components:
  - action
  - bullet
  - use effect
  - hit effect
  - sound
- damage numbers and hit effects are time-staged

### Effects
- `EffectLayer` stores z-indexed transient animations
- `MapEffect` supports map-wide scripted effects (`Map002/Effect.img` path)

### Audio
Files: `Audio/Audio.*`
- SFX preloaded from `Sound/UI.img`, `Sound/Game.img`, `Sound/Item.img`
- BGM streamed from `Sound002` via resolved path
- `MapInfo` converts map `bgm` to `<img>/<track>` form

Implication for web:
- keep split between short SFX and longer BGM streaming
- model effect timelines; do not treat all effects as static sprites

---

## 8) Chat/text/UI architecture (relevant pieces)
- Chat balloons: `IO/Components/ChatBalloon.*`
- Chat UI and input: `IO/UITypes/UIChatBar.*`
- Text engine: `Graphics/Text.*` + `Graphics/GraphicsGL.*`

Notable:
- chat bubbles render above character with timed expiry
- text supports formatting tokens but many tags are TODO/unimplemented

Implication: minimal web parity can implement bubble + plain formatted text subset first.

---

## 9) Network/state synchronization model (what world state changes expect)
Files:
- `Net/Session.*`
- `Net/PacketSwitch.*`
- `Net/Handlers/*`

Pattern:
- packet opcode -> handler -> mutate `Stage`/`Player`/UI state
- spawn queues for npcs/mobs/chars/drops/reactors
- `SetFieldHandler` performs map transition + player bootstrap

World state events to mirror in web runtime architecture:
- map change + portal spawn
- spawn/remove/move npc/mob/char
- drop spawn/remove
- buffs/cooldowns/stats updates
- chat received -> bubble + chat log

---

## 10) Asset namespaces actually used (from code scan)
Most frequent NX roots referenced:
- `UI`
- `String`
- `Map`, `Map001`, `Map002`
- `Character`
- `Item`
- `Skill`
- `Sound`, `Sound002`
- `Mob`, `Npc`, `Reactor`, `Effect`

This matches the planned web API namespaces (`maps`, `characters`, `mobs`, `npcs`, `effects`, `audio`, `ui`) and confirms they are the right first-class groups.

---

## 11) Data access patterns crucial for pipeline/API design
The C++ client frequently performs:
- id -> canonical path conversion (e.g., zero-padded map/mob ids)
- nested subtree fetches for tiny sections
- dynamic cross-links (`_outlink` / `link`)
- static caching of decoded entities (no eviction)

For web port, transformed docs should favor:
1. **per-entity docs** (`map/<id>`, `mob/<id>`, `npc/<id>`, `skill/<id>`, etc.)
2. **section docs** for heavy parts:
   - map: `meta`, `background`, `tiles`, `objects`, `footholds`, `portals`, `minimap`
   - mob: `info`, `animations`, `sounds`
   - character assets: `body`, `hair`, `face`, `equip layers`, `draw anchors`
3. **explicit reference fields** for links/outlinks
4. **hash-addressed blobs** for repeated bitmaps/audio/animation frame payloads

---

## 12) High-impact gaps / caveats (from TODOs + behavior)
- WZ path is effectively unimplemented; NX is the real production path
- text formatting tags are partly TODO
- some packet fields and edge cases are TODO/unknown
- reactor/mob edge behaviors have TODOs
- there are known data quirks (string/map path oddities)

For web milestone planning: prioritize stable playable map loop over full feature parity.

---

## 13) What this means for MapleWeb next
For our goal, the C++ architecture suggests this practical order:
1. Implement **Stage-like world composition** in TS
2. Implement **map-first loading** with sections matching C++ map readers
3. Implement **foothold physics + player state machine**
4. Implement **character composition and layer ordering**
5. Implement **chat bubble + text + audio hooks**
6. Implement **combat/effect timelines** incrementally

This snapshot should be treated as the C++ reference blueprint for behavior and data boundaries, not as a 1:1 implementation mandate.
