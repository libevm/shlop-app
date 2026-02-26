# Blackhat Adversary Audit — Client→Server Injection Vectors

> Audit date: 2026-02-27
> Scope: All client-initiated WebSocket messages and REST endpoints.
> Goal: Identify what data a malicious client can fake/inject to gain advantage.

---

## Executive Summary

The server has been **significantly hardened** — stats, inventory, equipment, meso, combat damage, loot, and drops are all server-authoritative. However, several **exploitable gaps** remain where the server blindly trusts client data or fails to validate it.

---

## 🔴 CRITICAL — Exploitable Now

### 1. Fake `level_up` Broadcast (Reputation Exploit)

**File:** `ws.ts:1818-1834`

The server's `level_up` handler blindly broadcasts whatever level the client claims:
```js
case "level_up": {
  const level = msg.level as number;
  roomManager.broadcastToRoom(client.mapId, {
    type: "player_level_up", id: client.id, level,
  }, client.id);
  if (level >= 10) {
    roomManager.broadcastGlobal({
      type: "global_level_up", name: client.name, level,
    });
  }
}
```

**Exploit:** Send `{ type: "level_up", level: 200 }` repeatedly. All players see the global celebration message "🎉 PlayerName has reached level 200!". The server **does not check `client.stats.level`** and **does not update any server state** — it's pure broadcast amplification. This is a spam/reputation exploit, not a stat cheat, but highly disruptive.

**Impact:** Medium. Social/reputation manipulation, chat spam.

---

### 2. Fake `trap_damage` — Self-Damage Amplification/Denial

**File:** `ws.ts:1838-1878`

```js
} else if (trapDmg > 0) {
  dmg = Math.min(trapDmg, client.stats.maxHp ?? 9999);
}
```

The `damage_taken` handler accepts `trap_damage` from the client, capped only at `maxHp`. A malicious client can:

- **Self-kill on demand** by sending `{ type: "damage_taken", trap_damage: 99999 }` while standing anywhere (no map/location validation).
- **Grief in PvP-adjacent contexts**: Force death broadcast to room.
- **No check that a trap actually exists at player's position or on the current map.**

**Impact:** Low-Medium. Self-harm only, but enables griefing (death animation spam, death logging).

---

### 3. Achievement Inflation via `save_state`

**File:** `ws.ts:1489-1508`

```js
for (const [key, val] of Object.entries(clientJq)) {
  const n = Number(val);
  if (n > 0) {
    serverJq[key] = Math.max(serverJq[key] || 0, n);
  }
}
```

The client sends achievement counts via `save_state`, and the server merges using `Math.max()`. A malicious client can:

- **Inflate any JQ quest completion count** to any positive number by sending `{ type: "save_state", achievements: { jq_quests: { "Shumi's Lost Coin": 9999 } } }`.
- **Inject fake quest names** into achievements (arbitrary string keys are accepted).
- These achievements are **displayed to other players** via `player_enter` and the player info modal, and **persist to DB**.

**Impact:** Medium. Leaderboard manipulation, fake achievement display. Note: the `jq_leaderboard` DB table is updated separately (only via actual JQ reward), so the leaderboard is safe — but the in-game displayed achievements are not.

---

### 4. Chat Message Injection — No Length/Rate Limit Server-Side

**File:** `ws.ts:1375-1380`

```js
case "chat":
  roomManager.broadcastToRoom(client.mapId, {
    type: "player_chat", id: client.id, name: client.name, text: msg.text,
  });
```

- **No max length check** on `msg.text`. A client can broadcast megabyte-sized messages.
- **No rate limiting** server-side. The 1s cooldown exists only in the client (`_lastChatSendTime`).
- **No content sanitization**. Arbitrary strings broadcasted verbatim.

**Impact:** Medium. Spam flooding, potential client-side rendering issues, DoS vector against other players' browsers.

---

### 5. `character_attack` Position Teleport

**File:** `ws.ts:2117-2125`

```js
const atkX = Number(msg.x) || client.x;
const atkY = Number(msg.y) || client.y;
client.x = atkX;
client.y = atkY;
client.facing = atkFacing;
if (!client.positionConfirmed) client.positionConfirmed = true;
```

The `character_attack` message sets the server-side player position to whatever the client sends, **bypassing the velocity check** that exists on `move` messages. A malicious client can:

- **Teleport to any mob on the map** by sending attack with fake x/y coords.
- **Set `positionConfirmed = true`** instantly, bypassing the guard that prevents portal use before first valid move.
- **Attack from impossible positions** — the afterimage range check is relative to the faked position.

**Impact:** High. Remote mob farming from any position on the map. Portal use bypass.

---

### 6. Mob Authority Abuse — Mob State Manipulation

**File:** `ws.ts:2068-2086`

```js
case "mob_state": {
  if (roomManager.mobAuthority.get(client.mapId) !== client.id) break;
  const mobStates = _mapMobStates.get(client.mapId);
  if (mobStates && Array.isArray(msg.mobs)) {
    for (const m of msg.mobs) {
      const st = mobStates.get(m.idx);
      if (st && !st.dead) {
        st.x = m.x;
        st.y = m.y;
      }
    }
  }
```

The mob authority client (first player in map) can send **arbitrary mob positions**. The server uses these positions for attack range checks. A malicious authority can:

- **Stack all mobs on top of each other** at the player's position for AoE-like farming.
- **Move mobs off-screen** to prevent other players from interacting with them.
- **Position mobs precisely within attack range** regardless of real mob AI.

Since the server only does `st.x = m.x; st.y = m.y` with no bounds or velocity checks, the authority has full control over the "truth" the server uses for combat range calculations.

**Impact:** High. Complete control over mob positioning for the authority player. Combined with #5, enables fully automated farming.

---

## 🟡 MODERATE — Limited Exploitability

### 7. `drop_item` — Drop Position Manipulation

**File:** `ws.ts:1984-2018`

The `drop_item` handler validates item existence in inventory, but **trusts `x`, `startY`, `destY` from the client**. A player can drop items at arbitrary map coordinates (not near their position). This is limited because:
- Items must exist in server inventory.
- Other players can loot after 5s (no owner on player drops).

**Impact:** Low. Mostly cosmetic — items appear at unexpected locations.

### 8. `drop_meso` — Meso Drop Position Manipulation

Same as #7 but for meso. Server validates the amount against balance, but **trusts coordinates**.

### 9. `face` Expression Spam

**File:** `ws.ts:1383-1388`

No rate limit on face expression changes. Client has a 1s cooldown, but server doesn't enforce it. A malicious client can spam expression changes to other players, causing visual noise.

### 10. `sit` / `prone` / `climb` — Cosmetic State Injection

These are pure broadcast relays. Server updates `client.action` and `client.chairId` but doesn't validate:
- Whether a chair item exists in inventory for the given `chair_id`.
- Whether a rope/ladder exists at the player's position for `climb`.
- Can fake any `chair_id` including ones not owned.

**Impact:** Low. Cosmetic only — shows fake chair sprites to other players.

### 11. `move` Velocity Check Bypass via Gaps

**File:** `ws.ts:1354-1370`

The velocity check has a weakness:
```js
const dtS = Math.max((now - client.lastMoveMs) / 1000, 0.01);
```
- Minimum dt is clamped to 10ms. If the client sends moves exactly 10ms apart, they get `1200 * 0.01 = 12px` of free teleport per message.
- At 100 messages/second, that's ~1200px/s of "legal" teleportation (the exact limit).
- The check only applies when `positionConfirmed && lastMoveMs > 0` — first move after auth is unchecked.
- Combined with #5 (`character_attack` bypasses velocity check entirely), movement restrictions are largely cosmetic.

### 12. `equip_change` — Equipment Slot Type Faking

**File:** `ws.ts:1409-1478`

The server validates item existence in inventory but takes `slotType` from the client:
```js
const slotType = msg.slot_type as string;
```
A player could potentially equip an item in the wrong slot (e.g. equip a weapon in the "Cap" slot), which would display oddly to other players but might also bypass combat calculations since `calcPlayerDamageRange` looks for `slot_type === "Weapon"`.

---

## 🟢 DEFENDED — Server Does It Right

### Stats (STR/DEX/INT/LUK/HP/MP/EXP/Level/Meso)
- **Server-authoritative.** `save_state` no longer accepts stats/inventory/equipment.
- Stats only change via server-side combat, GM commands, or level-up calculations.
- `stats_update` messages flow server→client only.

### Inventory / Equipment
- **Server-authoritative.** `equip_change` validates item exists before moving.
- `drop_item` validates item exists and deducts from server inventory.
- `use_item` validates item exists, loads WZ spec, applies effects server-side.
- `loot_item` validates drop exists, checks ownership timer, checks inventory space.

### Combat Damage
- **Server-authoritative.** `character_attack` → server finds mob, calculates damage, broadcasts result.
- Damage formula uses server-tracked stats + WZ weapon data.
- Client cannot specify damage amount or target mob.

### Loot/Drops
- **Server-authoritative.** Mob loot rolled server-side from Cosmic drop tables.
- Client cannot create or duplicate drops. Loot ownership enforced.

### Map Transitions
- **Server-authoritative.** Portal validation checks proximity, usability, destination existence.
- NPC warp validates NPC presence on map and destination whitelist.
- `enter_map` / `leave_map` silently ignored.

### Sessions
- PoW-gated session acquisition prevents trivial bot spawning.
- Session-to-character binding in DB. Duplicate login detection.
- 7-day expiry with activity tracking.

### REST Character Save
- `POST /api/character/save` is **rejected when the player is online** (WebSocket connected).
- Achievement merge uses `Math.max` (can inflate, see #3, but won't decrease).

---

## 🔧 Potential Bot/Automation Vectors

### A. Attack Speed Uncapped
The server doesn't rate-limit `character_attack` messages. A bot can send attacks as fast as the WebSocket allows (~hundreds/second). Each attack finds a mob in range and deals damage. Combined with #5 (position teleport) and #6 (mob position control), a bot can:
1. Set authority mob positions on top of self
2. Spam `character_attack` hundreds of times per second
3. Server calculates damage for each, kills mobs instantly
4. Server spawns drops, bot immediately sends `loot_item`

### B. Loot Speed Uncapped
No cooldown between `loot_item` messages. Bot can loot drops the instant they spawn.

### C. PoW Bypass via Low Difficulty
Default difficulty is 20 bits (~1s solve). In test mode, `POW_DIFFICULTY=1`. If misconfigured in production, bots get instant sessions.

---

## Summary Table

| # | Vector | Severity | Server Validates? | Exploitable? |
|---|--------|----------|-------------------|-------------|
| 1 | Fake level_up broadcast | Medium | ❌ No | ✅ Yes |
| 2 | Fake trap_damage | Low-Med | ⚠️ Caps only | ✅ Yes |
| 3 | Achievement inflation | Medium | ⚠️ Math.max merge | ✅ Yes |
| 4 | Chat spam/flood | Medium | ❌ No limits | ✅ Yes |
| 5 | Attack position teleport | High | ❌ No velocity check | ✅ Yes |
| 6 | Mob authority position control | High | ❌ No bounds check | ✅ Yes (if authority) |
| 7 | Drop position manipulation | Low | ❌ No proximity check | ✅ Yes |
| 8 | Meso drop position | Low | ⚠️ Balance only | ✅ Yes |
| 9 | Face expression spam | Low | ❌ No rate limit | ✅ Yes |
| 10 | Fake chair/climb state | Low | ❌ No validation | ✅ Yes |
| 11 | Move velocity bypass | Med | ⚠️ Weak check | ✅ Yes |
| 12 | Wrong equip slot type | Low | ⚠️ Partial | ⚠️ Maybe |
| A | Attack speed bot | High | ❌ No rate limit | ✅ Yes |
| B | Loot speed bot | Med | ❌ No rate limit | ✅ Yes |

---

## Recommended Fixes (Priority Order)

1. **Rate-limit `character_attack`** — max 3-4 per second per client.
2. **Validate `character_attack` position** — reject if distance from last known position exceeds threshold.
3. **Validate `mob_state` positions** — bound mob movement to reasonable velocity/range from spawn.
4. **Ignore client `level_up`** — server already handles level-up in `character_attack`. Remove the client→server `level_up` relay entirely, or validate `msg.level === client.stats.level`.
5. **Validate `trap_damage`** — check that the player's current map actually has traps, or make trap damage server-calculated.
6. **Rate-limit chat** — max 1 message per second, max 200 chars.
7. **Rate-limit `loot_item`** — max 2-3 per second.
8. **Validate achievements** — only accept JQ quest names from the known set, reject values > server count + 1.
9. **Validate `chair_id`** — check item exists in player's SETUP inventory.
10. **Validate `equip_change` slot_type** — server should determine correct slot from item ID prefix, not trust client.
