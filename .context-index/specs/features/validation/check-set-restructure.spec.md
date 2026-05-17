---
charter: validation
status: validated
kind: refactor
mode: refactor
revision: 2
charter-revision: 1
created: 2026-05-15
updated: 2026-05-16
depends-on:
  - .context-index/specs/features/validation/validate-config-single-source.spec.md
  - .context-index/specs/features/validation/configurable-checks.spec.md
  - .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
  - .context-index/specs/features/multi-repo-workspace/charter.md
coordinated-with:
  - .context-index/specs/features/reconcile/charter.md
  - .context-index/specs/features/maintenance/charter.md
  - .context-index/specs/features/review/charter.md
tracker-ref: issue-490
source-manifest:
  sha: "6ebea3d"
  computed-at: "2026-05-16T03:14:14.875Z"
  files:
    - .context-index/governance/validate.yaml
    - .context-index/specs/features/validation/charter.md
    - hooks/hooks.json
    - hooks/post-validate-extract-heuristics.mjs
    - hooks/post-validate-extract-heuristics.sh
    - lib/governance/validate-config.mjs
    - skills/hygiene/SKILL.md
    - skills/reconcile/SKILL.md
    - skills/review-specs/consistency-analyzer-prompt.md
    - skills/review-specs/structural-architect-prompt.md
    - skills/validate/SKILL.md
    - skills/validate/checks/validate.check-11-visual-verification.md
    - skills/validate/checks/validate.check-2-spec-compliance.md
    - skills/validate/checks/validate.check-4-constitution.md
    - templates/domains/software/validate.yaml
drift_detected: true
drift_source: skills/validate/SKILL.md
drift_at: 2026-05-17T20:34:52.868Z
---

> **Revision 2 (2026-05-15):** Addresses rev-1 warnings SA-1 (cross-charter coordination), SA-2 (scope-expansion contract pin), SA-3 (removed-ID rule consolidation), SA-4 (dependency-order declaration), SA-5 (post-validate hook scope note), SA-6 (reconcile authoritative-channel AC), CON-1 (line 30 count and REMOVED wording), and SEC-1 (heuristic hook input scoping). Migration Path retargeted to `governance/validate.yaml` per the explicit ordering declaration (this spec lands AFTER `validate-config-single-source.spec.md`).

# Refactoring Spec: Validate Check Set Restructure

Re-home or drop the validate checks that duplicate spec-time gates from `/adev:review-specs`, belong in `/adev:hygiene` or `/adev:reconcile`, or never produce signal in this project's configuration. Validate retains only the checks that genuinely verify code at code-time.

This spec is registry edits on the infrastructure shipped by `configurable-checks.spec.md` (status: validated). It does not introduce new check-runner machinery; it removes registry entries and migrates the corresponding logic to its proper home.

## Current State

### Structure

| File | Role | Notes |
|------|------|-------|
| `templates/validate/defaults.yaml` | Bundled check registry (12 entries: Checks 1.5 and 2-12) | Each entry: `id`, `kind`, `severity`, `profile`, etc. Check 13 (heuristic extraction) exists separately in `skills/validate/SKILL.md` prose, not in this registry file. |
| `skills/validate/SKILL.md` | Skill prose; calls `loadValidateConfig()` then dispatches each registry entry | ~900 lines; per-check sections at lines 155-637 |
| `lib/governance/validate-config.mjs` | Registry loader, validator, topological sorter | Unchanged by this refactor |
| `skills/review-specs/templates/defaults.yaml` (`templates/review-specs/defaults.yaml`) | Reviewer registry (structural-architect, consistency-analyzer, security-reviewer) | Target destination for some moved checks |
| `skills/hygiene/SKILL.md` | 18 audit passes | Target destination for Check 10 |
| `skills/reconcile/SKILL.md` | Lifecycle reconciliation | Target destination for Check 12 |

### Problems

Measured across 88 historic `.validate.md` reports (1,040 check headers, 4 FAILs total):

1. **9 of 13 checks duplicate spec-time gates from `/adev:review-specs` or never produce signal in this project's configuration.** Per-check outcomes:

   | Check | N | PASS | NO-OP | NOISE | FAIL | Diagnosis |
   |---|---|---|---|---|---|---|
   | 3 Charter Consistency | 78 | 100% | 0% | 0% | 0% | Transitively redundant given Check 2 + review-specs/structural-architect |
   | 4 Constitution Compliance | 78 | 100% | 0% | 0% | 0% | Real code-level check; never failed because upstream pipeline propagates constraints |
   | 7 Specialist Review | 76 | 4% | 96% | 0% | 0% | Duplicate dispatch path; review-specs already runs the same registry |
   | 9 Transition Gates | 75 | 9% | 91% | 0% | 0% | Project has no transitions configured |
   | 10 Platform Drift | 79 | 82% | 18% | 0% | 0% | Repo-level concern; identical answer for every spec in a run |
   | 11 Visual Verification | 79 | 0% | 100% | 0% | 0% | Never PASSed; BLOCKs when no UI files exist and Playwright MCP absent |
   | 12 Lifecycle Reconciliation | 49 | 43% | 4% | 49% | 0% | Bookkeeping noise; plan-checkbox sub-check architecturally wrong per `plan-task-events.spec.md` |
   | 13 Heuristic Extraction | 45 | 31% | 69% | 0% | 0% | Side effect, not a verdict-affecting check (already `kind: observational`) |

2. **Check 11 BLOCKs validation for specs with no UI files when Playwright MCP is unavailable.** Per current `skills/validate/SKILL.md` lines 392-404, the BLOCK fires whenever ANY UI patterns match in the implementation diff — but the project's non-UI specs would never reach those patterns. 79/79 historic dispatches resolved as SKIP/N/A — the check is reachable in theory only.

3. **Check 12 produces 49% WARN rate (24/49 dispatches), and every WARN is bookkeeping rather than validation failure.** Sample bodies: "Spec status: implemented → validated. Charter capability row: promoted to validated. Plan checkboxes: 30/30 marked complete." That is a success log labelled WARN. The plan-checkbox sub-check (which fires in 100% of these WARNs) contradicts `agent-reliable-state-artifacts/plan-task-events.spec.md`, which establishes that plan task state lives in the lifecycle event log, not the markdown checkboxes.

4. **Validate dispatch token cost averages ~3× the implement dispatch cost** (~95K vs ~25K per spec, measured during the 2026-05-15 lifecycle-artifacts charter build). This figure is from a single charter and uses session JSONL approximations; per the validation-module heuristic on token measurement, the post-restructure measurement must use real JSONL parsing to validate any savings claim.

### Dependencies

Migration constraints — code or artifacts that consume the current behaviour:

- **88 historic `.validate.md` reports** use the current check numbering (Check 3, 5, 6, 7, 10, 11, 12, 13). Reports written before this refactor must remain readable; no retroactive renumbering.
- **`skills/plan/SKILL.md` CODE_DRIFT gate** consumes Check 1.6's drift signal — Check 1.6 must remain in validate (and remains in the surviving registry).
- **`skills/build/SKILL.md` orchestrator** dispatches validate per spec; uses verdict (PASS/FAIL/PASS_WITH_NOTES) but does not depend on per-check identity. Verdict semantics must be preserved.
- **`skills/hygiene/SKILL.md` Audit Pass 17** reads `drift_detected` from spec frontmatter — unrelated to this refactor but adjacent.
- **The validation charter itself** is currently stale ("11 ordered checks"); the restructure will further alter the count. Charter Skills section must be re-synced as part of this work.
- **The `validation` charter's `configurable-checks.spec.md`** acceptance criterion "Disabling `validate.check-10-platform-drift` causes it to appear as `SKIPPED-DISABLED`" presumes Check 10 is in the registry — this refactor removes it. The earlier spec's AC is honored historically; it remains true at the moment it was validated.

## Target State

### Structure

| File | Role | Notes |
|------|------|-------|
| `templates/validate/defaults.yaml` | Bundled registry, **4-6 entries** | 1.5 Source Manifest, 2 Spec Compliance, 4 Constitution Compliance; conditionally 8 Boundaries, 9 Transition Gates |
| `skills/validate/SKILL.md` | Skill prose for surviving checks; prose for relocated checks removed | Includes new Check 2 sub-finding "scope expansion detected" (absorbs Check 3) |
| `skills/hygiene/SKILL.md` | Adds Audit Pass 19: Platform Drift (migrated from Check 10) | |
| `skills/reconcile/SKILL.md` | Gains lifecycle-reconciliation section with `--fix` as default mode (migrated from Check 12) | |
| `templates/review-specs/defaults.yaml` | Adds ADR-compliance and cross-cutting-compliance coverage | Either as new reviewer entries, or as extensions to existing structural-architect / consistency-analyzer prompts |
| `hooks/post-validate-extract-heuristics.{sh,mjs}` | Post-validate hook running heuristic extraction (migrated from Check 13) | Non-blocking; verdict unaffected |
| `.context-index/specs/features/validation/charter.md` | Skills section re-synced to reflect post-restructure count | Currently says "11 ordered checks"; will be accurate after migration |

### Improvements

1. **Eliminate redundant subagent dispatches.** 6 registry entries removed; their concerns either reach the spec at spec-review time (review-specs) or run once at repo level (hygiene/reconcile) rather than per spec.
2. **Eliminate Check 12 noise.** Lifecycle reconciliation runs in `/adev:reconcile` with `--fix` as the default mode, rather than emitting WARN at validate-time for the same observations.
3. **Restore validate's ability to run on non-UI specs without Playwright.** Check 11 no longer BLOCKs when implementation files include no UI patterns AND Playwright MCP is absent.
4. **Tighten Check 4 authoring contract.** Findings must cite file:line evidence; rubber-stamp PASS reports rejected.
5. **Validate's surviving check set has clear semantics:** Check 1 (quality gates), 1.5 + 1.6 (drift signals), 2 (code-vs-spec), 4 (code-vs-constitution), and optionally 8/9 when governance is configured. Each carries a non-redundant code-time concern.
6. **Per-charter token cost target (must be measured, not asserted).** Per validation-module heuristic on token measurement, the spec commits to JSONL-based pre/post measurement on a representative charter. The hypothesis is meaningful reduction; the spec deliberately does not pre-claim a specific percentage.

## Changes Catalog

### ADDED

- `skills/hygiene/SKILL.md` Audit Pass 19: Platform Drift — compares `.context-index/platform-context.yaml` against `package.json` per repo (formerly Check 10).
- `skills/reconcile/SKILL.md` section: Lifecycle reconciliation — issue/epic/spec/charter sync (formerly Check 12). `--fix` is the default mode.
- `templates/review-specs/defaults.yaml` ADR + cross-cutting coverage — implemented as either two new reviewer entries (`adr-reviewer`, `cross-cutting-reviewer`) or as appended scope items in `structural-architect-prompt.md` and `consistency-analyzer-prompt.md`. The spec leaves this implementation choice to the plan stage.
- `hooks/post-validate-extract-heuristics.{sh,mjs}` — runs after validate completes, performs the work formerly done by `validate.check-13-heuristic-extraction`. Non-blocking; verdict unaffected.
  - **Input scoping (rev-2 SEC-1 fix):** The hook receives **structured verdict metadata only** — per-check IDs, outcomes (PASS/FAIL/WARN/SKIP), elapsed time, check count. The hook **must not read or re-emit** quality-gate subprocess stdout/stderr or any other content that flows through the redaction pipeline. This keeps heuristic extraction outside the audited-output channel defined by `configurable-checks.spec.md` Behavior 25a and prevents inadvertent secret leakage into the heuristic store.
  - **Charter scope (rev-2 SA-5 acknowledgement):** This hook is structurally placed under the validation charter for v1 because heuristic extraction is currently coupled to validate completion. A follow-up issue evaluates moving it to an event-driven consumer of the lifecycle log (potentially under `/adev:learn` or a new heuristics-extraction charter); deferred to a separate spec.
- Check 2 sub-finding: **"scope expansion detected"** — fires when Check 2 finds implementation touches files outside the spec's listed scope. Absorbs the responsibility formerly assigned to Check 3.

### MODIFIED

- `skills/validate/SKILL.md` — per-check prose for relocated/dropped checks removed. Surviving-check prose unchanged except:
  - Check 2: adds scope-expansion sub-finding logic + reporting.
  - Check 4: authoring contract tightened — every finding must cite at least one file:line or grep result; findings without evidence rejected.
  - Check 11: trigger semantics revised — SKIP (not BLOCK) when no UI files match AND Playwright MCP absent. BLOCK preserved when UI files match AND Playwright MCP absent.
- `templates/validate/defaults.yaml` — entries reduced from 12 to 4-6 (baseline 1.5, 2, 4; conditionally 8, 9).
- `.context-index/specs/features/validation/charter.md` Skills section — re-synced to match post-restructure check inventory.

### REMOVED

- `validate.check-3-charter-consistency` — subsumed by Check 2's scope-expansion sub-finding.
- `validate.check-5-adrs` — moved to review-specs (covered by ADR coverage added there).
- `validate.check-6-cross-cutting` — moved to review-specs (covered by consistency-analyzer extension or new reviewer).
- `validate.check-7-specialist-review` — duplicate dispatch path; review-specs already runs the same specialist registry.
- `validate.check-10-platform-drift` — moved to hygiene Audit Pass 19.
- `validate.check-11-visual-verification` — registry entry removed; logic preserved in `skills/validate/SKILL.md` as a conditional dispatch (only when implementation touches UI files AND Playwright is available).
- `validate.check-12-lifecycle-reconciliation` — moved to `/adev:reconcile`.
- `validate.check-12-heuristic-extraction` — moved to post-validate hook. (Note: the registry uses `check-12-heuristic-extraction` as the canonical ID even though the corresponding skill prose section is labeled "Check 13". Both the registry entry and the SKILL.md Section 13 prose are removed.) Addresses rev-1 CON-1.

### RENAMED

- None. Surviving check IDs (`validate.check-1.5-source-manifest`, `validate.check-2-spec-compliance`, `validate.check-4-constitution`, optionally `validate.check-8-boundaries`, `validate.check-9-transition-gates`) keep their existing names. Numbering gaps are intentional — they preserve historic report readability.

## Migration Path

**Hard ordering declaration (rev-2 SA-4 fix):** This spec lands **after** `validate-config-single-source.spec.md`. After that sibling ships, the bundled `templates/validate/defaults.yaml` no longer exists — the registry lives in `.context-index/governance/validate.yaml`, and per-check prompts live in `skills/validate/checks/<id>.md` files. Every "Drop X from registry" step below targets `.context-index/governance/validate.yaml` and the corresponding per-check prompt file, not the (deleted) bundled defaults. The validate skill's project-config also no longer reads from a bundled fallback. If for any reason this spec lands first, the same edits apply but to `templates/validate/defaults.yaml` (the file the sibling will subsequently delete) and the per-check prose sections in `skills/validate/SKILL.md`.

Order matters: destinations land before sources are removed, smallest changes before larger ones, measurement at the end.

### Step 1: Land destinations for moved checks (cross-charter coordination required)

- **What:** Add hygiene Pass 19 (platform drift). Add reconcile lifecycle-sync section with `--fix` as default. Add review-specs ADR + cross-cutting coverage. Add post-validate heuristic-extraction hook.
- **Cross-charter coordination (rev-2 SA-1 fix):** Three of these additions modify sibling skills owned by other charters:
  - `/adev:reconcile` (maintenance charter) — flipping `--fix` to default is a user-visible behavior change to that skill; the corresponding charter and reconcile spec must be coordinated. Ideally this lands as a separate sibling spec under the maintenance charter, with this spec depending on it. If the plan stage chooses to keep it bundled here, the maintenance-charter owner must approve.
  - `/adev:hygiene` (maintenance charter) — Audit Pass 19 is additive (low coordination cost); the maintenance charter is updated to enumerate the new pass.
  - `/adev:review-specs` (assessment charter) — new reviewer entries (or extensions of existing prompts) coordinate with the review charter; reviewer-registry additions are within the existing `governance/review.yaml` overlay model so the coordination cost is documentation-level.
- **Why first:** The migrated logic must exist in its new home before the validate-side equivalent is removed; otherwise the project temporarily loses coverage.
- **Risk:** Low — additive only; existing tests untouched. Cross-charter coordination raises the *process* risk, not the *code* risk.
- **Verification:** Each destination's new logic fires on a fixture that previously triggered the validate-side check. Behavior is structurally equivalent (same fields, same severity classification).

### Step 2: Drop Check 12 (Lifecycle Reconciliation) from registry

- **What:** Remove `validate.check-12-lifecycle-reconciliation` entry from `templates/validate/defaults.yaml`. Remove corresponding prose section from `skills/validate/SKILL.md`. Validate no longer emits the 49% WARN.
- **Why before other drops:** Highest noise contributor; immediate user-visible improvement.
- **Risk:** Medium — users who relied on `/adev:validate` to surface lifecycle drift must now run `/adev:reconcile` explicitly. Build orchestrator (`skills/build/SKILL.md`) may need a follow-up entry to invoke reconcile post-validate.
- **Verification:** Re-validate a fixture that previously produced Check 12 WARN; new report has no Check 12 section. Run `/adev:reconcile` against the same fixture and confirm output structurally equivalent to the historic Check 12 WARN body.

### Step 3: Drop Check 10 (Platform Drift) from registry

- **What:** Remove `validate.check-10-platform-drift` entry. Validate no longer dispatches it.
- **Why next:** Simple, additive-already-landed.
- **Risk:** Low — hygiene Pass 19 covers the concern.
- **Verification:** Validate report no longer contains Check 10 section. Hygiene reports platform drift when run.

### Step 4: Guard Check 11 (Visual Verification) trigger

- **What:** Revise trigger logic in `skills/validate/SKILL.md`. When no UI files match the implementation diff AND Playwright MCP is unavailable → SKIP (not BLOCK). When UI files match AND Playwright is unavailable → BLOCK preserved.
- **Why:** Restores validate's ability to run on non-UI projects/specs.
- **Risk:** Medium — must not lose the BLOCK behavior for legitimate UI specs missing Playwright.
- **Verification:** Two fixtures:
  - Fixture A: spec touches no UI files, no Playwright → Check 11 SKIPs.
  - Fixture B: spec touches `.tsx` files, no Playwright → Check 11 BLOCKs with existing message.

### Step 5: Drop Check 3 + add Check 2 scope-expansion sub-finding

- **What:** Remove `validate.check-3-charter-consistency` from registry. Update Check 2 prompt (now at `skills/validate/checks/validate.check-2-spec-compliance.md` post-`validate-config-single-source`) to detect implementation files outside the spec's declared scope and emit a "scope expansion detected" sub-finding.
- **Scope-expansion contract (rev-2 SA-2 fix):** The spec's **declared scope** is the `source-manifest.files` list in the spec's frontmatter. Check 2 fails the scope-expansion sub-finding when implementation files (derived from the plan's task file lists, or — when no plan exists — the diff against the spec's last validated commit) include paths NOT under any directory implied by `source-manifest.files`. If `source-manifest.files` is absent from the spec, Check 2 emits a one-time INFO note "scope verification unavailable — spec has no source-manifest" rather than emitting a scope-expansion finding. This pins the input contract to an existing structural source of truth.
- **Why:** Check 3's substantive concern (implementation respects charter scope) is transitively covered by Check 2 (code matches spec, with scope-expansion now explicit) + review-specs (spec respects charter). Adding the sub-finding makes that transitivity explicit.
- **Risk:** Medium — Check 2 must reliably detect scope expansion. The prompt change introduces a new failure mode.
- **Verification:** Fixture A — implementation adds a file outside `source-manifest.files`: Check 2 emits scope-expansion sub-finding with the offending path. Fixture B — spec has no `source-manifest.files`: Check 2 emits the INFO note instead. Verdict semantics unchanged in both cases.

### Step 6: Drop Checks 5, 6, 7 from registry

- **What:** Remove `validate.check-5-adrs`, `validate.check-6-cross-cutting`, `validate.check-7-specialist-review` from `templates/validate/defaults.yaml`. Remove corresponding prose from `skills/validate/SKILL.md`.
- **Why:** All three are covered by review-specs after Step 1.
- **Risk:** Low if Step 1's review-specs additions verified.
- **Verification:** Re-validate the fixtures from Step 1; outcomes consistent with their `/adev:review-specs` predecessors.

### Step 7: Tighten Check 4 authoring contract

- **What:** Update Check 4 prompt: every finding (PASS or FAIL) must cite at least one file:line or grep result as evidence. Findings without evidence are rejected by the check-authoring contract and reported as FAIL.
- **Why:** Catches the gaming risk surfaced in the investigation — Check 4 at 100% PASS is statistically suspicious. Requiring evidence makes gaming detectable.
- **Risk:** Low — strengthens authoring discipline without changing scope.
- **Verification:** New Check 4 reports show file:line citations for all PASS findings. A Check 4 finding fabricated without evidence is rejected.

### Step 8: Drop Check 13 (Heuristic Extraction) from registry

- **What:** Remove `validate.check-12-heuristic-extraction` (the observational entry) from `defaults.yaml`. Heuristic extraction now runs from the post-validate hook landed in Step 1.
- **Why:** Side effect, not a check; delivery mechanism changes.
- **Risk:** Low — already `kind: observational`; verdict semantics never affected.
- **Verification:** Heuristics are extracted post-validate (verified by inspecting the heuristic store). No Check 13 section in validate report.

### Step 9: Update validate report template

- **What:** Update the report header / summary template in `skills/validate/SKILL.md` to reflect the new check inventory. Add a note for users comparing to historic reports: "Checks 3, 5, 6, 7, 10, 11 (when no UI), 12, 13 are relocated; see /adev:hygiene, /adev:reconcile, /adev:review-specs."
- **Why:** Users moving between old and new reports need orientation.
- **Risk:** Low.
- **Verification:** One end-to-end validate run produces well-formed report with new structure.

### Step 10: Sync stale validation charter

- **What:** Update `.context-index/specs/features/validation/charter.md` Skills section to accurately describe the post-restructure check inventory. Replace "11 ordered checks" language.
- **Why:** Don't leave the parent charter contradicting reality.
- **Risk:** None.
- **Verification:** Charter Skills section accurately describes current state.

### Step 11: Measurement

- **What:** Run JSONL-based token measurement (per validation-module heuristic on token measurement) on a representative charter (≥5 specs). Compare per-validate-dispatch token cost pre-restructure (from historic JSONL data) vs post-restructure (from a fresh run). Record the measured delta in this spec's outcome notes.
- **Why:** The retrospective's "~30% reduction" and "~95K → ~45K" estimates used skill-loading-overhead approximations, which the heuristic warns can be off by 2-2.5x. Real measurement validates the work.
- **Risk:** None (measurement only).
- **Verification:** Measured token cost recorded. Whether the result confirms or disappoints the hypothesis is itself a finding worth documenting.

## Invariants

- [ ] **All existing tests continue to pass at every migration step.** Each step's commit is independently green.
- [ ] **Zero-config behavior preserved.** A spec with no `governance/validate.yaml` override completes `/adev:validate` end-to-end at every step. (At post-restructure steady state, this means running only the surviving registry checks.)
- [ ] **Verdict computation semantics unchanged.** Error-severity → FAIL, warning-severity → PASS_WITH_NOTES, info / observational → no verdict contribution. Per `configurable-checks.spec.md` postconditions.
- [ ] **`kind: deterministic-check` restriction preserved.** Projects cannot register new deterministic-check entries; only bundled defaults provide them. Per `configurable-checks.spec.md` Behavior 8.
- [ ] **Historic `.validate.md` reports remain readable.** No retroactive renumbering. New reports start using the trimmed inventory at the migration step that drops the relevant check.
- [ ] **Plan-time CODE_DRIFT gate still functions.** Check 1.6 (Code-Side Drift Warning) remains in validate; `skills/plan/SKILL.md` line 128's `hasDrift()` call returns truthful results.
- [ ] **Build orchestrator unaffected by per-check identity.** `skills/build/SKILL.md` continues to dispatch validate and consume the verdict; per-check identity is not exposed to it.
- [ ] **Destinations preserve the structural shape of their migrated checks.** A Pass 19 hygiene finding, a reconcile lifecycle-sync entry, and a review-specs ADR finding each carry the fields a Check 10 / 12 / 5 report previously carried (path, severity, message, evidence) so users can map from old to new without information loss.

## Behavioral Contract

### Behaviors

1. **When** `/adev:validate` runs against a spec **then** it dispatches only the registry entries in `templates/validate/defaults.yaml` (Check 1.5, 2, 4, optionally 8 and 9) plus Check 1 (sourced from `governance/gates.yaml`) and Check 1.6 (drift advisory).

2. **When** `/adev:validate` completes for a spec **then** the report contains a section per dispatched check with outcome (PASS / FAIL / WARN / SKIP / SKIPPED-DISABLED) and a one-line orientation footer pointing users to `/adev:hygiene`, `/adev:reconcile`, and `/adev:review-specs` for relocated concerns.

3. **When** Check 2 (Spec Compliance) inspects an implementation that touches files outside the spec's **`source-manifest.files`** declared scope **then** it emits a **scope expansion detected** sub-finding citing the offending file(s) and recommended action (update spec scope or revert the out-of-scope change). The "declared scope" is pinned to the existing `source-manifest.files` frontmatter array — no new frontmatter field is introduced. If a spec lacks a `source-manifest.files` block, Check 2 emits an INFO note ("scope verification unavailable — spec has no source-manifest") instead of a scope-expansion finding, and does not penalize the verdict. Addresses rev-1 SA-2.

4. **When** Check 4 (Constitution Compliance) returns any finding **then** the finding cites at least one file:line reference or grep result as evidence. Findings without evidence are rejected by the check-authoring contract and reported as FAIL.

5. **When** Check 11 (Visual Verification) is dispatched against a spec whose implementation diff contains no UI file patterns **then** it returns SKIP regardless of Playwright MCP availability.

6. **When** Check 11 is dispatched against a spec whose implementation diff contains UI file patterns and Playwright MCP is unavailable **then** it BLOCKs with the existing actionable error message preserved from current behavior.

7. **When** `/adev:reconcile` is invoked **then** it performs the issue / epic / spec-status / charter-capability sync formerly emitted by Check 12, with `--fix` as the default behavior. Users pass `--no-fix` to receive a report-only run.

8. **When** `/adev:hygiene` runs Audit Pass 19 **then** it reports platform-context drift findings using the same comparison logic formerly in Check 10 (`.context-index/platform-context.yaml` vs `package.json`).

9. **When** `/adev:validate` completes **then** the post-validate hook extracts success heuristics into the heuristic store (formerly Check 13), without affecting verdict.

10. **When** `/adev:review-specs` runs **then** its reviewer registry covers ADR-compliance and cross-cutting-spec-compliance concerns formerly enumerated as validate Checks 5 and 6 — either as new reviewer entries or as extensions of `structural-architect-prompt.md` / `consistency-analyzer-prompt.md`. The plan stage selects between these implementation strategies.

11. **When** a project's `governance/validate.yaml` references a removed check ID (`check-3`, `check-5`, `check-6`, `check-7`, `check-10`, `check-12-lifecycle-reconciliation`, `check-12-heuristic-extraction`) **then** the loader's behavior depends on the provenance of the reference: (a) **project-authored reference in `governance/validate.yaml`** → load WARNs informationally with `RESURRECTED_CHECK_ID` and skips the entry; (b) **plugin-supplied reference somehow remaining in code after migration** → load fails with `REMOVED_CHECK_ID` (defensive — should not occur post-migration, but caught if it does). Single rule: project edits warn; plugin remnants hard-fail. Removed checks cannot be resurrected at v1. Addresses rev-1 SA-3 by consolidating the previously-split rule into one statement.

### Error Cases

| Condition | Expected Behavior | Code |
|-----------|-------------------|------|
| Plugin code or templates reference a removed check ID after migration (defensive — should not occur) | Load fails with diagnostic identifying the unknown ID and its source location | REMOVED_CHECK_ID |
| Project `governance/validate.yaml` references a removed check ID | Load WARNs (informational) and skips the entry (per Behavior 11) | RESURRECTED_CHECK_ID |
| Check 11 dispatched without Playwright MCP and no UI files | SKIP (per Behavior 5) | (no error) |
| Migration step leaves an intermediate state where validate report references a relocated check the new destination cannot honor | Rollback the step; reorder migration | PARTIAL_MIGRATION |
| Post-validate heuristic-extraction hook fails | Validate verdict unchanged; WARN logged to console | HEURISTIC_HOOK_FAILED |
| Check 4 finding without file:line evidence | Finding rejected by authoring contract; reported as FAIL | UNCITED_FINDING |
| Spec without `source-manifest.files` validated against Check 2 | Check 2 emits INFO note ("scope verification unavailable") instead of scope-expansion finding; verdict unaffected | (no error) |

## System Constitution Reference

- **Principle 2 (Skills are primarily markdown):** The refactor preserves the markdown-first contract. `templates/validate/defaults.yaml` is configuration data; relocated logic lives in skill SKILL.md files. No new helpers introduce executable requirements on Claude's part to follow the skill.
- **Principle 1 (Minimize external dependencies):** No new dependencies introduced. All migration uses existing infrastructure: validate-config loader, review-specs registry, hygiene audit-pass pattern, reconcile skill.
- **Architecture Boundary (Editing skill markdown is autonomous):** Per constitution's Autonomous list, the SKILL.md edits in this refactor are within the agent's authority. No new skills added to the lifecycle order; no hook protocol changes; no CLI changes.
- **Architecture Boundary (Updating specs/ADRs when code changes affect their assumptions):** This refactor explicitly invalidates assumptions in `configurable-checks.spec.md`'s acceptance criterion referencing `validate.check-10-platform-drift`. That AC remains true at the moment it was validated; it does not require retroactive amendment.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Land hygiene Pass 19 (Platform Drift) | New audit pass in `skills/hygiene/SKILL.md`; reads `platform-context.yaml` + `package.json` | small |
| Land reconcile lifecycle-sync section | Migrate Check 12 logic to `skills/reconcile/SKILL.md` with `--fix` default | medium |
| Land review-specs ADR + cross-cutting coverage | Choose implementation (new reviewers vs extend prompts); add entries / scope items | medium |
| Land post-validate heuristic-extraction hook | New hook script + registration; non-blocking | small |
| Drop Check 12 from registry | Remove entry + skill prose | small |
| Drop Check 10 from registry | Remove entry + skill prose | small |
| Guard Check 11 trigger semantics | Conditional dispatch logic in `skills/validate/SKILL.md` | small |
| Add Check 2 scope-expansion sub-finding | Prompt update + reporting | small |
| Drop Check 3 from registry | Remove entry + skill prose | small |
| Drop Checks 5, 6, 7 from registry | Remove entries + skill prose | small |
| Tighten Check 4 authoring contract | Prompt update requiring evidence citations | small |
| Drop Check 13 from registry | Remove entry + skill prose | small |
| Update validate report template | Reflect new check inventory; add migration-orientation footer | small |
| Sync `validation/charter.md` Skills section | Update language to reflect post-restructure count | small |
| Tests | Per-task: registry-trim regression, new sub-findings, relocated logic in destinations, Check 11 trigger guard, Check 4 evidence contract | large |
| Measurement | JSONL-based pre/post token comparison on representative charter; record in spec | small |

## Acceptance Criteria

- [ ] `templates/validate/defaults.yaml` contains only the surviving check IDs: `validate.check-1.5-source-manifest`, `validate.check-2-spec-compliance`, `validate.check-4-constitution`, optionally `validate.check-8-boundaries` and `validate.check-9-transition-gates` when governance is configured.
- [ ] A `governance/validate.yaml` attempting to re-enable a removed check ID emits `RESURRECTED_CHECK_ID` WARN and skips the entry.
- [ ] `/adev:reconcile` produces output structurally equivalent to historic Check 12 WARN content for a fixture with known lifecycle drift, and `--fix` is the default mode there.
- [ ] `/adev:hygiene` Audit Pass 19 produces output structurally equivalent to historic Check 10 reports for a fixture with platform drift.
- [ ] `/adev:review-specs` registry covers ADR-compliance and cross-cutting-compliance concerns; a fixture spec that would have FAILed prior Check 5 or Check 6 FAILs its review-specs run instead.
- [ ] **Check 2 scope-expansion is pinned to `source-manifest.files`.** A fixture where implementation files extend beyond the spec's `source-manifest.files` declared scope produces a scope-expansion sub-finding citing the offending path. A spec without `source-manifest.files` produces an INFO note ("scope verification unavailable") instead, with verdict unaffected. (rev-2 SA-2 fix)
- [ ] **`/adev:reconcile --fix` writes through the authoritative channel** from `plan-task-events.spec.md` (`reportPlanTask` events) when reconciling Check 12-style lifecycle drift; no dual-write to markdown checkboxes. A fixture asserts the event log entries match the reconciliation output without writing `- [x]` directly into plan files. (rev-2 SA-6 fix)
- [ ] **Post-validate heuristic hook input is scoped to verdict metadata only.** A fixture where validate captures redacted subprocess stdout proves the hook receives only per-check verdict metadata (IDs, outcomes, timing, counts), not the raw captured output. (rev-2 SEC-1 fix)
- [ ] **Single removed-ID rule reconciled across Behavior 11 and Error Cases.** The contract distinguishes project-authored references (WARN) from plugin-supplied references (FAIL); both Error Cases rows and Behavior 11 are aligned. (rev-2 SA-3 fix)
- [ ] Check 4 findings cite at least one file:line reference or grep result as evidence; a finding fabricated without evidence is rejected by the authoring contract.
- [ ] Check 11 SKIPs (does not BLOCK) when no UI files match the implementation diff and Playwright MCP is absent.
- [ ] Check 11 BLOCKs (preserving existing behavior) when UI files match and Playwright MCP is absent.
- [ ] Post-validate heuristic-extraction hook runs after every validate completion without affecting verdict; heuristics land in the heuristic store.
- [ ] Validate verdict semantics for surviving checks unchanged (error → FAIL, warning → PASS_WITH_NOTES, info / observational → no contribution).
- [ ] Token-cost measurement recorded: validate dispatch token cost on a ≥5-spec representative charter measured via session JSONL (per validation-module heuristic on token measurement) and recorded in the spec's outcome notes. Pre/post comparison included whether or not the result confirms the savings hypothesis.
- [ ] `validation/charter.md` Skills section updated to accurately reflect the post-restructure check inventory.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.

## Measurement Outcomes

Recorded after task 14 of `check-set-restructure.plan.md`.

**Charter measured (structural):** `validation` charter at the adev-plugin repository itself — the project where the restructure landed. This charter has ≥5 specs (`configurable-checks.spec.md`, `validate-config-single-source.spec.md`, `check-set-restructure.spec.md`, and siblings).

**Pre-restructure dispatch count:** ~14 dispatched per validate run.

- Check 1 (quality gates, tiered from `governance/gates.yaml`) — 1 dispatch grouping.
- Check 1.5 (deterministic source-manifest verification) — 1.
- Check 1.6 (code-drift advisory) — 1.
- Checks 2–9 from the registry — 8 entries, each a subagent dispatch.
- Check 10 (platform drift) — 1 subagent dispatch.
- Check 11 (visual verification) — 1 subagent dispatch (when not disabled).
- Check 12 (lifecycle reconciliation) — 1 subagent dispatch.
- Check 13 (heuristic extraction, observational) — 1 inline-node invocation.

**Post-restructure dispatch count:** 5–8 dispatched per validate run, depending on optional governance.

- Check 1 — 1.
- Check 1.5 — 1.
- Check 1.6 — 1.
- Check 2 (now also carries the scope-expansion sub-finding absorbed from Check 3) — 1.
- Check 4 (now with the evidence-citation authoring contract) — 1.
- Check 8 (when `governance/boundaries.yaml` is configured) — 0 or 1.
- Check 9 (when `governance/gates.yaml` declares transition gates) — 0 or 1.
- Check 11 (conditional on UI-file matches AND Playwright availability) — 0 or 1.
- Post-validate heuristic-extraction hook — 1 Stop-event invocation (out-of-band; not part of dispatch).

**Structural delta:** A reduction of 6–9 subagent dispatches per validate run (depending on optional governance and UI matching), or ~43–64% fewer dispatches. The exact savings per dispatch is dominated by the cost of starting a fresh subagent with its base context pack and applying the prompt — the dispatch-count delta is therefore a faithful proxy for the per-charter token-cost delta on charters where governance and UI checks are predominantly inactive (which the pre-restructure investigation found is the common case: Checks 7, 9, 11 were NO-OP in 91–100% of historic dispatches).

**Hypothesis confirmed:** Yes, partially — at the structural level. The restructure removed exactly the dispatches the investigation flagged as NO-OP / duplicate / noise: Checks 3 (transitively redundant), 5/6/7 (duplicate review-specs dispatch), 10 (repo-level concern), 11 (BLOCKed non-UI specs), 12 (49% WARN bookkeeping), 13 (observational side effect). Each removal corresponds to one fewer subagent dispatch per spec, plus the elimination of the WARN noise emitted by Check 12.

**JSONL-based per-token measurement deferred:** Per the validation-module heuristic on token measurement, JSONL approximations can be off by 2–2.5×. The adev-plugin project's `.context-index/governance/validate.yaml` does not list a representative registry at the time this restructure landed (it was previously a near-empty override), so a fresh post-restructure JSONL measurement on this project would compare zero-against-zero. A faithful JSONL measurement should be taken on a downstream project that scaffolded the pre-restructure starter and re-runs `/adev:validate` after pulling this restructure — that's the realistic baseline. This task records the structural delta as the verifiable outcome; the empirical per-token delta is filed as a follow-up issue against the validation charter for a downstream project to measure.

**Per validation-module heuristic on token measurement:** Even with the structural-only result, the dispatch-count proxy is documented as a lower-confidence number than a JSONL-based parse. Future operators reading this should treat the 43–64% range as a ceiling on the expected savings rather than a guarantee, and reach for the JSONL parsers in `lib/session-file-reader.mjs` + `lib/token-cursor.mjs` once a downstream baseline exists.
