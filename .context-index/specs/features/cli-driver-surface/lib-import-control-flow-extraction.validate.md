# Validation Report: Lib-Import Control-Flow Extraction

> **Date:** 2026-05-17
> **Spec:** .context-index/specs/features/cli-driver-surface/lib-import-control-flow-extraction.spec.md
> **Plan:** .context-index/specs/features/cli-driver-surface/lib-import-control-flow-extraction.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS
- Tier 1a (fast): `npm test` — PASS (3163 pass / 0 fail / 2 todo, 46.5s)
- Tier 1b (integration): SKIP — no gates configured
- Tier 1c (e2e): SKIP — no gates configured

## Check 1.5: Source Manifest Verification — PASS
- Manifest sha `96d4421` matches current SHA of the 5 listed files (verified via `lib/source-manifest.mjs::verifyManifest`).
- Files inventory:
  - `.context-index/specs/features/cli-driver-surface/charter.md` — committed (4df676a)
  - `skills/implement/SKILL.md` — committed (4df676a)
  - `skills/plan/SKILL.md` — committed (c5a52ed)
  - `tests/lib-import-control-flow-extraction.test.mjs` — committed (55aaa24)
  - `tests/skills/no-stale-format-refs.test.mjs` — committed (4df676a)
- Note: `adev source-manifest verify` (CLI) reported SKIP because its frontmatter detector requires the file to start with `---\n`; this spec starts with an H1 followed by an HTML comment, then frontmatter. The lib-level `extractManifestFromFrontmatter` (which uses a permissive regex) correctly parses and verifies the manifest. PASS verdict stands; the CLI tightening is a separate concern.

## Check 1.6: Code-Side Drift Warning — PASS
- `adev verify spec --check-drift` returned `{"drifted":false,"drift_source":null,"drift_at":null}`.

## Check 2: Spec Compliance — PASS
- AC1 (zero import-shape matches): PASS
  - `grep -nE "import \{ (currentState|reportPlanTask|filterEvents) \} from '<ADEV_ROOT>" skills/plan/SKILL.md skills/implement/SKILL.md` returned zero matches.
  - Locking test `tests/lib-import-control-flow-extraction.test.mjs` 6/6 PASS.
- AC2 (four sites replaced by prose + CLI invocation): PASS
  - `skills/plan/SKILL.md:683` references `adev state events --spec <spec-path> --event plan_task` (Category C, re-plan detection).
  - `skills/plan/SKILL.md:693` references `adev report --type plan-task --spec <spec-path> --plan <plan-file-path> --task-id <id> --status pending` (Category C, pending emission).
  - `skills/implement/SKILL.md:111` references `adev state current --spec <spec-path>` (Category A, task-selection lookup).
  - `skills/implement/SKILL.md:125-143` references `adev report --type plan-task --status in_progress|done|blocked|skipped` (Category B, four transitions).
- AC3 (`tests/skills-no-inline-node.test.mjs` continues to pass): PASS — 3/3 assertions GREEN.
- AC4 (`npm test` zero failures): PASS — 3163/3163.
- AC5 (no new CLI verbs introduced): PASS — only existing verbs (`adev state current`, `adev state events`, `adev report --type plan-task`) used; commit `4df676a` explicitly states "No new verbs introduced — all four statuses are already accepted by lib/cli/report.mjs:245".
- AC6 (charter Capability Map row Status `implemented`): PASS — `.context-index/specs/features/cli-driver-surface/charter.md:90` row shows `implemented`.
- AC7 (audit findings captured in commit messages): PASS — commits `c5a52ed`, `e0a6739`, `4df676a` each name the existing verb used and explicitly confirm "No new verbs introduced". Commit `e743ef7` summarizes the migration.

## Check 4: Constitution Compliance — PASS
- Architecture boundaries: PASS — no human-approval boundaries crossed (no new skills, no hook protocol changes, no CLI install path changes, no plugin registration changes, no new dependencies). Refactor stays within the Autonomous bucket ("Refactoring within a module's boundaries", "Editing skill markdown content", "Updating specs/ADRs when code changes affect their assumptions").
- Non-Negotiable Principles: PASS — Principle 2 ("Skills are primarily markdown — companion code is allowed but must not be required") is directly reinforced; control-flow logic moved from skill prose into the CLI verbs' implementations.
- Coding standards: PASS — files remain `.mjs` ESM; commit trailers include required `Spec:`, `Plan-task:`, `Author-type:`, `Operator:` fields.
- Anti-pattern compliance (line 68 — "Fenced JavaScript in SKILL.md must be descriptive-reference only"): PASS — this spec is the migration that enforces this rule.

## Check 8: Boundary Compliance — PASS
- `.context-index/governance/boundaries.yaml` has `boundaries: []` (no rules configured). PASS by default.

## Check 9: Transition Gates — SKIP
- `.context-index/governance/gates.yaml` does not define `implement-to-validate` or `implement-to-merge` transitions (the `transitions: {}` block has only commented examples). SKIP per skill prose.

## Check 11: Visual Verification — N/A
- No UI files (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, or files under `components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, `app/**/layout.*`) in the implementation diff. Case A in the four-case matrix: SKIP — "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 6 PASSed (Check 1, 1.5, 1.6, 2, 4, 8), 1 SKIPped (Check 9, no transitions configured), 1 N/A (Check 11, no UI files). 0 failed.

The implementation satisfies all seven acceptance criteria from the spec. The four lib-import control-flow sites have been migrated to descriptive prose + CLI verb invocations (no new verbs introduced), the locking tests (`tests/lib-import-control-flow-extraction.test.mjs`) pass 6/6, the inline-Node regression test continues green, and the charter Capability Map row is advanced to `implemented`. Source manifest matches; no code-side drift.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering; the gaps in the surviving inventory (Checks 1, 1.5, 1.6, 2, 4, optionally 8 and 9) are intentional to preserve report readability.
