# Half Web Port Architecture Snapshot (MapleWeb / TypeScript-Client)

Date: 2026-02-17
Reference scanned (READ ONLY): `/home/k/Development/Libevm/MapleWeb`

## Why this snapshot exists
This captures the current architecture and implementation status of the half web port, focused on the project goal:
- map rendering
- character rendering
- chat/text
- sounds/music
- effects
- physics/collision
- asset loading model and constraints

---

## 1) Codebase shape (high-level)
Repository layout (current):
- `/home/k/Development/Libevm/MapleWeb/TypeScript-Client`
- no `client/` + `server/` split yet
- no asset build pipeline directory (`tools/build-assets`) yet

TypeScript client:
- ~74 TS source files under `TypeScript-Client/src`
- Build/runtime: Vite + TypeScript only (`package.json`, `vite.config.ts`, `tsconfig.json`)

Large local asset payload (served as static files):
- `TypeScript-Client/public/wz_client`: **~3.7 GB**
- ~22,182 JSON files
- biggest blobs include large `Map.wz/Obj/*`, `Sound.wz/Bgm*`, `Mob.wz/*.img.json` files (tens of MB each)

---

## 2) Runtime lifecycle and state model
Entrypoint (`src/main.ts`):
1. create `GameCanvas`
2. optional `SessionManager.initialize()` if websocket URL exists
3. init `StateManager`, `ClickManager`, `WZManager`, `Camera`, `Timer`
4. set initial state to `LoginState`
5. start `GameLoop`

Main loop (`src/Gameloop.ts`):
- fixed-step loop with lag accumulator (target 60 FPS, `msPerTick=16.67`)
- update in while-loop, render every frame
- render clears screen to black each frame

State machine:
- `StateManager` swaps `UIState`
- states:
  - `LoginState` (login/world/channel/char-select flow)
  - `MapState` (in-map play)

---

## 3) Asset loading architecture (critical)
Core loader (`src/wz-utils/WZManager.ts`):
- fetches static path: `wz_client/${filename}.json`
- auto-load behavior when a WZ path is missing from cache
- cache is an in-memory `WZNode` tree rooted at virtual `/`

Node format (`src/wz-utils/WZNode.ts`):
- parses `$...` tags + `$$` children format from decomposed WZ JSON
- supports UOL resolution (`nResolveUOL`)
- lazily converts base64 payload to:
  - `Image` via `nGetImage()`
  - `Audio` via `nGetAudio()`

Important constraints of current loader:
- no cache eviction / memory policy
- no standardized asset query API (everything is path-based)
- no server-side indexing/sharding layer
- relies on direct browser fetch of raw decomposed JSON files

---

## 4) Map/world architecture
Core world object: `src/MapleMap.ts`

### Map load flow
`MapleMap.load(id)`:
- resolves map filename:
  - login map: `UI.wz/MapLogin.img`
  - field map: `Map.wz/Map/Map{prefix}/{id}.img`
- loads and initializes:
  - BGM (`AudioManager.playBackgroundMusic(info.bgm)`)
  - footholds
  - boundaries
  - backgrounds
  - tiles
  - objects
  - portals
  - map names (`String.wz/Map.img`)
  - NPCs + monsters from `life`
- initializes `UINpcTalk`
- sets `doneLoading` after a minimum delay gate

### Map data keys actively used
Observed map sections consumed:
- `info`
- `back`
- layer groups `0..7` (`tile`, `obj`)
- `foothold`
- `portal`
- `life`
- `ladderRope`
- `seat`
- `miniMap` key exists in data but no dedicated minimap UI in this client

### Draw/update order
Update (`MapleMap.update`):
- backgrounds, objects, npcs, monsters, characters, portals, drops

Render (`MapleMap.render`):
1. back backgrounds
2. for layers `0..7`: objects, tiles, monsters, characters, npcs
3. out-of-layer entities
4. portals
5. front backgrounds
6. player character
7. drops
8. footholds (draw function currently empty/no-op)
9. NPC dialog UI

Notes:
- draw order is not yet parity-matched to C++ Stage layering
- map reactors are present in source data but not instantiated as runtime objects

---

## 5) Physics/collision architecture
Core movement physics: `src/Physics.ts`
- foothold-based movement model, derivative of NoLifeStory physics approach
- movement constants hardcoded (gravity, friction, jump, drag, etc.)
- handles:
  - walking/falling on footholds
  - jump/down-jump logic
  - rope/ladder climb modes
  - knockback

Footholds (`src/FootHold.ts`):
- parsed from map foothold tree
- linked via prev/next references
- include flags like `cantThrough`, `forbidFallDown`, wall/slope traits

Collision helpers (`src/Physics/Collision.ts`):
- AABB overlap checks
- overlap threshold percentage
- point-in-rect helpers

Additional duplicate physics:
- `DropItemPhysics` duplicates much of foothold physics logic for item drops

---

## 6) Character architecture
Main class: `src/MapleCharacter.ts`

### Composition
Character is built from WZ parts:
- body/head/face/hair
- equips mapped by item category to slots
- z ordering via `Base.wz/zmap.img`
- layer masking via `Base.wz/smap.img`

### Animation/state
- stance/frame/delay controller with optional oscillation
- dynamic stance switching for stand/walk/jump/ladder/alert/attack/dead
- face expression/frame control

### Gameplay responsibilities inside character class
- attack selection and execution
- mob proximity checks
- portal transitions
- ladder detection and climbing
- mob touch damage intake
- drop pickup
- level-up handling and indicators

Observations:
- class is very large and mixes rendering, combat, physics decisions, and gameplay rules
- many debug visuals/logs remain active (rect outlines, center points, console output)

---

## 7) Combat / mobs / drops / effects
### Combat (current)
- melee-style attack path implemented in `MapleCharacter.attack()` + `executeAttackDamage()`
- damage based on simplified stats/weapon formula
- hit feedback via damage indicators
- placeholder for hit effect creation (not fully implemented)

### Projectile subsystem
- `src/Projectile/*` exists and is implemented
- currently not wired into active attack flow (projectile creation not integrated into current attack path)

### Monsters (`src/Monster.ts`)
- spawn from map `life` entries with `type == 'm'`
- loads mob data + linked mobs (`info.link`)
- loads mob sounds from `Sound.wz/Mob.img`
- simple random movement/jump AI within min/max X bounds
- stance-based animation and hit/die flow
- drop generation on death

### Drops (`src/DropItem/*`)
- drop table source: static JSON (`Constants/Drops/db-drop-data.json`)
- randomization logic in `DropRandomizer`
- item sprite + pickup animations
- drop lifetime + cleanup

### Effects
- damage indicators implemented (`Effects/DamageIndicator.ts`)
- map-wide effect layer equivalent (like C++ `MapEffect`/`EffectLayer`) not present

---

## 8) Audio architecture
- BGM manager (`Audio/AudioManager.ts`) loads map bgm path from `Sound.wz/*`
- SFX play helper (`Audio/PlayAudio.ts`) clones nodes and gates duplicate simultaneous playback by source object
- audio data decoded from base64 at runtime through `WZNode.nGetAudio()`

---

## 9) UI architecture (current)
Key UI systems:
- Login UI (`UI/UILogin.ts`, notice/TOS components)
- Map HUD/status bar + chat input (`UI/UIMap.ts`)
- NPC dialog window (`UI/UINpcTalk.ts`)
- draggable stats and inventory menus (`UI/Menu/*`)
- click routing/hover/drag system (`UI/ClickManager.ts`)
- optional mobile joystick controls (`UI/TouchJoyStick.ts`)

Chat status:
- there is chat input in map UI, but it mainly supports local commands (`!level`, `!map`)
- no full chat channel/network sync path
- no player chat balloon system equivalent to C++ chat balloons

NPC interaction status:
- click-detection by NPC screen-space bounding box in `MapleMap.handleClick`
- opens `UINpcTalk` with placeholder text path

---

## 10) Networking architecture (current)
Session layer: `src/SessionManager.ts`
- optional websocket mode via `VITE_WEBSOCKET_URL`
- crypto handshake + Maple-style crypto implementation (`Net/Cryptography.ts`)
- packet handling currently very small:
  - inbound: `LOGIN_STATUS`, `PING`
  - outbound: `LOGIN`, `PONG`

Current mode behavior:
- if websocket env var absent, app runs in local/offline mode for UI/gameplay testing
- no field-state packet handlers for map object sync (spawns, movement, drops, buffs, combat events)

---

## 11) Implementation status summary (vs practical play loop)
Implemented (usable baseline):
- map loading/rendering (background/tile/object/portal)
- player movement with footholds/ladders/jump
- camera follow and map boundaries
- monster spawn/update/hit/death
- item drops + pickup to local inventory
- character composition and equip rendering
- BGM/SFX playback
- login UI + map HUD + stats/inventory windows
- touch controls support

Partially implemented / prototype-level:
- NPC interaction/dialog system
- ranged/projectile combat path (code exists but not integrated in active attack loop)
- websocket login path

Missing for completion target:
- standardized asset query API
- server layer for docs/index/blob endpoints
- asset transformation pipeline (sharding/indexing/blob hashing)
- robust multiplayer packet/state synchronization
- full chat + bubbles
- map effect/reactor subsystems

---

## 12) Architectural risks / hotspots
1. **Data delivery risk**: 3.7GB static WZ JSON served directly to client; no server-mediated selective API.
2. **Memory risk**: global WZ cache has no eviction.
3. **Runtime coupling**: `MapleCharacter` and `MapleMap` have broad mixed responsibilities.
4. **Parity gap risk**: network handlers are login-only; world state is mostly local simulation.
5. **Feature coverage risk**: no reactor/effect-layer/minimap/chat-bubble equivalents yet.
6. **Production-hardening risk**: many debug logs/visuals and TODOs remain in active runtime paths.

---

## 13) Immediate implications for MapleWeb completion
The half web port has a useful gameplay prototype foundation, but its data architecture is still the old browser-direct WZ-path model.

For the project goal, the first critical change remains:
1. introduce a build pipeline that converts raw WZ JSON into queryable docs/indexes/blobs
2. add a standardized server API (`/api/v1/asset`, `/api/v1/batch`, `/api/v1/blob`)
3. refactor client loading (`WZManager` replacement/adapter) to consume the standardized API

Only then can runtime parity features scale without loading/latency/memory collapse on large content.
