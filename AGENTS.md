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

## Client-Server & Wire Protocol Documentation
- `.memory/client-server.md` is the **single source** for all REST endpoints, WebSocket
  message types/fields, session model, character persistence schema, and map transition protocol.
- `.memory/server.md` documents server internals (file map, DB schema, reactor system, room manager).
- **Any change to player state fields, session handling, WebSocket messages,
  REST endpoints, persistence logic, or resource paths MUST update `client-server.md`
  and/or `server.md`.**

## Items, Equipment & Inventory Documentation
- `.memory/items.md` documents inventory tabs, equipment slots, weapon types, ground drops,
  loot, drag-drop, chair system, item icons, and character sprite rendering integration.
- **Any change to inventory data model, tab logic, slot layout, item icons, drop mechanics,
  loot pickup, equip/unequip flow, weapon stances, or equipment UI MUST update `items.md`.**

## Agent Guidance
- Keep `.memory/` as the full progress snapshot for handoff/resume.
- Ensure snapshots and progress notes are clear enough for another agent to continue without re-discovery.
