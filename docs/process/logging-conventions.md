# Unified Logging Conventions

Applies to: `client`, `server`, and `tools/build-assets`.

## Log levels (standardized)
Use exactly these levels:
1. `trace` — very high-volume diagnostics (off by default)
2. `debug` — development diagnostics
3. `info` — normal lifecycle events
4. `warn` — recoverable issues / degraded behavior
5. `error` — failed operations requiring action

## Required structured fields
Every log event must include:
- `timestamp` (ISO 8601)
- `level`
- `component`
- `event`
- `entityType` (nullable)
- `entityId` (nullable)
- `mapId` (nullable)
- `requestId` (nullable)
- `message` (optional but recommended)

## Logging guidance
### Log state transitions
Log at `info` for transitions such as:
- map load start/finish
- character spawn/despawn
- API request start/finish
- websocket connect/disconnect

### Avoid noisy frame logs
Do not log per-frame movement/render updates by default.
- Use `trace` only behind explicit debug flags.
- Aggregate counters where possible (e.g., every N seconds).

### Error detail requirements
For `warn` and `error`, include:
- stable error code (when available)
- user-impact summary
- retry/fallback behavior (if any)

## Reference implementation
- `tools/observability/logging.mjs`
- `tools/observability/logging.test.mjs`
