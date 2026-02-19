# Equipment System

> Implements the MapleStory equipment window, equip/unequip mechanics, and
> dynamic character sprite rendering. C++ reference: `UIEquipInventory`,
> `Inventory`, `EquipSlot`, `EquipData`, `CharLook`.

## Equipment Slots

### Slot List (`EQUIP_SLOT_LIST`)

| Slot Type | UI Label | Item ID Range     | WZ Folder  |
|-----------|----------|-------------------|------------|
| Cap       | Hat      | 100xxxx           | Cap        |
| Cape      | Cape     | 110xxxx           | Cape       |
| Coat      | Top      | 104xxxx / 105xxxx | Coat / Longcoat |
| Shield    | Shield   | 109xxxx           | Shield     |
| Glove     | Gloves   | 108xxxx           | Glove      |
| Pants     | Bottom   | 106xxxx           | Pants      |
| Shoes     | Shoes    | 107xxxx           | Shoes      |
| Weapon    | Weapon   | 130xxxx–170xxxx   | Weapon     |

### Item ID → Slot Mapping (`equipSlotFromId`)

C++ parity with `EquipData` constructor: `index = id / 10000 - 100`

```js
function equipSlotFromId(id) {
  const p = Math.floor(id / 10000);
  if (p === 100) return "Cap";
  if (p === 104 || p === 105) return "Coat"; // Top + Overall share slot
  if (p === 106) return "Pants";
  if (p === 107) return "Shoes";
  if (p === 108) return "Glove";
  if (p === 109) return "Shield";
  if (p === 110) return "Cape";
  if (p >= 130 && p <= 170) return "Weapon";
  return null;
}
```

### Item ID → WZ Folder (`equipWzCategoryFromId`)

Maps item ID prefix to `Character.wz` subfolder for loading sprites/icons:

```js
function equipWzCategoryFromId(id) {
  const p = Math.floor(id / 10000);
  if (p === 100) return "Cap";
  if (p >= 101 && p <= 103) return "Accessory";
  if (p === 104) return "Coat";
  if (p === 105) return "Longcoat";
  if (p === 106) return "Pants";
  if (p === 107) return "Shoes";
  if (p === 108) return "Glove";
  if (p === 109) return "Shield";
  if (p === 110) return "Cape";
  if (p === 111) return "Ring";
  if (p >= 130 && p <= 170) return "Weapon";
  return null;
}
```

## Data Model

### `playerEquipped` (Map<string, object>)

Keyed by slot type (e.g. `"Coat"`, `"Weapon"`). Each value:
```js
{
  id: number,       // item ID (e.g. 1040002)
  name: string,     // display name
  iconKey: string,  // key into iconDataUriCache
}
```

### Default Equipment (`DEFAULT_EQUIPS`)

Starting gear loaded at init:
```js
{ id: 1040002, category: "Coat",   path: "Coat/01040002.img.json" }
{ id: 1060002, category: "Pants",  path: "Pants/01060002.img.json" }
{ id: 1072001, category: "Shoes",  path: "Shoes/01072001.img.json" }
{ id: 1302000, category: "Weapon", path: "Weapon/01302000.img.json" }
```

### `runtime.characterEquipData` (Object)

Keyed by equip item ID → parsed WZ JSON from `Character.wz/{folder}/{padded}.img.json`.
Used by `getEquipFrameParts()` to extract sprite parts for character rendering.

## Equip / Unequip Flow

### Unequip (double-click equipment slot)

```
User double-clicks equipped item
  → clearTimeout on pending single-click drag timer (prevents DragStart sound)
  → unequipItem(slotType)
    → hideTooltip()
    → cancelItemDrag(true)  [silent — no DragEnd sound from cancel]
    → playerEquipped.delete(slotType)
    → playerInventory.push({ ...item, invType: "EQUIP", category: slotType, slot: freeSlot })
    → delete runtime.characterEquipData[item.id]
    → characterPlacementTemplateCache.clear()
    → playUISound("DragEnd")  [single sound only]
    → refreshUIWindows()
```

C++ parity: `UIEquipInventory::doubleclick` → `UnequipItemPacket(slot, freeslot)`

### Equip (double-click inventory EQUIP item)

```
User double-clicks inventory item (EQUIP tab)
  → clearTimeout on pending single-click drag timer (prevents DragStart sound)
  → equipItemFromInventory(invIndex)
    → hideTooltip()
    → cancelItemDrag(true)  [silent]
    → slotType = item.category || equipSlotFromId(item.id)
    → if slot occupied: swap existing → inventory (reuses outgoing item's slot index)
    → playerInventory.splice(invIndex, 1)
    → playerEquipped.set(slotType, { id, name, iconKey })
    → loadEquipWzData(item.id)  [async]
    → characterPlacementTemplateCache.clear()
    → playUISound("DragEnd")  [single sound only]
    → refreshUIWindows()
```

C++ parity: `UIItemInventory::doubleclick` (EQUIP tab) → `EquipItemPacket(slot, eqslot)`

### Drop Equipped Item

```
User drags equipped item → clicks canvas
  → dropItemOnMap()
    → groundDrops.push({ ...drop })
    → playerEquipped.delete(slotType)
    → delete runtime.characterEquipData[equipped.id]
    → characterPlacementTemplateCache.clear()
```

## Character Sprite Rendering Integration

### Dynamic Equipment Iteration

`getCharacterFrameData()` iterates `playerEquipped` (not the static `DEFAULT_EQUIPS`):

```js
for (const [, equipped] of playerEquipped) {
  const equipData = runtime.characterEquipData[equipped.id];
  if (!equipData) continue;
  const equipParts = getEquipFrameParts(equipData, action, frameIndex, `equip:${equipped.id}`);
  for (const ep of equipParts) frameParts.push(ep);
}
```

This means equipment changes are **immediately reflected** in the character sprite.

### WZ Data Loading (`loadEquipWzData`)

```js
async function loadEquipWzData(equipId) {
  const category = equipWzCategoryFromId(equipId);
  const padded = String(equipId).padStart(8, "0");
  const path = `/resources/Character.wz/${category}/${padded}.img.json`;
  const data = await fetchJson(path);
  runtime.characterEquipData[equipId] = data;
  characterPlacementTemplateCache.clear();
}
```

### Initial Load (`requestCharacterData`)

On first character data request, builds equip fetch list from current `playerEquipped`:
```js
const equipEntries = [...playerEquipped.entries()].map(([slotType, eq]) => ({
  id: eq.id,
  category: equipWzCategoryFromId(eq.id) || slotType,
  padded: String(eq.id).padStart(8, "0"),
}));
```

### Placement Cache Invalidation

`characterPlacementTemplateCache` is a Map caching composed character placements per
`(action, frameIndex, flipped, faceExpression, faceFrameIndex)`.

**Must be cleared** (`characterPlacementTemplateCache.clear()`) whenever:
- An item is equipped
- An item is unequipped
- An equipped item is dropped on the map

Without clearing, the character continues rendering the old equipment set.

## Equipment UI

### HTML Structure

```html
<div id="equip-window" class="game-window hidden">
  <div class="game-window-titlebar" data-window="equip">Equipment</div>
  <div id="equip-grid" class="equip-grid"></div>
</div>
```

### Grid Layout

- `equip-grid`: 4-column CSS grid of 36×36px slots
- 8 slots matching `EQUIP_SLOT_LIST`
- Empty slots show label text (e.g. "Hat", "Weapon")
- Filled slots show equip icon with tooltip on hover

### Interactions

- **Hover** → tooltip with name, slot label, item ID
- **Single click** → start drag (ghost icon follows cursor)
- **Double-click** → unequip to inventory EQUIP tab
- **Drag to canvas** → drop on map as ground item

## Equip Icon Loading

`loadEquipIcon(equipId, category)`:
- Fetches `Character.wz/{category}/{padded}.img.json`
- Reads `info/icon` or `info/iconRaw` canvas node
- Stores base64 data URI in `iconDataUriCache` keyed `equip-icon:{id}`
- Returns the cache key immediately (icon loads async)

## Known Limitations

- No stat requirements check (C++ `can_wear_equip` validates level/job/stats)
- No gender restrictions
- No overall/longcoat detection (both map to "Coat" slot, should hide pants)
- No ring/pendant/belt/medal/accessory slots in UI grid
- No equip tooltips with stat details
- No scroll use (applying scrolls to equipment)
- No equipment swap via drag-drop between equip and inventory windows
- No Cash/Pet/Android tabs in equipment window (C++ has 4 tabs)
