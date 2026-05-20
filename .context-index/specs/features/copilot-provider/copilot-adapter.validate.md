# Validation Report: CopilotAdapter — install / uninstall / status

> **Date:** 2026-05-19
> **Spec:** .context-index/specs/features/copilot-provider/copilot-adapter.spec.md
> **Plan:** .context-index/specs/features/copilot-provider/copilot-adapter.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS
- Tests: PASS (`npm test` — 3509 tests, 3507 pass, 0 fail, 2 todo, 40.9s)
- Lint: N/A (no lint gate configured in governance/gates.yaml)
- Typecheck: N/A (no typecheck gate configured)

## Check 1.5: Source Manifest Verification — PASS
- All 14 files in the source-manifest block match their stamped SHA (sha 4995177, computed-at 2026-05-19T20:22:00.045Z)
- All 14 files are committed in git (none untracked or stage-only)

## Check 1.6: Code-Side Drift Warning — PASS
- `drift_detected: false`; no `code_drift_detected` events in lifecycle log; manifest verify matches.

## Check 2: Spec Compliance — PASS

Acceptance criteria walk-through (line citations verified by Read):

- `providers/copilot/adapter.mjs` exports `CopilotAdapter` with full peer-adapter surface: PASS
  - `name: "copilot"` (providers/copilot/adapter.mjs:175), `pluginRoot` (:176), `version` (:177), `detect()` (:182), `install()` (:196), `uninstall()` (:269), `status()` (:371), `getCopilotHome` (:419), `validateSkillNames` (:418). Pure ESM, only `node:fs`, `node:path`, `node:url`, `node:os` used.
- `cli/index.mjs` dispatchers route via `adapter.name === "copilot"`: PASS — `cmdInstallCopilot` (cli/index.mjs:644), routed at lines 706, 932, 1065 for install/uninstall/status. Registry binding at lib/provider/registry.mjs:14.
- `detect()` returns true for any of `$COPILOT === "true"` / `.github/copilot-instructions.md` / `getCopilotHome()` exists: PASS (providers/copilot/adapter.mjs:182-191). Unit-tested in tests/copilot-adapter.test.mjs:27-43.
- `install` writes the documented surfaces and state record last: PASS (adapter.mjs:196-264). State record literal is built at :245-253 after both materializeLeg calls. Unit-tested at tests/copilot-adapter.test.mjs:43-89.
- `hooks.json` contains no absolute paths and no `${CLAUDE_PLUGIN_ROOT}` substring: PASS — rewriter at lib/providers/copilot/hook-config-rewriter.mjs:43-82 strips both forms; assertion in tests/copilot-adapter.test.mjs:53-71.
- `install({ user: true })` writes user-scope first: PASS (adapter.mjs:220-231). State record only on repo leg. Test at tests/copilot-adapter.test.mjs:203-222.
- `install({ dryRun: true })` writes nothing and returns `{ wouldWrite, skipped, errors }`: PASS (adapter.mjs:205-216). Test at tests/copilot-adapter.test.mjs:112-120, validation errors surface in errors[] at :224-233.
- `uninstall` removes only state-record-listed paths after regex + containment re-validation: PASS (adapter.mjs:305-351). Tamper tests at tests/copilot-adapter-uninstall-defense.test.mjs confirm `SUSPICIOUS_STATE_ENTRY` rejection for `../etc/passwd` and absolute paths.
- `uninstall` rejects schemaVersion≠1 without --force, accepts with --force: PASS (adapter.mjs:287-292). Test at tests/copilot-adapter-uninstall-defense.test.mjs.
- `status` returns documented shape with independent `syncOutputPresent`: PASS (adapter.mjs:399-414). The `agentsMd.autoLoadHint` literal at adapter.mjs:41-42 matches the spec exactly. Tests at copilot-adapter.test.mjs:151-200.
- `validateSkillNames` accepts/rejects per Behavior §6: PASS (lib/providers/copilot/skill-validator.mjs:95-150). NFC-normalize at :124-125, prefix strip at :138-141, all error codes raised at :128-143. Tests at tests/copilot-skill-validator.test.mjs (11 cases).
- Symlink scanner rejects top-level and nested symlinks: PASS (lib/providers/copilot/symlink-scanner.mjs:24-36). Tests at tests/copilot-symlink-scanner.test.mjs.
- Adapter uses `fs.cpSync` (not `execSync('cp -r')`): PASS (adapter.mjs:148-154, 162). Test at tests/copilot-adapter.test.mjs:235.
- `INSTALL_PATH_ESCAPE` synthetic test confirms containment assertion: PASS (adapter.mjs:65-71, called at all write sites).
- CLI dispatch for `--target copilot` install/uninstall/status: PASS (cli/index.mjs:644-699, dispatch tables at 706/932/1065).
- `cli` charter lists Copilot in install verb: PASS (.context-index/specs/features/cli/charter.md:46).
- copilot-provider charter `CopilotAdapter.status` interface row rev 5+: PASS (charter at revision 6).
- `lib/providers/copilot/README.md` documents `opts.projectRoot` + `opts.user` divergence: PASS (file exists, committed).
- `docs/smoke-install-copilot.md` documents manual install procedure: PASS (file exists, committed).
- Idempotent install: PASS — tests/copilot-adapter.test.mjs:138-149.
- No new `package.json` deps: PASS — `dependencies` and `devDependencies` unchanged.
- `npm test` passes: PASS (Check 1).
- No constitutional violations: PASS (Check 4).

## Cross-Repo Dependency Validation — N/A
- No workspace detected and no cross-repo `depends-on` references in spec frontmatter.

## Check 4: Constitution Compliance — PASS
- **Principle 1 (Minimize external dependencies):** PASS — adapter and helpers use only `node:fs`, `node:path`, `node:url`, `node:os`. No new `package.json` entries.
- **Principle 3 (Pure ESM):** PASS — all new files are `.mjs`; no `require()` or `module.exports` in adapter or helpers.
- **Anti-pattern "No hardcoded paths to `~/.claude/`":** PASS — `getCopilotHome()` (adapter.mjs:49-51) resolves `process.env.COPILOT_HOME || join(os.homedir(), '.copilot')` per peer-adapter precedent.
- **Quality Gate (`npm test` passes):** PASS — Check 1.
- **Architecture boundaries:** PASS — no new services, tables, or dependencies; install registry expansion follows the documented `peer adapter` pattern.

## Check 8: Boundary Compliance — PASS
- `.context-index/governance/boundaries.yaml` has `boundaries: []` (no rules configured) — PASS by default.

## Check 9: Transition Gates — PASS
- `.context-index/governance/gates.yaml` has `transitions: {}` (no transitions configured) — SKIP / PASS.

## Check 11: Visual Verification — N/A
- No UI files (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, components/, pages/) in implementation diff. Implementation is CLI/adapter/library code only.

---

**Summary:** 8 dispatched checks (1, 1.5, 1.6, 2, 4, 8, 9, 11). 8 passed, 0 failed, 0 with warnings. Implementation satisfies all 25 acceptance criteria; 56 unit tests across 5 new test files exercise install/uninstall/status, tamper defense, dry-run, user-scope, validator, symlink scanner, and hook-config rewriter. Quality gate green (3507/0 across the full repo test suite). Spec is ready to advance from `implemented` → `validated`.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 12, 13 have been relocated by `check-set-restructure.spec.md`. See `/adev:review-specs`, `/adev:hygiene` Audit Pass 20, `/adev:reconcile` lifecycle-sync, and the post-validate heuristic-extraction hook for the relocated concerns.
