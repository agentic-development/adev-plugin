---
name: adev-hygiene
description: Context maintenance and audit. Detects stale specs, constitution drift, coverage gaps, and sync issues across the context kit.
---

# Context Hygiene Audit

Audit the health of `.context-kit/` and report staleness, drift, and coverage gaps.

Full implementation pending. See design doc Part 3, Phase 3.

## Checks

| Check | Description |
|-------|-------------|
| **Staleness** | Specs or charters not updated in 30+ days while their source files changed |
| **Drift** | CLAUDE.md out of sync with constitution (compare hashes or content) |
| **Coverage** | Source directories without a corresponding Feature Charter |
| **Orphans** | Specs referencing modules or files that no longer exist |
| **Review status** | Specs that have not been reviewed or have stale reviews |
| **ADR gaps** | Significant architectural changes (detected via git log) without corresponding ADRs |
| **Sync targets** | Agent files listed in manifest but missing or outdated |

## Process

1. **Read manifest:** Load `.context-kit/manifest.yaml` for sync targets and registered modules.
2. **Run checks:** Execute each check category above.
3. **Generate report:** Write findings to `.context-kit/hygiene/audit-report.md` with:
   - Summary (pass/warn/fail counts)
   - Detailed findings grouped by check type
   - Recommended actions (e.g., "Run /adev-sync", "Update charter for module X")
4. **Suggest fixes:** For automatically fixable issues (sync drift), offer to run the appropriate skill.

## Arguments

- No arguments: full audit
- `--check <type>`: run a single check (staleness, drift, coverage, orphans, review, adrs, sync)
- `--fix`: auto-fix issues where possible (runs /adev-sync for drift, etc.)
