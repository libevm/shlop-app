# API Endpoints

> All REST endpoints served by the game server (`server/src/server.ts` + `server/src/character-api.ts`).
> Default port: 5200. All responses are `application/json`.

---

## Character API (`/api/character/*`)

All except `/login` require `Authorization: Bearer <session-id>` header.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/character/create` | Bearer | Create character. Body: `{ name, gender }`. Returns `{ ok, data, name }`. 201 on success, 409 if name taken or character exists. |
| `GET` | `/api/character/load` | Bearer | Load character data. Returns `{ ok, data, name }`. `identity.name` injected from DB key. |
| `POST` | `/api/character/save` | Bearer | Save character data. Body: full save JSON with `version` field. Strips `identity.name` before persisting. Preserves server-side achievements. |
| `POST` | `/api/character/claim` | Bearer | Set password. Body: `{ password }` (min 4 chars). Bcrypt hashed. 409 if already claimed. |
| `GET` | `/api/character/claimed` | Bearer | Check if account has password. Returns `{ ok, claimed: bool }`. |
| `POST` | `/api/character/login` | None | Login with credentials. Body: `{ name, password }`. Returns `{ ok, session_id }` (new session). 401 on bad password, 404 if not found. |

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
| `GET` | `/health` | None | Health check. Returns `{ status: "ok" }`. |
| `GET` | `/ready` | None | Readiness check. Same as `/health`. |
| `GET` | `/metrics` | None | Server metrics (uptime, request count, etc.). |

---

## Asset API (`/api/v1/*`)

Legacy data provider endpoints for WZ asset serving.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/asset/:type/:id` | None | Get asset entity by type and ID. |
| `GET` | `/api/v1/asset/:type/:id/:section` | None | Get asset section. |
| `POST` | `/api/v1/batch` | None | Batch asset lookup. |
| `GET` | `/api/v1/blob/:hash` | None | Get blob by content hash. |

---

## WebSocket

| Path | Description |
|------|-------------|
| `/ws` | Game WebSocket. First message must be `{ type: "auth", session_id: "..." }`. See `shared-schema.md` for all message types. |
