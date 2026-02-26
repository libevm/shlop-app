# Blackhat Adversary Audit — Client→Server Injection Vectors

> Audit date: 2026-02-27
> Last updated: 2026-02-27 (all critical/moderate fixes applied)
> Scope: All client-initiated WebSocket messages and REST endpoints.

---

## Status: All Critical/Moderate Issues Fixed ✅

---

## 🟢 FIXED — Previously Exploitable

### 1. ~~Fake `level_up` Broadcast~~ → FIXED
Client `level_up` message is now **silently ignored**. Level-up is fully server-authoritative — handled in `character_attack` when EXP threshold is met. Global celebration broadcast moved to server-side level-up handler.

### 2. ~~Fake `trap_damage`~~ → FIXED
Trap damage capped at **20% of maxHp** per hit. Prevents self-kill exploits.

### 3. ~~Achievement Inflation~~ → FIXED
Only **8 known JQ quest names** accepted (validated against `VALID_JQ_QUESTS` set). Values capped at `server_value + 1` per save — prevents arbitrary inflation. Unknown quest names silently rejected.

### 4. ~~Chat Spam/Flood~~ → FIXED
**Rate limited**: 1 message per second server-side (`CHAT_COOLDOWN_MS = 1000`).
**Length capped**: 200 characters max (`CHAT_MAX_LENGTH = 200`).
Empty messages rejected.

### 5. ~~`character_attack` Position Teleport~~ → FIXED
Attack position validated against last known server position. Rejected if manhattan distance > `MAX_MOVE_SPEED_PX_PER_S` (1200px). No longer bypasses velocity check or sets `positionConfirmed`.

### 6. ~~Mob Authority Position Control~~ → FIXED
`mob_state` positions bounded to **max 30px movement per tick** (`MOB_STATE_MAX_MOVE_PX = 30`). Prevents teleporting mobs to player position.

### 7. ~~Drop Position Manipulation~~ → FIXED
`drop_item` and `drop_meso` validate drop X within **300px** of player position (`DROP_PROXIMITY_PX = 300`).

### 8. ~~Meso Drop Position~~ → FIXED (same as #7)

### 9. ~~Face Expression Spam~~ → FIXED
Rate limited to **2/sec** server-side (`FACE_COOLDOWN_MS = 500`).

### 10. ~~Fake Chair~~ → FIXED
`sit` handler validates `chair_id` exists in player's inventory before broadcasting.

### 11. ~~Move Velocity Bypass via Attack~~ → FIXED (see #5)
Attack position now validated. Combined with existing move velocity check, movement restrictions are enforced.

### 12. ~~Wrong Equip Slot Type~~ → FIXED
Server determines correct slot from item ID prefix via `equipSlotFromItemId()` instead of trusting client `slot_type`.

### A. ~~Attack Speed Bot~~ → FIXED
`character_attack` rate limited to **max 4/sec** (`ATTACK_COOLDOWN_MS = 250`).

### B. ~~Loot Speed Bot~~ → FIXED
`loot_item` rate limited to **max 2.5/sec** (`LOOT_COOLDOWN_MS = 400`).

---

## 🟢 DEFENDED — Server Does It Right (Unchanged)

### Stats (STR/DEX/INT/LUK/HP/MP/EXP/Level/Meso)
- Server-authoritative. `save_state` does NOT accept stats/inventory/equipment.

### Inventory / Equipment
- Server-authoritative. All operations validated server-side.

### Combat Damage
- Server-authoritative. Damage formula uses server-tracked stats + WZ weapon data.

### Loot/Drops
- Server-authoritative. Mob loot rolled server-side.

### Map Transitions
- Server-authoritative. Portal validation, NPC warp validation.

### Sessions
- PoW-gated. Duplicate login detection. 7-day expiry.

---

## Rate Limiting Summary

| Message Type | Cooldown | Max Rate |
|---|---|---|
| `character_attack` | 250ms | ~4/sec |
| `chat` | 1000ms | 1/sec |
| `loot_item` | 400ms | ~2.5/sec |
| `face` | 500ms | 2/sec |
| `move` | velocity check | ~bounded by MAX_MOVE_SPEED |

---

## Remaining Low-Risk Items

- **`climb` state injection**: Pure cosmetic relay, no gameplay impact.
- **`prone` state injection**: Pure cosmetic relay, no gameplay impact.
- **PoW difficulty**: Default 20 bits (~1s solve). Ensure production doesn't use `POW_DIFFICULTY=1`.
