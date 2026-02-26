# Feature Parity: C++ Client & Cosmic Server vs Our Implementation

> Systematic comparison of `../MapleStory-Client` (C++ reference client) and
> `../Cosmic` (Java reference server) against our `client/web/` + `server/src/`.
> Organized by priority: what we have, what's missing, and where to find it.

---

## ✅ Already Implemented (Parity Achieved)

| System | Status | Notes |
|--------|--------|-------|
| **Player physics** | ✅ Full | Gravity, footholds, walls, slopes, landing — C++ `Physics.cpp` parity at 125 TPS |
| **Mob physics** | ✅ Full | `mobPhysicsStep()` matches C++ `move_normal()` per-tick. TURNATEDGES, edge/wall checks |
| **Mob AI patrol** | ✅ Full | Stand/move/hit/aggro/die state machine. Chase player after hit |
| **Mob death animation** | ✅ Full | `die1` stance plays, fade out, respawn after 30s (server) / 8s (offline) |
| **Character composition** | ✅ Full | Anchor chains, z-ordering via `zmap.img.xml`, equip layering |
| **Camera** | ✅ Full | C++ `Camera.cpp` parity: smoothing, deadzone, VR bounds clamping |
| **Backgrounds** | ✅ Full | Types 0–7, parallax, tiling, mobile drift |
| **Map layers** | ✅ Full | 8 layers, tiles/objects draw order, animations, motion, opacity |
| **Portals** | ✅ Full | Server-validated, hidden portals with reveal, momentum scroll |
| **Footholds** | ✅ Full | Chain resolution, down-jump, wall collision, foothold-derived bounds |
| **Damage numbers** | ✅ Full | WZ charset sprites (`NoRed0/1`, `NoCri0/1`), physics arc, fade |
| **Damage formula** | ✅ Full | C++ `CharStats::close_totalstats` + `Mob::calculate_damage` parity |
| **Afterimage hitbox** | ✅ Server | Server reads WZ `Afterimage/{name}.img.xml` for attack ranges |
| **Mob contact damage** | ✅ Full | `bodyAttack` from WZ, knockback, invincibility, blink |
| **Trap/hazard damage** | ✅ Full | Object traps with `lt/rb` hitbox, knockback, 2s invincibility |
| **Fall damage** | ✅ Full | 500px threshold, 10% maxHP per tier, bounce knockback |
| **Swimming** | ✅ Full | `map.swim` flag, tuned constants, swim-jump |
| **Rope/ladder climbing** | ✅ Full | Attach/detach, side-jump, top-exit, cooldowns |
| **Ground drops** | ✅ Full | C++ `Drop.cpp` parity: spawn arc, gravity, bob, pickup fly |
| **Mob drops (Cosmic)** | ✅ Full | Per-mob chance tables from `152-drop-data.sql` (21k entries, 962 mobs) |
| **Meso drops** | ✅ Full | 4 animated icon tiers, `client.stats.meso` balance, inventory display |
| **Reactors** | ✅ Full | Multi-hit, cooldowns, loot, respawn, server-authoritative |
| **Inventory** | ✅ Full | 5 tabs, 32 slots each, stacking, drag-drop, equip/unequip |
| **Equipment rendering** | ✅ Full | 16 slot types, weapon stances, cap/hair visibility, longcoat |
| **Chair system** | ✅ Full | SETUP items, sit animation, remote sync |
| **NPC dialogue** | ✅ Full | Scripted pages, taxi/warp scripts, portrait, word wrap |
| **Chat** | ✅ Full | Bubbles, log, Enter toggle, remote relay |
| **Multiplayer** | ✅ Full | Snapshot interpolation, remote animation, equip sync |
| **Minimap** | ✅ Full | WZ minimap image, colored markers for entities |
| **WZ cursor** | ✅ Full | 3 states, animation, click detection |
| **Sound** | ✅ Full | BGM crossfade, SFX pools, mob hit/die sounds |
| **Save/load** | ✅ Full | JSON CharacterSave, dual-path (WS + REST), periodic + beforeunload |

---

## ❌ Missing Features — High Priority

### 1. Potion / Consumable Usage (USE Items)
**Impact**: Core gameplay — players have potions but can't use them.
**What's needed**: Double-click a USE item → apply `spec` effects → remove 1 from stack.

**C++ reference**: `Player::use_item(itemid)` in `Character/Player.cpp` sends `UseItemPacket`.
`Stage::send_key()` maps `KeyType::ITEM` → `player.use_item(action)` for hotkey usage.

**Cosmic reference**: `UseItemHandler.java` in `net/server/channel/handlers/`:
- Reads `spec` node from `Item.wz/Consume/` via `ItemInformationProvider.getItemEffect()`
- `StatEffect.loadFromData()` parses: `hp`, `mp`, `hpR` (% of maxHP), `mpR` (% of maxMP), `time` (buff duration), `speed`, `jump`, `pad`, `pdd`, `mad`, `mdd`, `acc`, `eva`
- `calcHPChange()` / `calcMPChange()` apply the effect
- Item is removed from inventory after use

**WZ data**: `resourcesv3/Item.wz/Consume/0200.img.xml` → `<imgdir name="ITEMID">` → `<imgdir name="spec">`:
```xml
<int name="hp" value="50"/>     <!-- flat HP restore -->
<int name="mp" value="100"/>    <!-- flat MP restore -->
<int name="hpR" value="50"/>    <!-- % of maxHP restore -->
<int name="mpR" value="50"/>    <!-- % of maxMP restore -->
<int name="time" value="0"/>    <!-- buff duration (ms), 0 = instant -->
```

**Sound**: `resourcesv3/Sound.wz/Item.img.xml` → `<imgdir name="ITEMID">` → `<sound name="Use" .../>`. Many potions use UOL refs (`../02000000/Use`).

**Implementation plan**:
- Client: double-click USE item → read `spec` from WZ → apply HP/MP → remove from inv → play sound → save → sync to server
- Server: validate `use_item { slot, item_id }` → apply stat changes → remove from inventory → broadcast

---

### 2. Real EXP Table (200 Levels)
**Impact**: Leveling is completely wrong — currently `maxExp = floor(maxExp * 1.5) + 5`.
**What's needed**: Replace formula with the canonical 200-level exp table.

**C++ reference**: `Character/ExpTable.cpp` — 201-element array (levels 1–200 + cap).
**Cosmic reference**: `constants/game/ExpTable.java` — identical values.

**Values** (first 30): `15, 15, 34, 57, 92, 135, 372, 560, 840, 1144, 1242, 1573, 2144, 2800, 3640, 4700, 5893, 7360, 9144, 11120, 13477, 16268, 19320, 22880, 27008, 31477, 36600, 42444, 48720, 55813, ...`
Note: Cosmic array is 0-indexed where `exp[level]` = EXP needed to go from `level` to `level+1`. First entry (15) is for level 1→2.

**Implementation plan**:
- Add `EXP_TABLE` constant array in `state.js` (or shared file)
- Replace `Math.floor(maxExp * 1.5) + 5` with `EXP_TABLE[level]` in both `life.js` (offline) and `net.js` (online)
- Server: use same table for validation
- Cap at level 200: `EXP_TABLE[200] = 2000000000`

---

### 3. Level Up Effect Animation
**Impact**: Visual — no level up celebration effect plays.
**What's needed**: Play animated sprite from `Effect.wz/BasicEff.img/LevelUp` centered on player.

**C++ reference**: `Character/CharEffect.cpp` defines `PATHS = { "LevelUp", "JobChanged", "Enchant/Success", ... }`.
`Char::show_effect_id(CharEffect::LEVELUP)` → adds `Animation` from `Effect.wz/BasicEff.img/LevelUp` to `EffectLayer`.
`EffectLayer` draws effects at character position, auto-removes when animation completes.

**WZ data**: `resourcesv3/Effect.wz/BasicEff.img.xml` → `<imgdir name="LevelUp">` contains 7+ animation frames with `origin`, `delay`, WZ canvas data.

**Implementation plan**:
- Load LevelUp frames on first level up (lazy)
- On level up: set `player.levelUpEffect = { startTime, frames, frameIndex, timer }`
- In render loop: draw current frame centered on player position, advance frames, clear when done
- Sync to remote players via existing `player_level_up` message (already tracked as `rp.levelUpEffect`)

---

### 4. STR/DEX/INT/LUK Stats & AP Distribution
**Impact**: Character stats are incomplete — no primary stats, no AP on level up.
**What's needed**: Track 4 base stats + AP points. Level up grants +5 AP (Beginner). Stat window to assign.

**C++ reference**: `Character/CharStats.h` tracks `basestats[STR/DEX/INT/LUK]` via `MapleStat::Id`. `UIStatsInfo` shows stat window with +/- buttons. `close_totalstats()` computes damage from primary/secondary stats.

**Cosmic reference**: `Character.java` `levelUp()`:
- Beginner: +5 AP per level. `assignStrDexIntLuk(str, dex, 0, 0)` auto-assigns below level 11
- Beginner HP growth: `Randomizer.rand(12, 16)` per level
- Beginner MP growth: `Randomizer.rand(10, 12)` per level

**C++ damage formula dependency**: `get_primary_stat()` uses job-based mapping:
- Warrior (job/100=1): primary=STR, secondary=DEX
- Magician (job/100=2): primary=INT, secondary=LUK
- Bowman (job/100=3): primary=DEX, secondary=STR
- Thief (job/100=4): primary=LUK, secondary=DEX
- Pirate (job/100=5): primary=STR (or DEX for guns), secondary=DEX (or STR)

**Implementation plan**:
- Add `str, dex, int, luk, ap` to `runtime.player` and `CharacterSave.stats`
- Default beginner: STR=4, DEX=4, INT=4, LUK=4, AP=0 (or auto-assigned at creation like Cosmic)
- Level up: grant +5 AP, +rand(12,16) maxHP, +rand(10,12) maxMP
- Build stat window UI (simple panel with current values + assign buttons when AP > 0)
- Update server `calcMobDamage()` to use real stats instead of hardcoded defaults
- Equip stat bonuses (see #5) feed into total stats

---

### 5. Equipment Stat Bonuses
**Impact**: Equipping better gear has no effect on damage/defense — equip stats are ignored.
**What's needed**: Read `incSTR/incDEX/incINT/incLUK/incPAD/incPDD/incMAD/incMDD/incMHP/incMMP/incACC/incEVA/incSPEED/incJUMP` from WZ. Apply to total stats when equipped.

**C++ reference**: `Data/EquipData.cpp` reads `defstats` from `Character.wz/{category}/{id}.img.xml/info`:
```cpp
defstats[WATK]  = src["incPAD"];   defstats[WDEF]  = src["incPDD"];
defstats[MAGIC] = src["incMAD"];   defstats[MDEF]  = src["incMDD"];
defstats[HP]    = src["incMHP"];   defstats[MP]    = src["incMMP"];
defstats[STR]   = src["incSTR"];   defstats[DEX]   = src["incDEX"];
defstats[INT]   = src["incINT"];   defstats[LUK]   = src["incLUK"];
defstats[ACC]   = src["incACC"];   defstats[AVOID] = src["incEVA"];
defstats[SPEED] = src["incSPEED"]; defstats[JUMP]  = src["incJUMP"];
```

**Server already partially does this**: `ws.ts` reads `incPAD` for weapon WATK to compute damage.

**Implementation plan**:
- Extend equip WZ loading to parse all `inc*` stats
- On equip/unequip: recalculate total stats (base + sum of equip bonuses)
- Server: read all equip stats for damage validation
- Requires #4 (STR/DEX/INT/LUK) to be meaningful
- Show stat bonuses in equip tooltip (see #8)

---

### 6. NPC Shops (Buy/Sell)
**Impact**: Major gameplay — no way to buy potions/equipment or sell drops.
**What's needed**: NPC click → shop UI with buy/sell tabs. Meso deducted on purchase, added on sell.

**Cosmic reference**: `101-shops-data.sql` maps `npcid → shopid` (109 shops). `102-shopitems-data.sql` has 3,882 shop item entries with `shopid, itemid, price, pitch, position`.

**C++ reference**: `IO/UITypes/UIShop.h` — full shop UI with buy/sell tabs, item list, quantity selector. `NpcInteractionHandlers.h` has `OpenNpcShopHandler`.

**WZ data**: Item prices from `Item.wz/{category}/{prefix}.img.xml/{id}/info/price`.

**Implementation plan**:
- Server: parse Cosmic shop SQL at startup → `Map<npcId, ShopItem[]>`
- Server: new message type `open_shop { npc_id }` → sends shop inventory
- Server: `buy_item { item_id, qty }` → validate meso, add to inventory, deduct meso
- Server: `sell_item { slot, inv_type, qty }` → remove from inventory, add meso (price/2 or price/3)
- Client: shop window UI with NPC name, item grid, buy/sell tabs, quantity selector
- Client: show item price, player meso balance

---

### 7. Player Death & Respawn
**Impact**: Players can reach 0 HP but nothing happens — no death state, no respawn.
**What's needed**: At 0 HP → death state, tombstone effect, respawn at town.

**C++ reference**: `Player::damage()` → `Char::show_damage()` → sets invincible 2s. Death when HP reaches 0. `Player::respawn(pos, uw)` resets state.

**Cosmic reference**: `Character.java` `playerDead()`:
- Cancel all buffs, dispel debuffs
- Non-Beginner: lose EXP (10% in field, 1% in town). Beginners lose no EXP.
- Respawn at map's `returnMap` with full HP

**WZ data**: `Effect.wz/Tomb.img.xml` → `fall` folder with 4+ frames (tombstone animation). Map `returnMap` already parsed in `server/src/map-data.ts`.

**Server already has return map**: `ws.ts` line 1344 uses `mapData.info.returnMap` as fallback for portal validation.

**Implementation plan**:
- Client: when HP ≤ 0, set dead state, play tombstone animation, show "You have died" overlay
- Client: respawn button → send `respawn` message → server warps to `returnMap` with full HP
- Server: `die` → warp to `returnMap`, reset HP to maxHP
- Cosmic: Beginners lose no EXP. Non-beginners lose 10% (we only have Beginners currently)

---

### 8. Enhanced Item Tooltips (Equip Stats)
**Impact**: Quality of life — equip tooltips only show name+description, not stats.
**What's needed**: Show equip stats (WATK, WDEF, STR, etc.), required level, category, upgrade slots.

**C++ reference**: `IO/Components/EquipTooltip.h` shows: icon, name, category (e.g., "ONE-HANDED SWORD"), req stats (level/STR/DEX/INT/LUK), equip stat bonuses (15 types), upgrade slots, description.

**WZ data**: `Character.wz/{category}/{id}.img.xml/info`:
```xml
<int name="reqLevel" value="10"/>  <int name="reqSTR" value="20"/>
<int name="incPAD" value="15"/>    <int name="incPDD" value="5"/>
<int name="tuc" value="7"/>        <!-- upgrade slots -->
```

**Current tooltip**: `save.js` `showTooltip()` shows icon (48px), name, description from `String.wz`.

**Implementation plan**:
- On tooltip hover: fetch equip WZ data → parse `info` node for req/inc stats
- Render enhanced tooltip: category label, stat lines with green/red coloring
- Show "REQ LEV: 10" etc. with red if player doesn't meet requirements

---

## ❌ Missing Features — Medium Priority

### 9. Equip Requirement Checks
**Impact**: Players can equip any item regardless of level/stats.
**What's needed**: Check `reqLevel`, `reqSTR`, `reqDEX`, `reqINT`, `reqLUK`, `reqJob` before equipping.

**C++ reference**: `Data/EquipData.cpp` reads `reqstats[LEVEL/JOB/STR/DEX/INT/LUK]`.
**WZ data**: `Character.wz/{category}/{id}.img.xml/info/reqLevel`, `reqSTR`, etc.
**Depends on**: #4 (STR/DEX/INT/LUK stats)

---

### 10. Reactor Drops from Cosmic Data
**Impact**: Reactor drops use generic random pools instead of reactor-specific tables.
**What's needed**: Use Cosmic's `131-reactordrops-data.sql` (1,126 entries) for per-reactor drop tables.

**Cosmic reference**: `reactordrops` table: `reactorid, itemid, chance, questid`. Each entry rolled independently, similar to mob drops.
**File**: `../Cosmic/src/main/resources/db/data/131-reactordrops-data.sql`

**Current implementation**: `reactor-system.ts` `rollReactorLoot()` uses hardcoded category percentages (19% equip, 25% use, 50% etc, 5% chairs, 2% cash) with random items from global pools.

---

### 11. Global Drop Data
**Impact**: Missing rare global drops that can come from any mob.
**What's needed**: Roll global drop table alongside per-mob drops on every kill.

**Cosmic reference**: `151-global-drop-data.sql` — 6 entries (NX Cards, Maple Leaf, Chaos Scroll, White Scroll) with per-million chances. Rolled independently on every mob kill in addition to per-mob drops.

---

### 12. Flying Mob Physics
**Impact**: Flying mobs (e.g., Jr. Boogie, Hector) don't move correctly.
**What's needed**: `move_flying` physics mode: no gravity, `FLYFRICTION=0.05`, vertical+horizontal force.

**C++ reference**: `Physics.cpp` `move_flying()`:
```cpp
phobj.hacc = phobj.hforce - FLYFRICTION * phobj.hspeed;
phobj.vacc = phobj.vforce - FLYFRICTION * phobj.vspeed;
```
`Mob.cpp`: `canfly = src["fly"].size() > 0`. If flying: `phobj.type = FLYING`, stand/move use `fly` stances, `flydirection` = UP/DOWN/STRAIGHT.

**WZ data**: Flying mobs have `<imgdir name="fly">` instead of `<imgdir name="move">` in `Mob.wz/{id}.img.xml`. `info/flySpeed` provides speed.

**Current maps with flying mobs**: None in our common maps (100000000–104040000). Lower priority until maps with flying mobs are visited.

---

### 13. Mob Jumping
**Impact**: Some mobs (e.g., Stone Golem) can jump but currently don't.
**What's needed**: `canjump = src["jump"].size() > 0`. 25% chance to jump when moving. `vforce = -5.0`.

**C++ reference**: `Mob.cpp`: In `next_move()`, when in MOVE/JUMP stance, `randomizer.below(0.25f)` → `set_stance(JUMP)`. In `update()`: `case JUMP: phobj.vforce = -5.0;`.

---

### 14. Scrolling Notice (Server Announcements)
**Impact**: No way to display server-wide announcements.
**What's needed**: Scrolling text at top of screen.

**C++ reference**: `IO/Components/ScrollingNotice.h` — text scrolls right-to-left across screen top. `MessagingHandlers.h` has `ServerMessageHandler`.

---

### 15. Damage to Player Numbers (TOPLAYER type)
**Impact**: When mobs hit the player, damage numbers don't render in the correct style.
**What's needed**: C++ has 3 damage number types: NORMAL (white, mob damage), CRITICAL (yellow), TOPLAYER (red/purple, damage to player). We currently use NORMAL style for all.

**C++ reference**: `DamageNumber.h` `Type::TOPLAYER`. `Char::show_damage()` uses this type for player-received damage. Different charset sprites.

---

## ❌ Missing Features — Low Priority / Future

### 16. Skills System
**Impact**: Major feature but enormous scope — all classes are Beginner-only currently.
**What's needed**: Skill tree, SP distribution, skill effects, skill animations, buff system.

**C++ reference**: `Gameplay/Combat/Skill.h`, `Data/SkillData.h`, `Character/SkillBook.h`. Skills have: damage multiplier, attack count, mob count, MP cost, range, cooldown, bullet, use/hit effects.
**Cosmic reference**: `SkillFactory`, `StatEffect`, extensive skill scripts.
**WZ data**: `resourcesv3/Skill.wz/` contains all skill data.

**Blocked by**: Job advancement system (#17), SP system, buff system.

---

### 17. Job Advancement
**Impact**: All players are Beginners forever.
**What's needed**: NPC-triggered job change at level 8/10, 2nd job at 30, 3rd at 70, 4th at 120.
**Cosmic reference**: `Character.java` `changeJob()` — grants SP, changes stat growth rates.

---

### 18. Party System
**Impact**: No group play.
**Cosmic reference**: Full party system with EXP sharing, party chat, party quests.

---

### 19. Trade System
**Impact**: No player-to-player item/meso exchange.
**Cosmic reference**: `server/Trade.java` — 566 lines, full trade window.

---

### 20. Guild System
**Impact**: No guilds.
**Cosmic reference**: `net/server/guild/` — full guild management, emblem, chat.

---

### 21. Quest System
**Impact**: No quests beyond JQ achievements.
**C++ reference**: `Character/QuestLog.h` — started/in-progress/completed tracking.
**Cosmic reference**: Extensive quest scripting system.

---

### 22. Buff System
**Impact**: No temporary stat buffs from potions or skills.
**C++ reference**: `Character/Buff.h`, `ActiveBuffs.h`, `PassiveBuffs.h`. Buff bar UI: `IO/UITypes/UIBuffList.h`.
**Cosmic reference**: `BuffStat.java` — 60+ buff types. `StatEffect.applyTo()` applies buffs.

---

### 23. Pet System
**Impact**: Cosmetic — no pet followers.
**C++ reference**: `Character/Inventory/Pet.h`, `Character/Look/PetLook.h`. Pets follow player, auto-loot.

---

### 24. World Map
**Impact**: Navigation aid.
**C++ reference**: `IO/UITypes/UIWorldMap.h` — full world map with region browsing.

---

### 25. Key Config / Hotbar
**Impact**: Quality of life — no item/skill hotkeys.
**C++ reference**: `IO/KeyConfig.h`, `IO/UITypes/UIKeyConfig.h`. Items can be placed on hotbar keys.
`Stage::send_key()` maps `KeyType::ITEM` → `player.use_item(action)` — pressing a hotkey uses the item.

---

## Reference File Locations

### C++ Client (`../MapleStory-Client/`)
| System | Key Files |
|--------|-----------|
| Player stats | `Character/CharStats.h/.cpp`, `Character/ExpTable.cpp` |
| Damage formula | `Character/CharStats.cpp` `close_totalstats()`, `Mob.cpp` `calculate_damage()` |
| Equip data | `Data/EquipData.cpp` (req stats, def stats, slots) |
| Item data | `Data/ItemData.cpp` (name, desc, price, category, gender) |
| Weapon data | `Data/WeaponData.cpp` (type, speed, attack, afterimage) |
| Skill data | `Data/SkillData.h` (damage, mobcount, mpcost, range) |
| Mob behavior | `Gameplay/MapleMap/Mob.cpp` (all stances, AI, contact damage) |
| Combat | `Gameplay/Combat/Combat.h/.cpp` (attack queue, damage effects, bullets) |
| Char effects | `Character/CharEffect.cpp` (LevelUp, JobChanged, Scroll Success/Fail) |
| Effect layer | `Graphics/EffectLayer.cpp` (timed animation overlay system) |
| Inventory | `Character/Inventory/Inventory.h` (slots, stacking, equip/unequip) |
| Shop UI | `IO/UITypes/UIShop.h` (buy/sell, quantity, price display) |
| Stat window | `IO/UITypes/UIStatsInfo.h` (AP distribution, detailed stats) |
| Tooltips | `IO/Components/EquipTooltip.h`, `ItemTooltip.h` |
| Death/respawn | `Character/Player.cpp` `damage()`, `respawn()` |
| Key config | `IO/KeyConfig.h`, `IO/KeyAction.h` |
| Map info | `Gameplay/MapleMap/MapInfo.h` (seats, ladders, fieldlimit, swim, town) |

### Cosmic Server (`../Cosmic/`)
| System | Key Files |
|--------|-----------|
| EXP table | `src/main/java/constants/game/ExpTable.java` |
| Level up | `src/main/java/client/Character.java` `levelUp()` (line ~6281) |
| Player death | `src/main/java/client/Character.java` `playerDead()` (line ~7449) |
| Item use | `src/main/java/net/server/channel/handlers/UseItemHandler.java` |
| Stat effects | `src/main/java/server/StatEffect.java` `loadFromData()`, `calcHPChange()` |
| Item info | `src/main/java/server/ItemInformationProvider.java` |
| Shops | `src/main/resources/db/data/101-shops-data.sql`, `102-shopitems-data.sql` |
| Mob drops | `src/main/resources/db/data/152-drop-data.sql` (already integrated) |
| Reactor drops | `src/main/resources/db/data/131-reactordrops-data.sql` |
| Global drops | `src/main/resources/db/data/151-global-drop-data.sql` |
| EXP distribution | `src/main/java/server/life/Monster.java` `distributeExperience()` (line ~630) |
| Job system | `src/main/java/client/Character.java` `changeJob()` |
| Buff system | `src/main/java/client/BuffStat.java`, `server/StatEffect.java` |
| Quest system | `src/main/java/server/quest/` |

### WZ Data (`resourcesv3/`)
| Data | Path |
|------|------|
| Potion effects | `Item.wz/Consume/0200.img.xml` → `{id}/spec/{hp,mp,hpR,mpR,time,...}` |
| Potion sounds | `Sound.wz/Item.img.xml` → `{id}/Use` (many UOL refs to `02000000`) |
| Level up effect | `Effect.wz/BasicEff.img.xml` → `LevelUp/{0..6}` (7 animation frames) |
| Tombstone effect | `Effect.wz/Tomb.img.xml` → `fall/{0..3}` (4 animation frames) |
| Equip stats | `Character.wz/{Cat}/{id}.img.xml/info/{incPAD,reqLevel,...}` |
| Item prices | `Item.wz/{Cat}/{prefix}.img.xml/{id}/info/price` |
| Mob stats | `Mob.wz/{id}.img.xml/info/{level,maxHP,exp,PADamage,bodyAttack,...}` |
| Skill data | `Skill.wz/{jobId}.img.xml` |
