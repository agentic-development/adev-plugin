# Architecture Review: execution-state-migration

> **Date:** 2026-05-11 (round 2)
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/execution-state-migration.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** PASS

last-reviewed-revision: 2
file-sha: def05cf30a8c860abc65792ebc4ef7c3fd7f1626

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Round 1 → Round 2

Rev 1 returned PASS_WITH_NOTES (0 blockers, 5 warnings, 9 suggestions). Rev 2 applied targeted fixes addressing every warning plus the highest-value suggestions. This round 2 review verifies each fix.

## Structural Architect (structural-architect)

**Verdict:** PASS

### Rev-1 Resolution Audit

- **SA-1 (warning, charter↔spec `null` vs `""`):** RESOLVED — Spec adds an explicit "Schema delta vs. charter (CON-2 from review rev 1)" subsection calling out the two normative divergences (`""` vs `null`; `progress: []` is part of on-disk shape) with rationale tying them to `readExecutionState`'s existing round-trip return shape.
- **SA-2 (suggestion, grep test):** RESOLVED — Tightened to "no `yaml` / `YAML` (case-insensitive) string and no `^---` regex match (legacy frontmatter sentinel)."
- **SA-3 (suggestion, two-helper piping):** RESOLVED — New "Single-helper design" subsection commits to one helper `hooks/_execution-state.mjs` with mode dispatch via `ADEV_EXECUTION_STATE_MODE`. Two-helper design explicitly rejected with perf rationale; AC asserts `_render-resume-block.mjs` does NOT exist.
- **SA-4 (suggestion, test fixture migration):** RESOLVED — Dedicated AC requires existing tests to materialize `.context-index/manifest.yaml` in fixture roots.

### New Findings (rev 2)

No new findings.

The single-helper redesign is coherent: mode dispatch is invisible to bash callers, the helper remains an unregistered parsing/formatting subprocess, exit-code ownership stays with the shell entry points, stderr-discard rules applied uniformly. The new field-rendering-safety task-map row and AC bound size cleanly (256 KB file cap, 4 KB free-text truncation, 256 B / 100-entry progress caps). Schema delta subsection is structurally clean. Data flow unambiguous. No new dependencies.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

### Rev-1 Resolution Audit

- **SEC-1 (warning, symlink resolution):** RESOLVED — Path Safety item 2 now uses `fs.realpathSync.native()` on both `projectRoot` and the resolved state-file's parent directory, with a realpath-prefix containment check. CWE-22 and CWE-59 cited. AC mandates a symlink-escape fixture test. Tautological equality check is gone.
- **SEC-2 (warning, unbounded stdin):** RESOLVED — 256 KB size cap specified in three places: task map "`readExecutionState` tolerance" row, AC, error-cases row. Oversized files return `null` with `STATE_FILE_TOO_LARGE` warning to discarded stderr. (The cap applies on file size, not stdin — appropriate, since `readExecutionState` reads the file directly.)
- **SEC-3 (suggestion, markdown injection):** RESOLVED — Field-rendering safety rules specified in task map, AC, and Behaviors. Newline-replacement and per-field truncation (4 KB / 256 codepoints / 100 entries) explicit. Codepoint-based truncation correctly handles Unicode.
- **SEC-4 (suggestion, helper stderr):** RESOLVED — `2>/dev/null` discard explicit in Hook Protocol Compliance, refactor task rows, AC; CI architectural test mandated.

### New Findings (rev 2)

No new findings.

Threat-model review of the new `ADEV_EXECUTION_STATE_MODE` env var: it is set by the trusted shell entry points the plugin itself ships, not by attacker input. Mode dispatch defaults safely to `resume-block` on unknown values, unknown-mode warning goes to discarded stderr. No privilege change between modes — both call `readExecutionState(projectRoot)` with identical path-containment guards. No new attack surface.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

### Rev-1 Resolution Audit

- **CON-1 (warning, legacy-read asymmetry):** RESOLVED — Path Safety item 3 contains "Note on legacy-read parity" explicitly disclaiming the json-adapter's `tasks.legacy_read` fallback does not apply; rationale stated. Preconditions reinforce.
- **CON-2 (warning, charter schema delta):** RESOLVED — New "Schema delta vs. charter (CON-2 from review rev 1)" subsection explicitly documents both divergences with rationale tied to today's round-trip shape.
- **CON-3 (suggestion, temp-file naming strength):** RESOLVED — Atomic-write task-map row preserves `randomBytes(4).toString('hex') + '.tmp'` pattern with explicit parity to `lib/build-state.mjs::atomicWriteJson`. Path Safety item 2 retains strict temp-suffix containment.
- **CON-4 (suggestion, terminology):** RESOLVED — Hook Protocol Compliance section uses "registered hook entry points" and "parsing subprocess only" verbatim.
- **CON-5 (suggestion, atomic-write cleanup):** RESOLVED — Atomic-write task-map row explicitly states "best-effort `fs.unlinkSync` cleanup on the failure path (swallowing cleanup errors) before re-throwing the original error" with direct rev-1 call-out.
- **CON-6 (suggestion, helper naming):** RESOLVED — Hook Protocol Compliance section cites `_`-prefix convention with `hooks/_lifecycle-gate-check-bash.mjs` and `hooks/_parse-stdin.sh` precedents.

### New Findings (rev 2)

No new findings.

Naming-convention check on the new single-helper design:
- `ADEV_EXECUTION_STATE_MODE` follows established `ADEV_<NOUN>_<SUFFIX>` upper-snake convention (`ADEV_CONTEXT_ROOT`, `ADEV_PLUGIN_ROOT`, etc.).
- Mode values `read` / `resume-block` are lowercase-kebab, consistent with the status enum (`idle`, `active`, `blocked`, `standalone`).
- Helper filename `hooks/_execution-state.mjs` matches `_<artifact-name>` underscore-prefix convention.
- New error codes (`STATE_FILE_TOO_LARGE`, `HELPER_BOOTSTRAP_ERROR`, `UNKNOWN_HELPER_MODE_DEFAULTED`, `ARCH_VIOLATION_*`) are `UPPER_SNAKE_CASE` matching existing family.

---

## Summary

**Total findings:** 0 blockers, 0 warnings, 0 new suggestions (all rev-1 warnings + suggestions resolved).

**Status:** Ready for planning. `/adev:plan --spec execution-state-migration.spec.md` may proceed.
