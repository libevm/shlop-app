# API Endpoints

> All REST endpoints served by the game server (`server/src/server.ts` + `server/src/character-api.ts` + `server/src/pow.ts`).
> Default port: 5200. All responses are `application/json`.

---

## Proof-of-Work Session (`/api/pow/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/pow/challenge` | None | Get a PoW challenge. Returns `{ ok, challenge, difficulty }`. Challenge expires after 60s. |
| `POST` | `/api/pow/verify` | None | Verify PoW solution. Body: `{ challenge, nonce }`. Returns `{ ok, session_id }` on success, 403 on failure. |

PoW difficulty default: 20 leading zero bits (~1s solve on modern browser). Configurable via `POW_DIFFICULTY` env var.

---

## Character API (`/api/character/*`)

All except `/login` require `Authorization: Bearer <session-id>` header.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/character/create` | Bearer | Create character. Body: `{ name, gender }`. Returns `{ ok, data, name }`. 201 on success, 409 if name taken or character exists. |
| `GET` | `/api/character/load` | Bearer | Load character data. Returns `{ ok, data, name }`. `identity.name` injected from DB key. |
| `POST` | `/api/character/save` | Bearer | Save character data. Body: full save JSON with `version` field. Strips `identity.name` before persisting. Preserves server-side achievements (jq_quests merge: take max). |
| `POST` | `/api/character/claim` | Bearer | Set password. Body: `{ password }` (min 4 chars). Bcrypt hashed. 409 if already claimed. |
| `GET` | `/api/character/claimed` | Bearer | Check if account has password. Returns `{ ok, claimed: bool }`. |
| `POST` | `/api/character/login` | None | Login with credentials. Body: `{ name, password }`. Returns `{ ok, session_id }` (new session). 401 on bad password. |

Session validation: all Bearer-authed endpoints check `valid_sessions` table (PoW-issued or login-issued). Sessions expire after 7 days of inactivity. Expired sessions return 401 `SESSION_EXPIRED`.

---

## Leaderboard API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/leaderboard` | None | JQ leaderboard. Alias for `/api/jq/leaderboard`. |
| `GET` | `/api/jq/leaderboard` | None | All JQ leaderboards. Returns `{ ok, leaderboards }`. |
| `GET` | `/api/jq/leaderboard?quest=X` | None | Single quest leaderboard. Returns `{ ok, quest, entries }`. |

---

## Online Players

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/online` | None | Current online player count. Returns `{ ok, count }`. |

---

## Health & Metrics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Health check. Returns `{ status, ready, indexEntries, blobCount, version }`. |
| `GET` | `/ready` | None | Readiness check. Same as `/health`. |
| `GET` | `/metrics` | None | Server metrics (uptimeMs, requestCount, errorCount, avgLatencyMs, etc.). |

---

## Asset API (`/api/v1/*`)

Legacy data provider endpoints for WZ asset serving.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/asset/:type/:id` | None | Get asset entity by type and ID. |
| `GET` | `/api/v1/asset/:type/:id/:section` | None | Get asset section. |
| `POST` | `/api/v1/batch` | None | Batch asset lookup. Body: array of `{ type, id, section? }`. Max batch size: 50. |
| `GET` | `/api/v1/blob/:hash` | None | Get blob by content hash. Immutable cache (1yr). |

---

## WebSocket

| Path | Description |
|------|-------------|
| `/ws` | Game WebSocket. First message must be `{ type: "auth", session_id: "..." }`. Session must be valid (PoW-issued or login-issued). See `shared-schema.md` for all message types. |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `sessions` | session_id → character_name (transient auth tokens) |
| `characters` | name → JSON character data + GM flag |
| `credentials` | name → bcrypt password_hash (claimed accounts) |
| `valid_sessions` | PoW/login-issued session tracking + expiry |
| `jq_leaderboard` | (player_name, quest_name) → completions |
| `logs` | Append-only action audit trail (username, timestamp, action blob) |

---

## WebSocket Close Codes
- `4001` — First message not auth
- `4002` — No character found for session
- `4003` — Inactive (30s timeout)
- `4004` — Replaced by new connection
- `4005` — No database configured
- `4006` — Already logged in (duplicate session)
- `4007` — Session invalid or expired
