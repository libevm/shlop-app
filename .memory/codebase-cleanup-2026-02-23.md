# Codebase Cleanup — 2026-02-23

## Goal
Reduce the codebase to the minimal set required for the three active commands:
- `bun run client:online`
- `bun run client:admin-ui`
- `bun run server`

## What Was Removed

### Entire directories removed
| Path | Reason |
|------|--------|
| `packages/shared-schemas/` | Only consumed by `tools/build-assets` (removed); never imported by server or client runtime |
| `tools/build-assets/` | Asset extraction pipeline; not one of the 3 commands |
| `tools/workspace/` | Workspace integrity/script standardization tests; CI-only tooling |
| `tools/quality/` | Lint/typecheck helper scripts; CI-only tooling |
| `tools/docs/` | Docs server (`bun run docs`); not one of the 3 commands |
| `tools/observability/` | Debug flags/panel/logging utilities; never imported by any runtime code |
| `tools/policy/` | Definition-of-Done evidence checker; process tooling |
| `docs/` | Process documentation (debug-flags, logging-conventions, phase6, etc.) |
| `.github/workflows/` | CI pipeline for removed quality checks |
| `data/` (root-level) | Stale database copy; server uses `server/data/maple.db` |
| `client/src/runtime/` | TypeScript workspace modules (CombatOrchestrator, EntityPool, WorldStage, AssetClient, phase6-debug-smoke); never imported by `client/web/app.js` |

### Individual files removed
| File | Reason |
|------|--------|
| `client/src/index.ts` | Workspace barrel export; not used by any command |
| `client/src/index.test.mjs` | Test for removed barrel export |
| `client/src/dev.ts` | Workspace dev bootstrap; not used |
| `client/src/build.ts` | Workspace build bootstrap; not used |
| `client/tsconfig.json` | No TypeScript files left in client |
| `server/src/index.ts` | Workspace barrel re-export; `dev.ts` imports directly |
| `server/src/index.test.mjs` | Test for removed barrel export |
| `server/src/build.ts` | Build bootstrap; not used |
| `tools/dev/serve-client-offline.mjs` | Offline mode server; not one of the 3 commands |
| `tools/dev/serve-client-web.mjs` | Legacy alias for offline; not used |
| `debug_chat.png` | Debug screenshot at repo root |
| `debug_chat_bubble.png` | Debug screenshot at repo root |
| `README.DEV.md` | Duplicated content with README.md |

### Package.json changes

**Root `package.json`:**
- Removed workspaces: `tools/build-assets`, `packages/shared-schemas`
- Removed scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `check:workspace`, `quality`, `ci`, `docs`, `docs:test`, `client:web`, `client:offline`, `extract:v2`
- Removed `dependencies: {}` (was empty)

**`client/package.json`:**
- Removed scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `debug:phase6`, `web`, `offline`

**`server/package.json`:**
- Removed scripts: `build`, `test`, `lint`, `typecheck`

### Other cleanups
- `.gitignore`: Removed stale `resourcesv1/` entry and legacy WZ comment
- `README.md`: Completely rewritten to reflect the 3-command project

## What Was Kept

### Server (all files active)
- `server/src/dev.ts` — entry point
- `server/src/server.ts` — HTTP + WS server factory
- `server/src/db.ts` — SQLite schema + CRUD
- `server/src/ws.ts` — WebSocket room manager
- `server/src/character-api.ts` — character REST API
- `server/src/admin-api.ts` — admin dashboard API
- `server/src/pow.ts` — proof-of-work sessions
- `server/src/map-data.ts` — WZ map/portal/NPC data loader
- `server/src/reactor-system.ts` — reactor HP/loot/respawn
- `server/src/data-provider.ts` — in-memory data provider
- `server/src/make-gm.ts` — CLI: toggle GM flag
- `server/src/create-gm.ts` — CLI: create GM account
- `server/src/*.test.ts` — server tests (58 tests, all passing)
- `server/tsconfig.json` — TypeScript config

### Client
- `client/web/app.js` — 14,883-line standalone vanilla JS game client
- `client/web/index.html` — HTML shell
- `client/web/styles.css` — compiled Tailwind CSS output
- `client/web/favicon.png` — favicon
- `client/src/styles/app.css` — Tailwind CSS source
- `client/admin-ui/index.html` — admin dashboard HTML
- `client/admin-ui/sheep.png` — admin UI asset

### Tools
- `tools/dev/serve-client-online.mjs` — online client dev server with proxy
- `tools/dev/serve-admin-ui.mjs` — admin UI dev server

### Config
- `tsconfig.base.json` — shared TS config (extended by server)
- `.gitignore`, `.gitattributes`, `AGENTS.md`

## Verification
- `bun run server` ✅ — starts, /health returns 200
- `bun run client:online` ✅ — CSS builds, serves on :5173, returns 200
- `bun run client:admin-ui` ✅ — serves on :5174, returns 200
- `bun test src/` (server) ✅ — 58 tests pass, 0 failures
