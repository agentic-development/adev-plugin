# Validation Report: Subagent Cost Routing

> **Date:** 2026-04-26
> **Spec:** `.context-index/specs/cross-cutting/subagent-cost-routing.md`
> **Plan:** `.context-index/specs/cross-cutting/subagent-cost-routing.plan.md`
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

- **Check 1a (fast tier):** `npm test` — PASS — 1470 tests, 0 fail, 0 skip (~70s)
- **Check 1b (integration tier):** SKIP — no integration-tier gates configured
- **Check 1c (e2e tier):** SKIP — no e2e-tier gates configured

Note: No `governance/gates.yaml` found. Legacy `gates:` section in `manifest.yaml` present (migration advisory: move gate definitions to `governance/gates.yaml`).

---

## Check 1.5: Source Manifest Verification — PASS

Source manifest SHA `ac15298` recomputed and matches. All 7 source files are unchanged since stamping:
- `.context-index/specs/features/session-awareness/token-cost-logging.md`
- `hooks/session-capture.sh`
- `skills/implement/SKILL.md`
- `skills/retro/SKILL.md`
- `skills/route/SKILL.md`
- `templates/manifest-template.yaml`
- `tests/hooks/session-capture.test.mjs`

---

## Check 2: Spec Compliance — PASS

All 17 acceptance criteria verified:

- `/adev:route` annotation includes `**Model Tier:** fast|capable|reasoning`: PASS — `skills/route/SKILL.md` Step 4 annotation block updated at line 158
- `model_routing.auto_agent_fast_threshold` overrides default of 4: PASS — Step 2 "Derive Model Tier" reads `T = model_routing.auto_agent_fast_threshold`
- When threshold absent, default 4 applies: PASS — `(default 4 if absent)` documented
- `/adev:implement` reads `**Model Tier:**` from annotation for implementer dispatch: PASS — `skills/implement/SKILL.md` lines 144–155 implement tier resolution chain
- When `model_routing` absent, all dispatches use `capable`: PASS — `skills/implement/SKILL.md` line 55 confirms pre-spec fallback
- `model_routing.subagent_overrides` causes role-specific tier dispatch: PASS — `spec-reviewer` (line 310) and `code-reviewer` (line 333) override lookups implemented
- `.session-tracking.jsonl` entries include `usage.model` when session data available: PASS — `hooks/session-capture.sh` line 166 sets `validatedModel`; test at line 444 asserts `entry.usage.model === "claude-sonnet-4-6"`
- Entries without `usage.model` remain backward-compatible: PASS — conditional spread `...(validatedModel !== undefined && { model: validatedModel })` at line 182
- `/adev:retro` produces per-model cost breakdown: PASS — `skills/retro/SKILL.md` Step 1.8 and report template added
- `/adev:retro` omits section when no `usage.model` entries: PASS — "If no such entries exist, add a note" at line 98
- No SKILL.md hardcodes a model ID (dispatch invariant from model-routing spec): PASS — no new dispatch instructions use hardcoded model IDs. **Note:** `skills/retro/SKILL.md` example output table contains illustrative model IDs (lines 118–120) — these are example data values, not dispatch instructions, and do not affect provider configurability.
- Invalid tier in `model_routing.subagent_overrides` falls back to `capable` + advisory: PASS — `skills/implement/SKILL.md` unknown tier → `capable` + stderr advisory; `skills/route/SKILL.md` "Invalid tier value in override: log advisory, treat as `capable`"
- `auto_agent_fast_threshold` outside 1–5 → default 4 + advisory: PASS — `skills/route/SKILL.md` "If T < 1 or T > 5: emit stderr advisory, use T=4"
- Unknown role in `model_routing.subagent_overrides` → fallback chain: PASS — `skills/route/SKILL.md` "Unknown role in overrides: log advisory, skip override" + `model_routing.default` → `capable` fallback chain
- Model string failing validation → omitted from `usage.model` + one-time advisory: PASS — `hooks/session-capture.sh` MODEL_VALIDATION_PATTERN `/^[a-zA-Z0-9._:/\-]{1,128}$/` at line 161; test at line 474 asserts key absent; test at line 531 asserts advisory fires once
- All quality gates pass: PASS — 1470/1470
- No constitutional violations: PASS — see Check 4

---

## Check 3: Charter Consistency — N/A

Cross-cutting spec (`mode: cross-cutting`). No parent Feature Charter. Check 3 skipped — no charter scope to verify against.

---

## Check 4: Constitution Compliance — PASS

- **Architecture Boundaries:** No new services, no new external dependencies, no auth flow changes, no CLI installation path changes, no plugin registration format changes. All changes are within existing module boundaries. PASS
- **Non-Negotiable Principles:**
  - Minimize external dependencies: model validation is a regex (`/^[a-zA-Z0-9._:/\-]{1,128}$/`); no new npm packages. PASS
  - Skills are primarily markdown: all 5 skill file changes are instruction text. `hooks/session-capture.sh` inline Node is companion code, consistent with existing pattern. PASS
  - Pure ESM: no new `.mjs` files modified with CommonJS; session-capture.sh inline Node is already ESM. PASS
  - Hook protocol compliance: `session-capture.sh` still reads stdin JSON, exits 0, outputs `{}` to stdout. Model enrichment is internal. PASS
  - Version parity: no version bump required (feature addition is part of the release branch). PASS
- **Coding Standards:** camelCase for JS variables (`validatedModel`, `MODEL_VALIDATION_PATTERN`), no CommonJS, existing hook pattern followed. PASS

---

## Check 5: ADR Compliance — PASS (N/A)

5 ADRs reviewed:
- ADR 0001 (web-tree-sitter dependency): not applicable — no tree-sitter usage
- ADR 0002 (typescript-dev-dependency): not applicable — no TypeScript
- ADR 0003 (configurable-review-registry): not applicable — no reviewer registry changes
- ADR 0004 (execution-profiles): not applicable — no profile changes
- ADR 0005 (workspace-isolation-invariant): not applicable — no workspace changes

No ADR conflicts. PASS.

---

## Check 6: Cross-Cutting Spec Compliance — PASS

- **`model-routing.md`** (status: implemented): PASS — this spec extends model-routing without modifying it. Tier semantics (`fast`/`capable`/`reasoning`) unchanged. `platform-context.yaml.model_tiers` remains the single model ID resolution point. No hardcoded model IDs added to dispatch paths.
- **`token-cost-logging.md`** (status: validated): PASS — `usage.model` field added to Extended Schema in a backward-compatible way (optional field; entries without it remain valid). `session-capture.sh` continues to exit 0 in all error paths. Cursor file extended with `model_validation_warning_emitted` flag following same pattern as `format_warning_emitted`.

---

## Check 7: Specialist Review — SKIPPED

`manifest.yaml` has `specialists: []`. No specialist match scores computed.

---

## Check 8: Boundary Compliance — SKIPPED

No `.context-index/governance/` directory configured.

---

## Check 9: Transition Gates — SKIPPED

No `.context-index/governance/` directory configured.

---

## Check 10: Platform Drift — PASS

| Field | Declared | Found | Status |
|-------|----------|-------|--------|
| `framework` | `none` | No framework package expected | PASS |
| `language` | `javascript` | `package.json` `"type": "module"` | PASS |
| `module_system` | `esm` | `package.json` `"type": "module"` | PASS |
| `runtime` | `nodejs` | Node.js project confirmed | PASS |
| `test_runner` | `node:test` | Built-in; no external package required | PASS |
| `package_manager` | `npm` | `package-lock.json` present | PASS |

---

## Check 11: Visual Verification — N/A

No UI files (`*.tsx`, `*.jsx`, `*.vue`, `*.css`, `components/**`, `pages/**`) touched by this implementation. Check 11 not triggered.

---

## Check 12: Lifecycle Reconciliation — PASS

- **Issue alignment (12a):** All 8 task issues (issue-174 through issue-181) are `closed`. PASS
- **Epic completion (12b):** `epic-34` status is `closed`. PASS
- **Spec status (12c):** Spec is `implemented` — will be promoted to `validated` (see After Validation). PASS
- **Charter sync (12d):** SKIP — cross-cutting spec, no parent charter
- **Plan checkboxes (12e):** All 42 acceptance criterion checkboxes in the plan are checked (`- [x]`). PASS

---

## Check 13: Success Heuristic Extraction — PASS

Heuristic extracted: `subagent-cost-routing-a7f3c291` (scope: `_global`, confidence: medium)

Pattern recorded: Cross-cutting cost-routing specs can be implemented as pure markdown SKILL.md edits plus a single inline JS change, with no new dependencies. Model tier selection separates cleanly into three independent concerns: derivation in `/adev:route` (exhaustive decision table), dispatch in `/adev:implement` (annotation read + override chain), and observation in `session-capture.sh` (validation regex + one-time advisory via cursor flag).

---

**Summary:** 13 checks run. 10 PASS, 0 FAIL, 3 SKIP (governance directory absent), 0 WARN.
Check 3 and Check 11 recorded as N/A (not applicable to cross-cutting spec / no UI files).
