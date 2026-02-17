# Phase 6 Runtime Architecture Hardening (Scaffold)

This document tracks the initial implementation scaffolding for Implementation Plan **Phase 6**:
- Step 33: Stage-like world orchestration
- Step 34: Combat orchestration extraction
- Step 35: Entity identity + pool normalization

## Implemented modules

### Stage-like world orchestration
- `client/src/runtime/world/world-stage.ts`

Key points:
- Deterministic subsystem registration and execution order.
- Explicit ordered subsystems (backgrounds, entities, combat, effects, portals, UI).
- Update/draw trace capture for debugging deterministic pass order.

### Combat orchestration
- `client/src/runtime/combat/combat-orchestrator.ts`

Key points:
- Queue attack commands with hit delay and cooldown enforcement.
- Emit timeline events (`queued`, `hit`, `rejected-cooldown`).
- Return resolved hit events during update ticks.

### Entity pool normalization
- `client/src/runtime/entities/entity-pool.ts`

Key points:
- Keyed identity pool with duplicate-ID rejection.
- Safe update semantics (no ID mutation).
- Pool registry and diagnostics for counts/ghost-entity detection.

## Automated tests
- `client/src/runtime/world/world-stage.test.mjs`
- `client/src/runtime/combat/combat-orchestrator.test.mjs`
- `client/src/runtime/entities/entity-pool.test.mjs`

Run full validation:

```bash
bun run ci
```

## Debug smoke flow (manual)
Run the phase-6 smoke scenario:

```bash
bun run --cwd client debug:phase6
```

Expected output includes:
- stage trace count
- entity pool diagnostics
- at least one resolved combat hit
- combat timeline entries

## Browser human-in-the-loop debug client
Run:

```bash
bun run client:web
```

Then open browser URL (default `http://127.0.0.1:5173/?mapId=100020000`).

Debug client features:
- offline map load (no gameplay server required)
- map background/tile/object rendering
- playable character movement/jump + rope climbing + grounded crouch (`prone`)
- character composition with per-part flip and head/body anchor mapping
- chat bubble rendering
- BGM/SFX playback after audio unlock
