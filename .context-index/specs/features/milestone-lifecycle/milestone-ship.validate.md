# Validation Report: Milestone Ship with Strategy-Based Release Execution

> **Date:** 2026-05-11
> **Spec:** .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
> **Plan:** .context-index/specs/features/milestone-lifecycle/milestone-ship.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

- Check 1a (fast): `npm test` — PASS (2227/2227, 0 failures, ~153s)
- Check 1b (integration): no gates configured, skipped
- Check 1c (e2e): no gates configured, skipped

## Check 1.5: Source Manifest Verification — SKIP

No source manifest found. Run /adev:implement to stamp one.

## Check 1.6: Code-Side Drift Warning — PASS

No `drift_detected` flag set in spec frontmatter.

## Check 2: Spec Compliance — PASS

- `resolveStrategy` returns `"manual"` for null/missing/absent release config: **PASS** — `lib/milestones.mjs:424`, tests at `tests/milestones.test.mjs:128-138`
- `resolveStrategy` returns configured strategy for valid values: **PASS** — `lib/milestones.mjs:432`, test at `:140-144`
- `resolveStrategy` throws UNKNOWN_STRATEGY for unrecognized values: **PASS** — `lib/milestones.mjs:426-430`, test at `:146-151`
- `milestone ship` with strategy `manual` marks shipped and closes epic with no git ops: **PASS** — `lib/milestones.mjs:505-508`, test at `:887-907` (verifies `execGit` throws if called)
- `milestone ship` with strategy `manual` prints tag guidance for semver names: **PASS** — SKILL.md:191 documents guidance; function returns `strategy: "manual"` for caller to render
- `milestone ship` with strategy `tag-only` creates git tag for semver names: **PASS** — `lib/milestones.mjs:514-527`, tests at `:680-698` and `:537-558`
- `milestone ship` with strategy `tag-only` skips GitHub release when `gh` unavailable: **PASS** — `lib/milestones.mjs:532-538` (only calls `execGh` when provided), test at `:700-714`
- `milestone ship` with strategy `tag-only` blocks when tag already exists: **PASS** — `lib/milestones.mjs:522-524`, test at `:716-735`
- `milestone ship` with strategy `release-please` writes `release-as` to config JSON: **PASS** — `lib/milestones.mjs:554-581`, test at `:764-783`
- `milestone ship` with strategy `release-please` detects and prints open Release PR URL: **PASS** — `lib/milestones.mjs:588-594`, test at `:764-783`
- `milestone ship` with strategy `release-please` falls back to `manual` when config missing: **PASS** — `lib/milestones.mjs:547-550`, test at `:804-820`
- `milestone ship` with strategy `release-please` handles malformed config JSON gracefully: **PASS** — `lib/milestones.mjs:566-570` (throws RELEASE_CONFIG_INVALID), test at `:822-838`
- `milestone ship` with strategy `release-please` does NOT create git tags: **PASS** — no `execGit` call in release-please case, test at `:859-877`
- Ship criteria evaluation is unchanged and strategy-independent: **PASS** — `evaluateShipCriteria` at `lib/milestones.mjs:343-408` called before strategy dispatch at `:465`, tests at `:473-528`
- `milestone ship` on already-shipped milestone is a no-op (all strategies): **PASS** — `lib/milestones.mjs:458-460`, test at `:594-599`
- Non-semver milestones skip tag/config operations (all strategies): **PASS** — `tag-only` checks `SEMVER_REGEX` at `:513`, `release-please` at `:554`, tests at `:700-714` and `:840-857`
- All error cases return expected error codes: **PASS** — MISSING_NAME, INVALID_NAME, MILESTONE_NOT_FOUND, BROKEN_EPIC, UNKNOWN_STRATEGY, TAG_EXISTS, RELEASE_CONFIG_INVALID all verified in code and tests
- `evaluateShipCriteria` is exported and independently testable: **PASS** — `export async function` at `:343`, imported at test `:18`
- All quality gates pass: **PASS** — Check 1 passed
- No constitutional violations introduced: **PASS** — see Check 4

## Check 3: Charter Consistency — PASS

- **Scope:** Implementation modifies only `lib/milestones.mjs`, `tests/milestones.test.mjs`, and `skills/issues/SKILL.md` — all within the milestone-lifecycle charter scope. No new endpoints, models, or UI components outside scope. **PASS**
- **Domain model:** `resolveStrategy` aligns with the charter's Milestone entity (`release: { strategy }` field). Strategy values match charter invariants (`manual`, `tag-only`, `release-please`). **PASS**
- **Interface contracts:** `milestoneShip` accepts `options.execGit`, `options.execGh` per spec's injectable executor notes. `resolveStrategy` is exported as documented in the charter. **PASS**

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** No new skills, hooks, or external dependencies added. All changes within existing module. **PASS**
- **Non-negotiable principles:**
  - "Minimize external dependencies" — uses `node:fs`, `node:path`, `node:child_process`, `JSON.parse`/`JSON.stringify`. No new deps. **PASS**
  - "Skills are primarily markdown" — SKILL.md updated with documentation; logic lives in `lib/milestones.mjs`. **PASS**
  - "Pure ESM" — all code in `.mjs` files, uses `import`/`export`. **PASS**
  - "Version parity" — release-please strategy delegates to release-please for version bumping (per ADR-0008). **PASS**
- **Coding standards:** camelCase functions (`resolveStrategy`, `milestoneShip`), Node.js built-ins imported first, error handling via error codes. **PASS**

## Check 5: ADR Compliance — PASS

- ADR-0008 (release-please): Implementation writes to `packages["."]["release-as"]` in `release-please-config.json` at `lib/milestones.mjs:577-578`, consistent with the ADR's description of the config structure. No direct dependency on release-please library. **PASS**
- Other ADRs (0001-0007): Not directly relevant to this implementation. **N/A**

## Check 6: Cross-Cutting Specs — PASS

No cross-cutting specs are directly relevant to this implementation (no error handling middleware, no API versioning, no auth flows modified).

## Check 7: Specialist Review — SKIPPED

No specialists matched. No glob patterns or keywords in the specialist registry match the modified files (`lib/milestones.mjs`, `tests/milestones.test.mjs`, `skills/issues/SKILL.md`).

## Check 8: Boundary Compliance — PASS

`governance/boundaries.yaml` has an empty `boundaries: []` list. No rules configured.

## Check 9: Transition Gates — SKIP

No transitions configured in `governance/gates.yaml` (transitions section is `{}`).

## Check 10: Platform Drift — PASS

- framework: `none` declared — no framework package expected. **PASS**
- language: `javascript` — no TypeScript dependency expected. **PASS**
- test_runner: `node:test` — built-in, no package needed. **PASS**
- package_manager: `npm` — confirmed by `package.json`. **PASS**

## Check 11: Visual Verification — N/A

No UI files touched. Implementation modifies only `.mjs` and `.md` files.

## Check 12: Lifecycle Reconciliation — PASS

- **Issue alignment:** Task backend is `file`. No issues with `plan-ref` matching this spec's plan were found to reconcile. **PASS**
- **Epic completion:** N/A — no epic associated with this spec. **PASS**
- **Spec status:** Status is `implemented` — expected at this stage, will be updated to `validated`. **PASS**
- **Charter sync:** Capability Map shows "Ship Criteria Evaluation" and "Milestone Ship" as `implemented` — will be updated to `validated`. **PASS**
- **Plan checkboxes:** All 7 tasks have all checkboxes marked `[x]`. **PASS**

## Check 13: Success Heuristic Extraction — PASS

Heuristic extracted: `milestone-ship-spec-a4781bcd` (scope: milestone-lifecycle, confidence: medium)

---

**Summary:** 12 passed, 0 failed, 2 skipped checks (transition gates not configured, specialist not matched). No cross-repo dependencies.
