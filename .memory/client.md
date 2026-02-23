# Client Module Split

> Tracks the decomposition of `client/web/app.js` (~14,923 lines) into ES modules.

## Current Module Layout

| Module | Lines | Description | Status |
|--------|-------|-------------|--------|
| `state.js` | 436 | Constants, runtime object, caches, DOM refs, fn registry | ✅ |
| `util.js` | 351 | WZ helpers, asset cache, draw primitives, text helpers | ✅ |
| `net.js` | 1,522 | WebSocket, remote players, interpolation, rendering | ✅ |
| `life.js` | 3,663 | Mobs, NPCs, combat, damage, reactors, map data, portals | ✅ |
| `app.js` | 8,977 | Entry point, character rendering, physics, game loop, UI | ✅ |
| **Total** | **14,949** | | |

## Remaining Extraction Targets (optional future work)

| Target | ~Lines | Description |
|--------|--------|-------------|
| `character.js` | ~2,500 | Character frame composition, face animation, equip/hair rendering |
| `physics.js` | ~800 | Player physics, foothold helpers, wall collision |
| `render.js` | ~1,500 | Core render loop, backgrounds, map layers, HUD, minimap |
| `input.js` | ~1,000 | Keyboard/mouse/touch input, keybinds, settings, chat |
| `sound.js` | ~400 | BGM, SFX, UI sounds, pools |

## Architecture

- **ES modules** — `<script type="module" src="/app.js">` in index.html (unchanged)
- **Bun.build** bundles for `--prod` mode (resolves ES imports → single file)
- **Browser** resolves imports natively in dev mode (no bundler needed)
- **state.js** is the shared foundation — imported by all other modules
- **fn registry** (`state.js` exports `fn` object): late-binding cross-module calls.
  Functions that need to be called across module boundaries are registered via
  `Object.assign(fn, { ... })` in app.js before boot. Modules call `fn.funcName()`.
- **Mutable primitives** use setter functions (e.g., `setSessionId()`, `setCurrentInvTab()`)
- **No circular imports** — dependency DAG: state → util → net → life → app

## Cross-Module Call Registry (fn.*)

Functions registered in `app.js` via `Object.assign(fn, {...})`:

### Called by net.js (28 functions)
addSystemChatMessage, appendChatLogMessage, adjustStanceForRemoteWeapon,
animateDropPickup, createDropFromServer, lootDropLocally, drawSetEffect,
findActiveSetEffect, equipSlotFromId, equipWzCategoryFromId,
getCharacterActionFrames, getEquipFrameParts, getFaceExpressionFrames,
getFaceFrameMeta, getHairFrameParts, getHeadFrameMeta, handleServerMapChange,
showDuplicateLoginOverlay, loadChairSprite, mergeMapAnchors, pickAnchorName,
zOrderForPart, playMobSfx, playUISound, requestCharacterPartImage,
spawnDamageNumber, syncServerReactors, wrapBubbleTextToWidth

### Called by life.js (11 functions)
appendChatLogMessage, findFootholdAtXNearY, findFootholdBelow,
getCharacterActionFrames, loadMap, normalizedRect, playMobSfx,
playSfx, playSfxWithFallback, requestServerMapChange, saveCharacter

## Progress Log

### 2026-02-23 Phase 1 — state.js + util.js (commit 12956a8)
- Created `state.js` (436 lines): constants, runtime, caches, DOM refs, fn registry
- Created `util.js` (351 lines): WZ helpers, asset cache, draw primitives
- app.js: 14,923 → 13,993 lines (−930)

### 2026-02-23 Phase 2 — net.js (commit 8757c14)
- Created `net.js` (1,522 lines): WebSocket, remote players, chat, interpolation
- 28 cross-module fn.* callbacks registered
- app.js: 13,993 → 12,543 lines (−1,450)

### 2026-02-23 Phase 3 — life.js (commit d5c5f56)
- Created `life.js` (3,663 lines): mob/NPC sprites, NPC scripts/dialogue, reactors,
  spatial indexing, map data parsing, backgrounds/tiles/objects/portals, damage numbers,
  mob combat & AI, mob physics, foothold helpers for mobs
- 83 exported functions + 30 exported constants/state
- 11 cross-module fn.* callbacks registered
- app.js: 12,543 → 8,977 lines (−3,566)
- **Total reduction: 14,923 → 8,977 (−5,946 lines, 40%)**
