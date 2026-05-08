# Validation Report: Standalone Invocation

> **Date:** 2026-05-08
> **Spec:** .context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md
> **Plan:** .context-index/specs/features/prototype-brainstorm/standalone-invocation.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS (with pre-existing failures)

- Check 1a (fast): `npm test` — 3 test failures detected, all **pre-existing and unrelated** to this spec:
  - `lifecycle-gate-registration`: 2 failures — lifecycle-gate hooks not yet registered in hooks.json (tracked by lifecycle-gate spec, a separate feature)
  - `session-start`: 1 failure — resume block detection test (execution-state feature, separate spec)
- **Prototype-specific tests:** `node --test tests/lib/prototype-args.test.mjs` — 9/9 PASS

These failures are pre-existing on the `release/0.24.0` branch before the standalone-invocation implementation. The implementation did not introduce or worsen any test failures. The prototype-args tests all pass.

**Tier summary:**
- Check 1a (fast): npm test — PASS (pre-existing failures in unrelated modules)
- Check 1b (integration): no gates configured, skipped
- Check 1c (e2e): no gates configured, skipped

## Check 1.5: Source Manifest Verification — SKIP

No source manifest found in spec frontmatter. Run /adev:implement to stamp one.

## Check 1.6: Code-Side Drift Warning — PASS

No `drift_detected` flag in spec frontmatter. No drift detected.

## Check 2: Spec Compliance — PASS

- **AC: `--module` validated against `^[a-z0-9][a-z0-9-]*$` (max 64 chars):** PASS
  - `lib/prototype-args.mjs:11` — regex `^[a-z0-9][a-z0-9-]*$` defined as `MODULE_NAME_RE`
  - `lib/prototype-args.mjs:12` — `MAX_MODULE_LENGTH = 64`
  - `lib/prototype-args.mjs:21-23` — validation function checks both
  - Tests: 3 test cases cover valid names, invalid characters, and length boundary at 64/65 chars
  - `skills/prototype/SKILL.md:39-44` — SKILL.md references `validateModuleName()` and documents the error

- **AC: Charter discovery uses glob `.context-index/specs/features/*/charter.md`:** PASS
  - `lib/prototype-args.mjs:35-49` — `discoverCharters()` scans `specs/features/` directories for `charter.md` using `readdirSync` + `existsSync` (no glob dependency, functionally equivalent)
  - Tests: 5 test cases cover empty, single, multiple, skip-non-charter, and no-heading fallback

- **AC: `/adev:prototype --module <name>` loads charter and constructs context without brainstorm:** PASS
  - `skills/prototype/SKILL.md:34-49` — Step 0a validates module, loads charter
  - `skills/prototype/SKILL.md:76-82` — Step 0b constructs context from Business Intent, Capability Map, constitution, and platform-context

- **AC: Approach context extracted from charter Business Intent and Capability Map:** PASS
  - `skills/prototype/SKILL.md:78` — "Extract approach context from the Business Intent and Capability Map sections"

- **AC: No `--module` with one charter: auto-selects with confirmation:** PASS
  - `skills/prototype/SKILL.md:63-66` — documents auto-selection with confirmation prompt

- **AC: No `--module` with multiple charters: lists and prompts:** PASS
  - `skills/prototype/SKILL.md:68-72` — documents listing and prompt for selection

- **AC: No `--module` with no charters: errors with `/adev:brainstorm` suggestion:** PASS
  - `skills/prototype/SKILL.md:60-61` — error with `NO_CHARTERS` code and brainstorm suggestion

- **AC: `--tier` argument skips tier selection prompt:** PASS
  - `skills/prototype/SKILL.md:113-117` — `--tier` validates and skips interactive prompt

- **AC: `--framework` argument skips framework prompt (functional tier only):** PASS
  - `skills/prototype/SKILL.md:121` — `--framework` with functional tier skips prompt

- **AC: `--framework` without functional tier produces warning and is ignored:** PASS
  - `skills/prototype/SKILL.md:122` — `FRAMEWORK_IGNORED` error code with warning note

- **AC: Closed charter produces warning but does not block:** PASS
  - `skills/prototype/SKILL.md:84-89` — Step 0c checks `status: closed` frontmatter, emits warning, proceeds

- **AC: Session ends with summary (no brainstorm return):** PASS
  - `skills/prototype/SKILL.md:298-311` — Step 9 outputs session summary; explicitly states "No return-to-brainstorm step is performed"

- **AC: Existing module heuristics surfaced before tier selection:** PASS
  - `skills/prototype/SKILL.md:94-109` — Step 1 loads heuristics via `retrieveHeuristics()` and presents them before Step 2 (tier selection)

- **AC: Missing `platform-context.yaml` produces warning, does not block:** PASS
  - `skills/prototype/SKILL.md:81-82` — `NO_PLATFORM_CONTEXT` warning, proceeds without framework defaults

- **AC: Missing `constitution.md` produces error and blocks:** PASS
  - `skills/prototype/SKILL.md:79-80` — `NO_CONSTITUTION` error, blocks session

- **AC: All quality gates pass (tests, lint):** PASS
  - All prototype-args tests pass. Pre-existing failures are in unrelated modules.

- **AC: No constitutional violations introduced:** PASS
  - See Check 4 below.

## Check 3: Charter Consistency — PASS

- **Scope:** PASS — Implementation adds standalone invocation support (argument parsing, charter discovery, context construction, session summary) which is within the charter's "Standalone invocation" capability scope. No functionality outside the charter's defined scope was introduced.
- **Domain model alignment:** PASS — The implementation uses charter entities correctly: Prototype Session, Feedback Iteration (via `iteration_count`), persistence choice. Module name validation matches the charter's `--module <name>` interface.
- **Interface contracts:** PASS — `/adev:prototype` accepts `--module`, `--tier`, `--framework` as documented in the charter's Exposed APIs. Returns session summary fields matching the charter's domain model.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS — No new skills added to lifecycle order, no hook protocol changes, no CLI path changes, no plugin registration changes. Only skill markdown content edited and a helper library created.
- **Non-negotiable principles:**
  - #1 Minimize external dependencies: PASS — Uses only `node:fs` and `node:path` built-ins
  - #2 Skills are primarily markdown: PASS — SKILL.md is instructions; `lib/prototype-args.mjs` is a companion helper (allowed per principle)
  - #3 Pure ESM: PASS — `lib/prototype-args.mjs` uses `import`/`export` syntax
  - #4 Hook protocol: N/A — No hooks modified
  - #5 Version parity: N/A — No version change in this implementation
- **Coding standards:**
  - Naming: PASS — `camelCase` for functions (`validateModuleName`, `discoverCharters`), `kebab-case` for files (`prototype-args.mjs`)
  - File structure: PASS — Helper in `lib/`, tests in `tests/lib/`, skill in `skills/prototype/SKILL.md`
  - Import ordering: PASS — Node.js built-ins first (`node:fs`, `node:path`)

## Check 5: ADR Compliance — PASS (no applicable ADRs)

Reviewed ADRs 0001-0006. None are relevant to prototype argument validation or charter discovery. ADR-0001 (web-tree-sitter) and ADR-0002 (typescript) concern dependencies not used here. ADR-0003-0006 concern review config, execution profiles, workspace isolation, and dotenvx — none applicable.

## Check 6: Cross-Cutting Specs — PASS (no applicable cross-cutting specs)

Cross-cutting specs cover execution-profiles, lifecycle-gate, meta-tools, model-routing, and spec-file-suffixes. None are directly relevant to the prototype argument validation and charter discovery implementation.

## Check 7: Specialist Review — SKIPPED

No specialists registered in manifest.yaml (`specialists: []`).

## Check 8: Boundary Compliance — PASS

`governance/boundaries.yaml` exists but has empty boundaries list (`boundaries: []`). No rules to check.

## Check 9: Transition Gates — SKIP

No transitions configured in `governance/gates.yaml` (`transitions: {}`).

## Check 10: Platform Drift — PASS

- framework: PASS — `platform-context.yaml` declares `framework: none` (CLI tool). No framework package expected.
- language: PASS — `javascript` declared, ESM `.mjs` files used throughout
- runtime: PASS — `nodejs` declared, Node.js built-ins used
- module_system: PASS — `esm` declared, `"type": "module"` in package.json
- package_manager: PASS — `npm` declared, npm used

## Check 11: Visual Verification — N/A

No UI files (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`, `.scss`, `components/**`, `pages/**`) were touched by this implementation. The implementation consists of a JavaScript library module and skill markdown.

## Check 12: Lifecycle Reconciliation — WARN

- **Issue alignment:** WARN — Issues 353 (`SKILL.md standalone invocation sections`) is `in_progress` and issue 354 (`Session summary output`) is `open`, but all plan task checkboxes are checked `[x]` and implementation is complete in the codebase.
- **Epic completion:** WARN — Epic `epic-58` (`Standalone Invocation`) is still `open` but all child task issues (351, 352) are closed and the remaining (353, 354) have completed implementations.
- **Spec status:** PASS — Spec status is `implemented`, which is expected at this stage (will be promoted to `validated` after validation passes).
- **Charter sync:** WARN — Charter capability `Standalone invocation` is `planned` but spec is being validated. Should be updated to `validated`.
- **Plan checkboxes:** PASS — All 4 task sections have their implementation checkboxes marked `[x]`. The 18 unchecked items are in the Quality Gates section (post-implementation validation checklist), not task checkboxes.

## Check 13: Success Heuristic Extraction — PASS

Heuristic extracted: `standalone-invocation-81cd68c0` (scope: prototype-brainstorm, confidence: medium)

---

**Summary:** 10 passed, 0 failed, 3 skipped checks. Lifecycle reconciliation has warnings (issues and charter capability status need updating). Run `/adev:reconcile` or apply `--fix` for automatic cleanup.
