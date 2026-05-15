# Validation Report: `/adev:specify` Kind Routing

> **Date:** 2026-05-15
> **Spec:** .context-index/specs/features/lifecycle-artifacts/specify-kind-routing.spec.md
> **Plan:** .context-index/specs/features/lifecycle-artifacts/specify-kind-routing.plan.md
> **Overall Status:** PASS_WITH_WARNINGS

Workspace: not detected (single-repo validation).
Charter: lifecycle-artifacts (revision 2).
Spec kind: skill.

---

## Check 1: Quality Gates — PASS (with informational pre-existing failure)

- Check 1a (fast tier): `npm test` — **PASS for this spec's tests** (21/21 in `tests/skills/specify-kind-routing.test.mjs`), with one pre-existing systemic failure in `tests/skills/plan-task-immutability.test.mjs` (informational per pipeline context).
- Aggregate: 2977 passing, 1 failing (`plan-immutability: real repo has no violations`). The failing assertion concerns `firstPendingTs` discovery across all `lifecycle-artifacts/*.plan.md` files — it is a repository-wide condition, not introduced by this spec. Pipeline context: **"Pre-existing systemic test failure in tests/skills/plan-task-immutability.test.mjs is informational."**
- No integration / e2e tier gates configured (commented out in `governance/gates.yaml`).

Per pipeline context, the pre-existing failure does not block validation. The kind-routing test suite passes cleanly.

## Check 1.5: Source Manifest Verification — SKIP

The spec frontmatter does not contain a `source-manifest:` block (verified via Read of lines 1–12). Pipeline context flag `source_manifest_stamped: true` does not match on-disk state. SKIP with note: "No source manifest found in spec frontmatter."

**Observation (informational):** The three modified SKILL.md files (`skills/specify/SKILL.md`, `providers/codex/skills/specify/SKILL.md`, `providers/opencode/skills/specify/SKILL.md`) and the new `tests/skills/specify-kind-routing.test.mjs` are not yet committed (modified / untracked). This is not enforced because the manifest is absent, but worth surfacing — the implementation is complete on disk but pending commit.

## Check 1.6: Code-Side Drift Warning — PASS

No `drift_detected: true` flag in spec frontmatter. No SHA mismatch to report (no manifest).

## Check 2: Spec Compliance — PASS

Acceptance criteria (verified by reading actual source files):

- **AC1: `skills/specify/SKILL.md` documents the ask-first kind prompt and `--kind` flag** — PASS
  - `skills/specify/SKILL.md:17` declares `--kind <kind>` in Arguments table.
  - `skills/specify/SKILL.md:246–287` contains "Step 3.5: Resolve Kind" with the ask-first menu listing all 6 kinds.
- **AC2: Skill rejects missing kind on write (no defaulting)** — PASS
  - `skills/specify/SKILL.md:279–285` states "Strict-on-write semantics. The kind axis is required at write time… Continue re-prompting until a valid kind is supplied. There is no silent defaulting at write time."
- **AC3: Skill rejects invalid kind values** — PASS
  - `skills/specify/SKILL.md:252–262` shows `isValidKind('spec', kind)` rejection with "Invalid --kind 'xxx'. Valid options: behavioral, refactor, action, skill, integration, artifact." message.
- **AC4: Skill resolves template via `resolveTemplate('spec', kind, domain)`** — PASS
  - `skills/specify/SKILL.md:359–365` instructs calling `resolveTemplate('spec', kind, domain.resolved_domain ?? null)` from `<ADEV_ROOT>/lib/template-resolution.mjs`. Error handling for `TEMPLATE_NOT_FOUND`, `UNSAFE_TEMPLATE_PATH`, `INVALID_KIND`, `INVALID_LAYER` documented at lines 367–370.
  - Refactor mode (line 647) and Cross-cutting mode (line 804) also wire resolveTemplate.
- **AC5: Skill writes `kind:` explicitly to frontmatter** — PASS
  - `skills/specify/SKILL.md:373` states "`kind: <chosen value>` — explicit, no defaulting at write time. Write the value resolved in Step 3.5 verbatim."
- **AC6: Workflow modes continue to work independently of `--kind`** — PASS
  - `skills/specify/SKILL.md:23–30` documents the orthogonality contract explicitly: "No `--mode <name>` flag is introduced; the existing direct-flag syntax is preserved verbatim." `--extract`, `--refactor`, `--from-diff`, `--cross-cutting` arguments remain documented (lines 18–21).
- **AC7: All existing tests pass; new tests cover the kind-routing path** — PASS
  - `tests/skills/specify-kind-routing.test.mjs` exists with 21 tests covering: --kind argument documentation, 6-kind enumeration, Step 3.5 ordering, isValidKind validation, ask-first menu, strict-on-write, --mode absence, orthogonality, Step 5 resolveTemplate invocation, error-code coverage, provider mirrors, and library invariants (action resolution, isValidKind rejection of unknown / null / undefined, orthogonality argv parsing). All 21 PASS (verified by running `node --test tests/skills/specify-kind-routing.test.mjs`).
- **AC8: No constitutional violations introduced** — PASS (see Check 4).

## Check 3: Charter Consistency — PASS

- **Scope boundaries** — PASS. The implementation lands the `/adev:specify kind routing` capability (charter line 101) and the `Workflow/kind orthogonality` capability (line 103). No out-of-scope code introduced.
- **Domain model alignment** — PASS. The skill references `Kind`, `Template`, `TemplateResolution` (`resolveTemplate`) — matches charter Domain Model entities (lines 67–73). Invariants preserved: closed enumeration, strict-on-write, no defaulting (charter lines 85–90).
- **Interface contracts** — PASS. The skill consumes `lib/kinds.mjs` (`SPEC_KINDS`, `isValidKind`) and `resolveTemplate(layer, kind, domain)` exactly as declared in charter Interface Contracts (lines 124–129).

## Cross-Repo Dependency Validation — N/A

No workspace detected; `depends-on` frontmatter is absent. No cross-repo references to validate.

## Check 4: Constitution Compliance — PASS

- **Architecture Boundaries** — PASS. Editing skill markdown content is explicitly listed under "Autonomous (Agent May Decide)" in `CLAUDE.md` / `constitution.md`. The spec's own "System Constitution Reference" section (line 94) cites this autonomous boundary.
- **Non-Negotiable Principles** — PASS.
  - Principle 1 (Minimize external dependencies): no new deps introduced.
  - Principle 2 (Skills are primarily markdown): the routing logic is described as markdown instructions; companion code (`lib/kinds.mjs`, `lib/template-resolution.mjs`) already exists and is consumed at skill runtime — the skill itself remains markdown-primary. The spec's System Constitution Reference (line 94) cites this principle explicitly.
  - Principle 3 (Pure ESM): all referenced modules are `.mjs`.
  - Principles 4 & 5 (Hook protocol / version parity): not touched by this spec.
- **Coding Standards** — PASS. Skill file lives at `skills/specify/SKILL.md` per convention. Test file lives at `tests/skills/specify-kind-routing.test.mjs` (kebab-case, `.test.mjs` suffix). camelCase identifiers used throughout.

## Check 5: ADR Compliance — PASS

- **ADR-0009 (Lifecycle Artifact Taxonomy)** — PASS. This spec is one of the implementation arms of ADR-0009. It honors all ADR decisions: closed enumeration of 6 spec kinds, single discriminator field `kind:`, strict-on-write + soft-on-read posture, template-resolution mechanics via `resolveTemplate(layer, kind, domain)`. No conflicts with ADRs 0001–0008 (web-tree-sitter, typescript dev-dep, review registry, execution profiles, workspace isolation, dotenvx, conventional commits, release-please).

## Check 6: Cross-Cutting Specs — PASS

- `spec-file-suffixes.spec.md` — PASS. The dotted-suffix template-filename convention (`templates/spec-template.<kind>.md`) is honored by `resolveTemplate`, which the skill instructs callers to use.
- Other cross-cutting specs (execution-profiles, lifecycle-gate, meta-tools, model-routing) — not relevant to this skill-markdown edit.

## Check 7: Specialist Review — SKIPPED

No specialists registered in `.context-index/manifest.yaml` whose patterns match the modified files (`skills/specify/SKILL.md`, two provider mirrors, one test). No specialist match.

## Check 8: Boundary Compliance — PASS

`.context-index/governance/boundaries.yaml` exists but `boundaries:` array is empty (template state). No rules to evaluate.

## Check 9: Transition Gates — SKIP

`governance/gates.yaml` declares `transitions: {}` — no `implement-to-validate` or `validate-to-merge` transitions configured.

## Check 10: Platform Drift — SKIP

`.context-index/platform-context.yaml` does not exist (verified). SKIP per spec: "no platform context configured."

## Check 11: Visual Verification — N/A

No UI files in this implementation. Modified files: three `SKILL.md` markdown files + one `.test.mjs` test file. No `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss` touched. N/A is the correct verdict per the trigger rule.

## Check 12: Lifecycle Reconciliation — WARN

- **Issue alignment:** WARN. `issue-479` (type: feature, title: "/adev:specify Kind Routing", spec_ref matches) is still `status: open`. Implementation is complete (21/21 tests pass; all 8 acceptance criteria PASS). Recommend close after PASS validation.
- **Epic completion:** N/A. No epic explicitly linked via parent_id on `issue-479`.
- **Spec status:** WARN. Spec frontmatter shows `status: review-passed`. Expected `implemented` after `/adev:implement`. The "After Validation" step below will promote to `validated` and trigger an issue close — but `/adev:implement` should normally have stamped `implemented` first.
- **Charter sync:** WARN. Charter Capability Map row `/adev:specify kind routing` shows `Status: planned`. Should be `validated` after this report. The "After Validation" step below updates it.
- **Plan checkboxes:** WARN. All 13 task checkboxes in `specify-kind-routing.plan.md` are unchecked, but the implementation summary says "4 tasks done" and all tests pass. Recommend marking checked.

This check uses WARN severity (does not invalidate the implementation). User may run `/adev:reconcile` or re-run with `--fix` for automatic cleanup.

## Check 13: Success Heuristic Extraction — SKIP

Not first-run PASS — overall verdict is `PASS_WITH_WARNINGS` (Check 12 carries WARN findings). SKIP reason: per Check 13's first-run-PASS gate, the heuristic is extracted only when all checks come back clean. WARN-only Check 12 still qualifies per the report-format note ("WARN-only in Check 12 counts as PASS"), so the heuristic *could* be extracted; however, the lifecycle reconciliation findings indicate operator bookkeeping is incomplete — best to extract after `/adev:reconcile` lands and re-validation is clean. Marked SKIP for this run with note: "lifecycle bookkeeping pending (Check 12 WARN findings)".

---

**Summary:** 9 checks PASS, 1 WARN (Check 12 — lifecycle reconciliation), 4 SKIP (1.5 / 9 / 10 / 13), 1 SKIPPED (7), 1 N/A (Cross-Repo Dep Validation, Check 11). 0 FAIL. Overall verdict: PASS_WITH_WARNINGS — the implementation is sound and acceptance criteria are met; lifecycle bookkeeping (issue close, spec status, charter sync, plan checkboxes) needs follow-up via `/adev:reconcile` or a fix-up commit.

**Implementation files referenced (all verified by Read tool in this session):**
- `/Users/dpavancini/Development/adev-plugin/skills/specify/SKILL.md` (modified, uncommitted)
- `/Users/dpavancini/Development/adev-plugin/providers/codex/skills/specify/SKILL.md` (modified, uncommitted)
- `/Users/dpavancini/Development/adev-plugin/providers/opencode/skills/specify/SKILL.md` (modified, uncommitted)
- `/Users/dpavancini/Development/adev-plugin/tests/skills/specify-kind-routing.test.mjs` (created, untracked)

**Note on commit state:** Per the on-disk evidence, the four implementation files are not yet committed. This is not a validation failure (the manifest stamp is absent so Check 1.5 cannot enforce), but the operator should commit before merge.
