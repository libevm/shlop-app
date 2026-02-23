# AGENTS.md

## Single Source of Truth
- The complete project context, plans, decisions, and progress snapshot live in `.memory/`.
- Always treat `.memory/` as authoritative.
- Do **not** duplicate long-form specs in this file.

## Required Workflow Rules
1. Read relevant files in `.memory/` before starting work.
2. Implement the requested change in the working repository.
3. **After every change, update `.memory/` to reflect the new current state.**
   - Include code edits, architecture decisions, API/schema changes, milestones, and task progress.
4. If `.memory/` is not updated, the change is considered incomplete.
5. If setup/run/workflow instructions change, update `README.md` in the same change.
   - Keep setup steps current and runnable for a new contributor.

## Client Documentation
- `.memory/client.md` documents the full client architecture:
  module layout, rendering pipeline, asset loading, caching, draw order, coordinate systems,
  transitions, diagnostics, physics overview, and all client subsystems.
- **Any change to the rendering pipeline, draw order, asset caching, preload logic,
  coordinate transforms, transition/overlay behavior, or client module structure
  MUST update `client.md`.**
- This includes: new draw functions, cache invalidation changes, new asset types,
  loading screen changes, debug overlay additions, and image decode pipeline changes.

## Physics Documentation
- `.memory/physics.md` documents the full physics system and unit conventions:
  player movement, mob movement, foothold structures, gravity, swimming, climbing, AI,
  and C++ → web unit conversion formulas.
- **Any change to physics constants, movement logic, foothold handling, collision detection,
  mob AI behavior, force/velocity calculations, or unit conventions MUST update `physics.md`.**
- This includes: new physics modes, constant tuning, foothold chain logic, jump mechanics,
  rope/ladder changes, mob patrol behavior, swim physics, and porting guides.

## Client-Server Architecture Documentation
- `.memory/client-server.md` documents the client-server architecture:
  session/auth model, character state schema, V2 map set, resource pipeline.
- `.memory/shared-schema.md` is the **wire protocol source of truth**:
  all REST and WebSocket message types, fields, examples, and room model.
- **Any change to player state fields, session handling, WebSocket messages,
  REST endpoints, persistence logic, V2 map list, or online/offline mode
  switching MUST update `client-server.md` AND/OR `shared-schema.md`.**
- This includes: new stat fields, save/load functions, new WS message types,
  room model changes, auth flow changes, V2 resource additions, and
  default value changes.

## Inventory & Equipment Documentation
- `.memory/inventory-system.md` documents inventory tabs, slots, drag-drop, ground drops, loot.
- `.memory/equipment-system.md` documents equipment window, equip/unequip flow, sprite rendering.
- **Any change to inventory data model, tab logic, slot layout, item icons, drop mechanics,
  loot pickup, equip/unequip flow, or equipment UI MUST update the relevant file.**

## Agent Guidance
- Keep `.memory/` as the full progress snapshot for handoff/resume.
- Ensure snapshots and progress notes are clear enough for another agent to continue without re-discovery.
