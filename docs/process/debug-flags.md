# Runtime Debug Flags

These flags control debug behavior across client/server/tools.

## Global flags
- `DEBUG_MODE` (`true|false`, default: `false`)
- `DEBUG_LOG_LEVEL` (`trace|debug|info|warn|error`, default: `info`)

## Scope-specific flags
For each scope (`CLIENT`, `SERVER`, `TOOLS`) define:
- `${SCOPE}_DEBUG_VERBOSE_ASSETS` (`true|false`, default: `false`)
- `${SCOPE}_DEBUG_VERBOSE_NETWORK` (`true|false`, default: `false`)
- `${SCOPE}_DEBUG_SIMULATED_LATENCY_MS` (integer `>=0`, default: `0`)

Examples:
- `CLIENT_DEBUG_VERBOSE_ASSETS=true`
- `SERVER_DEBUG_VERBOSE_NETWORK=true`
- `TOOLS_DEBUG_SIMULATED_LATENCY_MS=150`

## Safety defaults
- Production-safe by default (all verbose flags disabled).
- Latency simulation disabled unless explicitly set.
- Invalid values are sanitized to safe defaults.

## Reference implementation
- `tools/observability/debug-flags.mjs`
- `tools/observability/debug-flags.test.mjs`
