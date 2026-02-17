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

## What was synced in this pass
1. Camera X clamping: uses VR bounds (VRLeft/VRRight) when present, falls back to foothold-derived walls (`map.walls`)
2. Water environment physics restored to C++ faithful state:
   - Normal jump from ground works on swim maps (C++ STAND/WALK allows jump)
   - Airborne: SWIMMING physics (SWIMFRICTION=0.08, SWIMGRAVFORCE=0.03, FLYFORCE=0.25)
   - "fly" animation while swimming (not "jump" or "swim")
   - Space = swim up when airborne in water
   - Default stats reverted: Speed=115, Jump=110
3. Non-swim airborne physics restored to original pre-swim form (single multiply, no per-tick loop)

## Validation snapshot
- Automated:
  - ✅ `bun run ci`

## Next expected update point
- User feel-check of water environment physics (gravity, resistance, swim feel)
