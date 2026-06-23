# Validation Report: `adev skill-ext load` — Skill Extension Verb

> **Date:** 2026-05-25
> **Spec:** .context-index/specs/features/cli/skill-ext-load.spec.md
> **Plan:** .context-index/specs/features/cli/skill-ext-load.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

**Sub-check 1a: Fast Tier**

- Tests (`npm test`): PASS — 4139 tests pass, 0 failures, 2 todo. Duration: ~210s.
- Lint: Not configured (commented out in gates.yaml).
- Typecheck: Not configured (commented out in gates.yaml).

No error-severity gate failures. Proceeding to Checks 1.5+.

**Tier Summary:**
- Check 1a (fast): `npm test` — PASS (210s)
- Check 1b (integration): no gates configured — SKIPPED
- Check 1c (e2e): no gates configured — SKIPPED

## Check 1.5: Source Manifest Verification — PASS

`adev source-manifest verify` output: `Check 1.5: PASS — source manifest matches (sha: 85ab95c)`

All 6 source manifest files verified on disk and committed to git:
- `.gitignore` — committed: `88d5a479`
- `cli/index.mjs` — committed: `0862d94f`
- `lib/cli/skill-ext.mjs` — committed: `33d883e7`
- `skills/implement/SKILL.md` — committed: `cec60c97`
- `templates/skill-extensions/.gitkeep` — committed: `88d5a479`
- `tests/cli/skill-ext.test.mjs` — committed: `04c89b85`

## Check 1.6: Code-Side Drift — PASS

`adev verify spec --check-drift` output: `{"drifted":false,"drift_source":null,"drift_at":null}`

No drift detected. Spec is in sync with implementation.

## Check 2: Spec Compliance — PASS

All 13 acceptance criteria verified by reading actual source files.

### Acceptance Criteria Verification

- **AC-1** `adev skill-ext load --skill implement` with only project-level file → file content on stdout, exit 0.
  - PASS. `lib/cli/skill-ext.mjs:163-169` reads `<extBase>/<skillName>.md`, appends to chunks if non-empty, outputs joined content. Test at `tests/cli/skill-ext.test.mjs:169-182` asserts `r.status === 0` and `r.stdout === "# Project extensions\nAlways use TDD."` (strict equality).

- **AC-2** With only `_web-dev/implement.md` extension layer → layer content on stdout, exit 0.
  - PASS. `lib/cli/skill-ext.mjs:139-160` scans `_` prefixed directories in lex order, reads per-skill file. Test at `tests/cli/skill-ext.test.mjs:186-200` asserts strict equality of stdout.

- **AC-3** Both `_web-dev/implement.md` and project-level `implement.md` → layer first, blank line, project content, exit 0.
  - PASS. `lib/cli/skill-ext.mjs:175-177`: `chunks.join("\n\n")`. Test at `tests/cli/skill-ext.test.mjs:204-222` asserts `r.stdout === "extension content\n\nproject content"` (strict).

- **AC-4** Multiple extension layers (`_aaa/`, `_zzz/`) → lexicographic order (aaa first), exit 0.
  - PASS. `lib/cli/skill-ext.mjs:141`: `.sort()` applied to underscore-prefixed entries. Test at `tests/cli/skill-ext.test.mjs:226-245` sets up `_zzz` before `_aaa` in filesystem, verifies `"aaa content\n\nzzz content"`.

- **AC-5** No files in any layer → exactly `__NONE__` on stdout, exit 0.
  - PASS. `lib/cli/skill-ext.mjs:172-173`: `if (chunks.length === 0) process.stdout.write("__NONE__")`. Test at `tests/cli/skill-ext.test.mjs:139-148`: `assert.strictEqual(r.stdout, "__NONE__")`.

- **AC-6** All present files are empty → exactly `__NONE__` on stdout, exit 0.
  - PASS. `lib/cli/skill-ext.mjs:121`: empty file `(content.length > 0 ? content : null)` returns `null`, not added to chunks. Test at `tests/cli/skill-ext.test.mjs:150-165` writes empty strings for both layers, asserts `__NONE__`.

- **AC-7** `--skill ../etc/passwd` → stderr contains `INVALID_SKILL_NAME`, exit 1, no file access.
  - PASS. `lib/cli/skill-ext.mjs:75-78`: `SKILL_NAME_RE = /^[a-zA-Z0-9_-]+$/` tested before any fs call; `process.stderr.write("INVALID_SKILL_NAME: ...")`, `process.exit(1)`. Tests at `tests/cli/skill-ext.test.mjs:93-102`, `104-113`, `115-124` cover `../etc/passwd`, `foo/bar`, `foo\bar`.

- **AC-8** `adev skill-ext load` (no `--skill`) → stderr contains usage, exit 1.
  - PASS. `lib/cli/skill-ext.mjs:69-72`: `if (!skillName) { process.stderr.write("MISSING_SKILL_ARG\n..."); process.exit(1); }`. Test at `tests/cli/skill-ext.test.mjs:82-91`: `assert.match(r.stderr, /MISSING_SKILL_ARG|--skill|usage/i)`.

- **AC-9** `--skill foo` when `.context-index/` does not exist → `NO_CONTEXT_INDEX`, exit 1.
  - PASS. `lib/cli/skill-ext.mjs:84-93`: when `extBase` doesn't exist, checks for `.context-index/`, writes `NO_CONTEXT_INDEX` to stderr. Test at `tests/cli/skill-ext.test.mjs:126-135`: temp dir without `.context-index/`, asserts `NO_CONTEXT_INDEX` and exit 1.

- **AC-10** `adev skill-ext load --help` → prints help text, exit 0.
  - PASS. `lib/cli/skill-ext.mjs:38-40`: `sub === "--help"` branch calls `help()`, exits 0. Also `parsed.values.help` path at line 63-65. Tests at `tests/cli/skill-ext.test.mjs:63-67` and `69-78`.

- **AC-11** No new `package.json` dependencies introduced.
  - PASS. `lib/cli/skill-ext.mjs:20-28` imports only `node:util`, `node:fs`, `node:path`. `git log` shows no `package.json` changes in implementation commits.

- **AC-12** All existing tests continue to pass.
  - PASS. 4139 tests pass, 0 failures.

- **AC-13** `/adev:implement` SKILL.md contains `adev skill-ext load --skill implement` call in Load Context step with prose instruction.
  - PASS. `skills/implement/SKILL.md:60`: `adev skill-ext load --skill implement`. Lines 57-69 contain the "Load Skill Extensions" sub-step with framing prose matching the spec requirement exactly: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."*

- **Bonus: `.gitignore` includes `.context-index/skill-extensions/_*/`**
  - PASS. `.gitignore:96`: `.context-index/skill-extensions/_*/`

### Test Quality Assessment

Tests use strict equality (`assert.strictEqual`) for stdout and exit code assertions. No loose matchers found. Conditional skips only on platform-level symlink creation failures (justified). No dynamic data assertions.

## Cross-Repo Dependency Validation — N/A

No workspace detected. No cross-repo `depends-on` references in spec frontmatter. Advisory: running repo-scoped, cross-repo validation skipped.

## Check 4: Constitution Compliance — PASS

- **Principle 1 (Minimize external dependencies):** PASS. `lib/cli/skill-ext.mjs` uses only `node:util`, `node:fs`, `node:path` — all Node.js built-ins. No new packages. Verified `lib/cli/skill-ext.mjs:20-28`.
- **Principle 2 (Skills are primarily markdown):** PASS. Extension files are plain markdown read by the verb. No code executes from extension content. The verb reads and echoes. `skills/implement/SKILL.md` updated with `adev skill-ext load` call (not inline Node). Verified `skills/implement/SKILL.md:58-69`.
- **Principle 3 (Pure ESM):** PASS. `lib/cli/skill-ext.mjs` uses `import` syntax with `node:` prefix, `.mjs` extension. No `require`. Verified `lib/cli/skill-ext.mjs:1,20-28`.
- **Principle 4 (Hook protocol compliance):** PASS. CLI uses `process.exit(0)` for success, `process.exit(1)` for errors. Exit 0 for `__NONE__` (non-blocking degradation). Verified `lib/cli/skill-ext.mjs:92,178`.
- **Architecture boundaries:** PASS. No new skills added to lifecycle order. No hook protocol changes. No CLI installation path modifications. No plugin registration format changes. No external dependencies added. Adding CLI lib file is an autonomous decision per constitution.
- **Coding standards:** PASS. camelCase functions (`safeRead`, `run`, `help`), kebab-case file (`skill-ext.mjs`), CLI logic in `lib/cli/`, imports are built-in first, then relative. `process.exit(1)` for fatal errors.
- **Anti-patterns:** PASS. No CommonJS. No inline-Node patterns in `skills/implement/SKILL.md` (only `adev skill-ext load` bash call). No hardcoded `~/.claude/` paths.
- **Commit trailers:** PASS. Main commit `33d883e7` has `Spec: .context-index/specs/features/cli/skill-ext-load.spec.md`, `Plan-task: 1`, `Author-type`, `Operator` trailers.

## Check 8: Boundary Compliance — PASS

`governance/boundaries.yaml` exists with `boundaries: []` (no rules configured). No violations possible.

## Check 9: Transition Gates — SKIPPED

`governance/gates.yaml` has `transitions: {}` — no transition gates configured. No required gates to verify.

## Check 11: Visual Verification — SKIPPED

No UI files (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`, `.scss`, `.html`, `components/`, `pages/`) in the implementation diff. Visual verification not applicable for this spec.

---

**Summary:** 7 dispatched checks. All PASS or N/A. 0 failures. 4139/4139 tests passing. Spec compliance verified across all 13 acceptance criteria with strict file-and-line evidence.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, and 13 have been relocated by `check-set-restructure.spec.md`. See `/adev:review-specs` for ADR compliance and `/adev:hygiene` Audit Pass 20 for platform drift.
