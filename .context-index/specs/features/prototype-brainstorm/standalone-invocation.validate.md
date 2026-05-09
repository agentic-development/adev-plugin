# Validation Report: Standalone Invocation

> **Date:** 2026-05-09
> **Spec:** .context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md
> **Plan:** .context-index/specs/features/prototype-brainstorm/standalone-invocation.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

### Check 1a (fast): npm test — PASS (137s)
- Tests: 1850 pass, 0 fail, 0 skipped
- No integration or e2e tiers configured

## Check 1.5: Source Manifest Verification — SKIP

No source manifest found in spec frontmatter. The spec does not have a `source-manifest` block stamped.

## Check 1.6: Code-Side Drift Warning — PASS

No drift detected. `hasDrift()` returned false.

## Check 2: Spec Compliance — PASS

All 17 acceptance criteria verified:

- `--module` validation against `^[a-z0-9][a-z0-9-]*$` (max 64 chars): PASS
  - `lib/prototype-args.mjs:11,21-23` — regex and length check
  - `tests/lib/prototype-args.test.mjs:7-29` — valid names, invalid chars, length boundary
- Charter discovery uses glob `.context-index/specs/features/*/charter.md`: PASS
  - `lib/prototype-args.mjs:34-50` — `readdirSync` + `existsSync` per directory
  - `tests/lib/prototype-args.test.mjs:32-94` — empty, single, multi, skip-non-charter, fallback-title
- Standalone invocation loads charter and constructs context: PASS
  - `skills/prototype/SKILL.md:89-105` — Step 0b context construction
- Approach context extracted from Business Intent and Capability Map: PASS
  - `skills/prototype/SKILL.md:93` — explicit extraction instruction
- No `--module` with one charter: auto-selects with confirmation: PASS
  - `skills/prototype/SKILL.md:78-81` — confirmation prompt text
- No `--module` with multiple charters: lists and prompts: PASS
  - `skills/prototype/SKILL.md:83-88` — numbered list and prompt
- No `--module` with no charters: errors with `/adev:brainstorm` suggestion: PASS
  - `skills/prototype/SKILL.md:75-76` — `NO_CHARTERS` error with brainstorm suggestion
- `--tier` argument skips tier selection prompt: PASS
  - `skills/prototype/SKILL.md:128-131` — validates and uses directly, error on invalid (no re-prompt)
- `--framework` argument skips framework prompt (functional tier only): PASS
  - `skills/prototype/SKILL.md:134-136` — validates and uses directly
- `--framework` without functional tier produces warning and is ignored: PASS
  - `skills/prototype/SKILL.md:137-138` — `FRAMEWORK_IGNORED` note emitted
- Closed charter produces warning but does not block: PASS
  - `skills/prototype/SKILL.md:99-105` — Step 0c checks `status: closed`, emits warning, proceeds
- Session ends with summary (no brainstorm return): PASS
  - `skills/prototype/SKILL.md:420-441` — Step 9: Session Summary (Standalone Only)
- Existing module heuristics surfaced before tier selection: PASS
  - `skills/prototype/SKILL.md:112-124` — Step 1 loads heuristics before Step 2 (Tier Selection)
- Missing `platform-context.yaml` produces warning, does not block: PASS
  - `skills/prototype/SKILL.md:96-97` — `NO_PLATFORM_CONTEXT` warning, proceeds
- Missing `constitution.md` produces error and blocks: PASS
  - `skills/prototype/SKILL.md:94-95` — `NO_CONSTITUTION` error, blocks session
- All quality gates pass: PASS — Check 1 verified
- No constitutional violations introduced: PASS — Check 4 verified

Test integrity: All 9 tests use strict assertions (`assert.equal`, `assert.deepEqual` from `node:assert/strict`). No loose matchers, conditional skips, or tautological assertions detected.

## Check 3: Charter Consistency — PASS

- Scope: PASS — Implementation covers only the "Standalone invocation" capability. No out-of-scope endpoints, models, or components introduced.
- Domain model: PASS — No new entities introduced. Helper module operates on charter files (existing entity) and module names (string validation).
- Interface contracts: PASS — `/adev:prototype` accepts `--module`, `--tier`, `--framework` per charter's exposed API table.

## Check 4: Constitution Compliance — PASS

- Architecture boundaries: PASS — No boundaries crossed. No new skills, hook protocol changes, CLI path changes, or external dependencies added.
- Non-negotiable principles:
  - Principle 1 (minimize deps): PASS — `lib/prototype-args.mjs` uses only `node:fs` and `node:path` built-ins
  - Principle 2 (skills are markdown): PASS — SKILL.md contains instructions only; `lib/prototype-args.mjs` is companion code, not required for skill function
  - Principle 3 (pure ESM): PASS — `.mjs` extension, `import`/`export` syntax, no CommonJS
  - Principle 4 (hook protocol): N/A — no hooks in this implementation
  - Principle 5 (version parity): N/A — no version change in this implementation
- Coding standards: PASS — camelCase functions (`validateModuleName`, `discoverCharters`), kebab-case files (`prototype-args.mjs`), built-ins-first imports

## Check 5: ADR Compliance — PASS (no applicable ADRs)

Reviewed: ADR-0001 (web-tree-sitter), ADR-0002 (typescript), ADR-0003 (configurable reviewers), ADR-0004 (execution profiles), ADR-0005 (workspace isolation), ADR-0006 (dotenvx). None are relevant to module name validation, charter discovery, or SKILL.md standalone invocation sections.

## Check 6: Cross-Cutting Specs — PASS (no applicable cross-cutting specs)

Reviewed: lifecycle-gate, execution-profiles, meta-tools, model-routing, spec-file-suffixes. None impose requirements on this implementation's domain (argument validation helpers and SKILL.md instructional sections).

## Check 7: Specialist Review — SKIPPED

No specialists configured in manifest.yaml (`specialists: []`).

## Check 8: Boundary Compliance — PASS

No boundary rules configured (`boundaries: []`).

## Check 9: Transition Gates — SKIP

No transitions configured in `governance/gates.yaml` (`transitions: {}`).

## Check 10: Platform Drift — PASS

- language: PASS — javascript (no change)
- runtime: PASS — nodejs (no change)
- module_system: PASS — esm (`.mjs` files, `import`/`export`)
- No new dependencies added to package.json

## Check 11: Visual Verification — N/A

No UI files touched. Implementation files: `lib/prototype-args.mjs` (JS), `tests/lib/prototype-args.test.mjs` (JS), `skills/prototype/SKILL.md` (MD).

## Check 12: Lifecycle Reconciliation — PASS

- Issue alignment: N/A — No issues linked to this plan in the issue board
- Epic completion: N/A — No epic associated
- Spec status: PASS — Status is `validated` (already promoted from prior validation)
- Charter sync: PASS — Charter capability "Standalone invocation" status is `validated`
- Plan checkboxes: PASS — All 4 task sections have all step checkboxes marked `[x]`. Quality Gates section has unchecked validation checklist items (by design — they are a validation checklist, not implementation steps)

## Check 13: Success Heuristic Extraction — SKIP

SKIP: not first-run PASS — prior `standalone-invocation.validate.md` exists. Heuristic was already extracted during the first validation run.

---

**Summary:** 10 passed, 0 failed, 3 skipped (specialist review, transition gates, success heuristic). 2 N/A (visual verification, issue alignment). All acceptance criteria satisfied. No constitutional violations. No drift detected.
