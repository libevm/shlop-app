# .memory Sync Status

Last synced: 2026-02-20T07:00:00+11:00
Status: ✅ Synced

## Current authoritative memory files
- `.memory/game-design.md`
- `.memory/cpp-port-architecture-snapshot.md`
- `.memory/half-web-port-architecture-snapshot.md`
- `.memory/cpp-vs-half-web-port-gap-snapshot.md`
- `.memory/tech-stack.md`
- `.memory/implementation-plan.md`
- `.memory/canvas-rendering.md`
- `.memory/rendering-optimization-plan-2026-02-19.md`
- `.memory/physics.md`
- `.memory/physics-units.md`
- `.memory/inventory-system.md`
- `.memory/equipment-system.md`

## Codebase Metrics Snapshot
- `client/web/app.js`: **9910 lines** (single-file debug web client)
- Latest git: `ae4a2e4` on `origin/main`
- CI: `bun run ci` ✅

## What was synced in this pass

### WZ cursor clicking animation fix (2026-02-20)

**Bug:** Mouse cursor sprite did not visually update to the CLICKING state (state 12) when
mouse button was pressed, because `updateCursorElement()` (which syncs the HTML `<img>` to
the current cursor state/frame) was only called on `mousemove` events — never in the game loop.

**Fix:**
1. Added `updateCursorElement()` call in the game loop tick, immediately after
   `updateCursorAnimation(elapsed)`. This ensures the cursor HTML element always reflects
   the current state and animation frame, even when the mouse is stationary.
2. Improved `pointerup` handler: instead of always resetting to `CURSOR_IDLE`, it now
   checks what's under the cursor (NPC, dialogue option) and restores `CURSOR_CANCLICK`
   if appropriate — matching C++ `UI::send_cursor(false)` behavior.

### HUD restyle — MapleStory-faithful modern aesthetic (2026-02-20)

**Design philosophy:** Keep the original MapleStory palette and feel (warm golds, cool blues,
Dotum font, white chat bubbles) but upgrade with modern polish (frosted glass, gradients with
gloss highlights, rounded corners, subtle shadows, clean typography).

**Canvas-drawn HUD changes (app.js):**
- Status bar: frosted dark background, HP/MP gauge bars with gradient fills + gloss highlights,
  gold level text with shadow, Dotum font
- Player name label: rounded dark tag with subtle blue border, white text with shadow
- Minimap: dark frosted glass panel, gold map name title, subtle blue border
- Map banner: gold map name with text shadow glow, muted blue-gray street name, Dotum font
- FPS counter: frosted glass rounded rect, text shadow
- Chat bubble: white background (MapleStory parity) with subtle blue-gray border, dark text, Dotum font
- Loading screen: gold title + gold gradient progress bar with gloss, dark frosted background

**CSS HUD changes (styles.css):**
- HUD buttons: frosted glass background with gold hover accent
- Game windows: refined shadow with inner highlight, cleaner close button with hover-red
- Inventory tabs: improved contrast, active tab with inner glow
- Item slots: subtle diagonal gradient, hover glow ring
- Tooltip: warm parchment gradient background (MapleStory-style)
- Chat bar: gradient dark background with gold focus ring
- Chat log: faded gradient top, Dotum font for messages
- All fonts normalized to Dotum (MapleStory's UI font) with Arial fallback

### Inventory tabs + equip/unequip system (2026-02-20)

**Inventory Tabs (C++ UIItemInventory parity):**
- 5 tabs: EQUIP, USE, SETUP, ETC, CASH
- Tab assignment: `inventoryTypeById(id)` = `floor(id / 1000000)` → 1=EQUIP, 2=USE, 3=SETUP, 4=ETC, 5=CASH
- Each `playerInventory` item now has `invType` field
- HTML tab buttons in `#inv-tabs`, CSS styled as MapleStory tab bar
- `refreshInvGrid()` filters by `currentInvTab`

**Equip/Unequip System:**
- Double-click equipment slot → `unequipItem(slotType)` → moves to inventory EQUIP tab, removes equip WZ data, clears character placement cache → sprite updates
- Double-click inventory EQUIP item → `equipItemFromInventory(invIndex)` → equips item, swaps if slot occupied, loads WZ data via `loadEquipWzData(id)`, clears cache
- Drop equipped item on map → removes from `playerEquipped`, clears WZ data + placement cache

**Character Sprite Dynamic Equips:**
- `getCharacterFrameData()` now iterates `playerEquipped` instead of `DEFAULT_EQUIPS`
- `requestCharacterData()` builds equip fetch list from `playerEquipped` entries
- Equipment changes immediately reflected on animated character sprite
- `equipWzCategoryFromId(id)` maps item ID prefix → Character.wz subfolder
- `equipSlotFromId(id)` maps item ID prefix → playerEquipped key (C++ EquipData::get_eqslot parity)

**New Functions:**
- `inventoryTypeById(id)` — C++ InventoryType::by_item_id
- `equipWzCategoryFromId(id)` — WZ folder from equip ID
- `equipSlotFromId(id)` — equip slot key from equip ID
- `loadEquipWzData(id)` — async load Character.wz JSON for equip rendering
- `unequipItem(slotType)` — unequip → inventory
- `equipItemFromInventory(invIndex)` — inventory → equip

**HTML Changes:**
- `index.html`: Added `#inv-tabs` div with 5 tab buttons
- `styles.css`: Added `.inv-tabs`, `.inv-tab`, `.inv-tab.active` styles

### Drop animation rewrite — C++ Drop::update parity (2026-02-20)

**Old behavior:** Item drifted horizontally (hspeed = delta/48) using per-tick physics with
foothold crossing detection. X changed during flight.

**New behavior (C++ parity):**
- X is fixed at player position — never changes after drop
- Foothold Y found at drop X via `findFootholdAtXNearY` / `findFootholdBelow`
- `destY = footholdY - 4` (C++ `basey = dest.y() - 4`)
- Initial `vspeed = -5.0` (upward arc), gravity `0.14/tick`, terminal velocity `8`
- Spin while airborne: `angle += 0.2/tick` (C++ `SPINSTEP = 0.2f`)
- Landing: when `Y >= destY` while falling → snap, switch to FLOATING, zero angle
- FLOATING bob: `5.0 + (cos(phase) - 1.0) * 2.5` (exact C++ formula)
- Item only lootable once landed (`drop.onGround` check in `tryLootDrop`)
- Removed `drop.vx`, `drop.destX` fields — no horizontal physics

### Ghost item drag anchor fix (2026-02-20)

**Bug:** When dragging an item, the ghost icon was positioned with its top-left at `cursor + 12px`,
so the cursor appeared to click the top-left of the ghost.

**Fix:** Added `transform: translate(-100%, -100%)` to the ghost item element and removed the
+12px offset. The ghost icon now positions its bottom-right corner at the cursor point, so the
cursor visually clicks the bottom-right of the dragged item.

### Item selection, drag-drop, ground drops, and loot system (62f5180 → 8468d99)

**Item Selection & Drag:**
- Click any item in Equipment or Inventory to pick it up
- `draggedItem` state object tracks: active, source ("inventory"|"equip"), sourceIndex, id, name, qty, iconKey, category
- Ghost item icon (`<img id="ghost-item">`) follows cursor at 60% opacity, z-index 99998
- Source slot dims to 40% opacity while item is dragged
- DragStart/DragEnd sounds from `Sound.wz/UI.img.json`
- Escape cancels drag, map change cancels drag

**Drop on Map (C++ parity):**
- Click game canvas while dragging → spawns ground drop at player position
- C++ `Drop` physics: `hspeed = (dest.x - start.x) / 48`, `vspeed = -5.0`
- Destination X: randomized 30-60px in facing direction
- Destination Y: found from foothold below destX via `findFootholdAtXNearY` / `findFootholdBelow`
- Per-tick gravity (0.14) + terminal velocity (8), foothold crossing detection
- Spin while airborne (0.2 rad/tick, C++ SPINSTEP)
- On landing: snap to dest position, switch to FLOATING state
- FLOATING: cosine bob animation (2.5px amplitude, 0.025 phase/tick)
- No text label on dropped items
- DropItem sound from `Sound.wz/Game.img.json`

**Loot System:**
- Z key (configurable "loot" keybind) picks up nearest ground drop
- 50px pickup range, player must be on ground
- Pickup animation: item flies toward player and fades out (400ms)
- Item returns to inventory (stacks if same ID exists)
- PickUpItem sound from `Sound.wz/Game.img.json`
- One item per loot press (C++ `lootenabled` parity)

**New Sounds Preloaded:**
- UI: DragStart, DragEnd
- Game: PickUpItem, DropItem

**New Keybind:**
- `loot` (default: KeyZ) added to configurable keybinds with label "Loot"

### Ladder/rope bottom-exit platform snap (d97eeb4)
- When climbing down to bottom of ladder/rope and pressing down, player now checks for
  foothold within 24px of rope bottom and snaps onto it
- Mirrors existing top-exit logic (atTop && wantsUp → findFootholdAtXNearY → snap)
- Previously player would stay clamped at bottom or detach and freefall

### Drop physics C++ parity fix (07dc66c → 8468d99)
- hspeed = (dest.x - start.x) / 48 (was fixed dir*2.0)
- Gravity per tick 0.14 matching game physics engine
- Foothold crossing detection (prevY ≤ fh.y && newY ≥ fh.y)
- Fixed-tick sub-stepping for stable simulation
- Removed item name text labels from ground drops

## Key Data Structures Added

```js
// Item drag state
const draggedItem = { active, source, sourceIndex, id, name, qty, iconKey, category };

// Ground drops array
const groundDrops = []; // { id, name, qty, iconKey, x, y, destX, destY, vx, vy, onGround, opacity, angle, bobPhase, spawnTime, pickingUp, pickupStart, category }

// Drop physics constants
DROP_PICKUP_RANGE = 50
DROP_BOB_SPEED = 0.025
DROP_BOB_AMP = 2.5
DROP_SPAWN_VSPEED = -5.0
DROP_PHYS_GRAVITY = 0.14
DROP_PHYS_TERMINAL_VY = 8
LOOT_ANIM_DURATION = 400

// Ghost item HTML element
_ghostItemEl: <img id="ghost-item"> at position:fixed, z-index:99998, pointer-events:none
```

## Key Functions Added
- `startItemDrag(source, index, item)` — begin dragging an item
- `cancelItemDrag()` — cancel current drag
- `dropItemOnMap()` — drop dragged item as ground drop at player position
- `updateGroundDrops(dt)` — physics simulation for all ground drops
- `drawGroundDrops()` — render ground drops to canvas
- `tryLootDrop()` — attempt to pick up nearest ground drop

## Render Pipeline Update
- `updateGroundDrops(dt)` called in `update()` after `updateBackgroundAnimations`
- `drawGroundDrops()` called in `render()` after `drawBackgroundLayer(1)`, before `drawVRBoundsOverflowMask`
- `_imgCacheByUri` Map caches Image objects for drop icon data URIs
- Ghost item element updated in `updateCursorElement()` alongside WZ cursor

## Previous sync content preserved
(All previous sync entries from the prior sync-status.md remain valid and are not repeated here for brevity. Key systems: wall collision, prone hitbox, hit visuals, opacity animations, laser cooldown, trap collision, fall damage, mob knockback, background rendering, rope/ladder, fixed resolution 1024×768, UI windows, WZ cursor, NPC dialogue, face keybinds, attack lag fix, portal foothold snap, etc.)
