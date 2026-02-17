# Global Definition of Done (DoD)

This checklist is mandatory for every significant task.

## Required completion checklist
- [ ] Schema validation completed (or explicitly marked `N/A` with reason)
- [ ] Automated tests executed and passing
- [ ] Debug-mode verification executed (human-in-the-loop)
- [ ] Relevant logs inspected and summarized
- [ ] `.memory/` updated with architecture/progress changes
- [ ] `docs/pwa-findings.md` updated (for significant changes)

## Required evidence format
Each completed task must provide a markdown evidence file that includes these sections exactly:

1. `## Metadata`
2. `## Definition of Done Checklist`
3. `## Automated Test Evidence`
4. `## Debug Mode Verification`
5. `## Logs Reviewed`
6. `## Memory and Docs Updates`
7. `## Artifacts`

Policy checker:

```bash
bun tools/policy/check-dod-evidence.mjs <path-to-evidence.md>
```

The checker fails if required sections are missing or mandatory DoD checklist items are not checked.
