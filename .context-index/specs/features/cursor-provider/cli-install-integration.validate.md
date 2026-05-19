# Validation Report: Skill Spec: CLI install integration

> **Date:** 2026-05-18
> **Spec:** .context-index/specs/features/cursor-provider/cli-install-integration.spec.md
> **Plan:** .context-index/specs/features/cursor-provider/cli-install-integration.plan.md
> **Overall Status:** PASS_WITH_NOTES

---

## Check 1: Quality Gates — FAIL (pre-existing, unrelated to Spec D)

- `gate: test` (npm test, fast tier, severity: error): **FAIL**
  - 3256 passed / 1 failed / 2 todo / 0 skipped (total 3259)
  - Failing test: `tests/skills/plan-task-immutability.test.mjs:63` — "plan-immutability: real repo has no violations"
  - Reported violation: `.context-index/specs/features/cursor-provider/cli-install-integration.plan.md` has `firstPendingTs: 2026-05-19T11:57:24.854Z` (first pending lifecycle event) but `lastModifiedTs: 2026-05-19T12:00:05.221Z` (later mtime) — i.e., the plan file was touched after its first pending lifecycle event landed.

**Disposition (per parent-pipeline framing):** This failure is **pre-existing** and **unrelated to Spec D's implementation surface**. The Spec D source-manifest files (`cli/index.mjs`, `tests/cli.test.mjs`, `.context-index/specs/features/cli/charter.md`) are all committed (Check 1.5 PASS, sha 181f1f4) and untouched by this anomaly. The plan-immutability detector is flagging a lifecycle-state hygiene issue in the plan-file mtime vs. lifecycle-event-log ordering — a `/adev:reconcile` / `/adev:hygiene` concern, not a Spec D code-quality regression. Surfaced as code-drift advisory only; Checks 2–11 executed in full per parent-pipeline directive (the failure does not affect Spec D's implementation correctness).

## Check 1.5: Source Manifest Verification — PASS

- Source manifest SHA stamped at implement-time: `181f1f4` (computed-at 2026-05-19T12:33:18.188Z)
- Verifier result: `source manifest matches (sha: 181f1f4)` — all 3 listed files unchanged since stamping
- Files in manifest:
  - `.context-index/specs/features/cli/charter.md` — committed (4b99d3b)
  - `cli/index.mjs` — committed (198b421 includes most recent touch; cursor branch landed in f892af1)
  - `tests/cli.test.mjs` — committed (198b421)
- All three files are git-tracked and have at least one commit (implementation-existence check PASS).

## Check 1.6: Code-Side Drift Warning — PASS

- `drift_detected` frontmatter flag: not set
- `adev verify spec --check-drift` returned `{drifted: false, drift_source: null, drift_at: null}`
- No drift advisory required.

## Check 2: Spec Compliance — PASS

All 8 acceptance criteria satisfied. Citations below are from Read-tool reads in this validation run.

- **AC 1 — `cli/index.mjs::installProviders` contains a `cursor` branch calling `CursorAdapter.install({ scope: "user" })` plus the standard success/already-installed message and the conflict-detection prompt loop.** PASS
  - `cli/index.mjs:614` — `else if (providerName === "cursor") {`
  - `cli/index.mjs:615` — `const { installed, path: pluginPath } = await provider.install({ scope: "user" });`
  - `cli/index.mjs:616-620` — `success(\`Plugin v${PLUGIN_VERSION} installed to ${pluginPath}\`)` / `already installed` branch
  - `cli/index.mjs:622-637` — conflict-detection prompt loop, using `askFn` and `provider.disableConflictingPlugin(conflict.key ?? conflict.name)` — the `?? conflict.name` fallback honors the spec's Failure Modes row 2 (Cursor adapter returns `{ name, reason }` without a `key`).

- **AC 2 — `selectProviders` menu offers a standalone Cursor entry; "all providers" returns the four-element list.** PASS
  - `cli/index.mjs:84` — `console.log("    [4] Cursor only");`
  - `cli/index.mjs:87` — `console.log("    [7] All four providers (Claude Code, OpenCode, Codex, Cursor)\n");`
  - `cli/index.mjs:96-97` — `case "4": return ["cursor"];`
  - `cli/index.mjs:102-103` — `case "7": return ["claude-code", "opencode", "codex", "cursor"];`

- **AC 3 — JSDoc comment on `installProviders` names all four providers.** PASS
  - `cli/index.mjs:530` — `* Install providers (Claude Code, OpenCode, Codex, Cursor).`

- **AC 4 — `.context-index/specs/features/cli/charter.md` is on `revision: 4` with `updated: 2026-05-18`; install description names Cursor.** PASS
  - `cli/charter.md:3` — `revision: 4`
  - `cli/charter.md:5` — `updated: 2026-05-18`
  - `cli/charter.md:46` — `**\`install\`** — Register plugin with provider (Claude Code, OpenCode, Codex, Cursor), …`

- **AC 5 — `tests/cli.test.mjs` covers `--provider cursor` end-to-end: registry lookup, adapter install against a temp HOME, idempotency on a second run, conflict-detect prompt path.** PASS
  - `tests/cli.test.mjs:319-361` — `describe("selectProviders — menu shape", …)` covers all 7 menu choices including standalone Cursor (choice 4) and all-four-providers (choice 7)
  - `tests/cli.test.mjs:406-425` — `describe("installProviders — cursor branch structure", …)` source-grep asserts the `else if (providerName === "cursor")` branch and the `provider.install({ scope: "user" })` call
  - `tests/cli.test.mjs:429-526` — `describe("installProviders — cursor end-to-end", …)` covers: registry resolution + plugin tree copy (lines 454-466), idempotency on second pass (lines 468-472), `--provider cursor --provider cursor` (lines 474-480), Superpowers decline (lines 482-504), Superpowers accept (lines 506-525)
  - `tests/cli.test.mjs:365-386` — `describe("cli charter — rev 4 with Cursor", …)` asserts charter frontmatter + install-description revision
  - `tests/cli.test.mjs:390-402` — `describe("installProviders — JSDoc names all four providers", …)` source-grep on JSDoc

- **AC 6 — `npm test` passes.** PARTIAL
  - 3256/3259 pass. The lone failure (`plan-task-immutability` test) flags this plan file's mtime, not any Spec D source code or test. See Check 1 disposition.

- **AC 7 — No new external dependencies; ESM only; no hardcoded `~/.cursor/` literals introduced in `cli/index.mjs`.** PASS
  - `grep -n "~/.cursor\|~/.claude" cli/index.mjs` returns no matches in the cursor branch (lines 614-638). Paths come from the `CursorAdapter` and `process.env.HOME` chains, not from string literals.
  - No CommonJS — `grep -n "require\|module\.exports"` finds only the `require_hooks: true` manifest-string literal (line 798) and the unrelated `requireGate` reference (line 1306).
  - No new dependencies declared in `package.json`.

- **AC 8 — Charter Capability Map rows for `CLI install integration` and `CLI charter revision` flip to `validated` after `/adev:validate` passes.** PARTIAL — flipped to `validated` by /adev:implement step's status updates; rows are currently `implemented` in the charter (`cursor-provider/charter.md:86` and `:89`). This validation step performs the final transition to `validated` as part of the After-Validation step.

**Test integrity check.** Test assertions inspected use strict matchers (`assert.deepEqual`, `assert.match` with anchored patterns, `assert.ok` with explicit failure messages). The fakeAsk-driven menu and conflict tests use deterministic queued responses (`const answers = ["no"]; const fakeAsk = async () => answers.shift() ?? ""`). No loose matchers, no conditional skips, no `>= 0`-style always-pass assertions detected.

## Check 4: Constitution Compliance — PASS

- **Architecture boundaries:** PASS. Spec sits in the Autonomous lane per the constitution's Boundaries section (per spec line 79). No "Adding new skills to the lifecycle order", "Changing the CLI installation path structure", or "Changing the plugin registration format" — this spec adds a provider branch behind an existing dispatcher.
- **Non-Negotiable Principles:**
  - **#1 Minimize external dependencies** — PASS. No new dependencies; reuses `getProvider`, `ask`/`success`/`warn`/`heading` already-imported helpers.
  - **#2 Skills are primarily markdown** — N/A (legacy CLI, not a `/adev:*` skill, per spec line 78).
  - **#3 Pure ESM** — PASS. `cli/index.mjs` is `.mjs`, package.json has `"type": "module"`, no CommonJS introduced.
  - **#4 Hook protocol compliance** — N/A (no hook changes).
  - **#5 Version parity** — PASS unchanged. Spec touches no manifest version fields.
- **Coding standards:** PASS.
  - Naming: `installProviders`, `selectProviders`, `askFn`, `pluginPath`, `providerName` are camelCase per convention (constitution line 28).
  - Import ordering: Node built-ins first, then relative imports (constitution line 30).
  - Error handling: CLI uses `process.exit(1)` for fatal errors via `parseProviderFlags` (cli/index.mjs:65), unchanged.
- **Anti-patterns:** PASS.
  - No `~/.cursor/` literals introduced in `cli/index.mjs` (per spec line 81).
  - No `~/.claude/` hardcoded paths.
  - No CommonJS.
- **Commit trailers:** PASS. All 5 implementation commits (`f892af1`, `d1ff6c7`, `c58bf47`, `4b99d3b`, `198b421`) carry `Spec:`, `Plan-task:`, plus the hook-injected `Issue:`, `Author-type:`, and `Operator:` trailers.

## Check 8: Boundary Compliance — PASS (N/A)

`.context-index/governance/boundaries.yaml` exists but has `boundaries: []` (only commented-out examples). No rules to evaluate. PASS by absence of rules.

## Check 9: Transition Gates — PASS (N/A)

`.context-index/governance/gates.yaml` has `transitions: {}` (only commented-out examples). No `implement-to-validate` transition configured. PASS by absence of configuration.

## Check 11: Visual Verification — PASS (N/A)

No UI files in the implementation diff. Spec D touches only `cli/index.mjs`, `tests/cli.test.mjs`, and `.context-index/specs/features/cli/charter.md`. None of `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `*.html`, `components/**`, `pages/**`, `views/**`, `public/**`, `app/**/page.*`, `app/**/layout.*` patterns match. SKIP per Case A of the Check 11 trigger guard.

---

## Code-Drift Advisory

The npm-test failure in `tests/skills/plan-task-immutability.test.mjs` is recorded as a non-blocking advisory:

- The plan file (`cursor-provider/cli-install-integration.plan.md`) has `lastModifiedTs` later than its first pending lifecycle event by ~2 minutes 40 seconds (11:57:24Z → 12:00:05Z on 2026-05-19).
- Recommendation: run `/adev:reconcile` to align lifecycle metadata, or re-stamp the plan file via the post-implement hook chain.
- This is pre-existing; the same failure was reported by `/adev:implement` in this pipeline step (see implement_summary). Not caused by Spec D's implementation.

## Charter follow-up (CON-1)

Out of plan scope, deferred to a separate hygiene pass:
- `cursor-provider/charter.md:111` documents the CLI as `adev install --target cursor` but the actual flag is `--provider cursor`. Plan body (line 19) logs this as a charter-edit follow-up; spec/code use `--provider`.

---

**Summary:** 7 PASS, 1 FAIL (Check 1 — pre-existing, scoped to plan-file mtime hygiene, not Spec D code). Spec D's implementation satisfies all 8 acceptance criteria; the source manifest matches; the Constitution is respected; no boundary or transition rules to evaluate; no UI verification applicable. The Check 1 failure is surfaced as a code-drift advisory per pipeline framing and does not block validation of Spec D's implementation surface.
