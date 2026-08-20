---
spec: .context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md
plan: .context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.plan.md
date: 2026-08-19
overall-status: PASS_WITH_NOTES
rigor-tier: full
---

# Validation Report: Live Spec: ADEV-DEBUG Completion Token and --auto Mode

> **Date:** 2026-08-19
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md
> **Plan:** .context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.plan.md
> **Rigor Tier:** full (resolved from risk_level: medium → policies.medium.validate_mode: full)
> **Overall Status:** PASS_WITH_NOTES

---

## Check 1: Quality Gates — PASS_WITH_NOTES

**Check 1a (fast tier):**
- `test` (npm test): PASS — 7181 pass, 0 fail, 2 todo, 0 skipped (67.9s)
- `quality-gate` (npm test): PASS — same command, same result

**Check 1b (integration tier, severity: warning):**
- `integration-test` (npm run test:evals): WARN — 381 pass, 12 fail, 393 total (18.8s). Severity is `warning` per `governance/gates.yaml`, so this does not block. Failures are pre-existing/environmental, unrelated to this spec's 5-file scope (skills/debug/SKILL.md, skills/using-adev/SKILL.md, docs/skill-reference.md, templates/manifest-template.yaml, tests/skills/debug-completion-and-auto.test.mjs):
  - `tests/orders.integration.test.mjs` and `tests/evals/integration-sandbox/build-without-db.test.mjs` fail with `ERR_MODULE_NOT_FOUND: Cannot find package 'pg'` — a missing optional dependency in this sandbox, not a code defect.
  - `tests/evals/integration-sandbox/reality-check.test.mjs` (3 tests) fail on confidence/evidence detection — unrelated to debug/using-adev SKILL.md changes.

**Check 1c (e2e tier):** No gates configured — skipped.

**Gate outcomes attested:** `test: pass`, `quality-gate: pass`, `integration-test: fail` (severity warning, non-blocking) — recorded against manifest sha `ca77e93`.

[Quality gates did not fail at error severity — proceeding to Checks 2+ per protocol.]

## Check 1.5: Source Manifest Verification — PASS

- `adev source-manifest verify` → PASS — source manifest matches (sha: ca77e93).
- Git-tracked check: all 5 manifest files verified committed — `docs/skill-reference.md` and `skills/debug/SKILL.md` (923d4197), `skills/using-adev/SKILL.md` and `tests/skills/debug-completion-and-auto.test.mjs` (e69f3bdd), `templates/manifest-template.yaml` (d26dcd93). Working tree is clean for all 5 files (no uncommitted drift).

## Check 1.6: Code-Side Drift Warning — PASS

- `adev verify spec --check-drift` → `{"drifted":false,"drift_source":null,"drift_at":null}`. No drift detected.

## Check 14: Gate Executability and Test Collection — PASS_WITH_NOTES

- `adev gate doctor --json` → 0 errors, 4 warnings:
  - `runner-unknown` (×3: test, quality-gate, integration-test) — `npm test` / `npm run test:evals` wrap a runner the doctor doesn't statically identify; collection was not independently verified.
  - `ci-gate-not-invoked` (integration-test) — `npm run test:evals` does not appear in `.github/workflows/{ci,propagate-to-next,release}.yml`.
- No error-severity findings. Registry severity for this check is `warning`, so it does not affect the aggregate verdict.

## Check 2: Spec Compliance — PASS_WITH_NOTES

Dispatched to a subagent per protocol; every citation below was drawn from a Read/grep in that session.

- FIXED/PARKED/UNREPRODUCIBLE token emitted correctly per terminal state, matching pinned grammar: **PASS** — `skills/debug/SKILL.md:384-386` lists all three tokens tied to their exact terminal conditions, matching `^ADEV-[A-Z]+: [A-Z_]+$`. Tested at `tests/skills/debug-completion-and-auto.test.mjs:50-61,63-74`.
- Token is literal last line, plain text, exactly once: **PASS** — `skills/debug/SKILL.md:382,388` ("the final line... emit it exactly once, as plain text... no trailing prose after it").
- `--auto` skips interactive ADR prompt without silently drafting: **PASS** — `skills/debug/SKILL.md:351-356` (skip prompt, compute insight note via `adev verify format-note`, explicit "Do not call `update()` here"). Tested at lines 21-43.
- `--auto` bounds reproduction attempts to `reproduction_attempt_limit` (default 3), terminates UNREPRODUCIBLE: **PASS** — `skills/debug/SKILL.md:64` (Phase 1 step 2a) and `templates/manifest-template.yaml:254-261`. Tested at lines 63-80.
- Token is persona-exempt, verified across Product/Architect: **PARTIAL** — `skills/using-adev/SKILL.md:142` names `ADEV-DEBUG` in the exemption bullet generically, but no test independently asserts persona-specific behavior beyond string presence (`tests/skills/debug-completion-and-auto.test.mjs:133-141` only checks the bullet mentions `ADEV-DEBUG`). Consistent with the pre-existing BUILD/VALIDATE pattern, but the AC's literal "verified across Product and Architect personas" wording is not independently demonstrated by a dedicated test.
- No investigation target under `--auto` exits with `NO_INVESTIGATION_TARGET`: **PASS** — `skills/debug/SKILL.md:66` (Phase 1 step 2b). Tested at lines 63-80.
- `PARKED` outcomes write `FAILING-CHECKS:` block into issue notes in the same write, readable via `IssueManager.get(id).notes`: **PASS** — `skills/debug/SKILL.md:374-376`. Tested at lines 87-115.
- Phase 1.6 claim uses `ADEV_ISSUE_OWNER` when set, falls back to `"${USER}/local"` unchanged when unset: **PASS** — `skills/debug/SKILL.md:163,168,180` (owner resolved once, reused in both claim and release). Tested at lines 117-131.
- All quality gates pass (`npm test`): **PASS** — confirmed independently by this orchestrator's own Check 1 run (7181/7181).
- No constitutional violations introduced: **PASS** — no new inline-Node; new CLI-verb calls (`adev verify format-note`) only. Cross-confirmed by Check 4 below.

### Scope Expansion Sub-Finding — PASS_WITH_NOTES

`source-manifest.files` (the declared scope) lists 5 exact file paths. The implementation's 7 commits (`fbc19f28`..`183178db`) also touched 6 files outside that exact list:
- `providers/codex/skills/debug/SKILL.md`, `providers/opencode/skills/debug/SKILL.md` (provider mirrors of skills/debug/SKILL.md)
- `providers/codex/skills/using-adev/SKILL.md`, `providers/opencode/skills/using-adev/SKILL.md` (provider mirrors of skills/using-adev/SKILL.md)
- `.context-index/specs/features/autonomous-bugfix-loop/charter.md` (Capability Map status stamp)
- `.context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md` (self-stamped status/source-manifest)

Severity: warning (does not fail Check 2). These are legitimate companions to the declared scope — provider-mirror sync and standard lifecycle bookkeeping (self-stamping, capability-map update) — not unrelated feature creep. Recommend either updating `source-manifest.files` to include the provider mirrors, or documenting that mirror-sync and self-stamping commits are implicitly in scope.

### Test integrity — no anti-patterns found

All 9 tests in `tests/skills/debug-completion-and-auto.test.mjs` assert on deterministic literal strings/regex against skill prose, contain no conditional skips or try/catch-wrapped assertions, and all pass (9/9 independently).

## Check 4: Constitution Compliance — PASS

Dispatched to a subagent per protocol; every finding cites a `git diff`/`grep` result from that session.

- **Architecture boundaries: PASS** — `git diff --name-only fbc19f28~1 183178db` confirms the full 11-file change set touches only skill markdown, docs, templates, tests, provider mirrors, and spec/charter docs. No `package.json`, `.claude-plugin/plugin.json`, `hooks/hooks.json`, or `cli/index.mjs` appears in any of the 7 commits. Falls entirely under "Editing skill markdown content" / "Updating templates" / "Adding tests" (Autonomous, per CLAUDE.md's Architecture Boundaries table).
- **Non-negotiable principles: PASS** — no new dependency (`package.json` untouched); all substantive changes are `.md` prose; the new test file (`tests/skills/debug-completion-and-auto.test.mjs`) uses `import`/`export` only (pure ESM); no `hooks/` file touched; no version-bearing manifest touched.
- **Coding standards / anti-patterns: PASS** — `grep -n "node -e\|node --input-type=module\|Run inline Node"` and `grep -n "require(\|module.exports"` and `grep -n "~/.claude"` against `skills/debug/SKILL.md` and `skills/using-adev/SKILL.md` all returned no matches. New content uses CLI-verb form (`adev issues claim/release`, `adev verify format-note`) exclusively — no H3 section mixes inline-Node and `adev <verb>`. **Commit trailers verified independently by this orchestrator**: all 7 commits (`fbc19f28`, `ad14bec4`, `d26dcd93`, `b5fb3084`, `923d4197`, `e69f3bdd`, `183178db`) carry `Spec: .context-index/specs/features/autonomous-bugfix-loop/debug-completion-and-auto.spec.md`, plus `Plan-task: N` on the first 6.

## Check 8: Boundary Compliance — PASS

- `adev boundaries check --json` → verdict `PASS`, reason "no boundary violations in 266 changed file(s) against 3 rule(s)".
- 0 findings, 0 warnings, 0 infos across 266 files checked.
- 1 rule disabled: `no-manual-version-bump` — reason: "the boundary evaluator matches file content, not diffs; a version field is not a version bump, so this rule would fire on package.json forever. Needs a diff-aware evaluator." (governance-level, unrelated to this spec's changes.)

## Check 9: Transition Gates — PASS

- Transition: `implement-to-validate`
- `test`: pass — reason `recorded-pass`, `command_attested: true` (confirms the gate outcome this run just attested in Check 1 was correctly recorded and read back).

## Check 11: Visual Verification — N/A (SKIP)

No UI files in the implementation diff (all 5 declared-scope files are `.md`/`.yaml`/`.mjs`, none match `*.tsx`/`*.jsx`/`*.vue`/`*.svelte`/`*.css`/`*.scss`/`*.html`/`components/`/`pages/`/`views/`/`public/`/`app/**/page.*`/`app/**/layout.*`). Trigger-guard Case A/D — SKIP, "No UI files in implementation diff — visual verification not applicable."

---

**Summary:** 9 dispatched checks — 6 PASS, 3 PASS_WITH_NOTES, 0 FAIL, 0 unresolved. No blocking issues. Two non-blocking notes worth operator attention: (1) the integration-tier gate (`npm run test:evals`) has 12 pre-existing/environmental failures unrelated to this spec's scope (missing `pg` package, reality-check evidence detection) and is not wired into CI; (2) provider-mirror files and lifecycle-bookkeeping docs touched by the implementation commits are not listed in the spec's `source-manifest.files`.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11 (when no UI files), 12, and 13 have been relocated by `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting compliance (formerly Check 6), specialist review (formerly Check 7), and charter consistency (formerly Check 3, now covered by Check 2's scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction (formerly Check 13 / `check-12-heuristic-extraction`), now a non-blocking Stop-event hook.
