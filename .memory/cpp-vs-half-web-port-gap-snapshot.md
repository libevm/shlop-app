# C++ vs Half Web Port Gap Snapshot

Date: 2026-02-17
Compared snapshots:
- C++ reference: `.memory/cpp-port-architecture-snapshot.md`
- TS half port: `.memory/half-web-port-architecture-snapshot.md`

Scope for this gap analysis:
- what exists in C++ gameplay architecture
- what exists in current TypeScript half port
- what blocks the project goal (queryable assets + playable systems)

---

## 1) Executive summary
The half web port already has a functional local gameplay prototype (map load, movement, mobs, damage, drops, UI), but the biggest gap is not one rendering class or one gameplay feature:

**The largest blocker is data architecture**.

Current TS runtime still directly fetches raw WZ-derived JSON files from static storage (`public/wz_client`) through path-based `WZManager.get(...)`, with no standardized query API and no server-side indexing/sharding.

This directly conflicts with the project goal in `.memory/game-design.md`:
- avoid monolithic/multi-GB loading patterns
- request only needed data sections
- standardize endpoints and schemas

---

## 2) Gap matrix (C++ reference vs half web port)

### A) Core world orchestration
**C++:** `Stage` central orchestrator with explicit subsystems (map info, tiles/objs, portals, reactors, npcs, mobs, chars, drops, effects, combat, physics).

**TS half port:** `MapleMap` + `MapState` + `MyCharacter` split responsibilities; arrays for monsters/npcs/chars/drops; no reactor/effect manager equivalent.

**Gap:** No single Stage-equivalent with clean subsystem boundaries; runtime concerns are spread across large classes.

**Priority:** High (maintainability + packet-driven sync readiness).

---

### B) Asset loading and data access
**C++:** NX node access with stable namespaces and internal caching.

**TS half port:** direct static fetch of `wz_client/<path>.json`; in-browser `WZNode` tree cache; UOL resolution; no query API; no section docs/index/blobs.

**Gap:** Missing entire standardized asset API/data pipeline target.

**Priority:** **Critical / P0**.

---

### C) Map rendering and draw layering
**C++:** strict layered draw order including reactors, combat overlays, map effects.

**TS half port:** map backgrounds/tiles/objects/portals/npcs/mobs/player/drops rendered, but layering differs and reactors/effect layer are missing.

**Gap:** partial parity; ordering and subsystem completeness differ.

**Priority:** Medium-High.

---

### D) Character rendering composition
**C++:** robust `CharLook` composition with body/hair/face/equips, layered anchors, stance/expression/action control.

**TS half port:** strong partial implementation using `zmap/smap`, body/face/hair/equips composition in `MapleCharacter`.

**Gap:** architecture exists, but concentrated in one large class and lacks broader character ecosystem (other players, pet systems, full effects).

**Priority:** Medium.

---

### E) Physics and collision
**C++:** foothold physics + state machine tightly integrated with map bounds/walls and movement types.

**TS half port:** foothold physics is implemented and usable (movement, jump/down-jump, ladders, collisions), plus duplicate drop physics.

**Gap:** good baseline, but still less structured and missing some C++ edge handling and movement-state modularity.

**Priority:** Medium (playability mostly works already).

---

### F) Combat/effects
**C++:** combat orchestrator with skill/action/bullet/sound/effect strategy composition and timed queues.

**TS half port:** direct attack logic in `MapleCharacter`, monster hit/death, damage indicators, drops; projectile system exists but is not integrated in active attack path; hit/map effects mostly placeholder.

**Gap:** no combat orchestration layer; skill system/effect timelines incomplete.

**Priority:** High.

---

### G) Audio
**C++:** clear BGM/SFX split, stream-like behavior, map-driven BGM.

**TS half port:** BGM and SFX both present via base64-decoded HTMLAudio; map BGM works.

**Gap:** good baseline; mostly optimization/robustness concerns.

**Priority:** Low-Medium.

---

### H) UI/chat
**C++:** mature UI state system with extensive UI types (chat bar, chat balloons, minimap, etc.).

**TS half port:** login flow UI, HUD, inventory/stats menus, NPC talk window, command input, touch joystick.

**Gap:** no full chat pipeline/bubbles/minimap parity; many TODOs in NPC dialog behavior.

**Priority:** Medium.

---

### I) Networking and state synchronization
**C++:** broad opcode handler matrix mutating world/UI/player state.

**TS half port:** websocket + crypto exists, but packet handling currently limited to login status and ping/pong.

**Gap:** field/gameplay packet ecosystem missing (spawn/move/remove/combat/stats/inventory/buffs/chat).

**Priority:** **Critical / P0-P1** for multiplayer parity.

---

## 3) Project-goal gaps (from `.memory/game-design.md`)

### Deliverable gap 1: Repository structure
Target: `client/`, `server/`, `tools/build-assets/`

Current: single `TypeScript-Client` app + static assets.

Status: **Not started**.

---

### Deliverable gap 2: Asset transformation pipeline
Target: transform raw decomposed WZ JSON into queryable docs/index/blobs.

Current: no build-assets pipeline; browser fetches raw `.img.json` files.

Status: **Not started**.

---

### Deliverable gap 3: Standardized asset API
Target endpoints:
- `GET /api/v1/asset/:type/:id`
- `GET /api/v1/asset/:type/:id/:section`
- `POST /api/v1/batch`
- `GET /api/v1/blob/:hash`

Current: no server API; only static file hosting + path-based fetch.

Status: **Not started**.

---

### Deliverable gap 4: Client loader refactor
Target: stable type/id/section calls with lazy dependency fetch and cache policy.

Current: `WZManager.get(thePath)` with dynamic path strings and in-memory tree cache.

Status: **Not started**.

---

### Deliverable gap 5: Runtime feature parity scope
- map rendering: partial/working
- character rendering: partial/working
- chat bubbles/text: partial (input exists, bubble parity missing)
- sounds/music: partial/working
- effects: partial (damage indicators yes, broader effect systems no)
- physics/collision: partial/working

Status: **In progress** overall, but blocked by data/API architecture for scalable completion.

---

## 4) Recommended milestone order (updated from gap reality)

### M1 (immediate): Data/API contract and migration scaffold
1. Lock canonical asset schemas for map/mob/npc/character/effect/audio/ui
2. Define section boundaries for heavy entities (e.g., `map: meta/background/tiles/objects/footholds/portals`)
3. Introduce repository split:
   - `client/` (existing TS runtime migrated)
   - `server/` (asset API)
   - `tools/build-assets/` (transformer)

### M2: Build-assets pipeline (minimum viable)
1. Read raw WZ JSON dataset
2. Emit normalized docs and index files
3. Support `link/_outlink/UOL` normalization in transformed references
4. Emit hash-addressed blobs for large repeated payloads

### M3: Server API v1
1. Implement asset + section + batch + blob endpoints
2. Add cache headers and content-hash strategy
3. Add validation/error shapes

### M4: Client loader replacement
1. Replace direct `WZManager` fetch path assumptions with API-backed loader
2. Keep compatibility adapter for runtime migration safety
3. Add in-memory LRU-ish policy for docs and decoded media

### M5: Runtime architecture hardening
1. Introduce Stage-like orchestration boundaries (map systems, combat, effects, entities)
2. Extract combat orchestration from giant character class
3. Normalize entity pools (OID-like keys) for packet sync readiness

### M6: Networking and feature completion
1. Expand packet handler coverage (field/spawn/move/combat/chat/stats/inventory)
2. Add chat bubbles/log flow
3. Add map effects/reactors/minimap as needed by goal scope

---

## 5) High-confidence priorities for next implementation pass
1. **P0:** Start pipeline + server API (without this, web client remains tied to raw giant files).
2. **P0:** Define and freeze asset query schema to prevent rework.
3. **P1:** Migrate client loading to API-backed section fetches map-first.
4. **P1:** Refactor world/combat architecture for packet-driven state.
5. **P2:** Fill gameplay/UI parity gaps (chat bubbles, effects, reactors, minimap, richer networking).

---

## 6) Bottom line
The half web port is a solid prototype-level runtime and a good behavior reference, but it is **not yet on the target data architecture**.

For this project, the fastest path to completion is:
- prioritize data/query architecture first,
- then lift existing runtime systems onto that foundation,
- then close parity gaps incrementally.
