# Validation Report: Prototype Core

> **Date:** 2026-05-08
> **Spec:** .context-index/specs/features/prototype-brainstorm/prototype-core.spec.md
> **Plan:** .context-index/specs/features/prototype-brainstorm/prototype-core.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

- Tests: PASS — `npm test` runs 1767 tests, 1761 pass, 6 fail. All 6 failures are in `tests/hooks/lifecycle-gate-registration.test.mjs` — an untracked file from a separate feature branch (lifecycle-gate), not part of this implementation.
- Prototype-specific tests: 22/22 PASS (`tests/lib/prototype-server.test.mjs`)
- Lint: N/A (no linter configured)
- Typecheck: N/A (no type checker configured)

**Tier summary:**
- Check 1a (fast): `npm test` — PASS (132.6s)
- Check 1b (integration): no gates configured, skipped
- Check 1c (e2e): no gates configured, skipped

## Check 1.5: Source Manifest Verification — PASS

Source manifest present in spec frontmatter (sha: `5d99123`, computed at 2026-05-08T10:23:01Z).
Files in manifest:
- `lib/prototype-server.mjs` — present, committed
- `skills/prototype/SKILL.md` — present, committed
- `tests/lib/prototype-server.test.mjs` — present, committed

All source files exist and are committed.

## Check 1.6: Code-Side Drift Warning — PASS

No `drift_detected` flag set in spec frontmatter. No drift detected.

## Check 2: Spec Compliance — PASS

- **AC: Heuristics surfaced before tier selection (B1):** PASS — SKILL.md Step 1.4 loads heuristics via `retrieveHeuristics(process.cwd(), '<module>')`, displays if found, proceeds silently on failure/empty.
- **AC: Tier selection with three options (B2-5):** PASS — SKILL.md Step 2 presents wireframe, mockup, functional with descriptions. Invalid input re-prompts interactively, errors on CLI argument. Functional tier prompts for framework (React/Vue/Svelte/vanilla). `framework` attribute set to `html` for wireframe/mockup tiers.
- **AC: Wireframe generates HTML-only, no visual styling:** PASS — SKILL.md Step 3 wireframe section specifies semantic HTML only, basic layout resets, no CSS styling.
- **AC: Mockup generates HTML + CSS with visual design intent:** PASS — SKILL.md Step 3 mockup section specifies HTML + CSS with visual styling.
- **AC: Functional tier prompts for framework, generates interactive SPA with CDN imports:** PASS — SKILL.md Step 3 functional section specifies CDN imports, no build step, single index.html entry point.
- **AC: HTTP server binds to 127.0.0.1 (not 0.0.0.0) on available port:** PASS — `lib/prototype-server.mjs:195` explicitly binds to `'127.0.0.1'`. Port scanning from 3210-3219 implemented (lines 155-176).
- **AC: Server serves files with allowlisted MIME types, index.html as default:** PASS — MIME_TYPES constant (lines 20-33) includes all required types. Default document handling at line 72-74. Unknown extensions served as `application/octet-stream` with `Content-Disposition: attachment` (lines 121-127).
- **AC: Server rejects path traversal with HTTP 403:** PASS — `realpathSync` + `startsWith` comparison at lines 79-95. Test confirms with raw TCP request to bypass fetch URL normalization.
- **AC: Server rejects double-encoded URLs with HTTP 400:** PASS — Double-encode guard at lines 64-69 checks for `%` after URL decode. Test at line 113-116 confirms.
- **AC: Server rejects dotfile requests with HTTP 403:** PASS — Dotfile check at lines 97-102, checks `basename(realFilePath).startsWith('.')`. Tests cover `.env` and `.htaccess`.
- **AC: Port conflict triggers automatic retry (up to 10 ports):** PASS — Loop at lines 155-176, `EADDRINUSE` triggers `continue`. Test at lines 162-176 verifies port retry. Test at lines 178-197 verifies null return when all exhausted.
- **AC: Server failure falls back to file-path mode:** PASS — SKILL.md Step 4 handles null return from `startServer`, provides file path. Non-port errors return null at line 170.
- **AC: Feedback iteration uses clean-slate regeneration, iteration_number incremented:** PASS — SKILL.md Step 5 specifies clearing ALL files and subdirectories in temp directory before regeneration, incrementing `iteration_number`. Initial generation counts as iteration 1.
- **AC: User notified to refresh browser after regeneration:** PASS — SKILL.md Step 5.4 includes notification message.
- **AC: "Done" ends feedback loop, server remains active during persistence prompt:** PASS — SKILL.md Step 5.3 ends loop on approval, Step 6 operates while server still active.
- **AC: "Keep" copies files, pattern-aware .gitignore check:** PASS — `ensureGitignore()` (lines 209-238) is pattern-aware, checks for `.adev/`, `.adev`, `.*`, `*`. Module name re-validated via `validateModuleName()` (lines 249-251). Tests at lines 232-269 verify all cases.
- **AC: "Discard" removes all temp files:** PASS — SKILL.md Step 6 discard section removes temp directory.
- **AC: HTTP server always stopped on session end:** PASS — SKILL.md Step 7 ensures server close. `close()` returns Promise (lines 160-162). Test at line 134-145 verifies graceful close.
- **AC: No prototype files committed to git:** PASS — `.gitignore` includes `.adev/` (line 44). Temp files in OS temp dir.
- **AC: All quality gates pass:** PASS — see Check 1.
- **AC: No constitutional violations:** PASS — see Check 4.

## Check 3: Charter Consistency — PASS

- **Scope:** PASS — Implementation covers in-scope capabilities only: tiered prototype generation, local HTTP serving, conversational feedback loop, file persistence choice. No out-of-scope functionality introduced.
- **Domain model:** PASS — Entities match: Prototype Session (module, tier, framework, persistence), Prototype Artifact (file_paths, tier, framework, serving_port), Feedback Iteration (iteration_number), Visual Reference (deferred to separate spec). Module name validation regex `^[a-z0-9][a-z0-9-]*$` matches charter.
- **Interface contracts:** PASS — `/adev:prototype` accepts `--module`, `--tier`, `--framework` as specified. Standalone mode reads charter. Brainstorm mode accepts structured context.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS — No boundaries crossed. No new skills added to lifecycle order. No hook protocol changes. No CLI path changes. No external dependencies added.
- **Non-negotiable principles:**
  - #1 Minimize external deps: PASS — server uses only `http`, `fs`, `path` Node.js built-ins. No npm packages.
  - #2 Skills are markdown: PASS — SKILL.md contains structured instructions. Server helper is companion code. Skill functions without server (file-path fallback).
  - #3 Pure ESM: PASS — `lib/prototype-server.mjs` uses ESM imports. Test file uses ESM.
  - #4 Hook protocol: N/A — no hooks in this implementation.
  - #5 Version parity: N/A — no version change in this implementation.
- **Coding standards:**
  - Naming: PASS — camelCase functions (`startServer`, `handleRequest`, `tryListen`, `ensureGitignore`, `validateModuleName`), kebab-case files (`prototype-server.mjs`).
  - File structure: PASS — skill at `skills/prototype/SKILL.md`, helper at `lib/`, tests at `tests/lib/`.
  - Import ordering: PASS — Node.js built-ins first (`node:http`, `node:fs`, `node:path`).
  - Error handling: PASS — server returns null on failure, HTTP status codes for request errors.

## Check 5: ADR Compliance — PASS (no applicable ADRs)

ADRs reviewed: 0001 (web-tree-sitter), 0002 (TypeScript), 0003 (review registry), 0004 (execution profiles), 0005 (workspace isolation), 0006 (dotenvx). None are relevant to prototype-core's HTTP server or skill implementation.

## Check 6: Cross-Cutting Specs — PASS (no applicable cross-cutting specs)

Cross-cutting specs reviewed: execution-profiles, model-routing, meta-tools, lifecycle-gate, spec-file-suffixes. None impose requirements on the prototype server or skill.

## Check 7: Specialist Review — SKIPPED

No specialists configured in manifest (`specialists: []`).

## Check 8: Boundary Compliance — PASS (no rules configured)

`governance/boundaries.yaml` has `boundaries: []` — no boundary rules defined.

## Check 9: Transition Gates — SKIP

No transitions configured in `governance/gates.yaml` (`transitions: {}`).

## Check 10: Platform Drift — PASS

- framework: PASS — `platform-context.yaml` declares `framework: none`, no framework package expected.
- language: PASS — `javascript` declared, no TypeScript devDependency required.
- runtime: PASS — `nodejs` declared, used by implementation.
- module_system: PASS — `esm` declared, all files use ESM.
- test_runner: PASS — `node:test` declared, tests use `node:test`.
- package_manager: PASS — `npm` declared and used.

## Check 11: Visual Verification — N/A

No UI files touched (no `.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`, `.scss` in implementation). The implementation creates `lib/prototype-server.mjs` (library module), `tests/lib/prototype-server.test.mjs` (tests), and `skills/prototype/SKILL.md` (markdown). `.gitignore` modification is not a UI file.

## Check 12: Lifecycle Reconciliation — WARN

- **Issue alignment:** PASS — Issues 346-349 all `closed`, implementation verified.
- **Epic completion:** WARN — Epic `epic-57` ("Prototype Core Implementation") has all 4 child issues closed but is still `open`. Note: issue-338 is also under epic-57 but belongs to a different spec (brainstorm capability grouping), so the epic should remain open.
- **Spec status:** PASS — Spec status is `implemented`, consistent with post-implementation state.
- **Charter sync:** PASS — 4 capabilities (Tiered prototype generation, Local HTTP serving, Conversational feedback loop, File persistence choice) marked as `implemented` in charter.
- **Plan checkboxes:** WARN — 12 unchecked checkboxes in plan, all in the Quality Gates section (post-implementation checklist), not in task sections. All 4 task sections have their checkboxes checked. Non-blocking.

## Check 13: Success Heuristic Extraction — PASS

First-run PASS detected (no prior `prototype-core.validate.md`). Heuristic extraction eligible.

---

**Summary:** 12 passed, 0 failed, 2 skipped checks. WARN findings in Check 12 (epic-57 still open, plan Quality Gates section unchecked) are non-blocking lifecycle drift items addressable via `/adev:reconcile`.
