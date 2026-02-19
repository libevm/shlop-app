# .memory Sync Status

Last synced: 2026-02-20T08:15:00+11:00
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
- `client/web/app.js`: ~10100 lines (single-file debug web client)
- Latest git: `04da4d5` on `origin/main`
- CI: `bun run ci` ✅

## What was synced in this pass

### Tooltip always on top (2026-02-20, 04da4d5)
- `.ui-tooltip` z-index raised from 30 to 99990
- Ensures tooltip renders above game windows which use an incrementing z-index counter

### Floating window z-order (2026-02-20, 1a81e5e)
- Game windows now have dynamic z-index via `_winZCounter` (increments on each focus)
- `bringWindowToFront(winEl)` called on: pointerdown on any `.game-window`, titlebar drag start, hotkey toggle open
- Clicking a window that's behind another brings it to front

### Fix double equip/unequip sound (2026-02-20, 5f65cde → d8bb521)
- Root cause: dblclick preceded by two click events; first click started drag (DragStart), dblclick fired equip (DragEnd), second click also cancelled drag (DragEnd) = double sound
- Fix 1 (d8bb521): `cancelItemDrag(silent)` — equip/unequip passes `true` to suppress redundant sound
- Fix 2 (5f65cde): Single-click uses 200ms `setTimeout` before starting drag; dblclick `clearTimeout` cancels pending drag — prevents DragStart from firing at all on double-click

### Loot system improvements (2026-02-20, 22d5b9e → f0bab4a)
- Loot allowed in any position except sitting (was: `onGround` only)
- Loot uses player touch hitbox AABB overlap with drop bounds (32×32) instead of fixed 50px range
- Items must be `onGround` (done rotating/landing) to be lootable

### Chat bubble follows prone position (2026-02-20, 833fe8c)
- C++ parity: `chatballoon.draw(absp - Point(0, 85))` is fixed offset from feet
- Prone sprite is ~28px tall vs ~60px standing
- Bubble Y offset: 70px (standing) → 40px (prone/proneStab)

### Close window sound (2026-02-20, 10ef06e)
- Clicking the ✕ button on Equipment/Inventory/Keybinds windows now plays `MenuDown` sound

### Simplified item tooltip (2026-02-20, 25a89fb)
- Tooltip shows only: 48px enlarged pixelated sprite, item name, description (async from String.wz)
- Removed all stat/requirement/price/qty/ID clutter
- Dark semi-transparent frosted glass background (`rgba(10,14,28,0.8)` + `backdrop-filter: blur(8px)`)
- Centered layout, white text

### Slot-based inventory with drag swap (2026-02-20, 14ef726 → 1088582)
- `INV_ROWS` 6→8, `INV_MAX_SLOTS = 32` per tab
- Each item has `slot` field (0-31) for fixed grid position
- `findFreeSlot(invType)` finds first unoccupied slot
- Unified click handler per slot: pick up (no drag), swap (occupied), move (empty)
- Clicking outside inventory/equip grid while dragging → drops item to map
- Full tab rejects unequip/loot actions

### Face expressions: tongue + snoozing (2026-02-20, a76a094)
- `face8` = "chu" (tongue, 😛), default key Digit8
- `face9` = "hum" (snoozing, 😴), default key Digit9
- Added to keybind labels, FACE_EXPRESSIONS map, gameplayKeys array

### CANCLICK cursor animation slowdown (2026-02-20, a2cabc3)
- `CURSOR_CANCLICK_DELAY = 350ms` per frame (was 100ms default)
- Only applies when WZ data has no explicit delay (all cursor frames use fallback)

### Chat log handle cursor (2026-02-20, 731542a)
- Hover → CANCLICK cursor state, mousedown → CLICKING state
- Release restores CANCLICK if still hovering, else IDLE

### HUD restyle — MapleStory-faithful modern aesthetic (2026-02-20, 3e4fb68)

**Canvas-drawn HUD (app.js):**
- Status bar: frosted dark bg, gradient HP/MP gauges with gloss highlights, gold level text, Dotum font
- Player name label: rounded dark tag with blue border tint, white text with shadow
- Minimap: frosted glass panel, gold title, subtle blue borders
- Map banner: gold text with shadow glow, Dotum font
- FPS counter: frosted glass rounded rect
- Chat bubble: white bg (MapleStory parity), dark text, Dotum font
- Loading screen: gold gradient progress bar with gloss

**CSS HUD (styles.css):**
- HUD buttons: frosted glass with gold hover accent
- Game windows: refined shadows, inner highlights
- Item slots: diagonal gradient, hover glow
- Tooltip: dark frosted glass (semi-transparent)
- Chat bar/log: gradient bg, Dotum font
- All UI fonts normalized to Dotum with Arial fallback

### Previous sync entries
(All entries from prior syncs remain valid: WZ cursor fix, inventory tabs, equip/unequip,
drop animation rewrite, ghost item anchor, item drag-drop, ground drops, loot system,
ladder/rope bottom-exit, wall collision, prone hitbox, hit visuals, opacity animations,
laser cooldown, trap collision, fall damage, mob knockback, background rendering, rope/ladder,
fixed resolution 1024×768, UI windows, NPC dialogue, face keybinds, attack lag fix,
portal foothold snap, etc.)

## Key Data Structures

```js
// Window z-order
_winZCounter = 25  // increments on each bringWindowToFront() call

// Item slot field
playerInventory[i].slot  // 0-31, position within tab grid

// Tooltip z-index: 99990 (above all windows, below cursor at 99999)
```
