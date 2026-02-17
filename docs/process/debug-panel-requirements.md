# In-Game Debug Panel Requirements

## Required sections
1. Map info
2. Entity counts
3. Memory/cache stats
4. Network stats
5. Last API errors

## Required controls
- map warp
- spawn mob
- spawn NPC
- clear entities
- reload map sections
- audio test
- packet simulator

## Security rule
- Debug controls must be available only in debug builds/mode.
- Production mode must not dispatch debug actions.

## Validation targets
- Visibility logic must be testable by mode.
- Control dispatch must be testable and auditable via structured debug events.

## Reference implementation
- `tools/observability/debug-panel.mjs`
- `tools/observability/debug-panel.test.mjs`
