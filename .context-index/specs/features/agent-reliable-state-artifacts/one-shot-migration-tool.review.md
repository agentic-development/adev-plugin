# Architecture Review: one-shot-migration-tool

> **Date:** 2026-05-11 (round 2)
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** PASS

last-reviewed-revision: 3
file-sha: 51672c96130fe771d110a31672f675fb65bb5dae

> **rev 3 inline fix landed (2026-05-11):** SA-7 wording cleanup applied in the Actionable Task Map and Error Cases rows (Directory rename step, migrateLifecycleState, `--artifact=<name>` dispatcher, Tests: idempotency property, Tests: directory-rename collision, UNKNOWN_ARTIFACT allowlist). The fix was explicitly anticipated and approved by the structural-architect reviewer ("worth landing in rev 3 (or as an inline fix during plan) to remove the footgun"). The change is wording-only — no behavioral or architectural shift — bringing the task map and test rows into agreement with the load-bearing CON-2 step 4, AC, Behaviors, and Error Cases sections that already specify fatal collision. CON-4 (non-synthesizable canonical event variants) also addressed inline in the `migrateLifecycleState` row. CON-6 idempotency-test wording ("byte-identical") corrected to "skip-path byte-stability." `last-reviewed-revision` advanced to 3 and `file-sha` re-stamped; PASS verdict carries forward.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Round 1 → Round 2

Rev 1 returned BLOCK due to two structural-architect blockers: SA-1 (rename-collision contract self-contradictory across three sections) and SA-2 (idempotency claim grounded on non-deterministic `mtime`). Rev 2 made two architectural commitments — **collision is fatal** (no merge fallback; new `--artifact=lifecycle-state-skip-rename` escape hatch) and **idempotency is semantic, not byte-identical** (skip-on-completion). Plus 7 warnings and 8 suggestions across all three reviewers were addressed. This round-2 review verifies the architectural shifts and surfaces remaining documentation polish.

## Structural Architect (structural-architect)

**Verdict:** PASS (with one polish suggestion)

### Rev-1 Resolution Audit

- **SA-1 (blocker, collision contract):** RESOLVED — All three previously-contradictory sections now agree on fatal-collision: CON-2 step 4 ("Collision is fatal" + per-file `LIFECYCLE_STATE_FILE_EXISTS`); AC ("never merges"); Behaviors (`RENAME_COLLISION` + `LIFECYCLE_STATE_FILE_EXISTS` fatal); Error Cases table (both exit 1); CLI Surface defines `--artifact=lifecycle-state-skip-rename` escape hatch. Cosmetic inconsistency in one Actionable Task Map row noted as SA-7 below.
- **SA-2 (blocker, idempotency):** RESOLVED — New "Idempotency Model (semantic, not byte-identical)" subsection explicitly commits to semantic idempotency via skip-on-completion; CON-4 reiterates; AC splits into "Semantic idempotency" + "No deterministic-generation requirement"; new `BUILD_STATE_ORPHAN` exit-1 code closes the partial-resume gap by refusing autonomous resumption. Clean architectural commitment.
- **SA-3 (warning, "only authorized reader"):** RESOLVED — Behavioral Contract verbatim adoption: "only **write-side** consumer of legacy formats; read-side legacy fallbacks remain available but optional."
- **SA-4 (warning, untouched definition):** RESOLVED — CON-4 grounds skip-conditions on `milestones.json` presence at resolved storage root; "untouched" no longer defined by mtime.
- **SA-5 (suggestion, indivisibility):** RESOLVED — CLI Surface explicit: `--artifact=lifecycle-state` performs step 3 + step 4 atomically; rename only after every per-file translation succeeds.
- **SA-6 (suggestion, advisory scope):** RESOLVED — `/adev:sync` advisory emission restricted to `action: "migrated"` only.

### New Findings (rev 2)

### Finding SA-7

- **Severity:** suggestion
- **Location:** Actionable Task Map row "Directory rename step" + the rename-collision test row.
- **Finding:** The row still reads: "On collision (target exists), logs a warning and skips the rename." This is the rev-1 (a) branch that rev 2 categorically rejected. The corresponding test row similarly says "lifecycle-state files are merged or refused per the defined rule." Every other section of the spec (CON-2 step 4, AC, Behaviors, Error Cases) now says collision is fatal. The Actionable Task Map is what `/adev:plan` reads to generate tasks; a planner that uses these rows verbatim would build the wrong contract.
- **Recommendation:** Update both rows to mirror CON-2 step 4: "On collision (target directory OR any target file exists), abort with `RENAME_COLLISION` / `LIFECYCLE_STATE_FILE_EXISTS` exit 1; never merge." Update the test row accordingly. Non-blocking because the binding contract sections agree, but worth landing in rev 3 (or as an inline fix during plan) to remove the footgun.

#### Operator-recovery flow for `BUILD_STATE_ORPHAN`

Recovery flow is well-defined and not awkward: operator inspects orphan slug, decides keep/discard/merge, moves source file aside, re-runs `adev migrate` (CON-4 short-circuits because migrated targets already exist). No new finding.

#### `--artifact=lifecycle-state-skip-rename` allowlist gap

CLI Surface "Valid names" line (in the `--artifact=<name>` section) includes the new value; the original "Valid names" list in Naming Conventions and the `UNKNOWN_ARTIFACT` Error Cases row do not. Internal-doc completeness gap, folded into SA-7 (implementer should treat the CLI Surface "Valid names" line as authoritative).

## Security Reviewer (security-reviewer)

**Verdict:** PASS

### Rev-1 Resolution Audit

- **SEC-1 (warning, size caps):** RESOLVED — Path Safety item 7 declares per-artifact caps enforced in pre-flight before any parser runs. New `LEGACY_FILE_TOO_LARGE` code; fixture-per-cap tests in AC.
- **SEC-2 (warning, slug allowlist):** RESOLVED — Path Safety item 6 imposes `[a-z0-9._-]+` allowlist on legacy `build-state/*.json` stems + realpath-prefix containment on derived target paths. `INVALID_LEGACY_SLUG` aborts pre-flight; `../escape.json` fixture test asserted.
- **SEC-3 (warning, constitution scope):** RESOLVED — CON-2 step 7 parses markdown heading structure, scopes literal replacement to active table only, refuses on multi-occurrence with `CONSTITUTION_AMBIGUOUS_MATCH` and line numbers. AC covers active-table / fenced-code / code-only / already-migrated cases.
- **SEC-4 (suggestion, advisory redaction):** RESOLVED — Path Safety item 9 restricts advisories to `{ artifact, file, code, line, column, context }` plus 200-char non-printable-stripped window; explicit secret-bearing-line fixture test.
- **SEC-5 (warning, state-injection):** RESOLVED — Collision is fatal; no append, no merge; prepended-content precedence vector gone.
- **SEC-6 (warning, read-path containment):** RESOLVED — Path Safety item 5 asserts realpath-prefix containment on read AND write paths before file open; AC covers `/etc/passwd` and symlink-escape payloads.

### New Findings (rev 2)

No new findings.

Notes on what was checked:
- `lifecycle-state-skip-rename` escape hatch: safe. Still enforces `LIFECYCLE_STATE_FILE_EXISTS` per-file abort + slug allowlist + realpath containment. Cannot reopen SEC-5.
- New error codes carry only structural fields (slug, path, line numbers, SHA-256 fingerprints). No raw content leak.
- Advisories (`LEGACY_FILE_LINGERING`, `GRANULARITY_LEGACY_ISSUE`) carry file paths and issue IDs only; consistent with item-9 redaction.
- Behavioral Contract rewording correctly bounds the "only consumer" claim to the write side.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS (with 4 suggestions)

### Rev-1 Resolution Audit

- **CON-1 (suggestion, `--flag=value` pattern):** NOT ADDRESSED — Spec still claims `--artifact=<value>` "matches the conventions already established by the CLI's other subcommands"; `cli/index.mjs` only has `--provider <value>` (space-separated). Carry forward as suggestion.
- **CON-2 (suggestion, `sync.targets` manifest key):** RESOLVED — Rev 2 reworded to "any other agent files declared by the project's existing `/adev:sync` configuration." No `sync.targets` references remain.
- **CON-3 (suggestion, merge-fallback log ordering):** RESOLVED — Cascading fix from SA-1's "collision is fatal." Merge fallback no longer exists; non-monotonic `ts` is unreachable.
- **CON-4 (suggestion, event variants):** NOT ADDRESSED — Spec still lists the five synthesizable variants but adds no note explaining that the other canonical variants (`plan_task`, `debug_intervention`, `recovery_record`, `manual_override`) are not synthesizable from legacy `build-state` data. Carry forward as suggestion.

### New Findings (rev 2)

### Finding CON-5

- **Severity:** suggestion
- **Category:** terminology / cross-spec alignment
- **Location:** Path Safety rule 7 (this spec) vs. `execution-state-migration.spec.md` (`STATE_FILE_TOO_LARGE`).
- **Finding:** Two similar error codes coexist with deliberately different scopes: `LEGACY_FILE_TOO_LARGE` (pre-flight migration read, 1 MB cap on legacy `.execution-state.md`) vs. `STATE_FILE_TOO_LARGE` (runtime read of post-migration `.execution-state.json`, 256 KB cap). A reader unaware of the distinction may be confused about which fires when.
- **Recommendation:** Add one sentence to Path Safety rule 7: "The 256 KB cap from `execution-state-migration.spec.md` applies only to the post-migration `.execution-state.json` runtime read; pre-flight migration reads of the legacy `.execution-state.md` use the 1 MB cap above."

### Finding CON-6

- **Severity:** suggestion
- **Category:** terminology
- **Location:** Actionable Task Map "Tests: idempotency property" row.
- **Finding:** Row says "assert byte-identical state after each run" — colliding with the surrounding "semantic idempotency, not byte-identical" pivot. Under the skip-path it's technically consistent (second run writes nothing → byte-identical) but the phrasing may confuse a planner.
- **Recommendation:** Reword to "assert no on-disk diff to migration targets after the second run (skip-path byte-stability)."

---

## Summary

**Total findings:** 0 blockers, 0 warnings, 5 suggestions (1 SA + 2 CON carried-forward + 2 new CON).

**Status:** PASS — both rev-1 blockers (SA-1, SA-2) resolved; all 7 rev-1 warnings resolved; no new blockers or warnings introduced. The 5 suggestion-level findings are documentation polish that can be addressed in a quick rev 3 or in-line before plan; SA-7 in particular is worth landing inline before `/adev:plan` reads the stale Actionable Task Map row verbatim. `/adev:plan --spec one-shot-migration-tool.spec.md` may proceed.

**Suggestion summary:**
- SA-7 stale "skips the rename" wording in Actionable Task Map (contradicts the rest of the spec; the planner may use it verbatim)
- CON-1 `--flag=value` claim of established convention (not actually established)
- CON-4 non-synthesizable canonical event variants not preemptively noted
- CON-5 cross-spec error-code disambiguation (`LEGACY_FILE_TOO_LARGE` vs `STATE_FILE_TOO_LARGE`)
- CON-6 stale "byte-identical" wording in idempotency test task row
