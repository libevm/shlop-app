# Client Module Split

> Tracks the decomposition of `client/web/app.js` (~14,923 lines) into ES modules.

## Final Module Layout (12 modules)

| Module | Lines | Description |
|--------|-------|-------------|
| `state.js` | 479 | Constants, runtime object, caches, DOM refs, fn registry, shared Maps |
| `util.js` | 505 | WZ helpers, asset cache, draw primitives, text helpers |
| `net.js` | 1,526 | WebSocket, remote players, interpolation, rendering |
| `life.js` | 3,668 | Mobs, NPCs, combat, damage, reactors, map data, portals |
| `physics.js` | 895 | Player physics, footholds, walls, gravity, camera |
| `render.js` | 1,017 | Map layers, character composition, collision detection |
| `sound.js` | 328 | BGM, SFX, UI sounds, mob sounds, audio pools |
| `character.js` | 1,146 | Character frames, face animation, preloading, set effects |
| `input.js` | 436 | GM commands, chat, settings, canvas resolution |
| `items.js` | 937 | Equipment, ground drops, chair, cursor, UI windows |
| `save.js` | 1,219 | Weapon/item helpers, save/load, create/login, inventory UI |
| `app.js` | 3,248 | Entry point: game loop, loadMap, portals, HUD, boot |
| **Total** | **15,404** | |

**app.js reduced from 14,923 → 3,248 lines (78% reduction)**

## Architecture

- **ES modules** — `<script type="module" src="/app.js">` in index.html (unchanged)
- **Bun.build** bundles for `--prod` mode (12 modules → single file, ~0.44 MB)
- **Browser** resolves imports natively in dev mode (no bundler needed)
- **Hot-reload** watches `client/web/` — all module files trigger reload on save

### Dependency DAG (no circular imports)
```
state.js (foundation - no imports)
  ↓
util.js (imports state)
  ↓
net.js (imports state, util)
  ↓
life.js (imports state, util, net)
  ↓
physics.js (imports state, util, life)
  ↓
render.js (imports state, util, net, life, physics, character)
  ↓
sound.js (imports state, util)
  ↓
character.js (imports state, util, net, life, save)
  ↓
input.js (imports state, util, net, sound)
  ↓
items.js (imports state, util, net, physics, render, sound)
  ↓
save.js (imports state, util, net, sound, items, input)
  ↓
app.js (imports ALL modules — entry point)
```

### Shared State in state.js (moved to avoid circular deps)
- `lifeAnimations`, `lifeRuntimeState`, `reactorRuntimeState` — life/mob/NPC runtime Maps
- `objectAnimStates` — render animation state Map
- `characterPlacementTemplateCache` — character sprite composition cache
- `_chairSpriteCache` — chair item sprite cache
- `CLIMBING_STANCES` — character climbing constant
- `wzCursor`, `CURSOR_*` constants — WZ cursor state
- `_localDropIdCounter`, `DROP_EXPIRE_MS`, `DROP_EXPIRE_FADE_MS` — drop expiry state

### fn.* Registry (cross-module late-binding calls)
Functions registered in `app.js` via `Object.assign(fn, {...})` before boot.
Modules call `fn.funcName()` for functions not available via direct import
(avoids circular dependencies).

**Registered functions (42 total):**
- net.js deps (28): addSystemChatMessage, appendChatLogMessage, adjustStanceForRemoteWeapon, animateDropPickup, createDropFromServer, lootDropLocally, drawSetEffect, findActiveSetEffect, equipSlotFromId, equipWzCategoryFromId, getCharacterActionFrames, getEquipFrameParts, getFaceExpressionFrames, getFaceFrameMeta, getHairFrameParts, getHeadFrameMeta, handleServerMapChange, showDuplicateLoginOverlay, loadChairSprite, mergeMapAnchors, pickAnchorName, zOrderForPart, playMobSfx, playUISound, requestCharacterPartImage, spawnDamageNumber, syncServerReactors, wrapBubbleTextToWidth
- life.js deps (11): findFootholdAtXNearY, findFootholdBelow, loadMap, normalizedRect, playSfx, playSfxWithFallback, requestServerMapChange, saveCharacter, appendChatLogMessage, getCharacterActionFrames, playMobSfx
- physics.js deps (5): adjustStanceForWeapon, getCharacterActionFrames, getCharacterFrameData, standUpFromChair, triggerPlayerHitVisuals
- render.js deps (3): drawSetEffect, findActiveSetEffect, requestCharacterPartImage
- character.js deps (7): adjustStanceForWeapon, buildZMapOrder, getCapType, hasOverallEquipped, loadPortalMeta, portalFrameCount, portalMetaKey
- input.js deps (2): setCursorState, loadMap
- items.js deps (18): addSystemChatMessage, bringWindowToFront, buildKeybindsUI, cancelItemDrag, equipSlotFromId, equipWzCategoryFromId, findFreeSlot, getIconDataUri, getItemSlotMax, hideTooltip, inventoryTypeById, isItemStackable, loadEquipIcon, loadItemIcon, loadItemName, loadItemWzInfo, refreshUIWindows, saveCharacter

### Mutable State
- `runtime` object: mutable properties, exported as `const` from state.js
- `sessionId`: exported with `setSessionId()` setter
- `currentInvTab`: exported with `setCurrentInvTab()` setter
- Net state (16 vars): each has a setter function (e.g., `setWsConnected()`)

## Progress Log

| Phase | Commit | Extracted | app.js Lines | Reduction |
|-------|--------|-----------|-------------|-----------|
| 1 | 12956a8 | state.js + util.js | 13,993 | −930 (6%) |
| 2 | 8757c14 | net.js | 12,543 | −2,380 (16%) |
| 3 | d5c5f56 | life.js | 8,977 | −5,946 (40%) |
| 4 | 7471225 | physics.js + render.js | 7,105 | −7,818 (52%) |
| 5 | bcf55ae | sound.js | 6,800 | −8,123 (54%) |
| 6 | e6359b2 | character.js | 5,709 | −9,214 (62%) |
| 7 | 6831f6d | input.js | 5,295 | −9,628 (65%) |
| 8 | 62aeea0 | items.js | 4,399 | −10,524 (71%) |
| 9 | 0e162a9 | save.js | 3,241 | −11,682 (78%) |
| fix | 4de2e87 | cross-module refs batch 1 | 3,247 | fixed missing imports/exports |
| fix | 6f54112 | cross-module refs batch 2 | — | reactorAnimations, metaCache, etc. |
| fix | d1160a8 | cross-module refs batch 3 | — | 16 remaining missing imports, state.js moves |
| fix | 05c4da4 | framePath string→array | — | resolveNodeByUol expects array basePath |
| fix | 6856044 | util.js rewrite from monolith | — | **root cause**: util.js had wrong function impls |
| fix | 99fae24 | resourcesv2 paths | — | mapPathFromId/soundPathFromName paths |
| fix | 0700ae1 | sound path double .img | — | soundPathFromName extension handling |

## Critical Lessons Learned

### util.js Was Not Extracted From Monolith
The original module split (phase 1) created a util.js with **different function implementations**
than the monolithic app.js. This caused rendering failures, incorrect asset loading, and
broken sprite composition. Key differences found and fixed:

- **`drawWorldImage`/`drawScreenImage`**: flip logic was wrong (translate-then-offset vs translate+width)
- **`canvasMetaFromNode`**: missing opacity (a0/a1) fields and motion fields (moveType/W/H/P/R)
- **`resolveNodeByUol`**: completely different algorithm (string.split vs array spread)
- **`applyObjectMetaExtras`**: mutated cached meta objects instead of creating new copies
- **`localPoint`/`topLeftFromAnchor`/`worldPointFromTopLeft`**: different anchor math
- **`fetchJson`/`requestMeta`/`requestImageByKey`**: different caching/dedup logic
- **`mapPathFromId`**: used `/resources/` instead of `/resourcesv2/`
- **`soundPathFromName`**: wrong path format (double `.img.img`)
- **`wrapText`**: missing paragraph (newline) handling
- **`roundRect`**: used arcTo instead of quadraticCurveTo

**Resolution**: Replaced entire util.js with functions extracted verbatim from the old monolith
(commit f525cda), with only `export` keywords and `/resourcesv2/` paths changed.

### framePath Must Be Array, Not String
`resolveNodeByUol` uses `[...basePath]` spread — works correctly with arrays,
produces wrong results with strings (spreads individual characters).
All `framePath` assignments in character.js and net.js must use array syntax:
`[action, String(frameIndex)]` not `action + "/" + String(frameIndex)`.
