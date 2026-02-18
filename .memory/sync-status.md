# .memory Sync Status

Last synced: 2026-02-18T06:20:00+11:00
Status: ✅ Synced

## Current authoritative memory files
- `.memory/game-design.md`
- `.memory/cpp-port-architecture-snapshot.md`
- `.memory/half-web-port-architecture-snapshot.md`
- `.memory/cpp-vs-half-web-port-gap-snapshot.md`
- `.memory/tech-stack.md`
- `.memory/implementation-plan.md`
- `.memory/canvas-rendering.md`
- `.memory/physics.md`

## What was synced in this pass

### Combat / Mob behavior rewrite
1. **Stagger → aggro → patrol state machine**: Mob hit = 500ms freeze (hit1 anim) + knockback slide → 4s aggro chase (orbits player ±60px) → normal patrol
2. **Knockback**: Linear velocity decay (150 px/sec → 0 over 500ms), bypasses friction engine, respects foothold edges
3. **Mob HP from WZ**: `maxHP` extracted from `Mob.wz/info` node, no more hardcoded 100
4. **Mob render layers**: Mobs drawn per map layer based on foothold layer, not as a single pass on top

### Delta-time physics refactor
5. **Frame-rate independent game loop**: 60fps cap via `TARGET_FRAME_MS`, all updates use `dt`
6. **`mobPhysicsUpdate(map, phobj, isSwimMap, dtSec)`**: Single call per frame, converts px/sec → per-tick internally for C++ friction formulas, scales by `numTicks = dtSec * MOB_TPS`
7. **Damage numbers**: dt-based rise/fade (no tick loops)
8. **Patrol counter**: Accumulates dtMs, transitions at 1600ms

### Portal scroll fix
9. **Portal scroll tracks player position during animation**: Eliminates camera jerk when scroll ends

### Chat bar / status bar layout fix
10. **`--statusbar-h` CSS var**: Scales status bar height from canvas pixels to CSS pixels in fixed-res mode. Chat bar and chat log use `var(--statusbar-h)` for bottom positioning.

### Codebase refactor
11. **Foothold helper consolidation**: Removed 5 duplicate functions (footholdSlope→fhSlope, isWallFoothold→fhIsWall, footholdLeft→fhLeft, footholdRight→fhRight). findFootholdBelow/fhIdBelow/findFootholdAtXNearY now use shared `fhGroundAt`/`fhIsWall`.
12. **Constants grouped**: Canvas/Display, Player Physics, Portal, UI, Mob Physics, Combat, Persistence Keys
13. **localStorage DRY**: `loadJsonFromStorage`/`saveJsonToStorage` helpers replace repeated try/catch boilerplate
14. **STATUSBAR_HEIGHT moved to UI constants section** (was forward-referenced from line 5900)

## Validation snapshot
- ✅ `bun run ci` — all 135 tests pass across all workspaces
- app.js: 7246 lines (was 7327, net -81 from refactor)

## Phase completion status
- Phase 0-5: ✅ Complete
- Phase 6: Scaffolding complete
- Phase 7: Not started — requires game server protocol
- Phase 8 (Steps 40-44): ⏳ Partial
- **Combat system**: ✅ Stagger/aggro/KB complete, WZ HP, damage formula
- **Equipment rendering**: ✅ Complete
- **Player HUD**: ✅ Complete
- **Mob rendering**: ✅ Layer-correct rendering

## Next expected update point
- Phase 7: Networking and multiplayer (needs server protocol)
- More visual polish: weather, effects, UI
